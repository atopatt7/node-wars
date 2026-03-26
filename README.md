# Node Wars ｜ 節點征服

> 2D 即時策略網頁遊戲，Phaser 3 驅動，支援 iOS / Android / 桌面

---

## 🎮 玩法

| 動作 | 操作 |
|------|------|
| 選取己方建築 | 點擊或按住藍色節點 |
| 發兵 | 拖曳到目標節點後放開 |
| 切換送兵比例 | 右鍵（桌面）或點擊底部 25% / 50% / 75% / 100% 按鈕 |
| 暫停 | 右上角 ⏸ 按鈕 |

**目標**：佔領地圖上所有紅色（敵方）建築。

## 🏗️ 建築類型

| 建築 | 產兵速度 | 最大兵力 | 防禦倍率 |
|------|----------|----------|----------|
| 村莊 V | 1 / 秒 | 50 | ×1.0 |
| 城堡 C | 0.4 / 秒 | 100 | ×1.5 |
| 箭塔 T | 0.25 / 秒 | 30 | ×2.0 |

---

## 🚀 本地開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（預設 http://localhost:3000）
npm run dev

# 生產打包
npm run build

# 預覽打包結果
npm run preview
```

---

## 📦 推上 GitHub

```bash
# 1. 在 GitHub 建立新 repository（不要初始化 README）

# 2. 本地初始化
git init
git add .
git commit -m "feat: initial Node Wars MVP"

# 3. 連接遠端（替換為你的 repo URL）
git remote add origin https://github.com/YOUR_USERNAME/node-wars.git
git branch -M main
git push -u origin main
```

---

## ☁️ 部署到 Vercel

### 方法一：GitHub 自動部署（推薦）

1. 進入 [vercel.com](https://vercel.com) 並登入
2. 點擊 **Add New → Project**
3. 選擇你剛推上去的 GitHub repository
4. 設定保持預設（Vercel 自動偵測 Vite）
5. 點擊 **Deploy**

之後每次 `git push` 都會自動觸發部署。

### 方法二：Vercel CLI

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署（首次會詢問設定）
vercel --prod
```

---

## 📁 專案結構

```
src/
├── main.js              # Phaser 入口，遊戲設定
├── config.js            # 全域常數（數值、顏色、速度）
├── data/
│   └── levels.js        # 5 關卡設計資料
├── scenes/
│   ├── BootScene.js     # 開機載入
│   ├── MenuScene.js     # 主選單
│   ├── LevelSelectScene.js  # 關卡選擇
│   └── GameScene.js     # 核心戰鬥場景
├── entities/
│   ├── NodeBuilding.js  # 建築節點（生產、繪製、命中判定）
│   └── TroopGroup.js    # 移動部隊（移動、繪製）
├── systems/
│   ├── CombatSystem.js  # 戰鬥結算
│   └── AISystem.js      # 敵方 AI 決策
└── ui/                  # （預留擴充：法術面板、技能樹等）
```

---

## 🔮 未來擴充方向

- 法術系統（閃電、冰凍、增援）
- Boss 關卡與特殊節點
- 技能樹與升級系統
- 多人連線（WebSocket）
- 音效與 BGM
- 關卡編輯器
