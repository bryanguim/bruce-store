'use strict';
/* VERSE — moteur de typographie cinétique, entièrement piloté par le thème */

const $ = s => document.querySelector(s);
const stage = $('#stage'), decor = $('#decor'), hud = $('#hud'), rootStyle = document.documentElement.style;
const api = window.verse || null;
const VT = window.VerseTheme;
const PREVIEW = location.search.includes('preview');

// ---------------------------------------------------------------- utils
const hash = str => { let h = 2166136261; for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hexToRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
};
const hsl = (h, s, l) => {
  const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------- thème & config
let T = VT.clone(VT.DEFAULT);
let cfg = { pauseInGames: true, mode: 'wallpaper' };
const fontStack = id => id === '__custom' ? `"${(T.type.custom || 'Arial Black').replace(/"/g, '')}", 'Archivo Black', sans-serif` : `'${id}', 'Archivo Black', sans-serif`;
const fontWeight = id => (VT.FONTS.find(f => f.id === id) || { w: 900 }).w;
const spd = ms => ms / (T.motion.speed || 1);
const amp = () => T.motion.amplitude;
const springEase = () => `cubic-bezier(.18,${(1 + .34 * T.motion.bounce).toFixed(2)},.32,1)`;
const blurPx = px => (T.motion.blurIn ? `blur(${px}px)` : 'blur(0px)');
const caseOf = s => s; // la casse est gérée en CSS (text-transform)

function applyTheme(t) {
  const prevWordMs = T.lyrics.wordMs;
  T = VT.sanitize(t, VT.DEFAULT);
  const ty = T.type, bg = T.background;
  rootStyle.setProperty('--font', fontStack(ty.font)); rootStyle.setProperty('--fw', fontWeight(ty.font));
  rootStyle.setProperty('--font2', fontStack(ty.font2)); rootStyle.setProperty('--fw2', fontWeight(ty.font2));
  rootStyle.setProperty('--fs', (20 * ty.size / 100) + 'vmin');
  rootStyle.setProperty('--ls', (ty.spacing / 100) + 'em');
  rootStyle.setProperty('--lh', ty.lineHeight / 100);
  rootStyle.setProperty('--fst', ty.italic ? 'italic' : 'normal');
  rootStyle.setProperty('--tt', { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' }[ty.case] || 'none');
  const shadows = [];
  if (ty.shadow) shadows.push(`0 .03em .3em rgba(0,0,0,${ty.shadow / 100})`);
  if (ty.glow) shadows.push(`0 0 ${(ty.glow * .0025).toFixed(3)}em currentColor`, `0 0 ${(ty.glow * .009).toFixed(3)}em currentColor`);
  rootStyle.setProperty('--tshadow', shadows.join(',') || 'none');
  rootStyle.setProperty('--ow', (ty.outlineWidth / 100) + 'em');
  rootStyle.setProperty('--boxr', (ty.boxRadius / 100 * .6) + 'em');
  document.body.classList.toggle('outline', ty.outline);
  rootStyle.setProperty('--blur', bg.blur + 'px'); rootStyle.setProperty('--sat', bg.saturation + '%'); rootStyle.setProperty('--bright', bg.brightness + '%');
  rootStyle.setProperty('--grain', bg.grain / 100); rootStyle.setProperty('--vig', bg.vignette / 100); rootStyle.setProperty('--dim', bg.dim / 100);
  rootStyle.setProperty('--fade', T.motion.sceneFade + 'ms');
  rootStyle.setProperty('--stackDur', spd(620) + 'ms'); rootStyle.setProperty('--stackEase', springEase());
  setupBackground();
  // disposition
  const P = { center: [0, 0], top: [0, -24], bottom: [0, 24], left: [-24, 0], right: [24, 0] }[T.layout.position] || [0, 0];
  stage.style.transform = `translate(${P[0] + T.layout.offsetX}vw, ${P[1] + T.layout.offsetY}vh)`;
  // HUD
  hud.style.display = T.hud.show ? '' : 'none';
  hud.dataset.corner = T.hud.corner;
  hud.style.setProperty('--hs', T.hud.size / 100);
  $('#hud-art').style.visibility = T.hud.art ? '' : 'hidden';
  $('#usercss').textContent = T.advanced.enabled ? T.advanced.css : '';
  refreshPalette();
  if (state.rawLRC && prevWordMs !== T.lyrics.wordMs) { state.lines = parseLRC(state.rawLRC); state.lineIdx = -9; }
  if (scene instanceof Idle) show(new Idle());
  else if (state.lines) state.lineIdx = -9; // reconstruit la phrase en cours avec le nouveau style
  else if (scene instanceof Title && state.meta) show(new Title(state.meta.title, state.meta.artist, scene.note));
}
function applyCfg(c) {
  cfg = { ...cfg, ...c };
  if (c && c.theme) applyTheme(c.theme);
}

// ---------------------------------------------------------------- palette
let pal = { accents: VT.DEFAULT.colors.accents, bg: VT.DEFAULT.colors.blobs, text: VT.DEFAULT.colors.text, dark: VT.DEFAULT.colors.base };
let coverPal = null;
async function paletteFromImage(src) {
  const img = new Image(); if (/^https?:/.test(src)) img.crossOrigin = 'anonymous'; img.src = src; await img.decode();
  const N = 48, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data;
  const buckets = new Map(); const dark = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (l < .3) { dark[0] += h; dark[1] += s; dark[2] += l; dark[3]++; }
    if (s < .22 || l < .14 || l > .94) continue;
    const k = Math.round(h * 14) % 14; const b = buckets.get(k) || { n: 0, h: 0, s: 0, l: 0 };
    b.n++; b.h += h; b.s += s; b.l += l; buckets.set(k, b);
  }
  const ranked = [...buckets.values()].map(b => ({ h: b.h / b.n, s: b.s / b.n, l: b.l / b.n, score: b.n * (.4 + b.s / b.n) })).sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of ranked) { if (chosen.every(o => Math.min(Math.abs(o.h - c.h), 1 - Math.abs(o.h - c.h)) > .06)) chosen.push(c); if (chosen.length >= 4) break; }
  if (chosen.length < 2) return null;
  const accents = chosen.map(c => hsl(c.h, clamp(c.s * 1.25, .62, .95), clamp(c.l, .56, .7)));
  accents.push(hsl(chosen[0].h, .7, .84));
  const bg = chosen.flatMap(c => [hsl(c.h, clamp(c.s, .4, .75), .24), hsl(c.h, clamp(c.s, .3, .6), .12)]).slice(0, 8);
  const dh = dark[3] ? dark[0] / dark[3] : chosen[0].h;
  return { accents, bg, text: '#f6efe4', dark: hsl(dh, .3, .06) };
}
function refreshPalette() {
  const C = T.colors, mine = { accents: C.accents, bg: C.blobs, text: C.text, dark: C.base };
  if (C.source === 'custom' || !coverPal) pal = mine;
  else if (C.source === 'mixed') pal = { accents: mine.accents, text: mine.text, bg: coverPal.bg, dark: coverPal.dark };
  else pal = coverPal;
  rootStyle.setProperty('--text', pal.text); rootStyle.setProperty('--dark', pal.dark);
  blobs.forEach((b, i) => { b.tgt = hexToRgb(pal.bg[i % pal.bg.length]); });
  bgBaseT = hexToRgb(pal.dark);
  document.body.style.background = pal.dark;
}
function accentAt(i, off) {
  const A = pal.accents;
  return T.colors.cycle === 'random' ? A[hash(off * 7919 + i * 31) % A.length] : A[(i + off) % A.length];
}
const inkFor = (i, off) => (T.colors.currentColor ? accentAt(i, off) : pal.text);

// ---------------------------------------------------------------- fond
const bgc = $('#bg'), bctx = bgc.getContext('2d');
bgc.width = 96; bgc.height = 54;
let blobs = [];
let bgBase = [18, 10, 14], bgBaseT = [18, 10, 14], energy = 0, bgTime = 0, lastTs = 0;
function setupBackground() {
  const B = T.background, n = Math.round(B.blobCount);
  while (blobs.length < n) { const i = blobs.length; blobs.push({ ph: Math.random() * 6.28, sp: .045 + Math.random() * .07, r: .42 + Math.random() * .38, col: blobs[0] ? [...blobs[0].col] : [40, 20, 25], tgt: [40, 20, 25], i }); }
  blobs.length = n;
  const media = $('#bgmedia');
  const wantMedia = (B.type === 'image' || B.type === 'video') && B.file;
  if (!wantMedia) { if (media.firstChild) media.innerHTML = ''; }
  else {
    const cur = media.firstChild;
    const url = window.VerseResolveFile ? window.VerseResolveFile(B.file) : B.file;
    if (url && (!cur || cur.dataset.src !== url || cur.tagName.toLowerCase() !== (B.type === 'video' ? 'video' : 'img'))) {
      media.innerHTML = '';
      const el = document.createElement(B.type === 'video' ? 'video' : 'img');
      el.dataset.src = url; el.src = url;
      if (B.type === 'video') { el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true; el.play().catch(() => {}); }
      media.appendChild(el);
    }
  }
  document.body.dataset.bg = wantMedia ? 'media' : B.type === 'solid' ? 'solid' : 'blobs';
}
function drawBg(ts) {
  const dt = lastTs ? Math.min(.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
  bgTime += dt * T.background.speed;
  const W = bgc.width, H = bgc.height, t = bgTime;
  for (let k = 0; k < 3; k++) bgBase[k] = lerp(bgBase[k], bgBaseT[k], .03);
  bctx.globalCompositeOperation = 'source-over';
  bctx.fillStyle = `rgb(${bgBase.map(Math.round)})`; bctx.fillRect(0, 0, W, H);
  energy *= .93;
  if (T.background.type !== 'blobs') return;
  bctx.globalCompositeOperation = 'lighter';
  const op = T.background.blobOpacity / 100;
  for (const b of blobs) {
    for (let k = 0; k < 3; k++) b.col[k] = lerp(b.col[k], b.tgt[k], .025);
    const x = (.5 + .42 * Math.sin(t * b.sp + b.ph)) * W;
    const y = (.5 + .38 * Math.cos(t * b.sp * 1.37 + b.ph * 1.9)) * H;
    const r = b.r * W * T.background.blobSize * (1 + energy * .18);
    const g = bctx.createRadialGradient(x, y, 0, x, y, r);
    const [cr, cg, cb] = b.col.map(Math.round);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(1, op + energy * .18)})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    bctx.fillStyle = g; bctx.beginPath(); bctx.arc(x, y, r, 0, 6.2832); bctx.fill();
  }
}
const flash = $('#flash');
function pulse(strength = 1) {
  if (T.background.reactive) energy = Math.min(1.2, energy + .7 * strength);
  if (T.motion.flash) flash.animate([{ opacity: .55 * strength }, { opacity: 0 }], { duration: spd(420), easing: 'ease-out' });
}

