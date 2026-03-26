/**
 * NodeBuilding.js - 可佔領建築節點
 *
 * 每個節點包含：
 *   id, x, y, type, owner, currentUnits,
 *   maxUnits, productionRate, defenseMultiplier, radius
 *
 * 負責：
 *   - 節點資料與基本屬性（constructor）
 *   - 繪製圓圈 + 圖示 + 選取光圈（draw）
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
    this.pulseTimer  = 0;           // 選取脈衝動畫計時器
  }

  // ── 生產狀態 ──────────────────────────────────────────

  /**
   * 重置生產累積器
   * 節點換手（被佔領）時呼叫，避免新主人立刻獲得殘留的累積兵力。
   * CombatSystem 透過此方法重置，不直接存取 productionAccumulator 欄位。
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

    // 陰影
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(this.x + 3, this.y + 5, r);

    // 外環（深色邊框）
    g.fillStyle(col.dark, 1);
    g.fillCircle(this.x, this.y, r);

    // 主體填色
    g.fillStyle(col.fill, 1);
    g.fillCircle(this.x, this.y, r - 4);

    // 建築類型圖示
    this._drawTypeIcon(g, col);

    // 選取光圈（白色脈衝）
    if (this.isSelected) {
      const pulse = 0.65 + 0.35 * Math.sin(this.pulseTimer * 0.008);
      g.lineStyle(3, 0xFFFFFF, pulse);
      g.strokeCircle(this.x, this.y, r + 5);
    }

    // 容量進度環（淺色弧線代表容滿比例）
    this._drawProgressRing(g, col);
  }

  /** 各建築類型的幾何圖示 */
  _drawTypeIcon(g, col) {
    const r = this.radius;

    g.fillStyle(0xFFFFFF, 0.35);

    switch (this.type) {
      case 'CASTLE':
        // 三個城垛
        [-10, 0, 10].forEach(dx => {
          g.fillRect(this.x + dx - 3, this.y - r + 5, 6, 7);
        });
        // 城牆主體
        g.fillRect(this.x - 13, this.y - r + 11, 26, 6);
        break;

      case 'TOWER':
        // 向上三角形（箭頭）
        g.fillTriangle(
          this.x,      this.y - r + 6,
          this.x - 7,  this.y - r + 17,
          this.x + 7,  this.y - r + 17
        );
        // 箭桿
        g.fillRect(this.x - 1.5, this.y - r + 17, 3, 6);
        break;

      case 'VILLAGE':
      default:
        // 小屋屋頂三角
        g.fillTriangle(
          this.x,      this.y - r + 7,
          this.x - 8,  this.y - r + 16,
          this.x + 8,  this.y - r + 16
        );
        // 屋身
        g.fillRect(this.x - 5, this.y - r + 16, 10, 7);
        break;
    }
  }

  /** 容量進度弧（滿格閃亮） */
  _drawProgressRing(g, col) {
    if (this.owner === 'neutral') return;

    const ratio = this.currentUnits / this.maxUnits;
    if (ratio <= 0) return;

    const r = this.radius + 2;
    const startAngle = -Math.PI / 2;              // 從頂部開始
    const endAngle   = startAngle + ratio * Math.PI * 2;

    g.lineStyle(2, col.stroke, ratio >= 1 ? 0.9 : 0.45);
    g.beginPath();
    g.arc(this.x, this.y, r, startAngle, endAngle, false);
    g.strokePath();
  }
}
