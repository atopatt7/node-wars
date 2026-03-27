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
  /**
   * 回傳值：CombatFeedback | null
   *   CombatFeedback = {
   *     event : 'attacker_penalty' | 'garrison_regen',
   *     node  : NodeBuilding,   // 目標節點（供呼叫方觸發視覺效果）
   *     x     : number,         // 節點座標（浮動文字定位用）
   *     y     : number,
   *     value : number,         // 懲罰量 or 回復量（浮動數字顯示用）
   *   }
   *
   * 呼叫方（GameScene）依回傳值決定觸發哪種視覺回饋，
   * CombatSystem 自身不含任何繪製或 Phaser 呼叫。
   */
  resolve(troop, target) {
    if (troop.owner === target.owner) {
      // ── 友方增援 ──
      target.currentUnits += troop.unitCount;
      return null;  // 增援不觸發戰鬥回饋
    }

    // ── 敵對戰鬥 ──
    // feedback 在結算過程中逐步決定，最終由 return 傳出
    let feedback = null;

    // Step 1：套用攻擊方懲罰（attacker_penalty，如 Tower 阻箭效果）
    let effectiveAttack = troop.unitCount;
    if (target.passiveEffect === 'attacker_penalty') {
      const penalized = Math.max(1, Math.floor(troop.unitCount * target.passiveValue));
      const penaltyAmt = troop.unitCount - penalized;
      effectiveAttack = penalized;
      // 不論攻守勝負都觸發：弓箭已射出
      if (penaltyAmt > 0) {
        feedback = { event: 'attacker_penalty', node: target,
                     x: target.x, y: target.y, value: penaltyAmt };
      }
    }

    // Step 2：計算攻防力
    const attackPower = effectiveAttack;
    const defendPower = target.currentUnits * target.defenseMultiplier;

    if (attackPower > defendPower) {
      // Step 3a：攻擊方獲勝，佔領節點
      const remaining = Math.max(1, Math.floor(attackPower - defendPower));
      target.owner        = troop.owner;
      target.currentUnits = remaining;
      target.resetProductionState();
      // attacker_penalty feedback 保留；garrison_regen 不在被攻下時觸發
      return feedback;

    } else {
      // Step 3b：防守方守住，扣除傷亡
      let remaining = Math.max(
        0,
        Math.ceil(target.currentUnits - attackPower / target.defenseMultiplier)
      );

      // 極端情況：剩 0 → 歸屬攻擊方（殭屍節點保護）
      if (remaining <= 0) {
        target.owner        = troop.owner;
        target.currentUnits = 1;
        target.resetProductionState();
        return feedback;  // 城堡殭屍倒地，不觸發守城回復
      }

      target.currentUnits = remaining;

      // Step 4：套用防守方被動效果（garrison_regen，如 Castle 守城回復）
      if (target.passiveEffect === 'garrison_regen') {
        const regenAmt = Math.round(target.passiveValue);
        target.currentUnits = Math.min(target.maxUnits, target.currentUnits + regenAmt);
        // 覆蓋 feedback（garrison_regen 優先於 attacker_penalty 顯示；兩者不同節點）
        feedback = { event: 'garrison_regen', node: target,
                     x: target.x, y: target.y, value: regenAmt };
      }

      return feedback;
    }
  }
}
