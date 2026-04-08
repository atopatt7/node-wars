/**
 * AudioManager.js - Web Audio API 音效合成器（無外部音檔）
 *
 * 使用 OscillatorNode + GainNode 即時合成所有遊戲音效，
 * 不依賴任何外部音檔，不增加 bundle 體積。
 *
 * 支援音效：
 *   send_troop    - 出兵（短促低頻脈衝）
 *   capture       - 佔領（上升雙音叮聲）
 *   meteor        - 隕石（低頻爆炸 + 裂帛）
 *   upgrade       - 升級（上升三音階）
 *   win           - 勝利（五音大調號角）
 *   lose          - 失敗（下降三音哀調）
 *   chapter_enter - 進入新章節（上升四音琶音 + 輕迴響，神秘感）
 *   chapter_clear - 章節完成（七音凱旋號角 + 低音持續，莊重感）
 *   landmark      - 里程碑通關（五音黃金琶音，三角波，比 win 更有儀式感）
 *
 * 音效權重（勝利時）：
 *   chapter_clear > landmark > win
 *   章節完成 > 里程碑 > 普通通關
 *
 * 使用方式：
 *   import { audioManager } from '../systems/AudioManager.js';
 *   audioManager.play('capture');
 *
 * iOS / Web Audio 限制：
 *   AudioContext 必須在使用者手勢後才能啟動。
 *   _getCtx() 在首次呼叫時建立，若仍為 suspended 則嘗試 resume()。
 */

