/**
 * AISystem.js - 敵方 AI 決策系統（單目標狀態機版 v2）
 *
 * ── 設計理念 ──────────────────────────────────────────────────────
 * AI 行為模擬「一般真人玩家」而非「最優電腦」：
 *   - 同一時間只有一個主攻目標（currentTargetNodeId）
 *   - 多個己方節點可「集火」同一目標，但不允許分兵打不同目標
 *   - 攻勢有冷卻期，不會一回合接一回合無止盡轟炸
 *   - 偶爾跳過出兵節拍，製造節奏感而非完美電腦式精準操作
 *
 * ── 狀態機 ────────────────────────────────────────────────────────
 *
 *   ┌──────┐  選定目標  ┌───────────┐  成功/超時/停滯  ┌──────────┐
 *   │ idle │ ─────────► │ attacking │ ───────────────► │ cooldown │
 *   └──────┘            └───────────┘                  └──────────┘
 *      ▲                                                     │
 *      └─────────────────── 冷卻結束 ──────────────────────────┘
 *
 *   idle      : 等待 thinkInterval 後選定新目標
 *   attacking : 每個節拍從多個己方節點集中送兵到同一目標
 *   cooldown  : 短暫思考冷卻，結束後回到 idle
 *
 * ── v2 新增改進 ───────────────────────────────────────────────────
 *
 *   1. 可行性檢查（feasibility）
 *      - idle 選定目標後，計算己方總可送兵量是否能打得過目標
 *      - 明顯打不贏時跳過（等兵力回充），避免白白送頭
 *
 *   2. 近勝豁免（near-victory bypass）
 *      - attacking 時，若目標兵力 ≤ nearVictoryUnits，暫停停滯計時
 *      - 不在「快贏了」的時候反而放棄進攻
 *
 *   3. 質心距離評分（centroid distance scoring）
 *      - _pickBestTarget 不再只用 sources[0] 計算距離
 *      - 改用所有就緒節點的平均座標，讓「全體最近目標」更準確
 *
 *   4. 慣性加分（momentum bonus）
 *      - 佔領節點後，記錄位置（lastConqueredX/Y）
 *      - 下次選目標時，距離上次佔領位置近的候選節點額外加分
 *      - 製造「打下一點再打旁邊那點」的戰略方向感
 *
 *   5. 波次變參（wave variance）
 *      - _sendWave 不再固定讓 maxSources 個節點全員出動
 *      - 每波隨機選 1~maxSources 個節點參戰
 *      - 讓攻勢強弱有變化，看起來更像真人節奏
 *
 * ── 停滯偵測 ──────────────────────────────────────────────────────
 * 每隔 stagnationCheckMs 比對目標兵力是否顯著減少；
 * 若沒有且目標未處於近勝狀態，視為攻勢停滯，提前放棄並進入 cooldown。
 */

import { AI_DIFFICULTY_PROFILES, UPGRADE_CONFIG } from '../config.js';

