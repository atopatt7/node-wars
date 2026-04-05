/**
 * config.js - 全域常數設定
 * 所有數值集中在此，方便日後調整平衡
 */

// ── 畫布尺寸（橫向優先：適配手機橫向 / 電腦寬螢幕）──
// 16:9 接近比例，確保大多數裝置不需要超出比例縮放
export const GAME_WIDTH  = 1280;  // was 854（×1.5：提升內部渲染解析度，改善畫面清晰度）
export const GAME_HEIGHT = 720;   // was 480

// ── 建築類型設定 ──
//
// passiveEffect / passiveValue：節點被動能力
//   null               → 無特殊效果（Village）
//   'attacker_penalty' → 攻擊方兵力在戰鬥前乘以 passiveValue（Tower 阻箭效果）
//   'garrison_regen'   → 成功守城後立即回復 passiveValue 兵（Castle 守城韌性）
//
// 擴充說明（未來升級/法術系統保留點）：
//   - passiveEffect 可增加更多類型（如 'production_aura'、'heal_on_capture' 等）
//   - passiveValue 永遠為純數值，避免結構過複雜
//   - CombatSystem 以 switch/if 對應 passiveEffect 字串，新增效果只需加分支
//
export const NODE_TYPES = {
  VILLAGE: {
    name:              '村莊',
    label:             'V',
    productionRate:    1.0,   // 每秒產生單位數
    maxUnits:          50,
    defenseMultiplier: 1.0,   // 防禦倍率（攻擊者需 unitCount > defenderUnits * multiplier）
    radius:            27,    // was 32（縮小 ~16%，減少關卡節點重疊）
    // 被動效果
    passiveEffect:     null,  // 無特殊效果，作為標準基準節點
    passiveValue:      1.0,
  },
  CASTLE: {
    name:              '城堡',
    label:             'C',
    productionRate:    0.4,   // 慢但容量大
    maxUnits:          100,
    defenseMultiplier: 1.5,
    radius:            33,    // was 40（縮小 17.5%）
    // 被動效果：守城韌性 — 成功守城後立即回復兵力（代表城堡內部快速補員）
    passiveEffect:     'garrison_regen',
    passiveValue:      3,     // 每次成功守城後回復 3 兵（最多到 maxUnits）
  },
  TOWER: {
    name:              '箭塔',
    label:             'T',
    productionRate:    0.25,  // 最慢，防禦最強
    maxUnits:          30,
    defenseMultiplier: 2.0,
    radius:            22,    // was 26（縮小 ~15%）
    // 被動效果：阻箭懲罰 — 攻擊方兵力在結算前打折（代表塔上弓箭手射殺進攻部隊）
    passiveEffect:     'attacker_penalty',
    passiveValue:      0.75,  // 攻擊方兵力 × 0.75（損失 25% 才能進入近戰結算）
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
    fill:   0x8811CC,   // 虛空紫
    dark:   0x220033,   // 深紫黑
    stroke: 0xCC44FF,   // 霓虹紫
  },
  neutral: {
    fill:   0x888899,   // 灰
    dark:   0x444455,
    stroke: 0xBBBBCC,
  },
};

// ── 部隊移動速度（像素/秒）──
// ↓ 130→90→70：繼續放慢，讓玩家有更充裕的時間觀察戰況並施放法術
export const TROOP_SPEED = 70;

// ── AI 思考間隔（毫秒，normal 基準值，實際由難度 Profile 覆蓋）──
export const AI_THINK_INTERVAL = 3800;

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
    thinkInterval:      5500,   // ↑ 4000→5500：easy AI 每 5.5s 才思考一次
    thinkVariance:      2000,   // ↑ 1600→2000：擺動更大，行為更難預測
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
    thinkInterval:      3800,   // ↑ 2600→3800：與 TROOP_SPEED 降幅同步
    thinkVariance:      1400,   // ↑ 1000→1400
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
    thinkInterval:      2200,   // ↑ 1400→2200：hard AI 仍然聰明，但不再分身術
    thinkVariance:      900,    // ↑ 600→900
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

// ── 據點升級設定 ──────────────────────────────────────────
//
// 每種節點類型最多升到 3 級（初始為 1 級）。
// costs[i]          = 從 level i+1 升到 i+2 需要消耗的兵力
// maxUnitsBonus[i]  = 該次升級增加的 maxUnits 上限
// productionBonus[i]= 該次升級增加的 productionRate（單位/秒）
//
// 升級費用直接從該節點的 currentUnits 扣除，
// 因此玩家必須在兵力充足時才能升級。
//
// ── 法術設定 ──────────────────────────────────────────────
//
// 三種法術（Haste / Meteor / Fortify）的完整設定：
//   manaCost   消耗魔力值
//   cooldown   冷卻時間（ms）
//   duration   效果持續時間（ms；Meteor 為撞擊動畫時間）
//   targetType 'own' = 只能施放在己方節點；'enemy' = 敵方或中立
//   color      法術代表色（用於 UI 按鈕邊框 / 特效顏色）
//
export const SPELL_CONFIG = {
  HASTE: {
    id:         'HASTE',
    name:       '急行',
    icon:       '⚡',
    desc:       '加速生兵 ×2.5，8 秒',
    manaCost:   30,
    cooldown:   15000,   // 15s 冷卻
    duration:   8000,    // 8s 持續
    mult:       2.5,     // productionRate 乘數
    targetType: 'own',
    color:      0x44AAFF,
  },
  METEOR: {
    id:         'METEOR',
    name:       '隕石',
    icon:       '☄',
    desc:       '對目標造成 20 點直接傷害',
    manaCost:   40,
    cooldown:   20000,   // 20s 冷卻
    duration:   700,     // 700ms 撞擊動畫
    damage:     25,      // ↑ 20→25：打大型節點更有體感
    targetType: 'enemy', // 敵方或中立節點
    color:      0xFF6622,
  },
  FORTIFY: {
    id:         'FORTIFY',
    name:       '強化',
    icon:       '🛡',
    desc:       '防禦力 +1.2，持續 10 秒',
    manaCost:   25,
    cooldown:   20000,   // 20s 冷卻
    duration:   7000,    // ↓ 10s→7s：降低 uptime（33%→26%），強化時機決策
    defBonus:   0.8,     // ↓ 1.2→0.8：Castle(2.3) / Tower(2.8)，不再無解
    targetType: 'own',
    color:      0xFFDD00,
  },
};

export const UPGRADE_CONFIG = {
  VILLAGE: {
    costs:           [15, 30],    // 1→2 費 15 兵；2→3 費 30 兵
    maxUnitsBonus:   [20, 25],    // +20 / +25 maxUnits
    productionBonus: [0.30, 0.40], // +0.3 / +0.4 productionRate
  },
  CASTLE: {
    costs:           [25, 50],    // 城堡升級代價較重
    maxUnitsBonus:   [40, 50],
    productionBonus: [0.10, 0.15],
  },
  TOWER: {
    costs:           [10, 20],    // 箭塔便宜但數值也保守
    maxUnitsBonus:   [10, 12],
    productionBonus: [0.08, 0.10],
  },
};
