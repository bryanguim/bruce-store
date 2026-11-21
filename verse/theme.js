/* VERSE — thèmes : valeurs par défaut, schéma des réglages, presets, validation.
   Partagé entre le fond d'écran, la fenêtre Personnaliser et le processus principal. */
(function (root) {
  'use strict';

  const FONTS = [
    { id: 'Archivo Black', label: 'Archivo Black — massive', w: 400 },
    { id: 'Anton', label: 'Anton — condensée', w: 400 },
    { id: 'Bebas Neue', label: 'Bebas Neue — affiche', w: 400 },
    { id: 'Unbounded', label: 'Unbounded — large futuriste', w: 900 },
    { id: 'Syne', label: 'Syne — designer', w: 800 },
    { id: 'Playfair Display', label: 'Playfair Display — serif chic', w: 900 },
    { id: 'DM Serif Display', label: 'DM Serif Display — serif douce', w: 400 },
    { id: 'Space Grotesk', label: 'Space Grotesk — tech', w: 700 },
    { id: 'Permanent Marker', label: 'Permanent Marker — marqueur', w: 400 },
    { id: 'Rubik Mono One', label: 'Rubik Mono One — rétro', w: 400 },
    { id: 'Bungee', label: 'Bungee — urbaine', w: 400 },
    { id: 'Monoton', label: 'Monoton — néon', w: 400 },
    { id: '__custom', label: 'Police installée sur mon PC…', w: 900 }
  ];
  const STYLES = [['stack', 'Pile (comme la vidéo)'], ['build', 'Phrase qui se construit'], ['slam', 'Mot plein écran'], ['letters', 'Lettres qui tombent'], ['flip', 'Flip 3D'], ['tilt', 'Pile inclinée']];
  const SHAPES = [['eyes', 'Yeux'], ['arc', 'Arc'], ['swoosh', 'Trait'], ['ring', 'Cercle'], ['burst', 'Étoile'], ['dots', 'Points']];
  const ENTERS = [['random', 'Au hasard'], ['pop', 'Pop'], ['drop', 'Chute'], ['blur', 'Flou'], ['rise', 'Montée'], ['skew', 'Glissé'], ['spin', 'Rotation']];

  const DEFAULT = {
    name: 'Vidéo',
    colors: { source: 'cover', accents: ['#ff4130', '#ffb3a1', '#5ab8ff', '#f6cf45', '#ff7a3d'], text: '#f4ecdf', base: '#120b0e',
      blobs: ['#5a1f26', '#3a1424', '#1c2244', '#6a2a1a', '#2a1230'], cycle: 'sequence', currentColor: true },
    background: { type: 'blobs', file: '', blur: 34, saturation: 135, brightness: 100, speed: 1, blobSize: 1, blobCount: 6, blobOpacity: 50, reactive: true, grain: 9, vignette: 55, dim: 25 },
    type: { font: 'Archivo Black', font2: 'Anton', custom: '', case: 'none', size: 100, spacing: -2.5, lineHeight: 90, italic: false, outline: false, outlineWidth: 3.5,
      shadow: 22, glow: 0, boxChance: 15, condChance: 14, boxRadius: 7 },
    motion: { styles: { stack: true, build: true, slam: true, letters: true, flip: true, tilt: true }, speed: 1, amplitude: 1, bounce: 1, shake: true, flash: true,
      decor: 32, shapes: { eyes: true, arc: true, swoosh: true, ring: true, burst: true, dots: true }, sceneFade: 380, blurIn: true },
    stack: { prevScale: 34, nextScale: 28, nextOpacity: 50, maxScale: 190, flipAngle: 40, tiltAngle: 5 },
    build: { enter: 'random', dimOld: 90 },
    slam: { fill: 90, stretch: 130, upperChance: 25 },
    letters: { stagger: 32, spin: 80 },
    layout: { position: 'center', offsetX: 0, offsetY: 0, width: 86 },
    hud: { show: true, corner: 'bl', art: true, size: 100 },
    idle: { clock: true, h24: true, text: 'Lance une musique sur Spotify' },
    lyrics: { offsetMs: 0, interlude: true, wordMs: 470 },
    advanced: { enabled: false, css: '' }
  };

  // Chaque réglage : clé, libellé, type, bornes. adv = visible seulement en mode sur-mesure.
  const SCHEMA = [
    { id: 'couleurs', title: 'Couleurs', icon: '◐', fields: [
      { k: 'colors.source', label: 'D\'où viennent les couleurs', type: 'select', options: [['cover', 'Pochette de l\'album (auto)'], ['mixed', 'Fond = pochette · texte = mes couleurs'], ['custom', 'Mes couleurs']] },
      { k: 'colors.accents', label: 'Couleurs des mots', type: 'colors', min: 1, max: 8 },
      { k: 'colors.text', label: 'Couleur des petits mots', type: 'color' },
      { k: 'colors.base', label: 'Couleur de base du fond', type: 'color' },
      { k: 'colors.blobs', label: 'Taches de couleur du fond', type: 'colors', min: 1, max: 8 },
      { k: 'colors.cycle', label: 'Ordre des couleurs', type: 'select', options: [['sequence', 'À la suite'], ['random', 'Au hasard']], adv: true },
      { k: 'colors.currentColor', label: 'Mot actuel en couleur (sinon couleur du texte)', type: 'toggle', adv: true }
    ]},
    { id: 'fond', title: 'Fond', icon: '▦', fields: [
      { k: 'background.type', label: 'Type de fond', type: 'select', options: [['blobs', 'Dégradé animé'], ['solid', 'Couleur unie'], ['image', 'Image'], ['video', 'Vidéo']] },
      { k: 'background.file', label: 'Fichier', type: 'file', when: t => t.background.type === 'image' || t.background.type === 'video' },
      { k: 'background.dim', label: 'Assombrir l\'image/vidéo', type: 'range', min: 0, max: 90, unit: '%', when: t => t.background.type === 'image' || t.background.type === 'video' },
      { k: 'background.blur', label: 'Flou', type: 'range', min: 0, max: 90, unit: 'px' },
      { k: 'background.saturation', label: 'Saturation', type: 'range', min: 0, max: 250, unit: '%' },
      { k: 'background.brightness', label: 'Luminosité', type: 'range', min: 30, max: 170, unit: '%' },
      { k: 'background.speed', label: 'Vitesse du mouvement', type: 'range', min: 0, max: 4, step: .1, unit: '×', when: t => t.background.type === 'blobs' },
      { k: 'background.blobSize', label: 'Taille des taches', type: 'range', min: .3, max: 2, step: .05, unit: '×', when: t => t.background.type === 'blobs' },
      { k: 'background.blobCount', label: 'Nombre de taches', type: 'range', min: 1, max: 10, adv: true, when: t => t.background.type === 'blobs' },
      { k: 'background.blobOpacity', label: 'Intensité des taches', type: 'range', min: 5, max: 100, unit: '%', adv: true, when: t => t.background.type === 'blobs' },
      { k: 'background.reactive', label: 'Le fond pulse sur chaque mot', type: 'toggle' },
      { k: 'background.grain', label: 'Grain', type: 'range', min: 0, max: 40, unit: '%' },
      { k: 'background.vignette', label: 'Vignettage (bords sombres)', type: 'range', min: 0, max: 100, unit: '%' }
    ]},
    { id: 'texte', title: 'Texte', icon: 'Aa', fields: [
      { k: 'type.font', label: 'Police principale', type: 'font' },
      { k: 'type.custom', label: 'Nom de la police installée', type: 'fontname', when: t => t.type.font === '__custom' || t.type.font2 === '__custom' },
      { k: 'type.font2', label: 'Police secondaire (mots spéciaux)', type: 'font' },
      { k: 'type.condChance', label: 'Mots en police secondaire', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'type.case', label: 'Casse', type: 'select', options: [['none', 'Comme les paroles'], ['upper', 'MAJUSCULES'], ['lower', 'minuscules'], ['title', 'Première Lettre En Majuscule']] },
      { k: 'type.size', label: 'Taille', type: 'range', min: 40, max: 180, unit: '%' },
      { k: 'type.spacing', label: 'Espacement des lettres', type: 'range', min: -12, max: 30, step: .5, unit: '' },
      { k: 'type.lineHeight', label: 'Hauteur de ligne', type: 'range', min: 70, max: 140, unit: '%', adv: true },
      { k: 'type.italic', label: 'Italique', type: 'toggle' },
      { k: 'type.outline', label: 'Contour seulement (lettres vides)', type: 'toggle' },
      { k: 'type.outlineWidth', label: 'Épaisseur du contour', type: 'range', min: 1, max: 10, step: .5, adv: true, when: t => t.type.outline },
      { k: 'type.shadow', label: 'Ombre', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'type.glow', label: 'Lueur néon', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'type.boxChance', label: 'Mots dans un encadré', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'type.boxRadius', label: 'Arrondi des encadrés', type: 'range', min: 0, max: 50, unit: '%', adv: true }
    ]},
    { id: 'anim', title: 'Animations', icon: '✦', fields: [
      { k: 'motion.styles', label: 'Styles utilisés (tirés au hasard à chaque phrase)', type: 'checks', options: STYLES },
      { k: 'motion.speed', label: 'Vitesse des animations', type: 'range', min: .3, max: 2.5, step: .05, unit: '×' },
      { k: 'motion.amplitude', label: 'Intensité des mouvements', type: 'range', min: 0, max: 2.2, step: .05, unit: '×' },
      { k: 'motion.bounce', label: 'Rebond', type: 'range', min: 0, max: 2.5, step: .05, unit: '×' },
      { k: 'motion.shake', label: 'Tremblement de l\'écran', type: 'toggle' },
      { k: 'motion.flash', label: 'Flash lumineux', type: 'toggle' },
      { k: 'motion.blurIn', label: 'Flou à l\'apparition', type: 'toggle', adv: true },
      { k: 'motion.decor', label: 'Formes décoratives', type: 'range', min: 0, max: 100, unit: '%' },
      { k: 'motion.shapes', label: 'Formes autorisées', type: 'checks', options: SHAPES, when: t => t.motion.decor > 0 },
      { k: 'motion.sceneFade', label: 'Durée du fondu entre phrases', type: 'range', min: 0, max: 1200, step: 20, unit: 'ms', adv: true },
      { k: 'stack.prevScale', label: 'Pile · taille du mot précédent', type: 'range', min: 5, max: 70, unit: '%', adv: true },
      { k: 'stack.nextScale', label: 'Pile · taille du mot suivant', type: 'range', min: 5, max: 70, unit: '%', adv: true },
      { k: 'stack.nextOpacity', label: 'Pile · visibilité du mot suivant', type: 'range', min: 0, max: 100, unit: '%', adv: true },
      { k: 'stack.maxScale', label: 'Pile · taille max du mot actuel', type: 'range', min: 50, max: 300, unit: '%', adv: true },
      { k: 'stack.flipAngle', label: 'Flip 3D · angle', type: 'range', min: 0, max: 90, unit: '°', adv: true },
      { k: 'stack.tiltAngle', label: 'Inclinaison · angle', type: 'range', min: 0, max: 20, unit: '°', adv: true },
      { k: 'build.enter', label: 'Construction · entrée des mots', type: 'select', options: ENTERS, adv: true },
      { k: 'build.dimOld', label: 'Construction · opacité des mots déjà dits', type: 'range', min: 10, max: 100, unit: '%', adv: true },
      { k: 'slam.fill', label: 'Plein écran · remplissage', type: 'range', min: 30, max: 100, unit: '%', adv: true },
      { k: 'slam.stretch', label: 'Plein écran · étirement vertical', type: 'range', min: 100, max: 180, unit: '%', adv: true },
      { k: 'slam.upperChance', label: 'Plein écran · chance de MAJUSCULES', type: 'range', min: 0, max: 100, unit: '%', adv: true },
      { k: 'letters.stagger', label: 'Lettres · décalage entre lettres', type: 'range', min: 0, max: 120, unit: 'ms', adv: true },
      { k: 'letters.spin', label: 'Lettres · rotation', type: 'range', min: 0, max: 180, unit: '°', adv: true }
    ]},
    { id: 'dispo', title: 'Disposition', icon: '⊞', fields: [
      { k: 'layout.position', label: 'Position des paroles', type: 'select', options: [['center', 'Centre'], ['top', 'Haut'], ['bottom', 'Bas'], ['left', 'Gauche'], ['right', 'Droite']] },
      { k: 'layout.width', label: 'Largeur max du texte', type: 'range', min: 30, max: 100, unit: '%' },
      { k: 'layout.offsetX', label: 'Décalage horizontal', type: 'range', min: -45, max: 45, unit: '%', adv: true },
      { k: 'layout.offsetY', label: 'Décalage vertical', type: 'range', min: -45, max: 45, unit: '%', adv: true },
      { k: 'hud.show', label: 'Afficher titre et artiste', type: 'toggle' },
      { k: 'hud.corner', label: 'Coin', type: 'select', options: [['bl', 'Bas gauche'], ['br', 'Bas droite'], ['tl', 'Haut gauche'], ['tr', 'Haut droite']], when: t => t.hud.show },
      { k: 'hud.art', label: 'Afficher la pochette', type: 'toggle', when: t => t.hud.show },
      { k: 'hud.size', label: 'Taille', type: 'range', min: 50, max: 250, unit: '%', when: t => t.hud.show, adv: true },
      { k: 'idle.clock', label: 'Horloge quand rien ne joue', type: 'toggle' },
      { k: 'idle.h24', label: 'Format 24 h', type: 'toggle', when: t => t.idle.clock },
      { k: 'idle.text', label: 'Texte quand rien ne joue', type: 'text', max: 80 }
    ]},
    { id: 'paroles', title: 'Paroles', icon: '♪', fields: [
      { k: 'lyrics.offsetMs', label: 'Décalage (+ = paroles plus tôt)', type: 'range', min: -3000, max: 3000, step: 50, unit: 'ms' },
      { k: 'lyrics.interlude', label: 'Points animés pendant les passages sans paroles', type: 'toggle' },
      { k: 'lyrics.wordMs', label: 'Rythme des mots (durée moyenne d\'un mot)', type: 'range', min: 200, max: 900, step: 10, unit: 'ms', adv: true }
    ]},
    { id: 'css', title: 'CSS perso', icon: '{ }', advOnly: true, fields: [
      { k: 'advanced.css', label: 'Ton propre CSS (classes : .w mot, .stack .build .slam .letters scènes, #bg fond, #hud)', type: 'code', max: 20000 }
    ]}
  ];

  // ---------------- presets (surcharges du thème par défaut)
  const PRESETS = {
    'Vidéo': {},
    'Néon nuit': { colors: { source: 'custom', accents: ['#ff2bd6', '#2bf3ff', '#b6ff3b', '#ffffff'], text: '#d9d6ff', base: '#05030a', blobs: ['#3a0a5a', '#08245a', '#5a0a3a', '#0a3a4a'] },
      type: { font: 'Unbounded', font2: 'Monoton', glow: 75, shadow: 0, boxChance: 0, condChance: 20 }, background: { grain: 12, blobOpacity: 40 }, motion: { shapes: { eyes: false, arc: true, swoosh: true, ring: true, burst: true, dots: false } } },
    'Minimal N&B': { colors: { source: 'custom', accents: ['#ffffff'], text: '#8c8c8c', base: '#000000', blobs: ['#1c1c1c', '#101010'] },
      type: { font: 'Space Grotesk', font2: 'Space Grotesk', spacing: -4, shadow: 0, boxChance: 0, condChance: 0 }, background: { saturation: 0, grain: 14, vignette: 70 },
      motion: { styles: { stack: true, build: true, slam: false, letters: false, flip: false, tilt: false }, decor: 0, flash: false, shake: false, amplitude: .7, bounce: .4 }, hud: { art: false } },
    'Sunset rétro': { colors: { source: 'custom', accents: ['#ff6b35', '#f7c548', '#ff3c78', '#ffd6a5'], text: '#ffe9cf', base: '#1a0b1f', blobs: ['#6a1a3a', '#8a3a12', '#2a1a5a', '#5a1030'] },
      type: { font: 'Bungee', font2: 'Bebas Neue', boxChance: 22, condChance: 30 }, background: { blobOpacity: 60 } },
    'Éditorial': { colors: { source: 'custom', accents: ['#e9d5b0', '#c8553d', '#f2efe9'], text: '#b9ad9c', base: '#14110f', blobs: ['#2a201a', '#1a1714', '#3a2418'] },
      type: { font: 'Playfair Display', font2: 'DM Serif Display', italic: true, spacing: -1, shadow: 30, boxChance: 0, condChance: 25 },
      motion: { styles: { stack: true, build: true, slam: false, letters: true, flip: false, tilt: false }, speed: .8, amplitude: .7, bounce: .5, shake: false, decor: 10 } },
    'Chaos': { type: { font: 'Rubik Mono One', font2: 'Anton', case: 'upper', boxChance: 35, condChance: 35 },
      motion: { amplitude: 2, bounce: 2, speed: 1.3, decor: 85 }, background: { speed: 2.5, reactive: true, blobOpacity: 70 } },
    'Graffiti': { colors: { source: 'mixed', accents: ['#c6ff00', '#ff3d7f', '#00e5ff', '#ffea00'] },
      type: { font: 'Permanent Marker', font2: 'Bungee', spacing: 0, case: 'upper', boxChance: 10, condChance: 20 }, motion: { styles: { stack: true, build: true, slam: true, letters: true, flip: false, tilt: true } } }
  };

  // ---------------- helpers
  const clone = o => JSON.parse(JSON.stringify(o));
  const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
  const set = (o, k, v) => { const ps = k.split('.'); let a = o; for (let i = 0; i < ps.length - 1; i++) a = a[ps[i]]; a[ps[ps.length - 1]] = v; };
  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const FIELD = {}; SCHEMA.forEach(s => s.fields.forEach(f => { FIELD[f.k] = f; }));

  // Validation stricte : seules les clés connues, avec le bon type, dans les bornes.
  function sanitize(input, base) {
    const out = clone(base || DEFAULT);
    const walk = (src, dst, prefix) => {
      if (!src || typeof src !== 'object' || Array.isArray(src)) return;
      for (const key of Object.keys(dst)) {
        if (!(key in src)) continue;
        const full = prefix ? prefix + '.' + key : key, v = src[key], d = dst[key], f = FIELD[full];
        if (Array.isArray(d)) {
          if (Array.isArray(v)) { const arr = v.filter(isHex).slice(0, (f && f.max) || 8); if (arr.length >= ((f && f.min) || 1)) dst[key] = arr; }
        } else if (d && typeof d === 'object') walk(v, d, full);
        else if (typeof d === 'number' && typeof v === 'number' && isFinite(v)) dst[key] = f && f.type === 'range' ? Math.min(f.max, Math.max(f.min, v)) : v;
        else if (typeof d === 'boolean' && typeof v === 'boolean') dst[key] = v;
        else if (typeof d === 'string' && typeof v === 'string') {
          if (f && f.type === 'color') { if (isHex(v)) dst[key] = v; }
          else if (f && f.type === 'select') { if (f.options.some(o => o[0] === v)) dst[key] = v; }
          else if (f && f.type === 'font') { if (FONTS.some(o => o.id === v)) dst[key] = v; }
          else if (f && f.type === 'fontname') dst[key] = v.replace(/["'\\;{}<>]/g, '').slice(0, 60);
          else if (f && f.type === 'file') dst[key] = (/^file:\/\/\/[^"'<>\\]+$/.test(v) || /^idb:[a-z0-9-]{1,40}$/.test(v)) ? v : '';
          else dst[key] = v.slice(0, (f && f.max) || 80);
        }
      }
    };
    walk(input, out, '');
    if (input && typeof input.name === 'string') out.name = input.name.slice(0, 40);
    if (!Object.values(out.motion.styles).some(Boolean)) out.motion.styles.stack = true;
    return out;
  }
  const deepMerge = (a, b) => { const o = clone(a); (function m(x, y) { for (const k in y) { if (y[k] && typeof y[k] === 'object' && !Array.isArray(y[k]) && x[k] && typeof x[k] === 'object') m(x[k], y[k]); else x[k] = clone(y[k]); } })(o, b); return o; };
  const preset = name => { const t = sanitize(deepMerge(DEFAULT, PRESETS[name] || {}), DEFAULT); t.name = name; return t; };

  const api = { FONTS, STYLES, SHAPES, ENTERS, DEFAULT, SCHEMA, PRESETS, FIELD, clone, get, set, sanitize, deepMerge, preset, isHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VerseTheme = api;
})(typeof self !== 'undefined' ? self : this);