// ── 攻勢節奏參數（各難度獨立）──────────────────────────────────────
// 這些參數控制「人類化節奏」，與 AI_DIFFICULTY_PROFILES 裡的
// 戰鬥力參數（比例、評分）互相獨立，可分別調整。
const ATTACK_PARAMS = {
  easy: {
    maxAttackDurationMs:  28000,  // ↑ 22000→28000：攻勢持續更久才超時
    cooldownMinMs:         5000,  // ↑ 3500→5000：最短冷卻拉長
    cooldownMaxMs:        10500,  // ↑ 7500→10500：最長冷卻也拉長
    stagnationCheckMs:     9000,  // ↑ 7000→9000：停滯偵測更寬容
    stagnationThreshold:      5,
    waveMinUnits:            22,
    maxSources:               1,  // 一次只派一隊兵（單線進攻）
    sendChance:            0.70,
    nearVictoryUnits:         6,
    feasibilityFactor:      0.5,
    momentumBonus:           18,
    momentumRadius:         180,
    waveVariance:          0.55,
  },
  normal: {
    maxAttackDurationMs:  20000,  // ↑ 14000→20000
    cooldownMinMs:         3200,  // ↑ 2000→3200
    cooldownMaxMs:         8000,  // ↑ 5000→8000：攻一次要休息 3~8 秒
    stagnationCheckMs:     7000,  // ↑ 5000→7000
    stagnationThreshold:      4,
    waveMinUnits:            15,
    maxSources:               1,  // 一次只派一隊兵（單線進攻）
    sendChance:            0.82,
    nearVictoryUnits:         5,
    feasibilityFactor:      0.6,
    momentumBonus:           22,
    momentumRadius:         200,
    waveVariance:          0.50,  // ↑ 0.45→0.50
  },
  hard: {
    maxAttackDurationMs:  14000,  // ↑ 8000→14000
    cooldownMinMs:         1500,  // ↑ 700→1500
    cooldownMaxMs:         4500,  // ↑ 2500→4500
    stagnationCheckMs:     5000,  // ↑ 3000→5000
    stagnationThreshold:      3,
    waveMinUnits:            10,
    maxSources:               1,  // 一次只派一隊兵（單線進攻）
    sendChance:            0.90,  // ↓ 0.95→0.90：稍增停頓感
    nearVictoryUnits:         4,
    feasibilityFactor:      0.7,
    momentumBonus:           15,
    momentumRadius:         240,
    waveVariance:          0.40,  // ↑ 0.35→0.40
  },
};

// ── AI 升級節奏參數（各難度獨立）──────────────────────────────────────
//
// checkIntervalBase / checkVariance
//   AI 多久考慮一次升級（秒）。含隨機擺動，避免所有 AI 節點同時升級。
//
// upgradeChance
//   每次考慮升級時真正動手的機率（人類化）。
//   easy 的 AI 只有 30% 的機率真正決定升級，即使條件滿足。
//
// safetyMult
//   升級前，節點 currentUnits 必須 ≥ cost × safetyMult。
//   保留足夠兵力應對意外，避免剛升完就被打垮。
//
// typeBonus
//   各節點類型的升級基礎評分偏好（分越高越優先）：
//   Village > Castle > Tower（Village 為最高優先，因為提高生產對 AI 幫助最大）
//   easy AI 幾乎不升級 Tower（typeBonus 為 0）。
//
const UPGRADE_PARAMS = {
  easy: {
    checkIntervalBase: 13000,   // 約 13s 才考慮一次
    checkVariance:      6000,
    upgradeChance:      0.30,   // 30% 才真正升
    safetyMult:         2.4,    // 相當保守：需有 2.4 倍成本才動手
    typeBonus: { VILLAGE: 18, CASTLE: 8, TOWER: 0 },
  },
  normal: {
    checkIntervalBase:  8000,
    checkVariance:      3500,
    upgradeChance:      0.60,
    safetyMult:         1.8,
    typeBonus: { VILLAGE: 22, CASTLE: 14, TOWER: 6 },
  },
  hard: {
    checkIntervalBase:  5000,
    checkVariance:      2000,
    upgradeChance:      0.80,
    safetyMult:         1.4,    // 較積極，保留較少緩衝
    typeBonus: { VILLAGE: 24, CASTLE: 18, TOWER: 12 },
  },
};

