/**
 * WinLoseSystem.js — 勝負判定系統
 *
 * 職責：
 *   - 根據節點歸屬與部隊存活狀況，判斷本局遊戲是否結束
 *   - 回傳 'win' / 'lose' / null（null 代表遊戲尚未結束）
 *
 * 不含任何繪製、輸入、生兵、移動或戰鬥邏輯。
 * 也不負責顯示結算面板，結果由 GameScene 接收後自行決定如何呈現。
 *
 * ── 勝負條件 ──
 *   勝利：場上已不存在任何 owner === 'enemy' 的節點
 *   失敗：玩家無任何 owner === 'player' 的節點，
 *         且場上也沒有 owner === 'player' 的移動中部隊
 *         （還有部隊在途中時，仍有機會反攻，不算失敗）
 *
 * GameScene 使用方式：
 *   this.winLoseSystem = new WinLoseSystem();
 *   // 在 update() 中：
 *   const result = this.winLoseSystem.check(this.nodes, this.troops);
 *   if (result) this._gameOver(result === 'win');
 */

export class WinLoseSystem {
  /**
   * 判斷本幀是否觸發勝利或失敗條件
   *
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   *   當前所有節點
   * @param {import('../entities/TroopGroup.js').TroopGroup[]} troops
   *   當前所有移動中的部隊（用於判斷是否還有玩家部隊在途）
   * @returns {'win' | 'lose' | null}
   *   'win'  — 所有敵方節點已被消滅
   *   'lose' — 玩家無節點且無在途部隊
   *   null   — 遊戲尚未結束
   */
  check(nodes, troops) {
    const hasEnemyNodes  = nodes.some(n => n.owner === 'enemy');
    const hasPlayerNodes = nodes.some(n => n.owner === 'player');
    const hasPlayerTroops = troops.some(t => t.owner === 'player');

    if (!hasEnemyNodes) return 'win';
    if (!hasPlayerNodes && !hasPlayerTroops) return 'lose';
    return null;
  }
}
