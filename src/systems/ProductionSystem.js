/**
 * ProductionSystem.js — 節點自動生兵系統
 *
 * 職責：
 *   - 遍歷所有節點
 *   - 根據節點的 productionRate 進行累積計時
 *   - 每累積足夠時間就增加 currentUnits，直到達 maxUnits 上限
 *   - 中立節點（owner === 'neutral'）不生兵
 *   - 維護 pulseTimer，供 NodeBuilding.draw() 的選取脈衝動畫使用
 *
 * 不含任何繪製、輸入或戰鬥邏輯。
 *
 * GameScene 使用方式：
 *   this.productionSystem = new ProductionSystem();
 *   // 在 update() 中：
 *   this.productionSystem.update(delta, this.nodes);
 *
 * 依賴 NodeBuilding 上的資料欄位（唯讀設定、可寫狀態）：
 *   owner              — 判斷是否生兵
 *   productionRate     — 單位/秒（來自 NODE_TYPES 設定）
 *   maxUnits           — 兵力上限
 *   currentUnits       — 當前兵力（寫入）
 *   productionAccumulator — 毫秒累積器（寫入）
 *   pulseTimer         — 動畫計時器（寫入，供 draw() 使用）
 */

export class ProductionSystem {
  /**
   * 對所有節點執行一幀的生兵更新
   * @param {number}        delta - 幀間隔（毫秒）
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   */
  update(delta, nodes) {
    for (const node of nodes) {
      this._produce(delta, node);
    }
  }

  // ── 私有：單一節點生兵邏輯 ────────────────────────────

  /**
   * @param {number} delta
   * @param {import('../entities/NodeBuilding.js').NodeBuilding} node
   */
  _produce(delta, node) {
    // 中立節點不自動生兵
    if (node.owner === 'neutral') return;
    // 已達上限，不繼續累積
    if (node.currentUnits >= node.maxUnits) return;

    // 脈衝動畫計時（供 NodeBuilding.draw() 的選取光圈使用）
    node.pulseTimer += delta;

    // 累積器（毫秒）
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
