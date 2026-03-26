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
   * 效果：粗線 + 半透明光暈底層 + 沿路流動箭頭 + 目標高光環
   * @param {Phaser.GameObjects.Graphics} g
   */
  drawPreview(g) {
    if (!this.isDragging || !this.selectedNode || !this.currentPointer) return;

    const from = this.selectedNode;
    const tx   = this.currentPointer.x;
    const ty   = this.currentPointer.y;

    const tNode = this._getNodeAt(tx, ty);

    // ── 顏色決定 ──
    let lineColor = 0xCCDDFF;   // 預設白藍
    if (tNode && tNode !== from) {
      lineColor = tNode.owner === 'player' ? 0x55FF99 : 0xFF5555;
    }

    const dx   = tx - from.x;
    const dy   = ty - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    // ── 底層光暈線（粗、低透明）──
    g.lineStyle(8, lineColor, 0.12);
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(tx, ty);
    g.strokePath();

    // ── 主線（中粗、半透明）──
    g.lineStyle(3.5, lineColor, 0.65);
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(tx, ty);
    g.strokePath();

    // ── 流動箭頭（沿路線每隔 38px，以 Date.now() 做偏移動畫）──
    const t      = Date.now();
    const flowOffset = (t * 0.1) % 38;  // 箭頭流動速度
    const nx = dx / dist;
    const ny = dy / dist;

    let traveled = flowOffset;
    while (traveled < dist - 18) {
      const ax = from.x + nx * traveled;
      const ay = from.y + ny * traveled;
      this._drawFlowArrow(g, ax, ay, nx, ny, lineColor);
      traveled += 38;
    }

    // ── 目標節點：脈衝高光環 ──
    if (tNode && tNode !== from) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.005));
      g.lineStyle(3, lineColor, pulse * 0.75);
      g.strokeCircle(tNode.x, tNode.y, tNode.radius + 8);
      g.lineStyle(1.5, 0xFFFFFF, pulse * 0.4);
      g.strokeCircle(tNode.x, tNode.y, tNode.radius + 12);

      // 終點箭頭
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

  /**
   * 沿路徑繪製方向小箭頭（流動動畫的單個箭頭）
   * @param {Phaser.GameObjects.Graphics} g
   * @param {number} cx  箭頭中心 x
   * @param {number} cy  箭頭中心 y
   * @param {number} nx  方向單位向量 x
   * @param {number} ny  方向單位向量 y
   * @param {number} color
   */
  _drawFlowArrow(g, cx, cy, nx, ny, color) {
    const size = 6;
    // 尖端
    const px = cx + nx * size;
    const py = cy + ny * size;
    // 左後
    const ax = cx + (-ny * size * 0.55) - nx * size * 0.65;
    const ay = cy + ( nx * size * 0.55) - ny * size * 0.65;
    // 右後
    const bx = cx - (-ny * size * 0.55) - nx * size * 0.65;
    const by = cy - ( nx * size * 0.55) - ny * size * 0.65;

    g.fillStyle(color, 0.55);
    g.fillTriangle(px, py, ax, ay, bx, by);
  }

  /**
   * 在目標節點邊緣繪製終點箭頭（較大）
   */
  _drawArrow(g, fx, fy, tx, ty, targetRadius, color) {
    const dx  = tx - fx;
    const dy  = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const nx   = dx / len;
    const ny   = dy / len;
    const tip  = { x: tx - nx * (targetRadius + 2), y: ty - ny * (targetRadius + 2) };
    const size = 12;

    // 光暈
    g.fillStyle(color, 0.35);
    g.fillTriangle(
      tip.x,                                tip.y,
      tip.x - nx * (size + 4) + ny * (size + 4) * 0.55, tip.y - ny * (size + 4) - nx * (size + 4) * 0.55,
      tip.x - nx * (size + 4) - ny * (size + 4) * 0.55, tip.y - ny * (size + 4) + nx * (size + 4) * 0.55
    );
    // 主箭頭
    g.fillStyle(color, 0.9);
    g.fillTriangle(
      tip.x,                               tip.y,
      tip.x - nx * size + ny * size * 0.5, tip.y - ny * size - nx * size * 0.5,
      tip.x - nx * size - ny * size * 0.5, tip.y - ny * size + nx * size * 0.5
    );
  }
}
