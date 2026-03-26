/**
 * TroopGroup.js - 移動中的部隊群組
 *
 * 每支部隊包含：
 *   fromNodeId, toNodeId, owner, unitCount,
 *   speed, currentPosition (x, y)
 *
 * 負責：
 *   - 部隊資料與移動所需屬性（constructor）
 *   - 繪製移動圓點（draw）
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
   * @param {Phaser.GameObjects.Graphics} g
   */
  draw(g) {
    if (this.arrived) return;

    const col = FACTION_COLORS[this.owner];
    const r   = 8;

    // 陰影
    g.fillStyle(0x000000, 0.28);
    g.fillCircle(this.currentX + 2, this.currentY + 3, r);

    // 主體
    g.fillStyle(col.fill, 1);
    g.fillCircle(this.currentX, this.currentY, r);

    // 邊框
    g.lineStyle(2, col.dark, 1);
    g.strokeCircle(this.currentX, this.currentY, r);

    // 高光（左上角小白點）
    g.fillStyle(0xFFFFFF, 0.4);
    g.fillCircle(this.currentX - 2, this.currentY - 2, 2.5);
  }
}
