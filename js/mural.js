// GOLIRA - aba MURAL (v5)
// Recados da matilha (mesma tag de grupo), somem em 24h e "envelhecem" no visual:
// bordô neon suave -> bege escuro com borda de areia esfarelando.
// Recado macaquista: só o ADM escreve, todo mundo lê, não expira.
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;
  const ic = G.icon;
  const $ = (s, r) => (r || document).querySelector(s);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX = 280;
  const MAX_REC = 500;
  const EMOJIS = ['👍🏽', '🍪', '🔥', '💪', '🍅'];
  const POLL_MS = 25000;

  const isMissing = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || ''));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // cor do recado: bordô neon suave (novo) -> bege escuro (velho)
  const C_NEW = [152, 30, 54];
  const C_OLD = [112, 94, 72];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')';

  const BUCKET = 'mural';
  const CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  let fotosOk = true;     // false se o schema-v7-fotos.sql ainda não foi rodado
  let pend = null;        // foto escolhida pra postar  { blob, url }
  let pendRec = null;     // foto escolhida pro recado macaquista
  let limpou = false;     // faxina de fotos velhas (1x por abertura do app)
  const urlCache = new Map(); // caminho -> { url, t }

  let state = null;       // { posts, reacts, rec }
  let timer = null;
  let tickTimer = null;

  // ------------------------------------------------------------------
  // Tempo
  // ------------------------------------------------------------------
  function ageOf(p) { return clamp((Date.now() - new Date(p.created_at).getTime()) / DAY_MS, 0, 1); }

  function ago(iso) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    const h = Math.floor(m / 60);
    return 'há ' + h + 'h';
  }

  function leftLabel(iso) {
    const ms = new Date(iso).getTime() + DAY_MS - Date.now();
    if (ms <= 0) return 'some já já';
    const m = Math.ceil(ms / 60000);
    if (m < 60) return 'some em ' + m + ' min';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return 'some em ' + h + 'h' + (r ? ' ' + String(r).padStart(2, '0') + 'min' : '');
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function dateLabel(iso) {
    const d = new Date(iso);
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    const sb = G.sb;
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const qp = (cols) => sb.from('mural_posts').select(cols).gt('created_at', since).order('created_at', { ascending: false }).limit(60);
    const qa = (cols) => sb.from('admin_announcements').select(cols).order('created_at', { ascending: false }).limit(1);
    const C1 = 'id, author_id, author_name, content, created_at', C2 = 'id, content, created_at';
    let [pr, rr, mr] = await Promise.all([
      qp(fotosOk ? C1 + ', image_path' : C1),
      qa(fotosOk ? C2 + ', image_path' : C2),
      Promise.resolve(sb.rpc('group_members')).catch(() => ({ data: [] })),
    ]);
    if (fotosOk && ((pr.error && /image_path/.test(pr.error.message || '')) || (rr.error && /image_path/.test(rr.error.message || '')))) {
      fotosOk = false;
      [pr, rr] = await Promise.all([qp(C1), qa(C2)]);
    }
    const members = (mr && !mr.error && mr.data) ? mr.data : [];
    if (isMissing(pr.error) || isMissing(rr.error)) return { missing: true };
    if (pr.error) return { error: pr.error.message };
    const posts = pr.data || [];
    const rec = (rr.data && rr.data[0]) || null;
    let reacts = [];
    if (posts.length) {
      const re = await sb.from('mural_reactions').select('post_id, user_id, emoji').in('post_id', posts.map((p) => p.id)).limit(3000);
      if (!re.error) reacts = re.data || [];
    }
    if (fotosOk) await signed(posts.map((x) => x.image_path).concat([rec && rec.image_path]).filter(Boolean));
    return { posts, reacts, rec, members };
  }

  // ------------------------------------------------------------------
  // Fotos
  // ------------------------------------------------------------------
  async function signed(paths) {
    const need = paths.filter((x) => !urlCache.has(x) || Date.now() - urlCache.get(x).t > 45 * 60000);
    if (!need.length) return;
    try {
      const r = await G.sb.storage.from(BUCKET).createSignedUrls(need, 3600);
      (r.data || []).forEach((x) => { if (x.signedUrl) urlCache.set(x.path, { url: x.signedUrl, t: Date.now() }); });
    } catch (e) { /* sem foto, segue o texto */ }
  }
  const urlOf = (x) => (urlCache.get(x) || {}).url || '';
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  // Foto -> JPEG leve (lado maior 1080 px, até ~350 KB)
  async function fotoBlob(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((ok, no) => {
        const img = new Image(); const u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => no(new Error('img')); img.src = u;
      });
    }
    let scale = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
    let blob = null;
    for (let i = 0; i < 4; i++) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(bmp.width * scale));
      cv.height = Math.max(1, Math.round(bmp.height * scale));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', i === 0 ? 0.82 : 0.65));
      if (blob && blob.size <= 350000) break;
      scale *= 0.8;
    }
    if (!blob) throw new Error('blob');
    return { blob, url: URL.createObjectURL(blob) };
  }

  async function upload(prefix, ph) {
    const path = prefix + '/' + newId() + '.jpg';
    const r = await G.sb.storage.from(BUCKET).upload(path, ph.blob, { contentType: 'image/jpeg' });
    if (r.error) throw new Error(r.error.message);
    return path;
  }
  function apagarFoto(path) {
    if (!path) return;
    try { Promise.resolve(G.sb.storage.from(BUCKET).remove([path])).catch(() => {}); } catch (e) { /* ok */ }
  }

  // Faxina: foto de recado que já sumiu (mais de 24h) sai do espaço de fotos
  async function limparFotos() {
    if (limpou || !fotosOk || !G.profile || !G.profile.group_id) return;
    limpou = true;
    try {
      const gid = G.profile.group_id;
      const r = await G.sb.storage.from(BUCKET).list(gid, { limit: 100 });
      const vivos = new Set(state.posts.map((x) => x.image_path).filter(Boolean));
      const velhos = (r.data || []).filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > DAY_MS + 5 * 60000 && !vivos.has(gid + '/' + f.name)).map((f) => gid + '/' + f.name);
      if (velhos.length) await G.sb.storage.from(BUCKET).remove(velhos);
    } catch (e) { /* silencioso */ }
  }

  function prevHtml(ph, idc) {
    return ph ? '<div class="mc-prev"><img src="' + ph.url + '" alt=""><button type="button" class="mc-prev-x" data-prevx="' + idc + '" aria-label="Tirar foto">' + ic('x') + '</button></div>' : '';
  }
  function zoom(path) {
    const u = urlOf(path), root = document.getElementById('modalRoot');
    if (!u || !root) return;
    root.innerHTML = '<div class="modal-overlay lightbox" id="lbOv"><img src="' + u + '" alt=""></div>';
    document.getElementById('lbOv').onclick = () => { root.innerHTML = ''; };
  }

  function memberOf(id) { return (state.members || []).find((m) => m.id === id) || null; }

  // sequência mostrada: se o último registro é anterior a ontem, a sequência já quebrou
  function streakOf(m) {
    if (!m || !m.streak_day) return 0;
    const ontem = G.hojeISO(new Date(Date.now() - DAY_MS));
    return m.streak_day >= ontem ? (m.streak_days || 0) : 0;
  }

  function stripHtml() {
    const ms = state.members || [];
    if (ms.length < 2) return '';
    return '<div class="matilha-strip" role="list">' + ms.map((m) => {
      const n = streakOf(m);
      return '<button class="ms-item' + (n > 0 ? ' on' : '') + '" role="listitem" data-prof="' + m.id + '">' +
        G.avatarHtml(m.avatar, m.display_name, 'ms-av') +
        '<span class="ms-name">' + esc(m.display_name) + '</span>' +
        '<span class="ms-n">' + n + (n === 1 ? ' dia' : ' dias') + '</span></button>';
    }).join('') + '</div>';
  }

  function profileCard(id) {
    const m = memberOf(id);
    if (!m) return;
    const n = streakOf(m);
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.innerHTML = '<div class="modal-overlay" id="profOv"><div class="modal-card prof-card">' +
      '<button class="modal-close prof-x" type="button" id="profX" aria-label="Fechar">✕</button>' +
      G.avatarHtml(m.avatar, m.display_name, 'av-xl') +
      '<div class="prof-name">' + esc(m.display_name) + '</div>' +
      '<div class="prof-streak' + (n > 0 ? ' on' : '') + '"><strong>' + n + '</strong><span>' + (n === 1 ? 'dia seguido' : 'dias seguidos') + '</span></div>' +
      '</div></div>';
    const close = () => { root.innerHTML = ''; };
    document.getElementById('profX').onclick = close;
    document.getElementById('profOv').onclick = (e) => { if (e.target.id === 'profOv') close(); };
  }

  function reactionsOf(postId) {
    const me = G.session && G.session.user ? G.session.user.id : null;
    return EMOJIS.map((e) => {
      const list = state.reacts.filter((r) => r.post_id === postId && r.emoji === e);
      return { e, n: list.length, mine: list.some((r) => r.user_id === me) };
    });
  }

  // ------------------------------------------------------------------
  // Visual
  // ------------------------------------------------------------------
  // 4 intensidades de borda esfarelada (SVG filter com ruído + deslocamento)
  const FILTERS =
    '<svg class="mural-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    [[0, 0, 0.9, 1.5], [1, 0.0, 0.8, 3.5], [2, 0.0, 0.7, 6.5], [3, 0.0, 0.6, 10]].map((f) =>
      '<filter id="sand' + f[0] + '" x="-6%" y="-10%" width="112%" height="120%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="' + (0.55 - f[0] * 0.07).toFixed(2) + '" numOctaves="2" seed="' + (3 + f[0]) + '" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + f[3] + '" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>').join('') +
    '</defs></svg>';

  function postStyle(p) {
    const a = ageOf(p);
    const t = Math.pow(a, 0.8);
    const c = mix(C_NEW, C_OLD, t);
    const dark = mix([40, 8, 14], [48, 40, 30], t);
    const edge = mix([209, 43, 69], [186, 160, 124], t);
    return '--age:' + a.toFixed(3) +
      ';--pc:' + rgb(c) + ';--pc2:' + rgb(dark) +
      ';--pe:' + rgb(edge, 0.85 - 0.25 * a) +
      ';--pg:' + rgb(mix([209, 43, 69], [150, 120, 90], t), 0.28 * (1 - a)) +
      ';--grain:' + (0.08 + 0.42 * a).toFixed(2);
  }

  function bucket(a) { return a < 0.25 ? 0 : a < 0.5 ? 1 : a < 0.8 ? 2 : 3; }

  function initial(name) { return esc((String(name || '?').trim()[0] || '?').toUpperCase()); }

  function postHtml(p) {
    const me = G.session && G.session.user ? G.session.user.id : null;
    const a = ageOf(p);
    const rx = reactionsOf(p.id).map((r) =>
      '<button class="mp-react' + (r.mine ? ' mine' : '') + '" data-react="' + p.id + '" data-emoji="' + r.e + '" aria-pressed="' + (r.mine ? 'true' : 'false') + '">' +
        '<span>' + r.e + '</span>' + (r.n ? '<b>' + r.n + '</b>' : '') +
      '</button>').join('');
    return '<article class="mural-post b' + bucket(a) + '" data-id="' + p.id + '" style="' + postStyle(p) + '">' +
      '<div class="mp-bg" style="filter:url(#sand' + bucket(a) + ')"></div>' +
      '<div class="mp-in">' +
        '<div class="mp-head">' +
          (memberOf(p.author_id)
            ? '<button class="mp-avb" data-prof="' + p.author_id + '" aria-label="Ver perfil">' + G.avatarHtml(memberOf(p.author_id).avatar, p.author_name, 'mp-av') + '</button>'
            : G.avatarHtml(null, p.author_name, 'mp-av')) +
          '<div class="mp-who"><strong>' + esc(p.author_name || 'Gorila') + '</strong><span>' + ago(p.created_at) + ' · ' + leftLabel(p.created_at) + '</span></div>' +
          (p.author_id === me ? '<button class="mp-del" data-del="' + p.id + '" aria-label="Apagar recado">' + ic('x') + '</button>' : '') +
        '</div>' +
        (p.content ? '<p class="mp-text">' + esc(p.content) + '</p>' : '') +
        (p.image_path && urlOf(p.image_path) ? '<button class="mp-photo" data-zoom="' + esc(p.image_path) + '" aria-label="Ver foto"><img src="' + esc(urlOf(p.image_path)) + '" alt="" loading="lazy"></button>' : '') +
        '<div class="mp-reacts">' + rx + '</div>' +
      '</div>' +
    '</article>';
  }

  function recadoHtml() {
    const r = state.rec;
    const isAdmin = !!(G.profile && G.profile.is_admin);
    if (!r && !isAdmin) return '';
    let h = '<section class="recado-adm card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">RECADO MACAQUISTA</span><span class="card-tag">ADM</span></div>';
    if (r) {
      h += (r.content ? '<p class="rec-text">' + esc(r.content) + '</p>' : '') +
        (r.image_path && urlOf(r.image_path) ? '<button class="mp-photo rec-photo" data-zoom="' + esc(r.image_path) + '" aria-label="Ver foto"><img src="' + esc(urlOf(r.image_path)) + '" alt=""></button>' : '') +
        '<div class="rec-foot"><span class="muted">' + dateLabel(r.created_at) + '</span>' +
        (isAdmin ? '<button class="btn-link danger" id="recDel" data-id="' + r.id + '">Apagar recado</button>' : '') + '</div>';
    } else {
      h += '<p class="muted">Nenhum recado fixado ainda.</p>';
    }
    if (isAdmin) {
      h += '<details class="rec-new"><summary>' + (r ? 'Publicar novo recado' : 'Escrever recado') + '</summary>' +
        '<textarea id="recTxt" maxlength="' + MAX_REC + '" rows="2" placeholder="Recado pra matilha toda (não expira)"></textarea>' +
        '<div id="recPrev">' + prevHtml(pendRec, 'rec') + '</div>' +
        '<div class="mc-row"><span class="muted" id="recCnt">0/' + MAX_REC + '</span><span class="mc-btns">' +
          (fotosOk ? '<button type="button" class="btn-ghost btn-small mc-photo" id="recPhoto">' + CAM + 'Foto</button><input type="file" accept="image/*" id="recFile" class="hidden">' : '') +
          '<button class="btn-action btn-small" id="recSend">Publicar</button></span></div>' +
        '<p class="error" id="recErr"></p></details>';
    }
    return h + '</section>';
  }

  function listHtml() {
    if (!state.posts.length) {
      return '<div class="card-box mural-empty"><p class="muted">Mural vazio. Quebra o gelo e solta o primeiro recado da matilha.</p></div>';
    }
    return state.posts.map(postHtml).join('');
  }

  function shell() {
    const tag = G.groupTag;
    return FILTERS +
      '<div id="muralRec">' + recadoHtml() + '</div>' +
      stripHtml() +
      '<div class="card-box mural-compose">' +
        '<div class="card-header-flex"><span class="card-title-text">Mural da Matilha</span><span class="card-tag">' + esc(tag) + '</span></div>' +
        '<textarea id="mpTxt" maxlength="' + MAX + '" rows="2" placeholder="Solta um recado pra matilha… (some em 24h)"></textarea>' +
        '<div id="mpPrev"></div>' +
        '<div class="mc-row"><span class="muted" id="mpCnt">0/' + MAX + '</span><span class="mc-btns">' +
          (fotosOk ? '<button type="button" class="btn-ghost btn-small mc-photo" id="mpPhoto">' + CAM + 'Foto</button><input type="file" accept="image/*" id="mpFile" class="hidden">' : '') +
          '<button class="btn-action btn-small" id="mpSend" disabled>Postar</button></span></div>' +
        '<p class="error" id="mpErr"></p>' +
      '</div>' +
      '<div id="muralList" class="mural-list">' + listHtml() + '</div>';
  }

  function redrawList() {
    const l = $('#muralList');
    if (l) l.innerHTML = listHtml();
  }
  function redrawRec() {
    const r = $('#muralRec');
    if (!r) return;
    // não perde o que o ADM está digitando
    const open = r.querySelector('details[open]');
    const txt = r.querySelector('#recTxt');
    const keep = txt ? txt.value : '';
    r.innerHTML = recadoHtml();
    if (keep || open) {
      const d = r.querySelector('details');
      const t = r.querySelector('#recTxt');
      if (d && open) d.open = true;
      if (t) { t.value = keep; const c = r.querySelector('#recCnt'); if (c) c.textContent = keep.length + '/' + MAX_REC; }
    }
  }

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  async function refresh() {
    if (G.route !== 'mural') return;
    const d = await load();
    if (G.route !== 'mural' || !d || d.missing || d.error) return;
    state = d;
    redrawList();
    redrawRec();
  }

  async function send() {
    const ta = $('#mpTxt'), btn = $('#mpSend'), err = $('#mpErr');
    const txt = ta.value.trim();
    if (!txt && !pend) return;
    btn.disabled = true; err.textContent = '';
    let path = null;
    if (pend) {
      try { path = await upload(G.profile.group_id, pend); }
      catch (e) { err.textContent = 'Não consegui enviar a foto: ' + e.message; btn.disabled = false; return; }
    }
    const body = { content: txt };
    if (path) body.image_path = path;
    const r = await G.sb.from('mural_posts').insert(body).select(path ? 'id, author_id, author_name, content, created_at, image_path' : 'id, author_id, author_name, content, created_at').single();
    if (r.error) {
      apagarFoto(path);
      err.textContent = 'Não consegui postar: ' + r.error.message;
      btn.disabled = false;
      return;
    }
    if (path) await signed([path]);
    ta.value = '';
    pend = null; $('#mpPrev').innerHTML = '';
    $('#mpCnt').textContent = '0/' + MAX;
    state.posts.unshift(r.data);
    redrawList();
    const first = $('#muralList .mural-post');
    if (first) first.classList.add('fresh');
    G.toast && G.toast('Recado no mural!');
  }

  async function del(id) {
    const alvo = state.posts.find((x) => x.id === id);
    const r = await G.sb.from('mural_posts').delete().eq('id', id);
    if (r.error) { G.toast && G.toast('Não deu pra apagar.'); return; }
    if (alvo) apagarFoto(alvo.image_path);
    state.posts = state.posts.filter((p) => p.id !== id);
    state.reacts = state.reacts.filter((x) => x.post_id !== id);
    redrawList();
  }

  async function react(postId, emoji) {
    const me = G.session.user.id;
    const has = state.reacts.some((r) => r.post_id === postId && r.user_id === me && r.emoji === emoji);
    // otimista
    if (has) state.reacts = state.reacts.filter((r) => !(r.post_id === postId && r.user_id === me && r.emoji === emoji));
    else state.reacts.push({ post_id: postId, user_id: me, emoji });
    redrawList();
    const q = has
      ? G.sb.from('mural_reactions').delete().eq('post_id', postId).eq('user_id', me).eq('emoji', emoji)
      : G.sb.from('mural_reactions').insert({ post_id: postId, user_id: me, emoji });
    const r = await q;
    if (r.error) {
      // desfaz
      if (has) state.reacts.push({ post_id: postId, user_id: me, emoji });
      else state.reacts = state.reacts.filter((x) => !(x.post_id === postId && x.user_id === me && x.emoji === emoji));
      redrawList();
      G.toast && G.toast('Não consegui reagir agora.');
    }
  }

  async function sendRec() {
    const ta = $('#recTxt'), btn = $('#recSend'), err = $('#recErr');
    const txt = ta.value.trim();
    if (!txt && !pendRec) return;
    btn.disabled = true; err.textContent = '';
    let path = null;
    if (pendRec) {
      try { path = await upload('adm', pendRec); }
      catch (e) { err.textContent = 'Não consegui enviar a foto: ' + e.message; btn.disabled = false; return; }
    }
    const body = { content: txt, created_by: G.session.user.id };
    if (path) body.image_path = path;
    const r = await G.sb.from('admin_announcements').insert(body).select(path ? 'id, content, created_at, image_path' : 'id, content, created_at').single();
    btn.disabled = false;
    if (r.error) { apagarFoto(path); err.textContent = 'Não consegui publicar: ' + r.error.message; return; }
    if (path) await signed([path]);
    pendRec = null;
    if (state.rec && state.rec.image_path) apagarFoto(state.rec.image_path);
    state.rec = r.data;
    redrawRec();
    G.toast && G.toast('Recado macaquista publicado.');
  }

  async function delRec(id) {
    const antigo = state.rec && state.rec.id === id ? state.rec.image_path : null;
    const r = await G.sb.from('admin_announcements').delete().eq('id', id);
    if (r.error) { G.toast && G.toast('Não deu pra apagar.'); return; }
    apagarFoto(antigo);
    // se havia um anterior, ele volta a ser o mais recente
    const n = await G.sb.from('admin_announcements').select(fotosOk ? 'id, content, created_at, image_path' : 'id, content, created_at').order('created_at', { ascending: false }).limit(1);
    if (fotosOk && n.data && n.data[0]) await signed([n.data[0].image_path].filter(Boolean));
    state.rec = (n.data && n.data[0]) || null;
    redrawRec();
  }

  function bind(view) {
    view.oninput = (e) => {
      if (e.target.id === 'mpTxt') {
        $('#mpCnt').textContent = e.target.value.length + '/' + MAX;
        $('#mpSend').disabled = !(e.target.value.trim() || pend);
      } else if (e.target.id === 'recTxt') {
        $('#recCnt').textContent = e.target.value.length + '/' + MAX_REC;
      }
    };
    view.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f || (e.target.id !== 'mpFile' && e.target.id !== 'recFile')) return;
      const rec = e.target.id === 'recFile';
      try {
        const ph = await fotoBlob(f);
        if (rec) { pendRec = ph; $('#recPrev').innerHTML = prevHtml(ph, 'rec'); }
        else { pend = ph; $('#mpPrev').innerHTML = prevHtml(ph, 'mp'); $('#mpSend').disabled = false; }
      } catch (x) { const er = $(rec ? '#recErr' : '#mpErr'); if (er) er.textContent = 'Não consegui abrir essa imagem. Tente outra.'; }
      e.target.value = '';
    };
    view.onclick = (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'mpPhoto') $('#mpFile').click();
      else if (t.id === 'recPhoto') $('#recFile').click();
      else if (t.dataset.prevx) {
        if (t.dataset.prevx === 'rec') { pendRec = null; $('#recPrev').innerHTML = ''; }
        else { pend = null; $('#mpPrev').innerHTML = ''; $('#mpSend').disabled = !$('#mpTxt').value.trim(); }
      }
      else if (t.dataset.zoom) zoom(t.dataset.zoom);
      else if (t.id === 'mpSend') send();
      else if (t.id === 'recSend') sendRec();
      else if (t.id === 'recDel') delRec(t.dataset.id);
      else if (t.dataset.prof) profileCard(t.dataset.prof);
      else if (t.dataset.del) del(t.dataset.del);
      else if (t.dataset.react) react(t.dataset.react, t.dataset.emoji);
    };
    G.cleanup = function () {
      const mr = document.getElementById('modalRoot'); if (mr && (mr.querySelector('.prof-card') || mr.querySelector('.lightbox'))) mr.innerHTML = '';
      view.oninput = null; view.onclick = null; view.onchange = null;
      pend = null; pendRec = null;
      clearInterval(timer); clearInterval(tickTimer);
      timer = tickTimer = null; state = null;
    };
  }

  // ------------------------------------------------------------------
  // Rota
  // ------------------------------------------------------------------
  function msg(title, html) {
    return '<div class="card-box highlight"><div class="card-header-flex"><span class="card-title-text">' + esc(title) + '</span></div><div class="card-body">' + html + '</div></div>';
  }

  G.routes.mural = async function () {
    const view = $('#view');
    view.innerHTML = '<div class="card-box"><p class="muted">Abrindo o mural…</p></div>';
    const prof = G.profile;

    if (!prof || !prof.group_id) {
      // mesmo sem grupo o recado macaquista (público) pode ser lido
      const r = await G.sb.from('admin_announcements').select('id, content, created_at').order('created_at', { ascending: false }).limit(1);
      if (G.route !== 'mural') return;
      state = { posts: [], reacts: [], rec: (r.data && r.data[0]) || null, members: [] };
      view.innerHTML = '<div id="muralRec">' + recadoHtml() + '</div>' +
        msg('Cadê a sua matilha?', '<p>O mural é só de quem usa a mesma <strong>tag de grupo</strong>. Abra as configurações (engrenagem no topo), digite a tag combinada com os amigos e volte aqui.</p>');
      bind(view);
      if (G.enter) G.enter();
      return;
    }

    const d = await load();
    if (G.route !== 'mural') return;
    if (d.missing) {
      view.innerHTML = msg('Falta uma configuração', '<p>O mural usa as tabelas do <strong>schema.sql</strong> original (mural_posts, mural_reactions e admin_announcements). Confira no Supabase se elas existem.</p>');
      return;
    }
    if (d.error) {
      view.innerHTML = '<div class="card-box"><p class="error">Erro ao carregar o mural: ' + esc(d.error) + '</p></div>';
      return;
    }
    state = d;
    view.innerHTML = shell();
    bind(view);
    if (G.enter) G.enter();
    limparFotos();

    timer = setInterval(refresh, POLL_MS);
    // reavalia as cores/contagem regressiva sem ir ao servidor
    tickTimer = setInterval(() => {
      if (G.route !== 'mural' || !state) return;
      const cut = Date.now() - DAY_MS;
      state.posts = state.posts.filter((p) => new Date(p.created_at).getTime() > cut);
      redrawList();
    }, 60000);
  };

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
