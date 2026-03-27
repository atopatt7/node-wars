/**
 * ProductionSystem.js — 節點自動生兵 + 超載衰減系統
 *
 * 職責：
 *   - 遍歷所有節點
 *   - 若 currentUnits < maxUnits：累積計時，定時 +1 兵
 *   - 若 currentUnits > maxUnits（超載）：累積計時，以 OVERFLOW_DECAY_RATE 每秒 -1 兵
 *   - 中立節點（owner === 'neutral'）不生兵、不衰減
 *   - 維護 pulseTimer，供 NodeBuilding.draw() 的選取脈衝動畫使用
 *
 * 超載來源：
 *   增援己方據點時，CombatSystem 已不再以 maxUnits 為上限，
 *   允許 currentUnits 暫時超過上限，由本系統負責衰減回正常值。
 *
 * 可調常數：
 *   OVERFLOW_DECAY_RATE（在 config.js）：每秒損失的超載兵力
 *
 * GameScene 使用方式：
 *   this.productionSystem = new ProductionSystem();
 *   // 在 update() 中：
 *   this.productionSystem.update(delta, this.nodes);
 *
 * 依賴 NodeBuilding 上的資料欄位（唯讀設定、可寫狀態）：
 *   owner                    — 判斷是否生兵/衰減
 *   productionRate           — 單位/秒（來自 NODE_TYPES 設定）
 *   maxUnits                 — 兵力正常上限
 *   currentUnits             — 當前兵力（寫入）
 *   productionAccumulator    — 生兵毫秒累積器（寫入）
 *   overflowDecayAccumulator — 超載衰減毫秒累積器（寫入）
 *   pulseTimer               — 動畫計時器（寫入，供 draw() 使用）
 */

import { OVERFLOW_DECAY_RATE } from '../config.js';

export class ProductionSystem {
  /**
   * 對所有節點執行一幀的生兵 / 超載衰減更新
   * @param {number}        delta - 幀間隔（毫秒）
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   */
  update(delta, nodes) {
    for (const node of nodes) {
      this._produce(delta, node);
    }
  }

  // ── 私有：單一節點生兵 / 超載衰減邏輯 ─────────────────

  /**
   * @param {number} delta
   * @param {import('../entities/NodeBuilding.js').NodeBuilding} node
   */
  _produce(delta, node) {
    // 中立節點不生兵也不衰減
    if (node.owner === 'neutral') return;

    // 脈衝動畫計時（無論是否超載都持續更新，保持光圈動畫流暢）
    node.pulseTimer += delta;

    if (node.currentUnits > node.maxUnits) {
      // ── 超載衰減：每秒損失 OVERFLOW_DECAY_RATE 兵 ──────
      node.overflowDecayAccumulator += delta;
      const msPerDecay = 1000 / OVERFLOW_DECAY_RATE;

      while (
        node.overflowDecayAccumulator >= msPerDecay &&
        node.currentUnits > node.maxUnits
      ) {
        node.currentUnits--;
        node.overflowDecayAccumulator -= msPerDecay;
      }

      // 超載期間不生兵，也不累積生兵計時（避免超載結束後立刻爆發生兵）
      return;
    }

    // ── 正常生兵（currentUnits < maxUnits）───────────────
    if (node.currentUnits >= node.maxUnits) return;  // 剛好在上限，不生兵

    // 重置超載累積器（確保下次超載從 0 開始計算）
    node.overflowDecayAccumulator = 0;

    const msPerUnit = 1000 / node.productionRate;
    node.productionAccumulator += delta;

    // 每累積到一個單位的生產時間就 +1，直到上限
    while (
      node.productionAccumulator >= msPerUnit &&
      node.currentUnits < node.maxUnits
    ) {
      node.currentUnits++;
      node.productionAccumulator -= msPerUnit;
    }
  }
}
