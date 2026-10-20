// 剛体消失 — 共通ランタイム（クラシックスクリプト。window.RV を公開）
(function () {
  'use strict';
  const RV = {};
  const $ = (s, r = document) => r.querySelector(s);
  RV.$ = $;

  // ---------- 進行状況（localStorage は失敗しても動くように） ----------
  const KEY = 'rigid-vanish-progress-v1';
  RV.loadProgress = function () {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  RV.saveStars = function (chapterId, stars) {
    const p = RV.loadProgress();
    p[chapterId] = Math.max(p[chapterId] || 0, stars);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 保存できなくても続行 */ }
    RV.renderStars(chapterId);
    return p[chapterId];
  };
  RV.renderStars = function (chapterId) {
    const el = $('#rv-stars');
    if (!el) return;
    const n = RV.loadProgress()[chapterId] || 0;
    el.textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
  };

  // ---------- ヘッダとライブラリ読み込み状況 ----------
  // RV.header({id:'c1', chap:'第1章', title:'...', libs:['Rapier2D','Chart.js']})
  RV.header = function (opt) {
    RV.chapterId = opt.id;
    const h = document.createElement('header');
    h.className = 'rv-header';
    h.innerHTML =
      `<a class="back" href="${opt.home || '../index.html'}">← 世界地図</a>` +
      `<span class="chap">${opt.chap || ''}</span><h1>${opt.title}</h1>` +
      `<span class="stars" id="rv-stars"></span>` +
      `<div class="libs">${(opt.libs || []).map(l => `<span class="lib-badge" data-lib="${l}">${l}</span>`).join('')}</div>`;
    document.body.prepend(h);
    RV.renderStars(opt.id);
  };
  RV.libOk = function (name, ok = true) {
    const b = document.querySelector(`.lib-badge[data-lib="${name}"]`);
    if (b) { b.classList.toggle('ok', ok); b.classList.toggle('err', !ok); }
  };

  // ---------- 因果ログ（溝口・平嶋・堀口 2016「力と運動に関する因果推論理論」） ----------
  RV.PRINCIPLES = {
    1: '加速・減速は F=mα',
    2: '作用と反作用は等大・逆向き',
    3: '値の増加は作用側からのみ（局所的因果性）',
    4: '剛体は力を瞬時に伝える（透過伝達性）',
    5: '反作用を返す根拠＝動かない or αで動く（大局的因果性）',
    6: '押されても動かない＝背後の反作用か静止摩擦',
    7: '地球・地面は絶対に動かない',
    8: 'つぶれない壁・床は動かない',
    9: '力は足し合わせられる',
    10: '加速度系では −α の「場」が生じる'
  };
  RV.causal = function (el) {
    const box = typeof el === 'string' ? $(el) : el;
    let t0 = performance.now();
    let last = '';
    return {
      reset() { box.innerHTML = ''; t0 = performance.now(); last = ''; },
      // text: 説明, principles: [番号...], opts: {arrow:true, t:秒(シミュ時間)}
      add(text, principles = [], opts = {}) {
        const key = text + principles.join(',');
        if (key === last && !opts.force) return; // 同じ行の連続を抑制
        last = key;
        const d = document.createElement('div');
        d.className = 'ln' + (opts.arrow ? ' arrow' : '');
        const t = opts.t != null ? opts.t : (performance.now() - t0) / 1000;
        const ps = principles.map(n => `<span class="p" title="${RV.PRINCIPLES[n] || ''}">原理${n}</span>`).join('');
        d.innerHTML = `<span class="t">${t.toFixed(3)}s</span>${text}${ps}`;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
        while (box.children.length > 120) box.firstChild.remove();
      }
    };
  };

  // ---------- κ（剛性）表示 ----------
  // κ=1: 剛体（2点間距離は不変） κ→0: 剛体が世界から消える
  RV.kappaBadge = function (stage) {
    const d = document.createElement('div');
    d.className = 'kappa';
    d.innerHTML = '剛性 κ = <b>1.00</b><div class="bar"><i style="width:100%"></i></div>';
    stage.appendChild(d);
    return {
      set(k) {
        d.querySelector('b').textContent = k.toFixed(2);
        d.querySelector('i').style.width = (Math.max(0, Math.min(1, k)) * 100) + '%';
      }
    };
  };

  // ---------- トースト・モーダル ----------
  RV.toast = function (stage, msg, ms = 1600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    stage.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, ms);
  };
  // buttons: [{label, primary, onClick}] — onClick 後に閉じる
  RV.modal = function (title, html, buttons = [{ label: 'OK', primary: true }]) {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'rv-modal-bg';
      bg.innerHTML = `<div class="rv-modal" role="dialog"><h3>${title}</h3><div>${html}</div><div class="btns"></div></div>`;
      const bs = bg.querySelector('.btns');
      buttons.forEach((b, i) => {
        const el = document.createElement('button');
        el.className = 'btn' + (b.primary ? ' primary' : '');
        el.textContent = b.label;
        el.onclick = () => { bg.remove(); RV.sfx.unlock(); b.onClick && b.onClick(); resolve(i); };
        bs.appendChild(el);
      });
      document.body.appendChild(bg);
    });
  };

  // ---------- 効果音（Tone.js が読み込まれていれば使う） ----------
  RV.sfx = (function () {
    let ready = false, bell, thud, synth;
    function unlock() {
      if (ready || !window.Tone) return;
      try {
        Tone.start();
        bell = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 1.2, release: 0.2 }, harmonicity: 5.1, resonance: 3000, octaves: 1.5 }).toDestination();
        bell.volume.value = -14;
        thud = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4 }).toDestination();
        thud.volume.value = -10;
        synth = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 } }).toDestination();
        synth.volume.value = -16;
        ready = true;
      } catch (e) { /* 音なしで続行 */ }
    }
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const safe = fn => (...a) => { if (ready) { try { fn(...a); } catch (e) { } } };
    return {
      unlock,
      bell: safe(() => bell.triggerAttackRelease('C5', '8n')),
      thud: safe((v = 1) => thud.triggerAttackRelease('C2', '16n', undefined, Math.min(1, v))),
      tone: safe((f = 440, d = '16n') => synth.triggerAttackRelease(f, d)),
      win: safe(() => { const n = Tone.now(); ['C5', 'E5', 'G5', 'C6'].forEach((p, i) => synth.triggerAttackRelease(p, '16n', n + i * 0.09)); }),
      fail: safe(() => { const n = Tone.now(); ['E4', 'C4'].forEach((p, i) => synth.triggerAttackRelease(p, '8n', n + i * 0.15)); })
    };
  })();

  // ---------- 固定刻みループ ----------
  // RV.loop(step(dt), render(), dt=1/120) → {stop(), pause(bool)}
  RV.loop = function (step, render, dt = 1 / 120) {
    let acc = 0, last = performance.now(), alive = true, paused = false;
    function frame(now) {
      if (!alive) return;
      let el = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!paused) {
        acc += el;
        let n = 0;
        while (acc >= dt && n < 16) { step(dt); acc -= dt; n++; }
        if (n === 16) acc = 0;
      }
      render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop() { alive = false; }, pause(p) { paused = p; last = performance.now(); }, get paused() { return paused; } };
  };

  // ---------- キャンバスの DPR 合わせ ----------
  RV.fitCanvas = function (canvas, onResize) {
    function fit() {
      const r = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      onResize && onResize(r.width, r.height, dpr);
    }
    new ResizeObserver(fit).observe(canvas.parentElement);
    fit();
  };

  // 星の判定ユーティリティ: err が th[0] 以下で★3, th[1] 以下で★2, th[2] 以下で★1
  RV.grade = function (err, th) { return err <= th[0] ? 3 : err <= th[1] ? 2 : err <= th[2] ? 1 : 0; };

  window.RV = RV;
})();
