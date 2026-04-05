/**
 * ui-tokens.js — 設計語言 Token
 * 主題：「KINGDOMS vs THE VOID」虛空金色中世紀
 * 來源：Figma 設計稿（channel drbmfrco）
 */

// ── Phaser hex 色碼 (用於 fillStyle / lineStyle) ────────────────────
export const C = {
  // 背景層
  BG_VOID:    0x080604,   // 基底虛空暗色
  BG_DEEP:    0x050402,   // 頁首/頁尾最深底色
  BG_SURFACE: 0x18120a,   // 卡片正常狀態
  BG_RAISED:  0x0f0b06,   // 卡片「金幣不足」狀態
  BG_LOCKED:  0x090704,   // 卡片鎖定狀態
  BG_LEFT:    0x0e0a06,   // 主選單左側面板
  BG_BOTTOM:  0x0c0905,   // 卡片底部購買區

  // 金色系
  GOLD:       0xb8922a,   // 主金色（邊框、線條）
  GOLD_TEXT:  0xc9a84c,   // 亮金色文字（標題、價格）
  GOLD_DIM:   0x8a6a22,   // 暗金色（提示、caption）
  LOCK_BRN:   0x594d38,   // 鎖定棕色
  LOCK_BRD:   0x3d3530,   // 鎖定邊框

  // 文字
  IVORY:      0xe8d9b8,   // 主要內容文字
  IVORY_DIM:  0xa89070,   // 次要文字

  // 強調色
  VOID:       0x8b5aae,   // 虛空紫
  VOID_DARK:  0x4f2d64,   // 深虛空紫

  // 狀態色
  GREEN_OK:   0x4a6e32,   // 完成標記
  RED_ERR:    0xa85c5c,   // 金幣不足文字
  RED_DIM:    0x8a3737,   // 金幣不足（暗）

  // 氛圍
  GLOW:       0x281a0c,   // 中央暖暈（主選單左欄）
  VOID_SHD:   0x2d0f3f,   // 虛空暗影（右上角）
};

// ── CSS 字串色碼 (用於 Phaser Text color) ───────────────────────────
export const CC = {
  GOLD_TEXT:  '#c9a84c',
  GOLD:       '#b8922a',
  GOLD_DIM:   '#8a6a22',
  LOCK_TXT:   '#665740',
  LOCK_BRN:   '#594d38',
  IVORY:      '#e8d9b8',
  IVORY_DIM:  '#a89070',
  VOID:       '#8b5aae',
  GREEN_OK:   '#4a6e32',
  RED_ERR:    '#a85c5c',
};
