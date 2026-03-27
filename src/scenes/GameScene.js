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

    // ── 被動效果浮動文字池 ──────────────────────────────────────
    // 預先建立固定數量的 Phaser Text 物件（物件池），
    // 避免每次戰鬥都動態 create/destroy，減少 GC 壓力。
    // _spawnFloatingText() 從池中取一個閒置的 slot 並啟動；
    // _updateFloatingTexts() 每幀推進動畫並回收過期的 slot。
    this._ftPool = [];
    for (let i = 0; i < 14; i++) {
      const obj = this.add.text(0, 0, '', {
        fontSize:        '17px',
        fontFamily:      'Arial Black, sans-serif',
        stroke:          '#000000',
        strokeThickness: 4,
        resolution:      2,
      }).setOrigin(0.5).setDepth(12).setVisible(false);
      this._ftPool.push({ obj, active: false, startY: 0, vy: 0, life: 0, maxLife: 0, initScale: 1.3 });
    }

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

    // 2+3. 部隊移動 → 到達判定 → 戰鬥結算 → 被動效果回饋
    // pendingFeedbacks 收集本幀所有戰鬥的回饋描述，
    // 在 movementSystem.update() 完成後統一處理（觸發節點閃光 + 浮動文字），
    // 不修改 MovementSystem 本身。
    const pendingFeedbacks = [];
    this.troops = this.movementSystem.update(
      delta,
      this.troops,
      this.nodes,
      (troop, target) => {
        const fb = this.combatSystem.resolve(troop, target);
        if (fb?.event) pendingFeedbacks.push(fb);
      }
    );
    for (const fb of pendingFeedbacks) {
      if (fb.event === 'capture') {
        // 佔領事件：播放擴散脈衝（triggerCapture），不播放被動效果閃光
        fb.node.triggerCapture();
      } else {
        // 被動效果事件（attacker_penalty / garrison_regen）
        fb.node.triggerEffect(fb.event);
      }
      this._spawnFloatingText(fb);       // 浮動文字（所有 event 類型共用）
    }

    // 3b. 更新浮動文字動畫
    this._updateFloatingTexts(delta);

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
        // 超載時文字變橙色，回到正常後恢復白色
        txt.setColor(node.currentUnits > node.maxUnits ? '#FFAA22' : '#FFFFFF');
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

  // ── 被動效果浮動文字 ──────────────────────────────────

  /**
   * 從池中取一個閒置 slot，設定浮動文字的初始狀態並啟動。
   * @param {{ event: string, node: NodeBuilding, x: number, y: number, value: number }} fb
   */
  _spawnFloatingText(fb) {
    const slot = this._ftPool.find(s => !s.active);
    if (!slot) return;  // 池已滿（同幀大量戰鬥），跳過

    let text, color, initScale, vy, maxLife;

    if (fb.event === 'attacker_penalty') {
      // Tower：紅色削弱數字
      text      = `-${fb.value}`;
      color     = '#FF4433';
      initScale = 1.3;
      vy        = -52;
      maxLife   = 1100;

    } else if (fb.event === 'garrison_regen') {
      // Castle：翠綠回復數字
      text      = `+${fb.value}`;
      color     = '#44EE88';
      initScale = 1.3;
      vy        = -52;
      maxLife   = 1100;

    } else if (fb.event === 'capture') {
      // 佔領：較大文字 + 陣營色 + 停留稍長
      // 顏色對應新主人陣營，讓玩家一眼感知 ownership 方向
      text = '占領';
      const captureColors = {
        player:  '#7BBFFF',   // 藍方佔領 → 藍白
        enemy:   '#FF7766',   // 紅方佔領 → 橙紅
        neutral: '#CCCCDD',   // 中立（理論上不應發生）
      };
      color     = captureColors[fb.newOwner] ?? '#FFFFFF';
      initScale = 1.7;        // 比被動效果文字大，更搶眼
      vy        = -65;        // 漂移稍快
      maxLife   = 1350;       // 停留稍長

    } else {
      return;
    }

    // 浮動起始點：節點正上方（建築頂部外側）
    const startY = fb.y - fb.node.radius - 14;

    slot.obj.setPosition(fb.x, startY);
    slot.obj.setText(text);
    slot.obj.setColor(color);
    slot.obj.setScale(initScale);
    slot.obj.setAlpha(1);
    slot.obj.setVisible(true);
    slot.startY   = startY;
    slot.vy       = vy;
    slot.life     = 0;
    slot.maxLife  = maxLife;
    slot.initScale = initScale;   // 記錄初始縮放，供 _updateFloatingTexts 計算彈出動畫
    slot.active   = true;
  }

  /**
   * 每幀更新所有活躍浮動文字的位置、縮放、透明度；
   * 壽命耗盡後回收回池。
   * @param {number} delta  幀間隔（ms）
   */
  _updateFloatingTexts(delta) {
    for (const slot of this._ftPool) {
      if (!slot.active) continue;

      slot.life += delta;
      if (slot.life >= slot.maxLife) {
        slot.active = false;
        slot.obj.setVisible(false);
        continue;
      }

      const t = slot.life / slot.maxLife;   // 0 → 1

      // 位置：向上漂移
      slot.obj.setY(slot.startY + slot.vy * (slot.life / 1000));

      // 縮放：0~15% 時從 initScale 快速收縮回 1.0，之後保持
      // initScale 依事件類型不同（攻擊: 1.3, 佔領: 1.7），彈出感等比例放大
      const is = slot.initScale ?? 1.3;
      const scale = t < 0.15 ? is - (t / 0.15) * (is - 1.0) : 1.0;
      slot.obj.setScale(scale);

      // 透明度：前 50% 保持不透明，後 50% 線性淡出
      const alpha = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5);
      slot.obj.setAlpha(alpha);
    }
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
