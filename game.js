/* 愛心接接樂 — Bisancos 七夕遊戲
 *
 * 左右滑動移動籃子，接住掉下來的愛心／玫瑰／禮物，避開炸彈與破碎愛心。
 * 沒接到的東西不扣分，只有「接到障礙」才扣，所以玩家可以主動閃避。
 */
(function () {
  'use strict';

  const GAME_ID = 'heart-catch';
  const DURATION = 60;

  // 掉落物。weight 是開局的抽中權重，weightEnd 是結尾（60 秒時）的權重，
  // 兩者間逐秒線性內插——好東西權重降、壞東西權重升，後期不只更快更密，
  // 抽到炸彈／破碎愛心的機率也明顯提高，逼玩家看清楚再接，不能無腦亂接。
  // 不用加起來等於 100，只看相對比例。
  const TYPES = [
    { key: 'heart',  emoji: '💗', score: 10,  weight: 38, weightEnd: 26, good: true,  r: 21 },
    { key: 'rose',   emoji: '🌹', score: 20,  weight: 18, weightEnd: 12, good: true,  r: 21 },
    { key: 'gift',   emoji: '🎁', score: 30,  weight: 10, weightEnd: 10, good: true,  r: 22 },
    { key: 'broken', emoji: '💔', score: -10, weight: 16, weightEnd: 24, good: false, r: 21 },
    { key: 'bomb',   emoji: '💣', score: -20, weight: 18, weightEnd: 28, good: false, r: 21 },
  ];

  function currentWeight(t) {
    const p = clamp(elapsed / DURATION, 0, 1);
    return t.weight + (t.weightEnd - t.weight) * p;
  }

  const TOP_Y = 96;             // 掉落起點，讓開 HUD
  const BASKET_W = 78;
  const BASKET_H = 46;
  const BASKET_BOTTOM = 92;     // 籃子底部距畫面底，避開 iPhone home indicator

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const el = (id) => document.getElementById(id);
  const ui = {
    menu: el('menu'), over: el('over'), name: el('name'),
    start: el('start'), again: el('again'), mute: el('mute'),
    score: el('score'), caught: el('caught'), time: el('time'),
    finalScore: el('final-score'), finalDetail: el('final-detail'), board: el('board'),
  };

  let W = 0, H = 0;
  let state = 'menu';
  let score = 0, caught = 0, missHit = 0, elapsed = 0, timeLeft = DURATION;
  let basket, items, pops, sparks;
  let spawnTimer = 0, lastT = 0;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const basketY = () => H - BASKET_BOTTOM - BASKET_H;

  // ── 畫布尺寸 ─────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (basket) basket.x = clamp(basket.x, BASKET_W / 2, W - BASKET_W / 2);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ── 音樂／音效（shared/audio.js 提供的共用引擎） ──
  // 背景音樂是正式配樂檔（assets/bgm.mp3），音效沒有對應的檔案，
  // 維持用 WebAudio 合成短音符（叮咚聲、過場旋律）。
  const N = { D4: 293.66, G3: 196.00, G4: 392.00, A4: 440.00,
    B4: 493.88, D5: 587.33, E5: 659.25, G5: 783.99 };
  const MUSIC_URL = 'assets/bgm.mp3';

  function sfx(notes) { QIXI_AUDIO.sfx(notes); }

  // ── 遊戲流程 ─────────────────────────────────
  function reset() {
    score = 0; caught = 0; missHit = 0;
    elapsed = 0; timeLeft = DURATION; spawnTimer = 0;
    basket = { x: W / 2, targetX: W / 2, tilt: 0, bump: 0 };
    items = []; pops = []; sparks = [];
    ui.score.textContent = '0';
    ui.caught.textContent = '0';
    ui.time.textContent = String(DURATION);
  }

  function startGame() {
    const name = (ui.name.value || '').trim();
    if (name) QIXI_LB.setName(name);
    resize();
    reset();
    ui.menu.classList.add('hidden');
    ui.over.classList.add('hidden');
    state = 'playing';
    lastT = performance.now();
    QIXI_AUDIO.unlock();
    sfx([{ freq: N.G4, dur: 0.1 }, { freq: N.B4, dur: 0.1, at: 0.08 }, { freq: N.D5, dur: 0.16, at: 0.16 }]);
    QIXI_AUDIO.startMusic(MUSIC_URL);
    requestAnimationFrame(loop);
  }

  async function endGame() {
    if (state === 'over') return;
    state = 'over';
    QIXI_AUDIO.stopMusic(0.4);
    sfx([{ freq: N.D5, dur: 0.14 }, { freq: N.B4, dur: 0.16, at: 0.1 }, { freq: N.G4, dur: 0.3, at: 0.2 }]);
    const name = QIXI_LB.getName() || '匿名';
    ui.finalScore.textContent = score;
    ui.finalDetail.textContent = `接住 ${caught} 個　誤接 ${missHit} 個`;
    ui.over.classList.remove('hidden');

    await QIXI_LB.submitScore(GAME_ID, {
      name,
      score,
      detail: `接住${caught}／誤接${missHit}`,
      date: new Date().toISOString().slice(0, 10),
    });
    QIXI_LB.render(ui.board, GAME_ID, name);
  }

  // ── 輸入：左右滑動 ───────────────────────────
  let pointerDown = false;

  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    return clamp(e.clientX - rect.left, 0, W);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointerDown = true;
    basket.targetX = pointerX(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'playing' || !pointerDown) return;
    e.preventDefault();
    basket.targetX = pointerX(e);
  });
  const release = () => { pointerDown = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // iOS Safari 光靠 touch-action 擋不掉整頁被拖動，遊戲進行中直接吃掉 touchmove
  document.addEventListener('touchmove', (e) => {
    if (state === 'playing') e.preventDefault();
  }, { passive: false });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'Enter' && state !== 'playing') startGame();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // ── 生成 ─────────────────────────────────────
  function pickType() {
    const sum = TYPES.reduce((s, t) => s + currentWeight(t), 0);
    let r = Math.random() * sum;
    for (const t of TYPES) { r -= currentWeight(t); if (r <= 0) return t; }
    return TYPES[0];
  }

  function spawn() {
    const t = pickType();
    items.push({
      type: t,
      x: rand(t.r + 12, W - t.r - 12),
      y: TOP_Y - t.r,
      // 掉快一點、停留時間短，畫面才不會愈堆愈亂
      vy: rand(150, 230) * (1 + elapsed / DURATION * 0.6),
      spin: rand(-1, 1),
      rot: 0,
    });
  }

  // ── 更新 ─────────────────────────────────────
  function update(dt) {
    elapsed += dt;
    timeLeft = Math.max(0, DURATION - elapsed);
    ui.time.textContent = Math.ceil(timeLeft);

    if (keys['ArrowLeft']) basket.targetX -= 420 * dt;
    if (keys['ArrowRight']) basket.targetX += 420 * dt;
    basket.targetX = clamp(basket.targetX, BASKET_W / 2, W - BASKET_W / 2);
    const prevX = basket.x;
    basket.x += (basket.targetX - basket.x) * Math.min(1, dt * 16);
    // 移動時籃子稍微傾斜，看起來有慣性
    basket.tilt += ((basket.x - prevX) * 0.02 - basket.tilt) * Math.min(1, dt * 10);
    if (basket.bump > 0) basket.bump = Math.max(0, basket.bump - dt * 4);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawn();
      spawnTimer = rand(0.38, 0.62) * (1 - elapsed / DURATION * 0.4);
    }

    const by = basketY();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * dt;
      it.rot += it.spin * dt;

      // 接住判定：物品底緣進入籃口那一段高度，且水平在籃子範圍內
      const inMouth = it.y + it.type.r >= by && it.y <= by + BASKET_H * 0.7;
      if (inMouth && Math.abs(it.x - basket.x) < BASKET_W / 2 + it.type.r * 0.35) {
        collect(it);
        items.splice(i, 1);
        continue;
      }
      if (it.y - it.type.r > H) items.splice(i, 1);
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.y -= 46 * dt; p.life -= dt;
      if (p.life <= 0) pops.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 380 * dt; s.life -= dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    if (timeLeft <= 0) endGame();
  }

  function collect(it) {
    const type = it.type;
    if (type.good) {
      caught++;
      const base = 760 + Math.min(caught, 15) * 22;
      sfx([{ freq: base, dur: 0.07 }, { freq: base * 1.22, dur: 0.09, at: 0.05 }]);
    } else {
      missHit++;
      sfx([{ freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.05 }, { freq: 140, dur: 0.18, type: 'sawtooth', vol: 0.045, at: 0.07 }]);
    }
    score = Math.max(0, score + type.score);
    basket.bump = 1;
    ui.score.textContent = score;
    ui.caught.textContent = caught;

    pops.push({
      x: it.x, y: basketY() - 10, life: 0.8,
      text: (type.score > 0 ? '+' : '') + type.score,
      color: type.score > 0 ? '#e14b7f' : '#5b6cff',
    });
    const n = type.good ? 10 : 8;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      sparks.push({
        x: it.x, y: basketY(),
        vx: Math.cos(ang) * rand(40, 180),
        vy: Math.sin(ang) * rand(40, 180) - 80,
        life: rand(0.35, 0.7),
        color: type.good ? '#ff6b9d' : '#7a8bff',
        size: rand(3, 6),
      });
    }
  }

  // ── 繪製 ─────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot * 0.25);
      ctx.font = `${it.type.r * 2}px serif`;
      ctx.fillText(it.type.emoji, 0, 0);
      ctx.restore();
    }

    drawBasket();

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life * 1.6);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of pops) {
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // 背景漂浮的裝飾愛心，跟遊戲邏輯無關，純氣氛
  const deco = Array.from({ length: 8 }, () => ({
    x: Math.random(), y: Math.random(), s: rand(8, 20), sp: rand(0.008, 0.03),
  }));
  function drawBackground() {
    for (const d of deco) {
      d.y -= d.sp * 0.016;
      if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `${d.s}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🤍', d.x * W, d.y * H);
    }
    ctx.globalAlpha = 1;
  }

  function drawBasket() {
    const y = basketY();
    const squash = 1 + basket.bump * 0.12;   // 接到東西時籃子壓一下
    ctx.save();
    ctx.translate(basket.x, y + BASKET_H / 2);
    ctx.rotate(clamp(basket.tilt, -0.22, 0.22));
    ctx.scale(squash, 2 - squash);

    const halfTop = BASKET_W / 2;
    const halfBot = BASKET_W / 2 - 11;
    const top = -BASKET_H / 2;
    const bot = BASKET_H / 2;

    // 籃身（上寬下窄的梯形）
    ctx.beginPath();
    ctx.moveTo(-halfTop, top);
    ctx.lineTo(halfTop, top);
    ctx.lineTo(halfBot, bot);
    ctx.lineTo(-halfBot, bot);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#f0b276');
    g.addColorStop(1, '#c9834a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#a8703c';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 編織紋
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,70,30,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const yy = top + (BASKET_H / 4) * i;
      ctx.moveTo(-halfTop, yy);
      ctx.lineTo(halfTop, yy);
    }
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 16, top);
      ctx.lineTo(i * 14, bot);
    }
    ctx.stroke();
    ctx.restore();

    // 籃口
    ctx.fillStyle = '#ffe0c0';
    roundRect(-halfTop - 3, top - 7, BASKET_W + 6, 12, 6);
    ctx.fill();
    ctx.strokeStyle = '#a8703c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 籃身正面的愛心
    ctx.fillStyle = '#ff6b9d';
    heartPath(0, 4, 22, 20);
    ctx.fill();

    ctx.restore();
  }

  function heartPath(x, y, w, h) {
    const top = y - h * 0.42;
    const curve = h * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, top + curve);
    ctx.bezierCurveTo(x, top, x - w / 2, top, x - w / 2, top + curve);
    ctx.bezierCurveTo(x - w / 2, top + (h + curve) / 2, x, top + (h + curve) / 2, x, top + h);
    ctx.bezierCurveTo(x, top + (h + curve) / 2, x + w / 2, top + (h + curve) / 2, x + w / 2, top + curve);
    ctx.bezierCurveTo(x + w / 2, top, x, top, x, top + curve);
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── 主迴圈 ───────────────────────────────────
  function loop(now) {
    if (state !== 'playing') { draw(); return; }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ── 啟動 ─────────────────────────────────────
  function refreshMuteIcon() { ui.mute.textContent = QIXI_AUDIO.isMuted() ? '🔇' : '🔊'; }
  ui.mute.addEventListener('click', () => {
    QIXI_AUDIO.unlock();
    QIXI_AUDIO.toggleMuted();
    refreshMuteIcon();
  });
  refreshMuteIcon();

  ui.start.addEventListener('click', startGame);
  ui.again.addEventListener('click', () => {
    ui.over.classList.add('hidden');
    startGame();
  });
  ui.name.value = QIXI_LB.getName();
  resize();
  reset();
  draw();
})();
