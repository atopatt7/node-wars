/**
 * levels.js — 30 關卡設計資料（品質強化版 v3）
 *
 * 新增欄位：
 *   phase         : 1–6，對應六個設計階段
 *   landmark      : true = ★ 記憶點關卡（特殊布局或頓悟時刻）
 *   strategyLabel : 玩家在關卡選擇畫面看到的一句話策略提示
 *   aiStyle       : 控制 AI 行為風格（由 AISystem 讀取）
 *                   'passive'   → 低頻單線（Phase 1–2 開場）
 *                   'exploring' → 積極搶中立（Phase 2 後段）
 *                   'balanced'  → 標準雙線（Phase 3）
 *                   'upgrader'  → 偏好升級，攻勢稍緩（Phase 4）
 *                   'tactical'  → 有節奏的全方位（Phase 5）
 *                   'aggressive'→ 全開（Phase 6）
 *
 * ════════════════════════════════════════════════════════
 * 六階段設計理念
 * ════════════════════════════════════════════════════════
 *
 * Phase 1（1–5）新手教學
 *   AI: easy / aiStyle: passive → 低頻單線，給玩家思考空間
 *   每關教一個概念：派兵 → 擴張 → 多點 → 城堡 → 版圖
 *
 * Phase 2（6–10）節點差異
 *   AI: easy→normal / aiStyle: exploring → 開始搶中立施壓
 *   第 6 關（過渡）：超簡化 Tower 初遇，塔兵少、AI 壓力低
 *   教玩家 Tower 不能硬衝、Castle 要一次打爆
 *
 * Phase 3（11–15）雙線與決策
 *   AI: normal / aiStyle: balanced → 標準雙線，無夾擊
 *   第 11 關（過渡）：左右路選擇，左路明顯更輕鬆，引導玩家思考
 *   中央爭奪、側翼包抄、分兵決策
 *
 * Phase 4（16–20）升級策略
 *   AI: hard / aiStyle: upgrader → AI 偏向升級，進攻節奏略緩
 *   第 16 關（過渡）：40 兵村莊一眼就知道可以升級，引導體驗
 *   升級成為勝負關鍵，設計讓「先升後攻」明顯優於「直接衝」
 *
 * Phase 5（21–25）法術運用
 *   AI: hard / aiStyle: tactical → 有節奏的全方位攻勢
 *   第 21 關（過渡）：塔兵刻意設定在 Meteor 一擊可削半的值
 *   每關有明確法術登場時機
 *
 * Phase 6（26–30）綜合挑戰
 *   AI: hard / aiStyle: aggressive → 完整策略＋節奏間隔
 *   第 26 關（過渡）：玩家兵力充足，角落塔明確可搶
 *   多路壓力＋高等節點，但每關都「有解」
 *
 * ════════════════════════════════════════════════════════
 * ★ 記憶點關卡（landmark: true）
 * ════════════════════════════════════════════════════════
 *   1  — 第一次征服的成就感
 *   4  — 第一次遇到城堡，積累才能勝
 *   6  — 第一次遇到箭塔，直衝吃虧的教訓
 *   11 — 第一個分支路線決策
 *   12 — 中央城堡爭奪的緊張感
 *   16 — 升級改變戰局的頓悟時刻
 *   20 — 黃金要塞：拿到就能翻盤的張力
 *   21 — 第一次用 Meteor 打開「不可能」的防線
 *   26 — 四面楚歌：最絕望的開局，有清晰出路
 *   27 — 鏡像決戰：靠決策與法術壓倒對手
 *   30 — 天下一統：史詩終局成就感
 */

// ── 章節定義（Chapter Layer）──────────────────────────────────────────
// 6 個章節對應 6 個 Phase，每章 5 關。
// 以 CHAPTERS[level.phase] 取得對應章節資料，不修改各關卡物件。
//
// 欄位：
//   num      — 章節編號（1–6）
//   name     — 章節全名（用於 UI 顯示）
//   subtitle — 一句話定位（用於章節開場標題）
//   range    — 關卡範圍標示（純展示）
export const CHAPTERS = [
  null,  // index 0 佔位，使 CHAPTERS[1] 對應第一章
  {
    num:  1,
    name: '第一章：邊境淪陷',
    subtitle: '虛空族的觸手已越過邊境，領主集結兵力',
    opening:  '虛空之門乍開，邊境村落首當其衝。領主，收復家園的時刻到了。',
    ending:   '邊境已掃清，但異光仍在天際閃爍。更深的戰役，尚未開始……',
    range: '1–5',
  },
  {
    num:  2,
    name: '第二章：異變據點',
    subtitle: '被虛空能量侵蝕的建築已非昔日模樣',
    opening:  '腐化之力已滲入磚石——昔日的據點，如今面目全非。',
    ending:   '據點已淨化，虛空族的爪牙卻往更深的腹地蔓延。',
    range: '6–10',
  },
  {
    num:  3,
    name: '第三章：分裂戰線',
    subtitle: '戰線四分五裂，每一個決策都攸關存亡',
    opening:  '戰線四分五裂，每條岔路都是豪賭。領主，選對方向。',
    ending:   '混亂中殺出一條血路。領主之名，已在前線流傳。',
    range: '11–15',
  },
  {
    num:  4,
    name: '第四章：領主崛起',
    subtitle: '強化要塞，以人類的堅毅對抗異界的侵蝕',
    opening:  '強化要塞，以鋼鐵意志正面撼動虛空的侵蝕。',
    ending:   '強化的城砦屹立不搖。領主的意志，已與這片土地融為一體。',
    range: '16–20',
  },
  {
    num:  5,
    name: '第五章：奧術對抗',
    subtitle: '以魔法之力正面撼動虛空族的能量核心',
    opening:  '以魔法對抗虛空——流星、急行、強化結界，皆是你手中的利刃。',
    ending:   '奧術之力封鎖了裂縫的出口。但最深的裂痕，仍在等待。',
    range: '21–25',
  },
  {
    num:  6,
    name: '第六章：裂痕之戰',
    subtitle: '蒼穹的裂縫已敞開，這是最後的決戰',
    opening:  '蒼穹的裂縫已全面敞開。人類與虛空族的最終決戰，於此刻降臨。',
    ending:   '裂縫封閉，虛空族已被驅離。蒼穹重歸寧靜——領主萬歲！',
    range: '26–30',
  },
];

