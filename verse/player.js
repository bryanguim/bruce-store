'use strict';
/* VERSE iPhone — lecteur de musique + paroles animées (web app, 100 % locale) */
(function () {
  const VT = window.VerseTheme;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); };

  // ------------------------------------------------------------ base de données locale (IndexedDB)
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('verse', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('tracks', { keyPath: 'id' }); d.createObjectStore('files'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  const dbGet = (store, key) => tx(store, 'readonly', s => s.get(key));
  const dbPut = (store, val, key) => tx(store, 'readwrite', s => (key !== undefined ? s.put(val, key) : s.put(val)));
  const dbDel = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  const dbAll = store => tx(store, 'readonly', s => s.getAll());

  // ------------------------------------------------------------ thème
  const LS = { theme: 'verse.theme', saved: 'verse.saved', adv: 'verse.adv' };
  const MOBILE_IDLE = 'Touche l’écran pour ajouter tes musiques';
  let theme;
  try { theme = VT.sanitize(JSON.parse(localStorage.getItem(LS.theme) || 'null') || {}, VT.DEFAULT); } catch { theme = VT.clone(VT.DEFAULT); }
  if (!localStorage.getItem(LS.theme)) { theme = VT.preset('Vidéo'); theme.idle.text = MOBILE_IDLE; theme.hud.show = false; }
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS.saved) || '{}'); } catch {}
  const fileURLs = {};
  window.VerseResolveFile = k => fileURLs[k] || '';
  async function loadThemeFile() {
    const k = theme.background.file;
    if (k && k.startsWith('idb:') && !fileURLs[k]) { const b = await dbGet('files', k); if (b) fileURLs[k] = URL.createObjectURL(b); }
  }
  let configCb = null, mediaCb = null, saveT = null;
  function pushTheme() {
    if (configCb) configCb({ mode: 'window', pauseInGames: false, theme });
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS.theme, JSON.stringify(theme)); } catch {} }, 250);
  }

  // ------------------------------------------------------------ pont avec le moteur VERSE
  window.verse = {
    getConfig: async () => { await loadThemeFile(); return { mode: 'window', pauseInGames: false, theme }; },
    onConfig: cb => { configCb = cb; },
    onMedia: cb => { mediaCb = cb; },
    onDemo: () => {},
    getLyrics: async () => (current ? lyricsFor(current) : null)
  };

  // ------------------------------------------------------------ lecture des tags MP3 (ID3v2)
  function txt(d) {
    const enc = d[0], b = d.subarray(1);
    const s = enc === 0 ? new TextDecoder('windows-1252').decode(b) : enc === 1 ? new TextDecoder('utf-16').decode(b) : enc === 2 ? new TextDecoder('utf-16be').decode(b) : new TextDecoder('utf-8').decode(b);
    return s.replace(/\u0000+/g, ' / ').replace(/(\s\/\s)+$/, '').trim();
  }
  async function readTags(file) {
    const out = {};
    try {
      const h = new Uint8Array(await file.slice(0, 10).arrayBuffer());
      if (h[0] !== 73 || h[1] !== 68 || h[2] !== 51) return out;
      const ver = h[3], size = ((h[6] & 127) << 21) | ((h[7] & 127) << 14) | ((h[8] & 127) << 7) | (h[9] & 127);
      const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 12e6)).arrayBuffer());
      const syncsafe = i => ((buf[i] & 127) << 21) | ((buf[i + 1] & 127) << 14) | ((buf[i + 2] & 127) << 7) | (buf[i + 3] & 127);
      const be32 = i => ((buf[i] << 24) >>> 0) + (buf[i + 1] << 16) + (buf[i + 2] << 8) + buf[i + 3];
      let p = 0;
      if (h[5] & 0x40) p = ver === 4 ? syncsafe(0) : be32(0) + 4;
      while (p + 10 < buf.length) {
        const id = String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const fs = ver === 4 ? syncsafe(p + 4) : be32(p + 4);
        if (fs <= 0 || p + 10 + fs > buf.length) break;
        const d = buf.subarray(p + 10, p + 10 + fs); p += 10 + fs;
        if (id === 'TIT2') out.title = txt(d);
        else if (id === 'TPE1') out.artist = txt(d);
        else if (id === 'TALB') out.album = txt(d);
        else if (id === 'APIC' && !out.cover) {
          const enc = d[0]; let i = 1; while (i < d.length && d[i] !== 0) i++;
          let mime = new TextDecoder('latin1').decode(d.subarray(1, i)) || 'image/jpeg'; if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase();
          i += 2;
          if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; i += 2; } else { while (i < d.length && d[i] !== 0) i++; i++; }
          out.cover = new Blob([d.slice(i)], { type: mime });
        }
      }
    } catch {}
    return out;
  }
  async function thumbFrom(blob, size = 320) {
    try {
      const bmp = await createImageBitmap(blob);
      const c = el('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      const s = Math.min(bmp.width, bmp.height); x.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
      return c.toDataURL('image/jpeg', .82);
    } catch { return ''; }
  }
  function fromName(name) {
    const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.\-]+/, '').trim();
    const m = base.split(/\s+[-–—]\s+/);
    return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() } : { title: base, artist: '' };
  }

  // ------------------------------------------------------------ bibliothèque
  let tracks = [];
  const sortTracks = () => tracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'fr') || (a.title || '').localeCompare(b.title || '', 'fr'));
  async function loadLibrary() { tracks = (await dbAll('tracks')).map(t => ({ ...t, file: undefined })); sortTracks(); renderLibrary(); }
  async function importFiles(files) {
    const list = [...files].filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(f.name));
    if (!list.length) { toast('Aucun fichier audio trouvé'); return; }
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
    let n = 0;
    for (const f of list) {
      toast(`Import… ${++n}/${list.length}`, 60000);
      const tags = await readTags(f), fb = fromName(f.name);
      const t = { id: uid(), title: tags.title || fb.title, artist: tags.artist || fb.artist, album: tags.album || '', thumb: tags.cover ? await thumbFrom(tags.cover) : '',
        file: f, type: f.type || 'audio/mpeg', size: f.size, added: Date.now(), lrc: null, lrcStatus: null, offset: 0, duration: 0 };
      try { await dbPut('tracks', t); } catch { toast('Plus de place sur l’iPhone pour importer'); break; }
      tracks.push({ ...t, file: undefined });
    }
    sortTracks(); renderLibrary();
    toast(`${n} musique${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} ✓`);
    if (!current && tracks.length) playIndex(0);
  }
  async function deleteTrack(id) {
    await dbDel('tracks', id); tracks = tracks.filter(t => t.id !== id);
    if (current && current.id === id) { audio.pause(); audio.removeAttribute('src'); current = null; updateNow(); }
    renderLibrary();
  }
  const patchTrack = async (id, patch) => {
    const t = await dbGet('tracks', id); if (!t) return; Object.assign(t, patch); await dbPut('tracks', t);
    const i = tracks.findIndex(x => x.id === id); if (i >= 0) Object.assign(tracks[i], patch);
    if (current && current.id === id) Object.assign(current, patch);
  };

  // ------------------------------------------------------------ paroles (LRCLIB, gratuit)
  async function lrclib(path, params) {
    const u = new URL('https://lrclib.net/api/' + path);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, String(v));
    try { const r = await fetch(u.toString(), { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }); return r.ok ? await r.json() : null; } catch { return undefined; }
  }
  const clean = s => (s || '').replace(/\s*[\(\[][^\)\]]*(remaster|version|live|edit|mix|feat|ft\.|bonus|clip|official|audio|lyrics?)[^\)\]]*[\)\]]/gi, '').trim();
  const mainArtist = s => (s || '').split(/,|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+|;|\//i)[0].trim();
  async function searchLyrics(title, artist, dur) {
    let offline = false;
    const tryGet = async p => { const r = await lrclib('get', p); if (r === undefined) offline = true; return r && r.syncedLyrics ? r : null; };
    let hit = await tryGet({ track_name: title, artist_name: artist, duration: dur ? Math.round(dur) : '' }) || await tryGet({ track_name: clean(title), artist_name: mainArtist(artist) });
    if (!hit) for (const p of [{ track_name: clean(title), artist_name: mainArtist(artist) }, { q: `${clean(title)} ${mainArtist(artist)}`.trim() }]) {
      const list = await lrclib('search', p); if (list === undefined) offline = true;
      if (Array.isArray(list)) { const s = list.filter(x => x.syncedLyrics); hit = (dur && s.find(x => Math.abs((x.duration || 0) - dur) <= 4)) || s[0] || null; if (hit) break; }
    }
    return { hit, offline };
  }
  async function lyricsFor(t) {
    if (t.lrc) return { synced: t.lrc };
    if (t.lrcStatus === 'none') return null;
    const { hit, offline } = await searchLyrics(t.title, t.artist, audio.duration || t.duration);
    if (hit) { await patchTrack(t.id, { lrc: hit.syncedLyrics, lrcStatus: 'auto' }); return { synced: hit.syncedLyrics }; }
    if (!offline) await patchTrack(t.id, { lrcStatus: 'none' });
    else toast('Pas de connexion : paroles indisponibles');
    return null;
  }

  // ------------------------------------------------------------ lecteur
  const audio = $('#audio');
  let current = null, curURL = null, order = [], pos = -1, shuffle = false, repeat = 'all', lyricsVer = 0, sentThumbFor = '';
  function buildOrder(startId) {
    order = tracks.map(t => t.id);
    if (shuffle) { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } if (startId) { order = [startId, ...order.filter(x => x !== startId)]; } }
    pos = Math.max(0, order.indexOf(startId));
  }
  async function playId(id) {
    const t = await dbGet('tracks', id); if (!t) return;
    current = t; lyricsVer++;
    if (curURL) URL.revokeObjectURL(curURL);
    curURL = URL.createObjectURL(t.file); audio.src = curURL;
    try { await audio.play(); } catch {}
    updateNow(); setMediaSession(); renderLibrary(); wake();
  }
  function playIndex(i) { buildOrder(tracks[i] && tracks[i].id); playId(order[pos]); }
  function next(auto) {
    if (!order.length) return;
    if (auto && repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    if (pos + 1 >= order.length) { if (repeat === 'off' && auto) return; pos = 0; } else pos++;
    playId(order[pos]);
  }
  function prev() { if (audio.currentTime > 3 || !order.length) { audio.currentTime = 0; return; } pos = (pos - 1 + order.length) % order.length; playId(order[pos]); }
  const toggle = () => { if (!current) { if (tracks.length) playIndex(0); else openSheet('library'); return; } audio.paused ? audio.play() : audio.pause(); };
  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('play', () => { updateNow(); wake(); });
  audio.addEventListener('pause', updateNow);
  audio.addEventListener('loadedmetadata', () => { if (current && !current.duration) patchTrack(current.id, { duration: audio.duration }); });

  function tick() {
    if (!mediaCb) return;
    if (!current || !audio.src) { mediaCb({ ok: false }); return; }
    if (!audio.duration && audio.readyState < 1) return;
    const now = Date.now();
    mediaCb({ ok: true, key: current.id + '#' + lyricsVer, title: current.title, artist: current.artist, album: current.album,
      status: audio.paused ? 'Paused' : 'Playing', positionMs: audio.currentTime * 1000 + (current.offset || 0), durationMs: (audio.duration || 0) * 1000,
      updatedAt: now, now, thumb: current.thumb || undefined });
  }
  setInterval(tick, 200);

  function setMediaSession() {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album, artwork: current.thumb ? [{ src: current.thumb, sizes: '320x320', type: 'image/jpeg' }] : [] });
    const ms = navigator.mediaSession;
    try { ms.setActionHandler('play', () => audio.play()); ms.setActionHandler('pause', () => audio.pause());
      ms.setActionHandler('previoustrack', prev); ms.setActionHandler('nexttrack', () => next(false));
      ms.setActionHandler('seekto', d => { audio.currentTime = d.seekTime; }); } catch {}
  }
  let lock = null;
  async function wake() { try { if ('wakeLock' in navigator && !audio.paused && document.visibilityState === 'visible' && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)); } } catch {} }
  document.addEventListener('visibilitychange', wake);

  // ------------------------------------------------------------ interface : contrôles
  const ui = $('#ui');
  // deux modes : 'player' (Glass Player + paroles au-dessus) et 'lyrics' (paroles plein écran)
  let mode = 'player', scrubbing = false;
  function setMode(m) { mode = m; document.body.classList.toggle('ui', m === 'player'); document.body.classList.toggle('player', m === 'player'); }
  const showUI = () => setMode('player');
  $('#tap').addEventListener('click', () => { if (!tracks.length) { openSheet('library'); return; } setMode(mode === 'player' ? 'lyrics' : 'player'); });
  $('#wheel-center').onclick = () => { if (!current) { toggle(); return; } setMode('lyrics'); };
  // molette iPod : tourner = avancer / reculer dans le morceau
  (function wheel() {
    const w = $('#wheel'); let last = null, acc = 0, bubbleT = null;
    const ang = e => { const r = w.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    w.addEventListener('pointerdown', e => { if (e.target.closest('button,#wheel-center')) return; last = ang(e); acc = 0; w.setPointerCapture(e.pointerId); w.classList.add('turning'); });
    w.addEventListener('pointermove', e => {
      if (last === null) return; let a = ang(e), d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; last = a; acc += d;
      while (Math.abs(acc) >= 14) {
        const step = Math.sign(acc); acc -= step * 14;
        if (current && audio.duration) { audio.currentTime = Math.min(audio.duration - .2, Math.max(0, audio.currentTime + step * 2.5)); }
        w.style.setProperty('--rot', ((parseFloat(w.style.getPropertyValue('--rot')) || 0) + step * 14) + 'deg');
        const b = $('#seekbubble'); b.textContent = (step > 0 ? '⏩ ' : '⏪ ') + fmtTime(audio.currentTime); b.classList.add('on'); clearTimeout(bubbleT); bubbleT = setTimeout(() => b.classList.remove('on'), 700);
        paintSeek();
      }
    });
    const end = () => { last = null; w.classList.remove('turning'); };
    w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);
  })();
  function updateNow() {
    const c = current;
    $('#np-title').textContent = c ? c.title : 'Aucune musique';
    $('#np-artist').textContent = c ? (c.artist || 'Artiste inconnu') : 'Ajoute tes MP3 pour commencer';
    const art = $('#np-art'); if (c && c.thumb) { art.src = c.thumb; art.hidden = false; } else art.hidden = true;
    $('#play').innerHTML = audio.paused ? ICON.play : ICON.pause;
    $('#shuffle').classList.toggle('on', shuffle);
    $('#repeat').classList.toggle('on', repeat !== 'off'); $('#repeat').innerHTML = repeat === 'one' ? ICON.repeat1 : ICON.repeat;
  }
  const bar = $('#seek');
  function paintSeek() {
    const d = audio.duration || 0, t = scrubbing ? +bar.value * d / 1000 : audio.currentTime;
    if (!scrubbing) bar.value = d ? audio.currentTime / d * 1000 : 0;
    bar.style.setProperty('--p', (bar.value / 10) + '%');
    $('#t-cur').textContent = fmtTime(t); $('#t-dur').textContent = d ? '-' + fmtTime(d - t) : '0:00';
  }
  setInterval(paintSeek, 250);
  bar.addEventListener('input', () => { scrubbing = true; paintSeek(); });
  bar.addEventListener('change', () => { if (audio.duration) audio.currentTime = bar.value / 1000 * audio.duration; scrubbing = false; });
  $('#play').onclick = toggle; $('#next').onclick = () => next(false); $('#prev').onclick = prev;
  $('#shuffle').onclick = () => { shuffle = !shuffle; buildOrder(current && current.id); updateNow(); toast(shuffle ? 'Aléatoire activé' : 'Aléatoire désactivé', 1200); };
  $('#repeat').onclick = () => { repeat = repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all'; updateNow(); toast({ all: 'Répéter la liste', one: 'Répéter ce titre', off: 'Pas de répétition' }[repeat], 1200); };
  $('#btn-lib').onclick = () => openSheet('library'); $('#wl-menu').onclick = () => openSheet('library');
  $('#btn-full').onclick = () => setMode('lyrics');
  $('#btn-studio').onclick = () => openSheet('studio');
  $('#btn-lyrics').onclick = () => { if (current) openSheet('lyrics'); else toast('Lance une musique d’abord'); };

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.87l12.5-7.5a1 1 0 0 0 0-1.74L8.5 3.63A1 1 0 0 0 7 4.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.5" height="16" rx="1.3"/><rect x="14" y="4" width="4.5" height="16" rx="1.3"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
    repeat1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/><path d="M11 10h1v4"/></svg>'
  };

  // ------------------------------------------------------------ feuilles (bibliothèque, paroles, studio)
  let openName = null;
  function openSheet(name) {
    openName = name;
    document.querySelectorAll('.sheet').forEach(s => s.classList.toggle('on', s.id === 'sh-' + name));
    document.body.classList.add('sheetopen');
    if (name === 'lyrics') renderLyricsSheet();
    if (name === 'studio') renderStudio();
    if (name === 'library') renderLibrary();
  }
  function closeSheet() { openName = null; document.querySelectorAll('.sheet').forEach(s => s.classList.remove('on')); document.body.classList.remove('sheetopen'); }
  document.querySelectorAll('.sheet .close, #scrim').forEach(b => (b.onclick = closeSheet));

  // bibliothèque
  let editing = false, filter = '';
  $('#lib-search').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderLibrary(); });
  $('#lib-edit').onclick = () => { editing = !editing; $('#lib-edit').textContent = editing ? 'OK' : 'Modifier'; renderLibrary(); };
  $('#lib-file').addEventListener('change', e => { importFiles(e.target.files); e.target.value = ''; });
  function renderLibrary() {
    const box = $('#lib-list'); if (!box) return; box.innerHTML = '';
    $('#lib-count').textContent = tracks.length ? `${tracks.length} titre${tracks.length > 1 ? 's' : ''}` : '';
    const list = tracks.filter(t => !filter || (t.title + ' ' + t.artist + ' ' + t.album).toLowerCase().includes(filter));
    if (!tracks.length) {
      const e = el('div', 'empty');
      e.innerHTML = '<b>Ta bibliothèque est vide</b><span>Touche « Ajouter des musiques » et choisis tes MP3 dans l’app Fichiers. Ils restent sur ton iPhone, rien n’est envoyé nulle part.</span>';
      box.appendChild(e); return;
    }
    for (const t of list) {
      const r = el('div', 'track' + (current && current.id === t.id ? ' playing' : ''));
      const img = el('div', 'tart'); if (t.thumb) img.style.backgroundImage = `url("${t.thumb}")`; else img.textContent = '♪';
      const meta = el('div', 'tmeta'); meta.append(el('div', 'tt', t.title), el('div', 'ta', [t.artist, t.album].filter(Boolean).join(' · ') || 'Artiste inconnu'));
      const badge = el('div', 'tbadge', t.lrcStatus === 'none' ? '—' : t.lrc ? '♪' : '');
      badge.title = t.lrc ? 'Paroles trouvées' : t.lrcStatus === 'none' ? 'Pas de paroles' : '';
      r.append(img, meta, badge);
      if (editing) { const x = el('button', 'tdel', 'Supprimer'); x.onclick = e => { e.stopPropagation(); deleteTrack(t.id); }; r.appendChild(x); }
      else r.onclick = () => { playIndex(tracks.indexOf(t)); closeSheet(); };
      box.appendChild(r);
    }
  }

  // paroles du titre en cours
  function renderLyricsSheet() {
    const b = $('#ly-body'); b.innerHTML = ''; const t = current; if (!t) return;
    const status = el('div', 'lystatus ' + (t.lrc ? 'ok' : 'ko'), t.lrc ? (t.lrcStatus === 'manual' ? '✓ Paroles ajoutées par toi' : '✓ Paroles synchronisées trouvées') : t.lrcStatus === 'none' ? 'Aucune parole trouvée automatiquement' : 'Recherche en cours…');
    b.appendChild(status);
    const f1 = el('input'); f1.type = 'text'; f1.value = t.title; f1.placeholder = 'Titre';
    const f2 = el('input'); f2.type = 'text'; f2.value = t.artist; f2.placeholder = 'Artiste';
    const save = el('button', 'btn', 'Renommer');
    save.onclick = async () => { await patchTrack(t.id, { title: f1.value.trim() || t.title, artist: f2.value.trim() }); updateNow(); renderLibrary(); setMediaSession(); toast('Titre mis à jour', 1200); };
    b.append(el('div', 'lab', 'Titre et artiste (corrige-les si la recherche échoue)'), f1, f2, save);
    const sb = el('button', 'btn primary', 'Rechercher les paroles'); const res = el('div', 'results');
    sb.onclick = async () => {
      res.innerHTML = '<div class="muted">Recherche…</div>';
      const list = await lrclib('search', { q: `${clean(f1.value)} ${mainArtist(f2.value)}`.trim() });
      res.innerHTML = '';
      if (list === undefined) { res.innerHTML = '<div class="muted">Pas de connexion à la base de paroles.</div>'; return; }
      const s = (list || []).filter(x => x.syncedLyrics).slice(0, 12);
      if (!s.length) { res.innerHTML = '<div class="muted">Rien trouvé. Essaie un autre titre, ou importe un fichier .lrc.</div>'; return; }
      s.forEach(x => {
        const r = el('div', 'result'); r.append(el('b', '', x.trackName), el('span', '', `${x.artistName}${x.albumName ? ' · ' + x.albumName : ''} · ${fmtTime(x.duration)}`));
        r.onclick = async () => { await patchTrack(t.id, { lrc: x.syncedLyrics, lrcStatus: 'manual' }); lyricsVer++; renderLyricsSheet(); renderLibrary(); toast('Paroles appliquées ✓', 1400); };
        res.appendChild(r);
      });
    };
    b.append(sb, res);
    b.appendChild(el('div', 'lab', 'Ou ajoute tes propres paroles synchronisées (.lrc)'));
    const fileBtn = el('label', 'btn'); fileBtn.textContent = 'Importer un fichier .lrc';
    const fi = el('input'); fi.type = 'file'; fi.accept = '.lrc,text/plain'; fi.hidden = true; fileBtn.appendChild(fi);
    fi.onchange = async () => { const f = fi.files[0]; if (!f || f.size > 512e3) return; const s = await f.text(); if (!/\[\d+:\d+/.test(s)) { toast('Ce fichier n’a pas de minutage [mm:ss]'); return; } await patchTrack(t.id, { lrc: s, lrcStatus: 'manual' }); lyricsVer++; renderLyricsSheet(); toast('Paroles importées ✓', 1400); };
    b.appendChild(fileBtn);
    const offWrap = el('div', 'field'); const lab = el('div', 'lab'); const val = el('span', 'val');
    const r = el('input'); r.type = 'range'; r.min = -3000; r.max = 3000; r.step = 50; r.value = t.offset || 0;
    const paint = () => { val.textContent = (r.value > 0 ? '+' : '') + (r.value / 1000).toFixed(2).replace('.', ',') + ' s'; r.style.setProperty('--p', ((+r.value + 3000) / 60) + '%'); }; paint();
    r.oninput = () => { paint(); current.offset = +r.value; }; r.onchange = () => patchTrack(t.id, { offset: +r.value });
    lab.append(el('span', '', 'Décalage pour ce titre (+ = paroles plus tôt)'), val); offWrap.append(lab, r); b.appendChild(offWrap);
    if (t.lrc) { const rm = el('button', 'btn danger', 'Retirer les paroles de ce titre'); rm.onclick = async () => { await patchTrack(t.id, { lrc: null, lrcStatus: 'none' }); lyricsVer++; renderLyricsSheet(); renderLibrary(); }; b.appendChild(rm); }
  }

  // ------------------------------------------------------------ studio mobile (personnalisation complète)
  let adv = localStorage.getItem(LS.adv) === '1' || theme.advanced.enabled, openSec = 'themes';
  const hist = [];
  function setTheme(t) { hist.push(JSON.stringify(theme)); if (hist.length > 50) hist.shift(); theme = VT.sanitize(t, VT.DEFAULT); loadThemeFile().then(pushTheme); renderStudio(); }
  function change(k, v, rerender) { if (rerender !== 'live') { hist.push(JSON.stringify(theme)); if (hist.length > 50) hist.shift(); } VT.set(theme, k, v); pushTheme(); if (rerender === true) renderStudio(); }
  const hsl = (h, s, l) => { h = ((h % 1) + 1) % 1; const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function randomTheme() {
    const r = Math.random, h = r(), t = VT.clone(theme);
    const hues = pick([[h, h + .07, h - .07, h + .14], [h, h + .5, h + .04, h + .54], [h, h + .333, h + .666, h + .05], [h, h + .42, h + .58, h + .03]]);
    Object.assign(t.colors, { source: r() < .2 ? 'mixed' : 'custom', accents: hues.map((x, i) => hsl(x, .75 + r() * .2, i === 3 ? .85 : .55 + r() * .12)), text: hsl(h, .25, .9), base: hsl(h + .5, .35, .045), blobs: hues.slice(0, 3).flatMap(x => [hsl(x, .6, .22), hsl(x + .04, .5, .12)]) });
    const fonts = VT.FONTS.filter(f => f.id !== '__custom');
    Object.assign(t.type, { font: pick(fonts).id, font2: pick(fonts).id, case: pick(['none', 'none', 'upper', 'lower']), italic: r() < .15, outline: r() < .1, glow: r() < .25 ? Math.round(30 + r() * 60) : 0, boxChance: Math.round(r() * 35), condChance: Math.round(r() * 35) });
    Object.assign(t.motion, { amplitude: +(0.5 + r() * 1.3).toFixed(2), bounce: +(r() * 2).toFixed(2), speed: +(0.75 + r() * .6).toFixed(2), decor: Math.round(r() * 70), shake: r() < .6, flash: r() < .7 });
    for (const k in t.motion.styles) t.motion.styles[k] = r() < .7;
    Object.assign(t.background, { type: t.background.type === 'blobs' || t.background.type === 'solid' ? 'blobs' : t.background.type, speed: +(0.4 + r() * 2).toFixed(1), grain: Math.round(r() * 20), vignette: Math.round(30 + r() * 50), saturation: Math.round(90 + r() * 90), blobOpacity: Math.round(35 + r() * 35) });
    t.name = 'Aléatoire'; return t;
  }
  function fmt(f, v) { const d = f.step && f.step < 1 ? (f.step < .1 ? 2 : 1) : 0; return (+v).toFixed(d).replace('.', ',') + (f.unit || ''); }
  function field(f) {
    const w = el('div', 'field' + (f.adv ? ' adv' : '')), v = VT.get(theme, f.k);
    const lab = el('div', 'lab'); lab.appendChild(el('span', '', f.label));
    if (f.type !== 'toggle') w.appendChild(lab);
    if (f.type === 'range') {
      const val = el('span', 'val', fmt(f, v)); lab.appendChild(val);
      const r = el('input'); r.type = 'range'; r.min = f.min; r.max = f.max; r.step = f.step || 1; r.value = v;
      const paint = () => r.style.setProperty('--p', ((r.value - f.min) / (f.max - f.min) * 100) + '%'); paint();
      let first = true; r.oninput = () => { paint(); val.textContent = fmt(f, r.value); change(f.k, +r.value, first ? false : 'live'); first = false; }; r.onchange = () => (first = true);
      val.onclick = () => { const d = VT.get(VT.DEFAULT, f.k); change(f.k, d); r.value = d; paint(); val.textContent = fmt(f, d); };
      w.appendChild(r);
    } else if (f.type === 'select') {
      const s = el('select'); f.options.forEach(([id, l]) => { const o = el('option', '', l); o.value = id; s.appendChild(o); }); s.value = v; s.onchange = () => change(f.k, s.value, true); w.appendChild(s);
    } else if (f.type === 'toggle') {
      const l = el('label', 'toggle'); const c = el('input'); c.type = 'checkbox'; c.checked = v; l.append(el('span', 't', f.label), c, el('span', 'sw')); c.onchange = () => change(f.k, c.checked, true); w.appendChild(l);
    } else if (f.type === 'color') {
      const c = el('input'); c.type = 'color'; c.value = v; c.className = 'colorbig'; c.oninput = () => change(f.k, c.value, 'live'); c.onchange = () => change(f.k, c.value); w.appendChild(c);
    } else if (f.type === 'colors') {
      const box = el('div', 'swatches');
      v.forEach((col, i) => {
        const it = el('div', 'sw-item'); const c = el('input'); c.type = 'color'; c.value = col;
        c.oninput = () => { const a = [...VT.get(theme, f.k)]; a[i] = c.value; change(f.k, a, 'live'); };
        it.appendChild(c);
        if (v.length > (f.min || 1)) { const x = el('button', 'x', '✕'); x.onclick = () => { const a = [...VT.get(theme, f.k)]; a.splice(i, 1); change(f.k, a, true); }; it.appendChild(x); }
        box.appendChild(it);
      });
      if (v.length < (f.max || 8)) { const add = el('button', 'addsw', '+'); add.onclick = () => { const a = [...VT.get(theme, f.k)]; a.push(hsl(Math.random(), .8, .6)); change(f.k, a, true); }; box.appendChild(add); }
      w.appendChild(box);
    } else if (f.type === 'checks') {
      const box = el('div', 'pills');
      f.options.forEach(([id, l]) => { const p = el('button', 'pill' + (v[id] ? ' on' : ''), l); p.onclick = () => { const o = { ...VT.get(theme, f.k) }; o[id] = !o[id]; if (f.k === 'motion.styles' && !Object.values(o).some(Boolean)) return; change(f.k, o, true); }; box.appendChild(p); });
      w.appendChild(box);
    } else if (f.type === 'font') {
      const box = el('div', 'fonts');
      VT.FONTS.filter(fo => fo.id !== '__custom').forEach(fo => {
        const c = el('button', 'fontcard' + (v === fo.id ? ' on' : '')); const s = el('div', 's', 'Paroles'); s.style.fontFamily = `'${fo.id}'`; s.style.fontWeight = fo.w;
        c.append(s, el('div', 'n', fo.id)); c.onclick = () => change(f.k, fo.id, true); box.appendChild(c);
      });
      w.appendChild(box);
    } else if (f.type === 'text' || f.type === 'fontname') {
      const i = el('input'); i.type = 'text'; i.value = v; i.maxLength = f.max || 60; i.oninput = () => change(f.k, i.value, 'live'); i.onchange = () => change(f.k, i.value); w.appendChild(i);
    } else if (f.type === 'code') {
      const t = el('textarea'); t.value = v; t.spellcheck = false; t.autocapitalize = 'off'; t.placeholder = '.w { text-decoration: underline; }'; t.oninput = () => change(f.k, t.value, 'live'); w.appendChild(t);
    } else if (f.type === 'file') {
      const lb = el('label', 'btn'); lb.textContent = v ? 'Changer le fichier' : 'Choisir dans Photos / Fichiers';
      const fi = el('input'); fi.type = 'file'; fi.hidden = true; fi.accept = theme.background.type === 'video' ? 'video/*' : 'image/*'; lb.appendChild(fi);
      fi.onchange = async () => {
        const file = fi.files[0]; if (!file) return;
        if (file.size > 300e6) { toast('Fichier trop lourd (300 Mo max)'); return; }
        const old = theme.background.file, key = 'idb:bg-' + Math.random().toString(36).slice(2, 10);
        await dbPut('files', file, key); fileURLs[key] = URL.createObjectURL(file);
        if (old && old.startsWith('idb:') && !Object.values(saved).some(s => s.background && s.background.file === old)) { dbDel('files', old); }
        change(f.k, key, true);
      };
      w.appendChild(lb);
    }
    return w;
  }
  function themeChip(name, t, isSaved) {
    const c = el('button', 'tchip' + (theme.name === name ? ' on' : ''));
    const C = t.colors; c.style.background = `radial-gradient(circle at 25% 30%, ${C.blobs[0]}, transparent 65%), ${C.base}`;
    const n = el('span', 'tn', name); n.style.fontFamily = `'${t.type.font}'`; n.style.color = C.accents[0]; if (t.type.italic) n.style.fontStyle = 'italic';
    const dots = el('span', 'dots'); C.accents.slice(0, 5).forEach(a => { const i = el('i'); i.style.background = a; dots.appendChild(i); });
    c.append(n, dots);
    c.onclick = () => { const nt = VT.clone(t); nt.name = name; if (!nt.idle.text || nt.idle.text === VT.DEFAULT.idle.text) nt.idle.text = MOBILE_IDLE; setTheme(nt); };
    if (isSaved) { const x = el('span', 'del', '✕'); x.onclick = e => { e.stopPropagation(); delete saved[name]; localStorage.setItem(LS.saved, JSON.stringify(saved)); renderStudio(); }; c.appendChild(x); }
    return c;
  }
  function renderStudio() {
    const box = $('#st-body'); const sc = box.scrollTop; box.innerHTML = '';
    $('#st-adv').checked = adv;
    const sections = [{ id: 'themes', title: 'Thèmes', icon: '★' }].concat(VT.SCHEMA.filter(s => !s.advOnly || adv).map(s => ({ id: s.id, title: s.title, icon: s.icon, sec: s })));
    for (const s of sections) {
      const sec = el('div', 'acc' + (openSec === s.id ? ' open' : ''));
      const head = el('button', 'acchead'); head.append(el('i', '', s.icon), el('span', '', s.title), el('b', '', openSec === s.id ? '−' : '+'));
      head.onclick = () => { openSec = openSec === s.id ? null : s.id; renderStudio(); };
      sec.appendChild(head);
      if (openSec === s.id) {
        const body = el('div', 'accbody');
        if (s.id === 'themes') {
          const row = el('div', 'row');
          const rnd = el('button', 'btn primary', '🎲 Aléatoire'); rnd.onclick = () => setTheme(randomTheme());
          const un = el('button', 'btn', '↶ Annuler'); un.onclick = () => { if (!hist.length) return; theme = JSON.parse(hist.pop()); loadThemeFile().then(pushTheme); renderStudio(); };
          row.append(rnd, un); body.appendChild(row);
          body.appendChild(el('div', 'sub', 'Thèmes prêts'));
          const g = el('div', 'tgrid'); Object.keys(VT.PRESETS).forEach(n => g.appendChild(themeChip(n, VT.preset(n), false))); body.appendChild(g);
          body.appendChild(el('div', 'sub', 'Mes thèmes'));
          const names = Object.keys(saved);
          if (!names.length) body.appendChild(el('div', 'muted', 'Règle tout comme tu veux, puis enregistre-le ici.'));
          else { const g2 = el('div', 'tgrid'); names.forEach(n => g2.appendChild(themeChip(n, VT.sanitize(saved[n], VT.DEFAULT), true))); body.appendChild(g2); }
          const r2 = el('div', 'row'); const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Nom du thème'; inp.maxLength = 40;
          const sv = el('button', 'btn primary', 'Enregistrer'); sv.style.flex = 'none';
          sv.onclick = () => { const n = inp.value.trim(); if (!n) { inp.focus(); return; } theme.name = n; saved[n] = VT.clone(theme); localStorage.setItem(LS.saved, JSON.stringify(saved)); pushTheme(); renderStudio(); toast('Thème enregistré ✓', 1300); };
          r2.append(inp, sv); body.appendChild(r2);
          const r3 = el('div', 'row');
          const ex = el('button', 'btn', 'Exporter'); ex.onclick = () => { const th = VT.clone(theme); th.background.file = ''; const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ verse: 1, theme: th }, null, 2)], { type: 'application/json' })); a.download = (th.name || 'theme').replace(/[^\w\- ]+/g, '') + '.verse.json'; document.body.appendChild(a); a.click(); a.remove(); };
          const im = el('label', 'btn'); im.textContent = 'Importer'; const fi = el('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.hidden = true; im.appendChild(fi);
          fi.onchange = async () => { const f = fi.files[0]; if (!f || f.size > 1e6) return; try { const d = JSON.parse(await f.text()); setTheme(d && d.theme ? d.theme : d); toast('Thème importé ✓', 1300); } catch { toast('Fichier de thème invalide'); } };
          r3.append(ex, im); body.appendChild(r3);
          body.appendChild(el('p', 'muted', 'Les thèmes sont compatibles avec VERSE sur PC : exporte d’un côté, importe de l’autre.'));
        } else {
          s.sec.fields.filter(f => (!f.adv || adv) && (!f.when || f.when(theme)) && f.type !== 'fontname' && !(f.type === 'font' && false)).forEach(f => body.appendChild(field(f)));
          if (!adv && s.sec.fields.some(f => f.adv)) body.appendChild(el('div', 'muted', `+ ${s.sec.fields.filter(f => f.adv).length} réglages fins en mode sur-mesure`));
        }
        sec.appendChild(body);
      }
      box.appendChild(sec);
    }
    box.scrollTop = sc;
  }
  $('#st-adv').onchange = e => { adv = e.target.checked; localStorage.setItem(LS.adv, adv ? '1' : '0'); change('advanced.enabled', adv, true); };

  // ------------------------------------------------------------ démarrage
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && /iPhone|iPad/.test(navigator.userAgent) && !localStorage.getItem('verse.a2hs')) {
    setTimeout(() => { $('#a2hs').classList.add('on'); }, 1500);
    $('#a2hs button').onclick = () => { $('#a2hs').classList.remove('on'); localStorage.setItem('verse.a2hs', '1'); };
  }
  setMode('player');
  updateNow();
  loadLibrary().catch(() => toast('Stockage indisponible (navigation privée ?)'));
})();
