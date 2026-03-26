/**
 * LevelSelectScene.js - 關卡選擇場景
 *
 * 顯示 5 個關卡卡片，點擊後進入對應關卡。
 * 日後可加入「已解鎖」狀態（存進 localStorage）。
 */

import { LEVELS } from '../data/levels.js';

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#080D28');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── 標題列 ──
    const titleBar = this.add.graphics();
    titleBar.fillStyle(0x0A1840, 1);
    titleBar.fillRect(0, 0, W, 60);

    this.add.text(W / 2, 30, '選擇關卡', {
      fontSize: '26px',
      fontFamily: 'Arial Black, sans-serif',
      color:     '#FFFFFF',
    }).setOrigin(0.5);

    // ── 返回按鈕 ──
    const backTxt = this.add.text(16, 30, '◀ 返回', {
      fontSize: '16px',
      color:    '#7ABBFF',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    backTxt.on('pointerup', () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });

    // ── 說明文字 ──
    this.add.text(W / 2, 72, '點擊卡片進入關卡', {
      fontSize: '13px',
      color:    '#446688',
    }).setOrigin(0.5);

    // ── 關卡卡片 ──
    const cardW    = W * 0.84;
    const cardH    = 82;
    const startY   = 110;
    const gapY     = 94;

    LEVELS.forEach((lvl, i) => {
      const cx = W / 2;
      const cy = startY + i * gapY + cardH / 2;
      this._createLevelCard(cx, cy, cardW, cardH, lvl, i + 1);
    });

    // 底部裝飾
    this.add.text(W / 2, H - 18, '拖曳建築發兵  ·  右鍵切換送兵比例', {
      fontSize: '11px',
      color:    '#223344',
    }).setOrigin(0.5);
  }

  // ── 關卡卡片 ──────────────────────────────────────────

  _createLevelCard(cx, cy, cw, ch, level, num) {
    const halfW = cw / 2;
    const halfH = ch / 2;

    // 星星難度顏色映射
    const diffColors = ['#44CC88', '#88CC44', '#DDBB22', '#EE8833', '#EE4444'];

    const g = this.add.graphics();
    const drawCard = (hover) => {
      g.clear();
      g.fillStyle(hover ? 0x1A3A70 : 0x101C50, 1);
      g.fillRoundedRect(cx - halfW, cy - halfH, cw, ch, 10);
      g.lineStyle(2, hover ? 0x7ABBFF : 0x2A4A80, 1);
      g.strokeRoundedRect(cx - halfW, cy - halfH, cw, ch, 10);

      // 左側關卡號碼色塊
      g.fillStyle(hover ? 0x2A6ABF : 0x1A4A99, 1);
      g.fillRoundedRect(cx - halfW, cy - halfH, 58, ch, { tl: 10, tr: 0, br: 0, bl: 10 });
    };
    drawCard(false);

    // 關卡號
    this.add.text(cx - halfW + 29, cy, `${num}`, {
      fontSize:   '28px',
      fontFamily: 'Arial Black, sans-serif',
      color:      '#FFFFFF',
    }).setOrigin(0.5);

    // 關卡名稱
    this.add.text(cx - halfW + 70, cy - 14, level.name, {
      fontSize: '15px',
      color:    '#FFFFFF',
    }).setOrigin(0, 0.5);

    // 描述
    this.add.text(cx - halfW + 70, cy + 10, level.description, {
      fontSize: '12px',
      color:    '#6688AA',
    }).setOrigin(0, 0.5);

    // 難度星星
    const stars = '★'.repeat(num) + '☆'.repeat(5 - num);
    this.add.text(cx + halfW - 14, cy, stars, {
      fontSize: '13px',
      color:    diffColors[num - 1] || '#888888',
    }).setOrigin(1, 0.5);

    // 互動
    g.setInteractive(
      new Phaser.Geom.Rectangle(cx - halfW, cy - halfH, cw, ch),
      Phaser.Geom.Rectangle.Contains
    );
    g.on('pointerover',  () => drawCard(true));
    g.on('pointerout',   () => drawCard(false));
    g.on('pointerup', () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene', { levelId: level.id });
      });
    });
  }
}
