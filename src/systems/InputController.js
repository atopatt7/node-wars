/**
 * InputController.js — 玩家輸入控制器（多來源集火版）
 *
 * 操作規則：
 *   1. pointerdown 在己方據點 → 把該節點加入來源列表，開始拖曳
 *   2. pointermove 途中經過其他己方據點 → 自動加入來源列表（集火）
 *   3. pointerup 在敵方或中立據點 → 所有來源節點一起派兵到這個目標
 *   4. pointerup 在己方據點或空白處 → 取消，不派兵
 *
 * 固定派兵比例 50%（移除多比例切換機制）
 *
 * 透過 callback 通知 GameScene：
 *   onSendTroopsMulti(fromNodes, toNode) — 多來源集火派兵
 *
 * 每幀在 _draw() 中呼叫：
 *   this.inputController.drawPreview(g);
 */

/** 固定送兵比例 */
const FIXED_RATIO = 0.5;

export class InputController {
  /**
   * @param {Phaser.Scene} scene
   * @param {() => import('../entities/NodeBuilding.js').NodeBuilding[]} getNodes
   * @param {{
   *   onSendTroopsMulti: (fromNodes: NodeBuilding[], toNode: NodeBuilding) => void,
   * }} callbacks
   */
  constructor(scene, getNodes, callbacks) {
    this._scene    = scene;
    this._getNodes = getNodes;
    this._callbacks = callbacks;

    // ── 雙擊升級偵測 ──────────────────────────────────────
    // 同一個玩家節點在 DOUBLE_TAP_MS 內被點兩下 → 觸發升級
    this._lastTapNode = null;
    this._lastTapTime = 0;

    // ── 拖曳狀態 ──────────────────────────────────────────
    this.isDragging = false;

    /**
     * 已加入的來源節點集合（Set 保證不重複）
     * @type {Set<import('../entities/NodeBuilding.js').NodeBuilding>}
     */
    this.selectedSourceNodes = new Set();

    /** @type {{x:number, y:number}|null} */
    this.currentPointer = null;

    /** 目前滑鼠/手指所在的節點（可能是任意陣營） */
    this.dragTarget = null;

    /**
     * 拖曳期間快取的節點陣列（pointerdown 時取一次，cancelDrag 時清除）。
     * 避免每次 pointermove / drawPreview 都重新呼叫 getNodes()。
     * @type {import('../entities/NodeBuilding.js').NodeBuilding[]|null}
     */
    this._dragNodes = null;
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

  /** 取消目前拖曳，清除所有來源節點的選取狀態 */
  cancelDrag() {
    for (const node of this.selectedSourceNodes) {
      node.isSelected = false;
    }
    this.selectedSourceNodes = new Set();
    this.isDragging          = false;
    this.currentPointer      = null;
    this.dragTarget          = null;
    this._dragNodes          = null;   // 清除快取
  }

  // ── Pointer 事件處理 ───────────────────────────────────

  /** 雙擊間隔門檻（毫秒） */
  static DOUBLE_TAP_MS = 300;

  _onPointerDown(ptr) {
    if (this._scene.isGameOver || this._scene.isPaused) return;
    if (ptr.rightButtonDown()) return;   // 右鍵不做任何事
    // 若有法術等待施放，本次點擊由 GameScene 處理，InputController 跳過拖曳
    if (this._scene.spellSystem?.getPendingSpell()) return;

    const node = this._getNodeAt(ptr.x, ptr.y);

    // ── 雙擊偵測（同一玩家節點 300ms 內點兩下 → 升級）──
    if (node && node.owner === 'player') {
      const now = Date.now();
      if (this._lastTapNode === node && now - this._lastTapTime < InputController.DOUBLE_TAP_MS) {
        // 雙擊確認：重置雙擊狀態，觸發升級，不開始拖曳
        this._lastTapNode = null;
        this._lastTapTime = 0;
        if (this._callbacks.onUpgradeNode) this._callbacks.onUpgradeNode(node);
        return;
      }
      // 記錄本次點擊（等待下一次點擊判斷是否雙擊）
      this._lastTapNode = node;
      this._lastTapTime = now;
    } else {
      // 點在非玩家節點或空白 → 清除雙擊狀態
      this._lastTapNode = null;
      this._lastTapTime = 0;
    }

    // ── 一般拖曳出兵邏輯 ──
    if (node && node.owner === 'player' && node.currentUnits >= 2) {
      node.isSelected = true;
      this.selectedSourceNodes = new Set([node]);
      this.isDragging          = true;
      this.currentPointer      = { x: ptr.x, y: ptr.y };
      this._dragNodes          = this._getNodes();   // 拖曳開始時快取節點陣列
    }
  }

  _onPointerMove(ptr) {
    if (!this.isDragging) return;
    this.currentPointer = { x: ptr.x, y: ptr.y };
    const node = this._getNodeAt(ptr.x, ptr.y);
    this.dragTarget = node;

    // 滑過己方節點 → 納入來源列表（不重複、有足夠兵力）
    // 注意：即使之後這個節點成為目標，pointerup 會自動將它從來源過濾掉
    if (
      node &&
      node.owner === 'player' &&
      node.currentUnits >= 2 &&
      !this.selectedSourceNodes.has(node)
    ) {
      node.isSelected = true;
      this.selectedSourceNodes.add(node);
    }
  }

  _onPointerUp(ptr) {
    if (!this.isDragging || this.selectedSourceNodes.size === 0) {
      this.cancelDrag();
      return;
    }

    const target = this._getNodeAt(ptr.x, ptr.y);

    // 有效目標：任何存在的節點（敵方、中立、或己方增援）
    if (target) {
      // 將 target 本身從來源列表排除（節點不能派兵給自己）
      const validSources = Array.from(this.selectedSourceNodes).filter(n => n !== target);

      // 至少要有一個有效來源才派兵
      if (validSources.length > 0) {
        this._callbacks.onSendTroopsMulti(validSources, target);
      }
    }
    this.cancelDrag();
  }

  // ── 拖曳預覽繪製 ──────────────────────────────────────

  /**
   * 每幀由 GameScene._draw() 呼叫。
   * 效果：
   *   - 每個選中來源節點 → 指標的流動箭頭線
   *   - 有效目標節點：脈衝高光環 + 終點箭頭
   * @param {Phaser.GameObjects.Graphics} g
   */
  drawPreview(g) {
    if (!this.isDragging || this.selectedSourceNodes.size === 0 || !this.currentPointer) return;

    const tx = this.currentPointer.x;
    const ty = this.currentPointer.y;
    const t  = Date.now();

    const tNode = this._getNodeAt(tx, ty);

    // 有效目標：來源列表中至少有一個節點不是 tNode 本身（直接迭代 Set，不建立陣列）
    let isValidTarget = false;
    if (tNode) {
      for (const n of this.selectedSourceNodes) {
        if (n !== tNode) { isValidTarget = true; break; }
      }
    }

    // 線條顏色：依目標陣營決定
    let lineColor = 0xCCDDFF;
    if (isValidTarget) {
      if (tNode.owner === 'enemy')        lineColor = 0xFF5555;   // 紅：攻擊
      else if (tNode.owner === 'neutral') lineColor = 0xFFDD44;   // 黃：佔領
      else                                lineColor = 0x55FF99;   // 綠：增援己方
    }

    // ── 每個來源節點各畫一條線到游標 ──
    for (const src of this.selectedSourceNodes) {
      const dx   = tx - src.x;
      const dy   = ty - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      // 出發邊緣座標（線從節點邊緣開始，不從圓心）
      const edgeX = src.x + nx * (src.radius + 3);
      const edgeY = src.y + ny * (src.radius + 3);

      // ── 底層寬光暈 ──
      g.lineStyle(12, lineColor, 0.12);
      g.beginPath(); g.moveTo(edgeX, edgeY); g.lineTo(tx, ty); g.strokePath();

      // ── 主線 ──
      g.lineStyle(4, lineColor, 0.82);
      g.beginPath(); g.moveTo(edgeX, edgeY); g.lineTo(tx, ty); g.strokePath();

      // ── 高亮細線（能量芯，增加深度感）──
      g.lineStyle(1.4, 0xFFFFFF, 0.30);
      g.beginPath(); g.moveTo(edgeX, edgeY); g.lineTo(tx, ty); g.strokePath();

      // ── 出發火花（節點邊緣的小亮點）──
      // 搭配出兵脈衝，視覺上強調「線從這裡冒出來」
      const sparkPulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.007 + src.id * 0.9));
      g.fillStyle(0xFFFFFF, sparkPulse * 0.90);
      g.fillCircle(edgeX, edgeY, 4);
      g.fillStyle(lineColor, sparkPulse * 0.70);
      g.fillCircle(edgeX, edgeY, 6);

      // ── 流動箭頭（間距稍縮短，方向感更強）──
      const flowOffset = (t * 0.1) % 32;
      let traveled = (src.radius + 3) + flowOffset;
      while (traveled < dist - 20) {
        this._drawFlowArrow(g, src.x + nx * traveled, src.y + ny * traveled, nx, ny, lineColor);
        traveled += 32;
      }
    }

