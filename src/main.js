/**
 * main.js - Phaser 3 遊戲入口
 *
 * 初始化設定：
 *   - 使用 Phaser.Scale.FIT 自動縮放以適應不同螢幕（含 iOS）
 *   - activePointers: 4  → 支援多點觸控
 *   - type: AUTO         → 優先 WebGL，回退 Canvas
 */

import Phaser            from 'phaser';
import { BootScene }     from './scenes/BootScene.js';
import { MenuScene }     from './scenes/MenuScene.js';
import { LevelSelectScene } from './scenes/LevelSelectScene.js';
import { GameScene }     from './scenes/GameScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';

const config = {
  type:            Phaser.AUTO,
  width:           GAME_WIDTH,
  height:          GAME_HEIGHT,
  backgroundColor: '#080D28',
  parent:          'game',

  // ── 縮放設定（關鍵 iOS 支援）──
  scale: {
    mode:       Phaser.Scale.FIT,         // 保持比例，填滿容器
    autoCenter: Phaser.Scale.CENTER_BOTH, // 水平垂直置中
  },

  // ── 輸入設定 ──
  input: {
    activePointers: 4,   // 最多 4 點同時觸控
  },

  // ── 場景清單（順序 = 啟動順序）──
  scene: [
    BootScene,
    MenuScene,
    LevelSelectScene,
    GameScene,
  ],

  // ── 渲染設定（iOS 優化）──
  render: {
    antialias:        true,
    pixelArt:         false,
    roundPixels:      false,
    transparent:      false,
    clearBeforeRender: true,
  },
};

// 啟動遊戲
const game = new Phaser.Game(config);

// iOS Safari 防止頁面滾動干擾觸控
document.addEventListener('touchmove', (e) => {
  e.preventDefault();
}, { passive: false });

export default game;
