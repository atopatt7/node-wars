/**
 * MovementSystem.js — 部隊移動與到達判定系統
 *
 * 職責：
 *   - 遍歷所有移動中的部隊，更新各自的位置
 *   - 判斷每支部隊是否已抵達目標節點邊緣
 *   - 抵達時透過 onArrive callback 通知外部（通常接 CombatSystem）
 *   - 回傳尚未抵達的部隊陣列（供 GameScene 覆寫 this.troops）
 *
 * 不含任何繪製、輸入、戰鬥或生兵邏輯。
 *
 * GameScene 使用方式：
 *   this.movementSystem = new MovementSystem();
 *   // 在 update() 中：
 *   this.troops = this.movementSystem.update(
 *     delta,
 *     this.troops,
 *     this.nodes,
 *     (troop, target) => this.combatSystem.resolve(troop, target)
 *   );
 *
 * 依賴 TroopGroup 上的資料欄位（唯讀設定、可寫狀態）：
 *   speed, dirX, dirY, startX, startY, stopDistance — 來自 constructor
 *   traveled, currentX, currentY, arrived            — 寫入（移動狀態）
 *   toNodeId                                         — 用於對應目標節點
 */

export class MovementSystem {
  /**
   * 更新所有部隊位置，觸發到達事件，回傳存活部隊
   *
   * @param {number} delta
   *   幀間隔（毫秒）
   * @param {import('../entities/TroopGroup.js').TroopGroup[]} troops
   *   當前所有移動中的部隊
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   *   所有節點（用於查找目標）
   * @param {(troop: TroopGroup, target: NodeBuilding) => void} onArrive
   *   部隊抵達時的 callback，由呼叫方決定如何處理（戰鬥結算）
   * @returns {import('../entities/TroopGroup.js').TroopGroup[]}
   *   移除已抵達部隊後的新陣列
   */
  update(delta, troops, nodes, onArrive) {
    // 1. 更新每支部隊的位置
    for (const troop of troops) {
      this._advance(delta, troop);
    }

    // 2. 對已抵達的部隊觸發 callback（戰鬥結算由外部處理）
    for (const troop of troops) {
      if (!troop.arrived) continue;
      const target = nodes.find(n => n.id === troop.toNodeId);
      if (target) onArrive(troop, target);
    }

    // 3. 回傳尚未抵達的部隊（清除已處理的）
    return troops.filter(t => !t.arrived);
  }

  // ── 私有：單支部隊的位置推進 ──────────────────────────

  /**
   * 沿已計算好的方向向量推進一幀的距離
   * @param {number} delta
   * @param {import('../entities/TroopGroup.js').TroopGroup} troop
   */
  _advance(delta, troop) {
    if (troop.arrived) return;

    const move = (troop.speed * delta) / 1000;
    troop.traveled += move;

    if (troop.traveled >= troop.stopDistance) {
      // 剛好或超過停止距離 → 固定在終點邊緣並標記到達
      troop.arrived  = true;
      troop.currentX = troop.startX + troop.dirX * troop.stopDistance;
      troop.currentY = troop.startY + troop.dirY * troop.stopDistance;
    } else {
      // 正常插值
      troop.currentX = troop.startX + troop.dirX * troop.traveled;
      troop.currentY = troop.startY + troop.dirY * troop.traveled;
    }
  }
}