// UI 音效名稱集合（供分類控制）
const UI_SOUNDS = new Set(['ui_click', 'ui_hover']);

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx            = null;
    this._enabled        = true;
    /** 主音量 0–1（預設 0.7） */
    this._masterVolume   = 0.70;
    /** UI 音效開關 */
    this._uiEnabled      = true;
    /** 遊戲音效開關 */
    this._gameEnabled    = true;
  }

  // ── 音量輔助 ─────────────────────────────────────────

  /**
   * 取得（或建立）主音量 GainNode，所有音源都連接到此節點。
   * setMasterVolume() 直接修改此節點的 gain.value，即時生效。
   * @param {AudioContext} ctx
   * @returns {GainNode}
   */
  _getMasterDst(ctx) {
    // 若 ctx 重建（首次 / 切換），重新建立 masterGain
    if (!this._masterGainNode || this._masterGainNode.context !== ctx) {
      this._masterGainNode = ctx.createGain();
      this._masterGainNode.gain.value = this._masterVolume;
      this._masterGainNode.connect(this._getMasterDst(ctx));
    }
    return this._masterGainNode;
  }

  // ── 取得或建立 AudioContext ──────────────────────────

  _getCtx() {
    if (!this._enabled) return null;

    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this._enabled = false;
        return null;
      }
    }

    // iOS 要求在使用者手勢後 resume（首次互動後自動解鎖）
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    return this._ctx;
  }

  // ── 設定控制 ──────────────────────────────────────

  /**
   * 設定主音量（0–100 → 內部換算為 0–1）
   * @param {number} v  0~100
   */
  setMasterVolume(v) {
    this._masterVolume = Math.max(0, Math.min(100, v)) / 100;
    // 即時更新 master gain node（若已建立）
    if (this._masterGainNode) {
      this._masterGainNode.gain.value = this._masterVolume;
    }
  }

  /**
   * 開關 UI 音效（hover / click）
   * @param {boolean} enabled
   */
  setUIEnabled(enabled) {
    this._uiEnabled = !!enabled;
  }

  /**
   * 開關遊戲音效（派兵 / 佔領 / 法術等）
   * @param {boolean} enabled
   */
  setGameEnabled(enabled) {
    this._gameEnabled = !!enabled;
  }

  /**
   * 從 SaveSystem 設定值初始化（遊戲一啟動時呼叫一次）。
   * 為避免循環依賴，接受設定物件而非直接 import SaveSystem。
   * @param {{ masterVolume: number, uiSoundEnabled: boolean, gameSoundEnabled: boolean }} settings
   */
  applySettings(settings) {
    this.setMasterVolume(settings.masterVolume ?? 70);
    this.setUIEnabled(settings.uiSoundEnabled ?? true);
    this.setGameEnabled(settings.gameSoundEnabled ?? true);
  }

  // ── 公開播放介面 ──────────────────────────────────

  /**
   * 播放指定音效
   * @param {'send_troop'|'capture'|'meteor'|'upgrade'|'win'|'lose'} sound
   */
  play(sound) {
    if (!this._enabled) return;
    // UI / 遊戲音效分類控制
    if (UI_SOUNDS.has(sound) && !this._uiEnabled) return;
    if (!UI_SOUNDS.has(sound) && !this._gameEnabled) return;
    // 主音量為 0 時不播（避免建立 AudioContext）
    if (this._masterVolume === 0) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      switch (sound) {
        case 'send_troop':    this._playSendTroop(ctx, now);    break;
        case 'capture':       this._playCapture(ctx, now);      break;
        case 'meteor':        this._playMeteor(ctx, now);       break;
        case 'upgrade':       this._playUpgrade(ctx, now);      break;
        case 'win':           this._playWin(ctx, now);          break;
        case 'lose':          this._playLose(ctx, now);         break;
        case 'chapter_enter': this._playChapterEnter(ctx, now); break;
        case 'chapter_clear': this._playChapterClear(ctx, now); break;
        case 'landmark':      this._playLandmark(ctx, now);     break;
        case 'ui_click':      this._playUIClick(ctx, now);      break;
        case 'ui_hover':      this._playUIHover(ctx, now);      break;
        case 'defend':        this._playDefend(ctx, now);       break;
        case 'haste':         this._playHaste(ctx, now);        break;
        case 'fortify':       this._playFortify(ctx, now);      break;
      }
    } catch {
      // 靜默忽略音效錯誤，不影響遊戲主流程
    }
  }

  // ── 私有音效合成器 ────────────────────────────────

  /**
   * 出兵：短促低頻脈衝（120ms）
   * 感覺：鈍重、有重量感、不刺耳
   */
  _playSendTroop(ctx, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    g.connect(this._getMasterDst(ctx));

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(240, now);
    o.frequency.exponentialRampToValueAtTime(110, now + 0.12);
    o.connect(g);
    o.start(now);
    o.stop(now + 0.14);
  }

  /**
   * 佔領：上升雙音叮聲（500ms）
   * 感覺：清脆、勝利感、陣營切換有力
   */
  _playCapture(ctx, now) {
    // 主音（三角波，溫暖）
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.18, now);
    g1.gain.setValueAtTime(0.18, now + 0.08);
    g1.gain.linearRampToValueAtTime(0.001, now + 0.50);
    g1.connect(this._getMasterDst(ctx));

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(440, now);
    o1.frequency.setValueAtTime(660, now + 0.08);
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.52);

    // 和聲（高八度，較輕）
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.00, now + 0.08);
    g2.gain.linearRampToValueAtTime(0.07, now + 0.14);
    g2.gain.linearRampToValueAtTime(0.001, now + 0.50);
    g2.connect(this._getMasterDst(ctx));

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(880, now + 0.08);
    o2.connect(g2);
    o2.start(now + 0.08);
    o2.stop(now + 0.52);
  }

  /**
   * Meteor：低頻爆炸 + 高頻裂帛（600ms）
   * 感覺：重擊感、有衝擊力
   */
  _playMeteor(ctx, now) {
    // 低頻衝擊（鋸齒波，粗糙感）
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.45, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.60);
    g1.connect(this._getMasterDst(ctx));

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(85, now);
    o1.frequency.exponentialRampToValueAtTime(28, now + 0.60);
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.62);

    // 高頻裂帛（模擬衝擊波前緣）
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.14, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    g2.connect(this._getMasterDst(ctx));

    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(380, now);
    o2.frequency.exponentialRampToValueAtTime(90, now + 0.25);
    o2.connect(g2);
    o2.start(now);
    o2.stop(now + 0.27);
  }

  /**
   * 升級：上升三音階 C5-E5-G5（300ms，三個音連發）
   * 感覺：輕快、達成感、清脆提升
   */
  _playUpgrade(ctx, now) {
    const notes = [523, 659, 784]; // C5 - E5 - G5（大三和弦）
    notes.forEach((freq, i) => {
      const t  = now + i * 0.10;
      const g  = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.setValueAtTime(0.18, t + 0.06);
      g.gain.linearRampToValueAtTime(0.001, t + 0.26);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.28);
    });
  }

  /**
   * 勝利：五音上升號角 C5-E5-G5-C6-E6（約 900ms）
   * 感覺：莊重、歡慶、完整的勝利感
   */
  _playWin(ctx, now) {
    const notes = [523, 659, 784, 1046, 1318]; // C5-E5-G5-C6-E6
    notes.forEach((freq, i) => {
      const t        = now + i * 0.14;
      const isLast   = i === notes.length - 1;
      const duration = isLast ? 0.55 : 0.22;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.20, t);
      g.gain.setValueAtTime(0.20, t + duration * 0.5);
      g.gain.linearRampToValueAtTime(0.001, t + duration + 0.15);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + duration + 0.18);
    });
  }

  /**
   * 失敗：下降三音哀調 A4-F4-C4（約 900ms）
   * 感覺：沉重、遺憾、明確的失敗感
   */
  _playLose(ctx, now) {
    const notes = [440, 349, 262]; // A4 - F4 - C4（小三和弦下行）
    notes.forEach((freq, i) => {
      const t = now + i * 0.24;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.setValueAtTime(0.16, t + 0.15);
      g.gain.linearRampToValueAtTime(0.001, t + 0.60);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.65);
    });
  }

  // ── 章節節點音效 ────────────────────────────────────────────────
  //
  // 三種音效依戰役重量由輕到重排列：
  //   chapter_enter（進章）< landmark（里程碑通關）< chapter_clear（章節完成）
  //
  // 設計原則：
  //   - chapter_enter：神秘上行，像「打開地圖新區域」的提示音
  //   - landmark：黃金琶音，比 win 更有儀式感但不過於宏大
  //   - chapter_clear：凱旋號角 + 低音持續，明顯比 win 更豐厚

  /**
   * 進入新章節：上升四音琶音 C4-E4-G4-C5（sine 波，帶輕迴響）
   * 感覺：神秘、期待、新征途展開
   * 總長約 900ms
   */
  _playChapterEnter(ctx, now) {
    const notes = [261, 329, 392, 523]; // C4-E4-G4-C5（C 大調琶音）
    notes.forEach((freq, i) => {
      const t = now + i * 0.17;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.00, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.04);
      g.gain.setValueAtTime(0.13, t + 0.12);
      g.gain.linearRampToValueAtTime(0.001, t + 0.46);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.52);
    });

    // 輕迴響（最高音延遲 120ms 的弱複音，製造空間感）
    const echoT = now + 3 * 0.17 + 0.14;
    const gE = ctx.createGain();
    gE.gain.setValueAtTime(0.045, echoT);
    gE.gain.linearRampToValueAtTime(0.001, echoT + 0.44);
    gE.connect(this._getMasterDst(ctx));
    const oE = ctx.createOscillator();
    oE.type = 'sine';
    oE.frequency.setValueAtTime(523, echoT);
    oE.connect(gE);
    oE.start(echoT);
    oE.stop(echoT + 0.48);
  }

  /**
   * 章節完成：七音凱旋號角 C5-E5-G5-C6-G5-E5-C6（square 波 + 低音 drone）
   * 感覺：莊重、豐厚、明顯比 win 更有重量感
   * 總長約 1400ms
   */
  _playChapterClear(ctx, now) {
    const notes     = [523, 659, 784, 1046, 784, 659, 1046]; // C5-E5-G5-C6-G5-E5-C6
    const durations = [0.14, 0.14, 0.14, 0.17, 0.11, 0.11, 0.62];
    let t = now;
    notes.forEach((freq, i) => {
      const dur = durations[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.21, t);
      g.gain.setValueAtTime(0.21, t + dur * 0.55);
      g.gain.linearRampToValueAtTime(0.001, t + dur + 0.11);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.14);
      t += dur;
    });

    // 低音持續（C3 drone，sine，為號角提供基礎共鳴）
    const gD = ctx.createGain();
    gD.gain.setValueAtTime(0.07, now);
    gD.gain.setValueAtTime(0.07, now + 1.10);
    gD.gain.linearRampToValueAtTime(0.001, now + 1.50);
    gD.connect(this._getMasterDst(ctx));
    const oD = ctx.createOscillator();
    oD.type = 'sine';
    oD.frequency.setValueAtTime(130, now); // C3
    oD.connect(gD);
    oD.start(now);
    oD.stop(now + 1.55);
  }

  /**
   * 里程碑通關：五音黃金琶音 E5-G#5-B5-E6-G#6（triangle 波，最後一音帶低八度和聲）
   * 感覺：黃金感、儀式感強、比 win 更有光輝但不如 chapter_clear 豐厚
   * 總長約 1000ms
   */
  _playLandmark(ctx, now) {
    const notes = [659, 831, 988, 1318, 1661]; // E5-G#5-B5-E6-G#6（E 大調琶音）
    notes.forEach((freq, i) => {
      const t      = now + i * 0.15;
      const isLast = i === notes.length - 1;
      const dur    = isLast ? 0.58 : 0.19;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.setValueAtTime(0.16, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0.001, t + dur + 0.14);
      g.connect(this._getMasterDst(ctx));

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.17);

      // 最後一音加低八度和聲（sine，輕量、增加金色厚度）
      if (isLast) {
        const gH = ctx.createGain();
        gH.gain.setValueAtTime(0.08, t);
        gH.gain.linearRampToValueAtTime(0.001, t + dur + 0.14);
        gH.connect(this._getMasterDst(ctx));
        const oH = ctx.createOscillator();
        oH.type = 'sine';
        oH.frequency.setValueAtTime(freq / 2, t); // 低八度 E4
        oH.connect(gH);
        oH.start(t);
        oH.stop(t + dur + 0.17);
      }
    });
  }
  // ── UI 音效 ─────────────────────────────────────────────────────────

  /**
   * UI 點擊：短促高頻叩擊（80ms）
   * 感覺：清脆、即時回饋、不刺耳
   */
  _playUIClick(ctx, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    g.connect(this._getMasterDst(ctx));

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(420, now + 0.08);
    o.connect(g);
    o.start(now);
    o.stop(now + 0.10);
  }

  /**
   * UI 懸停：極短輕柔提示音（45ms）
   * 感覺：幾乎無感、低調存在感
   */
  _playUIHover(ctx, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.10, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    g.connect(this._getMasterDst(ctx));

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1400, now);
    o.connect(g);
    o.start(now);
    o.stop(now + 0.055);
  }

  // ── 法術 / 戰場音效 ─────────────────────────────────────────────────

  /**
   * 防守成功：護盾彈開（420ms）
   * 感覺：金屬彈響、防守有力
   */
  _playDefend(ctx, now) {
    // 主撞擊音（triangle，中頻）
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.22, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    g1.connect(this._getMasterDst(ctx));

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(540, now);
    o1.frequency.exponentialRampToValueAtTime(260, now + 0.42);
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.45);

    // 高頻金屬泛音（sine，輕量和聲）
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.09, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    g2.connect(this._getMasterDst(ctx));

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(1080, now);
    o2.connect(g2);
    o2.start(now);
    o2.stop(now + 0.25);
  }

  /**
   * 急行法術：快速上升掃頻（220ms）
   * 感覺：輕盈、速度感、魔法加速
   */
  _playHaste(ctx, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.setValueAtTime(0.18, now + 0.10);
    g.gain.linearRampToValueAtTime(0.001, now + 0.22);
    g.connect(this._getMasterDst(ctx));

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(380, now);
    o.frequency.exponentialRampToValueAtTime(1520, now + 0.18);
    o.connect(g);
    o.start(now);
    o.stop(now + 0.24);

    // 尾音（高頻短閃）
    const gT = ctx.createGain();
    gT.gain.setValueAtTime(0.08, now + 0.16);
    gT.gain.linearRampToValueAtTime(0.001, now + 0.30);
    gT.connect(this._getMasterDst(ctx));
    const oT = ctx.createOscillator();
    oT.type = 'sine';
    oT.frequency.setValueAtTime(2200, now + 0.16);
    oT.connect(gT);
    oT.start(now + 0.16);
    oT.stop(now + 0.32);
  }

  /**
   * 強化法術：低頻厚重鞏固音（320ms）
   * 感覺：穩重、加固、城堡增援感
   */
  _playFortify(ctx, now) {
    // 低頻基音（鋸齒波，厚重）
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.20, now);
    g1.gain.setValueAtTime(0.20, now + 0.08);
    g1.gain.linearRampToValueAtTime(0.001, now + 0.32);
    g1.connect(this._getMasterDst(ctx));

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(180, now);
    o1.frequency.linearRampToValueAtTime(220, now + 0.32);
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.35);

    // 中頻共鳴（sine，金色感）
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.12, now + 0.04);
    g2.gain.linearRampToValueAtTime(0.001, now + 0.30);
    g2.connect(this._getMasterDst(ctx));

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(440, now + 0.04);
    o2.connect(g2);
    o2.start(now + 0.04);
    o2.stop(now + 0.33);
  }
}

/** 全域單例，供所有模組直接 import 使用 */
export const audioManager = new AudioManager();
