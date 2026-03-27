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

import { NODE_TYPES, FACTION_COLORS } from '../config.js';

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
  triggerCapture(durationMs = 900) {
    this._captureDur    = durationMs;
    this._captureExpiry = Date.now() + durationMs;
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
   */
  draw(g) {
    const col = FACTION_COLORS[this.owner];
    const r   = this.radius;
    const x   = this.x;
    const y   = this.y;

    // 使用 Date.now() 保證中立節點也有動畫
    const t = Date.now();

    // ── 1. 地面陰影橢圓 ──
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(x + 4, y + r * 0.75, r * 2.4, r * 0.55);

    // ── 2. 陣營光暈（柔和呼吸效果）──
    const haloAlpha = 0.13 + 0.07 * Math.sin(t * 0.002);
    g.fillStyle(col.fill, haloAlpha);
    g.fillCircle(x, y, r + 10);

    // ── 3. 建築主體 ──
    switch (this.type) {
      case 'CASTLE':  this._drawCastle(g, x, y, r, col);  break;
      case 'TOWER':   this._drawTower(g, x, y, r, col);   break;
      case 'VILLAGE':
      default:        this._drawVillage(g, x, y, r, col); break;
    }

    // ── 3b. 被動效果徽章（右上角小圖示）──
    this._drawPassiveBadge(g, x, y, r);

    // ── 3c. 被動效果觸發閃光（戰鬥結算後短暫出現）──
    this._drawEffectFlash(g, x, y, r);

    // ── 4. 超載外環（橙色脈衝環，currentUnits > maxUnits 時顯示）──
    if (this.currentUnits > this.maxUnits) {
      const overPulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.007));
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
    // 放在最後確保覆蓋所有其他效果，讓玩家第一眼看到 ownership 改變
    this._drawCaptureFlash(g, x, y, r);
  }

  // ─────────────────────────────────────────────────────
  // 村莊：小木屋 + 圍欄
  // ─────────────────────────────────────────────────────
  _drawVillage(g, x, y, r, col) {
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
  }

  // ─────────────────────────────────────────────────────
  // 城堡：城牆 + 雙塔 + 垛口
  // ─────────────────────────────────────────────────────
  _drawCastle(g, x, y, r, col) {
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
    const t  = Date.now();

    if (this.passiveEffect === 'attacker_penalty') {
      // 紅色向下箭頭：代表「塔上弓箭射擊攻擊方」
      // 脈衝閃動讓玩家注意到
      const pulse = 0.75 + 0.25 * Math.abs(Math.sin(t * 0.003));
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
      const pulse = 0.80 + 0.20 * Math.abs(Math.sin(t * 0.0025));
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
    const now = Date.now();
    if (now >= this._effectExpiry) return;

    // t: 1.0（效果剛觸發）→ 0.0（效果結束），線性淡出
    const t = (this._effectExpiry - now) / this._effectDur;

    if (this._effectType === 'attacker_penalty') {
      // ── 橙紅護盾感：外環 + 淡填充 ──
      // 外光暈填充
      g.fillStyle(0xFF2200, t * 0.16);
      g.fillCircle(x, y, r + 18);
      // 外環（粗）
      g.lineStyle(3 + t * 3, 0xFF3300, t * 0.95);
      g.strokeCircle(x, y, r + 17);
      // 內環（細，火花感）
      g.lineStyle(2, 0xFF8800, t * 0.75);
      g.strokeCircle(x, y, r + 9);

    } else if (this._effectType === 'garrison_regen') {
      // ── 翠綠回復感：外環 + 淡填充 ──
      // 外光暈填充
      g.fillStyle(0x00FF66, t * 0.13);
      g.fillCircle(x, y, r + 18);
      // 外環（粗）
      g.lineStyle(3 + t * 2, 0x44EE88, t * 0.95);
      g.strokeCircle(x, y, r + 17);
      // 內環（細，補血感）
      g.lineStyle(2, 0xAAFFCC, t * 0.65);
      g.strokeCircle(x, y, r + 9);
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
    const now = Date.now();
    if (now >= this._captureExpiry) return;

    // t: 1.0（剛觸發）→ 0.0（效果結束），線性淡出
    const t = (this._captureExpiry - now) / this._captureDur;
    const col = FACTION_COLORS[this.owner];  // 新主人的陣營色

    // ── 第一圈：擴散外環 ──────────────────────────────
    // ringProgress: 0 = 剛開始，1 = 最外層
    const ringProgress = 1 - t;
    const ringR = r + 6 + ringProgress * 32;   // r+6 → r+38
    g.lineStyle(2.5 + t * 2.5, col.stroke, t * 0.88);
    g.strokeCircle(x, y, ringR);

    // ── 第二圈：延遲 30% 的跟隨環 ─────────────────────
    if (ringProgress > 0.30) {
      const t2 = (ringProgress - 0.30) / 0.70;  // 0→1，在第一圈 30% 後啟動
      const innerR = r + 6 + t2 * 20;           // r+6 → r+26
      g.lineStyle(1.5, col.fill, (1 - t2) * 0.55);
      g.strokeCircle(x, y, innerR);
    }

    // ── 衝擊閃光：前 20%（t: 1.0 → 0.8）─────────────
    if (t > 0.80) {
      const flashT = (t - 0.80) / 0.20;   // 1.0→0.0，衝擊後快速消散
      // 白色衝擊
      g.fillStyle(0xFFFFFF, flashT * 0.38);
      g.fillCircle(x, y, r + 13);
      // 陣營色補光（加強新主人認知）
      g.fillStyle(col.fill, flashT * 0.22);
      g.fillCircle(x, y, r + 13);
    }
  }

  // ─────────────────────────────────────────────────────
  // 容量進度弧（滿格閃亮）
  // ─────────────────────────────────────────────────────
  _drawProgressRing(g, col) {
    if (this.owner === 'neutral') return;

    const t = Date.now();
    const r = this.radius + 3;

    // 背景環（暗色底）
    g.lineStyle(3, 0x000000, 0.25);
    g.beginPath();
    g.arc(this.x, this.y, r, 0, Math.PI * 2, false);
    g.strokePath();

    if (this.currentUnits > this.maxUnits) {
      // ── 超載：橙色滿環 + 快速脈衝 ──
      const pulse = 0.7 + 0.3 * Math.abs(Math.sin(t * 0.008));
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
      const glowAlpha  = ratio >= 1
        ? 0.75 + 0.25 * Math.sin(t * 0.005)  // 滿格脈衝
        : 0.55;
      g.lineStyle(3, col.stroke, glowAlpha);
      g.beginPath();
      g.arc(this.x, this.y, r, startAngle, endAngle, false);
      g.strokePath();
    }
  }
}
