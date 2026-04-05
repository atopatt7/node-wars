/**
 * SpellSystem.js - 法術系統
 *
 * 職責：
 *   - 管理玩家魔力值（mana）的生成與消耗
 *   - 三種法術（Haste / Meteor / Fortify）的冷卻計時
 *   - 施法驗證（目標類型、魔力是否足夠、冷卻是否結束）
 *   - 施法效果（直接將 buff 時間戳寫入 NodeBuilding，
 *               由 ProductionSystem / CombatSystem 在各自 update 中讀取）
 *
 * ── 施法流程 ──────────────────────────────────────────────
 *   1. 玩家點擊法術按鈕
 *      → UIController 呼叫 spellSystem.selectSpell(id)
 *      → _pendingSpell 記錄等待施放的法術 id
 *
 *   2. 玩家點擊目標節點
 *      → GameScene._tryCastSpell(node)
 *      → spellSystem.cast(pendingSpell, node) 執行效果
 *      → 回傳 feedback，GameScene 播放浮動文字
 *
 *   取消方式：
 *      - 再次點擊同一法術按鈕
 *      - 右鍵 / 點擊空白處（GameScene 呼叫 cancelPending()）
 *
 * ── Buff 效果欄位（NodeBuilding 上）──────────────────────
 *   _hasteExpiry    Haste 效果到期時間（Date.now() 格式）
 *   _fortifyExpiry  Fortify 效果到期時間
 *   _meteorExpiry   Meteor 撞擊動畫到期時間（純視覺）
 *
 * ── 各系統如何讀取 buff ──────────────────────────────────
 *   ProductionSystem  → 生兵前檢查 _hasteExpiry，有效時乘以 2.5
 *   CombatSystem      → 計算防禦力前檢查 _fortifyExpiry，有效時加 defBonus
 *   NodeBuilding.draw → 繪製對應視覺特效（旋轉電弧 / 金色護盾 / 撞擊衝擊波）
 */

import { SPELL_CONFIG } from '../config.js';

export class SpellSystem {
  constructor() {
    /** 當前魔力值（0 ~ maxMana） */
    this.mana    = 50;
    /** 魔力上限 */
    this.maxMana = 100;
    /** 每秒魔力回復量 */
    this.manaRegen = 4;   // 約 12.5s 從 0 回滿（讓魔力成為真正資源）

    /**
     * 各法術剩餘冷卻毫秒（0 = 可施放）
     * @type {Record<string, number>}
     */
    this._cooldowns = {};
    for (const id of Object.keys(SPELL_CONFIG)) {
      this._cooldowns[id] = 0;
    }

    /**
     * 等待施放的法術 id（null = 未選取任何法術）
     * 選取後，下一次點擊有效目標即施放。
     * @type {string|null}
     */
    this._pendingSpell = null;
  }

  // ── 公開 API ──────────────────────────────────────────

  /**
   * 每幀呼叫：回復魔力 + 計時各法術冷卻
   * @param {number} delta 幀間隔（ms）
   */
  update(delta) {
    // 魔力回復（不超過上限）
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * (delta / 1000));

