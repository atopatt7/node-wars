/**
 * ItemSystem.js — 戰場道具系統
 *
 * 職責：
 *   - 管理本局戰鬥的「可用道具」清單（記憶體，不持久化）
 *   - 提供「待使用」狀態（pendingItem），等待玩家選擇目標節點
 *   - 驗證目標合法性（己方 / 敵方）
 *   - 執行道具效果（直接寫入 NodeBuilding 時間戳，各系統自行讀取）
 *   - 消耗道具（移除本局記憶體清單 + 更新 SaveSystem 持有數量）
 *
 * 道具效果串接方式（仿照 SpellSystem 的 timestamp buff 模式）：
 *   鐵衛壁壘 → 寫入 node._fortifyExpiry（CombatSystem 已讀取，直接複用）
 *   龍息火油 → 寫入 node._slowExpiry（ProductionSystem 新增讀取，速率 ×0.4）
 *   虛空封印 → 寫入 node._productionBlockExpiry（ProductionSystem 新增讀取，封鎖生兵）
 *
 * 流程：
 *   1. GameScene 在 create() 讀取 SaveSystem.getEquippedItems() 傳入建構子
 *   2. 玩家點擊道具格 → selectItem(id) → _pendingItemId 設定
 *   3. 玩家點擊節點 → GameScene._tryUseItem(node) → useItem(node)
 *   4. 成功 → 移除記憶體清單 + SaveSystem.removeOwnedItem()
 *   5. 未使用的道具：關卡結束後不消耗（仍留在 SaveSystem.ownedItems）
 */

import { SaveSystem } from './SaveSystem.js';
import { SHOP_ITEMS } from './ShopSystem.js';

// ── 道具效果定義 ─────────────────────────────────────────────────
// 每個 id 對應：目標類型 + 效果函式
// 效果函式寫入 NodeBuilding 的 timestamp 欄位；若目標錯誤回傳 wrong_target。

const ITEM_DEFS = {
  /**
   * 鐵衛壁壘：強化己方節點防禦 10 秒
   * 複用 FORTIFY 的 _fortifyExpiry，CombatSystem 會讀取防禦加成
   */
  iron_rampart: {
    targetType: 'own',
    duration:   10_000,
    apply(node) {
      node._fortifyExpiry = Date.now() + 10_000;
      node._fortifyDur    = 10_000;
      return { success: true, event: 'item_fortify', node, value: 10 };
    },
  },

  /**
   * 龍息火油：降低敵方節點生兵速率至 40%，持續 8 秒
   * ProductionSystem 讀取 _slowExpiry 決定生兵速率
   */
  dragon_oil: {
    targetType: 'enemy',
    duration:   10_000,
    apply(node) {
      node._slowExpiry = Date.now() + 10_000;
      return { success: true, event: 'item_slow', node, value: 10 };
    },
  },

  /**
   * 虛空封印：封鎖敵方節點生兵能力，持續 6 秒
   * ProductionSystem 讀取 _productionBlockExpiry，封鎖期間完全不生兵
   */
  void_seal: {
    targetType: 'enemy',
    duration:   6_000,
    apply(node) {
      node._productionBlockExpiry = Date.now() + 6_000;
      return { success: true, event: 'item_block', node, value: 6 };
    },
  },

  /**
   * 聖盾護符：我方節點獲得一次致命格檔，10 秒有效期內
   * CombatSystem 在 Step 3a（攻擊方勝利）前讀取 _shieldExpiry；
   * 若護盾仍有效，保留 1 兵並清除護盾（單次觸發）。
   */
  holy_shield: {
    targetType: 'own',
    duration:   10_000,
    apply(node) {
      node._shieldExpiry = Date.now() + 10_000;
      return { success: true, event: 'item_shield', node, value: 10 };
    },
  },

  /**
   * 疾風馬蹄：我方節點出兵移動速度 ×1.6，持續 8 秒
   * GameScene._sendTroops 在建立 TroopGroup 後讀取 _speedBoostExpiry 調整 speed。
   */
  swift_hooves: {
    targetType: 'own',
    duration:   10_000,
    apply(node) {
      node._speedBoostExpiry = Date.now() + 10_000;
      return { success: true, event: 'item_speed', node, value: 10 };
    },
  },

  /**
   * 血和奠徒：削弱敵方節點防禦倍率 -0.4，持續 8 秒
   * CombatSystem.resolve() Step 2 讀取 _defenseDownExpiry 降低 effectiveDef。
   */
  blood_warden: {
    targetType: 'enemy',
    duration:   10_000,
    apply(node) {
      node._defenseDownExpiry = Date.now() + 10_000;
      return { success: true, event: 'item_defdown', node, value: 10 };
    },
  },

  /**
   * 黑鐵戰旗：目標節點 + 最近一個友方節點生兵速率 ×1.3，持續 12 秒
   * ProductionSystem 讀取 _bannerExpiry 調整 effectiveRate。
   * 需要 _nodesRef（由 GameScene 在 create() 後設定）來找最近友方節點。
   */
  iron_banner: {
    targetType: 'own',
    duration:   12_000,
    apply(node, nodesRef) {
      const expiry = Date.now() + 12_000;
      node._bannerExpiry = expiry;

      // 找最近的另一個友方節點，一起加 buff
      if (nodesRef && nodesRef.length > 1) {
        let nearest = null;
        let minDist = Infinity;
        for (const n of nodesRef) {
          if (n === node || n.owner !== 'player') continue;
          const dx = n.x - node.x, dy = n.y - node.y;
          const d  = dx * dx + dy * dy;
          if (d < minDist) { minDist = d; nearest = n; }
        }
        if (nearest) nearest._bannerExpiry = expiry;
      }

      return { success: true, event: 'item_banner', node, value: 12 };
    },
  },

  /**
   * 虛空天象儲：立即對敵方節點造成 -15 兵傷害 + 封鎖生兵 3 秒
   * 即時扣兵由此處執行；_productionBlockExpiry 複用 void_seal 的視覺。
   */
  void_reservoir: {
    targetType: 'enemy',
    duration:   4_000,
    apply(node) {
      const dmg = Math.min(15, Math.max(0, node.currentUnits - 1)); // 至少留 1 兵
      node.currentUnits           = Math.max(1, node.currentUnits - dmg);
      node._productionBlockExpiry = Date.now() + 4_000;             // 3s→4s 微幅加強
      return { success: true, event: 'item_void_hit', node, value: dmg };
    },
  },
};

