/**
 * UIController.js — 遊戲 UI 協調器
 *
 * 職責（精簡後）：
 *   - 建立頂部 HUD（關卡名稱、暫停按鈕圖示、返回選關按鈕）
 *   - 建立底部送兵比例列與按鈕
 *   - 更新比例按鈕高亮狀態
 *   - 協調 PausePanel（show / hide）+ 維護暫停按鈕圖示
 *   - 委派 GameOverPanel.show() 顯示結算面板
 *
 * 不含面板的實作細節——全部交給子模組：
 *   PausePanel    → 暫停遮罩 + 面板 + 文字
 *   GameOverPanel → 結算遮罩 + 面板 + 標題 + 按鈕
 *
 * GameScene 呼叫介面（與舊版完全相同，GameScene 不需改動）：
 *   uiController.setup()
 *   uiController.updateRatioHighlight(idx)
 *   uiController.setPauseState(paused)
 *   uiController.showResult(won)
 */

import { SEND_RATIOS }        from '../config.js';
import { HUD_TOP, HUD_BOTTOM } from '../config/layout.js';
import { PausePanel }          from './PausePanel.js';
import { GameOverPanel }       from './GameOverPanel.js';

// 重新匯出給外部仍依賴此路徑的模組使用（向後相容）
export { HUD_TOP, HUD_BOTTOM };

export class UIController {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   levelName:         string,
   *   levelId:           number,
   *   levelCount:        number,
   *   onPauseToggle:     () => void,
   *   onRatioSelect:     (index: number) => void,
   *   initialRatioIndex: number,
   * }} config
   */
  constructor(scene, config) {
    this._scene  = scene;
    this._config = config;

    /** @private Phaser.GameObjects.Text — 暫停按鈕圖示（⏸ / ▶） */
    this._pauseText = null;
    /** @private Array<{g, bx, by, bW, bH, i}> */
    this._ratioBtns = [];

    // ── 子面板模組 ──
    this._pausePanel    = new PausePanel(scene);
    this._gameOverPanel = new GameOverPanel(scene, {
      levelId:    config.levelId,
      levelCount: config.levelCount,
    });
  }

  // ── 公開 API ──────────────────────────────────────────

  /** create 階段呼叫：一次性建立頂部 HUD 與底部比例列 */
  setup() {
    this._createTopHUD();
    this._createBottomBar();
  }

  /**
   * 更新底部比例按鈕高亮
   * 由 InputController.onRatioChanged callback 驅動
   * @param {number} selectedIndex
   */
  updateRatioHighlight(selectedIndex) {
    for (const { g, bx, by, bW, bH, i } of this._ratioBtns) {
      const sel = i === selectedIndex;
      g.clear();
      g.fillStyle(sel ? 0x2A6ABF : 0x1A2A44, 1);
      g.fillRoundedRect(bx - bW / 2, by - bH / 2, bW, bH, 7);
      if (sel) {
        g.lineStyle(2, 0x7ABBFF, 0.8);
        g.strokeRoundedRect(bx - bW / 2, by - bH / 2, bW, bH, 7);
      }
    }
  }

  /**
   * 同步暫停狀態 UI（由 GameScene._togglePause 呼叫）
   * 更新頂部暫停按鈕圖示，並委派 PausePanel 顯示/隱藏
   * @param {boolean} paused
   */
  setPauseState(paused) {
    if (paused) {
      this._pauseText?.setText('▶');
      this._pausePanel.show();
    } else {
      this._pauseText?.setText('⏸');
      this._pausePanel.hide();
    }
  }

  /**
   * 顯示遊戲結算面板（由 GameScene._gameOver 呼叫）
   * 完全委派 GameOverPanel 處理
   * @param {boolean} won
   */
  showResult(won) {
    this._gameOverPanel.show(won);
  }

  // ── 私有：頂部 HUD ────────────────────────────────────

  _createTopHUD() {
    const scene  = this._scene;
    const W      = scene.cameras.main.width;
    const { levelName, onPauseToggle } = this._config;

    // 背景條
    const bar = scene.add.graphics().setDepth(10);
    bar.fillStyle(0x000000, 0.55);
    bar.fillRect(0, 0, W, HUD_TOP);

    // 關卡名稱（左側）
    scene.add.text(14, HUD_TOP / 2, levelName, {
      fontSize: '15px',
      color:    '#AACCEE',
    }).setOrigin(0, 0.5).setDepth(11);

    // 暫停按鈕（右側）— 圖示切換由 setPauseState 管理
    this._pauseText = scene.add.text(W - 14, HUD_TOP / 2, '⏸', {
      fontSize: '22px',
      color:    '#FFFFFF',
    }).setOrigin(1, 0.5).setDepth(11).setInteractive({ useHandCursor: true });

    this._pauseText.on('pointerup', () => onPauseToggle());

    // 返回選關（中間）
    const backBtn = scene.add.text(W / 2, HUD_TOP / 2, '▼ 選關', {
      fontSize: '13px',
      color:    '#446688',
    }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    backBtn.on('pointerup', () => {
      scene.cameras.main.fadeOut(200);
      scene.cameras.main.once('camerafadeoutcomplete', () => {
        scene.scene.start('LevelSelectScene');
      });
    });
  }

  // ── 私有：底部比例列 ──────────────────────────────────

  _createBottomBar() {
    const scene  = this._scene;
    const W      = scene.cameras.main.width;
    const H      = scene.cameras.main.height;
    const { onRatioSelect, initialRatioIndex } = this._config;

    const barY = H - HUD_BOTTOM;

    // 背景條
    const bar = scene.add.graphics().setDepth(10);
    bar.fillStyle(0x000000, 0.55);
    bar.fillRect(0, barY, W, HUD_BOTTOM);

    scene.add.text(10, barY + HUD_BOTTOM / 2, '派兵:', {
      fontSize: '13px',
      color:    '#667788',
    }).setOrigin(0, 0.5).setDepth(11);

    // 4 個比例按鈕
    this._ratioBtns = [];
    const bW     = Math.floor((W - 60) / 4) - 6;
    const bH     = 38;
    const bBaseX = 52;

    SEND_RATIOS.forEach((ratio, i) => {
      const bx = bBaseX + i * (bW + 6) + bW / 2;
      const by = barY + HUD_BOTTOM / 2;

      const g   = scene.add.graphics().setDepth(11);
      const lbl = scene.add.text(bx, by, `${Math.round(ratio * 100)}%`, {
        fontSize: '15px',
        color:    '#FFFFFF',
      }).setOrigin(0.5).setDepth(12);

      g.setInteractive(
        new Phaser.Geom.Rectangle(bx - bW / 2, by - bH / 2, bW, bH),
        Phaser.Geom.Rectangle.Contains
      );
      g.on('pointerup', () => onRatioSelect(i));

      this._ratioBtns.push({ g, lbl, bx, by, bW, bH, i });
    });

    this.updateRatioHighlight(initialRatioIndex);
  }
}
