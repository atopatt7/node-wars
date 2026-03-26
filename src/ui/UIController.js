/**
 * UIController.js — 遊戲 UI 協調器（多來源集火版）
 *
 * 變更：
 *   - 移除底部「派兵比例」按鈕列（25% / 50% / 75% / 100%）
 *   - 底部改為顯示集火操作提示文字
 *   - updateRatioHighlight() 保留但為空操作（避免舊呼叫報錯）
 *
 * 職責：
 *   - 建立頂部 HUD（關卡名稱、暫停按鈕、返回選關）
 *   - 建立底部操作提示列
 *   - 協調 PausePanel + GameOverPanel
 */

import { HUD_TOP, HUD_BOTTOM } from '../config/layout.js';
import { PausePanel }          from './PausePanel.js';
import { GameOverPanel }       from './GameOverPanel.js';

// 重新匯出給外部仍依賴此路徑的模組使用（向後相容）
export { HUD_TOP, HUD_BOTTOM };

export class UIController {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   levelName:     string,
   *   levelId:       number,
   *   levelCount:    number,
   *   onPauseToggle: () => void,
   * }} config
   */
  constructor(scene, config) {
    this._scene  = scene;
    this._config = config;

    /** @private Phaser.GameObjects.Text */
    this._pauseText = null;

    // ── 子面板模組 ──
    this._pausePanel    = new PausePanel(scene);
    this._gameOverPanel = new GameOverPanel(scene, {
      levelId:    config.levelId,
      levelCount: config.levelCount,
    });
  }

  // ── 公開 API ──────────────────────────────────────────

  /** create 階段呼叫：建立頂部 HUD 與底部提示列 */
  setup() {
    this._createTopHUD();
    this._createBottomHint();
  }

  /**
   * 空操作，保留供舊程式呼叫（比例按鈕已移除）
   * @param {number} _selectedIndex
   */
  updateRatioHighlight(_selectedIndex) { /* 已移除比例按鈕 */ }

  /**
   * 同步暫停狀態（由 GameScene._togglePause 呼叫）
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

    // 暫停按鈕（右側）
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

  // ── 私有：底部操作提示列 ──────────────────────────────

  _createBottomHint() {
    if (HUD_BOTTOM <= 0) return;   // 如果底部高度為 0，不建立

    const scene = this._scene;
    const W     = scene.cameras.main.width;
    const H     = scene.cameras.main.height;
    const barY  = H - HUD_BOTTOM;

    // 背景條
    const bar = scene.add.graphics().setDepth(10);
    bar.fillStyle(0x000000, 0.45);
    bar.fillRect(0, barY, W, HUD_BOTTOM);

    // 左側圖示
    scene.add.text(14, barY + HUD_BOTTOM / 2, '⚔', {
      fontSize: '16px',
      color:    '#4A90E2',
    }).setOrigin(0, 0.5).setDepth(11);

    // 提示文字
    scene.add.text(W / 2, barY + HUD_BOTTOM / 2,
      '拖曳滑過多個據點可集火派兵（固定 50%）', {
      fontSize:   '12px',
      color:      '#778899',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(11);
  }
}
