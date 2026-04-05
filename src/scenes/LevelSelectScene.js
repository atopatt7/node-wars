/**
 * LevelSelectScene.js — 關卡選擇場景（3欄格線版）
 *
 * 設計主題：虛空金色中世紀
 * 佈局（1280×720）：
 *   頂部標題列（固定 72px, depth 10）
 *   可捲動 3 欄格線（Container + GeometryMask）
 *     - 每章節 5 關排成 2 行（3+2）
 *     - 章節分隔線（金色細線 + 標題文字）
 *     - 三種卡片狀態：已完成 / 可進入 / 鎖定
 *   底部資訊列（固定 44px, depth 10）
 *
 * 格線規格（from Figma）：
 *   CARD_W=384, CARD_H=116, COL_GAP=16, ROW_GAP=16
 *   GRID_LEFT=(1280-1184)/2=48, GRID_RIGHT=1232
 *
 * 捲動架構：
 *   container.y = TITLE_H - scrollY
 *   GeometryMask 遮蓋 y=TITLE_H ~ y=H-HINT_H
 *   pointerdown/pointermove 拖曳 + canvas wheel 事件
 *   DRAG_THR=12, wasDrag 防卡片誤觸
 */

import { LEVELS, CHAPTERS } from '../data/levels.js';
import { SaveSystem }        from '../systems/SaveSystem.js';
import { audioManager }      from '../systems/AudioManager.js';

// ── 佈局常數 ────────────────────────────────────────────────────
const TITLE_H  = 72;    // 頁首高度
const HINT_H   = 44;    // 頁尾高度
const DRAG_THR = 12;    // 拖曳閾值

// 格線規格（from Figma）
const COLS       = 3;
const CARD_W     = 384;
const CARD_H     = 116;
const COL_GAP    = 16;
const ROW_GAP    = 16;

// 章節分隔區
const CH_AREA    = 28;   // 章節標籤+線段 佔用高度
const CH_BETWEEN = 17;   // 兩章之間的額外間距
const GRID_PAD_TOP = 16; // 頁首底部到第一章節的距離
const GRID_PAD_BOT = 24; // 最後一排底部到底部列的距離

