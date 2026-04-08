/**
 * UIController.js — 遊戲 UI 協調器（多來源集火版）
 *
 * 變更：
 *   - 移除底部「派兵比例」按鈕列（25% / 50% / 75% / 100%）
 *   - 底部改為顯示集火操作提示文字
 *   - updateRatioHighlight() 保留但為空操作（避免舊呼叫報錯）
 *
 * 職責：
 *   - 建立頂部 HUD（關卡名稱、暫停按鈕、返回選關）
 *   - 建立底部操作提示列
 *   - 協調 PausePanel + GameOverPanel
 */

import { HUD_TOP, HUD_BOTTOM, SAFE_H } from '../config/layout.js';
import { SPELL_CONFIG }                from '../config.js';
import { PausePanel }                  from './PausePanel.js';
import { GameOverPanel }               from './GameOverPanel.js';

// 重新匯出給外部仍依賴此路徑的模組使用（向後相容）
export { HUD_TOP, HUD_BOTTOM };

export class UIController {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   levelName:     string,
   *   levelId:       number,
   *   levelCount:    number,
   *   onPauseToggle: () => void,
   * }} config
   */
  constructor(scene, config) {
    this._scene  = scene;
    this._config = config;

    /** @private Phaser.GameObjects.Text */
    this._pauseText = null;

    // ── 法術列狀態 ──
    this._spellBarReady = false;
    this._manaBarG      = null;
    this._spellBarG     = null;
    this._spellSlots    = [];   // [{id, bx, by, iconTxt, costTxt, cdTxt}]

    // ── Dirty flag：追蹤上一幀狀態，只在變化時重繪 ──────────
    // mana: 四捨五入到整數做比較（每秒只變 ~4 點，整數精度已足夠）
    // cdSecs: 各法術冷卻剩餘秒數（0 = 就緒）
    // pendingId: 目前選取的法術 id
    this._prevManaInt  = -1;         // 上幀魔力整數值（-1 = 強制初次繪製）
    this._prevCdSecs   = {};         // { spellId: secs }
    this._prevPending  = undefined;  // 上幀待施放 id

    // ── 子面板模組 ──
    this._pausePanel    = new PausePanel(scene, config.levelId);
    this._gameOverPanel = new GameOverPanel(scene, {
      levelId:    config.levelId,
      levelCount: config.levelCount,
    });
  }

  // ── 公開 API ──────────────────────────────────────────

  /** create 階段呼叫：建立頂部 HUD 與底部法術列 */
  setup() {
    this._createTopHUD();
    this._createSpellBar();
  }

  /**
   * 空操作，保留供舊程式呼叫（比例按鈕已移除）
   * @param {number} _selectedIndex
   */
  updateRatioHighlight(_selectedIndex) { /* 已移除比例按鈕 */ }

  /**
   * 同步暫停狀態（由 GameScene._togglePause 呼叫）
   * @param {boolean} paused
   */
  setPauseState(paused) {
    if (paused) {
      this._pauseText?.setText('▶');
      this._pausePanel.show();
    } else {
      this._pauseText?.setText('⏸');
      this._pausePanel.hide();
    }
  }

  /**
   * 顯示遊戲結算面板（由 GameScene._gameOver 呼叫）
   * @param {boolean} won
   * @param {number}  [elapsed]    通關耗時（秒）
   * @param {object}  [extraData]  戰役強化資料：{ levelName, isLandmark, nextLevel }
   */
  showResult(won, elapsed, extraData = {}) {
    this._gameOverPanel.show(won, elapsed, extraData);
  }

  // ── 私有：頂部 HUD ────────────────────────────────────

  _createTopHUD() {
    const scene  = this._scene;
    const W      = scene.cameras.main.width;
    const { levelName, onPauseToggle } = this._config;

    // 背景條（深藍黑，增加戰役感）
    const bar = scene.add.graphics().setDepth(10);
    bar.fillStyle(0x06101E, 0.90);
    bar.fillRect(0, 0, W, HUD_TOP);
    // 底部分隔線（藍白細線，統一 HUD 邊界語言）
    bar.lineStyle(1.5, 0x2A5080, 0.85);
    bar.beginPath();
    bar.moveTo(0, HUD_TOP - 1); bar.lineTo(W, HUD_TOP - 1);
    bar.strokePath();

    // 關卡名稱（左側，含 SAFE_H 邊距避免貼齊畫布邊緣）
    scene.add.text(21 + SAFE_H, HUD_TOP / 2, levelName, {   // 14→21（×1.5）
      fontSize:        '21px',      // was 14px（×1.5）
      color:           '#C0D8F8',
      stroke:          '#000000',
      strokeThickness: 2,
      resolution:      2,
    }).setOrigin(0, 0.5).setDepth(11);

    // 暫停按鈕（右側，含 SAFE_H 邊距）
    this._pauseText = scene.add.text(W - 21 - SAFE_H, HUD_TOP / 2, '⏸', {   // 14→21
      fontSize:   '31px',           // was 21px（×1.5）
      color:      '#FFFFFF',
      resolution: 2,
    }).setOrigin(1, 0.5).setDepth(11).setInteractive({ useHandCursor: true });
    // 暫停按鈕：加 pressed 回饋
    this._pauseText.on('pointerdown', () => this._pauseText.setAlpha(0.45));
    this._pauseText.on('pointerout',  () => this._pauseText.setAlpha(1));
    this._pauseText.on('pointerup',   () => { this._pauseText.setAlpha(1); onPauseToggle(); });

    // 返回選關（中間）
    const backBtn = scene.add.text(W / 2, HUD_TOP / 2, '▼ 選關', {
      fontSize:   '19px',           // was 13px（×1.5）
      color:      '#6888BB',
      resolution: 2,
    }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    // 返回按鈕：加 pressed 回饋
    backBtn.on('pointerdown', () => backBtn.setAlpha(0.45));
    backBtn.on('pointerout',  () => backBtn.setAlpha(1));
    backBtn.on('pointerup', () => {
      backBtn.setAlpha(1);
      scene.cameras.main.fadeOut(200);
      scene.cameras.main.once('camerafadeoutcomplete', () => {
        scene.scene.start('LevelSelectScene');
      });
    });
  }

  // ── 私有：底部法術列（取代舊操作提示列）────────────────
  //
  // 布局（HUD_BOTTOM = 80px）：
  //   H-80 to H-73  → 魔力條（7px，藍紫色）
  //   H-73 to H     → 3 個法術按鈕區（73px）
  //   按鈕圓心 Y     = H - 37
  //   按鈕圓心 X     = W * [0.22, 0.50, 0.78]
  // ─────────────────────────────────────────────────────

  _createSpellBar() {
    const scene  = this._scene;
    const W      = scene.cameras.main.width;
    const H      = scene.cameras.main.height;
    const barY   = H - HUD_BOTTOM;
    // 橫向後按鈕中心 Y：底部列中央（HUD_BOTTOM=114，-52 偏移到約中央）
    const btnY   = H - 51;   // was H-34（×1.5：114/2 = 57，略上移讓名稱文字有空間）
    // 三個法術按鈕均勻分佈（22% / 50% / 78%），橫向後按鈕間距更舒適
    const bxList = [W * 0.22, W * 0.50, W * 0.78];

    // ── 背景條（深藍黑，與頂部 HUD 同色系統一）──
    const bar = scene.add.graphics().setDepth(10);
    bar.fillStyle(0x050E1C, 0.92);
    bar.fillRect(0, barY, W, HUD_BOTTOM);
    // 頂部主分隔線
    bar.lineStyle(2, 0x2A5080, 1);
    bar.beginPath();
    bar.moveTo(0, barY); bar.lineTo(W, barY);
    bar.strokePath();
    // 頂部微光（略亮的第二條細線，增加法術列入口感）
    bar.lineStyle(1, 0x5599CC, 0.38);
    bar.beginPath();
    bar.moveTo(0, barY + 2); bar.lineTo(W, barY + 2);
    bar.strokePath();

    // ── 魔力條（每幀由 updateSpellBar 重繪）──
    this._manaBarG = scene.add.graphics().setDepth(11);

    // ── 法術按鈕（每幀重繪狀態）──
    this._spellBarG = scene.add.graphics().setDepth(11);

    // ── 文字物件（icon / cost / cd，每幀更新內容）──
    const SPELL_IDS = ['HASTE', 'METEOR', 'FORTIFY'];
    for (let i = 0; i < SPELL_IDS.length; i++) {
      const id  = SPELL_IDS[i];
      const cfg = SPELL_CONFIG[id];
      const bx  = bxList[i];

      // 法術圖示（大 emoji，居中在按鈕上）
      const iconTxt = scene.add.text(bx, btnY, cfg.icon, {
        fontSize: '36px',           // was 24px（×1.5）
      }).setOrigin(0.5).setDepth(13).setAlpha(1);

      // 魔力消耗（小字，按鈕左上角）
      const costTxt = scene.add.text(bx - 28, btnY - 28, `${cfg.manaCost}`, {   // -19→-28（×1.5）
        fontSize:        '13px',    // was 9px（×1.5）
        fontFamily:      'Arial, sans-serif',
        color:           '#AACCFF',
        stroke:          '#000000',
        strokeThickness: 2,
        resolution:      2,
      }).setOrigin(0.5).setDepth(14);

      // 冷卻倒數（按鈕中央，冷卻時顯示）
      const cdTxt = scene.add.text(bx, btnY, '', {
        fontSize:        '21px',    // was 14px（×1.5）
        fontFamily:      'Arial Black, sans-serif',
        color:           '#FFFFFF',
        stroke:          '#000000',
        strokeThickness: 4,         // was 3
        resolution:      2,
      }).setOrigin(0.5).setDepth(15).setVisible(false);

      // 法術名稱（按鈕下方小標）
      const nameTxt = scene.add.text(bx, btnY + 43, cfg.name, {   // 29→43（×1.5）
        fontSize:   '15px',         // was 10px（×1.5）
        fontFamily: 'Arial, sans-serif',
        color:      '#9AAABB',
      }).setOrigin(0.5).setDepth(13);

      this._spellSlots.push({ id, bx, by: btnY, cfg, iconTxt, costTxt, cdTxt, nameTxt });
    }

    // ── 互動區（透明矩形，觸發點擊）──
    // 稍後由 setupSpells() 加上 callback，避免在 setup() 階段就需要 spellSystem 參數
    for (let i = 0; i < SPELL_IDS.length; i++) {
      const slot = this._spellSlots[i];
      const zone = scene.add.zone(slot.bx, slot.by, 87, 87)   // 58→87（×1.5）
        .setDepth(16).setInteractive({ useHandCursor: true });
      slot.zone = zone;
    }

    this._spellBarReady = true;
  }

  /**
   * 綁定法術按鈕點擊 callback（在 GameScene.create() 中呼叫，spellSystem 就緒後）
   * @param {(spellId: string) => void} onSpellSelect
   */
  setupSpells(onSpellSelect) {
    for (const slot of this._spellSlots) {
      slot.zone.on('pointerup', () => onSpellSelect(slot.id));
    }
  }

  /**
   * 每幀呼叫：重繪魔力條 + 法術按鈕狀態（可施放 / 冷卻中 / 等待施放）
   * @param {import('../systems/SpellSystem.js').SpellSystem} spellSystem
   */
  updateSpellBar(spellSystem) {
    if (!this._spellBarReady) return;

    const scene     = this._scene;
    const W         = scene.cameras.main.width;
    const H         = scene.cameras.main.height;
    const barY      = H - HUD_BOTTOM;
    const manaH     = 10;   // was 7（×1.5，魔力條略加高）
    const pendingId = spellSystem.getPendingSpell();
    const manaInt   = Math.floor(spellSystem.mana);

    // ── Dirty check：收集本幀冷卻秒數 ──────────────────────
    const curCdSecs = {};
    for (const slot of this._spellSlots) {
      curCdSecs[slot.id] = spellSystem.getCooldownSecs(slot.id);
    }

    // 判斷是否有任何變化
    let dirty = false;
    if (manaInt !== this._prevManaInt)   dirty = true;
    if (pendingId !== this._prevPending) dirty = true;
    if (!dirty) {
      for (const slot of this._spellSlots) {
        if (curCdSecs[slot.id] !== (this._prevCdSecs[slot.id] ?? -1)) {
          dirty = true;
          break;
        }
      }
    }

    // 若無變化，跳過重繪（節省 GPU fill/stroke 開銷）
    if (!dirty) return;

    // 更新快取
    this._prevManaInt = manaInt;
    this._prevPending = pendingId;
    for (const slot of this._spellSlots) {
      this._prevCdSecs[slot.id] = curCdSecs[slot.id];
    }

    // ── 魔力條 ──
    const mg        = this._manaBarG;
    const manaRatio = spellSystem.mana / spellSystem.maxMana;
    mg.clear();
    // 背景（深暗紫黑）
    mg.fillStyle(0x080618, 1);
    mg.fillRect(0, barY, W, manaH);
    // 填充（三層模擬藍紫漸層）
    if (manaRatio > 0) {
      mg.fillStyle(0x3322BB, 1);
      mg.fillRect(0, barY, W * manaRatio, manaH);
      mg.fillStyle(0x7766EE, 0.65);
      mg.fillRect(0, barY, W * manaRatio, manaH * 0.5);
      mg.fillStyle(0xCCBBFF, 0.28);
      mg.fillRect(0, barY, W * manaRatio, manaH * 0.22);
    }

    // ── 法術按鈕 ──
    const sg = this._spellBarG;
    sg.clear();

    for (const slot of this._spellSlots) {
      const { id, bx, by: btnY, cfg } = slot;
      const canCast  = spellSystem.canCast(id);
      const isPending = (pendingId === id);
      const cdRatio  = spellSystem.getCooldownRatio(id);
      const cdSecs   = spellSystem.getCooldownSecs(id);
      const R        = 39;   // was 26（×1.5，法術按鈕半徑）

      // ── 判斷三種 disabled 子狀態（語意統一）──
      const isCoolingDown = !canCast && cdRatio > 0;
      const isNoMana      = !canCast && cdRatio === 0 && !isPending;

      // ── 按鈕底圓（三種 disabled 各有獨立底色）──
      let fillCol, fillAlpha;
      if      (isPending)       { fillCol = cfg.color; fillAlpha = 0.30; }
      else if (isNoMana)        { fillCol = 0x0D1422;  fillAlpha = 0.97; } // 無魔力：locked 最暗
      else if (isCoolingDown)   { fillCol = 0x0E1828;  fillAlpha = 0.93; } // 冷卻中：深藍灰
      else                      { fillCol = 0x111928;  fillAlpha = 0.80; } // 可施放：標準暗底
      sg.fillStyle(fillCol, fillAlpha);
      sg.fillCircle(bx, btnY, R);

      // ── 邊框（可施放亮、冷卻暗、無魔力用不同色調做區分）──
      let brdColor, brdAlpha, brdW;
      if      (isPending)       { brdColor = cfg.color; brdAlpha = 1.0;  brdW = 2.5; }
      else if (canCast)         { brdColor = cfg.color; brdAlpha = 0.82; brdW = 1.8; }
      else if (isCoolingDown)   { brdColor = 0x2A3A50; brdAlpha = 0.28; brdW = 1.5; }
      else                      { brdColor = 0x1E2A40; brdAlpha = 0.44; brdW = 1.5; } // 無魔力：偏藍
      sg.lineStyle(brdW, brdColor, brdAlpha);
      sg.strokeCircle(bx, btnY, R);

      // ── 可施放時的外裝飾環（低透明度，增加法術就緒感）──
      if (canCast && !isPending) {
        sg.lineStyle(1, cfg.color, 0.20);
        sg.strokeCircle(bx, btnY, R + 13);
      }

      // ── 冷卻扇形覆蓋（三角扇逼近圓弧）──
      if (cdRatio > 0) {
        const startA = -Math.PI / 2;
        const endA   = startA + cdRatio * Math.PI * 2;
        const steps  = 28;
        sg.fillStyle(0x000000, 0.68);
        for (let s = 0; s < steps; s++) {
          const a1 = startA + (endA - startA) * (s / steps);
          const a2 = startA + (endA - startA) * ((s + 1) / steps);
          sg.fillTriangle(
            bx, btnY,
            bx + Math.cos(a1) * R, btnY + Math.sin(a1) * R,
            bx + Math.cos(a2) * R, btnY + Math.sin(a2) * R
          );
        }
      }

      // ── 等待施放的脈衝外環 ──
      // 脈衝動畫需要每幀更新，因此 isPending 時強制 dirty（已在上方 dirty check 中處理）
      if (isPending) {
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(scene.time.now * 0.006));
        sg.lineStyle(4, cfg.color, pulse);    // was 3（配合更大按鈕）
        sg.strokeCircle(bx, btnY, R + 7);    // was R+5
        // 確保下幀繼續重繪（脈衝動畫需逐幀更新）
        this._prevPending = null;   // 強制下幀重入 dirty 判斷
      }

      // ── 文字狀態更新（三種 disabled 各有對應透明度與色調）──
      // isNoMana / isCoolingDown 沿用上方已定義的變數
      slot.iconTxt.setAlpha(canCast ? 1.0 : isNoMana ? 0.22 : 0.35);
      slot.nameTxt.setAlpha(canCast ? 0.85 : isNoMana ? 0.28 : 0.40);
      slot.costTxt.setAlpha(0.88);
      // 魔力不足時：消耗文字轉暗紅，提示玩家「魔力不夠」而非「冷卻中」
      slot.costTxt.setColor(isNoMana ? '#CC4444' : '#AACCFF');

      if (cdSecs > 0) {
        slot.cdTxt.setText(`${cdSecs}`).setVisible(true);
        slot.iconTxt.setAlpha(0.15);   // 圖示更暗，突出倒數數字
      } else {
        slot.cdTxt.setVisible(false);
      }
    }
  }
}
