/**
 * config.js - 全域常數設定
 * 所有數值集中在此，方便日後調整平衡
 */

// ── 畫布尺寸（針對行動裝置直向優化）──
export const GAME_WIDTH  = 480;
export const GAME_HEIGHT = 854;

// ── 建築類型設定 ──
export const NODE_TYPES = {
  VILLAGE: {
    name:              '村莊',
    label:             'V',
    productionRate:    1.0,   // 每秒產生單位數
    maxUnits:          50,
    defenseMultiplier: 1.0,   // 防禦倍率（攻擊者需 unitCount > defenderUnits * multiplier）
    radius:            32,
  },
  CASTLE: {
    name:              '城堡',
    label:             'C',
    productionRate:    0.4,   // 慢但容量大
    maxUnits:          100,
    defenseMultiplier: 1.5,
    radius:            40,
  },
  TOWER: {
    name:              '箭塔',
    label:             'T',
    productionRate:    0.25,  // 最慢，防禦最強
    maxUnits:          30,
    defenseMultiplier: 2.0,
    radius:            26,
  },
};

// ── 陣營顏色 ──
export const FACTION_COLORS = {
  player: {
    fill:   0x4A90E2,   // 藍
    dark:   0x1A5599,
    stroke: 0x7ABBFF,
  },
  enemy: {
    fill:   0xE24A4A,   // 紅
    dark:   0x991A1A,
    stroke: 0xFF7B7B,
  },
  neutral: {
    fill:   0x888899,   // 灰
    dark:   0x444455,
    stroke: 0xBBBBCC,
  },
};

// ── 部隊移動速度（像素/秒）──
export const TROOP_SPEED = 130;

// ── AI 思考間隔（毫秒，normal 基準值，實際由難度 Profile 覆蓋）──
export const AI_THINK_INTERVAL = 2600;

// ── AI 難度設定檔 ──────────────────────────────────────────────
// 各欄位說明：
//   thinkInterval      每次決策間隔（ms）          → 越小越積極
//   thinkVariance      間隔隨機擺動幅度（ms，±0.5）→ 越大行為越難預測
//   minAttackUnits     進攻門檻（自身兵力 ≥ 才動）  → 越小越早進攻
//   minReserveUnits    出兵後自身最少保留兵力        → 越小越敢梭哈
//   ratioNeutral       攻中立節點的送兵比例          → 越大越積極搶點
//   ratioDefault       一般攻擊送兵比例              → 越大出手越重
//   ratioOutgunned     己方劣勢時的送兵比例          → 越大越敢硬剛
//   neutralBonus       中立目標評分加分              → 越高越偏好搶空地
//   avoidStrongPenalty 攻打強敵扣分                  → 越低越敢打硬仗
//   scoreThreshold     低於此分放棄該目標            → 越低越不挑食
export const AI_DIFFICULTY_PROFILES = {
  easy: {
    thinkInterval:      4000,
    thinkVariance:      1600,
    minAttackUnits:     18,
    minReserveUnits:    8,
    ratioNeutral:       0.40,
    ratioDefault:       0.50,
    ratioOutgunned:     0.65,
    neutralBonus:       15,
    avoidStrongPenalty: 30,
    scoreThreshold:     5,
  },
  normal: {
    thinkInterval:      2600,
    thinkVariance:      1000,
    minAttackUnits:     10,
    minReserveUnits:    5,
    ratioNeutral:       0.50,
    ratioDefault:       0.60,
    ratioOutgunned:     0.80,
    neutralBonus:       25,
    avoidStrongPenalty: 35,
    scoreThreshold:     -10,
  },
  hard: {
    thinkInterval:      1400,
    thinkVariance:      600,
    minAttackUnits:     6,
    minReserveUnits:    3,
    ratioNeutral:       0.60,
    ratioDefault:       0.70,
    ratioOutgunned:     0.90,
    neutralBonus:       30,
    avoidStrongPenalty: 20,
    scoreThreshold:     -25,
  },
};

// ── 送兵比例選項（右鍵或按鈕切換）──
export const SEND_RATIOS = [0.25, 0.50, 0.75, 1.00];
export const DEFAULT_SEND_RATIO_INDEX = 1; // 預設 50%

// ── 超載衰減速率（單位/秒）──────────────────────────────
// 當節點 currentUnits > maxUnits 時，每秒損失此數量的兵力，
// 直到回到 maxUnits 為止。調高此值衰減更快，調低則更慢。
export const OVERFLOW_DECAY_RATE = 1; // 單位/秒
