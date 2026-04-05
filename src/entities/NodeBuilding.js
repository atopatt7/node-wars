/**
 * NodeBuilding.js - 可佔領建築節點
 *
 * 每個節點包含：
 *   id, x, y, type, owner, currentUnits,
 *   maxUnits, productionRate, defenseMultiplier, radius
 *
 * 負責：
 *   - 節點資料與基本屬性（constructor）
 *   - 繪製建築外觀（村莊 / 城堡 / 箭塔）+ 選取光圈（draw）
 *   - 點擊命中判定（containsPoint）
 *
 * 不再負責：
 *   - 自動生兵更新（已移至 ProductionSystem）
 *   生兵相關資料欄位（productionAccumulator / pulseTimer）
 *   仍保留在此，由 ProductionSystem 讀寫。
 */

import { NODE_TYPES, FACTION_COLORS, UPGRADE_CONFIG } from '../config.js';

export class NodeBuilding {
  /**
   * @param {number} id
   * @param {number} x  - 畫布像素座標
   * @param {number} y
   * @param {string} type  - 'VILLAGE' | 'CASTLE' | 'TOWER'
   * @param {string} owner - 'player' | 'enemy' | 'neutral'
   * @param {number} currentUnits
   */
  constructor(id, x, y, type, owner, currentUnits) {
    this.id    = id;
    this.x     = x;
    this.y     = y;
    this.type  = type;
    this.owner = owner;
    this.currentUnits = currentUnits;

    // 從設定表讀取靜態屬性
    const cfg = NODE_TYPES[type];
    this.maxUnits          = cfg.maxUnits;
    this.productionRate    = cfg.productionRate;  // 單位/秒
    this.defenseMultiplier = cfg.defenseMultiplier;
    this.radius            = cfg.radius;
    this.label             = cfg.label;
    this.typeName          = cfg.name;

    // 節點被動效果（由 CombatSystem 在戰鬥結算時讀取）
    // null | 'attacker_penalty' | 'garrison_regen' | ...（未來可擴充）
    this.passiveEffect = cfg.passiveEffect ?? null;
    this.passiveValue  = cfg.passiveValue  ?? 1.0;

    // 生產計時器（毫秒累積）
    this.productionAccumulator = 0;

    // 超載衰減計時器（毫秒累積）
    // 當 currentUnits > maxUnits 時由 ProductionSystem 讀寫，用於計算每秒損失
    this.overflowDecayAccumulator = 0;

    // 視覺狀態
    this.isSelected  = false;
    this.pulseTimer  = 0;           // 選取脈衝動畫計時器（由 ProductionSystem 更新）

    // 被動效果觸發閃光（由 GameScene 在戰鬥結算後呼叫 triggerEffect() 設定）
    // 使用 Date.now() 時間戳，不需要 update()，draw() 自行計算剩餘比例
    this._effectExpiry  = 0;        // 效果結束的絕對時間戳（ms）
    this._effectType    = null;     // 'attacker_penalty' | 'garrison_regen' | null
    this._effectDur     = 700;      // 效果持續時間（ms），與 triggerEffect 同步

    // 佔領成功閃光（由 GameScene 在 capture 結算後呼叫 triggerCapture() 設定）
    // 與 _effectExpiry 獨立，允許同一幀同時展示多種回饋
    this._captureExpiry = 0;        // 佔領效果結束的絕對時間戳（ms）
    this._captureDur    = 900;      // 佔領效果持續時間（ms）

    // 出兵脈衝（由 GameScene._sendTroops() 呼叫 triggerSendPulse() 設定）
    // 表現「兵是從這裡派出去的」，各節點類型有輕微風格差異：
    //   VILLAGE：柔和單環（350ms）
    //   TOWER  ：快速銳利閃光（250ms）
    //   CASTLE ：雙環宏大擴散（500ms）
    this._sendPulseExpiry   = 0;
    this._sendPulseDur      = 350;
    this._sendPulseIsPlayer = false;  // 玩家出兵時啟用增強視覺

    // ── 法術 Buff 欄位（timestamp-based，同現有閃光系統）──────
    // 各欄位為效果到期的 Date.now() 絕對時間戳：
    //   _hasteExpiry   → ProductionSystem 生兵時乘以加速倍率
    //   _fortifyExpiry → CombatSystem 計算防禦力時加上 defBonus
    //   _meteorExpiry  → 純視覺（撞擊衝擊波動畫）
    this._hasteExpiry   = 0;
    this._hasteDur      = 8000;
    this._fortifyExpiry = 0;
    this._fortifyDur    = 7000;    // 與 SPELL_CONFIG.FORTIFY.duration 同步
    this._meteorExpiry  = 0;
    this._meteorDur     = 700;

    // ── 升級系統 ──────────────────────────────────────────
    // level 1（初始）→ 2 → 3（最大）
    // 升級由 InputController 雙擊觸發，呼叫 upgrade()。
    // 升級成功後呼叫 triggerUpgrade() 播放金色擴散閃光。
    this.level = 1;
    this._upgradeExpiry = 0;
    this._upgradeDur    = 1000;
  }

  // ── 被動效果觸發（由 GameScene 呼叫）─────────────────────
  /**
   * 在節點上播放一次短暫的視覺閃光，表示某個被動效果剛剛發動。
   * 使用 Date.now() 時間戳驅動，不需要外部 tick。
   * @param {'attacker_penalty'|'garrison_regen'} effectType
   * @param {number} [durationMs=700]
   */
  triggerEffect(effectType, durationMs = 700) {
    this._effectType   = effectType;
    this._effectDur    = durationMs;
    this._effectExpiry = Date.now() + durationMs;
  }

  /**
   * 播放「節點被佔領」的擴散脈衝閃光。
   * 使用節點當前 owner 的陣營顏色（在呼叫前 CombatSystem 已更新 owner），
   * 因此閃光顏色等於新主人的顏色，直觀傳達 ownership 改變方向。
   * @param {number} [durationMs=900]
   */
  triggerCapture(durationMs = 1100) {
    this._captureDur    = durationMs;
    this._captureExpiry = Date.now() + durationMs;
  }

  /**
   * 播放「出兵瞬間」脈衝，表示兵力從此節點被派出。
   * 持續時間依節點類型自動決定（Tower 最短最銳，Castle 最寬最慢）。
   */
  /**
   * 播放「出兵瞬間」脈衝。
   * @param {boolean} [isPlayer=false] 玩家出兵時傳 true，啟用增強視覺（更亮、更大、多環）
   */
  triggerSendPulse(isPlayer = false) {
    // 玩家出兵持續更久（更有體感）；AI 出兵維持原本短促值
    const durPlayer  = { TOWER: 350, VILLAGE: 500, CASTLE: 700 };
    const durNeutral = { TOWER: 250, VILLAGE: 350, CASTLE: 500 };
    const map = isPlayer ? durPlayer : durNeutral;
    const dur = map[this.type] ?? 350;
    this._sendPulseDur      = dur;
    this._sendPulseExpiry   = Date.now() + dur;
    this._sendPulseIsPlayer = isPlayer;
  }

  // ── 升級 ──────────────────────────────────────────────

  /**
   * 嘗試升級節點（由 GameScene 在玩家雙擊己方節點時呼叫）。
   * @returns {boolean} 升級成功回傳 true；等級已滿或兵力不足回傳 false
   */
  upgrade() {
    if (this.level >= 3) return false;           // 已達最高級
    const cfg = UPGRADE_CONFIG[this.type];
    const idx = this.level - 1;                 // 0 = 1→2；1 = 2→3
    const cost = cfg.costs[idx];
    if (this.currentUnits < cost) return false;  // 兵力不足

    // 消耗兵力 + 提升屬性
    this.currentUnits   -= cost;
    this.level          += 1;
    this.maxUnits       += cfg.maxUnitsBonus[idx];
    this.productionRate += cfg.productionBonus[idx];

    // 播放升級視覺效果
    this.triggerUpgrade();
    return true;
  }

  /**
   * 播放金色升級擴散閃光。
   * @param {number} [durationMs=1000]
   */
  triggerUpgrade(durationMs = 1000) {
    this._upgradeDur    = durationMs;
    this._upgradeExpiry = Date.now() + durationMs;
  }

  // ── 生產狀態 ──────────────────────────────────────────

  /**
   * 重置生產累積器
   * 節點換手（被佔領）時呼叫，避免新主人立刻獲得殘留的累積兵力。
   */
  resetProductionState() {
    this.productionAccumulator = 0;
  }

  // ── 命中判定 ──────────────────────────────────────────

