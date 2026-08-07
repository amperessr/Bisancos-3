/* Bisancos 七夕遊戲 — 共用設定
 *
 * ⚠️ 這個檔案在 Bisancos-1／2／3 三個 repo 各有一份，內容必須完全一致。
 *    改動時三份一起改，不要只改一個。
 *
 * 排行榜要能運作，只需要填下面這一個網址（Firebase 專案：bisancos）。
 * 取得方式見 FIREBASE_SETUP.md。留空的話遊戲照常可以玩，
 * 只是排行榜區塊會顯示「排行榜尚未設定」。
 */
window.QIXI_CONFIG = {
  // Firebase 專案 bisancos 的 Realtime Database（預設執行個體，us-central1）
  FIREBASE_DB_URL: 'https://bisancos-default-rtdb.firebaseio.com',

  // 這個名字的分數不會上傳排行榜（測試用）
  TEST_ACCOUNT: '系統測試員',
};
