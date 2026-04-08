/**
 * SettingsScene.js — 系統設定場景
 *
 * 風格完全沿用現有「中世紀虛空金色框架」設計語言
 * （同 MenuScene / ShopScene / LevelSelectScene）。
 *
 * 設定項目：
 *   1. 主音量  (masterVolume 0~100, 分段按鈕)
 *   2. UI 音效開關  (uiSoundEnabled)
 *   3. 遊戲音效開關 (gameSoundEnabled)
 *   4. 低特效模式  (lowEffectsEnabled)
 *   5. 重置進度    (確認後清除所有遊戲存檔)
 *
 * 進入方式：
 *   - MenuScene「系統設定」按鈕 → 直接 scene.start('SettingsScene', { from: 'MenuScene' })
 *   - GameScene 暫停面板「設定」按鈕 → scene.start('SettingsScene', { from: 'GameScene', levelId })
 *
 * 返回：
 *   - from='MenuScene' → 回主選單
 *   - from='GameScene' → 回 GameScene（重新載入同關）
 */

import { SaveSystem }   from '../systems/SaveSystem.js';
import { audioManager } from '../systems/AudioManager.js';

// ── 佈局常數 ────────────────────────────────────────────────────
const HEADER_H = 72;
const FOOTER_H = 44;
const ROW_H    = 58;       // 每列設定高度
const ROW_GAP  = 10;
const PANEL_W  = 720;
const PANEL_X_CENTER = 640; // 畫面中央

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  init(data) {
    /** 返回目標（'MenuScene' | 'GameScene'） */
    this._fromScene = data?.from   ?? 'MenuScene';
    /** 若從 GameScene 進入，記住 levelId 以便返回 */
    this._levelId   = data?.levelId ?? null;
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#080604');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // 讀取目前設定
    this._settings = SaveSystem.getSettings();

    this._drawBackground(W, H);
    this._drawHeader(W, H);
    this._drawFooter(W, H);
    this._drawSettingsPanel(W, H);
  }

  // ────────────────────────────────────────────────────────
  // 背景
  // ────────────────────────────────────────────────────────

  _drawBackground(W, H) {
    const g = this.add.graphics();

    // 基底暗色中央暈
    g.fillStyle(0x1a0e06, 0.22);
    g.fillRect(120, 60, W - 240, H - 120);

    // 頂部金線
    g.fillStyle(0xb8922a, 0.60);
    g.fillRect(0, 0, W, 2);

    // 底部金線
    g.fillStyle(0xb8922a, 0.60);
    g.fillRect(0, H - 2, W, 2);

    // 左緣金條
    g.fillStyle(0xb8922a, 0.55);
    g.fillRect(0, 0, 4, H);

    // 右緣金條
    g.fillStyle(0xb8922a, 0.55);
    g.fillRect(W - 4, 0, 4, H);
  }

  // ────────────────────────────────────────────────────────
  // 頁首
  // ────────────────────────────────────────────────────────

  _drawHeader(W, H) {
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x050402, 0.95);
    g.fillRect(0, 0, W, HEADER_H);
    g.fillStyle(0xb8922a, 0.25);
    g.fillRect(0, HEADER_H - 1, W, 1);

    // 返回按鈕
    const backG = this.add.graphics().setDepth(11);
    const backDraw = (hover = false) => {
      backG.clear();
      backG.fillStyle(hover ? 0x2a1e0e : 0x18120a, 1);
      backG.fillRoundedRect(20, 18, 90, 36, 4);
      backG.lineStyle(1, 0x8a6a22, hover ? 0.65 : 0.35);
      backG.strokeRoundedRect(20, 18, 90, 36, 4);
    };
    backDraw();

    const backTxt = this.add.text(65, 36, '← 返回', {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#a89070',
    }).setOrigin(0.5).setDepth(11).setAlpha(0.80);

    backG.setInteractive(
      new Phaser.Geom.Rectangle(20, 18, 90, 36),
      Phaser.Geom.Rectangle.Contains
    ).setDepth(12);
    backG.on('pointerover', () => { backDraw(true); backTxt.setAlpha(1); audioManager.play('ui_hover'); });
    backG.on('pointerout',  () => { backDraw(false); backTxt.setAlpha(0.80); });
    backG.on('pointerup',   () => { audioManager.play('ui_click'); this._goBack(); });

    // 標題
    this.add.text(W / 2, 24, '系統設定', {
      fontSize: '26px', fontFamily: 'Arial Black, sans-serif', color: '#c9a84c',
    }).setOrigin(0.5, 0).setDepth(10);

    this.add.text(W / 2, 54, 'SETTINGS  ·  SYSTEM CONTROL', {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#b8922a',
    }).setOrigin(0.5, 0).setDepth(10).setAlpha(0.40);
  }

  // ────────────────────────────────────────────────────────
  // 頁尾
  // ────────────────────────────────────────────────────────

  _drawFooter(W, H) {
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x050402, 0.92);
    g.fillRect(0, H - FOOTER_H, W, FOOTER_H);
    g.fillStyle(0xb8922a, 0.20);
    g.fillRect(0, H - FOOTER_H, W, 1);

    this.add.text(W / 2, H - FOOTER_H / 2, '設定自動儲存  ·  重置進度將清除所有遊戲紀錄', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8a6a22',
    }).setOrigin(0.5).setDepth(10).setAlpha(0.55);
  }

  // ────────────────────────────────────────────────────────
  // 設定面板
  // ────────────────────────────────────────────────────────

  _drawSettingsPanel(W, H) {
    const numRows     = 5;
    const totalHeight = numRows * ROW_H + (numRows - 1) * ROW_GAP;
    const panelTop    = HEADER_H + (H - HEADER_H - FOOTER_H - totalHeight) / 2;

    const panelG = this.add.graphics().setDepth(8);
    panelG.fillStyle(0x0a0704, 0.85);
    panelG.fillRoundedRect(
      (W - PANEL_W) / 2, panelTop - 16,
      PANEL_W, totalHeight + 32, 8
    );
    panelG.lineStyle(1, 0x3a2a0a, 0.50);
    panelG.strokeRoundedRect(
      (W - PANEL_W) / 2, panelTop - 16,
      PANEL_W, totalHeight + 32, 8
    );
    // 頂部金條
    panelG.fillStyle(0xb8922a, 0.50);
    panelG.fillRect((W - PANEL_W) / 2, panelTop - 16, PANEL_W, 2);

    const rows = [
      () => this._rowVolume(W, panelTop + 0 * (ROW_H + ROW_GAP)),
      () => this._rowToggle(W, panelTop + 1 * (ROW_H + ROW_GAP),
              'UI 音效',   '按鈕 / 懸停提示音',
              this._settings.uiSoundEnabled,
              (v) => {
                this._settings.uiSoundEnabled = v;
                audioManager.setUIEnabled(v);
                SaveSystem.setSettings({ uiSoundEnabled: v });
              }),
      () => this._rowToggle(W, panelTop + 2 * (ROW_H + ROW_GAP),
              '遊戲音效',  '派兵 / 佔領 / 法術等',
              this._settings.gameSoundEnabled,
              (v) => {
                this._settings.gameSoundEnabled = v;
                audioManager.setGameEnabled(v);
                SaveSystem.setSettings({ gameSoundEnabled: v });
              }),
      () => this._rowToggle(W, panelTop + 3 * (ROW_H + ROW_GAP),
              '低特效模式', '減少節點持續特效（適合較舊設備）',
              this._settings.lowEffectsEnabled,
              (v) => {
                this._settings.lowEffectsEnabled = v;
                window.__lowEffectsMode = v;     // 全域旗標，GameScene.isMobile 讀取
                SaveSystem.setSettings({ lowEffectsEnabled: v });
              }),
      () => this._rowResetProgress(W, panelTop + 4 * (ROW_H + ROW_GAP)),
    ];

    rows.forEach(fn => fn());

    // 分隔線（最後一項之上）
    const sepY = panelTop + 3.5 * (ROW_H + ROW_GAP) + ROW_H / 2;
    const divG = this.add.graphics().setDepth(9);
    divG.lineStyle(1, 0x3a2a0a, 0.60);
    divG.beginPath();
    divG.moveTo((W - PANEL_W) / 2 + 20, sepY);
    divG.lineTo((W + PANEL_W) / 2 - 20, sepY);
    divG.strokePath();
  }

  // ────────────────────────────────────────────────────────
  // 音量列（5 段分段按鈕：0 / 25 / 50 / 75 / 100）
  // ────────────────────────────────────────────────────────

  _rowVolume(W, rowY) {
    this._rowLabel(W, rowY, '主音量', '影響所有遊戲音效音量');

    const steps    = [0, 25, 50, 75, 100];
    const btnW     = 52;
    const btnH     = 30;
    const gap      = 8;
    const totalW   = steps.length * btnW + (steps.length - 1) * gap;
    const startX   = (W + PANEL_W) / 2 - 24 - totalW;

    const curVol   = this._settings.masterVolume;
    const graphics = [];
    const texts    = [];

    const redraw = () => {
      const cur = this._settings.masterVolume;
      steps.forEach((v, i) => {
        const active = v === cur;
        const gx     = startX + i * (btnW + gap);
        const g      = graphics[i];
        g.clear();
        g.fillStyle(active ? 0xb8922a : 0x18120a, 1);
        g.fillRoundedRect(gx, rowY + (ROW_H - btnH) / 2, btnW, btnH, 4);
        g.lineStyle(1, active ? 0xffd070 : 0x4a3a1a, active ? 1 : 0.45);
        g.strokeRoundedRect(gx, rowY + (ROW_H - btnH) / 2, btnW, btnH, 4);
        texts[i].setColor(active ? '#100b04' : '#a89070');
        texts[i].setAlpha(active ? 1 : 0.65);
      });
    };

    steps.forEach((v, i) => {
      const gx = startX + i * (btnW + gap);
      const g  = this.add.graphics().setDepth(12);
      graphics.push(g);

      const t = this.add.text(
        gx + btnW / 2,
        rowY + ROW_H / 2,
        v === 0 ? '靜音' : `${v}`,
        { fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#a89070' }
      ).setOrigin(0.5).setDepth(13);
      texts.push(t);

      g.setInteractive(
        new Phaser.Geom.Rectangle(gx, rowY + (ROW_H - btnH) / 2, btnW, btnH),
        Phaser.Geom.Rectangle.Contains
      ).setDepth(14);
      g.on('pointerover', () => audioManager.play('ui_hover'));
      g.on('pointerup', () => {
        this._settings.masterVolume = v;
        audioManager.setMasterVolume(v);
        SaveSystem.setSettings({ masterVolume: v });
        redraw();
        if (v > 0) audioManager.play('ui_click');
      });
    });

    redraw();
  }

  // ────────────────────────────────────────────────────────
  // 開關列（ON / OFF 切換按鈕）
  // ────────────────────────────────────────────────────────

  _rowToggle(W, rowY, name, subLabel, initialValue, onChange) {
    this._rowLabel(W, rowY, name, subLabel);

    let value    = initialValue;
    const btnW   = 70;
    const btnH   = 32;
    const gap    = 8;
    const rx     = (W + PANEL_W) / 2 - 24 - (btnW * 2 + gap);

    const gOn  = this.add.graphics().setDepth(12);
    const gOff = this.add.graphics().setDepth(12);
    const tOn  = this.add.text(rx + btnW / 2, rowY + ROW_H / 2, 'ON',
      { fontSize: '13px', fontFamily: 'Arial Black, sans-serif' }).setOrigin(0.5).setDepth(13);
    const tOff = this.add.text(rx + btnW + gap + btnW / 2, rowY + ROW_H / 2, 'OFF',
      { fontSize: '13px', fontFamily: 'Arial Black, sans-serif' }).setOrigin(0.5).setDepth(13);

    const draw = () => {
      const by = rowY + (ROW_H - btnH) / 2;

      gOn.clear();
      gOn.fillStyle(value ? 0x1a5c28 : 0x18120a, 1);
      gOn.fillRoundedRect(rx, by, btnW, btnH, 4);
      gOn.lineStyle(1.5, value ? 0x44ee88 : 0x3a2a0a, value ? 0.90 : 0.35);
      gOn.strokeRoundedRect(rx, by, btnW, btnH, 4);
      tOn.setColor(value ? '#44EE88' : '#4a3a1a').setAlpha(value ? 1 : 0.40);

      gOff.clear();
      gOff.fillStyle(!value ? 0x3a1010 : 0x18120a, 1);
      gOff.fillRoundedRect(rx + btnW + gap, by, btnW, btnH, 4);
      gOff.lineStyle(1.5, !value ? 0xff4444 : 0x3a2a0a, !value ? 0.90 : 0.35);
      gOff.strokeRoundedRect(rx + btnW + gap, by, btnW, btnH, 4);
      tOff.setColor(!value ? '#FF5544' : '#4a3a1a').setAlpha(!value ? 1 : 0.40);
    };
    draw();

    const by = rowY + (ROW_H - btnH) / 2;
    gOn.setInteractive(
      new Phaser.Geom.Rectangle(rx, by, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    ).setDepth(14);
    gOn.on('pointerover', () => audioManager.play('ui_hover'));
    gOn.on('pointerup',   () => {
      if (value) return;
      value = true; onChange(true); draw();
      audioManager.play('ui_click');
    });

    gOff.setInteractive(
      new Phaser.Geom.Rectangle(rx + btnW + gap, by, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    ).setDepth(14);
    gOff.on('pointerover', () => audioManager.play('ui_hover'));
    gOff.on('pointerup',   () => {
      if (!value) return;
      value = false; onChange(false); draw();
      audioManager.play('ui_click');
    });
  }

  // ────────────────────────────────────────────────────────
  // 重置進度列
  // ────────────────────────────────────────────────────────

  _rowResetProgress(W, rowY) {
    this._rowLabel(W, rowY, '重置進度', '清除所有關卡進度與道具紀錄（無法復原）');

    const btnW = 160;
    const btnH = 34;
    const bx   = (W + PANEL_W) / 2 - 24 - btnW;
    const by   = rowY + (ROW_H - btnH) / 2;

    const g = this.add.graphics().setDepth(12);
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(hover ? 0x5a1010 : 0x2a0808, 1);
      g.fillRoundedRect(bx, by, btnW, btnH, 4);
      g.lineStyle(1.5, hover ? 0xff5544 : 0x8a2222, 0.80);
      g.strokeRoundedRect(bx, by, btnW, btnH, 4);
    };
    draw();

    const t = this.add.text(bx + btnW / 2, rowY + ROW_H / 2, '⚠ 重置進度', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#FF5544',
    }).setOrigin(0.5).setDepth(13).setAlpha(0.85);

    g.setInteractive(
      new Phaser.Geom.Rectangle(bx, by, btnW, btnH),
      Phaser.Geom.Rectangle.Contains
    ).setDepth(14);
    g.on('pointerover', () => { draw(true); t.setAlpha(1); audioManager.play('ui_hover'); });
    g.on('pointerout',  () => { draw(false); t.setAlpha(0.85); });
    g.on('pointerup',   () => {
      audioManager.play('ui_click');
      this._showResetConfirm(W, this.cameras.main.height);
    });
  }

  // ────────────────────────────────────────────────────────
  // 重置確認模態對話框
  // ────────────────────────────────────────────────────────

  _showResetConfirm(W, H) {
    // 全螢幕遮罩
    const ov = this.add.graphics().setDepth(30);
    ov.fillStyle(0x000000, 0.68);
    ov.fillRect(0, 0, W, H);
    ov.setInteractive();  // 吸收點擊

    const PW = 480, PH = 210;
    const panel = this.add.container(W / 2, H / 2).setDepth(31);

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0704, 1);
    bg.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 8);
    bg.lineStyle(2, 0x8a2222, 0.80);
    bg.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, 8);
    bg.fillStyle(0xcc2222, 0.60);
    bg.fillRect(-PW / 2, -PH / 2, PW, 2);
    panel.add(bg);

    panel.add(this.add.text(0, -PH / 2 + 24, '⚠ 確認重置進度', {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#FF5544',
    }).setOrigin(0.5, 0));

    panel.add(this.add.text(0, -PH / 2 + 64,
      '此操作將清除：\n關卡進度、貨幣、持有道具、裝備紀錄\n\n此操作無法復原！', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif',
        color: '#a89070', align: 'center', lineSpacing: 4,
      }).setOrigin(0.5, 0));

    const close = () => { ov.destroy(); panel.destroy(true); };

    const BTN_Y = PH / 2 - 36;

    // 取消按鈕
    const cancelG = this.add.graphics();
    cancelG.fillStyle(0x18120a, 1);
    cancelG.fillRoundedRect(-PW / 2 + 24, BTN_Y - 20, 140, 40, 4);
    cancelG.lineStyle(1, 0x4a3a1a, 0.50);
    cancelG.strokeRoundedRect(-PW / 2 + 24, BTN_Y - 20, 140, 40, 4);
    const cancelTxt = this.add.text(-PW / 2 + 24 + 70, BTN_Y, '取消', {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#8a6a22',
    }).setOrigin(0.5);
    cancelG.setInteractive(
      new Phaser.Geom.Rectangle(-PW / 2 + 24, BTN_Y - 20, 140, 40),
      Phaser.Geom.Rectangle.Contains
    );
    cancelG.on('pointerup', () => { audioManager.play('ui_click'); close(); });
    panel.add([cancelG, cancelTxt]);

    // 確認重置按鈕
    const confirmG = this.add.graphics();
    confirmG.fillStyle(0x5a1010, 1);
    confirmG.fillRoundedRect(PW / 2 - 24 - 160, BTN_Y - 20, 160, 40, 4);
    confirmG.lineStyle(1.5, 0xff4444, 0.85);
    confirmG.strokeRoundedRect(PW / 2 - 24 - 160, BTN_Y - 20, 160, 40, 4);
    const confirmTxt = this.add.text(PW / 2 - 24 - 80, BTN_Y, '確認重置', {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#FF5544',
    }).setOrigin(0.5);
    confirmG.setInteractive(
      new Phaser.Geom.Rectangle(PW / 2 - 24 - 160, BTN_Y - 20, 160, 40),
      Phaser.Geom.Rectangle.Contains
    );
    confirmG.on('pointerup', () => {
      audioManager.play('ui_click');
      SaveSystem.resetProgress();
      close();
      // 返回主選單
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });
    panel.add([confirmG, confirmTxt]);

    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
  }

  // ────────────────────────────────────────────────────────
  // 共用：列名稱 + 副標籤（左側）
  // ────────────────────────────────────────────────────────

  _rowLabel(W, rowY, name, sub) {
    const lx = (W - PANEL_W) / 2 + 28;

    this.add.text(lx, rowY + ROW_H / 2 - 10, name, {
      fontSize: '16px', fontFamily: 'Arial Black, sans-serif', color: '#c9a84c',
    }).setOrigin(0, 0.5).setDepth(11);

    this.add.text(lx, rowY + ROW_H / 2 + 12, sub, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#7a5e22',
    }).setOrigin(0, 0.5).setDepth(11);

    // 列底部細分隔線
    const divG = this.add.graphics().setDepth(9);
    divG.lineStyle(1, 0x3a2a0a, 0.30);
    divG.beginPath();
    divG.moveTo((W - PANEL_W) / 2 + 8, rowY + ROW_H + ROW_GAP / 2);
    divG.lineTo((W + PANEL_W) / 2 - 8, rowY + ROW_H + ROW_GAP / 2);
    divG.strokePath();
  }

  // ────────────────────────────────────────────────────────
  // 返回邏輯
  // ────────────────────────────────────────────────────────

  _goBack() {
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this._fromScene === 'GameScene' && this._levelId !== null) {
        this.scene.start('GameScene', { levelId: this._levelId });
      } else {
        this.scene.start('MenuScene');
      }
    });
  }
}