// ---------------------------------------------------------------- décor
const SVGNS = 'http://www.w3.org/2000/svg';
function spawnDecor(r, ms) {
  const kinds = VT.SHAPES.map(s => s[0]).filter(k => T.motion.shapes[k]);
  if (!kinds.length) return;
  const W = innerWidth, H = innerHeight, col = pick(r, pal.accents);
  const g = document.createElementNS(SVGNS, 'g');
  const side = r() < .5 ? -1 : 1;
  const cx = W / 2 + side * W * (.26 + r() * .16), cy = H * (.2 + r() * .6);
  const kind = pick(r, kinds);
  const u = Math.min(W, H) * (.09 + r() * .07);
  const el = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); g.appendChild(e); return e; };
  if (kind === 'eyes') {
    for (const dx of [-1, 1]) {
      el('ellipse', { cx: dx * u * .75, cy: 0, rx: u * .62, ry: u * .36, fill: pal.text, opacity: .92 });
      const p = el('circle', { cx: dx * u * .75, cy: 0, r: u * .17, fill: '#111' });
      p.animate([{ transform: `translate(${-u * .25}px,0)` }, { transform: `translate(${u * .28}px,${u * .05}px)` }], { duration: spd(1400), direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    }
  } else if (kind === 'arc') {
    el('path', { d: `M ${-u} 0 A ${u} ${u} 0 0 1 ${u} 0`, fill: 'none', stroke: col, 'stroke-width': u * .22, 'stroke-linecap': 'round' });
  } else if (kind === 'swoosh') {
    const p = el('path', { d: `M ${-u * 1.4} ${u * .5} C ${-u * .4} ${-u * .9}, ${u * .4} ${u * .9}, ${u * 1.4} ${-u * .4}`, fill: 'none', stroke: col, 'stroke-width': u * .16, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 });
    p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: spd(700), easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' });
  } else if (kind === 'ring') {
    el('circle', { cx: 0, cy: 0, r: u, fill: 'none', stroke: col, 'stroke-width': u * .08, 'stroke-dasharray': `${u * .3} ${u * .18}` });
  } else if (kind === 'burst') {
    const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? u * .45 : u; pts.push(`${Math.cos(a) * rr},${Math.sin(a) * rr}`); }
    el('polygon', { points: pts.join(' '), fill: col });
  } else {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) el('circle', { cx: (i - 1.5) * u * .45, cy: (j - 1.5) * u * .45, r: u * .07, fill: col });
  }
  decor.appendChild(g);
  const rot = (r() - .5) * 60 * amp(), life = clamp(ms, 1800, 7000);
  g.animate([
    { transform: `translate(${cx}px,${cy + 40}px) scale(.2) rotate(${rot - 40}deg)`, opacity: 0 },
    { transform: `translate(${cx}px,${cy}px) scale(1) rotate(${rot}deg)`, opacity: .9, offset: .12 },
    { transform: `translate(${cx + side * 30}px,${cy - 30}px) scale(1.05) rotate(${rot + 12}deg)`, opacity: .85, offset: .82 },
    { transform: `translate(${cx + side * 50}px,${cy - 50}px) scale(.6) rotate(${rot + 30}deg)`, opacity: 0 }
  ], { duration: life, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).onfinish = () => g.remove();
  while (decor.childNodes.length > 4) decor.firstChild.remove();
}