  /**
   * 判斷螢幕點是否在節點範圍內（加 6px 觸控容差）
   */
  containsPoint(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy <= (this.radius + 6) ** 2;
  }

  // ── 繪製 ──────────────────────────────────────────────

  /**
   * 將節點畫到 Phaser Graphics 物件上
   * 每幀呼叫，graphics 在外層已 clear()
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number}  [t=Date.now()]  - 本幀時間戳（由 GameScene 統一快取，避免重複 Date.now()）
   * @param {boolean} [isMobile=false] - 行動裝置模式：跳過高負載動畫，減少 GPU 壓力
   */
  draw(g, t = Date.now(), isMobile = false) {
    // 儲存至 instance，供所有 private draw 方法共用（省去參數傳遞）
    this._drawTime = t;
    this._isMobile = isMobile;

    const col = FACTION_COLORS[this.owner];
    const r   = this.radius;
    const x   = this.x;
    const y   = this.y;

    // ── 1. 地面陰影橢圓 ──
    // 行動裝置：groundGraphics 靜態層已有陰影，此處可省略，
    // 避免每幀重繪同一位置的橢圓（每節點省 1 次 fillEllipse）
    if (!isMobile) {
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(x + 4, y + r * 0.75, r * 2.4, r * 0.55);
    }

    // ── 2. 陣營光暈（柔和呼吸效果）──
    // 行動裝置：省略 sin() 計算，改用固定 alpha（視覺差異不大，省 Math.sin/幀/節點）
    const haloAlpha = isMobile
      ? 0.16
      : 0.13 + 0.07 * Math.sin(t * 0.002);
    g.fillStyle(col.fill, haloAlpha);
    g.fillCircle(x, y, r + 10);

    // ── 2b. 虛空族：不穩定能量外環（僅敵方節點）──
    // 代替紅色陣營光暈，以霓虹紫脈衝環傳達「異質能量侵佔」感。
    // 行動裝置：省略 sin 計算，改用固定強度。
    if (this.owner === 'enemy') {
      const voidPulse = isMobile
        ? 0.65
        : 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0028 + this.id * 0.9));
      // 外層霓虹紫環（不穩定擴張）
      g.lineStyle(1.8, 0xCC44FF, 0.28 + voidPulse * 0.38);
      g.strokeCircle(x, y, r + 14 + voidPulse * 5);
      // 中層細環（頻率更快，製造「顫動」感）
      if (!isMobile) {
        const innerPulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.005 + this.id * 1.4));
        g.lineStyle(0.8, 0xAA22EE, 0.15 + innerPulse * 0.22);
        g.strokeCircle(x, y, r + 8 + innerPulse * 3);
      }
    }

    // ── 3. 建築主體 ──
    switch (this.type) {
      case 'CASTLE':  this._drawCastle(g, x, y, r, col);  break;
      case 'TOWER':   this._drawTower(g, x, y, r, col);   break;
      case 'VILLAGE':
      default:        this._drawVillage(g, x, y, r, col); break;
    }

    // ── 3b. 升級等級指示（底部鑽石 pip，level 2/3 才顯示）──
    this._drawLevelIndicator(g, x, y, r);

    // ── 3e. 升級可用提示（玩家節點且可升級時，顯示金綠色脈衝提示環）──
    this._drawUpgradeHint(g, x, y, r);

    // ── 3c. 被動效果徽章（右上角小圖示）──
    this._drawPassiveBadge(g, x, y, r);

    // ── 3d. 被動效果觸發閃光（戰鬥結算後短暫出現）──
    this._drawEffectFlash(g, x, y, r);

    // ── 4. 超載外環（橙色脈衝環，currentUnits > maxUnits 時顯示）──
    if (this.currentUnits > this.maxUnits) {
      // 行動裝置：省略 sin 脈衝，固定強度
      const overPulse = isMobile
        ? 0.80
        : 0.55 + 0.45 * Math.abs(Math.sin(t * 0.007));
      // 外光暈
      g.fillStyle(0xFF8800, 0.08 + 0.06 * overPulse);
      g.fillCircle(x, y, r + 14);
      // 橙色外環
      g.lineStyle(3, 0xFF8800, overPulse * 0.9);
      g.strokeCircle(x, y, r + 12);
      // 內橙環（與陣營環並存，增加層次）
      g.lineStyle(1.5, 0xFFCC44, overPulse * 0.6);
      g.strokeCircle(x, y, r + 7);
    }

    // ── 5. 選取光圈（白色 + 陣營色雙環）──
    if (this.isSelected) {
      const pulse = 0.55 + 0.45 * Math.sin(this.pulseTimer * 0.006);
      g.lineStyle(4, 0xFFFFFF, pulse * 0.9);
      g.strokeCircle(x, y, r + 10);
      g.lineStyle(2, col.stroke, pulse);
      g.strokeCircle(x, y, r + 5);
    }

    // ── 5. 容量進度環 ──
    this._drawProgressRing(g, col);

    // ── 6. 佔領成功閃光（最頂層）──
    this._drawCaptureFlash(g, x, y, r);

    // ── 7. 出兵脈衝（蓋在所有效果上，短暫出現即消失）──
    this._drawSendPulse(g, x, y, r);

    // ── 8. 法術 Buff 視覺（升級閃光之前，讓升級效果蓋在上面）──
    this._drawSpellBuffs(g, x, y, r);

    // ── 9. 升級金色閃光（最頂層）──
    this._drawUpgradeFlash(g, x, y, r);
  }

  // ─────────────────────────────────────────────────────
  // 村莊：小木屋 + 圍欄
  // ─────────────────────────────────────────────────────
  _drawVillage(g, x, y, r, col) {
    // ── Lv2+: 附屬倉庫（右側小屋，在主屋之前繪製 → 呈現在主屋後方）──────
    // 倉庫比主屋低矮，代表聚落已擴建第二棟儲藏室。
    if (this.level >= 2) {
      const sx = x + r * 0.44;
      const sy = y + r * 0.02;
      // 倉庫牆體（米色木牆）
      g.fillStyle(0xBBA070, 1);
      g.fillRect(sx, sy - r * 0.14, r * 0.36, r * 0.22);
      // 木板橫紋
      g.lineStyle(1, 0x998050, 0.45);
      for (let li = 1; li <= 2; li++) {
        const wy = sy - r * 0.14 + li * (r * 0.22 / 3);
        g.beginPath(); g.moveTo(sx, wy); g.lineTo(sx + r * 0.36, wy); g.strokePath();
      }
      // 倉庫屋頂（深棕三角）
      g.fillStyle(0x6A3010, 1);
      g.fillTriangle(
        sx + r * 0.18, sy - r * 0.44,
        sx - r * 0.02, sy - r * 0.12,
        sx + r * 0.38, sy - r * 0.12
      );
      // 屋簷深邊
      g.fillStyle(0x521808, 1);
      g.fillRect(sx - r * 0.04, sy - r * 0.14, r * 0.42, 3);
      // 倉庫門（矮小木門）
      g.fillStyle(0x3A2010, 1);
      g.fillRect(sx + r * 0.11, sy + r * 0.04, 7, 10);
    }

    // ── Lv3: 市集棚（左側帆布遮陽棚，在主屋之前繪製）────────────────
    // 象徵村落升為繁榮市集，有固定攤販棚架。
    if (this.level >= 3) {
      const mx = x - r * 0.62;
      const my = y - r * 0.02;
      // 棚柱（兩根木柱）
      g.fillStyle(0x7A5230, 1);
      g.fillRect(mx - r * 0.21, my + r * 0.10, 4, r * 0.38);
      g.fillRect(mx + r * 0.09, my + r * 0.10, 4, r * 0.38);
      // 帆布棚頂（三角形，陣營色）
      g.fillStyle(col.fill, 0.70);
      g.fillTriangle(
        mx - r * 0.23, my - r * 0.26,
        mx + r * 0.13, my - r * 0.26,
        mx - r * 0.05, my - r * 0.48
      );
      // 棚沿橫條（加深邊緣輪廓）
      g.fillStyle(col.dark, 0.90);
      g.fillRect(mx - r * 0.23, my - r * 0.28, r * 0.36, 4);
      // 展示台面（棚架底部橫板）
      g.fillStyle(0x8B6040, 1);
      g.fillRect(mx - r * 0.19, my + r * 0.07, r * 0.28, 4);
    }

    // ── 圍欄（底部木柵，在建築外圍） ──
    const fenceBaseY = y + r * 0.45;
    g.fillStyle(0x7A5230, 1);
    // 橫欄（上下兩條）
    g.fillRect(x - r * 0.72, fenceBaseY - 4, r * 1.44, 3);
    g.fillRect(x - r * 0.72, fenceBaseY + 2, r * 1.44, 3);
    // 垂直柵欄柱（7根）
    for (let i = -3; i <= 3; i++) {
      const fx = x + i * (r * 0.22);
      const topH = (i % 2 === 0) ? 14 : 11;  // 交錯高低
      g.fillStyle(0x8B6035, 1);
      g.fillRect(fx - 2, fenceBaseY - topH, 4, topH + 8);
      // 柵欄尖頭
      g.fillStyle(0xA07040, 1);
      g.fillTriangle(fx, fenceBaseY - topH - 3, fx - 3, fenceBaseY - topH, fx + 3, fenceBaseY - topH);
    }

    // ── 地基石台 ──
    g.fillStyle(0x666055, 1);
    g.fillRect(x - r * 0.5, y + r * 0.1, r, 7);
    g.fillStyle(0x555045, 1);
    g.fillRect(x - r * 0.5, y + r * 0.1, r, 3);

    // ── 房屋主牆 ──
    g.fillStyle(0xD4BC90, 1);     // 米黃木牆
    g.fillRect(x - r * 0.47, y - r * 0.22, r * 0.94, r * 0.34);

    // 牆面紋理（橫向木板線）
    g.lineStyle(1, 0xB89E70, 0.5);
    for (let i = 1; i < 3; i++) {
      const ly = y - r * 0.22 + i * (r * 0.34 / 3);
      g.beginPath();
      g.moveTo(x - r * 0.47, ly);
      g.lineTo(x + r * 0.47, ly);
      g.strokePath();
    }

    // ── 屋頂（三角形）──
    g.fillStyle(0x8B4513, 1);     // 深紅棕瓦
    g.fillTriangle(
      x,            y - r * 0.72,
      x - r * 0.58, y - r * 0.2,
      x + r * 0.58, y - r * 0.2
    );
    // 屋脊（頂部深色線）
    g.fillStyle(0x6B3010, 1);
    g.fillTriangle(
      x,            y - r * 0.72,
      x - 3,        y - r * 0.62,
      x + 3,        y - r * 0.62
    );
    // 屋簷深色邊
    g.fillStyle(0x6B3410, 1);
    g.fillRect(x - r * 0.6, y - r * 0.23, r * 1.2, 4);

    // ── 煙囪 ──
    g.fillStyle(0x888880, 1);
    g.fillRect(x + r * 0.18, y - r * 0.74, 6, 18);
    g.fillStyle(0x666660, 1);
    g.fillRect(x + r * 0.15, y - r * 0.77, 12, 4);

    // ── 窗戶（黃光感）──
    g.fillStyle(0x1A1008, 1);     // 暗框
    g.fillRect(x - r * 0.4, y - r * 0.16, 10, 8);
    g.fillRect(x + r * 0.16, y - r * 0.16, 10, 8);
    g.fillStyle(0xFFDD66, 0.8);   // 燈光
    g.fillRect(x - r * 0.38, y - r * 0.14, 6, 5);
    g.fillRect(x + r * 0.18, y - r * 0.14, 6, 5);

    // ── 木門 ──
    g.fillStyle(0x5C3317, 1);
    g.fillRect(x - 5, y - r * 0.05, 10, 15);
    // 門拱
    g.fillCircle(x, y - r * 0.05, 5);
    // 門把
    g.fillStyle(0xCC9944, 1);
    g.fillCircle(x + 3, y + r * 0.1, 1.5);

    // ── 陣營底座色帶 ──
    g.fillStyle(col.dark, 0.85);
    g.fillRect(x - r * 0.72, y + r * 0.52, r * 1.44, 7);
    g.fillStyle(col.fill, 0.55);
    g.fillRect(x - r * 0.68, y + r * 0.53, r * 1.36, 3);

    // ── Lv3: 中央旗桿 + 三角旗（在煙囪旁升起，最頂層）─────────────────
    // 旗幟是繁榮村落的地標，比城堡旗更小，以陣營色表示歸屬。
    if (this.level >= 3) {
      // 旗桿（從煙囪頂向上延伸）
      g.lineStyle(2, 0x998860, 1);
      g.beginPath();
      g.moveTo(x + r * 0.21, y - r * 0.74);
      g.lineTo(x + r * 0.21, y - r * 1.12);
      g.strokePath();
      // 三角形旗幟（陣營色）
      g.fillStyle(col.fill, 0.92);
      g.fillTriangle(
        x + r * 0.21,      y - r * 1.12,
        x + r * 0.21 + 14, y - r * 1.02,
        x + r * 0.21,      y - r * 0.92
      );
      // 旗幟暗色邊條（增加輪廓感）
      g.lineStyle(1, col.dark, 0.70);
      g.beginPath();
      g.moveTo(x + r * 0.21, y - r * 1.12);
      g.lineTo(x + r * 0.21 + 14, y - r * 1.02);
      g.lineTo(x + r * 0.21, y - r * 0.92);
      g.strokePath();
      // 旗桿頂端球（金色裝飾）
      g.fillStyle(0xFFDD88, 1);
      g.fillCircle(x + r * 0.21, y - r * 1.14, 3);
    }
  }

  // ─────────────────────────────────────────────────────
  // 城堡：城牆 + 雙塔 + 垛口
  // ─────────────────────────────────────────────────────
  _drawCastle(g, x, y, r, col) {
    // ── Lv3: 中央主塔（最先繪製，側塔將覆蓋其下半，形成縱深感）──────────
    // 主塔比兩側塔樓更高更細，代表城堡最重要的核心防禦要塞。
    if (this.level >= 3) {
      // 主塔主體（細而高）
      g.fillStyle(0xA2A090, 1);
      g.fillRect(x - r * 0.20, y - r * 1.10, r * 0.40, r * 0.82);
      // 石塊橫紋
      g.lineStyle(1, 0x7A7868, 0.40);
      for (let i = 1; i <= 4; i++) {
        const ky = y - r * 1.10 + i * (r * 0.82 / 5);
        g.beginPath(); g.moveTo(x - r * 0.20, ky); g.lineTo(x + r * 0.20, ky); g.strokePath();
      }
      // 主塔頂部略寬（城樓段）
      g.fillStyle(0xB2AAAA, 1);
      g.fillRect(x - r * 0.25, y - r * 1.13, r * 0.50, r * 0.05);
      // 主塔城垛（3個，比側塔城垛更高）
      g.fillStyle(0xC2BAAA, 1);
      [x - r * 0.19, x - r * 0.05, x + r * 0.09].forEach(bx => {
        g.fillRect(bx, y - r * 1.18, 6, 10);
      });
      // 主塔箭孔（中層）
      g.fillStyle(0x1A1210, 0.90);
      g.fillRect(x - 2, y - r * 0.88, 4, 9);
      g.fillRect(x - 5, y - r * 0.85, 10, 3);
      // 主塔大旗（陣營色，比側塔旗更大更鮮明）
      g.fillStyle(col.fill, 0.96);
      g.fillTriangle(
        x,      y - r * 1.18,
        x + 18, y - r * 1.06,
        x,      y - r * 0.94
      );
      // 旗桿（粗）
      g.lineStyle(2, 0xAAA060, 1);
      g.beginPath(); g.moveTo(x, y - r * 1.20); g.lineTo(x, y - r * 0.90); g.strokePath();
      // 旗桿頂端球
      g.fillStyle(0xFFDD88, 1);
      g.fillCircle(x, y - r * 1.22, 3.5);
    }

    // ── 地基石台 ──
    g.fillStyle(0x4A4540, 1);
    g.fillRect(x - r * 0.92, y + r * 0.45, r * 1.84, 8);

    // ── 左塔樓主體 ──
    g.fillStyle(0x9A9080, 1);
    g.fillRect(x - r * 0.92, y - r * 0.72, r * 0.38, r * 1.22);

    // ── 右塔樓主體 ──
    g.fillRect(x + r * 0.54, y - r * 0.72, r * 0.38, r * 1.22);

    // ── 主城牆 ──
    g.fillStyle(0x8A8070, 1);
    g.fillRect(x - r * 0.54, y - r * 0.3, r * 1.08, r * 0.78);

    // 石塊縫紋（橫向）
    g.lineStyle(1, 0x6A6050, 0.45);
    for (let i = 1; i <= 3; i++) {
      const ly = y - r * 0.3 + i * (r * 0.78 / 4);
      g.beginPath();
      g.moveTo(x - r * 0.54, ly);
      g.lineTo(x + r * 0.54, ly);
      g.strokePath();
    }

    // 塔樓石塊縫紋
    g.lineStyle(1, 0x7A7060, 0.4);
    for (let i = 1; i <= 5; i++) {
      const ly = y - r * 0.72 + i * (r * 1.22 / 6);
      // 左塔
      g.beginPath();
      g.moveTo(x - r * 0.92, ly);
      g.lineTo(x - r * 0.54, ly);
      g.strokePath();
      // 右塔
      g.beginPath();
      g.moveTo(x + r * 0.54, ly);
      g.lineTo(x + r * 0.92, ly);
      g.strokePath();
    }

    // ── 左塔城垛（3個）──
    g.fillStyle(0xB0A890, 1);
    const merlonW = 7, merlonH = 8;
    [-r * 0.88, -r * 0.76, -r * 0.63].forEach(bx => {
      g.fillRect(x + bx, y - r * 0.75, merlonW, merlonH);
    });

    // ── 右塔城垛（3個）──
    [r * 0.56, r * 0.68, r * 0.80].forEach(bx => {
      g.fillRect(x + bx, y - r * 0.75, merlonW, merlonH);
    });

    // ── 主城牆城垛（4個）──
    g.fillStyle(0xA8A080, 1);
    [-r * 0.44, -r * 0.2, r * 0.04, r * 0.28].forEach(bx => {
      g.fillRect(x + bx, y - r * 0.33, 6, 7);
    });

    // ── 城門拱（深色）──
    g.fillStyle(0x1A1008, 1);
    g.fillRect(x - 11, y + r * 0.08, 22, 22);
    g.fillStyle(0x1A1008, 1);
    g.fillCircle(x, y + r * 0.08, 11);   // 拱頂

    // 門縫（中線）
    g.lineStyle(1, 0x0A0804, 1);
    g.beginPath();
    g.moveTo(x, y + r * 0.08);
    g.lineTo(x, y + r * 0.48);
    g.strokePath();

    // 門釘（裝飾點）
    g.fillStyle(0x888860, 0.7);
    [[-5, 0.14], [5, 0.14], [-5, 0.26], [5, 0.26]].forEach(([dx, frac]) => {
      g.fillCircle(x + dx, y + r * frac, 1.5);
    });

    // ── 箭孔（左右塔各一）──
    g.fillStyle(0x1A1210, 0.9);
    g.fillRect(x - r * 0.76, y - r * 0.2, 4, 10);
    g.fillRect(x + r * 0.72, y - r * 0.2, 4, 10);

    // 箭孔橫縫
    g.fillRect(x - r * 0.78, y - r * 0.16, 8, 3);
    g.fillRect(x + r * 0.70, y - r * 0.16, 8, 3);

    // ── 塔旗（陣營色旗幟）──
    g.fillStyle(col.fill, 0.85);
    g.fillTriangle(
      x - r * 0.78,  y - r * 0.74,
      x - r * 0.64,  y - r * 0.65,
      x - r * 0.78,  y - r * 0.56
    );
    g.fillTriangle(
      x + r * 0.78,  y - r * 0.74,
      x + r * 0.64,  y - r * 0.65,
      x + r * 0.78,  y - r * 0.56
    );
    // 旗桿
    g.lineStyle(1.5, 0x888060, 1);
    g.beginPath();
    g.moveTo(x - r * 0.78, y - r * 0.75);
    g.lineTo(x - r * 0.78, y - r * 0.45);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + r * 0.78, y - r * 0.75);
    g.lineTo(x + r * 0.78, y - r * 0.45);
    g.strokePath();

    // ── 陣營底座色帶 ──
    g.fillStyle(col.dark, 0.85);
    g.fillRect(x - r * 0.92, y + r * 0.53, r * 1.84, 8);
    g.fillStyle(col.fill, 0.55);
    g.fillRect(x - r * 0.88, y + r * 0.54, r * 1.76, 3);

    // ── Lv2+: 外牆側翼（延伸出兩側塔樓的護衛短牆）──────────────────────
    // 代表城堡加建外圍防線，控制更大的防禦範圍。
    if (this.level >= 2) {
      // 左翼短牆
      g.fillStyle(0x7E7860, 1);
      g.fillRect(x - r * 1.15, y + r * 0.10, r * 0.25, r * 0.38);
      // 右翼短牆
      g.fillRect(x + r * 0.90, y + r * 0.10, r * 0.25, r * 0.38);
      // 牆面石紋
      g.lineStyle(1, 0x5E5840, 0.40);
      for (let i = 1; i <= 2; i++) {
        const wy = y + r * 0.10 + i * (r * 0.38 / 3);
        g.beginPath(); g.moveTo(x - r * 1.15, wy); g.lineTo(x - r * 0.90, wy); g.strokePath();
        g.beginPath(); g.moveTo(x + r * 0.90, wy); g.lineTo(x + r * 1.15, wy); g.strokePath();
      }
      // 左翼城垛（2個）
      g.fillStyle(0x9A9070, 1);
      [x - r * 1.13, x - r * 1.01].forEach(bx => {
        g.fillRect(bx, y + r * 0.07, 6, 7);
      });
      // 右翼城垛（2個）
      [x + r * 0.91, x + r * 1.03].forEach(bx => {
        g.fillRect(bx, y + r * 0.07, 6, 7);
      });
      // 延伸底座
      g.fillStyle(0x3E3C38, 1);
      g.fillRect(x - r * 1.15, y + r * 0.48, r * 0.27, 6);
      g.fillRect(x + r * 0.88, y + r * 0.48, r * 0.27, 6);
    }
  }

  // ─────────────────────────────────────────────────────
  // 箭塔：細長塔身 + 多層箭孔
  // ─────────────────────────────────────────────────────
  _drawTower(g, x, y, r, col) {
    // ── 底座石台（寬） ──
    g.fillStyle(0x4A4540, 1);
    g.fillRect(x - r * 0.88, y + r * 0.45, r * 1.76, 8);
    g.fillRect(x - r * 0.72, y + r * 0.3, r * 1.44, r * 0.18);

    // ── 塔樓底部（較寬段）──
    g.fillStyle(0x9E9680, 1);
    g.fillRect(x - r * 0.52, y + r * 0.05, r * 1.04, r * 0.28);

    // ── 塔樓主體（細長）──
    g.fillStyle(0xAAA090, 1);
    g.fillRect(x - r * 0.34, y - r * 0.82, r * 0.68, r * 0.9);

    // 石塊縫紋（橫向）
    g.lineStyle(1, 0x808070, 0.4);
    for (let i = 1; i <= 5; i++) {
      const ly = y - r * 0.82 + i * (r * 0.9 / 6);
      const offset = (i % 2 === 0) ? 4 : 0;   // 錯縫磚紋
      g.beginPath();
      g.moveTo(x - r * 0.34, ly);
      g.lineTo(x + r * 0.34, ly);
      g.strokePath();
      // 垂直磚縫（交錯）
      if (i < 5) {
        g.beginPath();
        g.moveTo(x + offset, ly);
        g.lineTo(x + offset, ly + r * 0.9 / 6);
        g.strokePath();
      }
    }

    // ── 上層略寬段（城樓）──
    g.fillStyle(0xB8B0A0, 1);
    g.fillRect(x - r * 0.4, y - r * 0.9, r * 0.8, r * 0.1);

    // ── 城垛（3個）──
    g.fillStyle(0xC8C0B0, 1);
    const mW = 6, mH = 9;
    [-r * 0.32, -r * 0.06, r * 0.2].forEach(bx => {
      g.fillRect(x + bx, y - r * 0.92, mW, mH);
    });

    // ── 箭孔（上、中、下各一）──
    g.fillStyle(0x1A1210, 0.92);
    // 上層
    g.fillRect(x - 2, y - r * 0.7, 4, 9);
    g.fillRect(x - 5, y - r * 0.67, 10, 3);
    // 中層
    g.fillRect(x - 2, y - r * 0.42, 4, 9);
    g.fillRect(x - 5, y - r * 0.39, 10, 3);
    // 下層
    g.fillRect(x - 2, y - r * 0.14, 4, 9);
    g.fillRect(x - 5, y - r * 0.11, 10, 3);

    // ── 側邊細節裝飾（斜向加固條）──
    g.lineStyle(1.5, 0x888070, 0.5);
    g.beginPath();
    g.moveTo(x - r * 0.34, y - r * 0.2);
    g.lineTo(x - r * 0.52, y + r * 0.05);
    g.strokePath();
    g.beginPath();
    g.moveTo(x + r * 0.34, y - r * 0.2);
    g.lineTo(x + r * 0.52, y + r * 0.05);
    g.strokePath();

    // ── 陣營旗幟（側旗）──
    g.fillStyle(col.fill, 0.9);
    g.fillTriangle(
      x + r * 0.34, y - r * 0.78,
      x + r * 0.34 + 12, y - r * 0.7,
      x + r * 0.34, y - r * 0.62
    );
    g.lineStyle(1.5, 0x888060, 1);
    g.beginPath();
    g.moveTo(x + r * 0.34, y - r * 0.82);
    g.lineTo(x + r * 0.34, y - r * 0.55);
    g.strokePath();

    // ── 陣營底座色帶 ──
    g.fillStyle(col.dark, 0.85);
    g.fillRect(x - r * 0.88, y + r * 0.53, r * 1.76, 7);
    g.fillStyle(col.fill, 0.55);
    g.fillRect(x - r * 0.84, y + r * 0.54, r * 1.68, 3);

    // ── Lv2+: 側邊木質防衛平台（斜撐 + 外掛木板架）────────────────────
    // 塔兵在上面投擲箭矢或石塊，象徵防禦範圍延伸。
    if (this.level >= 2) {
      // 左平台底板
      g.fillStyle(0x7A5230, 1);
      g.fillRect(x - r * 0.76, y - r * 0.38, r * 0.24, r * 0.20);
      // 左斜撐（兩根）
      g.lineStyle(3, 0x6A4220, 1);
      g.beginPath(); g.moveTo(x - r * 0.34, y - r * 0.22); g.lineTo(x - r * 0.76, y - r * 0.18); g.strokePath();
      g.beginPath(); g.moveTo(x - r * 0.34, y - r * 0.34); g.lineTo(x - r * 0.76, y - r * 0.28); g.strokePath();
      // 左平台木板紋
      g.lineStyle(1, 0x5A3210, 0.55);
      for (let i = 1; i <= 2; i++) {
        const wy = y - r * 0.38 + i * (r * 0.20 / 3);
        g.beginPath(); g.moveTo(x - r * 0.76, wy); g.lineTo(x - r * 0.52, wy); g.strokePath();
      }
      // 左平台護欄（頂部短橫條）
      g.fillStyle(0x8B6035, 1);
      g.fillRect(x - r * 0.77, y - r * 0.40, r * 0.26, 3);

      // 右平台底板
      g.fillStyle(0x7A5230, 1);
      g.fillRect(x + r * 0.52, y - r * 0.38, r * 0.24, r * 0.20);
      // 右斜撐（兩根）
      g.lineStyle(3, 0x6A4220, 1);
      g.beginPath(); g.moveTo(x + r * 0.34, y - r * 0.22); g.lineTo(x + r * 0.76, y - r * 0.18); g.strokePath();
      g.beginPath(); g.moveTo(x + r * 0.34, y - r * 0.34); g.lineTo(x + r * 0.76, y - r * 0.28); g.strokePath();
      // 右平台木板紋
      g.lineStyle(1, 0x5A3210, 0.55);
      for (let i = 1; i <= 2; i++) {
        const wy = y - r * 0.38 + i * (r * 0.20 / 3);
        g.beginPath(); g.moveTo(x + r * 0.52, wy); g.lineTo(x + r * 0.76, wy); g.strokePath();
      }
      // 右平台護欄
      g.fillStyle(0x8B6035, 1);
      g.fillRect(x + r * 0.51, y - r * 0.40, r * 0.26, 3);
    }

    // ── Lv3: 頂部弩炮 + 大型側邊火把 ──────────────────────────────────
    // 弩炮代表最強火力，大火把強調不眠不休的警戒姿態。
    if (this.level >= 3) {
      // ── 弩炮（架設於城垛間）──
      // 底座
      g.fillStyle(0x5C4030, 1);
      g.fillRect(x - r * 0.15, y - r * 0.94, r * 0.30, 7);
      // 主橫臂
      g.fillStyle(0x7A5028, 1);
      g.fillRect(x - r * 0.19, y - r * 0.99, r * 0.38, 5);
      // 弩弦（V 字形拉開狀態）
      g.lineStyle(1.5, 0xCC9944, 0.92);
      g.beginPath(); g.moveTo(x - r * 0.19, y - r * 0.97); g.lineTo(x, y - r * 0.91); g.strokePath();
      g.beginPath(); g.moveTo(x + r * 0.19, y - r * 0.97); g.lineTo(x, y - r * 0.91); g.strokePath();
      // 箭矢（已裝填）
      g.fillStyle(0xDDB860, 1);
      g.fillRect(x - 1.5, y - r * 0.99, 3, r * 0.11);
      // 箭頭尖
      g.fillStyle(0xAA8840, 1);
      g.fillTriangle(x, y - r * 1.00, x - 3, y - r * 0.99, x + 3, y - r * 0.99);

      // ── 左側大火把（掛架式）──
      const tLx = x - r * 0.60;
      const tY  = y - r * 0.60;
      // 火把柄
      g.fillStyle(0x5C3010, 1);
      g.fillRect(tLx - 2, tY, 4, 14);
      // 掛架（斜向連接塔身）
      g.lineStyle(2, 0x6A4020, 1);
      g.beginPath(); g.moveTo(tLx, tY); g.lineTo(x - r * 0.34, tY + 8); g.strokePath();
      // 燃燒外焰（橙色）
      g.fillStyle(0xFF6600, 0.92);
      g.fillTriangle(tLx - 4, tY, tLx + 4, tY, tLx, tY - 12);
      // 燃燒內焰（亮黃，閃爍感）—— 行動裝置使用固定亮度，省 sin() 計算
      const tFlicker = this._isMobile
        ? 0.82
        : 0.70 + 0.30 * Math.abs(Math.sin(this._drawTime * 0.008));
      g.fillStyle(0xFFCC00, tFlicker * 0.88);
      g.fillTriangle(tLx - 2.5, tY, tLx + 2.5, tY, tLx, tY - 7);

      // ── 右側大火把 ──
      const tRx = x + r * 0.60;
      g.fillStyle(0x5C3010, 1);
      g.fillRect(tRx - 2, tY, 4, 14);
      g.lineStyle(2, 0x6A4020, 1);
      g.beginPath(); g.moveTo(tRx, tY); g.lineTo(x + r * 0.34, tY + 8); g.strokePath();
      g.fillStyle(0xFF6600, 0.92);
      g.fillTriangle(tRx - 4, tY, tRx + 4, tY, tRx, tY - 12);
      g.fillStyle(0xFFCC00, tFlicker * 0.88);
      g.fillTriangle(tRx - 2.5, tY, tRx + 2.5, tY, tRx, tY - 7);
    }
  }

  // ─────────────────────────────────────────────────────
  // 被動效果徽章（右上角小圖示）
  // 每種 passiveEffect 對應一個固定圖示：
  //   attacker_penalty → 紅色向下箭頭（「當心弓箭！」）
  //   garrison_regen   → 綠色十字（「守城回復」）
  // 未來新增效果只需在此加 else if 分支
  // ─────────────────────────────────────────────────────
  _drawPassiveBadge(g, x, y, r) {
    if (!this.passiveEffect) return;

    // 徽章位置：右上角，緊貼節點圓邊
    const bx = x + r * 0.64;
    const by = y - r * 0.64;
    const t  = this._drawTime;   // 使用快取時間戳，避免重複 Date.now()

    if (this.passiveEffect === 'attacker_penalty') {
      // 紅色向下箭頭：代表「塔上弓箭射擊攻擊方」
      // 行動裝置：省略 sin 脈衝
      const pulse = this._isMobile
        ? 0.88
        : 0.75 + 0.25 * Math.abs(Math.sin(t * 0.003));
      // 底部圓形背景
      g.fillStyle(0x220000, 0.55);
      g.fillCircle(bx, by, 8);
      // 箭頭軸
      g.fillStyle(0xFF3333, pulse);
      g.fillRect(bx - 1.5, by - 5, 3, 7);
      // 箭頭尖（向下三角）
      g.fillTriangle(bx, by + 6, bx - 4.5, by + 1, bx + 4.5, by + 1);
      // 箭羽（頂部橫線）
      g.fillRect(bx - 4, by - 6, 8, 2);

    } else if (this.passiveEffect === 'garrison_regen') {
      // 綠色十字：代表「城堡守城後自動補員」
      const pulse = this._isMobile
        ? 0.90
        : 0.80 + 0.20 * Math.abs(Math.sin(t * 0.0025));
      // 底部圓形背景
      g.fillStyle(0x002211, 0.55);
      g.fillCircle(bx, by, 8);
      // 綠色十字
      g.fillStyle(0x44DD88, pulse);
      g.fillRect(bx - 1.5, by - 5.5, 3, 11);  // 縱條
      g.fillRect(bx - 5.5, by - 1.5, 11, 3);  // 橫條
    }
  }

  // ─────────────────────────────────────────────────────
  // 被動效果觸發閃光
  //
  // 由 triggerEffect() 啟動，依 Date.now() 計算剩餘比例 t（1.0→0.0），
  // 在節點外圍渲染短暫的彩色擴散環，效果結束後自動消失。
  //
  //   attacker_penalty（Tower 被攻擊）
  //     → 橙紅色外環 + 內環，傳達「弓箭射擊讓攻擊方受損」
  //   garrison_regen（Castle 守城成功）
  //     → 翠綠色外環 + 內環，傳達「城堡守住並回補兵力」
  //
  // 未來新增 passiveEffect 只需在此加 else if 分支。
  // ─────────────────────────────────────────────────────
  _drawEffectFlash(g, x, y, r) {
    if (!this._effectType) return;
    const now = this._drawTime;   // 快取時間戳
    if (now >= this._effectExpiry) return;

    // t: 1.0（效果剛觸發）→ 0.0（效果結束），線性淡出
    const t  = (this._effectExpiry - now) / this._effectDur;
    const rp = 1 - t;   // 0→1（環向外擴散）

    if (this._effectType === 'attacker_penalty') {
      // ── 橙紅塔擊：初始衝擊填充 + 向外擴散環 + 靜止外環 ──
      // 衝擊填充（前 40%，t: 1.0→0.60）
      if (t > 0.60) {
        const ft = (t - 0.60) / 0.40;
        g.fillStyle(0xFF3300, ft * 0.30);
        g.fillCircle(x, y, r + 22);
      }
      // 擴散衝擊環（從 r 擴到 r+30，整個持續期間）
      const impactR = r + rp * 30;
      g.lineStyle(2 + t * 2.5, 0xFF6600, t * 0.82);
      g.strokeCircle(x, y, impactR);
      // 外光暈填充
      g.fillStyle(0xFF2200, t * 0.18);
      g.fillCircle(x, y, r + 20);
      // 主外環（不動、粗）
      g.lineStyle(3 + t * 3, 0xFF3300, t * 0.95);
      g.strokeCircle(x, y, r + 17);
      // 內環（火花感）
      g.lineStyle(2, 0xFF8800, t * 0.80);
      g.strokeCircle(x, y, r + 9);

    } else if (this._effectType === 'garrison_regen') {
      // ── 翠綠守城回復：治療填充 + 擴散治療環 + 靜止外環 ──
      // 治療填充（前 50%，由內而外淡入）
      if (t > 0.50) {
        const ft = (t - 0.50) / 0.50;
        g.fillStyle(0x00FF88, ft * 0.25);
        g.fillCircle(x, y, r + 5);
      }
      // 擴散治療環（從 r 擴到 r+24）
      const healR = r + rp * 24;
      g.lineStyle(1.8 + t, 0x88FFAA, t * 0.72);
      g.strokeCircle(x, y, healR);
      // 外光暈填充
      g.fillStyle(0x00FF66, t * 0.15);
      g.fillCircle(x, y, r + 20);
      // 主外環（粗）
      g.lineStyle(3 + t * 2, 0x44EE88, t * 0.95);
      g.strokeCircle(x, y, r + 17);
      // 內環（補血感）
      g.lineStyle(2, 0xAAFFCC, t * 0.70);
      g.strokeCircle(x, y, r + 9);

    } else if (this._effectType === 'defended') {
      // ── 藍白護盾彈開：快速擴散環 + 衝擊白光 ──
      // （普通節點防守成功時觸發，600ms，與 attacker_penalty 在顏色/節奏上明確區別）
      // 衝擊白光（前 35%）
      if (t > 0.65) {
        const ft = (t - 0.65) / 0.35;
        g.fillStyle(0xFFFFFF, ft * 0.20);
        g.fillCircle(x, y, r + 10);
      }
      // 主護盾擴散環
      const shieldR = r + 2 + rp * 26;
      g.lineStyle(2.5 + t * 2, 0x7799FF, t * 0.92);
      g.strokeCircle(x, y, shieldR);
      // 外光暈
      g.fillStyle(0x4466FF, t * 0.11);
      g.fillCircle(x, y, r + 18);
      // 第二環（延遲 20% 跟隨）
      if (rp > 0.20) {
        const t2  = (rp - 0.20) / 0.80;
        const r2  = r + 2 + t2 * 16;
        g.lineStyle(1.5, 0xAABBFF, (1 - t2) * t * 0.55);
        g.strokeCircle(x, y, r2);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 佔領成功閃光
  //
  // 在節點被佔領（owner 改變）時由 triggerCapture() 啟動。
  // 因為 CombatSystem 在回傳 feedback 前已更新 target.owner，
  // 所以這裡直接取 FACTION_COLORS[this.owner] 即可得到新主人的顏色：
  //   player 佔領 → 藍色擴散環（己方旗幟感）
  //   enemy 佔領  → 紅色擴散環（警示感）
  //
  // 視覺設計：
  //   t = 1.0（觸發瞬間）→ t = 0.0（900ms後消失）
  //   第一圈：從節點邊緣向外擴散並淡出（主視覺）
  //   第二圈：延遲 30% 啟動，略慢跟隨（層次感）
  //   白色衝擊閃光：僅前 20%（t > 0.8），模擬衝擊瞬間
  // ─────────────────────────────────────────────────────
  _drawCaptureFlash(g, x, y, r) {
    const now = this._drawTime;   // 快取時間戳
    if (now >= this._captureExpiry) return;

    // t: 1.0（剛觸發）→ 0.0（效果結束），線性淡出
    const t = (this._captureExpiry - now) / this._captureDur;

    // 世界觀：
    //   敵方奪佔 → 「腐化」—— 虛空紫擴散環，傳達領土污染感
    //   玩家奪回 → 「淨化」—— 金白擴散環，傳達驅散黑暗感
    const isPurify   = (this.owner === 'player');
    const ringColor  = isPurify ? 0xFFDD66 : 0xCC44FF;
    const innerColor = isPurify ? 0xFFFFFF : 0xAA22EE;
    const flashColor = isPurify ? 0xFFFFCC : 0xEEAAFF;
    const accentColor= isPurify ? 0xFFCC00 : 0x9900CC;

    // ── 第一圈：擴散外環（更大擴散範圍）──────────────────
    const ringProgress = 1 - t;
    const ringR = r + 6 + ringProgress * 44;   // r+6 → r+50（was r+38）
    g.lineStyle(3 + t * 2.5, ringColor, t * 0.92);  // 加粗
    g.strokeCircle(x, y, ringR);

    // ── 第二圈：延遲 30% 的跟隨環 ─────────────────────
    if (ringProgress > 0.30) {
      const t2 = (ringProgress - 0.30) / 0.70;
      const innerR = r + 6 + t2 * 28;   // was 20
      g.lineStyle(2, innerColor, (1 - t2) * 0.68);  // 加粗
      g.strokeCircle(x, y, innerR);
    }

    // ── 第三圈（新增）：延遲 58% 快速小環，讓衝擊有多層餘震 ──
    if (ringProgress > 0.58) {
      const t3 = (ringProgress - 0.58) / 0.42;
      const r3 = r + 3 + t3 * 16;
      g.lineStyle(1.5, accentColor, (1 - t3) * 0.52);
      g.strokeCircle(x, y, r3);
    }

    // ── 衝擊閃光：前 28%（t: 1.0 → 0.72）─────────────（was 20%）
    if (t > 0.72) {
      const flashT = (t - 0.72) / 0.28;
      // 外層彩色填充
      g.fillStyle(flashColor, flashT * 0.55);    // was 0.38
      g.fillCircle(x, y, r + 20);               // was r+13
      g.fillStyle(accentColor, flashT * 0.32);  // was 0.22
      g.fillCircle(x, y, r + 20);               // was r+13
      // 白色核心衝擊（新增，傳達「接觸點」）
      g.fillStyle(0xFFFFFF, flashT * 0.28);
      g.fillCircle(x, y, r + 7);
    }
  }

  // ─────────────────────────────────────────────────────
  // 出兵脈衝
  //
  // 由 triggerSendPulse() 啟動，以向外擴散的光環表示
  // 「兵力正從此節點被派出」，三種節點類型有輕微風格差異：
  //
  //   VILLAGE → 柔和單環，350ms（平凡出兵感）
  //   TOWER   → 快速銳利白色閃光，250ms（彈出槍口感）
  //   CASTLE  → 雙環宏大擴散 + 微光填充，500ms（重兵出征感）
  //
  // ringProgress（rp）= 1-t：0 = 剛觸發（環在內側），1 = 結束（環在外側）
  // ─────────────────────────────────────────────────────
  _drawSendPulse(g, x, y, r) {
    const now = this._drawTime;   // 快取時間戳
    if (now >= this._sendPulseExpiry) return;

    const t   = (this._sendPulseExpiry - now) / this._sendPulseDur; // 1→0
    const rp  = 1 - t;   // 0→1（環向外擴散）
    const col = FACTION_COLORS[this.owner];
    const ip  = this._sendPulseIsPlayer;   // 玩家出兵增強旗標

    if (this.type === 'TOWER') {
      // ── 快速白色閃光（槍口感）──
      const ringR = r * 0.4 + rp * r * (ip ? 1.10 : 0.85);
      g.lineStyle((ip ? 3.5 : 2.5) * t + 0.5, 0xFFFFFF, t * (ip ? 1.0 : 0.92));
      g.strokeCircle(x, y, ringR);
      // 玩家：額外藍白外環
      if (ip) {
        const ringR2 = r * 0.2 + rp * r * 1.45;
        g.lineStyle(1.8 * t, col.stroke, t * 0.70);
        g.strokeCircle(x, y, ringR2);
      }
      // 初始亮光核
      if (t > (ip ? 0.45 : 0.55)) {
        const thresh = ip ? 0.45 : 0.55;
        const ft = (t - thresh) / (1 - thresh);
        g.fillStyle(0xFFFFFF, ft * (ip ? 0.55 : 0.30));
        g.fillCircle(x, y, r * (ip ? 0.75 : 0.55) * ft);
      }

    } else if (this.type === 'CASTLE') {
      // ── 雙環宏大擴散（重兵出征感）──
      const r1 = r * 0.35 + rp * r * (ip ? 1.20 : 0.95);
      const r2 = r * 0.2  + Math.max(0, rp - 0.25) / 0.75 * r * (ip ? 0.65 : 0.5);
      // 底色微光
      g.fillStyle(col.fill, t * (ip ? 0.18 : 0.10));
      g.fillCircle(x, y, r + 3);
      // 外環（玩家：白色、更粗）
      g.lineStyle((ip ? 4 : 3) * t + 0.5, ip ? 0xFFFFFF : col.stroke, t * (ip ? 0.96 : 0.78));
      g.strokeCircle(x, y, r1);
      // 內環
      if (rp > 0.25) {
        g.lineStyle(ip ? 2.5 : 1.5, col.fill, (t - 0.05) * (ip ? 0.80 : 0.55));
        g.strokeCircle(x, y, r2);
      }
      // 玩家專屬第三環（延遲 50% 啟動）
      if (ip && rp > 0.5) {
        const r3 = r * 0.1 + (rp - 0.5) / 0.5 * r * 0.42;
        g.lineStyle(1.5, col.stroke, t * 0.48);
        g.strokeCircle(x, y, r3);
      }

    } else {
      // ── 柔和單環（Village 標準出兵感）──
      const ringR = r * 0.45 + rp * r * (ip ? 0.98 : 0.75);
      g.lineStyle((ip ? 2.8 : 2) * t + 0.5, ip ? 0xFFFFFF : col.stroke, t * (ip ? 0.90 : 0.68));
      g.strokeCircle(x, y, ringR);
      // 玩家：外層彩色環
      if (ip) {
        const ringR2 = r * 0.3 + rp * r * 1.25;
        g.lineStyle(1.8 * t, col.stroke, t * 0.60);
        g.strokeCircle(x, y, ringR2);
      }
      // 初始內填白光（玩家門檻更低、更亮）
      const thresh = ip ? 0.40 : 0.50;
      if (t > thresh) {
        g.fillStyle(0xFFFFFF, (t - thresh) / (1 - thresh) * (ip ? 0.36 : 0.18));
        g.fillCircle(x, y, r * (ip ? 0.82 : 0.65));
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 法術 Buff 視覺
  //
  // Haste（加速）   → 藍色旋轉電弧，表示「高速運轉」
  // Fortify（強化） → 金色護盾環 + 鉚釘點，表示「防禦加固」
  // Meteor（隕石）  → 橙紅衝擊波向外擴散，表示「撞擊瞬間」
  //
  // 所有效果使用 Date.now() 時間戳驅動，到期後自動消失，
  // 無需外部清除，與現有被動效果閃光系統保持相同慣例。
  // ─────────────────────────────────────────────────────
  _drawSpellBuffs(g, x, y, r) {
    const now = this._drawTime;   // 快取時間戳（省略每節點重複 Date.now()）

    // ── Haste：藍色旋轉三段電弧 ──────────────────────────
    if (now < this._hasteExpiry) {
      const t    = (this._hasteExpiry - now) / this._hasteDur; // 1→0
      const rotA = (now * 0.006)  % (Math.PI * 2);
      const rotB = rotA + Math.PI * 0.667;
      const rotC = rotA + Math.PI * 1.334;

      // 外層發光填充（行動裝置：省略 sin 計算）
      const hasteGlow = this._isMobile ? 0.08 : 0.06 + 0.04 * Math.sin(now * 0.005);
      g.fillStyle(0x44AAFF, hasteGlow);
      g.fillCircle(x, y, r + 18);

      // 三段旋轉弧（各 90°）
      [rotA, rotB, rotC].forEach(angle => {
        g.lineStyle(2.5, 0x44AAFF, t * 0.85);
        g.beginPath();
        g.arc(x, y, r + 13, angle, angle + Math.PI * 0.5, false);
        g.strokePath();
        // 弧末端亮點
        const ex = x + Math.cos(angle + Math.PI * 0.5) * (r + 13);
        const ey = y + Math.sin(angle + Math.PI * 0.5) * (r + 13);
        g.fillStyle(0x88DDFF, t * 0.9);
        g.fillCircle(ex, ey, 2.5);
      });

      // 節點內部高頻閃爍（行動裝置：跳過高頻 sin，省 GPU）
      const spark = this._isMobile ? 0.07 : 0.5 + 0.5 * Math.abs(Math.sin(now * 0.018));
      g.fillStyle(0x44AAFF, spark * 0.07 * t);
      g.fillCircle(x, y, r);
    }

    // ── Fortify：金色護盾環 + 鉚釘點 ────────────────────
    if (now < this._fortifyExpiry) {
      const t     = (this._fortifyExpiry - now) / this._fortifyDur; // 1→0
      const pulse = this._isMobile ? 0.82 : 0.65 + 0.35 * Math.abs(Math.sin(now * 0.0018));

      // 外光暈
      g.fillStyle(0xFFDD00, t * pulse * 0.10);
      g.fillCircle(x, y, r + 20);

      // 主護盾環
      g.lineStyle(3 + t * 1.5, 0xFFDD00, t * pulse * 0.92);
      g.strokeCircle(x, y, r + 15);

      // 內裝飾環
      g.lineStyle(1.5, 0xFFFFAA, t * pulse * 0.50);
      g.strokeCircle(x, y, r + 9);

      // 4 個緩慢旋轉鉚釘（代表「盾牌固定點」）
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + now * 0.001;
        g.fillStyle(0xFFFFCC, t * 0.85);
        g.fillCircle(
          x + Math.cos(a) * (r + 15),
          y + Math.sin(a) * (r + 15),
          3
        );
      }
    }

    // ── Meteor：撞擊衝擊波擴散 ───────────────────────────
    if (now < this._meteorExpiry) {
      const t  = (this._meteorExpiry - now) / this._meteorDur; // 1→0
      const rp = 1 - t;   // 擴散進度 0→1

      // 主衝擊波環
      const waveR = r + 4 + rp * 42;
      g.lineStyle(3 + t * 4, 0xFF6622, t * 0.92);
      g.strokeCircle(x, y, waveR);

      // 次衝擊波（延遲 25%）
      if (rp > 0.25) {
        const t2 = (rp - 0.25) / 0.75;
        g.lineStyle(1.8, 0xFF9944, (1 - t2) * 0.60);
        g.strokeCircle(x, y, r + 4 + t2 * 26);
      }

      // 中心火球（前 30%）
      if (t > 0.70) {
        const ft = (t - 0.70) / 0.30;
        g.fillStyle(0xFFFFFF, ft * 0.55);
        g.fillCircle(x, y, r + 6);
        g.fillStyle(0xFF6622, ft * 0.35);
        g.fillCircle(x, y, r + 10);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 升級可用提示
  //
  // 條件：owner === 'player' && level < 3 && currentUnits >= upgradeCost
  //
  // 視覺設計：
  //   ① 外側脈衝環：金綠色（0x88FF44），慢速呼吸，提示「有事可做」
  //   ② 頂部小箭頭（↑ 三角形）：節點正上方，清楚指向「可升級」
  //   ③ 升級費用：在箭頭旁顯示（用 fillRect 矩形背景 + 無法用 Graphics 繪製文字，
  //      故費用標記由 GameScene 的 _upgradeHintTexts 處理）
  //
  // 行動裝置：省略 sin 脈衝，改用固定 alpha（節省每幀 sin 計算）
  // ─────────────────────────────────────────────────────
  _drawUpgradeHint(g, x, y, r) {
    // 只對玩家所屬、尚未滿級的節點顯示
    if (this.owner !== 'player' || this.level >= 3) return;

    // 取得當前升級費用
    const cfg  = UPGRADE_CONFIG[this.type];
    const cost = cfg.costs[this.level - 1];   // level 1→0, level 2→1

    // 兵力達到費用才顯示（有能力升級）
    if (this.currentUnits < cost) return;

    const t     = this._drawTime;
    const pulse = this._isMobile
      ? 0.50
      : 0.35 + 0.30 * Math.abs(Math.sin(t * 0.0028));

    // ① 外脈衝光暈（半透明金綠填充）
    g.fillStyle(0x88FF44, pulse * 0.10);
    g.fillCircle(x, y, r + 18);

    // ① 外脈衝環（金綠色細線）
    g.lineStyle(2, 0x88FF44, pulse * 0.75);
    g.strokeCircle(x, y, r + 14);

    // ② 頂部小上箭頭（▲ 形，懸浮在節點正上方）
    const ax = x;
    const ay = y - r - 10;  // 節點頂部外側
    const aw = 6;            // 箭頭半寬
    const ah = 7;            // 箭頭高度

    // 箭頭背底（黑色輪廓，提高可讀性）
    g.fillStyle(0x000000, 0.50);
    g.fillTriangle(ax, ay - ah - 1, ax - aw - 1, ay + 1, ax + aw + 1, ay + 1);

    // 箭頭主體（金綠色）
    g.fillStyle(0x88FF44, pulse + 0.25);
    g.fillTriangle(ax, ay - ah, ax - aw, ay, ax + aw, ay);
  }

  // ─────────────────────────────────────────────────────
  // 升級等級指示器
  //
  // 在節點底部繪製 (level-1) 個金色鑽石形 pip：
  //   level 1 → 不顯示（無額外裝飾）
  //   level 2 → 1 個金色鑽石（subtle gold）
  //   level 3 → 2 個亮金鑽石（bright gold + 白色高光）
  //
  // 鑽石位置居中在節點底部色帶上方，
  // 兩個鑽石時左右對稱排列（間距 12px）。
  // ─────────────────────────────────────────────────────
  _drawLevelIndicator(g, x, y, r) {
    if (this.level <= 1) return;

    const count   = this.level - 1;   // 1 or 2 diamonds
    const t       = this._drawTime;   // 快取時間戳
    const pulse   = this._isMobile
      ? 0.88
      : 0.78 + 0.22 * Math.abs(Math.sin(t * 0.0022));
    const color   = this.level === 3 ? 0xFFDD00 : 0xFFAA33;
    const spacing = 12;
    const baseY   = y + r * 0.76;    // 底部色帶上方

    for (let i = 0; i < count; i++) {
      const cx  = x + (i - (count - 1) / 2) * spacing;
      const cy  = baseY;
      const s   = 4.5;   // half-size of diamond

      // 暗色背景底（讓鑽石在深色節點上也清晰）
      g.fillStyle(0x000000, 0.35);
      g.fillTriangle(cx, cy - s - 1, cx - s - 1, cy, cx + s + 1, cy);
      g.fillTriangle(cx, cy + s + 1, cx - s - 1, cy, cx + s + 1, cy);

      // 鑽石主體（上半 + 下半兩個三角）
      g.fillStyle(color, pulse);
      g.fillTriangle(cx, cy - s, cx - s, cy, cx + s, cy);  // 上半
      g.fillStyle(color, pulse * 0.75);
      g.fillTriangle(cx, cy + s, cx - s, cy, cx + s, cy);  // 下半（稍暗）

      // 白色高光（左上角小角，level 3 更亮）
      const hlAlpha = this.level === 3 ? 0.55 : 0.35;
      g.fillStyle(0xFFFFFF, hlAlpha * pulse);
      g.fillTriangle(cx - 1, cy - s + 1, cx - s + 1, cy - 1, cx, cy - 2);
    }
  }

  // ─────────────────────────────────────────────────────
  // 升級金色擴散閃光
  //
  // 由 triggerUpgrade() 啟動，持續 1000ms。
  //   第一圈：從節點邊緣向外擴散，粗金色環（主視覺）
  //   第二圈：延遲 20% 啟動，較細亮金環（層次感）
  //   填充光暈：金色內填充，前 40% 顯示
  //   衝擊白光：前 15%（t > 0.85）模擬升級衝擊瞬間
  // ─────────────────────────────────────────────────────
  _drawUpgradeFlash(g, x, y, r) {
    const now = this._drawTime;   // 快取時間戳
    if (now >= this._upgradeExpiry) return;

    const t  = (this._upgradeExpiry - now) / this._upgradeDur;  // 1→0
    const rp = 1 - t;  // 0→1（擴散進度）

    // ── 第一圈：粗金色擴散環 ──
    const ringR = r + 4 + rp * 38;
    g.lineStyle(3 + t * 3.5, 0xFFDD00, t * 0.92);
    g.strokeCircle(x, y, ringR);

    // ── 金色填充光暈（前 40%）──
    if (t > 0.60) {
      const ft = (t - 0.60) / 0.40;
      g.fillStyle(0xFFDD00, ft * 0.15);
      g.fillCircle(x, y, r + 6);
    }

    // ── 第二圈：延遲 20% 啟動的亮金環 ──
    if (rp > 0.20) {
      const t2    = (rp - 0.20) / 0.80;
      const ring2 = r + 4 + t2 * 22;
      g.lineStyle(1.8, 0xFFFFAA, (1 - t2) * 0.65);
      g.strokeCircle(x, y, ring2);
    }

    // ── 衝擊白光（升級瞬間前 15%）──
    if (t > 0.85) {
      const flashT = (t - 0.85) / 0.15;
      g.fillStyle(0xFFFFFF, flashT * 0.45);
      g.fillCircle(x, y, r + 10);
      g.fillStyle(0xFFDD00, flashT * 0.25);
      g.fillCircle(x, y, r + 14);
    }
  }

  // ─────────────────────────────────────────────────────
  // 容量進度弧（滿格閃亮）
  // ─────────────────────────────────────────────────────
  _drawProgressRing(g, col) {
    if (this.owner === 'neutral') return;

    const t = this._drawTime;   // 快取時間戳
    const r = this.radius + 3;

    // 背景環（暗色底）
    g.lineStyle(3, 0x000000, 0.25);
    g.beginPath();
    g.arc(this.x, this.y, r, 0, Math.PI * 2, false);
    g.strokePath();

    if (this.currentUnits > this.maxUnits) {
      // ── 超載：橙色滿環（行動裝置省略 sin 脈衝）──
      const pulse = this._isMobile ? 0.85 : 0.7 + 0.3 * Math.abs(Math.sin(t * 0.008));
      g.lineStyle(3.5, 0xFF8800, pulse);
      g.beginPath();
      g.arc(this.x, this.y, r, 0, Math.PI * 2, false);
      g.strokePath();
    } else {
      // ── 正常：陣營色進度弧 ──
      const ratio = this.currentUnits / this.maxUnits;
      if (ratio <= 0) return;

      const startAngle = -Math.PI / 2;
      const endAngle   = startAngle + ratio * Math.PI * 2;
      // 滿格脈衝（行動裝置：省略 sin，固定亮度）
      const glowAlpha  = ratio >= 1
        ? (this._isMobile ? 0.90 : 0.75 + 0.25 * Math.sin(t * 0.005))
        : 0.55;
      g.lineStyle(3, col.stroke, glowAlpha);
      g.beginPath();
      g.arc(this.x, this.y, r, startAngle, endAngle, false);
      g.strokePath();
    }
  }
}
