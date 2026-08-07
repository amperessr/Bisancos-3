# Bisancos-3 · 愛心接接樂 🧺

Bisancos 七夕活動小遊戲（三款之一）。純前端靜態網頁，手機瀏覽器直接開就能玩。

**線上遊玩**：https://amperessr.github.io/Bisancos-3/

## 玩法

左右滑動移動下方的籃子，接住掉下來的東西，限時 60 秒。

| 掉落物 | 分數 |
|---|---|
| 💗 愛心 | +10 |
| 🌹 玫瑰 | +20 |
| 🎁 禮物 | +30 |
| 💔 破碎愛心 | -10 |
| 💣 炸彈 | -20 |

沒接到的東西**不扣分**，只有「接到障礙」才扣，所以可以主動閃避。
總分不會低於 0。掉落速度隨時間加快。

## 檔案結構

```
index.html          遊戲頁面（HUD ＋ 開始／結算覆蓋層）
game.js             遊戲邏輯與 canvas 繪製
shared/config.js    排行榜網址設定
shared/leaderboard.js
shared/common.css
```

`shared/` 三款遊戲共用，Bisancos-1／2／3 各有一份完全相同的副本。

## 排行榜

Firebase Realtime Database（專案 `bisancos`），三款遊戲寫在同一專案的不同節點，
資料互不相干。本遊戲用 `/heart-catch/best/<玩家名>`，每人固定一筆最高分，
新分數比較高才覆蓋。

## 本機測試

```bash
python -m http.server 8000
```

開 http://localhost:8000

## 發布

Settings → Pages → Source 選 `Deploy from a branch`，分支 `main` + `/ (root)`。
