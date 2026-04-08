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
   * @param {number|null} levelId  - 目前關卡 ID（傳給設定頁用）
   */
  constructor(scene, levelId = null) {
    this._scene     = scene;
    this._levelId   = levelId;
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

    // 面板背景（加高以容納設定按鈕）
    const pW = 240, pH = 168;
    const px = (W - pW) / 2;
    const py = (H - pH) / 2;
    const pg = scene.add.graphics();
    pg.fillStyle(0x0D2040, 1);
    pg.fillRoundedRect(px, py, pW, pH, 14);
    pg.lineStyle(2, 0x4A90E2, 0.8);
    pg.strokeRoundedRect(px, py, pW, pH, 14);

    // 標題文字
    const title = scene.add.text(W / 2, H / 2 - 46, '⏸ 遊戲暫停', {
      fontSize: '22px',
      color:    '#FFFFFF',
    }).setOrigin(0.5);

    // 提示文字
    const hint = scene.add.text(W / 2, H / 2 - 10, '再次點擊 ▶ 繼續', {
      fontSize: '14px',
      color:    '#6688AA',
    }).setOrigin(0.5);

    // ── 設定按鈕 ────────────────────────────────────────
    const btnW = 160, btnH = 38;
    const btnX = (W - btnW) / 2;
    const btnY = H / 2 + 22;

    const btnG = scene.add.graphics();
    const _drawSettingsBtn = (hover) => {
      btnG.clear();
      btnG.fillStyle(hover ? 0x1e3a6e : 0x152d5a, 1);
      btnG.fillRoundedRect(btnX, btnY, btnW, btnH, 8);
      btnG.lineStyle(1.5, hover ? 0x7ab3f0 : 0x4A90E2, 0.9);
      btnG.strokeRoundedRect(btnX, btnY, btnW, btnH, 8);
    };
    _drawSettingsBtn(false);

    const btnLabel = scene.add.text(W / 2, btnY + btnH / 2, '⚙ 系統設定', {
      fontSize: '15px',
      color:    '#AAD0FF',
    }).setOrigin(0.5);

    // 點擊區域
    const btnHitArea = scene.add.zone(W / 2, btnY + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    btnHitArea.on('pointerover',  () => _drawSettingsBtn(true));
    btnHitArea.on('pointerout',   () => _drawSettingsBtn(false));
    btnHitArea.on('pointerdown',  () => {
      scene.cameras.main.fadeOut(250, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', () => {
        scene.scene.start('SettingsScene', { from: 'GameScene', levelId: this._levelId });
      });
    });

    this._container.add([ov, pg, title, hint, btnG, btnLabel, btnHitArea]);
  }

  /**
   * 銷毀暫停面板（繼續遊戲時呼叫）
   */
  hide() {
    this._container?.destroy();
    this._container = null;
  }
}
