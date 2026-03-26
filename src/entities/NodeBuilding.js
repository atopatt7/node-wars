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

    // 生產計時器（毫秒累積）
    this.productionAccumulator = 0;

    // 視覺狀態
    this.isSelected  = false;
    this.pulseTimer  = 0;           // 選取脈衝動畫計時器（由 ProductionSystem 更新）
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

    // ── 4. 選取光圈（白色 + 陣營色雙環）──
    if (this.isSelected) {
      const pulse = 0.55 + 0.45 * Math.sin(this.pulseTimer * 0.006);
      g.lineStyle(4, 0xFFFFFF, pulse * 0.9);
      g.strokeCircle(x, y, r + 10);
      g.lineStyle(2, col.stroke, pulse);
      g.strokeCircle(x, y, r + 5);
    }

    // ── 5. 容量進度環 ──
    this._drawProgressRing(g, col);
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
  // 容量進度弧（滿格閃亮）
  // ─────────────────────────────────────────────────────
  _drawProgressRing(g, col) {
    if (this.owner === 'neutral') return;

    const ratio = this.currentUnits / this.maxUnits;
    if (ratio <= 0) return;

    const r = this.radius + 3;
    const startAngle = -Math.PI / 2;
    const endAngle   = startAngle + ratio * Math.PI * 2;

    // 背景環（暗色底）
    g.lineStyle(3, 0x000000, 0.25);
    g.beginPath();
    g.arc(this.x, this.y, r, 0, Math.PI * 2, false);
    g.strokePath();

    // 進度弧
    const t = Date.now();
    const glowAlpha = ratio >= 1
      ? 0.75 + 0.25 * Math.sin(t * 0.005)  // 滿格脈衝
      : 0.55;
    g.lineStyle(3, col.stroke, glowAlpha);
    g.beginPath();
    g.arc(this.x, this.y, r, startAngle, endAngle, false);
    g.strokePath();
  }
}