// ── ItemSystem ────────────────────────────────────────────────────
export class ItemSystem {
  /**
   * @param {string[]} equippedItemIds  本局攜帶的道具 ID 清單（來自 SaveSystem）
   */
  constructor(equippedItemIds) {
    /**
     * 本局可用道具清單（記憶體，使用後移除）
     * @type {string[]}
     */
    this._activeItems = equippedItemIds.filter(id => id in ITEM_DEFS || true).slice(0, 3);

    /**
     * 等待選擇目標的道具 ID（null = 未選取）
     * @type {string|null}
     */
    this._pendingItemId = null;

    /**
     * 節點清單參考（供 iron_banner 找最近友方節點）
     * 由 GameScene 在 create() 後呼叫 setNodesRef() 設定。
     * @type {import('../entities/NodeBuilding.js').NodeBuilding[]|null}
     */
    this._nodesRef = null;
  }

  /**
   * 讓 GameScene 在 create() 後注入節點清單，供部分道具效果使用。
   * @param {import('../entities/NodeBuilding.js').NodeBuilding[]} nodes
   */
  setNodesRef(nodes) {
    this._nodesRef = nodes;
  }

  // ── 查詢 ──────────────────────────────────────────────

  /** 取得本局仍可使用的道具 ID 清單（副本） */
  getActiveItems() {
    return [...this._activeItems];
  }

  /** 目前等待選擇目標的道具 ID（null = 無）*/
  getPendingItem() {
    return this._pendingItemId;
  }

  /** 是否有道具等待選擇目標 */
  hasPendingItem() {
    return this._pendingItemId !== null;
  }

  /**
   * 取得道具目標類型（供高亮顯示合法目標節點）
   * @param {string} itemId
   * @returns {'own'|'enemy'|'any'}
   */
  getTargetType(itemId) {
    return ITEM_DEFS[itemId]?.targetType ?? 'any';
  }

  /**
   * 從 SHOP_ITEMS 取得道具顯示資料（badge / name 等）
   * @param {string} itemId
   * @returns {object|null}
   */
  getItemData(itemId) {
    return SHOP_ITEMS.find(i => i.id === itemId) ?? null;
  }

  // ── 操作 ──────────────────────────────────────────────

  /**
   * 選取道具（等待施放），或取消已選取的道具。
   * @param {string} itemId
   * @returns {boolean} 操作成功
   */
  selectItem(itemId) {
    if (!this._activeItems.includes(itemId)) return false;
    this._pendingItemId = (this._pendingItemId === itemId) ? null : itemId;
    return true;
  }

  /** 取消等待施放（右鍵 / 點擊空白 / 施放後清除） */
  cancelPending() {
    this._pendingItemId = null;
  }

  /**
   * 嘗試對目標節點使用當前待施放的道具。
   *
   * 驗證順序：
   *   1. 有待施放道具
   *   2. 道具仍在本局可用清單中
   *   3. 道具有實作效果
   *   4. 目標類型合法（own / enemy）
   *
   * 成功後：
   *   - 從 _activeItems 移除
   *   - _pendingItemId 清除
   *   - SaveSystem.removeOwnedItem(id) 扣除持有數量
   *
   * @param {import('../entities/NodeBuilding.js').NodeBuilding} targetNode
   * @returns {{ success: boolean, event?: string, node?: object, value?: number, reason?: string }|null}
   */
  useItem(targetNode) {
    const itemId = this._pendingItemId;
    if (!itemId) return null;
    if (!this._activeItems.includes(itemId)) return null;

    const def = ITEM_DEFS[itemId];
    if (!def) {
      // 道具尚未實作效果（佔位道具）
      return { success: false, reason: 'not_implemented' };
    }

    // 目標類型驗證
    if (def.targetType === 'own'   && targetNode.owner !== 'player') {
      return { success: false, reason: 'wrong_target' };
    }
    if (def.targetType === 'enemy' && targetNode.owner === 'player') {
      return { success: false, reason: 'wrong_target' };
    }

    // 套用效果（iron_banner 需要 nodesRef 找最近友方節點）
    const result = def.apply(targetNode, this._nodesRef);

    // 消耗：從本局清單移除 + 扣持有
    this._activeItems   = this._activeItems.filter(id => id !== itemId);
    this._pendingItemId = null;
    SaveSystem.removeOwnedItem(itemId);

    return result;
  }
}