// ── aiStyle 行為覆蓋表 ──────────────────────────────────────────────
// 每種風格對 ATTACK_PARAMS（ap）、UPGRADE_PARAMS（up）、profile 的修正量。
// 僅列出需要調整的欄位，其餘保持難度預設值不變。
//
// 風格對應關卡相位：
//   passive   → Phase 1–2：單線低頻，讓玩家學基本操作
//   exploring → Phase 2–3：偏好中立節點，模擬 AI 在擴張
//   balanced  → Phase 3   ：無修正，使用難度預設值
//   upgrader  → Phase 4   ：積極升級、攻擊較慢
//   tactical  → Phase 5   ：較短停滯容忍、節奏緊湊
//   aggressive→ Phase 6   ：最短冷卻、最高出兵率
const STYLE_OVERRIDES = {
  passive: {
    ap: {
      cooldownMinMs:   (v) => v * 1.8,
      cooldownMaxMs:   (v) => v * 1.6,
      maxSources:      (_) => 1,
      sendChance:      (v) => Math.max(0.45, v - 0.18),
      waveVariance:    (v) => Math.min(1.0, v + 0.25),
    },
    up: {
      upgradeChance:   (_) => 0.08,   // 幾乎不升級
    },
  },
  exploring: {
    ap: {
      cooldownMinMs:   (v) => v * 1.2,
      cooldownMaxMs:   (v) => v * 1.15,
    },
    profile: {
      neutralBonus:    (v) => v + 14,  // 積極搶空地
    },
  },
  balanced: {
    // 無修正，使用難度預設值
  },
  upgrader: {
    ap: {
      cooldownMinMs:   (v) => v * 1.35,
      cooldownMaxMs:   (v) => v * 1.25,
      sendChance:      (v) => Math.max(0.55, v - 0.10),
    },
    up: {
      upgradeChance:   (v) => Math.min(0.95, v * 1.45),
      checkIntervalBase: (v) => Math.max(3000, v * 0.65),
    },
  },
  tactical: {
    ap: {
      cooldownMinMs:   (v) => v * 0.85,
      cooldownMaxMs:   (v) => v * 0.85,
      stagnationCheckMs: (v) => v * 0.80,
    },
  },
  aggressive: {
    ap: {
      cooldownMinMs:   (v) => v * 0.65,
      cooldownMaxMs:   (v) => v * 0.65,
      sendChance:      (v) => Math.min(0.98, v + 0.06),
      maxSources:      (v) => v + 1,
    },
    up: {
      upgradeChance:   (v) => Math.min(0.92, v * 1.15),
    },
  },
};

/** 將 overrides 物件的函式套用到目標參數物件上（原地修改） */
function _applyOverrides(target, overrides) {
  if (!overrides) return;
  for (const [key, fn] of Object.entries(overrides)) {
    if (typeof fn === 'function' && key in target) {
      target[key] = fn(target[key]);
    }
  }
}

export class AISystem {
  /**
   * @param {'easy'|'normal'|'hard'} difficulty
   * @param {'passive'|'exploring'|'balanced'|'upgrader'|'tactical'|'aggressive'} aiStyle
   */
  constructor(difficulty = 'normal', aiStyle = 'balanced') {
    /** 戰鬥力參數（比例、評分門檻） */
    this.profile = { ...(AI_DIFFICULTY_PROFILES[difficulty] ?? AI_DIFFICULTY_PROFILES.normal) };
    /** 節奏參數（時間、集火上限） */
    this.ap = { ...(ATTACK_PARAMS[difficulty] ?? ATTACK_PARAMS.normal) };
    /** 升級參數（各難度獨立）*/
    this.up = { ...(UPGRADE_PARAMS[difficulty] ?? UPGRADE_PARAMS.normal) };

    // ── 套用 aiStyle 覆蓋（在基礎難度參數之上微調）──
    const overrides = STYLE_OVERRIDES[aiStyle] ?? {};
    _applyOverrides(this.ap,      overrides.ap);
    _applyOverrides(this.up,      overrides.up);
    _applyOverrides(this.profile, overrides.profile);

    // ── 決策節拍計時器 ──
    this.timer     = 0;
    const iv       = this.profile.thinkInterval;
    // 首次決策加入隨機延遲，避免開局瞬間出動
    this.nextThink = iv * 0.6 + Math.random() * iv * 0.8;

    // ── 狀態機欄位 ──────────────────────────────────────────

    /** @type {'idle'|'attacking'|'cooldown'} */
    this.attackState = 'idle';

    /**
     * 目前主攻目標的 node.id（null = 無目標）
     * @type {number|null}
     */
    this.currentTargetNodeId = null;

    /** 本次攻勢已持續毫秒（用於超時判定） */
    this.attackElapsedMs = 0;

    /** 冷卻已過毫秒 */
    this.cooldownElapsedMs = 0;

    /** 本次冷卻總長（每次隨機產生） */
    this.cooldownDurationMs = 0;

    /**
     * 上次停滯檢查時記錄的目標兵力
     * 初始為 Infinity，確保第一次檢查不誤判
     */
    this.lastTargetUnitCount = Infinity;

    /** 距下次停滯檢查的倒數計時 */
    this.stagnationTimer = 0;

    // ── v2 新增狀態欄位 ──────────────────────────────────────

    /**
     * 上次成功佔領的節點座標（用於慣性加分）
     * null 表示本局尚未佔領任何節點
     * @type {number|null}
     */
    this.lastConqueredX = null;
    /** @type {number|null} */
    this.lastConqueredY = null;

    // ── 升級節奏計時器 ───────────────────────────────────────────
    // 與攻擊狀態機獨立運行，每隔 checkInterval ms 評估一次升級機會。
    // 僅在 idle / cooldown 狀態下執行（攻擊中不消耗節點兵力）。

    /** 距下次升級評估的倒數（ms） */
    this._upgradeTimer = 0;
    /** 本輪升級評估的間隔（每次重設時隨機產生） */
    this._nextUpgradeCheck = this.up.checkIntervalBase + Math.random() * this.up.checkVariance;
  }

