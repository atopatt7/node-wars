/**
 * GameOverPanel.js — 遊戲結算面板
 *
 * 職責：
 *   - 建立勝利 / 失敗的遮罩與面板背景
 *   - 顯示主標題（🏆 勝利！/ 💀 失敗...）與副標題
 *   - 建立結算操作按鈕（重新開始、下一關、選關）
 *   - 處理按鈕點擊後的場景跳轉邏輯
 *
 * 不含任何遊戲邏輯。場景跳轉雖使用 Phaser scene API，
 * 但屬於 UI 層的導覽責任，不是遊戲規則。
 *
 * UIController 使用方式：
 *   const gameOverPanel = new GameOverPanel(scene, { levelId, levelCount });
 *   gameOverPanel.show(true);   // 勝利
 *   gameOverPanel.show(false);  // 失敗
 */

export class GameOverPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ levelId: number, levelCount: number }} config
   */
  constructor(scene, config) {
    this._scene  = scene;
    this._config = config;
  }

  // ── 公開 API ──────────────────────────────────────────

  /**
   * 顯示結算面板
   * @param {boolean} won - true = 勝利，false = 失敗
   */
  show(won) {
    const scene = this._scene;
    const W     = scene.cameras.main.width;
    const H     = scene.cameras.main.height;

    // 半透明全螢幕遮罩
    const overlay = scene.add.graphics().setDepth(50);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);

    // 面板背景
    const pW = W * 0.82;
    const pH = 230;
    const px = (W - pW) / 2;
    const py = (H - pH) / 2;

    const panel = scene.add.graphics().setDepth(51);
    panel.fillStyle(won ? 0x0B2E1A : 0x2E0B0B, 1);
    panel.fillRoundedRect(px, py, pW, pH, 16);
    panel.lineStyle(3, won ? 0x44FF88 : 0xFF4444, 1);
    panel.strokeRoundedRect(px, py, pW, pH, 16);

    // 主標題
    scene.add.text(W / 2, py + 52, won ? '🏆 勝利！' : '💀 失敗...', {
      fontSize:        '38px',
      fontFamily:      'Arial, sans-serif',
      color:           won ? '#44FF88' : '#FF4444',
      stroke:          '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(52);

    // 副標題
    scene.add.text(W / 2, py + 100, won ? '成功佔領所有敵方建築！' : '你的所有部隊已全滅…', {
      fontSize: '15px',
      color:    '#BBCCDD',
    }).setOrigin(0.5).setDepth(52);

    // ── 操作按鈕列 ──
    this._buildButtons(scene, won, px, py, pW, pH);
  }

  // ── 私有：建立結算按鈕列 ──────────────────────────────

  _buildButtons(scene, won, _px, py, _pW, _pH) {
    const { levelId, levelCount } = this._config;
    const hasNext = won && levelId < levelCount;
    const W       = scene.cameras.main.width;

    const btns = [];

    btns.push({
      text:  '重新開始',
      color: 0x2A5A99,
      cb:    () => {
        scene.cameras.main.fadeOut(200);
        scene.time.delayedCall(220, () => scene.scene.restart({ levelId }));
      },
    });

    if (hasNext) {
      btns.push({
        text:  '下一關 ▶',
        color: 0x1A7A3A,
        cb:    () => {
          scene.cameras.main.fadeOut(200);
          scene.time.delayedCall(220, () => scene.scene.start('GameScene', { levelId: levelId + 1 }));
        },
      });
    }

    btns.push({
      text:  '選關',
      color: 0x4A3A80,
      cb:    () => {
        scene.cameras.main.fadeOut(200);
        scene.time.delayedCall(220, () => scene.scene.start('LevelSelectScene'));
      },
    });

    const bW      = 110;
    const bH      = 44;
    const totalBW = btns.length * bW + (btns.length - 1) * 12;
    let   bx      = W / 2 - totalBW / 2 + bW / 2;

    for (const btn of btns) {
      this._createButton(scene, bx, py + 180, bW, bH, btn.text, btn.color, btn.cb);
      bx += bW + 12;
    }
  }

  // ── 私有：帶 hover 效果的圓角矩形按鈕 ────────────────

  /**
   * @param {Phaser.Scene} scene
   * @param {number}   x      中心 X
   * @param {number}   y      中心 Y
   * @param {number}   w      寬度
   * @param {number}   h      高度
   * @param {string}   text   標籤文字
   * @param {number}   color  填色（hex 數字）
   * @param {Function} cb     點擊回調
   */
  _createButton(scene, x, y, w, h, text, color, cb) {
    const g = scene.add.graphics().setDepth(53);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.setInteractive(
      new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    g.on('pointerover', () => {
      g.clear();
      g.fillStyle(Phaser.Display.Color.ValueToColor(color).lighten(20).color, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    });
    g.on('pointerout', () => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    });
    g.on('pointerup', cb);

    scene.add.text(x, y, text, {
      fontSize: '14px',
      color:    '#FFFFFF',
    }).setOrigin(0.5).setDepth(54);
  }
}
