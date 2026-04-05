# 下一階段優化藍圖
## 節點佔領 RTS → Civilizations Wars 完整體驗升級

> 基準版本：多來源拖曳派兵 + 超載增援衰減系統（2026-03）
> 目標：在現有 Phaser 3 + Vite 架構上，逐步打磨成完整的卡通戰略 RTS 體驗

---

## A. 優先開發清單

| 優先級 | 功能面向 | 影響層級 | 預估工期 |
|--------|----------|----------|----------|
| ★★★★★ | 1. 節點類型差異化（戰術多樣性根基） | 核心玩法 | 3–5 天 |
| ★★★★★ | 2. 特效與音效回饋（感知品質決定第一印象） | 感受層 | 3–4 天 |
| ★★★★☆ | 3. 關卡設計與目標系統（決定遊戲壽命） | 結構層 | 4–6 天 |
| ★★★★☆ | 4. 節點升級系統（深度與成長感） | 核心玩法 | 4–5 天 |
| ★★★☆☆ | 5. AI 戰術升級（挑戰性與可重玩性） | AI 層 | 3–4 天 |
| ★★★☆☆ | 6. 法術 / 技能系統（差異化與爽感高峰） | 核心玩法 | 5–7 天 |
| ★★☆☆☆ | 7. 視覺進一步升級（錦上添花） | 呈現層 | 2–3 天 |
| ★★☆☆☆ | 8. 世界觀與包裝（留存與記憶點） | 敘事層 | 2–3 天 |

---

## B. 各項目深度分析

---

### 1. 節點類型差異化

**為何重要**
現在雖有 VILLAGE / CASTLE / TOWER 三種類型，但玩家感知的差異僅限於圓圈大小與顏色。
差異化節點是策略深度的骨架——「搶哪裡」比「搶多少」更需要玩家思考。

**體驗改善**
- 玩家開始主動規劃「先插旗箭塔封路、再用村莊滾雪球、最後強攻城堡」的路線
- 每張地圖因節點分布不同，產生截然不同的博弈局面

**涉及模組**
- `config.js`：擴充 NODE_TYPES 屬性（射程、特殊能力標誌）
- `NodeBuilding.js`：新增 specialAbility 欄位與觸發邏輯
- `CombatSystem.js`：根據節點特殊能力調整戰鬥結算
- `ProductionSystem.js`：工廠型節點的特殊加速邏輯

**MVP vs 完整版**

| MVP（1週內可出） | 完整版 |
|-----------------|--------|
| 各類型新增 1 個明確被動特性 | 每種節點 2~3 個可解鎖升級路線 |
| 箭塔：攻擊者損耗 ×1.5 倍 | 箭塔：主動射出弓箭傷害路過部隊 |
| 城堡：駐守部隊自然回復 +0.5/s | 城堡：可手動發出援軍波次 |
| 工廠村莊：相鄰己方產量 +20% | 工廠：可消耗兵力鑄造「強化部隊」 |

**具體 MVP 實作方向**
```js
// config.js 新增欄位範例
TOWER: {
  ...
  passiveEffect: 'attacker_penalty',   // 攻擊者受到額外 50% 折損
  penaltyFactor: 0.5,
},
CASTLE: {
  ...
  passiveEffect: 'garrison_regen',     // 每秒額外回復 0.5 兵
  regenRate: 0.5,
},
```

---

### 2. 特效與音效回饋

**為何重要**
Civilizations Wars 的「爽感」有 60% 來自視聽回饋——兵力碰撞時的爆炸光點、
佔領時的顏色翻轉動畫、背景音樂的緊張感。這些不改變玩法，卻決定玩家是否想繼續玩。

**體驗改善**
- 戰鬥不再是數字默默變化，而是有明確的視覺「衝突瞬間」
- 佔領節點的顏色翻轉+音效，觸發類多巴胺回路
- 背景音樂讓戰局感知到緊張/輕鬆的節奏變化

