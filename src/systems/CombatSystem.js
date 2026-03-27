/**
 * CombatSystem.js - 戰鬥結算
 *
 * 當一支部隊抵達目標節點時，呼叫 resolve() 進行結算：
 *
 *   友方：補充兵力（允許超載，由 ProductionSystem 衰減回收）
 *
 *   敵方結算流程（依序執行）：
 *     Step 1  套用節點被動效果（攻擊方懲罰）
 *     Step 2  attackPower vs. defenderUnits × defenseMultiplier
 *     Step 3  若攻擊 > 防禦 → 佔領，剩餘兵力 = floor(攻 - 防)
 *             若攻擊 ≤ 防禦 → 防守勝，剩餘兵力 = ceil(防 - 攻/mult)
 *     Step 4  套用防守方被動效果（守城回復）
 *
 * ── 被動效果說明 ──────────────────────────────────────────────
 *   passiveEffect = 'attacker_penalty'（Tower）
 *     攻擊方兵力在 Step 1 乘以 passiveValue（0.75），模擬塔上弓箭損耗。
 *     此折扣在「進入近戰」前就發生，與 defenseMultiplier 為獨立加算。
 *
 *   passiveEffect = 'garrison_regen'（Castle）
 *     防守成功後，立即回復 passiveValue 兵（最多到 maxUnits）。
 *     代表城堡內部快速補員；攻下城堡後不觸發。
 *
 *   passiveEffect = null（Village）
 *     無任何特殊效果，作為標準基準節點。
 *
 * ── 擴充說明 ─────────────────────────────────────────────────
 *   新增節點被動只需在 config.js 的 NODE_TYPES 加欄位，
 *   並在此 resolve() 的對應 Step 加 if 分支，不須動其他系統。
 * ────────────────────────────────────────────────────────────
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

    // Step 1：套用攻擊方懲罰（attacker_penalty，如 Tower 阻箭效果）
    let effectiveAttack = troop.unitCount;
    if (target.passiveEffect === 'attacker_penalty') {
      effectiveAttack = Math.floor(troop.unitCount * target.passiveValue);
      // 最少保留 1 兵，避免 0 兵部隊造成邊界問題
      effectiveAttack = Math.max(1, effectiveAttack);
    }

    // Step 2：計算攻防力
    const attackPower = effectiveAttack;
    const defendPower = target.currentUnits * target.defenseMultiplier;

    if (attackPower > defendPower) {
      // Step 3a：攻擊方獲勝，佔領節點
      const remaining = Math.max(
        1,
        Math.floor(attackPower - defendPower)
      );
      target.owner        = troop.owner;
      target.currentUnits = remaining;
      // 重置生產狀態（剛換手的建築稍微延遲生產）
      target.resetProductionState();

    } else {
      // Step 3b：防守方守住，扣除傷亡
      let remaining = Math.max(
        0,
        Math.ceil(target.currentUnits - attackPower / target.defenseMultiplier)
      );

      // 極端情況：剩 0 時自動歸屬攻擊方（避免殭屍節點）
      if (remaining <= 0) {
        target.owner        = troop.owner;
        target.currentUnits = 1;
        target.resetProductionState();
      } else {
        target.currentUnits = remaining;

        // Step 4：套用防守方被動效果（garrison_regen，如 Castle 守城回復）
        if (target.passiveEffect === 'garrison_regen') {
          // 守城成功後立即補員，上限為 maxUnits（不觸發超載）
          target.currentUnits = Math.min(
            target.maxUnits,
            target.currentUnits + Math.round(target.passiveValue)
          );
        }
      }
    }
  }
}
