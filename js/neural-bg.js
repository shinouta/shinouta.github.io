/* ================================================================
   背景の神経ネットワーク・アニメーション  (neural-bg.js)
   ----------------------------------------------------------------
   ・神経細胞に見立てた「頂点（ノード）」と「辺（シナプス結合）」が
     背景でふよふよ漂い、ときどき数個のノードが発火して
     3ホップ先まで信号が伝わっていく様子を描きます。
   ・このファイル 1 つで完結します（HTML には <script> を 1 行
     足すだけ、CSS は触りません）。
   ・色・密度・速さなどは、すぐ下の「CONFIG（設定）」だけ
     いじれば調整できます。それ以外は基本さわらなくてOKです。

   ▼ 読み込み方（index.html の </body> の直前に 1 行）
        <script src="js/neural-bg.js" defer></script>
   ================================================================ */

(() => {
  'use strict';

  /* ============================================================
     CONFIG（設定）── ここだけ変えれば見た目を調整できます
     ============================================================ */
  const CONFIG = {
    // ノード（神経細胞）の数。画面の広さに応じて自動で増減します。
    density:      0.00009,   // 1px² あたりのノード数（大きいほど密）
    minNodes:     26,        // 最小ノード数（スマホなど）
    maxNodes:     78,        // 最大ノード数（大画面でも増えすぎない上限）

    // 辺（結合）の作り方
    neighbors:    3,         // 1ノードがつなぐ近傍の数（多いほど網が密に）
    maxEdgeLen:   180,       // この距離(px)より遠いノードはつながない

    // ふよふよ漂う動き
    driftAmp:     [6, 16],   // 揺れ幅(px)の範囲 [最小, 最大]
    driftSpeed:   [0.12, 0.42], // 揺れの速さの範囲

    // 信号の伝播
    maxHop:       3,         // 何ホップ先まで信号を伝えるか
    hopDuration:  540,       // 1ホップ進むのにかかる時間(ms)
    fireInterval: [1500, 3400], // 次の発火までの待ち時間(ms) [最小, 最大]
    seedsPerFire: [1, 2],    // 1回の発火で同時に光り始めるノード数 [最小, 最大]

    // 色（null ならサイトの CSS 変数 --accent を自動取得）
    color:        null,
    colorFallback:'#2f5d62', // --accent が取れなかったときの色

    // 透明度・サイズ（小さいほど薄く・控えめに）
    edgeAlpha:    0.10,      // ふだんの辺の濃さ
    nodeAlpha:    0.26,      // ふだんのノードの濃さ
    nodeRadius:   1.9,       // ノードの基本半径(px)
  };

  /* ============================================================
     以降は仕組み（通常さわる必要はありません）
     ============================================================ */

  // 動きを抑える設定（OS/ブラウザ）を尊重
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // --- 色の準備 -------------------------------------------------
  function resolveColor() {
    if (CONFIG.color) return CONFIG.color;
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    return v || CONFIG.colorFallback;
  }
  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const s = m.length === 3
      ? m.split('').map(c => c + c).join('')
      : m;
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  let RGB = hexToRgb(resolveColor());
  const rgba = (a) => `rgba(${RGB.r},${RGB.g},${RGB.b},${a})`;

  // --- canvas を作って背景に敷く（CSS不要・クリックを邪魔しない）---
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '-1',          // 本文の後ろ・白い背景の手前
    pointerEvents: 'none', // 下のリンク等を一切ブロックしない
    display: 'block',
  });
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, DPR = 1;
  let nodes = [];
  let edges = [];     // [aIndex, bIndex]
  let adj = [];       // adj[i] = つながっている相手の index 配列
  let pulses = [];    // 移動中の信号
  let nextFireAt = 0;
  let lastT = 0;
  let running = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOut = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

  // --- グラフ（ノードと辺）を生成 -------------------------------
  function buildGraph() {
    const count = Math.max(
      CONFIG.minNodes,
      Math.min(CONFIG.maxNodes, Math.round(W * H * CONFIG.density))
    );

    nodes = [];
    for (let i = 0; i < count; i++) {
      const amp = rand(CONFIG.driftAmp[0], CONFIG.driftAmp[1]);
      const spd = rand(CONFIG.driftSpeed[0], CONFIG.driftSpeed[1]);
      nodes.push({
        bx: Math.random() * W,           // 基準位置
        by: Math.random() * H,
        x: 0, y: 0,                      // 実際の表示位置（毎フレーム更新）
        ax: amp, ay: amp * rand(0.7, 1.3), // 揺れ幅
        fx: spd, fy: spd * rand(0.7, 1.3), // 揺れの速さ
        px: Math.random() * Math.PI * 2,   // 揺れの位相
        py: Math.random() * Math.PI * 2,
        glow: 0,                         // 発火の明るさ（0〜1、徐々に減衰）
      });
    }

    // 近傍をつないで辺をつくる（局所的なまとまり＝神経らしい網になる）
    const seen = new Set();
    edges = [];
    adj = nodes.map(() => []);
    const maxLen2 = CONFIG.maxEdgeLen * CONFIG.maxEdgeLen;

    for (let i = 0; i < nodes.length; i++) {
      const di = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].bx - nodes[j].bx;
        const dy = nodes[i].by - nodes[j].by;
        di.push([j, dx * dx + dy * dy]);
      }
      di.sort((a, b) => a[1] - b[1]);
      for (let k = 0; k < Math.min(CONFIG.neighbors, di.length); k++) {
        const j = di[k][0];
        if (di[k][1] > maxLen2) break; // 遠すぎる相手は結ばない
        const key = i < j ? i + '-' + j : j + '-' + i;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([i, j]);
        adj[i].push(j);
        adj[j].push(i);
      }
    }
    updatePositions(0);
  }

  // --- ノードの表示位置を更新（ふよふよ） ----------------------
  function updatePositions(tSec) {
    for (const n of nodes) {
      n.x = n.bx + n.ax * Math.sin(tSec * n.fx + n.px);
      n.y = n.by + n.ay * Math.sin(tSec * n.fy + n.py);
    }
  }

  // --- 発火：ランダムなノードから信号を流し始める --------------
  function fire(now) {
    const seeds = Math.round(rand(CONFIG.seedsPerFire[0], CONFIG.seedsPerFire[1]));
    for (let s = 0; s < seeds; s++) {
      const seed = Math.floor(Math.random() * nodes.length);
      const wave = { visited: new Set([seed]) }; // この発火で訪れた集合
      nodes[seed].glow = 1;
      for (const nb of adj[seed]) {
        wave.visited.add(nb);
        pulses.push({ from: seed, to: nb, t0: now, hop: 1, wave });
      }
    }
  }

  // --- 信号が辺の終点に到達したときの処理（次のホップを生む） --
  function onPulseArrive(p, now) {
    nodes[p.to].glow = 1;
    if (p.hop >= CONFIG.maxHop) return;     // 3ホップで止める
    for (const nb of adj[p.to]) {
      if (p.wave.visited.has(nb)) continue; // 同じ発火で重複させない
      p.wave.visited.add(nb);
      pulses.push({ from: p.to, to: nb, t0: now, hop: p.hop + 1, wave: p.wave });
    }
  }

  // --- 1 フレーム描画 ------------------------------------------
  function draw(now, tSec, dt) {
    updatePositions(tSec);
    ctx.clearRect(0, 0, W, H); // 透明にクリア → サイトの白背景が透ける

    // 1) ふだんの辺
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(CONFIG.edgeAlpha);
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(nodes[a].x, nodes[a].y);
      ctx.lineTo(nodes[b].x, nodes[b].y);
    }
    ctx.stroke();

    // 2) 移動中の信号（彗星のような尾＋光る頭）
    const stillAlive = [];
    for (const p of pulses) {
      const prog = (now - p.t0) / CONFIG.hopDuration;
      if (prog >= 1) {
        onPulseArrive(p, now);
        continue; // この信号は消滅
      }
      stillAlive.push(p);
      const f = nodes[p.from], t = nodes[p.to];
      const e = easeInOut(prog);
      const hx = f.x + (t.x - f.x) * e;
      const hy = f.y + (t.y - f.y) * e;

      // 尾：起点→頭にかけて明るくなるグラデーション
      const grad = ctx.createLinearGradient(f.x, f.y, hx, hy);
      grad.addColorStop(0, rgba(0));
      grad.addColorStop(1, rgba(0.5));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      // 頭：光る点
      ctx.save();
      ctx.shadowColor = rgba(0.9);
      ctx.shadowBlur = 8;
      ctx.fillStyle = rgba(0.85);
      ctx.beginPath();
      ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    pulses = stillAlive;

    // 3) ノード（発火中はにじむように光る）
    for (const n of nodes) {
      if (n.glow > 0.02) {
        ctx.save();
        ctx.shadowColor = rgba(0.9);
        ctx.shadowBlur = 14 * n.glow;
        ctx.fillStyle = rgba(Math.min(1, CONFIG.nodeAlpha + 0.7 * n.glow));
        ctx.beginPath();
        ctx.arc(n.x, n.y, CONFIG.nodeRadius + 1.8 * n.glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        n.glow *= Math.exp(-dt * 3.0); // なめらかに減衰
      } else {
        ctx.fillStyle = rgba(CONFIG.nodeAlpha);
        ctx.beginPath();
        ctx.arc(n.x, n.y, CONFIG.nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- メインループ --------------------------------------------
  function loop(now) {
    if (!running) return;
    if (!lastT) lastT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000); // 秒（上限つき）
    lastT = now;
    const tSec = now / 1000;

    if (now >= nextFireAt && nodes.length) {
      fire(now);
      nextFireAt = now + rand(CONFIG.fireInterval[0], CONFIG.fireInterval[1]);
    }

    draw(now, tSec, dt);
    requestAnimationFrame(loop);
  }

  // --- リサイズ（DPR対応で線をくっきり） ----------------------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    RGB = hexToRgb(resolveColor());
    buildGraph();
    if (reduceMotion) drawStatic(); // 動きを抑える設定なら静止画で1回だけ
  }

  // 動きを抑える設定の人向け：漂いも発火もしない静かな網
  function drawStatic() {
    updatePositions(0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(CONFIG.edgeAlpha);
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(nodes[a].x, nodes[a].y);
      ctx.lineTo(nodes[b].x, nodes[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(CONFIG.nodeAlpha);
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, CONFIG.nodeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // タブが裏に回ったら止める（バッテリー節約）
  function onVisibility() {
    if (document.hidden) {
      running = false;
    } else if (!reduceMotion && !running) {
      running = true;
      lastT = 0;
      requestAnimationFrame(loop);
    }
  }

  // デバウンス付きリサイズ
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  // --- 起動 ----------------------------------------------------
  function start() {
    document.body.appendChild(canvas);
    resize();
    if (reduceMotion) {
      drawStatic();           // 静止画のみ
    } else {
      running = true;
      nextFireAt = performance.now() + 600; // 起動直後に最初の発火
      document.addEventListener('visibilitychange', onVisibility);
      requestAnimationFrame(loop);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
