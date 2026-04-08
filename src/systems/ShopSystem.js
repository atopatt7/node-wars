/**
 * ShopSystem.js — 商店道具資料與狀態計算
 *
 * 職責：
 *   - 定義所有商店道具（SHOP_ITEMS）
 *   - 根據玩家存檔即時計算道具狀態（getItemState）
 *   - 執行購買流程（purchase）
 *
 * 道具狀態（動態計算，不儲存）：
 *   'buyable'      — 可購買（解鎖且資源足夠且未達持有上限）
 *   'insufficient' — 資源不足（已解鎖但金幣 / 奧術石不夠）
 *   'locked'       — 解鎖條件未達成
 *   'owned'        — 已達持有上限（maxOwned=1 表示限購一次）
 *
 * 解鎖條件（unlockRule）：
 *   null                       — 永遠可見
 *   { type:'chapter', chapter:N } — 需完成第 N 章（maxUnlocked >= N*5）
 */

import { SaveSystem } from './SaveSystem.js';

// ── 道具定義 ──────────────────────────────────────────────────────
export const SHOP_ITEMS = [
  {
    id:             'iron_rampart',
    category:       '防禦',
    name:           '鐵衛壁壘',
    badge:          '⛨',
    desc:           '強化我方所有防禦節點，使其在承受攻擊時維持更長時間',
    effectLabel:    '持續 1 場戰役  ·  單次使用',
    price:          400,
    priceType:      'gold',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'dragon_oil',
    category:       '增益',
    name:           '龍息火油',
    badge:          '🔥',
    desc:           '在目標節點塗抹火油，使敵方生兵速率降至 40%，持續 10 秒',
    effectLabel:    '持續 10 秒  ·  單次使用',
    price:          600,
    priceType:      'gold',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'void_seal',
    category:       '奧術',
    name:           '虛空封印',
    badge:          '◈',
    desc:           '封印一條敵方增援路徑，持續至該關卡結束',
    effectLabel:    '持續 1 場戰役  ·  單次使用',
    price:          3,
    priceType:      'arcane',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'holy_shield',
    category:       '防禦',
    name:           '聖盾護符',
    badge:          '🛡',
    desc:           '賦予我方節點神聖護盾，10 秒內免疫一次致命佔領，保留 1 兵',
    effectLabel:    '10 秒護盾  ·  單次觸發  ·  單次使用',
    price:          1000,       // 1400→1000：降低入手門檻，本質上只防一次
    priceType:      'gold',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'swift_hooves',
    category:       '增益',
    name:           '疾風馬蹄',
    badge:          '⚡',
    desc:           '10 秒內從指定節點出發的我方部隊移動速度 ×1.6',
    effectLabel:    '持續 10 秒  ·  單次使用',
    price:          750,        // 900→750：搭配時長延長，維持 CP 值
    priceType:      'gold',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'blood_warden',
    category:       '奧術',
    name:           '血和奠徒',
    badge:          '⚔',
    desc:           '10 秒內削弱指定敵方節點防禦力 -0.4，使其更易被攻下',
    effectLabel:    '持續 10 秒  ·  單次使用',
    price:          5,          // 10→5 奧術石：10 顆等於全存，超難入手；5 顆更合理
    priceType:      'arcane',
    unlockRule:     null,
    maxOwned:       1,
  },
  {
    id:             'iron_banner',
    category:       '傳奇',
    name:           '黑鐵戰旗',
    badge:          '⚑',
    desc:           '植入戰旗，指定節點與最近友方節點生兵速率 ×1.3，持續 12 秒',
    effectLabel:    '持續 12 秒  ·  單次使用',
    price:          1600,       // 2000→1600：傳奇定位不變，但更易在中後期入手
    priceType:      'gold',
    unlockRule:     { type: 'chapter', chapter: 3 },  // maxUnlocked >= 15
    maxOwned:       1,
    unlockCondition:'完成第三章以解鎖',
  },
  {
    id:             'void_reservoir',
    category:       '奧術',
    name:           '虛空天象儲',
    badge:          '✦',
    desc:           '立即對敵方節點造成 -15 兵傷害，並封鎖生兵 4 秒',
    effectLabel:    '即時衝擊 + 4 秒封鎖  ·  單次使用',
    price:          8,          // 12→8 奧術石：12 顆根本買不起；8 顆需存 1 關才能購
    priceType:      'arcane',
    unlockRule:     { type: 'chapter', chapter: 4 },  // maxUnlocked >= 20
    maxOwned:       1,
    unlockCondition:'完成第四章以解鎖',
  },
];

// ── 商店邏輯 ──────────────────────────────────────────────────────
export const ShopSystem = {
  /**
   * 根據玩家存檔即時計算道具狀態。
   * 優先順序：owned > locked > insufficient > buyable
   *
   * @param {object} item  SHOP_ITEMS 中的某一個道具物件
   * @returns {'owned'|'locked'|'insufficient'|'buyable'}
   */
  getItemState(item) {
    // 1. 已達持有上限
    const owned = SaveSystem.getOwnedItems();
    if ((owned[item.id] ?? 0) >= item.maxOwned) return 'owned';

    // 2. 解鎖條件
    if (item.unlockRule) {
      if (item.unlockRule.type === 'chapter') {
        const required = item.unlockRule.chapter * 5;  // 第 N 章末關
        if (SaveSystem.getMaxUnlocked() < required) return 'locked';
      }
    }

    // 3. 資源是否足夠
    const currency = SaveSystem.getCurrency();
    const balance  = item.priceType === 'arcane' ? currency.arcane : currency.gold;
    if (balance < item.price) return 'insufficient';

    return 'buyable';
  },

  /**
   * 嘗試購買道具。
   * 成功：扣除資源、記錄持有、回傳 true
   * 失敗（狀態不是 buyable）：回傳 false，不修改存檔
   *
   * @param {object} item
   * @returns {boolean}
   */
  purchase(item) {
    if (this.getItemState(item) !== 'buyable') return false;
    const spent = SaveSystem.spendCurrency(item.priceType, item.price);
    if (!spent) return false;
    SaveSystem.addOwnedItem(item.id);
    return true;
  },
};
