/**
 * TroopGroup.js - 移動中的部隊群組
 *
 * 每支部隊包含：
 *   fromNodeId, toNodeId, owner, unitCount,
 *   speed, currentPosition (x, y)
 *
 * 負責：
 *   - 部隊資料與移動所需屬性（constructor）
 *   - 繪製移動中的多單位三角形群組（draw）
 *
 * 不再負責：
 *   - 位置更新與到達判定（已移至 MovementSystem）
 *   移動狀態欄位（traveled / currentX / currentY / arrived）
 *   仍保留在此，由 MovementSystem 讀寫。
 */

import { FACTION_COLORS, TROOP_SPEED } from '../config.js';

export class TroopGroup {
  /**
   * @param {NodeBuilding} fromNode - 來源節點（取 id/x/y/radius）
   * @param {NodeBuilding} toNode   - 目標節點
   * @param {string}       owner    - 'player' | 'enemy'
   * @param {number}       unitCount
   */
  constructor(fromNode, toNode, owner, unitCount) {
    this.fromNodeId = fromNode.id;
    this.toNodeId   = toNode.id;
    this.owner      = owner;
    this.unitCount  = Math.max(1, Math.floor(unitCount));
    this.speed      = TROOP_SPEED;

    // 計算方向向量
    const dx   = toNode.x - fromNode.x;
    const dy   = toNode.y - fromNode.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      // 極端情況：來源與目標幾乎重疊
      this.arrived = true;
      this.currentX = toNode.x;
      this.currentY = toNode.y;
      this.dirX = 1;
      this.dirY = 0;
      return;
    }

    this.dirX = dx / dist;
    this.dirY = dy / dist;
    this.totalDistance = dist;

    // 從來源節點邊緣出發（不從圓心）
    const startOffset = fromNode.radius + 2;
    this.startX = fromNode.x + this.dirX * startOffset;
    this.startY = fromNode.y + this.dirY * startOffset;

    // 停在目標節點邊緣
    this.stopDistance = dist - toNode.radius - 2;

    this.traveled  = 0;
    this.currentX  = this.startX;
    this.currentY  = this.startY;
    this.arrived   = false;
  }

  // ── 繪製 ──────────────────────────────────────────────

  /**
   * 繪製由 3~8 個方向三角形單位組成的部隊群組
   * @param {Phaser.GameObjects.Graphics} g
   */
  draw(g) {
    if (this.arrived) return;

    const col = FACTION_COLORS[this.owner];
    const cx  = this.currentX;
    const cy  = this.currentY;

    // 移動方向角（三角形朝向此方向）
    const angle = Math.atan2(this.dirY, this.dirX);

    // 依兵力決定顯示單位數（3 ~ 8）
    const displayCount = Math.min(8, Math.max(3, Math.ceil(this.unitCount / 5)));

    // 隊伍排列：最多 3 欄 × 3 排
    const cols = Math.min(3, displayCount);
    const rows = Math.ceil(displayCount / cols);

    // 垂直於移動方向的單位向量
    const perpX = -this.dirY;
    const perpY =  this.dirX;

    // 整體偏移讓群組置中
    const colSpacing = 9;
    const rowSpacing = 10;
    const totalWidth  = (cols - 1) * colSpacing;
    const totalHeight = (rows - 1) * rowSpacing;

    // ── 群組地面陰影 ──
    const shadowW = totalWidth  + 16;
    const shadowH = totalHeight * 0.35 + 8;
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx + 3, cy + 5, shadowW, shadowH);

    // ── 繪製每個單位三角形 ──
    for (let i = 0; i < displayCount; i++) {
      const col_idx = i % cols;
      const row_idx = Math.floor(i / cols);

      // 以群組中心為基準的偏移
      const perpOffset = (col_idx - (cols - 1) / 2) * colSpacing;
      const fwdOffset  = -(row_idx - (rows - 1) / 2) * rowSpacing;

      const ux = cx + perpX * perpOffset + this.dirX * fwdOffset;
      const uy = cy + perpY * perpOffset + this.dirY * fwdOffset;

      const size = 7;

      // 三角陰影
      g.fillStyle(0x000000, 0.32);
      this._fillTriangle(g, ux + 1.5, uy + 2, size, angle);

      // 三角主體（陣營色）
      g.fillStyle(col.fill, 1);
      this._fillTriangle(g, ux, uy, size, angle);

      // 三角邊框（深色）
      g.lineStyle(1.5, col.dark, 0.95);
      this._strokeTriangle(g, ux, uy, size, angle);

      // 高光（左上角小白點，增加立體感）
      g.fillStyle(0xFFFFFF, 0.35);
      const hlx = ux + Math.cos(angle - 2.2) * size * 0.35;
      const hly = uy + Math.sin(angle - 2.2) * size * 0.35;
      g.fillCircle(hlx, hly, 1.8);
    }

    // ── 兵力數字小徽章 ──
    // （文字層由 GameScene 統一管理，此處不重複繪製）
  }

  // ─────────────────────────────────────────────────────
  // 繪製方向三角形（朝 angle 方向的尖頭）
  // ─────────────────────────────────────────────────────

  /**
   * 填充旋轉三角形
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} cx 中心 x
   * @param {number} cy 中心 y
   * @param {number} size 三角形大小
   * @param {number} angle 朝向角（弧度）
   */
  _fillTriangle(g, cx, cy, size, angle) {
    const { ax, ay, bx, by, px, py } = this._trianglePoints(cx, cy, size, angle);
    g.fillTriangle(px, py, ax, ay, bx, by);
  }

  /**
   * 描邊旋轉三角形
   */
  _strokeTriangle(g, cx, cy, size, angle) {
    const { ax, ay, bx, by, px, py } = this._trianglePoints(cx, cy, size, angle);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(ax, ay);
    g.lineTo(bx, by);
    g.closePath();
    g.strokePath();
  }

  /**
   * 計算三角形三頂點
   * - 尖端朝 angle 方向
   * - 底邊在後方
   */
  _trianglePoints(cx, cy, size, angle) {
    // 尖端
    const px = cx + Math.cos(angle)           * size;
    const py = cy + Math.sin(angle)           * size;
    // 左後
    const ax = cx + Math.cos(angle + 2.45)   * size * 0.72;
    const ay = cy + Math.sin(angle + 2.45)   * size * 0.72;
    // 右後
    const bx = cx + Math.cos(angle - 2.45)   * size * 0.72;
    const by = cy + Math.sin(angle - 2.45)   * size * 0.72;
    return { px, py, ax, ay, bx, by };
  }
}
