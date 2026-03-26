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

import { AI_DIFFICULTY_PROFILES } from '../config.js';

// ── 攻勢節奏參數（各難度獨立）──────────────────────────────────────
// 這些參數控制「人類化節奏」，與 AI_DIFFICULTY_PROFILES 裡的
// 戰鬥力參數（比例、評分）互相獨立，可分別調整。
const ATTACK_PARAMS = {
  easy: {
    maxAttackDurationMs:  22000,  // 最長攻勢（超時即放棄）
    cooldownMinMs:         3500,  // 冷卻最短時間
    cooldownMaxMs:         7500,  // 冷卻最長時間（隨機）
    stagnationCheckMs:     7000,  // 停滯檢查間隔
    stagnationThreshold:      5,  // 目標兵力減少 < 此值視為停滯
    waveMinUnits:            22,  // 參戰節點最低兵力（低於此不出兵）
    maxSources:               2,  // 同時支援的己方節點上限
    sendChance:            0.70,  // 每節拍真正出兵的機率（節奏人類化）
    // ── v2 新增 ──
    nearVictoryUnits:         6,  // 目標兵力 ≤ 此值視為「近勝」，暫停停滯判定
    feasibilityFactor:      0.5,  // 己方總送兵 < 目標防禦 * 此值時跳過攻擊
    momentumBonus:           18,  // 距上次佔領位置 momentumRadius 內的目標加分
    momentumRadius:         180,  // 慣性加分的有效半徑（像素）
    waveVariance:          0.55,  // 波次參戰節點數的最低比例（1 = 全員）
  },
  normal: {
    maxAttackDurationMs:  14000,
    cooldownMinMs:         2000,
    cooldownMaxMs:         5000,
    stagnationCheckMs:     5000,
    stagnationThreshold:      4,
    waveMinUnits:            15,
    maxSources:               3,
    sendChance:            0.85,
    // ── v2 新增 ──
    nearVictoryUnits:         5,
    feasibilityFactor:      0.6,
    momentumBonus:           22,
    momentumRadius:         200,
    waveVariance:          0.45,
  },
  hard: {
    maxAttackDurationMs:   8000,
    cooldownMinMs:          700,
    cooldownMaxMs:         2500,
    stagnationCheckMs:     3000,
    stagnationThreshold:      3,
    waveMinUnits:            10,
    maxSources:               5,
    sendChance:            0.95,
    // ── v2 新增 ──
    nearVictoryUnits:         4,
    feasibilityFactor:      0.7,
    momentumBonus:           15,
    momentumRadius:         240,
    waveVariance:          0.35,
  },
};

export class AISystem {
  /**
   * @param {'easy'|'normal'|'hard'} difficulty
   */
  constructor(difficulty = 'normal') {
    /** 戰鬥力參數（比例、評分門檻） */
    this.profile = AI_DIFFICULTY_PROFILES[difficulty] ?? AI_DIFFICULTY_PROFILES.normal;
    /** 節奏參數（時間、集火上限） */
    this.ap = ATTACK_PARAMS[difficulty] ?? ATTACK_PARAMS.normal;

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
}
