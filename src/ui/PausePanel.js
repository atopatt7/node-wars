/**
 * PausePanel.js — 暫停面板
 *
 * 職責：
 *   - 建立暫停時顯示的遮罩、面板背景、提示文字
 *   - 管理自身的 Phaser Container 生命週期
 *
 * 不含任何遊戲邏輯或比例按鈕邏輯。
 * 暫停按鈕圖示（⏸ / ▶）的切換仍由 UIController 管理，
 * 因為那是頂部 HUD 的一部分，不屬於面板本身。
 *
 * UIController 使用方式：
 *   const pausePanel = new PausePanel(scene);
 *   pausePanel.show();   // 遊戲暫停時呼叫
 *   pausePanel.hide();   // 繼續遊戲時呼叫
 */

export class PausePanel {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this._scene     = scene;
    /** @private Phaser.GameObjects.Container | null */
    this._container = null;
  }

  // ── 公開 API ──────────────────────────────────────────

  /**
   * 建立並顯示暫停面板
   * 若已顯示則不重複建立
   */
  show() {
    if (this._container) return;

    const scene = this._scene;
    const W     = scene.cameras.main.width;
    const H     = scene.cameras.main.height;

    this._container = scene.add.container(0, 0).setDepth(40);

    // 半透明全螢幕遮罩
    const ov = scene.add.graphics();
    ov.fillStyle(0x000000, 0.55);
    ov.fillRect(0, 0, W, H);

    // 面板背景
    const pW = 220, pH = 120;
    const pg = scene.add.graphics();
    pg.fillStyle(0x0D2040, 1);
    pg.fillRoundedRect((W - pW) / 2, (H - pH) / 2, pW, pH, 14);
    pg.lineStyle(2, 0x4A90E2, 0.8);
    pg.strokeRoundedRect((W - pW) / 2, (H - pH) / 2, pW, pH, 14);

    // 標題文字
    const title = scene.add.text(W / 2, H / 2 - 20, '⏸ 遊戲暫停', {
      fontSize: '22px',
      color:    '#FFFFFF',
    }).setOrigin(0.5);

    // 提示文字
    const hint = scene.add.text(W / 2, H / 2 + 18, '再次點擊 ▶ 繼續', {
      fontSize: '14px',
      color:    '#6688AA',
    }).setOrigin(0.5);

    this._container.add([ov, pg, title, hint]);
  }

  /**
   * 銷毀暫停面板（繼續遊戲時呼叫）
   */
  hide() {
    this._container?.destroy();
    this._container = null;
  }
}