  // ── 公開介面 ──────────────────────────────────────────────────

  /**
   * 每幀呼叫，根據 attackState 分流執行
   *
   * @param {number}   delta
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   * @param {Function} sendTroops  callback(fromNode, toNode, ratio)
   */
  update(delta, nodes, sendTroops) {
    switch (this.attackState) {
      case 'idle':      this._updateIdle(delta, nodes, sendTroops);      break;
      case 'attacking': this._updateAttacking(delta, nodes, sendTroops); break;
      case 'cooldown':  this._updateCooldown(delta);                      break;
    }

    // 升級判斷：與攻擊狀態機完全獨立，但攻擊中跳過
    // （避免在關鍵攻勢時消耗節點兵力導致進攻失力）
    if (this.attackState !== 'attacking') {
      this._updateUpgrade(delta, nodes);
    }
  }

  // ── 各狀態處理 ────────────────────────────────────────────────

  /**
   * idle：等待 thinkInterval 後評估並選定主攻目標
   *
   * v2 新增：
   *   - 用全部就緒節點的質心計算候選目標距離（更準確）
   *   - 可行性檢查：總兵力不足時不貿然進攻
   */
  _updateIdle(delta, nodes, sendTroops) {
    this.timer += delta;
    if (this.timer < this.nextThink) return;
    this._resetThinkTimer();

    // 找到兵力足夠的己方節點（按兵力由高到低）
    const sources = this._getReadySources(nodes);
    const targets = nodes.filter(n => n.owner !== 'enemy');
    if (sources.length === 0 || targets.length === 0) return;

    // ── v2：計算所有就緒節點的質心，作為距離評分基準 ──
    const centroid = this._calcCentroid(sources);

    // 選出評分最高的目標（傳入質心而非 sources[0]）
    const best = this._pickBestTarget(centroid, targets);
    if (!best) return;

    // ── v2：可行性檢查 ──────────────────────────────────────
    // 計算本波能送出的總兵力，若遠不及目標防禦力，等兵力回充再攻
    const totalSendable = sources
      .slice(0, this.ap.maxSources)
      .reduce((sum, src) => {
        const ratio = this._calcRatio(src, best.node);
        return sum + src.currentUnits * ratio;
      }, 0);

    const effectiveDefense = best.node.currentUnits * best.node.defenseMultiplier;
    if (best.node.owner !== 'neutral' && totalSendable < effectiveDefense * this.ap.feasibilityFactor) {
      // 打不過，暫時跳過這一輪（繼續等兵力恢復）
      return;
    }
    // ────────────────────────────────────────────────────────

    // 正式進入攻擊狀態
    this.currentTargetNodeId = best.node.id;
    this.attackState         = 'attacking';
    this.attackElapsedMs     = 0;
    this.stagnationTimer     = 0;
    this.lastTargetUnitCount = best.node.currentUnits;

    // 立即執行第一波出兵（不等下一個節拍）
    this._sendWave(nodes, sendTroops);
  }