**涉及模組**
- `NodeBuilding.js`：佔領翻轉動畫（閃白 → 新顏色過渡）
- `TroopGroup.js`：到達目標時的「爆散」粒子
- `GameScene.js`：ParticleSystem 管理層
- `UIController.js`：聲音控制 API 封裝

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 佔領時節點閃白 3 幀 → 新顏色（純 Graphics） | 顏色過渡動畫 600ms Tween |
| 部隊到達時 8 個小圓點向外爆散 | 粒子系統（煙塵、火花、顏色分層） |
| 使用 Phaser 內建 WebAudioAPI 播放 2 個音效 | 完整 BGM + 10 個 SFX 音效包 |
| 拖曳時線條脈衝加強（已完成一半） | 路徑上有小兵圖標跑動動畫 |

**具體 MVP 實作方向**
```js
// GameScene.js 新增粒子管理
_spawnCaptureEffect(node) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 60 + Math.random() * 40;
    this.particles.push({
      x: node.x, y: node.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,   // 0→1 衰減
      color: FACTION_COLORS[node.owner].fill,
      r: 4,
    });
  }
}
// 在 _draw() 中每幀更新粒子位置與透明度
```

---

### 3. 關卡設計與目標系統

**為何重要**
沒有明確目標的關卡只是「熬過去」。Civilizations Wars 的魅力在於每關有特定的
戰術謎題（守住城堡 2 分鐘、在有限節點下翻盤、3 分鐘內完成佔領）。

**體驗改善**
- 每關從「再打一局」變成「挑戰那個特定目標」
- 計時挑戰製造緊張感；防守關卡訓練忍耐判斷力
- 成就系統讓已通關的關卡依然有重玩動機

**涉及模組**
- `data/levels.js`：新增 `objective`、`timeLimit`、`bonusCondition` 欄位
- `WinLoseSystem.js`：支援多種勝負判定邏輯
- `UIController.js`：目標提示 HUD、倒數計時器、關卡前導畫面
- 新建 `systems/ObjectiveSystem.js`

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 關卡資料加入 objective 類型欄位 | 關卡編輯器（可視化節點擺放） |
| 支援 3 種目標：全佔、守城、限時 | 8 種目標 + 動態事件（援軍到來、城門封鎖） |
| 倒數計時 HUD | 目標進度條 + 動態提示訊息 |

**ObjectiveSystem.js 骨架**
```js
export class ObjectiveSystem {
  // objective: { type: 'capture_all' | 'survive' | 'timed_capture', params: {} }
  check(nodes, troops, elapsedMs, objective) {
    switch (objective.type) {
      case 'capture_all':    return this._checkCaptureAll(nodes);
      case 'survive':        return this._checkSurvive(nodes, elapsedMs, objective.params.duration);
      case 'timed_capture':  return this._checkTimedCapture(nodes, elapsedMs, objective.params);
    }
  }
}
```

---

### 4. 節點升級系統

**為何重要**
「選擇感」是策略遊戲的核心。讓玩家在有限資源（兵力）下決定升級哪個節點，
帶來比「更多兵力」更豐富的決策維度。

**體驗改善**
- 中盤佈局變得有意義：不只搶地，還要搶「值得升級」的地
- 防守時可以升級城堡拖延時間，進攻時可以升級工廠催出更多兵
- 視覺上建築等級提升，有明確的進度感

**涉及模組**
- `NodeBuilding.js`：新增 `level`（1–3）、`upgradeProgress` 欄位；`draw()` 依等級渲染細節
- `config.js`：各類型各等級的屬性倍率表
- `UIController.js`：長按節點彈出升級面板
- `InputController.js`：長按 vs 拖曳的手勢識別分離

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 消耗兵力（點按升級按鈕）提升至下一等級 | 消耗「資源點」（獨立貨幣系統） |
| 每級提升：產量 +25%、容量 +20 | 3 個分支升級路線（攻/守/速） |
| 建築 draw() 依等級加上旗幟/加固效果 | 完整等級動畫與光效 |

---

### 5. AI 戰術升級

**為何重要**
現有 AI 已有狀態機 + 人性化波次邏輯。但在「多節點競爭地圖」上，
AI 仍然無法執行「吸引注意力 + 迂迴偷襲」這類二段戰術。

**體驗改善**
- Hard 難度的 AI 能夠主動欺騙玩家（佯攻一側、實攻另一側）
- 不同難度有顯著不同的「個性」，而非只是數值縮放
- 多敵 AI 之間的意外競爭也讓地圖戰局更生動