// ---------------------------------------------------------------- scènes
let scene = null, lastStyle = '';
function mkScene(cls) { const c = document.createElement('div'); c.className = 'scene ' + cls; stage.appendChild(c); return c; }
function show(next) {
  const old = scene; scene = next;
  if (old) { old.dispose && old.dispose(); old.c.classList.add('out'); setTimeout(() => old.c.remove(), T.motion.sceneFade + 100); }
}
const maxW = () => innerWidth * T.layout.width / 100;
function wordEl(text, r, cls = '') {
  const el = document.createElement('div');
  const cond = r() * 100 < T.type.condChance;
  el.className = 'w' + (cond ? ' f-cond' : '') + (cls ? ' ' + cls : '');
  el.textContent = text;
  return el;
}

// 1 · Pile
class Stack {
  constructor(line, r, mode) {
    this.mode = mode; this.c = mkScene('stack ' + mode); this.off = Math.floor(r() * 9);
    const H = innerHeight, S = T.stack;
    this.items = line.words.map((w, j) => {
      const box = r() * 100 < T.type.boxChance;
      const el = wordEl(w.text, r, box ? 'box' : '');
      const acc = accentAt(j, this.off);
      if (box) el.style.setProperty('--box', acc);
      el.style.transition = 'none';
      this.c.appendChild(el);
      const it = { el, box, w: el.offsetWidth, h: el.offsetHeight, ink: box ? accentAt(j + 2, this.off) : inkFor(j, this.off) };
      it.fit = Math.min(S.maxScale / 100, maxW() / it.w, H * .46 / it.h);
      return it;
    });
    this.layout(-1);
    requestAnimationFrame(() => this.items.forEach(it => (it.el.style.transition = '')));
  }
  scaleOf(j, cur) { const d = j - cur, it = this.items[j], S = T.stack; if (d === 0) return it.fit; if (d === -1) return Math.min(it.fit, S.prevScale / 100); if (d === 1) return Math.min(it.fit, S.nextScale / 100); return .18; }
  layout(cur) {
    const H = innerHeight, gap = H * .014, a = amp(), S = T.stack;
    const ci = this.items[cur], curH = ci ? ci.h * this.scaleOf(cur, cur) : 0;
    const prev = this.items[cur - 1], prevH = prev ? prev.h * this.scaleOf(cur - 1, cur) : 0;
    this.items.forEach((it, j) => {
      const d = j - cur, s = this.scaleOf(j, cur), h = it.h * s;
      let y, o, blur = 0, rx = 0, rot = 0;
      if (cur < 0) { y = H * .22; o = 0; blur = 12; }
      else if (d === 0) { y = 0; o = 1; }
      else if (d === -1) { y = -(curH / 2 + gap + h / 2); o = .92; }
      else if (d === 1) { y = curH / 2 + gap + h / 2; o = S.nextOpacity / 100; }
      else if (d < -1) { y = -(curH / 2 + gap + prevH + gap + h / 2); o = 0; blur = 10; }
      else { y = curH / 2 + gap + H * .16; o = 0; blur = 10; }
      if (this.mode === 'flip') rx = d < 0 ? S.flipAngle * a : d > 0 ? -S.flipAngle * 1.15 * a : 0;
      if (this.mode === 'tilt') rot = (d === 0 ? -S.tiltAngle : d < 0 ? -S.tiltAngle * .4 : S.tiltAngle * .6) * a;
      it.el.style.transform = `perspective(900px) translate(-50%,-50%) translateY(${y}px) rotateX(${rx}deg) rotate(${rot}deg) scale(${s})`;
      it.el.style.opacity = o;
      it.el.style.filter = blur && T.motion.blurIn ? `blur(${blur}px)` : 'none';
      it.el.style.color = d === 0 || it.box ? it.ink : pal.text;
    });
  }
  word(i) { this.layout(i); pulse(.8); }
}