  /**
   * attacking：每個節拍把多個己方節點的兵力集中打同一目標
   * 遇到成功、超時、停滯時進入 cooldown
   *
   * v2 新增：
   *   - 目標快被打下（近勝）時暫停停滯計時，避免功虧一簣地放棄
   *   - 成功佔領後記錄座標，供下次選目標的慣性加分使用
   */
  _updateAttacking(delta, nodes, sendTroops) {
    const target = nodes.find(n => n.id === this.currentTargetNodeId);

    // ① 目標已被 AI 佔領（攻勢成功）
    if (!target || target.owner === 'enemy') {
      // v2：記錄本次佔領位置，供下次慣性加分
      if (target && target.owner === 'enemy') {
        this.lastConqueredX = target.x;
        this.lastConqueredY = target.y;
      }
      this._enterCooldown();
      return;
    }

    // ② 攻勢超時（打太久了，放棄）
    this.attackElapsedMs += delta;
    if (this.attackElapsedMs >= this.ap.maxAttackDurationMs) {
      this._enterCooldown();
      return;
    }

    // ③ 停滯偵測：定期檢查目標兵力是否有顯著下降
    //    v2：若目標兵力 ≤ nearVictoryUnits（快贏了），跳過停滯判定
    this.stagnationTimer += delta;
    if (this.stagnationTimer >= this.ap.stagnationCheckMs) {
      const isNearVictory = target.currentUnits <= this.ap.nearVictoryUnits;

      if (!isNearVictory) {
        // 目標兵力尚多，執行停滯判定
        const decreased = this.lastTargetUnitCount - target.currentUnits;
        if (decreased < this.ap.stagnationThreshold) {
          // 兵力沒有顯著減少 → 攻勢停滯，放棄
          this._enterCooldown();
          return;
        }
      }
      // 近勝或有進展：更新記錄，重置計時
      this.lastTargetUnitCount = target.currentUnits;
      this.stagnationTimer     = 0;
    }

    // ④ 等待節拍
    this.timer += delta;
    if (this.timer < this.nextThink) return;
    this._resetThinkTimer();

    // ⑤ 人類化：以 sendChance 機率跳過本節拍出兵（製造停頓感）
    if (Math.random() > this.ap.sendChance) return;

    this._sendWave(nodes, sendTroops);
  }

  /**
   * cooldown：短暫停頓後回到 idle，讓 AI 有喘息感
   */
  _updateCooldown(delta) {
    this.cooldownElapsedMs += delta;
    if (this.cooldownElapsedMs < this.cooldownDurationMs) return;

    // 冷卻結束 → 回到 idle
    this.attackState         = 'idle';
    this.currentTargetNodeId = null;
    this.timer               = 0;
    // idle 進入後也稍等一會才選下一個目標（不要冷卻剛結束就馬上衝）
    const iv = this.profile.thinkInterval;
    this.nextThink = iv * 0.4 + Math.random() * iv * 0.6;
  }

  // ── 出兵波次 ──────────────────────────────────────────────────

  /**
   * 從多個己方節點集中出兵攻打 currentTargetNodeId
   * 只允許打同一個目標（單目標原則核心）
   *
   * v2 新增：波次變參（waveVariance）
   *   - 每波隨機決定本次出動節點數（1 ~ maxSources）
   *   - 不總是全員出動，強弱有別，節奏更自然
   */
  _sendWave(nodes, sendTroops) {
    const target = nodes.find(n => n.id === this.currentTargetNodeId);
    if (!target) return;

    const allSources = this._getReadySources(nodes);

    // v2：波次變參：本波參戰節點數在 minCount ~ maxSources 之間隨機
    const minCount  = Math.max(1, Math.ceil(this.ap.maxSources * this.ap.waveVariance));
    const waveCount = minCount + Math.floor(Math.random() * (this.ap.maxSources - minCount + 1));
    const sources   = allSources.slice(0, waveCount);

    for (const src of sources) {
      const ratio = this._calcRatio(src, target);
      // 確保出兵後自身仍保留 minReserveUnits
      if (src.currentUnits * ratio >= this.profile.minReserveUnits) {
        sendTroops(src, target, ratio);
      }
    }
  }

