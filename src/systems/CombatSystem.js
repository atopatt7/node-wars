/**
 * CombatSystem.js - 戰鬥結算
 *
 * 當一支部隊抵達目標節點時，呼叫 resolve() 進行結算：
 *
 *   友方：補充兵力（不超過 maxUnits）
 *   敵方：
 *     攻擊方兵力 vs. 防禦方兵力 × defenseMultiplier
 *     若攻擊 > 防禦 → 佔領，剩餘兵力 = floor(攻 - 防 × mult)
 *     若攻擊 ≤ 防禦 → 防守勝，剩餘兵力 = ceil(防 - 攻 / mult)
 *
 * 節點換手時透過 target.resetProductionState() 重置生產狀態，
 * 不直接存取生產相關欄位（productionAccumulator 等）。
 */

export class CombatSystem {
  /**
   * @param {import('../entities/TroopGroup.js').TroopGroup}    troop
   * @param {import('../entities/NodeBuilding.js').NodeBuilding} target
   */
  resolve(troop, target) {
    if (troop.owner === target.owner) {
      // ── 友方增援 ──
      // 允許超過 maxUnits（超載），由 ProductionSystem 的衰減機制逐步回收
      target.currentUnits += troop.unitCount;
      return;
    }

    // ── 敵對戰鬥 ──
    const attackPower  = troop.unitCount;
    const defendPower  = target.currentUnits * target.defenseMultiplier;

    if (attackPower > defendPower) {
      // 攻擊方獲勝，佔領節點
      const remaining = Math.max(
        1,
        Math.floor(attackPower - defendPower)
      );
      target.owner        = troop.owner;
      target.currentUnits = remaining;
      // 重置生產狀態（剛換手的建築稍微延遲生產）
      target.resetProductionState();
    } else {
      // 防守方守住，扣除傷亡
      const remaining = Math.max(
        0,
        Math.ceil(target.currentUnits - attackPower / target.defenseMultiplier)
      );
      target.currentUnits = remaining;

      // 極端情況：剩 0 時自動歸屬攻擊方（避免殭屍節點）
      if (remaining <= 0) {
        target.owner        = troop.owner;
        target.currentUnits = 1;
        target.resetProductionState();
      }
    }
  }
}
