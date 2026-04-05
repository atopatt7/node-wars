/**
 * ShopScene.js — 軍備商店場景（3欄格線版）
 *
 * 設計主題：虛空金色中世紀
 * 佈局（1280×720）：
 *   頂部標題列（固定 72px, depth 10）
 *   可捲動 3 欄商品格線（Container + GeometryMask）
 *   底部資訊列（固定 44px, depth 10）
 *
 * 格線規格（from Figma）：
 *   CARD_W=384, CARD_H=164, COL_GAP=16, ROW_GAP=16
 *   GRID_LEFT=(1280-1184)/2=48
 *
 * 卡片三種狀態：
 *   'buyable'     — 可購買，金色邊框，底部購買按鈕
 *   'insufficient'— 金幣不足，暗邊框，按鈕顯示「金幣不足」
 *   'locked'      — 未開放，極暗配色，鎖頭圖示+解鎖條件
 *
 * 捲動架構同 LevelSelectScene（Container + GeometryMask + wheel）
 */

import { audioManager } from '../systems/AudioManager.js';

// ── 佈局常數 ────────────────────────────────────────────────────
const TITLE_H  = 72;
const HINT_H   = 44;
const DRAG_THR = 12;

const COLS      = 3;
const CARD_W    = 384;
const CARD_H    = 164;
const COL_GAP   = 16;
const ROW_GAP   = 16;

const GRID_PAD_TOP = 16;
const GRID_PAD_BOT = 24;

// ── 商店道具資料（對應 Figma 三種狀態）─────────────────────────
const SHOP_ITEMS = [
  {
    category:      '防禦',
    name:          '鐵衛壁壘',
    badge:         '⛨',
    desc:          '強化我方所有防禦節點，使其在承受攻擊時維持更長時間',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         400,
    priceType:     'gold',
    state:         'buyable',
  },
  {
    category:      '增益',
    name:          '龍息火油',
    badge:         '🔥',
    desc:          '在目標節點塗抹火油，使敵方部隊行軍速度大幅降低',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         600,
    priceType:     'gold',
    state:         'buyable',
  },
  {
    category:      '奧術',
    name:          '虛空封印',
    badge:         '◈',
    desc:          '封印一條敵方增援路徑，持續至該關卡結束',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         3,
    priceType:     'arcane',
    state:         'buyable',
  },
  {
    category:      '防禦',
    name:          '聖盾護符',
    badge:         '🛡',
    desc:          '賦予指定英雄神聖護盾，使其免疫一次致命一擊',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         1200,
    priceType:     'gold',
    state:         'insufficient',
  },
  {
    category:      '增益',
    name:          '疾風馬蹄',
    badge:         '⚡',
    desc:          '提升我方所有騎兵單位行軍速度，快速佔領戰略要道',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         800,
    priceType:     'gold',
    state:         'insufficient',
  },
  {
    category:      '奧術',
    name:          '血和奠徒',
    badge:         '◈',
    desc:          '召喚一名血和奠徒，封印指定節點的虛空純化通道',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         5,
    priceType:     'arcane',
    state:         'insufficient',
  },
  {
    category:      '傳奇',
    name:          '黑鐵戰旗',
    badge:         '⚑',
    desc:          '植入戰場的傳奇戰旗，使周圍友軍士氣大幅提升',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         0,
    priceType:     'gold',
    state:         'locked',
    unlockCondition: '完成第三章以解鎖',
  },
  {
    category:      '奧術',
    name:          '虛空天象儲',
    badge:         '◈',
    desc:          '儲存虛空能量，待戰場局勢危急時釋放特殊變異力量',
    effectLabel:   '持續 1 場戰役  ·  單次使用',
    price:         0,
    priceType:     'arcane',
    state:         'locked',
    unlockCondition: '完成第四章以解鎖',
  },
];