  // ── 輔助方法 ──────────────────────────────────────────────────

  /**
   * 取得兵力達到 waveMinUnits 的己方節點，按兵力由高到低排序
   * waveMinUnits 高於 profile.minAttackUnits，確保出兵有一定份量
   */
  _getReadySources(nodes) {
    return nodes
      .filter(n => n.owner === 'enemy' && n.currentUnits >= this.ap.waveMinUnits)
      .sort((a, b) => b.currentUnits - a.currentUnits);
  }

  /** 進入冷卻狀態，冷卻時長隨機 */
  _enterCooldown() {
    this.attackState       = 'cooldown';
    this.cooldownElapsedMs = 0;
    const { cooldownMinMs, cooldownMaxMs } = this.ap;
    this.cooldownDurationMs = cooldownMinMs + Math.random() * (cooldownMaxMs - cooldownMinMs);
    this.timer              = 0;
  }

  /** 重置節拍計時器（加入隨機擺動） */
  _resetThinkTimer() {
    this.timer = 0;
    const v    = this.profile.thinkVariance;
    this.nextThink = this.profile.thinkInterval + Math.random() * v - v * 0.5;
  }

  /**
   * 根據攻擊源與目標決定送兵比例
   * 保留原有的三段式邏輯（neutral / outgunned / default）
   */
  _calcRatio(src, target) {
    if (target.owner === 'neutral') return this.profile.ratioNeutral;
    const neededToWin = target.currentUnits * target.defenseMultiplier;
    if (src.currentUnits * this.profile.ratioDefault < neededToWin) return this.profile.ratioOutgunned;
    return this.profile.ratioDefault;
  }

  /**
   * 從候選目標清單中評分，回傳最佳目標
   *
   * v2 改進：
   *   - origin 參數改為質心座標（非 sources[0]）
   *   - 加入慣性加分（lastConqueredX/Y 附近目標加分）
   *
   * @param {{ x: number, y: number }} origin  - 距離計算起點（質心）
   * @param {NodeBuilding[]}           targets
   * @returns {{ node, score } | null}
   */
  _pickBestTarget(origin, targets) {
    let best = null;

    for (const t of targets) {
      let score = 0;

      // 中立目標加分（容易佔領，擴張效益高）
      if (t.owner === 'neutral') score += this.profile.neutralBonus;

      // 弱點加分（兵力越少越好打）
      score += Math.max(0, 60 - t.currentUnits);

      // 距離懲罰（遠的目標扣分，v2：用質心距離）
      score -= this._distXY(origin.x, origin.y, t.x, t.y) * 0.04;

      // 兵力劣勢時對玩家節點扣分（避免白送）
      const neededToWin = t.currentUnits * t.defenseMultiplier;
      if (origin.strength !== undefined &&
          origin.strength * this.profile.ratioDefault < neededToWin &&
          t.owner === 'player') {
        score -= this.profile.avoidStrongPenalty;
      }

      // v2：慣性加分 ─ 距離上次佔領位置近的目標額外加分
      if (this.lastConqueredX !== null) {
        const dFromLast = this._distXY(this.lastConqueredX, this.lastConqueredY, t.x, t.y);
        if (dFromLast < this.ap.momentumRadius) {
          // 越近加分越多（線性衰減）
          score += this.ap.momentumBonus * (1 - dFromLast / this.ap.momentumRadius);
        }
      }

      if (!best || score > best.score) best = { node: t, score };
    }

    return best && best.score > this.profile.scoreThreshold ? best : null;
  }

  // ── v2 新增輔助方法 ──────────────────────────────────────────

  /**
   * 計算多個節點的質心（平均座標）
   * 附帶 strength 欄位（最強節點兵力，供 _pickBestTarget 劣勢判定用）
   * @param {NodeBuilding[]} nodes
   * @returns {{ x: number, y: number, strength: number }}
   */
  _calcCentroid(nodes) {
    if (nodes.length === 0) return { x: 0, y: 0, strength: 0 };
    const sumX = nodes.reduce((s, n) => s + n.x, 0);
    const sumY = nodes.reduce((s, n) => s + n.y, 0);
    return {
      x:        sumX / nodes.length,
      y:        sumY / nodes.length,
      strength: nodes[0].currentUnits,   // 已排序，[0] 為最強
    };
  }

