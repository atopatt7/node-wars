/**
 * levels.js - 5 關卡設計資料
 *
 * 節點座標使用 0~1 正規化，遊戲啟動時依畫布尺寸換算實際像素。
 * 上下各保留 HUD 空間（約 10% padding）。
 *
 * 建築類型：VILLAGE（村莊）、CASTLE（城堡）、TOWER（箭塔）
 * 陣營：player（藍）、enemy（紅）、neutral（灰）
 */
export const LEVELS = [
  // ── 第一關：小村衝突（簡單，4 節點）──
  {
    id:           1,
    name:         '第一關：小村衝突',
    description:  '奪取敵方所有建築',
    aiDifficulty: 'easy',
    nodes: [
      { id: 0, x: 0.50, y: 0.10, type: 'VILLAGE', owner: 'player',  currentUnits: 20 },
      { id: 1, x: 0.22, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 2, x: 0.78, y: 0.48, type: 'VILLAGE', owner: 'neutral', currentUnits: 8  },
      { id: 3, x: 0.50, y: 0.88, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
    ],
  },

  // ── 第二關：平原爭奪（中等，6 節點，含城堡）──
  {
    id:           2,
    name:         '第二關：平原爭奪',
    description:  '小心敵人的城堡',
    aiDifficulty: 'normal',
    nodes: [
      { id: 0, x: 0.20, y: 0.09, type: 'VILLAGE', owner: 'player',  currentUnits: 25 },
      { id: 1, x: 0.80, y: 0.09, type: 'VILLAGE', owner: 'player',  currentUnits: 15 },
      { id: 2, x: 0.50, y: 0.34, type: 'VILLAGE', owner: 'neutral', currentUnits: 12 },
      { id: 3, x: 0.15, y: 0.62, type: 'TOWER',   owner: 'neutral', currentUnits: 8  },
      { id: 4, x: 0.85, y: 0.62, type: 'TOWER',   owner: 'neutral', currentUnits: 8  },
      { id: 5, x: 0.50, y: 0.89, type: 'CASTLE',  owner: 'enemy',   currentUnits: 35 },
    ],
  },

  // ── 第三關：要塞突破（中偏難，8 節點，敵方守塔）──
  {
    id:           3,
    name:         '第三關：要塞突破',
    description:  '敵人佔有多個防禦塔',
    aiDifficulty: 'normal',
    nodes: [
      { id: 0, x: 0.50, y: 0.07, type: 'CASTLE',  owner: 'player',  currentUnits: 40 },
      { id: 1, x: 0.20, y: 0.27, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 2, x: 0.80, y: 0.27, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id: 3, x: 0.10, y: 0.53, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 },
      { id: 4, x: 0.50, y: 0.53, type: 'VILLAGE', owner: 'neutral', currentUnits: 12 },
      { id: 5, x: 0.90, y: 0.53, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 },
      { id: 6, x: 0.30, y: 0.83, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 7, x: 0.70, y: 0.83, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
    ],
  },

  // ── 第四關：四方圍攻（難，11 節點，多線防守）──
  {
    id:           4,
    name:         '第四關：四方圍攻',
    description:  '多線防守與進攻',
    aiDifficulty: 'hard',
    nodes: [
      { id:  0, x: 0.50, y: 0.07, type: 'VILLAGE', owner: 'player',  currentUnits: 22 },
      { id:  1, x: 0.15, y: 0.22, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id:  2, x: 0.85, y: 0.22, type: 'VILLAGE', owner: 'player',  currentUnits: 18 },
      { id:  3, x: 0.30, y: 0.44, type: 'TOWER',   owner: 'neutral', currentUnits: 10 },
      { id:  4, x: 0.70, y: 0.44, type: 'TOWER',   owner: 'neutral', currentUnits: 10 },
      { id:  5, x: 0.50, y: 0.48, type: 'CASTLE',  owner: 'neutral', currentUnits: 28 },
      { id:  6, x: 0.10, y: 0.72, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id:  7, x: 0.50, y: 0.82, type: 'CASTLE',  owner: 'enemy',   currentUnits: 45 },
      { id:  8, x: 0.90, y: 0.72, type: 'VILLAGE', owner: 'enemy',   currentUnits: 20 },
      { id:  9, x: 0.28, y: 0.91, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 },
      { id: 10, x: 0.72, y: 0.91, type: 'TOWER',   owner: 'enemy',   currentUnits: 15 },
    ],
  },

  // ── 第五關：最終決戰（最難，13 節點，以寡擊眾）──
  {
    id:           5,
    name:         '第五關：最終決戰',
    description:  '以寡擊眾，奪取全境！',
    aiDifficulty: 'hard',
    nodes: [
      { id:  0, x: 0.50, y: 0.06, type: 'CASTLE',  owner: 'player',  currentUnits: 55 },
      { id:  1, x: 0.20, y: 0.17, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id:  2, x: 0.80, y: 0.17, type: 'VILLAGE', owner: 'neutral', currentUnits: 10 },
      { id:  3, x: 0.08, y: 0.36, type: 'TOWER',   owner: 'neutral', currentUnits:  8 },
      { id:  4, x: 0.50, y: 0.36, type: 'VILLAGE', owner: 'neutral', currentUnits: 12 },
      { id:  5, x: 0.92, y: 0.36, type: 'TOWER',   owner: 'neutral', currentUnits:  8 },
      { id:  6, x: 0.25, y: 0.57, type: 'CASTLE',  owner: 'enemy',   currentUnits: 42 },
      { id:  7, x: 0.75, y: 0.57, type: 'CASTLE',  owner: 'enemy',   currentUnits: 42 },
      { id:  8, x: 0.08, y: 0.75, type: 'TOWER',   owner: 'enemy',   currentUnits: 20 },
      { id:  9, x: 0.50, y: 0.75, type: 'VILLAGE', owner: 'enemy',   currentUnits: 28 },
      { id: 10, x: 0.92, y: 0.75, type: 'TOWER',   owner: 'enemy',   currentUnits: 20 },
      { id: 11, x: 0.33, y: 0.91, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
      { id: 12, x: 0.67, y: 0.91, type: 'VILLAGE', owner: 'enemy',   currentUnits: 22 },
    ],
  },
];
