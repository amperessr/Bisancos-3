/* Bisancos 七夕遊戲 — 共用音訊引擎
 *
 * 背景音樂：播放各遊戲 assets/bgm.mp3 的正式配樂（來源：D:\遊戲檔案\素材）。
 * 音效：沒有對應的音效檔，維持用 WebAudio 程式合成短音符（叮咚聲、過場旋律等）。
 *
 * 音樂用 <audio> 元素播放，但透過 createMediaElementSource 接進 Web Audio
 * 的 GainNode 控制音量／淡出——不能只改 <audio>.volume 再用 requestAnimationFrame
 * 手動跑淡出動畫，因為 rAF 只在畫面有在合成（compositing）時才會觸發，分頁被
 * 切到背景或這個除錯用的 Browser 面板沒有顯示時就完全不會執行，音樂會卡住不停。
 * 交給 GainNode 的 linearRampToValueAtTime 排程後，淡出是在音訊執行緒上跑的，
 * 跟畫面渲染、分頁是否可見都無關。
 *
 * 三款遊戲共用這支引擎，各自的 BGM 網址／音效內容留在各自的 game.js 裡定義。
 */
(function () {
  'use strict';

  const MUTE_KEY = 'qixi_muted';
  const MUSIC_VOL = 0.55;

  let ac = null;
  let sfxGain = null;
  let musicGain = null;
  let muted = localStorage.getItem(MUTE_KEY) === '1';

  let musicEl = null;
  let musicUrl = null;
  let pauseTimer = null;

  function ensure() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = ac.createGain();
    sfxGain.gain.value = muted ? 0 : 1;
    sfxGain.connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = muted ? 0 : MUSIC_VOL;
    musicGain.connect(ac.destination);
  }

  /** 必須在使用者手勢（點擊／觸控）裡呼叫一次，iOS 不給在手勢之外開音訊。 */
  function unlock() {
    ensure();
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(freq, startAt, dur, type, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, startAt);
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(vol, startAt + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(startAt);
    o.stop(startAt + dur + 0.02);
  }

  /** 短音效：一串 {freq, dur, type, vol, at} 立刻播放，at 是相對現在的延遲秒數。 */
  function sfx(notes) {
    if (!ac) return;
    const now = ac.currentTime;
    for (const n of notes) {
      if (!n.freq) continue;
      tone(n.freq, now + (n.at || 0), n.dur, n.type || 'triangle', n.vol ?? 0.09);
    }
  }

  /** <audio> 元素只建立一次；音量交給 musicGain 控制，元素本身音量固定拉滿。
   *  createMediaElementSource 對同一個元素只能呼叫一次，所以要單例。 */
  function ensureMusicElement() {
    if (musicEl) return;
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicEl.volume = 1;
    const src = ac.createMediaElementSource(musicEl);
    src.connect(musicGain);
  }

  /** 背景音樂：url 是 mp3 檔路徑，自動循環播放。同一首已經在播就不重新起頭。 */
  function startMusic(url) {
    ensure();
    ensureMusicElement();
    clearTimeout(pauseTimer);
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setValueAtTime(muted ? 0 : MUSIC_VOL, ac.currentTime);
    if (musicUrl === url) {
      if (musicEl.paused) musicEl.play().catch(() => {});
      return;
    }
    musicUrl = url;
    musicEl.src = url;
    musicEl.currentTime = 0;
    musicEl.play().catch(() => { /* 使用者手勢外呼叫會被擋，正常情況不會發生 */ });
  }

  /** 停止背景音樂。fadeSec 內用 GainNode 淡出音量，淡完才真正暫停播放。 */
  function stopMusic(fadeSec) {
    if (!musicEl || !ac) return;
    const fade = fadeSec || 0.01;
    const t = ac.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (musicEl) musicEl.pause(); }, fade * 1000 + 30);
  }

  function setMuted(v) {
    muted = v;
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    if (ac) {
      const t = ac.currentTime;
      sfxGain.gain.setValueAtTime(v ? 0 : 1, t);
      musicGain.gain.setValueAtTime(v ? 0 : MUSIC_VOL, t);
    }
  }
  function isMuted() { return muted; }
  function toggleMuted() { setMuted(!muted); return muted; }

  window.QIXI_AUDIO = { unlock, sfx, startMusic, stopMusic, isMuted, setMuted, toggleMuted };
})();
