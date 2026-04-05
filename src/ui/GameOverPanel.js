/**
 * GameOverPanel.js — 遊戲結算面板（戰役強化版）
 *
 * 職責：
 *   - 建立勝利 / 失敗的遮罩與面板背景
 *   - 顯示主標題（🏆 勝利！/ 💀 失敗...）與副標題
 *   - 顯示本關名稱、通關時間（或堅持時間）
 *   - 勝利時顯示「已解鎖下一關」預告（名稱 + strategyLabel）
 *   - 里程碑關卡：金色邊框 + 頂部金星標籤，強化儀式感
 *   - 建立結算操作按鈕（重新開始、下一關、選關）
 *   - 處理按鈕點擊後的場景跳轉邏輯
 *
 * 不含任何遊戲邏輯。場景跳轉雖使用 Phaser scene API，
 * 但屬於 UI 層的導覽責任，不是遊戲規則。
 *
 * UIController 使用方式：
 *   const gameOverPanel = new GameOverPanel(scene, { levelId, levelCount });
 *   gameOverPanel.show(true,  42, extraData);   // 勝利
 *   gameOverPanel.show(false, 17, extraData);   // 失敗
 *
 * extraData 結構：
 *   {
 *     levelName:  string,         // 本關名稱
 *     isLandmark: boolean,        // 是否里程碑關卡
 *     nextLevel:  {               // 下一關資料（勝利且有下一關時才有值）
 *       name:          string,
 *       strategyLabel: string | null,
 *     } | null,
 *   }
 */

