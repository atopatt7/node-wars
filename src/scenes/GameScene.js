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
import { SpellSystem }     from '../systems/SpellSystem.js';
import { WinLoseSystem }   from '../systems/WinLoseSystem.js';
import { ItemSystem }      from '../systems/ItemSystem.js';
import { audioManager }    from '../systems/AudioManager.js';
import { SaveSystem }      from '../systems/SaveSystem.js';
import { UIController }             from '../ui/UIController.js';
import { HUD_TOP, HUD_BOTTOM }      from '../config/layout.js';
import { SPELL_CONFIG, UPGRADE_CONFIG } from '../config.js';
import { LEVELS, CHAPTERS } from '../data/levels.js';

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
    // ── 行動裝置效能模式偵測 ──
    // 在 create() 而非 constructor() 偵測，確保 navigator 已就緒。
    this.isMobile =
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 2);

    // 每幀快取一次 Date.now()，避免在 draw/node/troop 中重複呼叫
    this._now = 0;

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
    this.aiSystem         = new AISystem(
      this.levelData.aiDifficulty ?? 'normal',
      this.levelData.aiStyle      ?? 'balanced',
    );
    this.combatSystem     = new CombatSystem();
    this.spellSystem      = new SpellSystem();
    this.itemSystem       = new ItemSystem(SaveSystem.getEquippedItems());

    // ── 輸入控制器 ──
    this.inputController = new InputController(
      this,
      () => this.nodes,
      {
        onSendTroopsMulti: (fromNodes, to) => this._sendTroopsFromMultiple(fromNodes, to),
        onUpgradeNode:     (node)          => this._tryUpgradeNode(node),
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
    this.cameras.main.setBackgroundColor('#080604');  // bg-void 基底（from Figma）
    this._drawBackground();   // L2 地表暖色 + L3 光暈/暗角（3層 Graphics）
    this._drawGrid();
    // 地面陰影層在格線之上、節點之下，關卡載入後繪製（見 _drawGroundShadows）
    this.groundGraphics = this.add.graphics();
    this.mainGraphics   = this.add.graphics();

    // ── 被動效果浮動文字池 ──────────────────────────────────────
    // 預先建立固定數量的 Phaser Text 物件（物件池），
    // 避免每次戰鬥都動態 create/destroy，減少 GC 壓力。
    // _spawnFloatingText() 從池中取一個閒置的 slot 並啟動；
    // _updateFloatingTexts() 每幀推進動畫並回收過期的 slot。
    this._ftPool = [];
    for (let i = 0; i < 14; i++) {
      const obj = this.add.text(0, 0, '', {
        fontSize:        '25px',           // was 17px（×1.5）
        fontFamily:      'Arial Black, sans-serif',
        stroke:          '#000000',
        strokeThickness: 5,               // was 4
        resolution:      2,
      }).setOrigin(0.5).setDepth(12).setVisible(false);
      this._ftPool.push({ obj, active: false, startY: 0, vy: 0, life: 0, maxLife: 0, initScale: 1.3 });
    }

    // ── 關卡開始計時（結算時顯示通關時間）──
    this._startTime = Date.now();

    // ── 防卡關：記錄本局之前的失敗次數（載入後才讀，避免誤計）──
    this._failCountBeforeStart = SaveSystem.getFailCount(this.levelId);

    // ── 關卡 + 輸入 + UI ──
    this._loadLevel();
    this._drawGroundShadows();   // 節點座標確定後才能畫地面橢圓（靜態，只畫一次）
    this.inputController.setup();
    this.uiController.setup();
    // 法術按鈕 callback（必須在 uiController.setup() 後，因為 _spellSlots 在那裡建立）
    this.uiController.setupSpells((spellId) => this._onSpellButtonClick(spellId));

    // 道具欄（若本局攜帶道具則顯示於底部 HUD 右側）
    this._createItemBar();

    // 右鍵取消待施放法術 / 道具
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) {
        if (this.spellSystem.getPendingSpell()) this.spellSystem.cancelPending();
        if (this.itemSystem.hasPendingItem())   { this.itemSystem.cancelPending(); this._updateItemBar(); }
      }
    });

    // 法術 / 道具施放：點擊節點時，依據待施放狀態決定執行法術還是使用道具
    this.input.on('pointerup', (ptr) => {
      if (ptr.rightButtonDown()) return;
      const node = this.nodes.find(n => n.containsPoint(ptr.x, ptr.y));
      if (!node) return;
      if (this.itemSystem.hasPendingItem()) {
        this._tryUseItem(node);
      } else if (this.spellSystem.getPendingSpell()) {
        this._tryCastSpell(node);
      }
    });

    // 淡入
    this.cameras.main.fadeIn(350, 0, 0, 0);

    // 關卡進場簡報（先暫停遊戲，相機淡入後顯示，約 1.8s 後自動退場）
    this._showLevelIntro();

    // 禁止右鍵選單（桌面）
    this.game.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── update（主循環）──────────────────────────────────

  update(_time, delta) {
    if (this.isGameOver || this.isPaused) return;

    // 每幀快取一次時間戳，供 node.draw() / troop.draw() / _drawSpellTargetHighlight() 共用，
    // 取代原本每個方法各自呼叫 Date.now() 的做法（可省下 50~100 次/幀）
    this._now = Date.now();

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
        const ownerBefore = target.owner;   // 結算前陣營
        const fb = this.combatSystem.resolve(troop, target);
        if (fb?.event) {
          pendingFeedbacks.push(fb);
        } else if (troop.owner !== ownerBefore && target.owner === ownerBefore) {
          // 防守成功且無被動效果（普通 Village 守住）→ 插入「擋住」回饋
          pendingFeedbacks.push({ event: 'defended', node: target, x: target.x, y: target.y, value: 0 });
        }
      }
    );
    for (const fb of pendingFeedbacks) {
      if (fb.event === 'capture') {
        // 佔領事件：播放擴散脈衝（triggerCapture），不播放被動效果閃光
        fb.node.triggerCapture();
        audioManager.play('capture');
      } else if (fb.event === 'defended') {
        // 防守成功（無被動）：藍白護盾彈開，600ms
        fb.node.triggerEffect('defended', 600);
        audioManager.play('defend');
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

    // 5. 法術系統更新（魔力回復 + 冷卻計時）
    this.spellSystem.update(delta);
    this.uiController.updateSpellBar(this.spellSystem);

    // 5b. 道具欄更新（只在有變化時重繪，由 _updateItemBar 內部判斷）
    this._updateItemBar();

    // 6. 重繪動態層
    this._draw();

    // 7. 勝負判定
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
    const usableTop    = HUD_TOP    + 15;   // 邊距隨解析度 ×1.5（10→15）
    const usableBottom = H - HUD_BOTTOM - 15;
    const usableH      = usableBottom - usableTop;

    this.nodeTexts = [];

    for (const nd of this.levelData.nodes) {
      const px = nd.x * W;
      const py = usableTop + nd.y * usableH;

      const node = new NodeBuilding(nd.id, px, py, nd.type, nd.owner, nd.currentUnits);
      this.nodes.push(node);

      // 兵力數字文字（每幀更新內容）
      const txt = this.add.text(px, py, '', {
        fontSize:        '22px',           // was 15px（×1.5，清晰度提升）
        fontFamily:      'Arial Black, sans-serif',
        color:           '#FFFFFF',
        stroke:          '#000000',
        strokeThickness: 4,               // was 3（描邊略加粗）
        resolution:      2,
      }).setOrigin(0.5).setDepth(5);

      // 升級費用提示文字（可升級時顯示在節點上方）
      const upgTxt = this.add.text(px, py, '', {
        fontSize:        '16px',           // was 11px（×1.5）
        fontFamily:      'Arial, sans-serif',
        color:           '#88FF44',
        stroke:          '#003300',
        strokeThickness: 3,               // was 2
        resolution:      2,
      }).setOrigin(0.5).setDepth(6).setVisible(false);

      // _lastUnitInt：上幀顯示的整數兵力值（-1 強制初次繪製）
      // 避免每幀都呼叫 setText() + toString()，只在數值改變時才更新。
      this.nodeTexts.push({ nodeId: nd.id, txt, upgTxt, _lastUnitInt: -1 });
    }

    // O(1) 查找表，供 _draw() 每幀使用（取代 O(n) find）
    this.nodeMap = new Map(this.nodes.map(n => [n.id, n]));

    // ── 防卡關：連敗 ≥ 2 次 → 玩家初始兵力 +10% ──────────────
    // 只在 hard 關卡啟動，通關後重置計數。
    // 讀的是 create() 時快照的 _failCountBeforeStart，
    // 確保不受本局失敗記錄影響。
    if (
      this._failCountBeforeStart >= 2 &&
      (this.levelData.aiDifficulty === 'hard')
    ) {
      this._antiFrustrationActive = true;
      for (const node of this.nodes) {
        if (node.owner === 'player') {
          node.currentUnits = Math.min(
            Math.ceil(node.currentUnits * 1.10),
            node.maxUnits
          );
        }
      }
      // 顯示提示（浮動文字，在 _ftPool 初始化後才能用）
      this.time.delayedCall(600, () => {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        this._spawnFloatingText({
          event:   'anti_frustration',
          x:       W / 2,
          y:       H * 0.36,
          value:   0,
          owner:   'player',
        });
      });
    } else {
      this._antiFrustrationActive = false;
    }
  }

  // ── 關卡進場簡報 ──────────────────────────────────────
  //
  // 在 create() 最後呼叫，效果如下：
  //   立即設 isPaused = true（AI / 生產 / 移動全停）
  //   → 等相機淡入（350ms）結束後顯示面板
  //   → 淡入 280ms → 停留 1350ms → 淡出 380ms
  //   → 銷毀面板，isPaused = false，遊戲正式開始
  //
  // 資料來源：this.levelData（.name / .strategyLabel / .landmark），
  // 無需任何新系統，純靠現有 Phaser Tween + Container + Graphics API。

  _showLevelIntro() {
    const ld      = this.levelData;
    const chapter = CHAPTERS[ld.phase] ?? null;

    // 章節開場：每章第一關（levels 1, 6, 11, 16, 21, 26）顯示章節標題面板，
    // 然後接著顯示關卡進場面板。其餘關卡只顯示關卡面板。
    const isChapterStart = (this.levelId - 1) % 5 === 0;

    // 立即凍結遊戲主循環
    this.isPaused = true;

    this.time.delayedCall(340, () => {
      if (isChapterStart && chapter) {
        this._showChapterBanner(chapter, () => this._showLevelPanel(ld, chapter));
      } else {
        this._showLevelPanel(ld, chapter);
      }
    });
  }

  /**
   * 章節開場橫幅（僅章節第一關顯示）。
   * 淡入 300ms → 停留 900ms → 淡出 250ms → 呼叫 done()
   *
   * 視覺強化：
   *   - 大型羅馬數字浮水印（低透明度，作為背景紋章）
   *   - 細內框裝飾邊（雙層框效果）
   *
   * 音效：
   *   - 播放 chapter_enter（上升琶音，神秘感）
   */
  _showChapterBanner(chapter, done) {
    const W  = this.cameras.main.width;
    const H  = this.cameras.main.height;
    const PW = Math.min(W * 0.88, 400);
    // 有 opening 引言時增高面板；否則維持原尺寸
    const hasOpening = !!chapter.opening;
    const PH = hasOpening ? 108 : 78;

    const ctr = this.add.container(W / 2, H * 0.25).setDepth(25).setAlpha(0);

    // 外框背景
    const bg = this.add.graphics();
    bg.fillStyle(0x0A0E18, 0.94);
    bg.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
    bg.lineStyle(1.5, 0x4A7ACC, 0.55);
    bg.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
    // 細內框裝飾（雙層框效果）
    bg.lineStyle(0.8, 0x4A7ACC, 0.22);
    bg.strokeRoundedRect(-PW / 2 + 4, -PH / 2 + 4, PW - 8, PH - 8, 9);
    ctr.add(bg);

    // 羅馬數字背景紋章（大字、極低透明度，作為浮水印）
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    const emblem = this.add.text(0, PH * 0.08, ROMAN[(chapter.num ?? 1) - 1] ?? '', {
      fontSize:   '72px',
      fontFamily: 'Georgia, "Times New Roman", serif',
      color:      '#4A7ACC',
    }).setOrigin(0.5).setAlpha(0.07);
    ctr.add(emblem);

    // 章節名稱
    ctr.add(this.add.text(0, -PH / 2 + 14, chapter.name, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif',
      color: '#A8C8FF',
    }).setOrigin(0.5, 0));

    // 章節副標
    ctr.add(this.add.text(0, -PH / 2 + 40, chapter.subtitle, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif',
      color: '#4A6A8A',
    }).setOrigin(0.5, 0));

    // 章節引言（opening）── 每章開場的一句敘事語
    // 以淡紫色斜體風格呈現，放在副標下方，傳達世界觀氛圍
    if (hasOpening) {
      // 分隔細線
      bg.lineStyle(0.6, 0x4A7ACC, 0.18);
      bg.beginPath();
      bg.moveTo(-PW * 0.35, -PH / 2 + 58);
      bg.lineTo( PW * 0.35, -PH / 2 + 58);
      bg.strokePath();

      ctr.add(this.add.text(0, -PH / 2 + 63, `「${chapter.opening}」`, {
        fontSize:   '11px',
        fontFamily: 'Arial, sans-serif',
        color:      '#8A78BB',
        wordWrap:   { width: PW - 32 },
        align:      'center',
      }).setOrigin(0.5, 0));
    }

    // 音效：chapter_enter（進章琶音）
    audioManager.play('chapter_enter');

    this.tweens.add({
      targets: ctr, alpha: 1, duration: 300, ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: ctr, alpha: 0, duration: 250, ease: 'Sine.easeIn',
            onComplete: () => { ctr.destroy(true); done(); },
          });
        });
      },
    });
  }

  /**
   * 關卡進場面板（每關都顯示）。
   * 淡入 280ms → 停留 1350ms → 淡出 380ms → isPaused = false
   */
  _showLevelPanel(ld, chapter) {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const hasLandmark = !!ld.landmark;
    const hasStrat    = !!ld.strategyLabel;
    const hasDesc     = !!ld.description;

    // 動態計算面板高度
    let PH = 40;
    if (hasLandmark) PH += 21;   // ★ 里程碑標籤
    PH += 28;                    // 關卡名稱
    if (hasDesc)    PH += 22;    // 世界觀短描述（14px，高度略增）
    if (chapter)    PH += 18;    // 章節小標（所有關卡顯示，協助定向）
    if (hasStrat)   PH += 22;    // 策略提示

    const PW = Math.min(W * 0.86, 390);
    const ctr = this.add.container(W / 2, H * 0.28).setDepth(25).setAlpha(0);

    const bg = this.add.graphics();
    bg.fillStyle(0x06101E, 0.91);
    bg.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
    bg.lineStyle(hasLandmark ? 1.8 : 1.2,
                 hasLandmark ? 0xFFCC22 : 0x3A6AB0, 0.88);
    bg.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
    ctr.add(bg);

    let curY = -PH / 2 + 14;

    if (hasLandmark) {
      ctr.add(this.add.text(0, curY, '★ 里程碑關卡', {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#FFCC22',
      }).setOrigin(0.5, 0));
      curY += 21;
    }

    ctr.add(this.add.text(0, curY, ld.name, {
      fontSize: '19px', fontFamily: 'Arial Black, sans-serif',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0));
    curY += 28;

    // 【世界觀短描述】（最多 20 字，傳達該關的敘事氛圍）
    if (hasDesc) {
      ctr.add(this.add.text(0, curY, ld.description, {
        fontSize: '14px', fontFamily: 'Arial, sans-serif',
        color: '#E0AAFF',
        stroke: '#220044', strokeThickness: 2,
      }).setOrigin(0.5, 0));
      curY += 22;
    }

    if (chapter) {
      ctr.add(this.add.text(0, curY, chapter.name, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#88BBEE',
      }).setOrigin(0.5, 0));
      curY += 18;
    }

    if (hasStrat) {
      ctr.add(this.add.text(0, curY, `💡 ${ld.strategyLabel}`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#D4A855',
      }).setOrigin(0.5, 0));
    }

    this.tweens.add({
      targets: ctr, alpha: 1, duration: 280, ease: 'Sine.easeOut',
      onComplete: () => {
        this.time.delayedCall(1350, () => {
          this.tweens.add({
            targets: ctr, alpha: 0, duration: 380, ease: 'Sine.easeIn',
            onComplete: () => {
              ctr.destroy(true);
              this.isPaused = false;
            },
          });
        });
      },
    });
  }

  // ── 每幀繪製遊戲世界 ──────────────────────────────────

  _draw() {
    const g = this.mainGraphics;
    g.clear();

    // 拖曳預覽線（InputController 負責繪製）
    this.inputController.drawPreview(g);

    // 移動中的部隊（傳入快取時間戳與行動裝置旗標，避免內部重複 Date.now()）
    for (const troop of this.troops) troop.draw(g, this._now, this.isMobile);

    // 節點（同上）
    for (const node of this.nodes) node.draw(g, this._now, this.isMobile);

    // ── 法術目標合法性高亮 ──────────────────────────────────
    // 等待施放時，在合法目標節點外圍畫脈衝光環，非法目標無提示。
    //   Haste / Fortify（targetType: 'own'）  → 高亮己方（player）節點
    //   Meteor（targetType: 'enemy'）          → 高亮敵方 + 中立節點
    // 光環顏色 = 各法術代表色（SPELL_CONFIG.color）
    // 光環繪製在所有節點之上，因此不需修改 NodeBuilding。
    this._drawSpellTargetHighlight(g);

    // ── 道具目標合法性高亮（金色脈衝環）──────────────────────
    this._drawItemTargetHighlight(g);

    // 同步節點上方的兵力數字 + 升級費用提示（O(1) Map 查找）
    for (const entry of this.nodeTexts) {
      const node = this.nodeMap.get(entry.nodeId);
      if (!node) continue;

      const { txt, upgTxt } = entry;
      txt.setPosition(node.x, node.y);

      // 效能優化：只有兵力整數值改變時才呼叫 setText()，
      // 避免每幀都建立新字串並觸發 Phaser 文字重繪。
      const unitInt = Math.floor(node.currentUnits);
      if (unitInt !== entry._lastUnitInt) {
        entry._lastUnitInt = unitInt;
        txt.setText(unitInt.toString());
      }
      // 超載時文字變橙色，回到正常後恢復白色
      txt.setColor(node.currentUnits > node.maxUnits ? '#FFAA22' : '#FFFFFF');

      // 升級費用提示：僅對玩家節點、可升級時顯示
      if (upgTxt) {
        const canShow = node.owner === 'player' && node.level < 3;
        if (canShow) {
          const cfg  = UPGRADE_CONFIG[node.type];
          const cost = cfg.costs[node.level - 1];
          if (node.currentUnits >= cost) {
            upgTxt.setText(`↑ -${cost}`);
            upgTxt.setPosition(node.x, node.y - node.radius - 22);
            upgTxt.setVisible(true);
          } else {
            upgTxt.setVisible(false);
          }
        } else {
          upgTxt.setVisible(false);
        }
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

    // 出兵瞬間脈衝：玩家出兵時啟用增強版（更亮、更大、更有體感）
    fromNode.triggerSendPulse(fromNode.owner === 'player');

    // 音效：只在玩家出兵時播放（AI 出兵不播，避免雜音）
    if (fromNode.owner === 'player') {
      audioManager.play('send_troop');
    }
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

  // ── 節點升級（雙擊己方節點觸發）─────────────────────────

  /**
   * 嘗試升級節點。若成功，顯示升級浮動文字 + 金色閃光（由 NodeBuilding 自己處理）。
   * @param {NodeBuilding} node
   */
  _tryUpgradeNode(node) {
    if (this.isGameOver || this.isPaused) return;
    if (!node.upgrade()) return;  // upgrade() 內部處理兵力扣除 + 屬性提升 + triggerUpgrade()

    audioManager.play('upgrade');

    // 浮動升級文字（顯示費用與新等級）
    this._spawnFloatingText({
      event:    'upgrade',
      node,
      x:        node.x,
      y:        node.y,
      value:    node.level,   // 升級後的等級
    });
  }

  // ── 法術系統 ──────────────────────────────────────────────

  /**
   * 玩家點擊法術按鈕時由 UIController callback 觸發。
   * 若法術不可施放（冷卻中/魔力不足），浮動提示文字閃紅色。
   * @param {string} spellId
   */
  _onSpellButtonClick(spellId) {
    if (this.isGameOver || this.isPaused) return;
    const res = this.spellSystem.selectSpell(spellId);
    // 不可施放時：顯示原因提示（魔力不足 / 冷卻）
    if (!res.ok && res.reason) {
      const msgMap = { no_mana: '魔力不足', cooldown: '冷卻中' };
      const msg    = msgMap[res.reason] ?? '無法施放';
      // 找到一個假節點位置：用法術按鈕文字上方（借用螢幕中央底部）
      const W = this.cameras.main.width;
      const H = this.cameras.main.height;
      this._spawnFloatingText({
        event: 'spell_invalid',
        node:  { x: W / 2, y: H - 80, radius: 0 },
        x:     W / 2,
        y:     H - 80,
        value: 0,
        msg,
      });
    }
  }

  /**
   * 玩家在待施放狀態下點擊節點時觸發。
   * cast() 驗證目標類型，成功則播放視覺 + 音效 + 浮動文字。
   * @param {NodeBuilding} node
   */
  _tryCastSpell(node) {
    if (this.isGameOver || this.isPaused) return;
    const spellId = this.spellSystem.getPendingSpell();
    if (!spellId) return;

    const result = this.spellSystem.cast(spellId, node);

    if (!result.success) {
      // 無效目標：浮動紅字 + 輕微鏡頭震動
      this._spawnFloatingText({
        event: 'spell_invalid',
        node,
        x:     node.x,
        y:     node.y,
        value: 0,
        msg:   '目標無效',
      });
      this.cameras.main.shake(90, 0.003);
      return;
    }

    // ── 成功施放 ──
    // Meteor 追加強力鏡頭震動 + 音效
    if (spellId === 'METEOR') {
      this.cameras.main.shake(180, 0.010);
      audioManager.play('meteor');
    } else if (spellId === 'HASTE') {
      audioManager.play('haste');
    } else if (spellId === 'FORTIFY') {
      audioManager.play('fortify');
    }

    // 浮動文字回饋
    this._spawnFloatingText({
      event: result.event,
      node:  result.node,
      x:     result.node.x,
      y:     result.node.y,
      value: result.value,
    });
  }

  // ── 暫停（狀態由 GameScene 持有，UI 委由 UIController）

  _togglePause() {
    this.isPaused = !this.isPaused;
    this.uiController.setPauseState(this.isPaused);
  }

  // ── 遊戲結束（判定由 WinLoseSystem，呈現委由 UIController）

  _gameOver(won) {
    this.isGameOver = true;

    // 計算通關耗時（秒，無條件捨去）
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);

    // 音效（勝利時依事件重量選擇：chapter_clear > landmark > win）
    if (!won) {
      audioManager.play('lose');
    } else if (this.levelId % 5 === 0) {
      audioManager.play('chapter_clear');   // 章節完成（5/10/15/20/25/30）
    } else if (this.levelData.landmark) {
      audioManager.play('landmark');        // 里程碑通關（6/11/16/21/26）
    } else {
      audioManager.play('win');             // 一般勝利
    }

    if (won) {
      // 勝利：記錄完成進度，並重置失敗計數（防卡關機制歸零）
      SaveSystem.markCompleted(this.levelId);
      SaveSystem.resetFailCount(this.levelId);
    } else {
      // 失敗：hard 關卡記錄失敗次數，供下次進入時觸發防卡關
      if (this.levelData.aiDifficulty === 'hard') {
        SaveSystem.recordFailure(this.levelId);
      }
    }

    // ── 戰役強化結算資料 ────────────────────────────────────
    const nextLevelData = won
      ? LEVELS.find(l => l.id === this.levelId + 1) ?? null
      : null;

    const chapter = CHAPTERS[this.levelData.phase] ?? null;

    const isChapterEnd = this.levelId % 5 === 0;   // levels 5,10,15,20,25,30

    const extraData = {
      levelName:     this.levelData.name,
      isLandmark:    !!this.levelData.landmark,
      chapterName:   chapter?.name ?? null,
      isChapterEnd:  isChapterEnd,
      // 章節結語：章節最後一關勝利時顯示（失敗時不顯示）
      chapterEnding: (won && isChapterEnd) ? (chapter?.ending ?? null) : null,
      nextLevel:  nextLevelData ? {
        name:          nextLevelData.name,
        strategyLabel: nextLevelData.strategyLabel ?? null,
      } : null,
    };

    this.uiController.showResult(won, elapsed, extraData);
  }

  // ── 被動效果浮動文字 ──────────────────────────────────

  /**
   * 從池中取一個閒置 slot，設定浮動文字的初始狀態並啟動。
   * @param {{ event: string, node: NodeBuilding, x: number, y: number, value: number }} fb
   */
  _spawnFloatingText(fb) {
    // 效能優化：用 for 迴圈取代 Array.find()，避免每次呼叫都建立 arrow function 閉包
    let slot = null;
    for (let _i = 0; _i < this._ftPool.length; _i++) {
      if (!this._ftPool[_i].active) { slot = this._ftPool[_i]; break; }
    }
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

    } else if (fb.event === 'defended') {
      // 普通防守成功：藍白「擋住」提示
      text      = '擋住';
      color     = '#99AAFF';
      initScale = 1.25;
      vy        = -48;
      maxLife   = 900;

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

    } else if (fb.event === 'upgrade') {
      // 升級：金色大字，停留較長
      text      = `▲ Lv.${fb.value}`;
      color     = '#FFD700';
      initScale = 1.8;
      vy        = -75;
      maxLife   = 1500;

    } else if (fb.event === 'spell_haste') {
      // 急行：藍色閃電 + 持續秒數
      text      = `⚡ +${fb.value}s`;
      color     = '#66CCFF';
      initScale = 1.6;
      vy        = -70;
      maxLife   = 1300;

    } else if (fb.event === 'spell_meteor') {
      // 隕石：橙紅傷害數字
      text      = `☄ -${fb.value}`;
      color     = '#FF7733';
      initScale = 1.7;
      vy        = -70;
      maxLife   = 1300;

    } else if (fb.event === 'spell_fortify') {
      // 強化：金黃盾牌 + 持續秒數
      text      = `🛡 +${fb.value}s`;
      color     = '#FFDD44';
      initScale = 1.6;
      vy        = -70;
      maxLife   = 1300;

    } else if (fb.event === 'spell_invalid') {
      // 無效目標 / 無法施放：紅色短暫提示
      text      = fb.msg ?? '無效';
      color     = '#FF4444';
      initScale = 1.4;
      vy        = -45;
      maxLife   = 900;

    } else if (fb.event === 'anti_frustration') {
      // 防卡關：金色提示「兵力加強 +10%」
      text      = '⚡ 兵力已加強 +10%';
      color     = '#FFCC22';
      initScale = 1.5;
      vy        = -55;
      maxLife   = 2200;

    } else if (fb.event === 'item_fortify') {
      // 鐵衛壁壘：金色盾牌 + 持續秒數
      text      = `⛨ 防禦+${fb.value}s`;
      color     = '#c9a84c';
      initScale = 1.6;
      vy        = -70;
      maxLife   = 1300;

    } else if (fb.event === 'item_slow') {
      // 龍息火油：橙色火焰 + 持續秒數
      text      = `🔥 緩速${fb.value}s`;
      color     = '#FF7722';
      initScale = 1.6;
      vy        = -70;
      maxLife   = 1300;

    } else if (fb.event === 'item_block') {
      // 虛空封印：紫色 + 持續秒數
      text      = `◈ 封鎖${fb.value}s`;
      color     = '#9B5AEE';
      initScale = 1.6;
      vy        = -70;
      maxLife   = 1300;

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

  // ── 法術目標合法性高亮 ────────────────────────────────
  //
  // 僅在有待施放法術時執行。
  // 對每個節點判斷是否為合法目標，是則疊加一個脈衝雙環。
  //
  // 雙環設計：
  //   外環（r + 22）：淡色，輪廓感
  //   內環（r + 16）：稍亮，焦點感
  //   填充（r + 16）：低透明度色塊，讓合法目標在畫面上「站出來」
  //
  // 非法目標不做任何處理（不畫暗色遮罩），保持畫面整潔。
  // ─────────────────────────────────────────────────────
  _drawSpellTargetHighlight(g) {
    const pendingId = this.spellSystem?.getPendingSpell();
    if (!pendingId) return;

    const cfg   = SPELL_CONFIG[pendingId];
    if (!cfg) return;

    // 使用每幀快取的時間戳（_now 在 update() 頂部設定），避免重複 Date.now()
    const t     = this._now || Date.now();
    // 慢速呼吸脈衝（與節點本身的動畫頻率不同，更容易被注意到）
    const pulse = 0.50 + 0.50 * Math.abs(Math.sin(t * 0.0038));

    for (const node of this.nodes) {
      // ── 合法目標判定 ──
      const isValid = cfg.targetType === 'own'
        ? node.owner === 'player'           // Haste / Fortify → 己方節點
        : node.owner !== 'player';          // Meteor → 敵方 + 中立節點

      if (!isValid) continue;

      const r = node.radius;

      // 淡色填充（低透明，讓整個節點區域有「被選中候選」的感覺）
      g.fillStyle(cfg.color, pulse * 0.09);
      g.fillCircle(node.x, node.y, r + 16);

      // 外環（虛線感：寬度較細）
      g.lineStyle(1.5, cfg.color, pulse * 0.55);
      g.strokeCircle(node.x, node.y, r + 22);

      // 內環（主要提示環，稍粗稍亮）
      g.lineStyle(2.5, cfg.color, pulse * 0.88);
      g.strokeCircle(node.x, node.y, r + 16);
    }
  }

  // ── 節點地面橢圓陰影（關卡載入後只畫一次）──────────────
  //
  // 每個節點下方疊一個壓扁橢圓，模擬「建築物坐落在土地上」的接地感。
  //   顏色：#2E2010（比背景稍暗）
  //   Alpha：0.30（半透明，疊在格線之上仍見底色）
  //   形狀：寬度 = radius × 2.2、高度 = radius × 0.55（扁平橢圓）
  //   位置：Y 偏移 +radius × 0.35，讓橢圓落在建築底部而非正中央
  //
  // 這一層為靜態（節點不移動），只在關卡載入時呼叫一次，無 per-frame 開銷。
  // ────────────────────────────────────────────────────
  _drawGroundShadows() {
    const g = this.groundGraphics;
    g.clear();

    for (const node of this.nodes) {
      const rx = node.radius * 1.1;   // 橢圓半長軸（x）
      const ry = node.radius * 0.28;  // 橢圓半短軸（y）
      const cy = node.y + node.radius * 0.38;  // 中心偏往底部

      g.fillStyle(0x2E2010, 0.30);
      g.fillEllipse(node.x, cy, rx * 2, ry * 2);
    }
  }

  // ── 三層靜態背景（from Figma 【戰場背景】1280×720）────────
  //
  // 無任何圖片資產，全部以 Graphics fillStyle + fillRect/fillEllipse 實現。
  // Layer 1 = camera.setBackgroundColor('#080604')（在 create 中完成）
  // Layer 2 = 地表暖色微亮 + 裂紋暗帶（極低透明度，製造土地感）
  // Layer 3 = 中央暖暈 + 虛空暗影 + 四角暗暈（≤28%）+ 底部加深帶
  //
  // 座標來源：Figma absoluteBoundingBox - 框架絕對位置(4480,0)
  //           → 轉換為相對座標（每個值皆減去 4480）
  // ─────────────────────────────────────────────────────────
  _drawBackground() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // ── Layer 2：地表暖色地帶 ────────────────────────────────
    const l2 = this.add.graphics();

    // 中央微亮土色（x=180, y=160, 920×400）
    l2.fillStyle(0x322312, 0.06);
    l2.fillRect(180, 160, 920, 400);

    // 左側偏深地帶（x=0, y=100, 400×520）
    l2.fillStyle(0x0e0a06, 0.05);
    l2.fillRect(0, 100, 400, 520);

    // 右側微涼地帶（x=880, y=80, 400×560）
    l2.fillStyle(0x060408, 0.05);
    l2.fillRect(880, 80, 400, 560);

    // 裂紋A — 對角深色帶（近似矩形，x≈0, y=180, 900×265）
    l2.fillStyle(0x000000, 0.04);
    l2.fillRect(0, 180, 900, 265);

    // 裂紋B — 右側斜紋（x=500, y=180, 780×179）
    l2.fillStyle(0x000000, 0.03);
    l2.fillRect(500, 180, 780, 179);

    // 裂紋C — 中下橫帶（x=97, y=460, 1083×125）
    l2.fillStyle(0x0e0a05, 0.04);
    l2.fillRect(97, 460, 1083, 125);

    // 下方泥土深色（x=0, y=500, 1280×220）
    l2.fillStyle(0x080502, 0.07);
    l2.fillRect(0, 500, W, 220);

    // ── Layer 3：中央光暈 + 虛空暗影 + 四角暗暈 ────────────
    const l3 = this.add.graphics();

    // 中央暖暈（主光）— 橢圓 center(640,360) 800×500
    l3.fillStyle(0x38230e, 0.13);
    l3.fillEllipse(640, 360, 800, 500);

    // 中央暖暈（核心聚焦）— 橢圓 center(640,360) 500×300
    l3.fillStyle(0x42280e, 0.08);
    l3.fillEllipse(640, 360, 500, 300);

    // 右上角虛空暗影 — 橢圓 center(1040,120) 560×400
    l3.fillStyle(0x2d0e45, 0.055);
    l3.fillEllipse(1040, 120, 560, 400);

    // 四角暗暈（各 320×320，alpha 28%，製造邊緣漸暗視覺框）
    l3.fillStyle(0x080604, 0.28);
    l3.fillRect(0,       0,       320, 320);   // 左上
    l3.fillRect(W - 320, 0,       320, 320);   // 右上
    l3.fillRect(0,       H - 320, 320, 320);   // 左下
    l3.fillRect(W - 320, H - 320, 320, 320);   // 右下

    // 底部加深帶（x=0, y=580, 1280×140，alpha 22%）
    l3.fillStyle(0x060402, 0.22);
    l3.fillRect(0, 580, W, 140);
  }

  // ── 靜態背景格線（只畫一次）──────────────────────────

  _drawGrid() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    const g    = this.add.graphics();
    const step = 44;
    // 暖棕格線：顏色 #2A1E0E，alpha 降低至 0.18 → 若隱若現，像羊皮紙紋路
    g.lineStyle(1, 0x2A1E0E, 0.18);

    for (let x = 0; x <= W; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath();
    }
    for (let y = 0; y <= H; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath();
    }
  }

  // ── 道具欄 HUD（底部右側，最多 3 格）────────────────────
  //
  // 布局：位於底部法術欄右方，法術按鈕佔 W*[0.22,0.50,0.78]，
  // 道具槽從 W-194 起排列（60px 間距），右對齊至 W-40。
  // 僅在本局攜帶道具（equippedItems 非空）時顯示；
  // 若本局未帶任何道具，_itemBarG 保持 null，所有方法空操作。
  // ──────────────────────────────────────────────────────

  _createItemBar() {
    const activeItems = this.itemSystem.getActiveItems();
    if (activeItems.length === 0) {
      // 本局未帶任何道具，不建立 UI
      this._itemBarG      = null;
      this._itemIconTexts = null;
      this._itemNameTexts = null;
      this._itemZones     = null;
      this._itemSlotX     = null;
      return;
    }

    const W    = this.cameras.main.width;
    const H    = this.cameras.main.height;
    const btnY = H - 51;   // 與法術按鈕同一高度

    // 3 個槽的 X 中心（右對齊，間距 68px）
    this._itemSlotX = [W - 194, W - 126, W - 58];
    this._itemSlotY = btnY;

    // 分隔線（法術欄與道具欄之間）
    const divG = this.add.graphics().setDepth(11);
    divG.lineStyle(1, 0xb8922a, 0.25);
    divG.beginPath();
    divG.moveTo(W - 222, H - HUD_BOTTOM + 4);
    divG.lineTo(W - 222, H - 6);
    divG.strokePath();

    // 「道具」小標籤
    this.add.text(W - 208, H - HUD_BOTTOM + 6, '道具', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#b8922a',
    }).setOrigin(0, 0).setAlpha(0.55).setDepth(11);

    // 道具圖示 + 名稱文字（3 個固定槽）
    this._itemBarG      = this.add.graphics().setDepth(12);
    this._itemIconTexts = [];
    this._itemNameTexts = [];
    this._itemZones     = [];

    for (let i = 0; i < 3; i++) {
      const x = this._itemSlotX[i];

      const iconTxt = this.add.text(x, btnY, '', {
        fontSize: '22px',
      }).setOrigin(0.5).setDepth(14);

      const nameTxt = this.add.text(x, btnY + 36, '', {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#c9a84c',
      }).setOrigin(0.5).setDepth(14);

      const zone = this.add.zone(x, btnY, 58, 58).setDepth(16).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => {
        const items = this.itemSystem.getActiveItems();
        if (i < items.length) this._onItemButtonClick(items[i]);
      });

      this._itemIconTexts.push(iconTxt);
      this._itemNameTexts.push(nameTxt);
      this._itemZones.push(zone);
    }

    this._prevItemState = null;   // dirty flag
    this._updateItemBar();
  }

  /**
   * 每幀呼叫：若道具欄狀態改變則重繪（dirty flag 最佳化）。
   * 無道具欄時（_itemBarG === null）為空操作。
   */
  _updateItemBar() {
    if (!this._itemBarG) return;

    const items     = this.itemSystem.getActiveItems();
    const pendingId = this.itemSystem.getPendingItem();

    // 用 JSON 做 dirty 判斷（items 少量，開銷可忽略）
    const stateKey = JSON.stringify(items) + '|' + (pendingId ?? '');
    if (stateKey === this._prevItemState) return;
    this._prevItemState = stateKey;

    this._itemBarG.clear();

    for (let i = 0; i < 3; i++) {
      const x      = this._itemSlotX[i];
      const y      = this._itemSlotY;
      const itemId = items[i] ?? null;
      const isPend = itemId && itemId === pendingId;

      if (!itemId) {
        // 空槽
        this._itemBarG.fillStyle(0x0e0b07, 0.75);
        this._itemBarG.fillCircle(x, y, 26);
        this._itemBarG.lineStyle(1, 0x3a2e1a, 0.45);
        this._itemBarG.strokeCircle(x, y, 26);
        this._itemIconTexts[i].setText('');
        this._itemNameTexts[i].setText('');
        continue;
      }

      const data   = this.itemSystem.getItemData(itemId);
      const fill   = isPend ? 0xb8922a : 0x1a1108;
      const border = isPend ? 0xffd070 : 0x8a6a22;
      const bAlpha = isPend ? 1.0      : 0.75;

      // 選取時：額外外圈光環
      if (isPend) {
        this._itemBarG.lineStyle(1.5, 0xffd070, 0.35);
        this._itemBarG.strokeCircle(x, y, 32);
      }

      this._itemBarG.fillStyle(fill, 1);
      this._itemBarG.fillCircle(x, y, 26);
      this._itemBarG.lineStyle(isPend ? 2.5 : 1.5, border, bAlpha);
      this._itemBarG.strokeCircle(x, y, 26);

      this._itemIconTexts[i].setText(data?.badge ?? '◈').setAlpha(1);
      // 名稱截短至 4 字避免溢出
      const shortName = (data?.name ?? itemId).slice(0, 4);
      this._itemNameTexts[i].setText(shortName).setAlpha(isPend ? 1 : 0.75);
    }
  }

  // ── 道具按鈕點擊 ─────────────────────────────────────────

  _onItemButtonClick(itemId) {
    if (this.isGameOver || this.isPaused) return;
    // 選取道具時取消待施放法術（兩者互斥）
    if (this.spellSystem.getPendingSpell()) this.spellSystem.cancelPending();
    this.itemSystem.selectItem(itemId);
    this._updateItemBar();
  }

  // ── 道具使用 ─────────────────────────────────────────────

  /**
   * 玩家在待施放道具狀態下點擊節點時觸發。
   * @param {import('../entities/NodeBuilding.js').NodeBuilding} node
   */
  _tryUseItem(node) {
    if (this.isGameOver || this.isPaused) return;

    const result = this.itemSystem.useItem(node);
    if (!result) return;

    if (!result.success) {
      this._spawnFloatingText({
        event: 'spell_invalid',
        node,
        x:     node.x,
        y:     node.y,
        value: 0,
        msg:   result.reason === 'not_implemented' ? '尚未實作' : '目標無效',
      });
      this.cameras.main.shake(90, 0.003);
      this._updateItemBar();
      return;
    }

    // ── 成功使用 ──
    if (result.event === 'item_fortify')  audioManager.play('fortify');
    else if (result.event === 'item_slow')  audioManager.play('haste');    // 借用正面音效
    else if (result.event === 'item_block') audioManager.play('meteor');   // 借用負面音效

    this._spawnFloatingText({
      event: result.event,
      node:  result.node,
      x:     result.node.x,
      y:     result.node.y,
      value: result.value,
    });
    this._updateItemBar();
  }

  // ── 道具目標合法性高亮（金色脈衝環）────────────────────
  //
  // 等待施放道具時，在合法目標節點外圍疊加金/銅色脈衝光環，
  // 視覺語言與法術高亮保持一致但使用金色區分道具來源。
  // ────────────────────────────────────────────────────

  _drawItemTargetHighlight(g) {
    if (!this.itemSystem) return;
    const pendingId = this.itemSystem.getPendingItem();
    if (!pendingId) return;

    const targetType = this.itemSystem.getTargetType(pendingId);
    const t          = this._now || Date.now();
    const pulse      = 0.50 + 0.50 * Math.abs(Math.sin(t * 0.0042));

    for (const node of this.nodes) {
      const isValid = targetType === 'own'
        ? node.owner === 'player'
        : node.owner !== 'player';   // enemy 或 neutral

      if (!isValid) continue;

      const r = node.radius;

      // 金/銅色填充光暈
      g.fillStyle(0xb8922a, pulse * 0.10);
      g.fillCircle(node.x, node.y, r + 16);

      // 外環（金色輪廓）
      g.lineStyle(1.5, 0xb8922a, pulse * 0.55);
      g.strokeCircle(node.x, node.y, r + 22);

      // 內環（亮金，主要提示環）
      g.lineStyle(2.5, 0xffd070, pulse * 0.88);
      g.strokeCircle(node.x, node.y, r + 16);
    }
  }
}
