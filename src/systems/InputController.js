/**
 * InputController.js — 玩家輸入控制器
 *
 * 職責：
 *   - pointerdown  → 選取己方節點、開始拖曳
 *   - pointermove  → 更新拖曳位置與目標
 *   - pointerup    → 派兵或取消拖曳
 *   - 右鍵         → 循環切換送兵比例
 *
 * 不含任何戰鬥邏輯。
 * 透過 callbacks 通知 GameScene：
 *   onSendTroops(fromNode, toNode, ratio) — 觸發派兵
 *   onRatioChanged(index)                 — 比例切換，更新底部 UI
 *
 * GameScene 使用方式：
 *   this.inputController = new InputController(this, () => this.nodes, {
 *     onSendTroops:  (from, to, ratio) => this._sendTroops(from, to, ratio),
 *     onRatioChanged: (idx)            => this._updateRatioBtns(idx),
 *   });
 *   this.inputController.setup();
 *
 * 每幀在 _draw() 中呼叫：
 *   this.inputController.drawPreview(g);
 */

import { SEND_RATIOS, DEFAULT_SEND_RATIO_INDEX } from '../config.js';

export class InputController {
  /**
   * @param {Phaser.Scene} scene
   * @param {() => import('../entities/NodeBuilding.js').NodeBuilding[]} getNodes
   * @param {{
   *   onSendTroops:   (from: NodeBuilding, to: NodeBuilding, ratio: number) => void,
   *   onRatioChanged: (index: number) => void,
   * }} callbacks
   */
  constructor(scene, getNodes, callbacks) {
    this._scene     = scene;
    this._getNodes  = getNodes;
    this._callbacks = callbacks;

    // ── 拖曳狀態（外部唯讀）──
    this.isDragging     = false;
    /** @type {import('../entities/NodeBuilding.js').NodeBuilding|null} */
    this.selectedNode   = null;
    /** @type {{x:number, y:number}|null} */
    this.currentPointer = null;
    /** @type {import('../entities/NodeBuilding.js').NodeBuilding|null} */
    this.dragTarget     = null;

    // ── 送兵比例 ──
    this.sendRatioIndex = DEFAULT_SEND_RATIO_INDEX;
  }

  // ── 公開 API ──────────────────────────────────────────

  /** 向 Phaser Scene 的 input 系統綁定事件 */
  setup() {
    const input = this._scene.input;

    input.on('pointerdown', this._onPointerDown, this);
    input.on('pointermove', this._onPointerMove, this);
    input.on('pointerup',   this._onPointerUp,   this);
  }

  /** 解除所有輸入綁定（場景銷毀時使用） */
  destroy() {
    const input = this._scene.input;
    input.off('pointerdown', this._onPointerDown, this);
    input.off('pointermove', this._onPointerMove, this);
    input.off('pointerup',   this._onPointerUp,   this);
  }

  /** 取消目前拖曳，還原所有狀態 */
  cancelDrag() {
    if (this.selectedNode) this.selectedNode.isSelected = false;
    this.selectedNode   = null;
    this.isDragging     = false;
    this.currentPointer = null;
    this.dragTarget     = null;
  }

  /** 循環切換送兵比例（右鍵觸發） */
  cycleSendRatio() {
    this.sendRatioIndex = (this.sendRatioIndex + 1) % SEND_RATIOS.length;
    this._callbacks.onRatioChanged(this.sendRatioIndex);
  }

  /**
   * 直接設定比例（底部比例按鈕呼叫）
   * @param {number} index
   */
  setRatioIndex(index) {
    this.sendRatioIndex = index;
    this._callbacks.onRatioChanged(index);
  }