const LEVELS_PER_CHAPTER = 5;
const NUM_CHAPTERS       = 6;
const ROWS_PER_CHAPTER   = Math.ceil(LEVELS_PER_CHAPTER / COLS); // = 2

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#080604');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── 格線幾何 ──────────────────────────────────────────────
    // GRID_LEFT = (W - totalGridW) / 2 = (1280-1184)/2 = 48
    this._gridLeft  = Math.round((W - (COLS * CARD_W + (COLS - 1) * COL_GAP)) / 2);
    this._gridRight = W - this._gridLeft;

    // ── 捲動佈局計算 ──────────────────────────────────────────
    const CONTAINER_BASE_Y = TITLE_H;
    const VISIBLE_H = H - TITLE_H - HINT_H;

    // 總內容高：PAD_TOP + 6章×(章節區+2行) + 5個章間距 + PAD_BOT
    const CONTENT_H = GRID_PAD_TOP
      + NUM_CHAPTERS * (CH_AREA + ROWS_PER_CHAPTER * (CARD_H + ROW_GAP) - ROW_GAP)
      + (NUM_CHAPTERS - 1) * CH_BETWEEN
      + GRID_PAD_BOT;

    const MAX_SCROLL = Math.max(0, CONTENT_H - VISIBLE_H);

    this._containerBaseY = CONTAINER_BASE_Y;
    this._maxScroll      = MAX_SCROLL;
    this._safeTop        = TITLE_H;
    this._safeBottom     = H - HINT_H;

    // ── 捲動狀態 ──
    this._scrollY   = 0;
    this._dragStart = null;
    this._wasDrag   = false;

    // ── 可捲動容器 ────────────────────────────────────────────
    this._container = this.add.container(0, CONTAINER_BASE_Y);

    const completed   = SaveSystem.getCompletedLevels();
    const maxUnlocked = SaveSystem.getMaxUnlocked();

    // 按章節（每 5 關）分組繪製
    let cumY = GRID_PAD_TOP;
    let cardStaggerIdx = 0;

    for (let chIdx = 0; chIdx < NUM_CHAPTERS; chIdx++) {
      const chapter   = CHAPTERS[chIdx + 1];
      const chLevels  = LEVELS.slice(chIdx * LEVELS_PER_CHAPTER, (chIdx + 1) * LEVELS_PER_CHAPTER);
      if (!chapter || chLevels.length === 0) continue;

      // 章節分隔標頭
      this._addChapterHeader(cumY, chapter);
      cumY += CH_AREA;

      // 各行卡片
      for (let r = 0; r < ROWS_PER_CHAPTER; r++) {
        for (let c = 0; c < COLS; c++) {
          const lvlIdx = r * COLS + c;
          if (lvlIdx >= chLevels.length) break;
          const lvl      = chLevels[lvlIdx];
          const cx       = this._gridLeft + c * (CARD_W + COL_GAP) + CARD_W / 2;
          const cy       = cumY + CARD_H / 2;
          const isDone   = !!completed[lvl.id];
          const isLocked = lvl.id > maxUnlocked;
          this._addCard(cx, cy, CARD_W, CARD_H, lvl, isDone, isLocked, cardStaggerIdx++);
        }
        cumY += CARD_H + ROW_GAP;
      }
      cumY -= ROW_GAP;   // 移除最後一行多餘的 gap

      if (chIdx < NUM_CHAPTERS - 1) {
        cumY += CH_BETWEEN;
      }
    }

    // ── GeometryMask：裁切超出可視區的卡片 ────────────────────
    const maskGfx = this.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, CONTAINER_BASE_Y, W, VISIBLE_H);
    this._container.setMask(maskGfx.createGeometryMask());

    // 卡片入場動畫由各 sub-container 個別控制（stagger 30ms）

    // ── 固定 UI（depth 10）───────────────────────────────────
    this._buildTitleBar(W, H, completed, maxUnlocked);
    this._buildFooterBar(W, H);

    // ── 右側捲動條 ────────────────────────────────────────────
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

  _buildTitleBar(W, H, completed, maxUnlocked) {
    const bar = this.add.graphics();
    // 頁首底色
    bar.fillStyle(0x050402, 0.95);
    bar.fillRect(0, 0, W, TITLE_H);
    // 底部金線
    bar.fillStyle(0xb8922a, 0.35);
    bar.fillRect(0, TITLE_H, W, 1);
    // 頂部金線
    bar.fillStyle(0xb8922a, 0.60);
    bar.fillRect(0, 0, W, 2);
    // 左右緣金條
    bar.fillStyle(0xb8922a, 0.55);
    bar.fillRect(0, 0, 4, TITLE_H);
    bar.fillRect(W - 4, 0, 4, TITLE_H);
    bar.setDepth(10);

    // 主標題
    this.add.text(W / 2, 20, '戰役地圖', {
      fontSize:   '26px',
      fontFamily: 'Arial Black, sans-serif',
      color:      '#c9a84c',
    }).setOrigin(0.5, 0).setDepth(10);

    // 副標籤
    this.add.text(W / 2, 50, 'ANNO OBSCURUS · THE VOID CAMPAIGN', {
      fontSize:   '10px',
      fontFamily: 'Arial, sans-serif',
      color:      '#b8922a',
    }).setOrigin(0.5, 0).setAlpha(0.40).setDepth(10);

    // 進度顯示（右上角）
    const doneCount = Object.keys(completed).length;
    this.add.text(W - 20, 27, `進度：${doneCount} / ${LEVELS.length} 關`, {
      fontSize:   '12px',
      fontFamily: 'Arial, sans-serif',
      color:      '#a89070',
    }).setOrigin(1, 0.5).setAlpha(0.65).setDepth(10);

    // 返回按鈕（矩形 + 文字）
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
      fontSize:   '14px',
      fontFamily: 'Arial, sans-serif',
      color:      '#c9a84c',
    }).setOrigin(0.5).setAlpha(0.75).setDepth(10);

    backBtnGfx.setInteractive(
      new Phaser.Geom.Rectangle(20, 18, 100, 36),
      Phaser.Geom.Rectangle.Contains
    );
    backBtnGfx.on('pointerdown', () => { backBtnDraw(false, true); backTxt.setAlpha(0.45); });
    backBtnGfx.on('pointerover', () => { backBtnDraw(true);         backTxt.setAlpha(0.90); });
    backBtnGfx.on('pointerout',  () => { backBtnDraw(false);        backTxt.setAlpha(0.75); });
    backBtnGfx.on('pointerup',   () => {
      backBtnDraw(false);
      backTxt.setAlpha(0.75);
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

    // 當前目標提示
    const maxUnlocked = SaveSystem.getMaxUnlocked();
    const curLvl = LEVELS.find(l => l.id === maxUnlocked);
    const curName = curLvl ? curLvl.name : '─';
    this.add.text(20 + 28, H - HINT_H / 2,
      `▶  當前目標：第 ${String(maxUnlocked).padStart(2,'0')} 關「${curName}」`, {
        fontSize: '12px', color: '#c9a84c',
      }).setOrigin(0, 0.5).setAlpha(0.65).setDepth(10);

    const chIdx  = Math.ceil(maxUnlocked / LEVELS_PER_CHAPTER);
    this.add.text(W - 20, H - HINT_H / 2, `章節進度  ${chIdx} / ${NUM_CHAPTERS}`, {
      fontSize: '12px', color: '#8a6a22',
    }).setOrigin(1, 0.5).setAlpha(0.50).setDepth(10);
  }

  // ── 右側捲動條 ────────────────────────────────────────────────

  _buildScrollbar(W, baseY, visibleH, maxScroll) {
    const TRACK_X = W - 10;
    const TRACK_W = 3;

    const track = this.add.graphics();
    track.fillStyle(0xb8922a, 0.12);
    track.fillRoundedRect(TRACK_X - 1, baseY, TRACK_W + 2, visibleH, 2);
    track.setDepth(11);

    const thumbH  = Math.max(28, (visibleH / (visibleH + maxScroll)) * visibleH);
    const travel  = visibleH - thumbH;

    const thumb = this.add.graphics();
    thumb.fillStyle(0xb8922a, 0.45);
    thumb.fillRoundedRect(0, 0, TRACK_W, thumbH, 2);
    thumb.setPosition(TRACK_X, baseY);
    thumb.setDepth(12);

    this._scrollThumb = thumb;
    this._thumbBaseY  = baseY;
    this._thumbTravel = travel;
  }

  // ── 章節分隔標頭 ──────────────────────────────────────────────

  /**
   * @param {number} cumY     容器本地 Y（此章節標頭頂端）
   * @param {object} chapter  CHAPTERS 元素 { name, range, ... }
   */
  _addChapterHeader(cumY, chapter) {
    const gl = this._gridLeft;
    const gr = this._gridRight;

    // 章節文字（先建立取得寬度）
    const label   = `${chapter.name}  ·  關卡 ${chapter.range}`;
    const textX   = gl + 226;  // 與 Figma 一致：左線後 6px
    const lineY   = cumY + 16; // 標籤往下 16px 為分隔線

    const txt = this.add.text(textX, cumY + 4, label, {
      fontSize:   '13px',
      fontFamily: 'Arial, sans-serif',
      color:      '#c9a84c',
    }).setAlpha(0.70);

    const g = this.add.graphics();
    g.lineStyle(1, 0xb8922a, 0.35);

    // 左段金線（GRID_LEFT 到文字左側）
    g.beginPath();
    g.moveTo(gl, lineY);
    g.lineTo(textX - 6, lineY);
    g.strokePath();

    // 右段金線（文字右側到 GRID_RIGHT）
    g.beginPath();
    g.moveTo(textX + txt.width + 6, lineY);
    g.lineTo(gr, lineY);
    g.strokePath();

    this._container.add([g, txt]);
  }

  // ── 關卡卡片 ──────────────────────────────────────────────────

  /**
   * @param {number}  cx          容器本地 X 中心
   * @param {number}  cy          容器本地 Y 中心
   * @param {number}  cw          卡片寬 (384)
   * @param {number}  ch          卡片高 (116)
   * @param {object}  level       關卡資料
   * @param {boolean} isDone      是否已完成
   * @param {boolean} isLocked    是否已鎖定
   * @param {number}  staggerIdx  進場動畫延遲序號
   */
  _addCard(cx, cy, cw, ch, level, isDone, isLocked, staggerIdx = 0) {
    const halfW = cw / 2;  // 192
    const halfH = ch / 2;  // 58

    // sub-container 置於主容器的 (cx, cy)，卡片內部用本地座標
    const sub = this.add.container(cx, cy);

    // 本地座標（以 sub 中心為原點）
    const L = -halfW;  // -192
    const T = -halfH;  // -58

    const g = this.add.graphics();

    const drawCard = (hover = false, pressed = false) => {
      g.clear();

      if (isLocked) {
        g.fillStyle(0x0c0905, 1);
        g.fillRoundedRect(L, T, cw, ch, 3);
        g.lineStyle(1, 0x3d3530, 0.45);
        g.strokeRoundedRect(L, T, cw, ch, 3);
        return;
      }

      // 已完成 vs 可進入（未完成、未鎖定）
      let fill   = isDone ? 0x120e08 : 0x18120a;
      let bColor = 0xb8922a;
      let bAlpha = isDone ? 0.55 : 0.75;

      if (hover && !pressed) {
        fill   = Phaser.Display.Color.ValueToColor(fill).lighten(12).color;
        bAlpha = Math.min(1, bAlpha + 0.20);
      }
      if (pressed) {
        fill   = Phaser.Display.Color.ValueToColor(fill).darken(15).color;
        bAlpha *= 0.70;
      }

      g.fillStyle(fill, 1);
      g.fillRoundedRect(L, T, cw, ch, 3);

      if (hover && !pressed) {
        g.fillStyle(0xffffff, 0.04);
        g.fillRoundedRect(L + 2, T + 2, cw - 4, 20, 3);
      }
      if (pressed) {
        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(L, T, cw, 20, 3);
      }

      g.lineStyle(hover ? 1.5 : 1, bColor, bAlpha);
      g.strokeRoundedRect(L, T, cw, ch, 3);
    };
    drawCard(false);

    // ── 鎖定卡片內容 ──────────────────────────────────────────
    if (isLocked) {
      const numStr = `第 ${String(level.id).padStart(2,'0')} 關`;
      const numTxt = this.add.text(L + 14, T + 28, numStr, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#594d38',
      }).setAlpha(0.50);

      const nameTxt = this.add.text(L + 14, T + 42, level.name, {
        fontSize: '18px', fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold', color: '#665740',
      }).setAlpha(0.40);

      const hintTxt = this.add.text(L + 14, T + 70, `完成第 ${level.id - 1} 關以解鎖`, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#594d38',
      }).setAlpha(0.40);

      // cy → 0（sub-container 本地中心）
      const lockIco = this.add.text(L + cw - 28, 0, '🔒', {
        fontSize: '24px',
      }).setOrigin(0.5).setAlpha(0.35);

      sub.add([g, numTxt, nameTxt, hintTxt, lockIco]);
      this._container.add(sub);

      // 進場 stagger：alpha 0→1, scale 0.98→1, 180ms
      sub.setAlpha(0).setScale(0.98);
      this.tweens.add({
        targets: sub, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 180, delay: staggerIdx * 30, ease: 'Quad.easeOut',
      });
      return;
    }

    // ── 已解鎖卡片內容 ────────────────────────────────────────
    const numLabel = isDone
      ? `第 ${String(level.id).padStart(2,'0')} 關`
      : `第 ${String(level.id).padStart(2,'0')} 關  ·  當前目標`;
    const numTxt = this.add.text(L + 14, T + 10, numLabel, {
      fontSize: '10px', fontFamily: 'Arial, sans-serif',
      color: isDone ? '#b8922a' : '#c9a84c',
    }).setAlpha(isDone ? 0.50 : 0.75);

    const nameTxt = this.add.text(L + 14, T + 26, level.name, {
      fontSize: '18px', fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold', color: '#e8d9b8',
    }).setAlpha(isDone ? 0.90 : 1.0);

    const stratStr = level.strategyLabel || level.description || '';
    const stratTxt = this.add.text(L + 14, T + 58, stratStr, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif',
      color: '#a89070',
      wordWrap: { width: cw - 60 },
    }).setAlpha(0.60);

    const phase   = level.phase || 1;
    const stars   = Math.min(Math.ceil(phase / 2), 3);
    const diffStr = '難度：' + '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const diffTxt = this.add.text(L + 14, T + 93, diffStr, {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#b8922a',
    }).setAlpha(0.45);

    const children = [g, numTxt, nameTxt, stratTxt, diffTxt];

    if (isDone) {
      const checkTxt = this.add.text(L + cw - 14, T + 10, '✓', {
        fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#4a6e32',
      }).setOrigin(1, 0).setAlpha(0.90);
      children.push(checkTxt);
    } else {
      // cy → 0（sub-container 本地中心）
      const arrowTxt = this.add.text(L + cw - 22, 0, '▶', {
        fontSize: '22px', color: '#d4a843',
      }).setOrigin(1, 0.5).setAlpha(0.85);
      children.push(arrowTxt);
    }

    // ── 互動事件 ──────────────────────────────────────────────
    g.setInteractive(
      new Phaser.Geom.Rectangle(L, T, cw, ch),
      Phaser.Geom.Rectangle.Contains
    );

    g.on('pointerover', () => {
      drawCard(true);
      audioManager.play('ui_hover');
      this.tweens.killTweensOf(sub);
      this.tweens.add({ targets: sub, scaleX: 1.02, scaleY: 1.02, duration: 150, ease: 'Quad.easeOut' });
    });
    g.on('pointerout', () => {
      drawCard(false);
      sub.y = cy;
      this.tweens.killTweensOf(sub);
      this.tweens.add({ targets: sub, scaleX: 1, scaleY: 1, duration: 150, ease: 'Quad.easeOut' });
    });
    g.on('pointerdown', () => {
      drawCard(false, true);
      sub.y = cy + 2;
    });
    g.on('pointerup', (ptr) => {
      drawCard(false);
      sub.y = cy;
      if (this._wasDrag) return;
      if (ptr.y < this._safeTop || ptr.y > this._safeBottom) return;
      audioManager.play('ui_click');
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene', { levelId: level.id });
      });
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