  /** 兩點距離（直接以 x/y 參數接收，避免多餘物件建立） */
  _distXY(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  /** 相容舊介面（_dist(a, b)） */
  _dist(a, b) {
    return this._distXY(a.x, a.y, b.x, b.y);
  }

  // ── AI 升級系統 ──────────────────────────────────────────────────
  //
  // 設計原則：
  //   1. 與攻擊狀態機完全分離，不共用計時器，也不中斷進攻節拍
  //   2. 只在 idle / cooldown 時執行（update() 中已過濾 attacking 狀態）
  //   3. 用雙層隨機（定時 + 機率）模仿人類偶爾才想到要升級的直覺
  //   4. 安全緩衝（safetyMult）確保 AI 不會把節點兵力燒光後馬上被打
  //
  // AI 升級優先順序（由 typeBonus 驅動）：
  //   Village > Castle > Tower
  //   理由：Village 升級提升 productionRate 最明顯，長期經濟效益高；
  //         Tower 只有在節點「相當飽和」時才值得，hard AI 才較積極升塔。

  /**
   * 每幀計時，定期評估是否要升級某個 AI 節點。
   * @param {number} delta
   * @param {NodeBuilding[]} nodes
   */
  _updateUpgrade(delta, nodes) {
    this._upgradeTimer += delta;
    if (this._upgradeTimer < this._nextUpgradeCheck) return;

    // 重置計時器（每次加入隨機擺動，避免固定節奏）
    this._upgradeTimer = 0;
    this._nextUpgradeCheck = this.up.checkIntervalBase + Math.random() * this.up.checkVariance;

    // 人類化：即使條件滿足也不一定真的動手
    if (Math.random() > this.up.upgradeChance) return;

    // 挑選最值得升級的節點並執行
    const best = this._pickUpgradeTarget(nodes);
    if (best) best.upgrade();   // upgrade() 內部已處理：扣兵、提升屬性、觸發視覺
  }

  /**
   * 從所有 AI 節點中選出最值得升級的一個。
   *
   * 評分維度：
   *   typeBonus    → 節點類型本身的升級偏好（Village 最高）
   *   levelBonus   → 優先做第一次升級（1→2 相對收益最大）
   *   richBonus    → 節點兵力越飽和越安全，可以多加分
   *
   * 安全門檻（safetyMult）：
   *   currentUnits 必須 ≥ cost × safetyMult
   *   確保升完還有足夠兵力守住節點，不會剛升級就被 oneshot
   *
   * @param {NodeBuilding[]} nodes
   * @returns {NodeBuilding|null}
   */
  _pickUpgradeTarget(nodes) {
    let bestNode  = null;
    let bestScore = 0;   // 分數必須 > 0 才考慮（負分不動手）

    for (const node of nodes) {
      // 只考慮己方（enemy = AI 陣營）且未達滿級的節點
      if (node.owner !== 'enemy' || node.level >= 3) continue;

      // 取升級成本
      const costIdx = node.level - 1;   // 0 = 1→2, 1 = 2→3
      const cost    = UPGRADE_CONFIG[node.type].costs[costIdx];

      // 安全門檻：節點兵力必須超過「成本 × 安全倍數」
      if (node.currentUnits < cost * this.up.safetyMult) continue;

      // ── 評分 ──────────────────────────────────────────────
      // 類型偏好（按難度設定不同，easy AI 幾乎不動 Tower）
      let score = this.up.typeBonus[node.type] ?? 8;

      // 等級越低加分越多（第一次升級相對收益更大）
      score += (3 - node.level) * 7;

      // 兵力飽和度：越飽和代表節點越穩定，安全性更高
      const saturation = Math.min(node.currentUnits / node.maxUnits, 1.0);
      score += saturation * 10;

      if (score > bestScore) {
        bestScore = score;
        bestNode  = node;
      }
    }

    return bestNode;   // null = 沒有值得升級的節點
  }
}