**涉及模組**
- `systems/AISystem.js`：新增戰術層（佯攻、迂迴）

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 新增「分兵誘敵」：同時對 2 目標各送 30%，主力打弱目標 | 完整 GOAP（目標導向行動規劃）架構 |
| 根據玩家兵力動態調整防守/進攻比 | 多 AI 互相競爭的聯盟/背刺邏輯 |
| Easy AI 有意製造失誤（故意送少量部隊） | AI 個性記憶（記住哪些路線常勝） |

**分兵誘敵邏輯片段**
```js
// AISystem._updateIdle() 中：
// 若有 2 個以上目標且自身兵力充裕，執行分兵
if (candidates.length >= 2 && totalSendable > 40) {
  const decoy  = candidates[1];   // 次要目標（佯攻）
  const main   = candidates[0];   // 主要目標
  this._sendWave([decoy],  0.30); // 小波吸引注意
  this._sendWave([main],   0.65); // 主力跟進
}
```

---

### 6. 法術 / 技能系統

**為何重要**
法術是「高峰時刻」的製造機——時機正確的一個閃電，能逆轉整場戰局。
這是 Civilizations Wars 區別於純數值遊戲最重要的設計。

**體驗改善**
- 玩家從「滾雪球等 AI 犯錯」變成「主動製造機會」
- 每個法術都對應一個戲劇性瞬間（兵力倍增、瞬間凍結、毒霧蠶食）
- 冷卻設計讓法術使用充滿策略性，而非無腦碾壓

**涉及模組**
- 新建 `systems/SpellSystem.js`
- `UIController.js`：法術 HUD（圖示 + 冷卻扇形）
- `InputController.js`：法術觸發手勢（雙擊節點 / 點按法術按鈕）
- `GameScene.js`：法術效果與粒子的協調

**MVP（3 個法術）vs 完整版（8 個法術）**

| 法術 | MVP | 完整版 |
|------|-----|--------|
| 閃電擊 | 選定節點，立即扣除 20 兵 | 有飛行動畫、連鎖閃電特效 |
| 時間加速 | 選定己方節點，產量 ×3 持續 5 秒 | 範圍加速、視覺時鐘特效 |
| 冰霜牆 | 選定路徑，敵方部隊速度 ×0.3 持續 3 秒 | 冰柱動畫、凍結部隊外觀 |
| 疫病（完整版）| — | 選定節點，每秒 -2 兵，傳染到相鄰敵方 |

**SpellSystem 骨架**
```js
export class SpellSystem {
  constructor() {
    this.spells = {
      lightning: { cooldown: 12000, remaining: 0 },
      haste:     { cooldown: 20000, remaining: 0 },
      frost:     { cooldown: 18000, remaining: 0 },
    };
  }
  cast(spellId, target, nodes, troops) { /* 效果 + 冷卻啟動 */ }
  update(delta) { /* 冷卻倒數 */ }
  canCast(spellId) { return this.spells[spellId].remaining <= 0; }
}
```

---

### 7. 視覺進一步升級

**為何重要**
現有的卡通建築已大幅提升質感，但仍有幾個高 ROI 的小改進，
能讓遊戲看起來更「有生命」，無需大幅重構。

**體驗改善**
- 背景加入地形紋理（森林、山脈區塊）讓地圖有地理感
- 部隊移動時留下短暫的軌跡拖尾，強化速度感
- 節點邊界根據陣營有顏色漸變光暈（已有基礎，可強化）

**涉及模組**
- `GameScene._drawGrid()`：替換為地形圖層
- `TroopGroup.js`：移動軌跡點陣列（環形 buffer）
- `NodeBuilding.js`：加強光暈層次

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 地圖隨機生成「綠色叢林斑塊」 | 自訂地形編輯器，各地形有通行速度加成 |
| 部隊尾跡（最多 8 個殘影點） | 帶物理感的煙塵尾跡粒子 |
| 節點光暈呼吸動畫加快（已有，調參即可） | 佔領時 360° 光波向外擴散 |

---

### 8. 世界觀與包裝

**為何重要**
相同玩法的遊戲，有故事背景的比無背景的留存率高 2–3 倍。
「為什麼打仗」比「怎麼打仗」更能讓玩家投入。

