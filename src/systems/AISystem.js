/**
 * AISystem.js - 敵方 AI 決策系統（單目標狀態機版）
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
 * ── 停滯偵測 ──────────────────────────────────────────────────────
 * 每隔 stagnationCheckMs 比對目標兵力是否顯著減少；
 * 若沒有，視為攻勢停滯，提前放棄並進入 cooldown。
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
   */
  _updateIdle(delta, nodes, sendTroops) {
    this.timer += delta;
    if (this.timer < this.nextThink) return;
    this._resetThinkTimer();

    // 找到兵力足夠的己方節點（按兵力由高到低）
    const sources = this._getReadySources(nodes);
    const targets = nodes.filter(n => n.owner !== 'enemy');
    if (sources.length === 0 || targets.length === 0) return;

    // 用最強節點作為評分視角，選出全局最佳目標
    const best = this._pickBestTarget(sources[0], targets);
    if (!best) return;

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
   */
  _updateAttacking(delta, nodes, sendTroops) {
    const target = nodes.find(n => n.id === this.currentTargetNodeId);

    // ① 目標已被 AI 佔領（攻勢成功）
    if (!target || target.owner === 'enemy') {
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
    this.stagnationTimer += delta;
    if (this.stagnationTimer >= this.ap.stagnationCheckMs) {
      const decreased = this.lastTargetUnitCount - target.currentUnits;
      if (decreased < this.ap.stagnationThreshold) {
        // 兵力沒有顯著減少 → 攻勢停滯，放棄
        this._enterCooldown();
        return;
      }
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
   */
  _sendWave(nodes, sendTroops) {
    const target = nodes.find(n => n.id === this.currentTargetNodeId);
    if (!target) return;

    // 取前 maxSources 個兵力最強的己方節點參戰
    const sources = this._getReadySources(nodes).slice(0, this.ap.maxSources);

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
   * src 作為評分視角（距離計算基準）
   * @returns {{ node, score } | null}
   */
  _pickBestTarget(src, targets) {
    let best = null;

    for (const t of targets) {
      let score = 0;

      // 中立目標加分（容易佔領，擴張效益高）
      if (t.owner === 'neutral') score += this.profile.neutralBonus;

      // 弱點加分（兵力越少越好打）
      score += Math.max(0, 60 - t.currentUnits);

      // 距離懲罰（遠的目標扣分）
      score -= this._dist(src, t) * 0.04;

      // 兵力劣勢時對玩家節點扣分（避免白送）
      const neededToWin = t.currentUnits * t.defenseMultiplier;
      if (src.currentUnits * this.profile.ratioDefault < neededToWin && t.owner === 'player') {
        score -= this.profile.avoidStrongPenalty;
      }

      if (!best || score > best.score) best = { node: t, score };
    }

    return best && best.score > this.profile.scoreThreshold ? best : null;
  }

  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }
}