export class GameOverPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ levelId: number, levelCount: number }} config
   */
  constructor(scene, config) {
    this._scene  = scene;
    this._config = config;
  }

  // ── 公開 API ──────────────────────────────────────────

  /**
   * 顯示結算面板，附帶 Tween 彈出動畫與戰役強化資訊。
   *
   * @param {boolean} won
   * @param {number}  [elapsed]   - 本局耗時（秒）
   * @param {object}  [extraData] - 戰役強化資料（見檔案頂部說明）
   */
  show(won, elapsed, extraData = {}) {
    const scene = this._scene;
    const W     = scene.cameras.main.width;
    const H     = scene.cameras.main.height;

    // ── 解構強化資料 ──────────────────────────────────────
    const hasLandmark    = !!extraData.isLandmark;
    const levelName      = extraData.levelName ?? null;
    const chapterName    = extraData.chapterName ?? null;
    const isChapterEnd   = won && !!extraData.isChapterEnd;
    const chapterEnding  = extraData.chapterEnding ?? null;   // 章節結語引言
    const nextLevel      = won ? (extraData.nextLevel ?? null) : null;
    const hasElapsed     = elapsed !== undefined;
    const hasNextPreview = !!(won && nextLevel?.name);
    const hasEnding      = !!(isChapterEnd && chapterEnding);

    // ── 動態計算面板高度（由內容決定）────────────────────
    // 各區塊高度（像素）：
    //   topPad 16 → landmark? 26 → title 60 → subtitle 30
    //   → levelName? 26 → elapsed? 26 → nextPreview? 78
    //   → chapterEnding? 46 → gap+button+bottomPad 104
    let contentH = 16;
    if (hasLandmark)    contentH += 26;   // ★ 里程碑標籤
    if (isChapterEnd)   contentH += 26;   // ⚔ 章節完成標籤
    contentH += 60;    // 主標題（48px）
    contentH += 30;    // 副標題（19px）
    if (levelName)      contentH += 26;   // 本關名稱
    if (chapterName)    contentH += 22;   // 章節名稱（小字定向）
    if (hasElapsed)     contentH += 26;   // 通關時間
    if (hasEnding)      contentH += 46;   // 章節結語引言（引言框，eH=36）
    if (hasNextPreview) contentH += 78;   // 下一關預告區塊

    const pW = W * 0.84;
    const pH = contentH + 104;  // 46 gap + 52 button + 6 bottom
    const lx = -pW / 2;
    const ly = -pH / 2;

    // ── 半透明全螢幕遮罩（先淡入）────────────────────────
    const overlay = scene.add.graphics().setDepth(50).setAlpha(0);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);
    scene.tweens.add({ targets: overlay, alpha: 1, duration: 220, ease: 'Sine.easeIn' });

    // ── 面板容器（彈出 Tween）────────────────────────────
    const container = scene.add.container(W / 2, H / 2).setDepth(51).setScale(0.5).setAlpha(0);

    // 面板背景
    // 里程碑通關 → 金色邊；普通勝利 → 綠邊；失敗 → 紅邊
    // 邊框 / 填色：里程碑 → 金；章節完成 → 冰藍；普通勝利 → 綠；失敗 → 紅
    const borderColor = hasLandmark  ? 0xFFCC22
                      : isChapterEnd ? 0x44AAFF
                      : won          ? 0x44FF88
                      :                0xAA22FF;   // 虛空紫 — 象徵腐化
    const fillColor   = hasLandmark  ? 0x1A2600
                      : isChapterEnd ? 0x091828
                      : won          ? 0x0B2E1A
                      :                0x150020;   // 深紫黑底色

    const panel = scene.add.graphics();
    // 外層光暈（低透明度大框，增加戰役面板質感）
    panel.lineStyle(8, borderColor, 0.08);
    panel.strokeRoundedRect(lx - 5, ly - 5, pW + 10, pH + 10, 22);
    // 面板底色
    panel.fillStyle(fillColor, 1);
    panel.fillRoundedRect(lx, ly, pW, pH, 16);
    // 主邊框
    panel.lineStyle(hasLandmark ? 3 : 2, borderColor, 1);
    panel.strokeRoundedRect(lx, ly, pW, pH, 16);
    // 內層細框（雙框效果，統一戰役感）
    panel.lineStyle(1, borderColor, won ? 0.30 : 0.18);
    panel.strokeRoundedRect(lx + 5, ly + 5, pW - 10, pH - 10, 12);

    container.add(panel);

    // ── 逐行排版，curY 從頂部 padding 開始往下累積 ────────
    let curY = ly + 14;

    // 【章節完成標籤】（5 / 10 / 15 / 20 / 25 / 30 關通關時顯示）
    if (isChapterEnd) {
      const ceTxt = scene.add.text(0, curY, '✦ 章節清除！', {
        fontSize:        '15px',
        fontFamily:      'Arial, sans-serif',
        color:           '#88DDFF',
        stroke:          '#001828',
        strokeThickness: 2,
      }).setOrigin(0.5, 0);
      container.add(ceTxt);
      curY += 26;
    }

    // 【里程碑標籤】
    if (hasLandmark) {
      const lmTxt = scene.add.text(0, curY, '★ 里程碑關卡達成！', {
        fontSize:        '15px',
        fontFamily:      'Arial, sans-serif',
        color:           '#FFCC22',
        stroke:          '#221000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0);
      container.add(lmTxt);
      curY += 26;
    }

    // 【主標題】
    const titleColor = hasLandmark ? '#FFE055' : (won ? '#55FF99' : '#EE55FF');
    const titleTxt   = scene.add.text(0, curY + 6,
      won ? '⚔ 據點奪回！' : '💀 據點淪陷...', {
      fontSize:        '48px',
      fontFamily:      'Arial, sans-serif',
      color:           titleColor,
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0);
    container.add(titleTxt);
    curY += 60;

    // 【副標題】
    const subTxt = scene.add.text(0, curY + 4,
      won ? '虛空勢力已被擊退，領土重歸光明！' : '虛空族已吞噬所有據點，領地淪陷…', {
      fontSize: '19px',
      color:    '#C4D8EE',
    }).setOrigin(0.5, 0);
    container.add(subTxt);
    curY += 30;

    // 【本關名稱】
    if (levelName) {
      const nameTxt = scene.add.text(0, curY + 3, levelName, {
        fontSize:   '15px',
        fontFamily: 'Arial, sans-serif',
        color:      won ? '#99CCBB' : '#998877',
      }).setOrigin(0.5, 0);
      container.add(nameTxt);
      curY += 26;
    }

    // 【章節名稱（定向小標）】
    if (chapterName) {
      const chTxt = scene.add.text(0, curY + 2, chapterName, {
        fontSize:   '13px',
        fontFamily: 'Arial, sans-serif',
        color:      '#4A7AB0',
      }).setOrigin(0.5, 0);
      container.add(chTxt);
      curY += 22;
    }

    // 【通關時間】
    if (hasElapsed) {
      const timeTxt = scene.add.text(0, curY + 3,
        won ? `⏱ 作戰時長 ${elapsed} 秒` : `抵抗了 ${elapsed} 秒`, {
        fontSize:   '15px',
        fontFamily: 'Arial, sans-serif',
        color:      won ? '#99EEBB' : '#BB9977',
      }).setOrigin(0.5, 0);
      container.add(timeTxt);
      curY += 26;
    }

    // 【章節結語引言】（章節最後一關勝利時顯示）
    // 以淡紫色引言框呈現，放在通關時間後、下一關預告前
    if (hasEnding) {
      curY += 6;

      const eW = pW - 24;
      const eH = 36;
      const eX = lx + 12;

      // 引言框底（深暗紫調）
      const endingBg = scene.add.graphics();
      endingBg.fillStyle(0x0D0820, 0.92);
      endingBg.fillRoundedRect(eX, curY, eW, eH, 8);
      endingBg.lineStyle(1.2, 0xBB77FF, 0.45);
      endingBg.strokeRoundedRect(eX, curY, eW, eH, 8);
      container.add(endingBg);

      // 引言文字（淡紫，置中）
      container.add(scene.add.text(0, curY + eH / 2, `「${chapterEnding}」`, {
        fontSize:   '13px',
        fontFamily: 'Arial, sans-serif',
        color:      '#CC99EE',
        wordWrap:   { width: eW - 16 },
        align:      'center',
      }).setOrigin(0.5, 0.5));

      curY += eH + 4;
    }

    // 【下一關預告區塊】（僅勝利且有下一關時顯示）
    if (hasNextPreview) {
      curY += 6;   // 與上方內容的間距

      const bxW = pW - 24;
      const bxH = nextLevel.strategyLabel ? 68 : 50;
      const bxX = lx + 12;

      // 預告框背景（深綠調，帶細綠邊）
      const previewBg = scene.add.graphics();
      previewBg.fillStyle(0x081A10, 0.92);
      previewBg.fillRoundedRect(bxX, curY, bxW, bxH, 9);
      previewBg.lineStyle(1.5, 0x44DD77, 0.52);
      previewBg.strokeRoundedRect(bxX, curY, bxW, bxH, 9);
      container.add(previewBg);

      // 解鎖標籤
      const unlockTxt = scene.add.text(0, curY + 8, '🔓 已解鎖下一關', {
        fontSize:   '13px',
        fontFamily: 'Arial, sans-serif',
        color:      '#55DD77',
      }).setOrigin(0.5, 0);
      container.add(unlockTxt);

      // 下一關名稱
      const nextNameTxt = scene.add.text(0, curY + 27, nextLevel.name, {
        fontSize:   '15px',
        fontFamily: 'Arial Black, sans-serif',
        color:      '#EEFF99',
      }).setOrigin(0.5, 0);
      container.add(nextNameTxt);

      // 下一關策略提示（若有）
      if (nextLevel.strategyLabel) {
        const stratTxt = scene.add.text(0, curY + 49, `💡 ${nextLevel.strategyLabel}`, {
          fontSize:   '13px',
          fontFamily: 'Arial, sans-serif',
          color:      '#AABC77',
        }).setOrigin(0.5, 0);
        container.add(stratTxt);
      }

      curY += bxH + 6;
    }

    // ── 操作按鈕列 ───────────────────────────────────────
    // 按鈕中心固定在 ly + pH - 50（距面板底部 50px）
    this._buildButtons(scene, won, lx, ly, pW, pH, container);

    // ── 彈出 Tween（scale 0.5→1.0, alpha 0→1）─────────────
    scene.tweens.add({
      targets:  container,
      scale:    1,
      alpha:    1,
      duration: 280,
      ease:     'Back.easeOut',
      delay:    80,
    });
  }

  // ── 私有：建立結算按鈕列 ──────────────────────────────

  /**
   * @param {Phaser.Scene}            scene
   * @param {boolean}                 won
   * @param {number}                  lx
   * @param {number}                  ly
   * @param {number}                  pW
   * @param {number}                  pH
   * @param {Phaser.GameObjects.Container} container
   */
  _buildButtons(scene, won, lx, ly, pW, pH, container) {
    const { levelId, levelCount } = this._config;
    const hasNext = won && levelId < levelCount;

    const btns = [];

    btns.push({
      text:  '重新開始',
      color: 0x2A5A99,
      cb:    () => {
        scene.cameras.main.fadeOut(200);
        scene.time.delayedCall(220, () => scene.scene.restart({ levelId }));
      },
    });

    if (hasNext) {
      btns.push({
        text:  '下一關 ▶',
        color: 0x1A7A3A,
        cb:    () => {
          scene.cameras.main.fadeOut(200);
          scene.time.delayedCall(220, () => scene.scene.start('GameScene', { levelId: levelId + 1 }));
        },
      });
    }

    btns.push({
      text:  '選關',
      color: 0x4A3A80,
      cb:    () => {
        scene.cameras.main.fadeOut(200);
        scene.time.delayedCall(220, () => scene.scene.start('LevelSelectScene'));
      },
    });

    const bW      = 130;
    const bH      = 52;
    const gap     = 14;
    const totalBW = btns.length * bW + (btns.length - 1) * gap;
    const btnY    = ly + pH - 58;
    let   bx      = -(totalBW / 2) + bW / 2;

    for (const btn of btns) {
      this._createButton(scene, bx, btnY, bW, bH, btn.text, btn.color, btn.cb, container);
      bx += bW + gap;
    }
  }

  // ── 私有：帶 hover 效果的圓角矩形按鈕 ────────────────

  /**
   * 在容器內建立按鈕（座標為容器本地空間）。
   */
  _createButton(scene, x, y, w, h, text, color, cb, container) {
    const g            = scene.add.graphics();
    const hoverColor   = Phaser.Display.Color.ValueToColor(color).lighten(20).color;
    const pressedColor = Phaser.Display.Color.ValueToColor(color).darken(22).color;

    // draw(c, hover, pressed) — 統一互動狀態視覺語言
    const draw = (c, hover = false, pressed = false) => {
      g.clear();
      g.fillStyle(c, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
      if (pressed) {
        // pressed：頂部暗影（模擬內凹感）
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(x - w / 2, y - h / 2, w, Math.ceil(h * 0.35), 10);
      } else {
        // idle / hover：頂部高光
        g.fillStyle(0xFFFFFF, 0.10);
        g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, Math.ceil(h * 0.38), 8);
      }
      const bW = pressed ? 1.5 : (hover ? 2 : 1.5);
      const bC = pressed ? 0x446688 : (hover ? 0xCCEEFF : 0x88BBDD);
      const bA = pressed ? 0.38 : (hover ? 0.90 : 0.55);
      g.lineStyle(bW, bC, bA);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    };

    // label 先建立，讓事件閉包能操作 Y 偏移
    const label = scene.add.text(x, y, text, {
      fontSize:        '18px',
      fontFamily:      'Arial, sans-serif',
      color:           '#FFFFFF',
      stroke:          '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    draw(color, false);

    g.setInteractive(
      new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    // pointerdown：按壓回饋（手機上此為主要回饋，不依賴 hover）
    g.on('pointerdown', () => { draw(pressedColor, false, true); label.setY(y + 2); });
    g.on('pointerover',  () => { draw(hoverColor,   true);        label.setY(y);     });
    g.on('pointerout',   () => { draw(color,        false);       label.setY(y);     });
    // pointerup：先恢復視覺再觸發 callback（避免 callback 觸發場景切換後仍顯示 pressed 狀態）
    g.on('pointerup',    () => { draw(color,        false);       label.setY(y); cb(); });

    container.add([g, label]);
  }
}