    // 冷卻倒計時
    for (const id of Object.keys(this._cooldowns)) {
      if (this._cooldowns[id] > 0) {
        this._cooldowns[id] = Math.max(0, this._cooldowns[id] - delta);
      }
    }
  }

  /**
   * 玩家點擊法術按鈕：選取等待施放，或取消已選取的法術。
   * 如果法術當前不可施放（魔力不足 / 冷卻中），回傳 false（UI 可閃紅提示）。
   * @param {string} spellId
   * @returns {boolean} 操作成功（選取/取消）
   */
  selectSpell(spellId) {
    // 再次點擊同一法術 → 取消選取
    if (this._pendingSpell === spellId) {
      this._pendingSpell = null;
      return { ok: true };
    }
    const cfg = SPELL_CONFIG[spellId];
    if (!cfg) return { ok: false, reason: 'unknown_spell' };
    if (this.mana < cfg.manaCost)     return { ok: false, reason: 'no_mana' };
    if (this._cooldowns[spellId] > 0) return { ok: false, reason: 'cooldown' };
    this._pendingSpell = spellId;
    return { ok: true };
  }

  /** 取消等待施放（右鍵、施放後自動清除、點空白處） */
  cancelPending() {
    this._pendingSpell = null;
  }

  /** 當前等待施放的法術 id（null = 無）*/
  getPendingSpell() {
    return this._pendingSpell;
  }

  /**
   * 法術是否可施放（魔力充足 + 冷卻結束）
   * @param {string} spellId
   */
  canCast(spellId) {
    const cfg = SPELL_CONFIG[spellId];
    if (!cfg) return false;
    return this.mana >= cfg.manaCost && this._cooldowns[spellId] <= 0;
  }

  /**
   * 施放法術到目標節點。
   *
   * 驗證順序：
   *   1. 法術設定存在
   *   2. 魔力 + 冷卻條件滿足（canCast）
   *   3. 目標類型符合（own → player / enemy → enemy 或 neutral）
   *
   * 效果套用：
   *   直接寫入 node._xxxExpiry（時間戳），各系統自行讀取。
   *   Meteor 額外扣除兵力（直接操作，不走 CombatSystem）。
   *
   * @param {string}       spellId
   * @param {NodeBuilding} target
   * @returns {{ success: boolean, event?: string, node?: NodeBuilding, value?: number }}
   */
  cast(spellId, target) {
    const cfg = SPELL_CONFIG[spellId];
    if (!cfg) return { success: false, reason: 'unknown_spell' };

    // 魔力 / 冷卻驗證（回傳更細的 reason 供上層顯示提示）
    if (this.mana < cfg.manaCost)      return { success: false, reason: 'no_mana' };
    if (this._cooldowns[spellId] > 0)  return { success: false, reason: 'cooldown' };

    // 目標類型驗證
    if (cfg.targetType === 'own'   && target.owner !== 'player') return { success: false, reason: 'wrong_target' };
    if (cfg.targetType === 'enemy' && target.owner === 'player')  return { success: false, reason: 'wrong_target' };

    // 扣魔力 + 啟動冷卻 + 清除待施放
    this.mana                -= cfg.manaCost;
    this._cooldowns[spellId]  = cfg.cooldown;
    this._pendingSpell         = null;

    switch (spellId) {

      case 'HASTE': {
        // 加速生兵：設定 _hasteExpiry，ProductionSystem 讀取
        target._hasteExpiry = Date.now() + cfg.duration;
        target._hasteDur    = cfg.duration;
        return { success: true, event: 'spell_haste', node: target,
                 value: Math.round(cfg.duration / 1000) };
      }

      case 'METEOR': {
        // 直接傷害：最少留 1 兵（不消滅節點）
        const dmg = Math.min(cfg.damage, target.currentUnits - 1);
        target.currentUnits  = Math.max(1, target.currentUnits - cfg.damage);
        // 撞擊視覺動畫
        target._meteorExpiry = Date.now() + cfg.duration;
        target._meteorDur    = cfg.duration;
        return { success: true, event: 'spell_meteor', node: target, value: dmg };
      }

      case 'FORTIFY': {
        // 防禦強化：設定 _fortifyExpiry，CombatSystem 讀取
        target._fortifyExpiry = Date.now() + cfg.duration;
        target._fortifyDur    = cfg.duration;
        return { success: true, event: 'spell_fortify', node: target,
                 value: Math.round(cfg.duration / 1000) };
      }
    }

    return { success: false };
  }

  /**
   * 取得法術冷卻剩餘比例（0.0 = 就緒，1.0 = 剛施放）
   * 供 UI 繪製冷卻覆蓋扇形使用
   * @param {string} spellId
   * @returns {number} 0..1
   */
  getCooldownRatio(spellId) {
    const cfg = SPELL_CONFIG[spellId];
    if (!cfg || cfg.cooldown <= 0) return 0;
    return this._cooldowns[spellId] / cfg.cooldown;
  }

  /**
   * 取得法術冷卻剩餘秒數（向上取整，供 UI 顯示）
   * @param {string} spellId
   * @returns {number}
   */
  getCooldownSecs(spellId) {
    return Math.ceil(this._cooldowns[spellId] / 1000);
  }
}