  /**
   * 繪製拖曳預覽線（每幀由 GameScene._draw 呼叫）
   * @param {Phaser.GameObjects.Graphics} g
   */
  drawPreview(g) {
    if (!this.isDragging || !this.selectedNode || !this.currentPointer) return;

    const from = this.selectedNode;
    const tx   = this.currentPointer.x;
    const ty   = this.currentPointer.y;

    const tNode = this._getNodeAt(tx, ty);

    // 根據目標決定線條顏色
    let lineColor = 0xFFFFFF;
    if (tNode && tNode !== from) {
      lineColor = tNode.owner === 'player' ? 0x44FF99 : 0xFF4444;
    }

    // 虛線
    g.lineStyle(2.5, lineColor, 0.75);
    this._dashedLine(g, from.x, from.y, tx, ty, 10, 7);

    // 目標節點：高光環 + 箭頭
    if (tNode && tNode !== from) {
      g.lineStyle(3, lineColor, 0.6);
      g.strokeCircle(tNode.x, tNode.y, tNode.radius + 7);
      this._drawArrow(g, from.x, from.y, tNode.x, tNode.y, tNode.radius, lineColor);
    }
  }

  // ── Pointer 事件處理 ──────────────────────────────────

  _onPointerDown(ptr) {
    if (this._scene.isGameOver || this._scene.isPaused) return;

    // 右鍵：切換比例
    if (ptr.rightButtonDown()) {
      this.cycleSendRatio();
      return;
    }

    const node = this._getNodeAt(ptr.x, ptr.y);
    if (node && node.owner === 'player' && node.currentUnits >= 2) {
      this.selectedNode        = node;
      node.isSelected          = true;
      this.isDragging          = true;
      this.currentPointer      = { x: ptr.x, y: ptr.y };
    }
  }

  _onPointerMove(ptr) {
    if (!this.isDragging) return;
    this.currentPointer = { x: ptr.x, y: ptr.y };
    this.dragTarget     = this._getNodeAt(ptr.x, ptr.y);
  }

  _onPointerUp(ptr) {
    if (!this.isDragging || !this.selectedNode) {
      this.cancelDrag();
      return;
    }

    const target = this._getNodeAt(ptr.x, ptr.y);
    if (target && target !== this.selectedNode) {
      this._callbacks.onSendTroops(
        this.selectedNode,
        target,
        SEND_RATIOS[this.sendRatioIndex]
      );
    }
    this.cancelDrag();
  }

  // ── 私有繪圖輔助 ──────────────────────────────────────

  /** @returns {import('../entities/NodeBuilding.js').NodeBuilding|null} */
  _getNodeAt(px, py) {
    return this._getNodes().find(n => n.containsPoint(px, py)) ?? null;
  }

  /** 繪製虛線 */
  _dashedLine(g, x1, y1, x2, y2, dash, gap) {
    const dx   = x2 - x1;
    const dy   = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;
    let traveled = 0;
    let drawing  = true;

    while (traveled < dist) {
      const seg = Math.min(drawing ? dash : gap, dist - traveled);
      if (drawing) {
        const sx = x1 + nx * traveled;
        const sy = y1 + ny * traveled;
        const ex = x1 + nx * (traveled + seg);
        const ey = y1 + ny * (traveled + seg);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(ex, ey);
        g.strokePath();
      }
      traveled += seg;
      drawing = !drawing;
    }
  }

  /** 在目標節點邊緣繪製箭頭 */
  _drawArrow(g, fx, fy, tx, ty, targetRadius, color) {
    const dx  = tx - fx;
    const dy  = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const nx   = dx / len;
    const ny   = dy / len;
    const tip  = { x: tx - nx * (targetRadius + 1), y: ty - ny * (targetRadius + 1) };
    const size = 10;

    g.fillStyle(color, 0.85);
    g.fillTriangle(
      tip.x,                               tip.y,
      tip.x - nx * size + ny * size * 0.5, tip.y - ny * size - nx * size * 0.5,
      tip.x - nx * size - ny * size * 0.5, tip.y - ny * size + nx * size * 0.5
    );
  }
}