// 2 · Construction
const ENTER = {
  pop: a => [{ transform: 'scale(.15)', opacity: 0 }, { transform: `scale(${1 + .18 * a})`, opacity: 1, offset: .6 }, { transform: 'scale(1)' }],
  drop: a => [{ transform: `translateY(-70%) rotate(${-10 * a}deg)`, opacity: 0 }, { transform: `translateY(${6 * a}%) rotate(${2 * a}deg)`, opacity: 1, offset: .65 }, { transform: 'none' }],
  blur: a => [{ transform: `scale(${1 + .5 * a})`, filter: blurPx(26), opacity: 0 }, { transform: 'scale(1)', filter: 'blur(0px)', opacity: 1 }],
  rise: a => [{ transform: `translateY(60%) scaleY(${1 + .6 * a})`, opacity: 0 }, { transform: 'translateY(-4%) scaleY(.95)', opacity: 1, offset: .7 }, { transform: 'none' }],
  skew: a => [{ transform: `translateX(-30%) skewX(${-25 * a}deg)`, opacity: 0 }, { transform: `skewX(${6 * a}deg)`, opacity: 1, offset: .6 }, { transform: 'none' }],
  spin: a => [{ transform: `rotate(${-90 * a}deg) scale(.3)`, opacity: 0 }, { transform: `rotate(${6 * a}deg) scale(1.05)`, opacity: 1, offset: .7 }, { transform: 'none' }]
};
function fitBox(box, items, startVmin) {
  let fs = startVmin; box.style.fontSize = fs + 'vmin';
  const over = () => box.scrollHeight > box.clientHeight + 2 || items.some(el => el.offsetWidth > box.clientWidth);
  while (over() && fs > 3) { fs *= .9; box.style.fontSize = fs + 'vmin'; }
}
class Build {
  constructor(line, r, cls = '') {
    this.c = mkScene('buildwrap'); this.off = Math.floor(r() * 9);
    this.box = document.createElement('div'); this.box.className = 'build ' + cls;
    this.box.style.left = this.box.style.right = ((100 - T.layout.width) / 2) + 'vw';
    this.c.appendChild(this.box);
    this.anim = T.build.enter === 'random' ? pick(r, Object.keys(ENTER)) : T.build.enter;
    this.items = line.words.map((w, j) => {
      const box = r() * 100 < T.type.boxChance * .5;
      const el = wordEl(w.text, r, box ? 'box' : ''); el.style.visibility = 'hidden'; this.box.appendChild(el);
      if (box) el.style.setProperty('--box', accentAt(j + 3, this.off));
      return { el, box, ink: inkFor(j, this.off), shown: false };
    });
    fitBox(this.box, this.items.map(i => i.el), 30 * T.type.size / 100);
  }
  word(i) {
    this.items.forEach((it, j) => {
      if (j <= i && !it.shown) {
        it.shown = true; it.el.style.visibility = 'visible';
        if (j === i) it.el.animate(ENTER[this.anim](amp() * Math.max(.3, T.motion.bounce)), { duration: spd(560), easing: 'cubic-bezier(.2,1,.3,1)' });
      }
      it.el.style.color = j === i ? it.ink : pal.text;
      it.el.style.opacity = j === i ? 1 : T.build.dimOld / 100;
    });
    pulse(.7);
  }
}

