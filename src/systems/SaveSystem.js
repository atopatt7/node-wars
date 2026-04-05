/**
 * SaveSystem.js - 關卡進度持久化（localStorage）
 *
 * 職責：
 *   - 記錄每關是否已完成（completed）
 *   - 記錄最高已解鎖關卡（maxUnlocked）：預設第 1 關
 *   - 讀取完成/解鎖狀態供 LevelSelectScene 顯示進度
 *   - 勝利時由 GameScene 呼叫 markCompleted(levelId) 與 unlockNext(levelId)
 *
 * 儲存格式：
 *   SAVE_KEY   → JSON { "1": true, "3": true, ... }  // 已完成關卡
 *   UNLOCK_KEY → JSON 數字（最高已解鎖 levelId）      // 解鎖進度
 *
 * 解鎖規則：
 *   - 第 1 關永遠解鎖
 *   - 通過第 N 關 → unlockNext(N) → maxUnlocked = max(current, N+1)
 *   - isUnlocked(N) = N <= getMaxUnlocked()
 *
 * 設計原則：
 *   - 純靜態方法，無需實例化
 *   - 讀取失敗一律靜默回傳安全預設值（不影響遊戲流程）
 *   - 自動遷移：若 UNLOCK_KEY 不存在，從已完成關卡推導 maxUnlocked
 *
 * 使用方式：
 *   import { SaveSystem } from '../systems/SaveSystem.js';
 *   SaveSystem.markCompleted(3);     // 記錄第 3 關完成
 *   SaveSystem.unlockNext(3);        // 解鎖第 4 關
 *   SaveSystem.isUnlocked(4);        // => true
 *   SaveSystem.isCompleted(3);       // => true
 */

const SAVE_KEY   = 'nodeWars_v1_completed';
const UNLOCK_KEY = 'nodeWars_v1_maxUnlocked';
const FAIL_KEY   = 'nodeWars_v1_failCounts';   // 防卡關：各關失敗次數

export const SaveSystem = {
  // ── 完成記錄 ──────────────────────────────────────

  /**
   * 將指定關卡標記為已完成，並同步解鎖下一關。
   * @param {number} levelId
   */
  markCompleted(levelId) {
    try {
      const data    = this._load();
      data[levelId] = true;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // localStorage 被封鎖（如 Safari 隱私瀏覽）→ 不影響遊戲流程
    }
    // 完成即自動解鎖下一關
    this.unlockNext(levelId);
  },

  /**
   * 查詢指定關卡是否已完成。
   * @param {number} levelId
   * @returns {boolean}
   */
  isCompleted(levelId) {
    return !!this._load()[levelId];
  },

  /**
   * 取得所有已完成關卡的 map（{ levelId: true }）。
   * @returns {Record<string, boolean>}
   */
  getCompletedLevels() {
    return this._load();
  },

  // ── 解鎖記錄 ──────────────────────────────────────

  /**
   * 通關後呼叫：解鎖 levelId+1（若尚未解鎖）。
   * @param {number} levelId  剛完成的關卡 ID
   */
  unlockNext(levelId) {
    try {
      const next    = levelId + 1;
      const current = this.getMaxUnlocked();
      if (next > current) {
        localStorage.setItem(UNLOCK_KEY, String(next));
      }
    } catch {
      // 靜默忽略
    }
  },

  /**
   * 查詢指定關卡是否已解鎖（可進入）。
   * @param {number} levelId
   * @returns {boolean}
   */
  isUnlocked(levelId) {
    return levelId <= this.getMaxUnlocked();
  },

  /**
   * 取得目前最高已解鎖的關卡 ID（最低為 1）。
   * 若 UNLOCK_KEY 不存在，自動從已完成關卡推導（向後相容）。
   * @returns {number}
   */
  getMaxUnlocked() {
    try {
      const raw = localStorage.getItem(UNLOCK_KEY);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        return isNaN(n) ? 1 : Math.max(1, n);
      }
      // ── 向後相容遷移：從已完成關卡推導解鎖進度 ──
      const completed = this._load();
      const keys = Object.keys(completed).map(Number).filter(Boolean);
      if (keys.length === 0) return 1;  // 全新玩家：只解鎖第 1 關
      const maxDone = Math.max(...keys);
      const migrated = maxDone + 1;     // 完成最高關 → 解鎖下一關
      // 寫回 localStorage，下次不再需要遷移
      localStorage.setItem(UNLOCK_KEY, String(migrated));
      return migrated;
    } catch {
      return 1;
    }
  },

  // ── 防卡關失敗計數 ────────────────────────────────────

  /**
   * 記錄某關失敗一次（僅在 hard 關卡呼叫）。
   * 連敗 ≥ 2 次後，下次進入時玩家初始兵力 +10%。
   * @param {number} levelId
   */
  recordFailure(levelId) {
    try {
      const data = this._loadFails();
      data[String(levelId)] = (data[String(levelId)] ?? 0) + 1;
      localStorage.setItem(FAIL_KEY, JSON.stringify(data));
    } catch {
      // 靜默忽略
    }
  },

  /**
   * 取得某關的累計失敗次數。
   * @param {number} levelId
   * @returns {number}
   */
  getFailCount(levelId) {
    try {
      return this._loadFails()[String(levelId)] ?? 0;
    } catch {
      return 0;
    }
  },

  /**
   * 重置某關的失敗計數（通關後呼叫）。
   * @param {number} levelId
   */
  resetFailCount(levelId) {
    try {
      const data = this._loadFails();
      delete data[String(levelId)];
      localStorage.setItem(FAIL_KEY, JSON.stringify(data));
    } catch {
      // 靜默忽略
    }
  },

  // ── 清除 ──────────────────────────────────────────

  /**
   * 清除所有存檔（開發 / 測試用途）
   */
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(UNLOCK_KEY);
      localStorage.removeItem(FAIL_KEY);
    } catch {
      // 靜默忽略
    }
  },

  // ── 私有：安全讀取 localStorage ──────────────────

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
    } catch {
      return {};
    }
  },

  _loadFails() {
    try {
      const raw = localStorage.getItem(FAIL_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
    } catch {
      return {};
    }
  },
};
