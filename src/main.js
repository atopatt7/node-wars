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
import { ShopScene }     from './scenes/ShopScene.js';
import { GameScene }     from './scenes/GameScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';

// ── 行動裝置偵測（用於效能模式）──
// iOS / Android 裝置使用較低畫質設定，降低 GPU/CPU 熱負荷
const isMobileDevice =
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 2);

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

  // ── 行動裝置：鎖定 30fps，大幅降低 CPU/GPU 耗用──
  fps: isMobileDevice ? { target: 30, forceSetTimeOut: true } : {},

  // ── 輸入設定 ──
  input: {
    activePointers: 4,   // 最多 4 點同時觸控
  },

  // ── 場景清單（順序 = 啟動順序）──
  scene: [
    BootScene,
    MenuScene,
    LevelSelectScene,
    ShopScene,
    GameScene,
    SettingsScene,
  ],

  // ── 渲染設定（iOS 優化）──
  render: {
    antialias:         !isMobileDevice,  // 行動裝置關閉抗鋸齒，節省 GPU
    pixelArt:          false,
    roundPixels:       true,             // 像素對齊，讓文字 / 細線更銳利
    transparent:       false,
    clearBeforeRender: true,
    powerPreference:   'low-power',      // WebGL 省電提示
  },
};

// 啟動遊戲
const game = new Phaser.Game(config);

// ── iOS Safari：防止頁面滾動干擾觸控 ──
document.addEventListener('touchmove', (e) => {
  e.preventDefault();
}, { passive: false });

// ── 嘗試鎖定螢幕方向為橫向（支援的瀏覽器）──
// 若 API 不支援則靜默忽略；iOS Safari 不支援 lock()，
// 改由 HTML CSS @media(orientation:portrait) 顯示旋轉提示。
if (screen?.orientation?.lock) {
  screen.orientation.lock('landscape').catch(() => {
    // 部分裝置禁止鎖定方向（如 iPad），靜默忽略
  });
}

export default game;