export class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ShopScene' });
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#080604');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── 格線幾何 ──────────────────────────────────────────────
    this._gridLeft  = Math.round((W - (COLS * CARD_W + (COLS - 1) * COL_GAP)) / 2);
    this._gridRight = W - this._gridLeft;

    // ── 捲動佈局計算 ──────────────────────────────────────────
    const CONTAINER_BASE_Y = TITLE_H;
    const VISIBLE_H   = H - TITLE_H - HINT_H;
    const numRows     = Math.ceil(SHOP_ITEMS.length / COLS);
    const CONTENT_H   = GRID_PAD_TOP
      + numRows * (CARD_H + ROW_GAP) - ROW_GAP
      + GRID_PAD_BOT;
    const MAX_SCROLL  = Math.max(0, CONTENT_H - VISIBLE_H);

    this._containerBaseY = CONTAINER_BASE_Y;
    this._maxScroll      = MAX_SCROLL;
    this._safeTop        = TITLE_H;
    this._safeBottom     = H - HINT_H;

    this._scrollY   = 0;
    this._dragStart = null;
    this._wasDrag   = false;

    // ── 可捲動容器 ────────────────────────────────────────────
    this._container = this.add.container(0, CONTAINER_BASE_Y);

    SHOP_ITEMS.forEach((item, idx) => {
      const row = Math.floor(idx / COLS);
      const col = idx % COLS;
      const cx  = this._gridLeft + col * (CARD_W + COL_GAP) + CARD_W / 2;
      const cy  = GRID_PAD_TOP + row * (CARD_H + ROW_GAP) + CARD_H / 2;
      this._addItemCard(cx, cy, CARD_W, CARD_H, item, idx);
    });

    // ── GeometryMask ──────────────────────────────────────────
    const maskGfx = this.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, CONTAINER_BASE_Y, W, VISIBLE_H);
    this._container.setMask(maskGfx.createGeometryMask());

    // 卡片入場動畫由各 sub-container 個別控制（stagger 30ms）

    // ── 固定 UI ───────────────────────────────────────────────
    this._buildTitleBar(W);
    this._buildFooterBar(W, H);

    if (MAX_SCROLL > 0) {
      this._buildScrollbar(W, CONTAINER_BASE_Y, VISIBLE_H, MAX_SCROLL);
    }

    // ── 手機拖曳捲動 ──────────────────────────────────────────
    this.input.on('pointerdown', (ptr) => {
      if (ptr.y < TITLE_H || ptr.y > H - HINT_H) return;
      this._dragStart = { y: ptr.y, scrollY: this._scrollY };
      this._wasDrag   = false;
    });
    this.input.on('pointermove', (ptr) => {
      if (!this._dragStart || !ptr.isDown) return;
      const dy = this._dragStart.y - ptr.y;
      if (Math.abs(dy) > DRAG_THR) this._wasDrag = true;
      this._setScroll(Phaser.Math.Clamp(this._dragStart.scrollY + dy, 0, MAX_SCROLL));
    });
    this.input.on('pointerup', () => { this._dragStart = null; });

    // ── 桌機滾輪 ──────────────────────────────────────────────
    this._onWheel = (e) => {
      this._setScroll(Phaser.Math.Clamp(this._scrollY + e.deltaY * 0.5, 0, MAX_SCROLL));
    };
    this.game.canvas.addEventListener('wheel', this._onWheel, { passive: true });

    this.events.on('shutdown', () => {
      if (this._onWheel) {
        this.game.canvas.removeEventListener('wheel', this._onWheel);
        this._onWheel = null;
      }
    });
  }

  // ── 捲動核心 ──────────────────────────────────────────────────

  _setScroll(y) {
    this._scrollY     = y;
    this._container.y = this._containerBaseY - y;
    if (this._scrollThumb && this._maxScroll > 0) {
      const ratio = y / this._maxScroll;
      this._scrollThumb.y = this._thumbBaseY + ratio * this._thumbTravel;
    }
  }

  // ── 頁首（固定）──────────────────────────────────────────────

  _buildTitleBar(W) {
    const bar = this.add.graphics();
    bar.fillStyle(0x050402, 0.95);
    bar.fillRect(0, 0, W, TITLE_H);
    bar.fillStyle(0xb8922a, 0.35);
    bar.fillRect(0, TITLE_H, W, 1);
    bar.fillStyle(0xb8922a, 0.60);
    bar.fillRect(0, 0, W, 2);
    bar.fillStyle(0xb8922a, 0.55);
    bar.fillRect(0, 0, 4, TITLE_H);
    bar.fillRect(W - 4, 0, 4, TITLE_H);
    bar.setDepth(10);

    // 主標題
    this.add.text(W / 2, 20, '軍備商店', {
      fontSize:   '26px',
      fontFamily: 'Arial Black, sans-serif',
      color:      '#c9a84c',
    }).setOrigin(0.5, 0).setDepth(10);

    // 副標籤
    this.add.text(W / 2, 50, "QUARTERMASTER'S DEPOT  ·  WAR ASSETS", {
      fontSize:   '10px',
      fontFamily: 'Arial, sans-serif',
      color:      '#b8922a',
    }).setOrigin(0.5, 0).setAlpha(0.40).setDepth(10);

    // 資源顯示（右上角）
    const resGfx = this.add.graphics();
    resGfx.fillStyle(0x0f0b06, 1);
    resGfx.fillRoundedRect(W - 20 - 306, 14, 306, 44, 3);
    resGfx.lineStyle(1, 0xb8922a, 0.25);
    resGfx.strokeRoundedRect(W - 20 - 306, 14, 306, 44, 3);
    resGfx.setDepth(10);

    this.add.text(W - 20 - 306 + 12, 20, '⚜  金幣    1,250', {
      fontSize: '13px', color: '#c9a84c',
    }).setAlpha(0.85).setDepth(10);

    this.add.text(W - 20 - 306 + 12, 38, '◈  奧術石     8', {
      fontSize: '13px', color: '#8b5aae',
    }).setAlpha(0.75).setDepth(10);

    // 返回按鈕
    const backBtnGfx = this.add.graphics();
    const backBtnDraw = (hover = false, pressed = false) => {
      backBtnGfx.clear();
      const fill  = pressed ? 0x100c06 : (hover ? 0x251b0e : 0x18120a);
      const bAlpha = hover ? 0.65 : 0.35;
      backBtnGfx.fillStyle(fill, 1);
      backBtnGfx.fillRoundedRect(20, 18, 100, 36, 3);
      backBtnGfx.lineStyle(1, 0xb8922a, bAlpha);
      backBtnGfx.strokeRoundedRect(20, 18, 100, 36, 3);
    };
    backBtnDraw();
    backBtnGfx.setDepth(10);

    const backTxt = this.add.text(70, 36, '← 返回', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#c9a84c',
    }).setOrigin(0.5).setAlpha(0.75).setDepth(10);

    backBtnGfx.setInteractive(
      new Phaser.Geom.Rectangle(20, 18, 100, 36),
      Phaser.Geom.Rectangle.Contains
    );
    backBtnGfx.on('pointerdown', () => { backBtnDraw(false, true); backTxt.setAlpha(0.45); });
    backBtnGfx.on('pointerover', () => { backBtnDraw(true);         backTxt.setAlpha(0.90); });
    backBtnGfx.on('pointerout',  () => { backBtnDraw(false);        backTxt.setAlpha(0.75); });
    backBtnGfx.on('pointerup',   () => {
      backBtnDraw(false); backTxt.setAlpha(0.75);
      audioManager.play('ui_click');
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });
  }

  // ── 頁尾（固定）──────────────────────────────────────────────

  _buildFooterBar(W, H) {
    const foot = this.add.graphics();
    foot.fillStyle(0x050402, 0.95);
    foot.fillRect(0, H - HINT_H, W, HINT_H);
    foot.fillStyle(0xb8922a, 0.20);
    foot.fillRect(0, H - HINT_H, W, 1);
    foot.fillStyle(0xb8922a, 0.60);
    foot.fillRect(0, H - 2, W, 2);
    foot.fillStyle(0xb8922a, 0.55);
    foot.fillRect(0, H - HINT_H, 4, HINT_H);
    foot.fillRect(W - 4, H - HINT_H, 4, HINT_H);
    foot.setDepth(10);

    this.add.text(20 + 28, H - HINT_H / 2,
      '⚜ 金幣與 ◈ 奧術石可於戰役勝利後獲得  ·  部分道具限量供應，每章刷新一次', {
        fontSize: '11px', color: '#8a6a22',
      }).setOrigin(0, 0.5).setAlpha(0.45).setDepth(10);

    this.add.text(W - 20, H - HINT_H / 2,
      `持有道具  0 / 8 格`, {
        fontSize: '11px', color: '#8a6a22',
      }).setOrigin(1, 0.5).setAlpha(0.40).setDepth(10);
  }

  // ── 右側捲動條 ────────────────────────────────────────────────

  _buildScrollbar(W, baseY, visibleH, maxScroll) {
    const TRACK_X = W - 10;
    const TRACK_W = 3;

    const track = this.add.graphics();
    track.fillStyle(0xb8922a, 0.12);
    track.fillRoundedRect(TRACK_X - 1, baseY, TRACK_W + 2, visibleH, 2);
    track.setDepth(11);

    const thumbH = Math.max(28, (visibleH / (visibleH + maxScroll)) * visibleH);
    const travel = visibleH - thumbH;

    const thumb = this.add.graphics();
    thumb.fillStyle(0xb8922a, 0.45);
    thumb.fillRoundedRect(0, 0, TRACK_W, thumbH, 2);
    thumb.setPosition(TRACK_X, baseY);
    thumb.setDepth(12);

    this._scrollThumb = thumb;
    this._thumbBaseY  = baseY;
    this._thumbTravel = travel;
  }

  // ── 商品卡片 ──────────────────────────────────────────────────

  /**
   * @param {number} cx          容器本地 X 中心
   * @param {number} cy          容器本地 Y 中心
   * @param {number} cw          卡片寬 (384)
   * @param {number} ch          卡片高 (164)
   * @param {object} item        道具資料
   * @param {number} staggerIdx  進場動畫延遲序號
   */
  _addItemCard(cx, cy, cw, ch, item, staggerIdx = 0) {
    const halfW = cw / 2;  // 192
    const halfH = ch / 2;  // 82

    // sub-container 置於主容器的 (cx, cy)，卡片內部用本地座標
    const sub = this.add.container(cx, cy);

    // 本地座標（以 sub 中心為原點）
    const L = -halfW;  // -192
    const T = -halfH;  // -82

    const isLocked       = item.state === 'locked';
    const isInsufficient = item.state === 'insufficient';

    const g = this.add.graphics();

    const drawCard = (hover = false, pressed = false) => {
      g.clear();

      let fill, borderColor, borderAlpha;
      if (isLocked) {
        fill        = 0x090704;
        borderColor = 0x3d3530;
        borderAlpha = 0.35;
      } else if (isInsufficient) {
        fill        = 0x0f0b06;
        borderColor = 0x8a6a22;
        borderAlpha = 0.28;
      } else {
        fill        = 0x18120a;
        borderColor = 0xb8922a;
        borderAlpha = 0.65;
      }

      if (!isLocked) {
        if (hover && !pressed) {
          fill        = Phaser.Display.Color.ValueToColor(fill).lighten(8).color;
          borderAlpha = Math.min(1, borderAlpha + 0.22);
        }
        if (pressed) {
          fill        = Phaser.Display.Color.ValueToColor(fill).darken(10).color;
          borderAlpha *= 0.70;
        }
      }

      g.fillStyle(fill, 1);
      g.fillRoundedRect(L, T, cw, ch, 3);

      if (!isLocked && hover && !pressed) {
        g.fillStyle(0xffffff, 0.04);
        g.fillRoundedRect(L + 2, T + 2, cw - 4, 20, 3);
      }
      if (!isLocked && pressed) {
        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(L, T, cw, 20, 3);
      }

      g.lineStyle(hover && !isLocked ? 1.5 : 1, borderColor, borderAlpha);
      g.strokeRoundedRect(L, T, cw, ch, 3);

      const divAlpha = isLocked ? 0.12 : 0.20;
      g.lineStyle(1, 0xb8922a, divAlpha);
      g.beginPath();
      g.moveTo(L + 14, T + 52);
      g.lineTo(L + cw - 14, T + 52);
      g.strokePath();

      const botAlpha = isLocked ? 0.60 : 0.80;
      g.fillStyle(0x0c0905, botAlpha);
      g.fillRect(L, T + 118, cw, ch - 118);
    };
    drawCard(false);

    // ── 文字內容 ──────────────────────────────────────────────
    const children = [g];

    if (isLocked) {
      children.push(
        this.add.text(L + 14, T + 10, item.category, {
          fontSize: '10px', color: '#594d38',
        }).setAlpha(0.40),

        this.add.text(L + 14, T + 24, item.name, {
          fontSize: '18px', fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold', color: '#665740',
        }).setAlpha(0.35),

        this.add.text(L + cw - 28, T + 14, '🔒', {
          fontSize: '18px',
        }).setOrigin(0.5).setAlpha(0.25),

        this.add.text(L + 14, T + 62, item.desc, {
          fontSize: '12px', color: '#594d38',
          wordWrap: { width: cw - 28 },
        }).setAlpha(0.30),

        this.add.text(L + 14, T + 96, item.unlockCondition || '尚未開放', {
          fontSize: '10px', color: '#594d38',
        }).setAlpha(0.35),

        this.add.text(L + 14, T + 133, '⚜ ─ ─ ─', {
          fontSize: '14px', color: '#594d38',
        }).setAlpha(0.25)
      );

      const lockBtnGfx = this.add.graphics();
      lockBtnGfx.fillStyle(0x0e0c09, 1);
      lockBtnGfx.fillRoundedRect(L + 248, T + 125, 120, 30, 2);
      lockBtnGfx.lineStyle(1, 0x3d3530, 0.30);
      lockBtnGfx.strokeRoundedRect(L + 248, T + 125, 120, 30, 2);

      const lockBtnTxt = this.add.text(L + 248 + 60, T + 125 + 15, '🔒 尚未開放', {
        fontSize: '12px', color: '#665945',
      }).setOrigin(0.5).setAlpha(0.45);

      children.push(lockBtnGfx, lockBtnTxt);
      sub.add(children);
      this._container.add(sub);

      // 進場 stagger：alpha 0→1, scale 0.98→1, 180ms
      sub.setAlpha(0).setScale(0.98);
      this.tweens.add({
        targets: sub, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 180, delay: staggerIdx * 30, ease: 'Quad.easeOut',
      });
      return;
    }

    // ── 可購買 / 金幣不足 ─────────────────────────────────
    children.push(
      this.add.text(L + 14, T + 10, item.category, {
        fontSize: '10px', color: '#b8922a',
      }).setAlpha(0.55),

      this.add.text(L + 14, T + 24, item.name, {
        fontSize: '18px', fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold', color: '#e8d9b8',
      }).setAlpha(0.95),

      this.add.text(L + cw - 28, T + 14, item.badge || '◈', {
        fontSize: '22px', color: '#b8922a',
      }).setOrigin(0.5).setAlpha(0.30),

      this.add.text(L + 14, T + 62, item.desc, {
        fontSize: '12px', color: '#a89070',
        wordWrap: { width: cw - 28 },
      }).setAlpha(0.70),

      this.add.text(L + 14, T + 96, item.effectLabel || '', {
        fontSize: '10px', color: '#8a6a22',
      }).setAlpha(0.45)
    );

    const priceSymbol = item.priceType === 'arcane' ? '◈' : '⚜';
    const priceColor  = isInsufficient
      ? (item.priceType === 'arcane' ? '#4f2d64' : '#8a3737')
      : (item.priceType === 'arcane' ? '#8b5aae' : '#c9a84c');

    children.push(
      this.add.text(L + 14, T + 133, `${priceSymbol} ${item.price}`, {
        fontSize: '15px', fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold', color: priceColor,
      }).setAlpha(isInsufficient ? (item.priceType === 'arcane' ? 0.75 : 0.85) : 0.90)
    );

    // 購買按鈕（右下，在底部購買區）
    const btnGfx = this.add.graphics();
    const BTN_BASE_Y = T + 125 + 15;  // 按鈕文字基準 Y

    const drawBuyBtn = (btnHover = false, btnPressed = false) => {
      btnGfx.clear();
      if (isInsufficient) {
        btnGfx.fillStyle(0x381919, 1);
        btnGfx.fillRoundedRect(L + 272, T + 125, 96, 30, 2);
      } else {
        let btnFill = 0xb8922a;
        if (btnHover && !btnPressed) btnFill = Phaser.Display.Color.ValueToColor(btnFill).lighten(12).color;
        if (btnPressed)              btnFill = Phaser.Display.Color.ValueToColor(btnFill).darken(10).color;
        btnGfx.fillStyle(btnFill, 1);
        btnGfx.fillRoundedRect(L + 272, T + 125, 96, 30, 2);
      }
    };
    drawBuyBtn();

    const btnColor = isInsufficient ? '#a85c5c' : '#100b04';
    const btnLabel = isInsufficient
      ? (item.priceType === 'arcane' ? '奧術不足' : '金幣不足')
      : '購　買';

    const btnTxt = this.add.text(L + 272 + 48, BTN_BASE_Y, btnLabel, {
      fontSize: '13px', fontFamily: 'Arial Black, sans-serif', color: btnColor,
    }).setOrigin(0.5).setAlpha(isInsufficient ? 0.75 : 1.0);

    if (!isInsufficient) {
      btnGfx.setInteractive(
        new Phaser.Geom.Rectangle(L + 272, T + 125, 96, 30),
        Phaser.Geom.Rectangle.Contains
      );
      btnGfx.on('pointerover', () => { drawBuyBtn(true); });
      btnGfx.on('pointerout',  () => { drawBuyBtn(false); btnTxt.setY(BTN_BASE_Y); });
      btnGfx.on('pointerdown', () => {
        // pressed：顏色 -10%（drawBuyBtn 處理）+ y+2 + 120ms tween
        drawBuyBtn(false, true);
        this.tweens.add({ targets: btnTxt, y: BTN_BASE_Y + 2, duration: 120, ease: 'Quad.easeOut' });
      });
      btnGfx.on('pointerup', () => {
        drawBuyBtn(false);
        this.tweens.add({ targets: btnTxt, y: BTN_BASE_Y, duration: 120, ease: 'Quad.easeOut' });
        audioManager.play('ui_click');
        /* 購買邏輯預留 */
      });
    }

    children.push(btnGfx, btnTxt);

    // ── 卡片互動（hover scale + border）──────────────────────
    g.setInteractive(
      new Phaser.Geom.Rectangle(L, T, cw, ch),
      Phaser.Geom.Rectangle.Contains
    );
    g.on('pointerover', () => {
      drawCard(true);
      audioManager.play('ui_hover');
      this.tweens.killTweensOf(sub);
      this.tweens.add({ targets: sub, scaleX: 1.015, scaleY: 1.015, duration: 150, ease: 'Quad.easeOut' });
    });
    g.on('pointerout', () => {
      drawCard(false);
      this.tweens.killTweensOf(sub);
      this.tweens.add({ targets: sub, scaleX: 1, scaleY: 1, duration: 150, ease: 'Quad.easeOut' });
    });
    g.on('pointerdown', () => drawCard(false, true));
    g.on('pointerup', () => {
      drawCard(false);
      if (this._wasDrag) return;
      // 主要互動在購買按鈕處理
    });

    sub.add(children);
    this._container.add(sub);

    // 進場 stagger：alpha 0→1, scale 0.98→1, 180ms, 30ms stagger
    sub.setAlpha(0).setScale(0.98);
    this.tweens.add({
      targets: sub, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 180, delay: staggerIdx * 30, ease: 'Quad.easeOut',
    });
  }
}
