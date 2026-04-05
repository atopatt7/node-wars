/**
 * BootScene.js - 開機 / 載入場景
 *
 * 顯示載入進度條後跳至主選單。
 * 本遊戲全程程序繪圖，無外部圖片資源，
 * 保留此結構方便日後加入音效/圖片。
 */

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // ── 載入進度條 ──
    const barBg = this.add.graphics();
    barBg.fillStyle(0x1a3055, 1);
    barBg.fillRoundedRect(W * 0.1, H / 2 - 12, W * 0.8, 24, 8);

    const bar = this.add.graphics();

    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0x4A90E2, 1);
      bar.fillRoundedRect(W * 0.1, H / 2 - 12, W * 0.8 * v, 24, 8);
    });

    this.add.text(W / 2, H / 2 - 36, 'NODE WARS', {
      fontSize: '28px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2 + 30, '載入中…', {
      fontSize: '14px',
      color: '#88AABB',
    }).setOrigin(0.5);

    // 此處可加入音效、圖片等資源
    // this.load.audio('bgm', 'assets/bgm.mp3');
  }

  create() {
    // 短暫停留後進入主選單
    this.time.delayedCall(400, () => {
      this.scene.start('MenuScene');
    });
  }
}