    // ── 有效目標：脈衝環 + 終點箭頭 ──
    if (isValidTarget) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.005));
      g.lineStyle(3, lineColor, pulse * 0.75);
      g.strokeCircle(tNode.x, tNode.y, tNode.radius + 8);
      g.lineStyle(1.5, 0xFFFFFF, pulse * 0.4);
      g.strokeCircle(tNode.x, tNode.y, tNode.radius + 12);

      for (const src of this.selectedSourceNodes) {
        this._drawArrow(g, src.x, src.y, tNode.x, tNode.y, tNode.radius, lineColor);
      }

      // ── 來源數量徽章（多於 1 個時顯示）──
      if (this.selectedSourceNodes.size > 1) {
        const count = this.selectedSourceNodes.size;
        // 徽章圓底
        g.fillStyle(0x000000, 0.65);
        g.fillCircle(tx, ty - 22, 13);
        g.lineStyle(1.5, lineColor, 0.8);
        g.strokeCircle(tx, ty - 22, 13);
        // 文字由外部 Phaser Text 處理不到此，改用小點陣示意
        // （實際數字透過 GameScene 的 nodeTexts 機制無法插入此處）
        // 改：畫 count 個小方塊排排站
        for (let i = 0; i < count && i < 6; i++) {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const bx    = tx + Math.cos(angle) * 7;
          const by    = (ty - 22) + Math.sin(angle) * 7;
          g.fillStyle(lineColor, 0.85);
          g.fillRect(bx - 2, by - 2, 4, 4);
        }
      }
    }
  }

  // ── 私有繪圖輔助 ──────────────────────────────────────

  /** @returns {import('../entities/NodeBuilding.js').NodeBuilding|null} */
  _getNodeAt(px, py) {
    // 拖曳期間使用快取陣列，避免每次重新取得
    const nodes = this._dragNodes ?? this._getNodes();
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].containsPoint(px, py)) return nodes[i];
    }
    return null;
  }

  /** 沿路徑繪製方向小箭頭（流動動畫）*/
  _drawFlowArrow(g, cx, cy, nx, ny, color) {
    const size = 7;   // 比原先 6 稍大，方向感更清晰
    const px = cx + nx * size;
    const py = cy + ny * size;
    const ax = cx + (-ny * size * 0.55) - nx * size * 0.65;
    const ay = cy + ( nx * size * 0.55) - ny * size * 0.65;
    const bx = cx - (-ny * size * 0.55) - nx * size * 0.65;
    const by = cy - ( nx * size * 0.55) - ny * size * 0.65;
    // 主體
    g.fillStyle(color, 0.62);
    g.fillTriangle(px, py, ax, ay, bx, by);
    // 白色高光（讓箭頭更鮮明）
    g.fillStyle(0xFFFFFF, 0.18);
    g.fillTriangle(px, py, ax, ay, bx, by);
  }

  /** 在目標節點邊緣繪製終點箭頭（較大） */
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
      tip.x,                                               tip.y,
      tip.x - nx * (size + 4) + ny * (size + 4) * 0.55,   tip.y - ny * (size + 4) - nx * (size + 4) * 0.55,
      tip.x - nx * (size + 4) - ny * (size + 4) * 0.55,   tip.y - ny * (size + 4) + nx * (size + 4) * 0.55
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

/** 供外部讀取固定比例常數（GameScene._sendTroopsFromMultiple 使用） */
export { FIXED_RATIO };
