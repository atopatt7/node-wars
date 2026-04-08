/**
 * MenuScene.js — 主選單場景
 *
 * 設計主題：「KINGDOMS vs THE VOID」虛空金色中世紀
 * 佈局（1280×720）：
 *   左欄（0–540）：品牌標題 + 世界觀標語
 *   右欄（540–1280）：SELECT ACTION + 4個功能按鈕
 *   底部資訊列（H-44 到 H）：版權聲明
 *
 * 設計來源：Figma channel drbmfrco 【主選單】1280×720
 */

import { audioManager } from '../systems/AudioManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#080604');

    // ── L1: 背景氛圍層 ────────────────────────────────────────
    const bgGfx = this.add.graphics();

    // 中央暖暈（橫跨左右欄，低透明度）
    bgGfx.fillStyle(0x281a0c, 0.18);
    bgGfx.fillRect(200, 150, 880, 420);

    // 左側面板底色覆蓋（加深左欄以區分左右）
    bgGfx.fillStyle(0x0e0a06, 0.72);
    bgGfx.fillRect(0, 0, 540, H);

    // 右上角虛空暗影
    bgGfx.fillStyle(0x2d0f3f, 0.06);
    bgGfx.fillRect(900, 0, 380, 260);

    // ── L2: 框架金線裝飾 ──────────────────────────────────────
    const frameGfx = this.add.graphics();

    // 頂部金線
    frameGfx.fillStyle(0xb8922a, 0.60);
    frameGfx.fillRect(0, 0, W, 2);

    // 底部金線
    frameGfx.fillStyle(0xb8922a, 0.60);
    frameGfx.fillRect(0, H - 2, W, 2);

    // 左緣金條
    frameGfx.fillStyle(0xb8922a, 0.55);
    frameGfx.fillRect(0, 0, 4, H);

    // 右緣金條
    frameGfx.fillStyle(0xb8922a, 0.55);
    frameGfx.fillRect(W - 4, 0, 4, H);

    // 中央分界線
    frameGfx.fillStyle(0xb8922a, 0.30);
    frameGfx.fillRect(539, 40, 1, H - 80);

    // ── 底部資訊列 ─────────────────────────────────────────────
    const footerGfx = this.add.graphics();
    footerGfx.fillStyle(0x050402, 0.92);
    footerGfx.fillRect(0, H - 44, W, 44);
    footerGfx.fillStyle(0xb8922a, 0.20);
    footerGfx.fillRect(0, H - 44, W, 1);

    // ── 左欄：品牌與標題 ──────────────────────────────────────
    const LX = 56;

    // 章節標籤（小字）
    this.add.text(LX, 96, 'ANNO OBSCURUS · THE VOID CAMPAIGN', {
      fontSize:   '11px',
      fontFamily: 'Arial, sans-serif',
      color:      '#b8922a',
    }).setAlpha(0.50);

    // 主標題 KINGDOMS
    this.add.text(LX, 120, 'KINGDOMS', {
      fontSize:   '76px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color:      '#c9a84c',
    });

    // 副標題 vs THE VOID
    this.add.text(LX, 218, 'vs  T H E  V O I D', {
      fontSize:   '26px',
      fontFamily: 'Arial, sans-serif',
      color:      '#8b5aae',
    }).setAlpha(0.85);

    // 標題下分隔線
    const titleDiv = this.add.graphics();
    titleDiv.fillStyle(0xb8922a, 0.35);
    titleDiv.fillRect(LX, 258, 400, 1);

    // 世界觀標語
    this.add.text(LX, 278,
      '古老的虛空裂縫正在撕裂大地。\n領主，集結你的軍隊。王國的命運取決於此。', {
        fontSize:   '15px',
        fontFamily: 'Arial, sans-serif',
        color:      '#a89070',
        lineSpacing: 4,
      }).setAlpha(0.75);

    // 版本號（左下角）
    this.add.text(LX, H - 28, '版本 1.0.0  ·  Early Access', {
      fontSize: '11px',
      color:    '#8a6a22',
    }).setAlpha(0.40);

    // ── 右欄：導航按鈕 ────────────────────────────────────────
    // 按鈕中心 X = 750 + 320/2 = 910
    const RX    = 910;
    const BTN_W = 320;

    // "SELECT ACTION" 標籤
    this.add.text(RX, 202, 'SELECT ACTION', {
      fontSize:   '11px',
      fontFamily: 'Arial, sans-serif',
      color:      '#b8922a',
    }).setOrigin(0.5).setAlpha(0.40);

    // PRIMARY — 開始戰役（y=222, h=58, center=251）
    const btn0 = this._createButton(RX, 251, '⚔   開始戰役', BTN_W, 58, 'primary', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LevelSelectScene');
      });
    });

    // SECONDARY — 選擇關卡（y=296, h=54, center=323）
    const btn1 = this._createButton(RX, 323, '選擇關卡', BTN_W, 54, 'secondary', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LevelSelectScene');
      });
    });

    // SECONDARY — 軍備商店（y=366, h=54, center=393）
    const btn2 = this._createButton(RX, 393, '軍備商店', BTN_W, 54, 'secondary', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('ShopScene');
      });
    });

    // TERTIARY — 系統設定（y=436, h=54, center=463）
    const btn3 = this._createButton(RX, 463, '系統設定', BTN_W, 54, 'tertiary', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('SettingsScene', { from: 'MenuScene' });
      });
    });

    // 版權聲明（右下角）
    this.add.text(W - 20, H - 22,
      '© 2025 Dark Realm Studios · All Rights Reserved · 保留一切權利', {
        fontSize: '10px',
        color:    '#8a6a22',
      }).setOrigin(1, 0.5).setAlpha(0.35);

    // ── 按鈕入場交錯動畫（alpha 0→1, y+10→0, 220ms, 50ms stagger）─────
    const btns = [btn0, btn1, btn2, btn3];
    btns.forEach(({ g, label }, i) => {
      const baseY      = label.y;
      const finalAlpha = label.alpha;   // 儲存目標透明度（各按鈕 textAlpha 不同）
      g.setAlpha(0);
      label.setAlpha(0);
      label.setY(baseY + 10);

      this.tweens.add({
        targets:  g,
        alpha:    1,
        duration: 220,
        delay:    i * 50,
        ease:     'Quad.easeOut',
      });
      this.tweens.add({
        targets:  label,
        alpha:    finalAlpha,
        y:        baseY,
        duration: 220,
        delay:    i * 50,
        ease:     'Quad.easeOut',
      });
    });

    // 淡入
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  // ── 通用按鈕（支援 primary / secondary / tertiary）──────────

  /**
   * @param {number} x        按鈕中心 X
   * @param {number} y        按鈕中心 Y
   * @param {string} text     按鈕文字
   * @param {number} w        按鈕寬
   * @param {number} h        按鈕高
   * @param {string} type     'primary' | 'secondary' | 'tertiary'
   * @param {function} callback 點擊回調
   */
  _createButton(x, y, text, w, h, type, callback) {
    const g = this.add.graphics();

    // 各型別基礎外觀 Token
    const STYLES = {
      primary: {
        fill:        0xb8922a,
        border:      0xb8922a,
        borderAlpha: 1.00,
        textColor:   '#100b04',
        fontFamily:  'Arial Black, sans-serif',
        fontSize:    '19px',
        textAlpha:   1.0,
      },
      secondary: {
        fill:        0x18120a,
        border:      0xb8922a,
        borderAlpha: 0.45,
        textColor:   '#e8d9b8',
        fontFamily:  'Arial, sans-serif',
        fontSize:    '17px',
        textAlpha:   0.90,
      },
      tertiary: {
        fill:        0x0e0a05,
        border:      0x8a6a22,
        borderAlpha: 0.22,
        textColor:   '#a89070',
        fontFamily:  'Arial, sans-serif',
        fontSize:    '17px',
        textAlpha:   0.65,
      },
    };
    const s = STYLES[type] || STYLES.secondary;

    const drawBtn = (hover = false, pressed = false) => {
      g.clear();

      let fill = s.fill;
      if (hover && !pressed) {
        fill = Phaser.Display.Color.ValueToColor(fill).lighten(12).color;
      }
      if (pressed) {
        fill = Phaser.Display.Color.ValueToColor(fill).darken(18).color;
      }

      g.fillStyle(fill, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 3);

      if (type === 'primary' && !pressed) {
        // 頂部高光（Primary 專屬）
        g.fillStyle(0xffffff, 0.09);
        g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, Math.ceil(h * 0.38), 3);
      }
      if (pressed) {
        // 按壓內凹暗影
        g.fillStyle(0x000000, 0.14);
        g.fillRoundedRect(x - w / 2, y - h / 2, w, Math.ceil(h * 0.35), 3);
      }

      const bA = hover ? Math.min(1, s.borderAlpha + 0.28) : s.borderAlpha;
      const bW = hover ? 1.5 : 1;
      g.lineStyle(bW, s.border, bA);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    };
    drawBtn();

    const label = this.add.text(x, y, text, {
      fontSize:   s.fontSize,
      fontFamily: s.fontFamily,
      color:      s.textColor,
    }).setOrigin(0.5).setAlpha(s.textAlpha);

    g.setInteractive(
      new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );

    g.on('pointerdown', () => { drawBtn(false, true); label.setY(y + 2); label.setAlpha(s.textAlpha * 0.85); });
    g.on('pointerover', () => { drawBtn(true);        label.setY(y);     label.setAlpha(s.textAlpha); audioManager.play('ui_hover'); });
    g.on('pointerout',  () => { drawBtn(false);       label.setY(y);     label.setAlpha(s.textAlpha); });
    g.on('pointerup',   () => { drawBtn(false);       label.setY(y);     label.setAlpha(s.textAlpha); audioManager.play('ui_click'); callback(); });

    return { g, label };
  }
}
