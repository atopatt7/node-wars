/**
 * layout.js - HUD 布局常數
 *
 * 供 UIController（建立 HUD 元素）與
 * GameScene（計算節點可用區域）共用。
 *
 * 橫向適配說明：
 *   遊戲解析度已改為 854×480（橫向）。
 *   HUD_TOP / HUD_BOTTOM 維持原值；橫向後可用遊戲區域為 480-58-80 = 342px。
 *   SAFE_H 為左右 UI 的額外安全邊距（遊戲單位），
 *   確保 HUD 文字 / 按鈕不貼齊畫布邊緣。
 *   （iOS 瀏海 / 動態島的 safe-area-inset 由 CSS #game padding 處理，
 *     SAFE_H 是 Phaser 層的額外 UI 留白。）
 */

/** 頂部 HUD 高度（像素）— 隨解析度 ×1.5 同步調整（52→78） */
export const HUD_TOP    = 78;

/** 底部法術列高度（像素）— 含魔力條 + 3 個法術按鈕（76→114） */
export const HUD_BOTTOM = 114;

/**
 * 左右 UI 安全邊距（遊戲單位）
 *
 * index.html 的 #game 不再套用 CSS safe-area padding（讓 canvas 填滿整個視窗）。
 * Phaser 的 Scale.FIT 置中模式會自動產生 letterbox，讓 canvas 左緣天然跳過瀏海 / 動態島；
 * 此 SAFE_H 作為 Phaser 層的額外 UI 內縮量，確保 HUD 文字 / 按鈕不貼齊畫布邊緣。
 *
 * 計算依據（iPhone 15 Pro 最窄 letterbox 機型）：
 *   canvas letterbox ≈ 77px（CSS 像素）、safe-area-left ≈ 59px
 *   畫布外天然已隔開 18px，SAFE_H=16 在 Phaser 層再增加 ~13px CSS 像素間距
 *   → HUD 元素距瀏海 ≥ 31px，足夠。
 */
export const SAFE_H = 24;   // was 16（×1.5，配合 1280×720 解析度）
