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

    // 來源節點類型（用於繪製風格差異）
    // VILLAGE: 標準，TOWER: 緊密無晃動，CASTLE: 稍大稍慢
    this.fromNodeType = fromNode.type ?? 'VILLAGE';

    // 各部隊個體晃動的隨機相位偏移（讓不同 TroopGroup 的晃動不同步）
    this._wobbleSeed = Math.random() * Math.PI * 2;
  }

  // ── 繪製 ──────────────────────────────────────────────

  /**
   * 繪製由 2~8 個方向三角形單位組成的部隊群組
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number}  [t=Date.now()]   - 本幀時間戳（由 GameScene 統一快取）
   * @param {boolean} [isMobile=false] - 行動裝置模式：減少繪製量
   */
  draw(g, t = Date.now(), isMobile = false) {
    if (this.arrived) return;

    const col = FACTION_COLORS[this.owner];
    const cx  = this.currentX;
    const cy  = this.currentY;

    // 移動方向角（三角形朝向此方向）
    const angle = Math.atan2(this.dirY, this.dirX);

    // 依兵力決定顯示單位數
    // 行動裝置：最多 5 個，減少三角形繪製次數；桌面保持 3~8
    const displayCount = isMobile
      ? Math.min(5, Math.max(2, Math.ceil(this.unitCount / 7)))
      : Math.min(8, Math.max(3, Math.ceil(this.unitCount / 5)));

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

    // 節點類型相關參數
    //   TOWER  ：緊密、無晃動、尺寸稍小（紀律性弓箭手）
    //   CASTLE ：稍大尺寸、晃動稍大（重裝步兵感）
    //   VILLAGE：標準
    const typeParams = {
      TOWER:   { size: 6,   wobbleAmp: 0.4 },
      CASTLE:  { size: 8,   wobbleAmp: 2.2 },
      VILLAGE: { size: 7,   wobbleAmp: 1.5 },
    };
    const { size, wobbleAmp } = typeParams[this.fromNodeType] ?? typeParams.VILLAGE;

    // 時間驅動的晃動相位（使用快取時間戳，避免重複 Date.now()）
    const tNow = t * 0.004;

    if (this.owner === 'enemy') {
      // ════════════════════════════════════════════════════
      // 虛空族：能量流粒子效果
      //   各單位以「霓虹紫能量球」呈現，不使用三角形。
      //   整體環繞一層半透明光暈，強化「異質能量聚集」感。
      // ════════════════════════════════════════════════════

      // ── 虛空族速度線（紫色光絲，取代一般速度線）──
      if (!isMobile) {
        const trailCount = Math.min(3, cols);
        for (let si = 0; si < trailCount; si++) {
          const po = (si - (trailCount - 1) / 2) * 6;
          const lx = cx + perpX * po;
          const ly = cy + perpY * po;
          const lineLen = 12 + totalHeight * 0.45;
          g.lineStyle(1.2 - si * 0.2, 0xCC44FF, 0.28 - si * 0.06);
          g.beginPath();
          g.moveTo(lx, ly);
          g.lineTo(lx - this.dirX * lineLen, ly - this.dirY * lineLen);
          g.strokePath();
        }
      }

      // ── 群組整體紫色光暈 ──
      const groupGlowR = (totalWidth + 12) * 0.55;
      g.fillStyle(0x6600AA, 0.12);
      g.fillCircle(cx, cy, groupGlowR);

      // ── 繪製每個能量球單位 ──
      for (let i = 0; i < displayCount; i++) {
        const col_idx = i % cols;
        const row_idx = Math.floor(i / cols);

        const phase      = this._wobbleSeed + i * 1.73;
        const wobblePerp = Math.sin(tNow + phase)        * wobbleAmp;
        const wobbleFwd  = Math.cos(tNow * 0.7 + phase) * wobbleAmp * 0.5;

        const perpOffset = (col_idx - (cols - 1) / 2) * colSpacing + wobblePerp;
        const fwdOffset  = -(row_idx - (rows - 1) / 2) * rowSpacing + wobbleFwd;

        const ux = cx + perpX * perpOffset + this.dirX * fwdOffset;
        const uy = cy + perpY * perpOffset + this.dirY * fwdOffset;

        const orbR = size * 0.72;

        // 外層暗紫底色（深邃感）
        g.fillStyle(0x110022, 1);
        g.fillCircle(ux, uy, orbR);

        // 中層能量光（霓虹紫）
        g.fillStyle(0xAA22EE, 0.82);
        g.fillCircle(ux, uy, orbR * 0.72);

        // 內核高光（白紫，模擬熾熱核心）
        g.fillStyle(0xEEBBFF, 0.94);
        g.fillCircle(ux, uy, orbR * 0.36);

        // 頂端白點高光（增加球體立體感）
        g.fillStyle(0xFFFFFF, 0.55);
        g.fillCircle(ux - orbR * 0.22, uy - orbR * 0.28, orbR * 0.18);
      }

      // ── 前導能量尖端（取代箭頭，改用更大的孤立球 + 光暈）──
      const leadBase = totalHeight * 0.5 + 14;
      const leadPulse = isMobile ? 0.55 : 0.40 + 0.30 * Math.abs(Math.sin(tNow * 0.8 + this._wobbleSeed));
      g.fillStyle(0x6600AA, leadPulse * 0.22);
      g.fillCircle(cx + this.dirX * leadBase, cy + this.dirY * leadBase, 7);
      g.fillStyle(0xCC44FF, leadPulse * 0.78);
      g.fillCircle(cx + this.dirX * leadBase, cy + this.dirY * leadBase, 4);
      g.fillStyle(0xFFEEFF, leadPulse * 0.90);
      g.fillCircle(cx + this.dirX * leadBase, cy + this.dirY * leadBase, 2);

    } else {
      // ════════════════════════════════════════════════════
      // 玩家 / 中立：原始三角形部隊
      // ════════════════════════════════════════════════════

      // ── 1. 速度線 ──
      if (!isMobile) {
        const speedLineCount = Math.min(3, cols);
        for (let si = 0; si < speedLineCount; si++) {
          const po = (si - (speedLineCount - 1) / 2) * 6;
          const lx = cx + perpX * po;
          const ly = cy + perpY * po;
          const lineLen = 10 + totalHeight * 0.4;
          g.lineStyle(1.5 - si * 0.25, col.fill, 0.22 - si * 0.04);
          g.beginPath();
          g.moveTo(lx, ly);
          g.lineTo(lx - this.dirX * lineLen, ly - this.dirY * lineLen);
          g.strokePath();
        }
      }

      // ── 2. 群組地面陰影 ──
      if (!isMobile) {
        const shadowW = totalWidth  + 16;
        const shadowH = totalHeight * 0.35 + 8;
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx + 3, cy + 5, shadowW, shadowH);
      }

      // ── 3. 繪製每個單位三角形 ──
      for (let i = 0; i < displayCount; i++) {
        const col_idx = i % cols;
        const row_idx = Math.floor(i / cols);

        const phase       = this._wobbleSeed + i * 1.73;
        const wobblePerp  = Math.sin(tNow + phase)        * wobbleAmp;
        const wobbleFwd   = Math.cos(tNow * 0.7 + phase) * wobbleAmp * 0.5;

        const perpOffset = (col_idx - (cols - 1) / 2) * colSpacing + wobblePerp;
        const fwdOffset  = -(row_idx - (rows - 1) / 2) * rowSpacing + wobbleFwd;

        const ux = cx + perpX * perpOffset + this.dirX * fwdOffset;
        const uy = cy + perpY * perpOffset + this.dirY * fwdOffset;

        // 三角陰影
        g.fillStyle(0x000000, 0.30);
        this._fillTriangle(g, ux + 1.5, uy + 2, size, angle);

        // 三角主體（陣營色）
        g.fillStyle(col.fill, 1);
        this._fillTriangle(g, ux, uy, size, angle);

        // 三角邊框（深色）
        g.lineStyle(1.5, col.dark, 0.92);
        this._strokeTriangle(g, ux, uy, size, angle);

        // 高光（左上角小白點）
        g.fillStyle(0xFFFFFF, 0.33);
        const hlx = ux + Math.cos(angle - 2.2) * size * 0.35;
        const hly = uy + Math.sin(angle - 2.2) * size * 0.35;
        g.fillCircle(hlx, hly, 1.6);
      }

      // ── 4. 前導方向箭頭 ──
      const leadBase  = totalHeight * 0.5 + 14;
      const leadT     = tNow * 0.75 + this._wobbleSeed;
      const baseAlpha = isMobile ? 0.26 : 0.22 + 0.08 * Math.sin(leadT);
      g.fillStyle(col.fill, baseAlpha);
      this._fillTriangle(g, cx + this.dirX * leadBase, cy + this.dirY * leadBase, 4.5, angle);
      g.fillStyle(col.fill, baseAlpha * 0.55);
      this._fillTriangle(g, cx + this.dirX * (leadBase + 8), cy + this.dirY * (leadBase + 8), 3.5, angle);
    }

    // ── 5. 兵力數字小徽章 ──
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
