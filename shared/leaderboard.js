/* 排行榜 — Firebase Realtime Database REST API
 *
 * 刻意不載入 Firebase SDK：RTDB 的 REST 介面用原生 fetch 就能讀寫，
 * 少一支外部 script，手機載入快、離線也不會卡住整頁。
 *
 * 資料結構（每個玩家固定一筆最高分，避免同一人洗版把別人擠出榜）：
 *   /<gameId>/best/<玩家名> = { name, score, detail, date }
 */
(function () {
  'use strict';

  const CFG = window.QIXI_CONFIG || {};

  function dbUrl() {
    return (CFG.FIREBASE_DB_URL || '').replace(/\/$/, '');
  }

  // Firebase 的 key 不接受 . # $ [ ] / 這些字元。
  // 長度上限維持 20，配合 Firebase 安全性規則（FIREBASE_SETUP.md）裡
  // name 欄位既有的 validate 規則不用動——兩邊要一起改，改這裡卻沒
  // 同步改主控台的規則，超過舊上限的名字送出去會被規則擋掉、寫入失敗。
  // 輸入框本身沒有字數限制，只有存進資料庫這一步才會裁切，
  // 所以打字時不會感覺到上限。
  const NAME_MAX = 20;
  function safeKey(name) {
    return String(name || '匿名').replace(/[.#$[\]/]/g, '_').slice(0, NAME_MAX);
  }

  /** 上傳分數；只有比自己既有最高分高才會覆蓋。回傳是否真的寫入。 */
  async function submitScore(gameId, entry) {
    if (!dbUrl()) return false;
    if (entry.name === CFG.TEST_ACCOUNT) return false; // 測試帳號不進榜

    const cleanEntry = { ...entry, name: String(entry.name || '匿名').slice(0, NAME_MAX) };
    const url = `${dbUrl()}/${gameId}/best/${encodeURIComponent(safeKey(cleanEntry.name))}.json`;
    try {
      const current = await fetch(url).then((r) => r.json());
      if (current && (current.score || 0) >= cleanEntry.score) return false;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanEntry),
      });
      // fetch 對 4xx/5xx 不會 reject，一定要自己檢查 ok，
      // 否則 Firebase 規則擋下寫入時，這裡還是會回傳「成功」
      if (!res.ok) {
        console.warn('[排行榜] 上傳被拒絕（HTTP ' + res.status + '），可能是安全性規則不允許');
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[排行榜] 上傳失敗：', err.message);
      return false;
    }
  }

  const TOP_N = 5;

  /** 取全部排序後的名次。資料量小（每人一筆），直接抓回來本地排序，不用建 index。 */
  async function fetchAll(gameId) {
    if (!dbUrl()) return null;
    try {
      const data = await fetch(`${dbUrl()}/${gameId}/best.json`).then((r) => r.json());
      if (!data) return [];
      return Object.values(data)
        .filter((e) => e && typeof e.score === 'number')
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn('[排行榜] 讀取失敗：', err.message);
      return null;
    }
  }

  /** 取前 N 名（預設 5）。 */
  async function fetchTop(gameId, limit) {
    const all = await fetchAll(gameId);
    return all === null ? null : all.slice(0, limit || TOP_N);
  }

  /** 把排行榜畫進指定容器；玩家沒進前 5 名時，額外補一列顯示自己的名次。 */
  async function render(container, gameId, myName) {
    container.innerHTML = '<div class="board-msg">排行榜載入中…</div>';
    if (!dbUrl()) {
      container.innerHTML = '<div class="board-msg">排行榜尚未設定</div>';
      return;
    }
    const all = await fetchAll(gameId);
    if (all === null) {
      container.innerHTML = '<div class="board-msg">排行榜連線失敗</div>';
      return;
    }
    if (!all.length) {
      container.innerHTML =
        '<div class="board-head">🏆 排行榜 TOP 5</div>' +
        '<div class="board-msg">還沒有人上榜，快來當第一名！</div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const row = (entry, rank, isMe) =>
      `<div class="board-row${isMe ? ' me' : ''}">` +
      `<span class="rank">${medals[rank - 1] || rank}</span>` +
      `<span class="who">${escapeHtml(entry.name)}</span>` +
      `<span class="pts">${entry.score}</span>` +
      `</div>`;

    let html = '<div class="board-head">🏆 排行榜 TOP 5</div>';
    html += all.slice(0, TOP_N).map((e, i) => row(e, i + 1, e.name === myName)).join('');

    const myIndex = all.findIndex((e) => e.name === myName);
    if (myIndex >= TOP_N) {
      html += '<div class="board-gap">⋯</div>' + row(all[myIndex], myIndex + 1, true);
    }
    container.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** 玩家名字記在本機，三款遊戲共用，不用每次重打。 */
  function getName() {
    try { return localStorage.getItem('qixi_player_name') || ''; } catch (e) { return ''; }
  }
  function setName(name) {
    try { localStorage.setItem('qixi_player_name', name); } catch (e) { /* 無痕模式忽略 */ }
  }

  window.QIXI_LB = { submitScore, fetchTop, fetchAll, render, getName, setName, TOP_N };
})();