**體驗改善**
- 每關開始前有 2–3 行劇情文字（不打斷遊戲，但建立代入感）
- 不同陣營有不同的旗幟花紋、塔樓風格（文化差異感）
- 通關後有「戰場報告」頁（統計佔領節點數、傷亡、時間）

**涉及模組**
- `UIController.js`：關卡開場劇情面板、戰場報告面板
- `data/levels.js`：新增 `lore`、`enemyFaction` 欄位
- `config.js`：陣營視覺定義（已有 FACTION_COLORS，擴充為 FACTION_PROFILES）

**MVP vs 完整版**

| MVP | 完整版 |
|-----|--------|
| 每關 lore 文字 + 「開戰！」按鈕 | 完整過場動畫（Tween + 打字機效果） |
| 戰場報告面板（數字統計） | 戰役地圖（選關介面，有世界地圖感） |
| 2 個對立陣營（藍 vs 紅） | 4 個可選陣營，各有外觀與法術偏好差異 |

---

## C. 三階段開發計畫

---

### Phase 1 — 夯實核心體驗（2–3 週）
**目標：讓「一局遊戲」本身足夠精彩**

```
Week 1
  ├─ [1] 節點類型差異化 MVP（箭塔懲罰 / 城堡回復）
  └─ [2] 特效回饋 MVP（佔領閃光 + 8 粒子爆散）

Week 2
  ├─ [3] 關卡目標系統（ObjectiveSystem + 3 種目標）
  └─ [3] 補充 3 個新關卡（含計時關、守城關）

Week 3（彈性）
  ├─ [5] AI 分兵誘敵邏輯
  └─ [2] 加入 3 個基礎音效（佔領/發兵/勝利）
```

**Phase 1 完成標準：**
- 每關有明確目標 HUD，玩家知道「我在做什麼」
- 佔領節點有視覺衝擊感
- Hard AI 能執行雙線攻擊

---

### Phase 2 — 增加深度與成長感（3–4 週）

**目標：讓玩家想「再一局」並持續進步**

```
Week 4–5
  ├─ [4] 節點升級系統 MVP（消耗兵力升 1→2→3 級）
  └─ [6] 法術系統 MVP（3 個法術 + 冷卻 HUD）

Week 6–7
  ├─ [8] 關卡劇情面板 + 戰場報告
  ├─ [7] 部隊尾跡 + 地形斑塊
  └─ 平衡性調整（各節點類型數值、法術冷卻）
```

**Phase 2 完成標準：**
- 玩家在一局中有「升級決策」和「法術時機」兩個額外決策維度
- 有 8 個以上設計良好的關卡
- 遊戲有基本的敘事包裝感

---

### Phase 3 — 打磨與發布（2 週）

**目標：讓遊戲從「可以玩」到「想分享」**

```
Week 8
  ├─ 完整音效包（BGM + 全部 SFX）
  ├─ 法術完整特效（閃電飛行動畫、冰霜牆柱）
  └─ 節點升級動畫（建築形態變化）

Week 9
  ├─ 選關介面 + 關卡解鎖邏輯
  ├─ 行動裝置觸控優化（點擊區域放大、振動回饋）
  └─ 效能優化（Graphics 批次呼叫、粒子池化）
```

**Phase 3 完成標準：**
- 完整 10 關遊戲流程
- 行動裝置 60fps 穩定運行
- 可對外分享的體驗版本

---

## 附錄：架構影響評估

| 新增模組 | 與現有架構衝突點 | 建議整合策略 |
|----------|-----------------|-------------|
| `ObjectiveSystem` | WinLoseSystem 需退讓判定主導權 | WinLoseSystem 改為「事件發射器」，ObjectiveSystem 訂閱 |
| `SpellSystem` | InputController 手勢識別變複雜 | 新增 `pointerTapCount` 追蹤，雙擊觸發法術選擇 |
| 粒子系統 | GameScene `_draw()` 負擔增加 | 獨立 `ParticlePool`（物件池）減少 GC 壓力 |
| 節點升級 | ProductionSystem 需讀取 `level` 動態倍率 | NodeBuilding 暴露 `effectiveProductionRate` getter |
| 音效系統 | Phaser WebAudio 需在 create() 後才能播放 | `AudioManager` 單例，統一在 GameScene.create() 初始化 |

---

*藍圖版本 v1.0 · 基於 anlinroad-war 2026-03 架構*
