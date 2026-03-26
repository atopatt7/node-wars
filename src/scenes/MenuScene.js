/**
 * MenuScene.js - 主選單場景
 *
 * 包含：
 *   - 動態背景（星空 + 漂浮節點）
 *   - 遊戲標題
 *   - 「開始遊戲」按鈕
 */

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this._stars    = [];
    this._decoObjs = [];
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // ── 背景 ──
    this.cameras.main.setBackgroundColor('#080D28');
    this._createStarfield(W, H);

    // ── 裝飾節點 ──
    this._bgGraphics = this.add.graphics();
    this._createDecoNodes(W, H);

    // ── 標題 ──
    this.add.text(W / 2, H * 0.24, 'NODE WARS', {
      fontSize: '54px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#FFFFFF',
      stroke: '#1A5599',
      strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.34, '節點征服', {
      fontSize: '22px',
      fontFamily: 'Arial, sans-serif',
      color: '#7ABBFF',
      stroke: '#0A1540',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // ── 開始按鈕 ──
    this._createButton(W / 2, H * 0.56, '開始遊戲', 200, 56, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LevelSelectScene');
      });
    });

    // ── 提示文字（閃爍）──
    const hint = this.add.text(W / 2, H * 0.70, '點擊選取己方建築 → 拖曳到目標發兵', {
      fontSize: '14px',
      color: '#5577AA',
      align: 'center',
    }).setOrigin(0.5);

    this.tweens.add({
      targets:  hint,
      alpha:    0.1,
      duration: 1200,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1,
    });

    // ── 版本號 ──
    this.add.text(W - 10, H - 10, 'v1.0', {
      fontSize: '11px',
      color: '#334455',
    }).setOrigin(1, 1);

    // 淡入
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // ── 星空背景 ──────────────────────────────────────────

  _createStarfield(W, H) {
    const g = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = Math.random() < 0.2 ? 1.5 : 1;
      g.fillStyle(0xFFFFFF, 0.2 + Math.random() * 0.5);
      g.fillCircle(x, y, r);
    }
  }

  // ── 背景裝飾節點（模擬遊戲中的建築）──

  _createDecoNodes(W, H) {
    this._decoObjs = [
      { x: W * 0.12, y: H * 0.50, r: 22, col: 0x4A90E2, vy: -18 },
      { x: W * 0.88, y: H * 0.44, r: 18, col: 0xE24A4A, vy:  20 },
      { x: W * 0.50, y: H * 0.46, r: 14, col: 0x888899, vy: -14 },
      { x: W * 0.22, y: H * 0.72, r: 16, col: 0xE24A4A, vy:  16 },
      { x: W * 0.78, y: H * 0.76, r: 20, col: 0x4A90E2, vy: -20 },
    ];
    // 初次繪製（不需要逐幀更新）
    const g = this._bgGraphics;
    for (const n of this._decoObjs) {
      g.fillStyle(n.col, 0.18);
      g.fillCircle(n.x, n.y, n.r);
      g.lineStyle(2, n.col, 0.4);
      g.strokeCircle(n.x, n.y, n.r);
    }
  }

  // ── 通用按鈕 ──────────────────────────────────────────

  _createButton(x, y, text, w, h, callback, color = 0x2A6ABF) {
    const g = this.add.graphics();
    const drawBtn = (c) => {
      g.clear();
      g.fillStyle(c, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
      g.lineStyle(2, 0x7ABBFF, 0.6);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    };
    drawBtn(color);

    const label = this.add.text(x, y, text, {
      fontSize: '22px',
      fontFamily: 'Arial, sans-serif',
      color:     '#FFFFFF',
    }).setOrigin(0.5);

    // 互動區域
    g.setInteractive(
      new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    g.on('pointerover',  () => drawBtn(0x4A90E2));
    g.on('pointerout',   () => drawBtn(color));
    g.on('pointerup',    callback);

    return { g, label };
  }
}