export const LEVELS = [

  // ════════════════════════════════════════════════════════
  // PHASE 1：新手教學（第 1–5 關）
  // ════════════════════════════════════════════════════════

  // ── 第 1 關：初出茅廬 ★ ──────────────────────────────
  // 策略重點：拖曳派兵基本操作，選左或右路搶中立再打敵方
  // 地圖：菱形四點——上(我)→左中＋右中(中立)→下(敵)，雙路可選
  {
    id:            1,
    phase:         1,
    landmark:      true,
    name:          '第一戰：被侵蝕的邊境',
    description:   '虛空族入侵初始！拖曳派兵，奪回領土。',
    strategyLabel: '左右各有一處中立據點，選一路搶下後再圍攻虛空本陣',
    aiDifficulty:  'easy',
    aiStyle:       'passive',
    nodes: [
      { id: 0, x: 0.50, y: 0.12, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 1, x: 0.20, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 2, x: 0.80, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 3, x: 0.50, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
    ],
  },

  // ── 第 2 關：中立搶先 ────────────────────────────────
  // 策略重點：中央村莊是關鍵爭奪點，率先佔領可同時封鎖左右路
  // 地圖：玩家左上，敵方右下，左路／中央／右路三條路線
  {
    id:            2,
    phase:         1,
    landmark:      false,
    name:          '第二戰：荒廢的前哨站',
    description:   '廢棄前哨已成虛空族囤兵點，速搶四散的村落！',
    strategyLabel: '搶先奪中央據點，再選左路或右路突破虛空防線',
    aiDifficulty:  'easy',
    aiStyle:       'passive',
    nodes: [
      { id: 0, x: 0.20, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 16 },
      { id: 1, x: 0.20, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 2, x: 0.50, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.80, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 4, x: 0.80, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
    ],
  },

  // ── 第 3 關：雙村出擊 ────────────────────────────────
  // 策略重點：協調兩個起始村莊，一守一攻或夾擊
  {
    id:            3,
    phase:         1,
    landmark:      false,
    name:          '第三戰：暗影走廊',
    description:   '虛空族在走廊兩端佈陣，以鉗形攻勢夾擊它！',
    strategyLabel: '雙路出兵夾攻，讓虛空族顧此失彼',
    aiDifficulty:  'easy',
    aiStyle:       'passive',
    nodes: [
      { id: 0, x: 0.25, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 14 },
      { id: 1, x: 0.75, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 12 },
      { id: 2, x: 0.25, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 3, x: 0.75, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 4, x: 0.50, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
    ],
  },

  // ── 第 4 關：城堡初見 ★ ──────────────────────────────
  // 策略重點：城堡防禦 1.5×，不能直衝，必須先積累 40+ 兵
  // ★ 記憶點：第一次遇到城堡，直衝兵力不足
  // 地圖：上方左右兩出發點→中段左中右三條路→中央交匯點→城堡
  {
    id:            4,
    phase:         1,
    landmark:      true,
    name:          '第四戰：虛空堡壘現身',
    description:   '虛空族的強化堡壘防禦極高！先積蓄力量。',
    strategyLabel: '先搶中央交匯據點，集結 40 兵以上再強攻虛空城堡',
    aiDifficulty:  'easy',
    aiStyle:       'passive',
    nodes: [
      { id: 0, x: 0.28, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 24 },
      { id: 1, x: 0.72, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 12 },
      { id: 2, x: 0.20, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.80, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.50, y: 0.63, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 5, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 28 },
    ],
  },

  // ── 第 5 關：四方爭地 ────────────────────────────────
  // 策略重點：版圖控制——誰擴張更快誰就佔優
  {
    id:            5,
    phase:         1,
    landmark:      false,
    name:          '第五戰：邊境要塞陷落',
    description:   '虛空族已佔據四角，速奪要地控制全局！',
    strategyLabel: '誰先控制四方版圖，誰就能封鎖虛空族的擴張',
    aiDifficulty:  'easy',
    aiStyle:       'exploring',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id: 1, x: 0.15, y: 0.30, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 2, x: 0.85, y: 0.30, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 3, x: 0.50, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.15, y: 0.70, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 5, x: 0.85, y: 0.70, type: 'VILLAGE', owner: 'neutral', currentUnits: 7  },
      { id: 6, x: 0.50, y: 0.90, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
    ],
  },

  // ════════════════════════════════════════════════════════
  // PHASE 2：節點差異（第 6–10 關）
  // ════════════════════════════════════════════════════════

  // ── 第 6 關：箭塔警示 ★（Phase 2 過渡關）────────────
  // 設計為「超輕鬆的箭塔初遇」：
  //   - 塔兵只有 10（比一般少），直衝也剛好虧，但虧不多
  //   - 玩家有充裕兵力（26+18）可試錯後重整
  //   - 中立村莊就在旁邊，繞道路線明確
  // ★ 記憶點：直衝會虧，但不會被打垮——剛好教到 Tower 特性
  {
    id:            6,
    phase:         2,
    landmark:      true,
    name:          '第六戰：虛空結晶哨塔',
    description:   '虛空能量強化的哨塔難以正面突破！先繞後奇襲。',
    strategyLabel: '別衝哨塔！先繞側翼搶村，削弱其補給',
    aiDifficulty:  'easy',
    aiStyle:       'passive',
    nodes: [
      { id: 0, x: 0.25, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 26 }, // ↑ 20→26：給玩家試錯空間
      { id: 1, x: 0.75, y: 0.13, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.25, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  }, // 繞道路線明確
      { id: 3, x: 0.75, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 4, x: 0.30, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 }, // ↓ 壓力降低
      { id: 5, x: 0.70, y: 0.87, type: 'TOWER',   owner: 'enemy',   currentUnits: 10 }, // ↓ 14→10：初遇超輕
    ],
  },

  // ── 第 7 關：城堡攻堅 ────────────────────────────────
  // 策略重點：城堡需要兵力優勢（>守軍×1.5），積累後「一波爆破」
  // 地圖：上兩路→中三點（左中右）→下城堡＋村莊，中央節點是兵力集結要地
  {
    id:            7,
    phase:         2,
    landmark:      false,
    name:          '第七戰：腐化的城砦',
    description:   '虛空族盤踞城砦，積累重兵一波推平！',
    strategyLabel: '先搶中央三據點，積兵 50+ 後對腐化城砦發動雷霆一擊',
    aiDifficulty:  'normal',
    aiStyle:       'exploring',
    nodes: [
      { id: 0, x: 0.25, y: 0.12, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id: 1, x: 0.75, y: 0.12, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.20, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.50, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.80, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 5, x: 0.25, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
      { id: 6, x: 0.72, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
    ],
  },

  // ── 第 8 關：繞道奇兵 ────────────────────────────────
  // 策略重點：中央箭塔封路，必須搶側翼村莊繞後攻
  {
    id:            8,
    phase:         2,
    landmark:      false,
    name:          '第八戰：扭曲的農田',
    description:   '虛空能量封住正路，從側翼農田迂迴進攻！',
    strategyLabel: '搶側翼農村，繞開虛空哨塔的封鎖線',
    aiDifficulty:  'normal',
    aiStyle:       'exploring',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 28 },
      { id: 1, x: 0.14, y: 0.35, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 2, x: 0.86, y: 0.35, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.50, y: 0.50, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 4, x: 0.14, y: 0.70, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 5, x: 0.86, y: 0.70, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 6, x: 0.50, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 35 },
    ],
  },

  // ── 第 9 關：多線牽制 ────────────────────────────────
  // 策略重點：AI 多方向施壓，守住核心節點再找機會反攻
  {
    id:            9,
    phase:         2,
    landmark:      false,
    name:          '第九戰：暗能量聚集點',
    description:   '虛空族多路並進，守住城砦等待反攻契機！',
    strategyLabel: '以城砦為錨，熬住多路虛空能量流再反擊',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.22, y: 0.12, type: 'CASTLE',  owner: 'player',  currentUnits: 26 },
      { id: 1, x: 0.70, y: 0.12, type: 'VILLAGE', owner: 'player',  currentUnits: 16 },
      { id: 2, x: 0.22, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.78, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 4, x: 0.50, y: 0.68, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 5, x: 0.22, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 30 },
      { id: 6, x: 0.78, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
    ],
  },

  // ── 第 10 關：以少勝多 ───────────────────────────────
  // 策略重點：城堡防禦加成讓 2 節點能對抗 3 節點
  {
    id:            10,
    phase:         2,
    landmark:      false,
    name:          '第十戰：異變司令室',
    description:   '以寡擊衆，守住城砦等虛空族自亂陣腳！',
    strategyLabel: '以防禦換時間，守住城砦即可扭轉局勢',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.50, y: 0.11, type: 'CASTLE',  owner: 'player',  currentUnits: 40 },
      { id: 1, x: 0.78, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 12 },
      { id: 2, x: 0.22, y: 0.45, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.78, y: 0.45, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.22, y: 0.74, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 5, x: 0.50, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 6, x: 0.78, y: 0.74, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
    ],
  },

  // ════════════════════════════════════════════════════════
  // PHASE 3：雙線與決策（第 11–15 關）
  // ════════════════════════════════════════════════════════

  // ── 第 11 關：左右抉擇 ★（Phase 3 過渡關）──────────
  // 設計為「路線選擇的最簡版本」：
  //   - 左路：2 個弱中立村（6+6 兵），非常輕鬆
  //   - 右路：1 個箭塔（10 兵）+ 1 個村（8 兵），有風險但箭塔可搶來守
  //   - 敵人壓力減輕（城堡 24、村 16），給玩家思考空間
  // ★ 記憶點：第一個分支路線關卡，左右有明顯難度差
  {
    id:            11,
    phase:         3,
    landmark:      true,
    name:          '第十一戰：破碎的聯盟',
    description:   '盟邦領地已裂成兩路，選擇正確的進攻路線！',
    strategyLabel: '選路線：左易（村落）右難（哨塔+村），先穩再奇',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 35 },
      { id: 1, x: 0.18, y: 0.35, type: 'VILLAGE', owner: 'neutral', currentUnits: 6  }, // 左路：超輕鬆
      { id: 2, x: 0.82, y: 0.35, type: 'TOWER',   owner: 'neutral', currentUnits: 10 }, // 右路：稍難，但塔可搶來守
      { id: 3, x: 0.18, y: 0.62, type: 'VILLAGE', owner: 'neutral', currentUnits: 6  }, // 左路：也很輕鬆
      { id: 4, x: 0.82, y: 0.62, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  }, // 右路：村莊獎勵
      { id: 5, x: 0.28, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 }, // ↓ 壓力減輕
      { id: 6, x: 0.50, y: 0.75, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
      { id: 7, x: 0.72, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 24 }, // ↓ 28→24
    ],
  },

  // ── 第 12 關：中央爭奪 ★ ────────────────────────────
  // 策略重點：中央中立城堡是勝負關鍵
  // ★ 記憶點：為搶城堡而緊張的感覺
  {
    id:            12,
    phase:         3,
    landmark:      true,
    name:          '第十二戰：兩線夾擊',
    description:   '虛空族於中央扎下指揮據點，率先奪下它！',
    strategyLabel: '搶奪中央虛空指揮堡是制勝關鍵，先到先得',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.25, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 1, x: 0.75, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.25, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.50, y: 0.50, type: 'CASTLE',  owner: 'neutral', currentUnits: 22 }, // ★ 中央城堡
      { id: 4, x: 0.75, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.50, y: 0.77, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
      { id: 6, x: 0.25, y: 0.89, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 7, x: 0.75, y: 0.89, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
    ],
  },

  // ── 第 13 關：側翼包抄 ───────────────────────────────
  // 策略重點：正面有屏障，從右側繞過
  {
    id:            13,
    phase:         3,
    landmark:      false,
    name:          '第十三戰：孤島防線',
    description:   '正面被虛空力場封鎖，只能從右翼迂迴突入！',
    strategyLabel: '走右翼繞過虛空防線正面，切入敵陣後方',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.78, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 24 },
      { id: 1, x: 0.78, y: 0.36, type: 'VILLAGE', owner: 'player',  currentUnits: 14 },
      { id: 2, x: 0.22, y: 0.24, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.50, y: 0.30, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 4, x: 0.50, y: 0.58, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 5, x: 0.22, y: 0.62, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 6, x: 0.50, y: 0.85, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 7, x: 0.22, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
    ],
  },

  // ── 第 14 關：分兵要術 ───────────────────────────────
  // 策略重點：敵人雙城堡，必須分兵壓制
  {
    id:            14,
    phase:         3,
    landmark:      false,
    name:          '第十四戰：橋頭堡爭奪',
    description:   '虛空族控制兩路橋頭堡，必須雙路同時施壓！',
    strategyLabel: '雙路分兵壓制，不讓虛空族任一堡壘積蓄能量',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 36 },
      { id: 1, x: 0.22, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 16 },
      { id: 2, x: 0.78, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 14 },
      { id: 3, x: 0.22, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.50, y: 0.58, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.78, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 6, x: 0.22, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 30 },
      { id: 7, x: 0.50, y: 0.85, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
      { id: 8, x: 0.78, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 28 },
    ],
  },

  // ── 第 15 關：孤城遠征 ───────────────────────────────
  // 策略重點：單城堡起步，必須快速擴張才能對抗多節點敵人
  {
    id:            15,
    phase:         3,
    landmark:      false,
    name:          '第十五戰：戰線的崩塌',
    description:   '我方城砦孤立，快速擴張才能阻止戰線全面崩潰！',
    strategyLabel: '速奪四處中立村落，壯大兵力後對虛空族發起總攻',
    aiDifficulty:  'normal',
    aiStyle:       'balanced',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 45 },
      { id: 1, x: 0.18, y: 0.28, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 2, x: 0.82, y: 0.28, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.18, y: 0.55, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.82, y: 0.55, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 5, x: 0.22, y: 0.80, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 6, x: 0.50, y: 0.65, type: 'VILLAGE', owner: 'enemy',   currentUnits: 12 },
      { id: 7, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 40 },
      { id: 8, x: 0.78, y: 0.80, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
    ],
  },

  // ════════════════════════════════════════════════════════
  // PHASE 4：升級策略（第 16–20 關）
  // ════════════════════════════════════════════════════════

  // ── 第 16 關：升級必勝 ★（Phase 4 過渡關）──────────
  // 設計為「升級效果最直觀的入門」：
  //   - 左村有 40 兵（非常顯眼），右村 18 兵
  //   - 升左村只花 15 兵，升完生產 +30%，非常直觀
  //   - 直衝敵塔（14+12）會虧：需 14×2.67=37 兵，發完就空了
  //   - 升完再攻：生產快，兵力充裕後輕鬆過關
  // ★ 記憶點：「先升再攻」的頓悟時刻
  {
    id:            16,
    phase:         4,
    landmark:      true,
    name:          '第十六戰：城主的抉擇',
    description:   '雙擊強化村莊，生產力倍增後再衝破哨塔！',
    strategyLabel: '先強化 40 兵村落，再向虛空哨塔發起衝擊',
    aiDifficulty:  'hard',
    aiStyle:       'upgrader',
    nodes: [
      { id: 0, x: 0.28, y: 0.12, type: 'VILLAGE', owner: 'player',  currentUnits: 40 }, // ← 升我！
      { id: 1, x: 0.72, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.28, y: 0.46, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.72, y: 0.46, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.50, y: 0.60, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 },
      { id: 5, x: 0.22, y: 0.78, type: 'TOWER',   owner: 'enemy',   currentUnits: 14 },
      { id: 6, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 30 },
      { id: 7, x: 0.78, y: 0.78, type: 'TOWER',   owner: 'enemy',   currentUnits: 12 },
    ],
  },

  // ── 第 17 關：生產競賽 ───────────────────────────────
  // 策略重點：升級雙村超過敵人雙城堡生產力
  {
    id:            17,
    phase:         4,
    landmark:      false,
    name:          '第十七戰：鐵血箭塔群',
    description:   '強化雙村，讓人類的生產力壓制虛空族城砦！',
    strategyLabel: '強化雙村莊超越虛空生產力，再以優勢兵力壓制',
    aiDifficulty:  'hard',
    aiStyle:       'upgrader',
    nodes: [
      { id: 0, x: 0.22, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 28 },
      { id: 1, x: 0.78, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 24 },
      { id: 2, x: 0.14, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 3, x: 0.50, y: 0.42, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.86, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 5, x: 0.22, y: 0.65, type: 'TOWER',   owner: 'enemy',   currentUnits: 12 },
      { id: 6, x: 0.78, y: 0.65, type: 'TOWER',   owner: 'enemy',   currentUnits: 12 },
      { id: 7, x: 0.22, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 35 },
      { id: 8, x: 0.78, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
    ],
  },

  // ── 第 18 關：突破塔林 ───────────────────────────────
  // 策略重點：三塔橫向封路，升城堡再突破
  {
    id:            18,
    phase:         4,
    landmark:      false,
    name:          '第十八戰：重組的防線',
    description:   '三座虛空哨塔封路，強化城砦後強行突破！',
    strategyLabel: '城砦升 2 級後，兵力才足以衝穿三塔封鎖線',
    aiDifficulty:  'hard',
    aiStyle:       'upgrader',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 36 },
      { id: 1, x: 0.25, y: 0.16, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.14, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.86, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4, x: 0.25, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 14 },
      { id: 5, x: 0.50, y: 0.60, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 },
      { id: 6, x: 0.75, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 14 },
      { id: 7, x: 0.28, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 8, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 38 },
    ],
  },

  // ── 第 19 關：資源為王 ───────────────────────────────
  // 策略重點：起始弱勢，搶中立並快速升級翻盤
  {
    id:            19,
    phase:         4,
    landmark:      false,
    name:          '第十九戰：深入虛空腹地',
    description:   '孤軍深入，搶佔中立地帶並強化才能翻盤！',
    strategyLabel: '搶佔中立＋快速強化，以弱勝強扭轉虛空入侵',
    aiDifficulty:  'hard',
    aiStyle:       'upgrader',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 22 },
      { id: 1, x: 0.14, y: 0.28, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 2, x: 0.86, y: 0.28, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.25, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 12 },
      { id: 4, x: 0.75, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 12 },
      { id: 5, x: 0.22, y: 0.72, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 6, x: 0.50, y: 0.74, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 7, x: 0.78, y: 0.72, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 8, x: 0.35, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 30 },
      { id: 9, x: 0.65, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 40 },
    ],
  },

  // ── 第 20 關：黃金要塞 ★ ────────────────────────────
  // 策略重點：中央城堡被雙塔守護，拿到並升級即可決定勝負
  // ★ 記憶點：拿到就能翻盤的張力
  {
    id:            20,
    phase:         4,
    landmark:      true,
    name:          '第二十戰：領主的宣言',
    description:   '奪下被雙塔守護的中央城砦並強化，宣告反擊！',
    strategyLabel: '奪取中央虛空城砦並強化，局勢立即翻轉',
    aiDifficulty:  'hard',
    aiStyle:       'upgrader',
    nodes: [
      { id: 0, x: 0.22, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 26 },
      { id: 1, x: 0.78, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id: 2, x: 0.22, y: 0.36, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.36, y: 0.50, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 4, x: 0.50, y: 0.50, type: 'CASTLE',  owner: 'neutral', currentUnits: 26 }, // ★ 黃金要塞
      { id: 5, x: 0.64, y: 0.50, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 6, x: 0.78, y: 0.36, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 7, x: 0.28, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 8, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
      { id: 9, x: 0.72, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
    ],
  },

  // ════════════════════════════════════════════════════════
  // PHASE 5：法術運用（第 21–25 關）
  // ════════════════════════════════════════════════════════

  // ── 第 21 關：隕石破塔 ★（Phase 5 過渡關）──────────
  // 設計為「Meteor 效果最明顯的初遇」：
  //   - 三座塔各 12 兵（Meteor 25 傷害後剩 -13 = 0，一擊消除）
  //   - 中央塔 14 兵（Meteor 後剩 -11 = 0，也能一擊）
  //   - 玩家城堡 40 兵，壓力降低，給玩家時間等魔力充滿
  //   - 法術選擇：先打中央塔清路，再進攻
  // ★ 記憶點：第一次用 Meteor 打開不可能的防線
  {
    id:            21,
    phase:         5,
    landmark:      true,
    name:          '第二十一戰：魔力交匯點',
    description:   '虛空哨塔防線無懈可擊？以隕石術轟開缺口！',
    strategyLabel: '隕石術削倒哨塔能量核心，再揮軍強攻',
    aiDifficulty:  'hard',
    aiStyle:       'tactical',
    nodes: [
      { id: 0, x: 0.22, y: 0.11, type: 'CASTLE',  owner: 'player',  currentUnits: 40 }, // ↑ 36→40
      { id: 1, x: 0.78, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 2, x: 0.50, y: 0.20, type: 'VILLAGE', owner: 'player',  currentUnits: 16 },
      { id: 3, x: 0.14, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 4, x: 0.86, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.25, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 12 }, // ↓ 16→12（Meteor 一擊消除）
      { id: 6, x: 0.50, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 14 }, // ↓ 17→14（Meteor 一擊消除）
      { id: 7, x: 0.75, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 12 }, // ↓ 16→12
      { id: 8, x: 0.50, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 40 },
    ],
  },

  // ── 第 22 關：急行奪城 ───────────────────────────────
  // 策略重點：城堡有 garrison_regen，Haste 2.5× 快速積累後衝鋒
  {
    id:            22,
    phase:         5,
    landmark:      false,
    name:          '第二十二戰：符文要塞',
    description:   '虛空城砦自動補充能量，急行法術快速衝破！',
    strategyLabel: '急行術 2.5× 爆兵，在虛空城砦再生前衝破',
    aiDifficulty:  'hard',
    aiStyle:       'tactical',
    nodes: [
      { id: 0, x: 0.25, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id: 1, x: 0.75, y: 0.11, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 2, x: 0.14, y: 0.42, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.50, y: 0.42, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 4, x: 0.86, y: 0.42, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.50, y: 0.74, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 6, x: 0.25, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 40 },
      { id: 7, x: 0.75, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 38 },
    ],
  },

  // ── 第 23 關：強化堅守 ───────────────────────────────
  // 策略重點：被包圍，Fortify 撐過壓力再反攻
  {
    id:            23,
    phase:         5,
    landmark:      false,
    name:          '第二十三戰：奧術禁區',
    description:   '城砦被虛空族包圍！強化結界撐住，等待反擊！',
    strategyLabel: '強化結界護城，熬過虛空圍攻後從側翼奇襲',
    aiDifficulty:  'hard',
    aiStyle:       'tactical',
    nodes: [
      { id: 0, x: 0.50, y: 0.11, type: 'CASTLE',  owner: 'player',  currentUnits: 34 },
      { id: 1, x: 0.82, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 14 },
      { id: 2, x: 0.18, y: 0.38, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 3, x: 0.82, y: 0.38, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 4, x: 0.18, y: 0.62, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 5, x: 0.50, y: 0.62, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
      { id: 6, x: 0.82, y: 0.62, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 7, x: 0.25, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
      { id: 8, x: 0.75, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 },
    ],
  },

  // ── 第 24 關：組合出擊 ───────────────────────────────
  // 策略重點：Meteor 開路 → Haste 衝城堡 → Fortify 守己方
  {
    id:            24,
    phase:         5,
    landmark:      false,
    name:          '第二十四戰：術師之塔',
    description:   '隕石轟開虛空封鎖，急行衝鋒，強化護城！',
    strategyLabel: '隕石開路→急行衝城→強化結界守，三術連發',
    aiDifficulty:  'hard',
    aiStyle:       'tactical',
    nodes: [
      { id: 0, x: 0.25, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 32 },
      { id: 1, x: 0.75, y: 0.10, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 2, x: 0.50, y: 0.16, type: 'VILLAGE', owner: 'player',  currentUnits: 14 },
      { id: 3, x: 0.14, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 4, x: 0.86, y: 0.44, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.50, y: 0.50, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 }, // ← Meteor 目標
      { id: 6, x: 0.50, y: 0.66, type: 'TOWER',   owner: 'enemy',   currentUnits: 14 }, // ← Meteor 目標
      { id: 7, x: 0.22, y: 0.78, type: 'CASTLE',  owner: 'enemy',   currentUnits: 36 }, // ← Haste 衝
      { id: 8, x: 0.50, y: 0.87, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 9, x: 0.78, y: 0.78, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 },
    ],
  },

  // ── 第 25 關：魔力巔峰 ───────────────────────────────
  // 策略重點：三個法術都有登場時機，判斷先後順序
  {
    id:            25,
    phase:         5,
    landmark:      false,
    name:          '第二十五戰：次元裂縫',
    description:   '三種法術齊登場，施放時機決定能否封閉裂縫！',
    strategyLabel: '奧術順序：隕石→急行→強化，精準用術封鎖虛空',
    aiDifficulty:  'hard',
    aiStyle:       'tactical',
    nodes: [
      { id: 0, x: 0.22, y: 0.11, type: 'CASTLE',  owner: 'player',  currentUnits: 38 },
      { id: 1, x: 0.78, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 2, x: 0.14, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 3, x: 0.50, y: 0.35, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 4, x: 0.86, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 9  },
      { id: 5, x: 0.22, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 }, // ← Meteor
      { id: 6, x: 0.50, y: 0.62, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 }, // ← Meteor
      { id: 7, x: 0.78, y: 0.62, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 8, x: 0.22, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 42 }, // ← Haste+Fortify
      { id: 9, x: 0.78, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 38 },
    ],
  },

  // ════════════════════════════════════════════════════════
  // PHASE 6：綜合挑戰（第 26–30 關）
  // ════════════════════════════════════════════════════════

  // ── 第 26 關：四面楚歌 ★（Phase 6 過渡關）──────────
  // 設計為「包圍感清晰但出路明確」：
  //   - 玩家城堡兵力提升至 50（有底氣嘗試）
  //   - 角落兩座中立塔（12 兵）明確可搶來守側翼
  //   - 敵村兵力降低（16 各）讓第一步有成功感
  //   - 最佳解：先搶角落塔 → 找最弱敵村 → 蠶食
  // ★ 記憶點：最強絕望感開局，但有清晰出路
  {
    id:            26,
    phase:         6,
    landmark:      true,
    name:          '第二十六戰：虛空門戶',
    description:   '城砦被虛空族四面包圍！奪下角落哨塔找突破口！',
    strategyLabel: '先搶角落哨塔護側翼，再從弱點蠶食虛空包圍圈',
    aiDifficulty:  'hard',
    aiStyle:       'aggressive',
    nodes: [
      { id: 0,  x: 0.50, y: 0.40, type: 'CASTLE',  owner: 'player',  currentUnits: 50 }, // ↑ 44→50
      { id: 1,  x: 0.14, y: 0.18, type: 'TOWER',   owner: 'neutral', currentUnits: 12 }, // ← 搶來守
      { id: 2,  x: 0.86, y: 0.18, type: 'TOWER',   owner: 'neutral', currentUnits: 12 }, // ← 搶來守
      { id: 3,  x: 0.50, y: 0.14, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 }, // ↓ 18→16
      { id: 4,  x: 0.20, y: 0.40, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 }, // ↓ 18→16
      { id: 5,  x: 0.80, y: 0.40, type: 'VILLAGE', owner: 'enemy',   currentUnits: 16 }, // ↓ 18→16
      { id: 6,  x: 0.35, y: 0.64, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 }, // ↓ 16→14
      { id: 7,  x: 0.65, y: 0.64, type: 'VILLAGE', owner: 'enemy',   currentUnits: 14 }, // ↓ 16→14
      { id: 8,  x: 0.14, y: 0.68, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 9,  x: 0.86, y: 0.68, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 10, x: 0.50, y: 0.84, type: 'CASTLE',  owner: 'enemy',   currentUnits: 32 }, // ↓ 36→32
    ],
  },

  // ── 第 27 關：鏡像決戰 ★ ────────────────────────────
  // 策略重點：完全對稱，靠法術時機與決策品質勝出
  // ★ 記憶點：「我們是一樣的」——靠智慧而非資源
  {
    id:            27,
    phase:         6,
    landmark:      true,
    name:          '第二十七戰：末日前哨',
    description:   '兵力完全對等！以奧術打破鏡像僵局，壓制虛空族！',
    strategyLabel: '隕石或急行術打破僵局，以法術決策碾壓虛空鏡像',
    aiDifficulty:  'hard',
    aiStyle:       'aggressive',
    nodes: [
      { id: 0,  x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 40 },
      { id: 1,  x: 0.22, y: 0.18, type: 'TOWER',   owner: 'player',  currentUnits: 16 },
      { id: 2,  x: 0.78, y: 0.18, type: 'TOWER',   owner: 'player',  currentUnits: 16 },
      { id: 3,  x: 0.22, y: 0.36, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 4,  x: 0.78, y: 0.36, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 5,  x: 0.50, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 }, // 中央爭奪點
      { id: 6,  x: 0.22, y: 0.64, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 7,  x: 0.78, y: 0.64, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 8,  x: 0.22, y: 0.82, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 },
      { id: 9,  x: 0.78, y: 0.82, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 },
      { id: 10, x: 0.50, y: 0.90, type: 'CASTLE',  owner: 'enemy',   currentUnits: 40 },
    ],
  },

  // ── 第 28 關：最後防線 ───────────────────────────────
  // 策略重點：Fortify 守主城，搶中央塔後反攻
  {
    id:            28,
    phase:         6,
    landmark:      false,
    name:          '第二十八戰：領主最後的堡壘',
    description:   '以三對五！強化結界死守，再奪中央塔逆轉局面！',
    strategyLabel: '強化結界熬住虛空攻勢，奪下中央哨塔後發起反攻',
    aiDifficulty:  'hard',
    aiStyle:       'aggressive',
    nodes: [
      { id: 0,  x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 44 },
      { id: 1,  x: 0.22, y: 0.18, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 2,  x: 0.78, y: 0.18, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 3,  x: 0.14, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4,  x: 0.50, y: 0.50, type: 'TOWER',   owner: 'neutral', currentUnits: 12 }, // ← 中央塔
      { id: 5,  x: 0.86, y: 0.50, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 6,  x: 0.22, y: 0.70, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 7,  x: 0.78, y: 0.70, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 8,  x: 0.22, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 45 },
      { id: 9,  x: 0.50, y: 0.80, type: 'VILLAGE', owner: 'enemy',   currentUnits: 18 },
      { id: 10, x: 0.78, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 42 },
    ],
  },

  // ── 第 29 關：天命之役 ───────────────────────────────
  // 策略重點：所有機制總動員——升級、法術、雙線分兵
  {
    id:            29,
    phase:         6,
    landmark:      false,
    name:          '第二十九戰：裂痕之心',
    description:   '虛空族全力傾巢而出，強化、奧術、分兵缺一不可！',
    strategyLabel: '強化據點＋奧術連發＋雙路分兵，封死裂痕之心',
    aiDifficulty:  'hard',
    aiStyle:       'aggressive',
    nodes: [
      { id: 0,  x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 45 },
      { id: 1,  x: 0.22, y: 0.16, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id: 2,  x: 0.78, y: 0.16, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id: 3,  x: 0.14, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 4,  x: 0.86, y: 0.38, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 5,  x: 0.35, y: 0.52, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 6,  x: 0.65, y: 0.52, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 7,  x: 0.22, y: 0.70, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 8,  x: 0.78, y: 0.70, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 9,  x: 0.22, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 46 },
      { id: 10, x: 0.50, y: 0.80, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 },
      { id: 11, x: 0.78, y: 0.87, type: 'CASTLE',  owner: 'enemy',   currentUnits: 42 },
    ],
  },

  // ── 第 30 關：天下一統 ★ ────────────────────────────
  // 策略重點：終極挑戰，每個決策都必須正確
  //   最佳解：搶側翼中立塔 → 升級村莊 → Meteor 削敵塔 → Haste 衝城堡
  // ★ 記憶點：通關後的史詩成就感
  {
    id:            30,
    phase:         6,
    landmark:      true,
    name:          '第三十戰：天際決戰',
    description:   '人類領主的最終決戰！封閉虛空裂縫，收復天際！',
    strategyLabel: '搶側翼哨塔→強化據點→隕石清路→急行衝鋒封縫',
    aiDifficulty:  'hard',
    aiStyle:       'aggressive',
    nodes: [
      { id: 0,  x: 0.50, y: 0.10, type: 'CASTLE',  owner: 'player',  currentUnits: 50 },
      { id: 1,  x: 0.22, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 24 },
      { id: 2,  x: 0.78, y: 0.14, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 3,  x: 0.14, y: 0.34, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 4,  x: 0.50, y: 0.30, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 5,  x: 0.86, y: 0.34, type: 'TOWER',   owner: 'neutral', currentUnits: 12 },
      { id: 6,  x: 0.14, y: 0.56, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 7,  x: 0.86, y: 0.56, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 8,  x: 0.25, y: 0.72, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 },
      { id: 9,  x: 0.75, y: 0.72, type: 'TOWER',   owner: 'enemy',   currentUnits: 16 },
      { id: 10, x: 0.22, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 50 },
      { id: 11, x: 0.50, y: 0.85, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id: 12, x: 0.78, y: 0.88, type: 'CASTLE',  owner: 'enemy',   currentUnits: 46 },
    ],
  },
];
