/**
 * GameScene.js - 核心戰鬥場景（協調器）
 *
 * 架構總覽：
 *   create()   → 初始化系統、載入關卡、設定輸入、建立 UI
 *   update()   → 生產 → 移動+戰鬥 → AI → 繪製 → 勝負判定
 *
 * 子系統分工：
 *   ProductionSystem  → 節點自動生兵
 *   MovementSystem    → 部隊移動 + 到達判定 + 呼叫 CombatSystem
 *   CombatSystem      → 戰鬥結算（由 MovementSystem callback 觸發）
 *   AISystem          → 敵方 AI 決策
 *   WinLoseSystem     → 勝負判定，回傳 'win' | 'lose' | null
 *   InputController   → 玩家輸入（拖曳、比例切換），callback 通知 GameScene
 *   UIController      → 所有 UI 建立與更新（HUD、比例按鈕、暫停、結算面板）
 *
 * GameScene 自身只負責：
 *   - 協調以上子系統的初始化與呼叫
 *   - 管理核心遊戲狀態（isGameOver / isPaused）
 *   - 每幀繪製遊戲世界（格線 / 部隊 / 節點 / 兵力文字）
 *   - 發兵邏輯（_sendTroops）
 */

import { NodeBuilding }    from '../entities/NodeBuilding.js';
import { TroopGroup }      from '../entities/TroopGroup.js';
import { AISystem }        from '../systems/AISystem.js';
import { CombatSystem }    from '../systems/CombatSystem.js';
import { InputController } from '../systems/InputController.js';
import { MovementSystem }  from '../systems/MovementSystem.js';
import { ProductionSystem }from '../systems/ProductionSystem.js';
import { WinLoseSystem }   from '../systems/WinLoseSystem.js';
import { UIController }             from '../ui/UIController.js';
import { HUD_TOP, HUD_BOTTOM }      from '../config/layout.js';
import { LEVELS }          from '../data/levels.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // ── 場景初始化（接收關卡 ID）──────────────────────────

  init(data) {
    this.levelId   = data?.levelId ?? 1;
    this.levelData = LEVELS.find(l => l.id === this.levelId) ?? LEVELS[0];
  }

  // ── create ────────────────────────────────────────────

  create() {
    // ── 遊戲狀態 ──
    /** @type {NodeBuilding[]} */
    this.nodes      = [];
    /** @type {TroopGroup[]} */
    this.troops     = [];
    this.isGameOver = false;
    this.isPaused   = false;

    // ── 遊戲系統 ──
    this.productionSystem = new ProductionSystem();
    this.movementSystem   = new MovementSystem();
    this.winLoseSystem    = new WinLoseSystem();
    this.aiSystem         = new AISystem(this.levelData.aiDifficulty ?? 'normal');
    this.combatSystem     = new CombatSystem();

    // ── 輸入控制器 ──
    this.inputController = new InputController(
      this,
      () => this.nodes,
      {
        onSendTroopsMulti: (fromNodes, to) => this._sendTroopsFromMultiple(fromNodes, to),
      }
    );

    // ── UI 控制器 ──
    this.uiController = new UIController(this, {
      levelName:     this.levelData.name,
      levelId:       this.levelId,
      levelCount:    LEVELS.length,
      onPauseToggle: () => this._togglePause(),
    });

    // ── 背景 + 主繪圖層 ──
    this.cameras.main.setBackgroundColor('#080D28');
    this._drawGrid();
    this.mainGraphics = this.add.graphics();

    // ── 關卡 + 輸入 + UI ──
    this._loadLevel();
    this.inputController.setup();
    this.uiController.setup();

    // 淡入
    this.cameras.main.fadeIn(350, 0, 0, 0);

    // 禁止右鍵選單（桌面）
    this.game.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── update（主循環）──────────────────────────────────

  update(_time, delta) {
    if (this.isGameOver || this.isPaused) return;

    // 1. 各節點生產單位
    this.productionSystem.update(delta, this.nodes);

    // 2+3. 部隊移動 → 到達判定 → 戰鬥結算
    this.troops = this.movementSystem.update(
      delta,
      this.troops,
      this.nodes,
      (troop, target) => this.combatSystem.resolve(troop, target)
    );

    // 4. AI 決策
    this.aiSystem.update(delta, this.nodes, (from, to, ratio) => {
      this._sendTroops(from, to, ratio);
    });

    // 5. 重繪動態層
    this._draw();

    // 6. 勝負判定
    if (!this.isGameOver) {
      const result = this.winLoseSystem.check(this.nodes, this.troops);
      if (result) this._gameOver(result === 'win');
    }
  }

  // ── 關卡載入 ──────────────────────────────────────────

  _loadLevel() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // 可用高度（扣除頂底 HUD，HUD_TOP / HUD_BOTTOM 由 UIController 匯出）
    const usableTop    = HUD_TOP    + 10;
    const usableBottom = H - HUD_BOTTOM - 10;
    const usableH      = usableBottom - usableTop;

    this.nodeTexts = [];

    for (const nd of this.levelData.nodes) {
      const px = nd.x * W;
      const py = usableTop + nd.y * usableH;

      const node = new NodeBuilding(nd.id, px, py, nd.type, nd.owner, nd.currentUnits);
      this.nodes.push(node);

      // 兵力數字文字（每幀更新內容）
      const txt = this.add.text(px, py, '', {
        fontSize:        '15px',
        fontFamily:      'Arial Black, sans-serif',
        color:           '#FFFFFF',
        stroke:          '#000000',
        strokeThickness: 3,
        resolution:      2,
      }).setOrigin(0.5).setDepth(5);

      this.nodeTexts.push({ nodeId: nd.id, txt });
    }

    // O(1) 查找表，供 _draw() 每幀使用（取代 O(n) find）
    this.nodeMap = new Map(this.nodes.map(n => [n.id, n]));
  }

  // ── 每幀繪製遊戲世界 ──────────────────────────────────

  _draw() {
    const g = this.mainGraphics;
    g.clear();

    // 拖曳預覽線（InputController 負責繪製）
    this.inputController.drawPreview(g);

    // 移動中的部隊
    for (const troop of this.troops) troop.draw(g);

    // 節點
    for (const node of this.nodes) node.draw(g);

    // 同步節點上方的兵力數字（O(1) Map 查找）
    for (const { nodeId, txt } of this.nodeTexts) {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        txt.setPosition(node.x, node.y);
        txt.setText(Math.floor(node.currentUnits).toString());
      }
    }
  }

  // ── 發兵（InputController 多來源 / AISystem callback）──

  /**
   * 單一來源派兵（AISystem 呼叫 / 內部共用）
   * @param {NodeBuilding} fromNode
   * @param {NodeBuilding} toNode
   * @param {number}       ratio  0..1
   */
  _sendTroops(fromNode, toNode, ratio) {
    const count = Math.floor(fromNode.currentUnits * ratio);
    if (count < 1) return;

    fromNode.currentUnits -= count;
    this.troops.push(new TroopGroup(fromNode, toNode, fromNode.owner, count));
  }

  /**
   * 多來源集火派兵（InputController 的 onSendTroopsMulti callback）
   * 固定 50% 比例，逐一呼叫 _sendTroops 處理每個來源節點
   * @param {NodeBuilding[]} fromNodes
   * @param {NodeBuilding}   toNode
   */
  _sendTroopsFromMultiple(fromNodes, toNode) {
    for (const fromNode of fromNodes) {
      this._sendTroops(fromNode, toNode, 0.5);
    }
  }

  // ── 暫停（狀態由 GameScene 持有，UI 委由 UIController）

  _togglePause() {
    this.isPaused = !this.isPaused;
    this.uiController.setPauseState(this.isPaused);
  }

  // ── 遊戲結束（判定由 WinLoseSystem，呈現委由 UIController）

  _gameOver(won) {
    this.isGameOver = true;
    this.uiController.showResult(won);
  }

  // ── 靜態背景格線（只畫一次）──────────────────────────

  _drawGrid() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const g    = this.add.graphics();
    const step = 44;
    g.lineStyle(1, 0x1A2844, 0.35);

    for (let x = 0; x <= W; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath();
    }
    for (let y = 0; y <= H; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath();
    }
  }
}