// 3 · Slam
class Slam {
  constructor(line, r) {
    this.c = mkScene('slam'); this.line = line; this.r = r; this.off = Math.floor(r() * 9);
    this.cond = r() < .55; this.upper = r() * 100 < T.slam.upperChance; this.cur = null; this.i = -2;
  }
  word(i) {
    if (i === this.i) return; this.i = i;
    const a = amp(), w = this.line.words[i];
    if (this.cur) {
      const old = this.cur, t = old.style.transform;
      old.animate([{ opacity: 1, transform: t }, { opacity: 0, transform: t + ` scale(${1 + .4 * a})`, filter: blurPx(16) }], { duration: spd(240), easing: 'ease-in', fill: 'forwards' });
      setTimeout(() => old.remove(), spd(260));
    }
    const el = document.createElement('div');
    el.className = 'w' + (this.cond ? ' f-cond' : '');
    el.textContent = this.upper ? w.text.toUpperCase() : w.text;
    el.style.color = inkFor(i, this.off);
    this.c.appendChild(el);
    const f = T.slam.fill / 100;
    const sx = Math.min(maxW() * f / .86 * .9 / el.offsetWidth, innerHeight * .7 * f / el.offsetHeight, 4.5);
    const sy = this.cond ? Math.min(sx * T.slam.stretch / 100, innerHeight * .8 / el.offsetHeight) : sx;
    const base = `translate(-50%,-50%) scale(${sx},${sy})`;
    el.style.transform = base;
    const k1 = 1 + 1.1 * a, k2 = 1 - .07 * T.motion.bounce;
    el.animate([
      { transform: `translate(-50%,-50%) scale(${sx * k1},${sy * k1})`, opacity: 0, filter: blurPx(20) },
      { transform: `translate(-50%,-50%) scale(${sx * k2},${sy * k2})`, opacity: 1, filter: 'blur(0px)', offset: .55 },
      { transform: base }
    ], { duration: spd(380), easing: 'cubic-bezier(.2,.9,.3,1)' });
    if (T.motion.shake) { const k = 10 * a; this.c.animate([{ transform: 'none' }, { transform: `translate(${k}px,${-k / 2}px)` }, { transform: `translate(${-k}px,${k / 2}px)` }, { transform: 'none' }], { duration: spd(220), delay: spd(170) }); }
    this.cur = el; pulse(1.1);
  }
}

// 4 · Lettres
class Letters {
  constructor(line, r) { this.c = mkScene('letters'); this.line = line; this.r = r; this.off = Math.floor(r() * 9); this.cur = null; this.i = -2; this.cond = r() * 100 < T.type.condChance; }
  word(i) {
    if (i === this.i) return; this.i = i;
    const a = amp(), r = this.r, L = T.letters;
    if (this.cur) {
      const old = this.cur;
      [...old.children].forEach((s, k) => s.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${50 + r() * 40}%) rotate(${(r() - .5) * L.spin * .9 * a}deg)`, opacity: 0 }], { duration: spd(300), delay: k * L.stagger * .55, easing: 'ease-in', fill: 'forwards' }));
      setTimeout(() => old.remove(), spd(300) + old.children.length * L.stagger * .55 + 50);
    }
    const el = document.createElement('div'); el.className = 'w' + (this.cond ? ' f-cond' : '');
    const acc = inkFor(i, this.off), odd = Math.floor(r() * 6);
    [...this.line.words[i].text].forEach((ch, k) => { const s = document.createElement('span'); s.textContent = ch; s.style.color = k === odd ? pal.text : acc; el.appendChild(s); });
    this.c.appendChild(el);
    const s = Math.min(maxW() * .93 / el.offsetWidth, innerHeight * .55 / el.offsetHeight, 3);
    el.style.transform = `translate(-50%,-50%) scale(${s})`;
    [...el.children].forEach((sp, k) => sp.animate([
      { transform: `translateY(${-90 - r() * 50}%) rotate(${(r() - .5) * L.spin * a}deg) scale(.6)`, opacity: 0 },
      { transform: `translateY(${8 * a * T.motion.bounce}%) rotate(${(r() - .5) * 8 * a}deg)`, opacity: 1, offset: .7 },
      { transform: 'none', opacity: 1 }
    ], { duration: spd(520), delay: spd(k * L.stagger), easing: 'cubic-bezier(.2,1,.3,1)', fill: 'backwards' }));
    this.cur = el; pulse(.9);
  }
}

// Écrans hors paroles
class Title {
  constructor(title, artist, note) {
    this.c = mkScene('title'); this.note = note;
    const box = document.createElement('div'); box.className = 'build'; this.c.appendChild(box);
    const r = rng(hash(title + artist)), off = Math.floor(r() * 9);
    const words = (title || '').split(/\s+/).filter(Boolean).slice(0, 12);
    const els = words.map((w, j) => { const el = document.createElement('div'); el.className = 'w'; el.textContent = w; el.style.color = j % 3 === 1 ? accentAt(j, off) : pal.text; box.appendChild(el); return el; });
    fitBox(box, els, 17 * T.type.size / 100);
    els.forEach((el, j) => el.animate(ENTER.pop(1), { duration: spd(600), delay: spd(120 + j * 110), easing: 'cubic-bezier(.2,1,.3,1)', fill: 'backwards' }));
    if (artist) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = artist; this.c.appendChild(s); s.animate([{ opacity: 0, letterSpacing: '.8em' }, { opacity: .8, letterSpacing: '.32em' }], { duration: 1200, delay: 300, easing: 'ease-out', fill: 'backwards' }); }
    if (note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = note; this.c.appendChild(n); }
  }
  word() {}
}
class Idle {
  constructor() {
    this.c = mkScene('idle');
    if (T.idle.clock) { this.clock = document.createElement('div'); this.clock.className = 'w clock'; this.c.appendChild(this.clock); }
    if (T.idle.text) { const s = document.createElement('div'); s.className = 'sub' + (T.idle.clock ? '' : ' alone'); s.textContent = T.idle.text; this.c.appendChild(s); }
    this.tick(); this.t = setInterval(() => this.tick(), 1000);
  }
  tick() {
    if (!this.clock) return;
    const t = new Date().toLocaleTimeString(T.idle.h24 ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: !T.idle.h24 });
    if (this.clock.textContent !== t) {
      this.clock.textContent = t;
      this.clock.style.transform = 'translate(-50%,-58%)';
      this.clock.animate([{ opacity: 0, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 700 });
    }
  }
  dispose() { clearInterval(this.t); }
  word() {}
}
class Interlude {
  constructor() {
    this.c = mkScene('interlude');
    if (!T.lyrics.interlude) return;
    for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'dot'; d.style.background = pal.accents[i % pal.accents.length]; d.style.animationDuration = spd(1100) + 'ms'; this.c.appendChild(d); }
  }
  word() {}
}

function sceneFor(line, idx) {
  const r = rng(hash((state.key || '') + '#' + idx + '#' + themeSeed));
  const n = line.words.length, on = T.motion.styles;
  const pref = n <= 2 ? ['slam', 'slam', 'letters', 'stack'] : n <= 5 ? ['stack', 'stack', 'build', 'slam', 'flip', 'letters', 'tilt'] : n <= 9 ? ['stack', 'build', 'build', 'flip', 'tilt'] : ['build', 'build', 'stack'];
  let pool = pref.filter(p => on[p]);
  if (!pool.length) pool = Object.keys(on).filter(k => on[k] && (n <= 9 || (k !== 'slam' && k !== 'letters')));
  if (!pool.length) pool = Object.keys(on).filter(k => on[k]);
  if (!pool.length) pool = ['stack'];
  let st = pick(r, pool); if (st === lastStyle && pool.length > 1) st = pick(r, pool);
  lastStyle = st;
  if (r() * 100 < T.motion.decor) spawnDecor(r, (line.end - line.t) * 1.2);
  switch (st) {
    case 'slam': return new Slam(line, r);
    case 'letters': return new Letters(line, r);
    case 'build': return new Build(line, r, r() < .25 ? 'left' : '');
    case 'flip': return new Stack(line, r, 'flip');
    case 'tilt': return new Stack(line, r, 'tilt');
    default: return new Stack(line, r, 'plain');
  }
}

// ---------------------------------------------------------------- paroles
function parseLRC(lrc) {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
    for (const m of tags) lines.push({ t: (+m[1] * 60 + parseFloat(m[2].replace(':', '.'))) * 1000, text });
  }
  lines.sort((a, b) => a.t - b.t);
  const per = T.lyrics.wordMs;
  lines.forEach((L, i) => {
    const next = lines[i + 1] ? lines[i + 1].t : L.t + 6000;
    L.end = next;
    const words = L.text.split(/\s+/).filter(Boolean);
    if (!words.length) { L.words = []; return; }
    const span = Math.min((next - L.t) * .86, words.length * per + per * .8);
    const weights = words.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2.2);
    const tot = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    L.words = words.map((w, j) => { const t = L.t + span * acc / tot; acc += weights[j]; return { t, text: w }; });
  });
  return lines;
}

// ---------------------------------------------------------------- état & horloge
const state = { key: null, meta: null, lines: null, rawLRC: null, lineIdx: -9, wordIdx: -9, interlude: false, base: { pos: 0, at: 0, playing: false }, sleeping: false, demo: false };
let themeSeed = 0;
const rawPos = () => state.base.pos + (state.base.playing ? performance.now() - state.base.at : 0);
const getPos = () => rawPos() + (T.lyrics.offsetMs || 0);

let lastThumb = '';
async function applyThumb(src) {
  if (!src || src === lastThumb) return; lastThumb = src;
  $('#hud-art').src = src;
  try { coverPal = await paletteFromImage(src); } catch { coverPal = null; }
  refreshPalette();
}

async function newTrack(m) {
  state.key = m.key; state.meta = m; state.lines = null; state.rawLRC = null; state.lineIdx = -9; state.wordIdx = -9; state.interlude = false;
  $('#hud-title').textContent = m.title || ''; $('#hud-artist').textContent = m.artist || '';
  hud.classList.add('on');
  if (!m.thumb) { lastThumb = ''; coverPal = null; $('#hud-art').removeAttribute('src'); refreshPalette(); }
  show(new Title(m.title, m.artist, ''));
  let res = null;
  if (m.demoLyrics) res = { synced: m.demoLyrics };
  else if (api) { try { res = await api.getLyrics({ title: m.title, artist: m.artist, album: m.album, durationMs: m.durationMs }); } catch {} }
  if (state.key !== m.key) return;
  if (res && res.synced) { state.rawLRC = res.synced; state.lines = parseLRC(res.synced); state.lineIdx = -9; }
  else show(new Title(m.title, m.artist, res && res.instrumental ? 'Instrumental' : 'Paroles synchronisées introuvables'));
}

function onMedia(m) {
  if (state.demo && !m.demo) return;
  const sleep = !PREVIEW && cfg.mode === 'wallpaper' && cfg.pauseInGames && !!m.fullscreen;
  if (sleep !== state.sleeping) { state.sleeping = sleep; document.body.classList.toggle('sleeping', sleep); }
  if (!m.ok || !m.title) {
    if (state.key !== '__idle') { state.key = '__idle'; state.lines = null; state.rawLRC = null; hud.classList.remove('on'); document.body.classList.remove('paused'); coverPal = null; refreshPalette(); show(new Idle()); }
    return;
  }
  const playing = m.status === 'Playing';
  let pos = m.positionMs || 0;
  if (playing && m.updatedAt > 1e12 && m.now) pos += Math.max(0, m.now - m.updatedAt);
  if (m.durationMs > 0) pos = Math.min(pos, m.durationMs);
  if (state.key !== m.key || Math.abs(rawPos() - pos) > 400 || playing !== state.base.playing) state.base = { pos, at: performance.now(), playing };
  document.body.classList.toggle('paused', !playing);
  if (m.thumb) applyThumb(m.thumb);
  if (state.key !== m.key) newTrack(m);
}

function findLine(lines, pos) { let lo = 0, hi = lines.length - 1, ans = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; }

function tickLyrics() {
  const lines = state.lines; if (!lines || !lines.length) return;
  const pos = getPos(), idx = findLine(lines, pos);
  if (idx !== state.lineIdx) {
    state.lineIdx = idx; state.wordIdx = -9; state.interlude = false;
    if (idx < 0) { if (!(scene instanceof Title)) show(new Title(state.meta.title, state.meta.artist, '')); return; }
    const L = lines[idx];
    if (!L.words.length) { show(new Interlude()); state.interlude = true; return; }
    show(sceneFor(L, idx));
  }
  if (idx < 0 || state.interlude) return;
  const L = lines[idx];
  let w = -1; for (let j = 0; j < L.words.length; j++) { if (L.words[j].t <= pos) w = j; else break; }
  if (w !== state.wordIdx && w >= 0) { state.wordIdx = w; scene && scene.word(w); }
  const lastW = L.words[L.words.length - 1].t, nextT = lines[idx + 1] ? lines[idx + 1].t : Infinity;
  if (pos - lastW > 2800 && nextT - pos > 3200) { state.interlude = true; show(new Interlude()); }
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (state.sleeping) return;
  drawBg(ts);
  tickLyrics();
}

// ---------------------------------------------------------------- démo (paroles originales)
const DEMO_LRC = `[00:00.80] lights go low on the avenue
[00:04.40] I keep your name
[00:06.20] in my pocket like a secret
[00:10.00] call me back
[00:11.60] when the city falls asleep
[00:15.20] so slow
[00:16.60] we were dancing on the ceiling of the night
[00:21.40]
[00:24.20] hold on
[00:25.60] hold on to the neon
[00:29.00] don't let go`;
function demoCover() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#0f2a3a'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#18c6b4'; x.beginPath(); x.arc(20, 22, 18, 0, 7); x.fill();
  x.fillStyle = '#ff8a2a'; x.fillRect(30, 30, 30, 30);
  x.fillStyle = '#b44cff'; x.beginPath(); x.moveTo(0, 64); x.lineTo(30, 40); x.lineTo(30, 64); x.fill();
  return c.toDataURL('image/png');
}
let demoTimer = null;
function startDemo(loop) {
  clearInterval(demoTimer);
  state.demo = true;
  let t0 = Date.now(), key = 'demo|' + t0;
  const cover = demoCover();
  let first = true;
  const send = () => {
    let el = Date.now() - t0;
    if (el > 33000) {
      if (loop) { t0 = Date.now(); key = 'demo|' + t0; el = 0; first = true; }
      else { state.demo = false; clearInterval(demoTimer); onMedia({ ok: false, demo: true }); return; }
    }
    onMedia({ ok: true, demo: true, key, title: 'Neon Avenue', artist: 'VERSE · démo', album: '', status: 'Playing', positionMs: el, durationMs: 34000, updatedAt: Date.now(), now: Date.now(), demoLyrics: DEMO_LRC, thumb: first ? cover : undefined });
    first = false;
  };
  demoTimer = setInterval(send, 400); send();
}

// ---------------------------------------------------------------- démarrage
document.fonts.ready.then(() => {
  applyTheme(VT.DEFAULT);
  show(new Idle()); state.key = '__idle';
  if (api) {
    api.getConfig().then(applyCfg);
    api.onConfig(applyCfg);
    api.onMedia(onMedia);
    api.onDemo(() => startDemo(false));
  }
  if (PREVIEW) {
    window.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === 'theme' && d.theme) { if (d.reshuffle) themeSeed++; applyTheme(d.theme); }
    });
    try { window.parent.postMessage({ type: 'preview-ready' }, '*'); } catch {}
  }
  if (location.search.includes('demo')) startDemo(location.search.includes('loop') || PREVIEW);
  requestAnimationFrame(frame);
});
