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
  const EMOJIS = ['🦍', '🔥', '💪'];
  const POLL_MS = 25000;

  const isMissing = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || ''));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // cor do recado: bordô neon suave (novo) -> bege escuro (velho)
  const C_NEW = [152, 30, 54];
  const C_OLD = [112, 94, 72];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')';

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
    const [pr, rr] = await Promise.all([
      sb.from('mural_posts').select('id, author_id, author_name, content, created_at').gt('created_at', since).order('created_at', { ascending: false }).limit(60),
      sb.from('admin_announcements').select('id, content, created_at').order('created_at', { ascending: false }).limit(1),
    ]);
    if (isMissing(pr.error) || isMissing(rr.error)) return { missing: true };
    if (pr.error) return { error: pr.error.message };
    const posts = pr.data || [];
    const rec = (rr.data && rr.data[0]) || null;
    let reacts = [];
    if (posts.length) {
      const re = await sb.from('mural_reactions').select('post_id, user_id, emoji').in('post_id', posts.map((p) => p.id)).limit(3000);
      if (!re.error) reacts = re.data || [];
    }
    return { posts, reacts, rec };
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
          '<span class="mp-av">' + initial(p.author_name) + '</span>' +
          '<div class="mp-who"><strong>' + esc(p.author_name || 'Gorila') + '</strong><span>' + ago(p.created_at) + ' · ' + leftLabel(p.created_at) + '</span></div>' +
          (p.author_id === me ? '<button class="mp-del" data-del="' + p.id + '" aria-label="Apagar recado">' + ic('x') + '</button>' : '') +
        '</div>' +
        '<p class="mp-text">' + esc(p.content) + '</p>' +
        '<div class="mp-reacts">' + rx + '</div>' +
      '</div>' +
    '</article>';
  }

  function recadoHtml() {
    const r = state.rec;
    const isAdmin = !!(G.profile && G.profile.is_admin);
    if (!r && !isAdmin) return '';
    let h = '<section class="recado-adm card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">Recado macaquista</span><span class="card-tag">ADM</span></div>';
    if (r) {
      h += '<p class="rec-text">' + esc(r.content) + '</p>' +
        '<div class="rec-foot"><span class="muted">' + dateLabel(r.created_at) + '</span>' +
        (isAdmin ? '<button class="btn-link danger" id="recDel" data-id="' + r.id + '">Apagar recado</button>' : '') + '</div>';
    } else {
      h += '<p class="muted">Nenhum recado fixado ainda.</p>';
    }
    if (isAdmin) {
      h += '<details class="rec-new"><summary>' + (r ? 'Publicar novo recado' : 'Escrever recado') + '</summary>' +
        '<textarea id="recTxt" maxlength="' + MAX_REC + '" rows="3" placeholder="Recado pra matilha toda (não expira)"></textarea>' +
        '<div class="mc-row"><span class="muted" id="recCnt">0/' + MAX_REC + '</span><button class="btn-action btn-small" id="recSend">Publicar</button></div>' +
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
      '<div class="card-box mural-compose">' +
        '<div class="card-header-flex"><span class="card-title-text">Mural da Matilha</span><span class="card-tag">' + esc(tag) + '</span></div>' +
        '<textarea id="mpTxt" maxlength="' + MAX + '" rows="3" placeholder="Solta um recado pra matilha… (some em 24h)"></textarea>' +
        '<div class="mc-row"><span class="muted" id="mpCnt">0/' + MAX + '</span><button class="btn-action btn-small" id="mpSend" disabled>Postar</button></div>' +
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
    if (!txt) return;
    btn.disabled = true; err.textContent = '';
    const r = await G.sb.from('mural_posts').insert({ content: txt }).select('id, author_id, author_name, content, created_at').single();
    if (r.error) {
      err.textContent = 'Não consegui postar: ' + r.error.message;
      btn.disabled = false;
      return;
    }
    ta.value = '';
    $('#mpCnt').textContent = '0/' + MAX;
    state.posts.unshift(r.data);
    redrawList();
    const first = $('#muralList .mural-post');
    if (first) first.classList.add('fresh');
    G.toast && G.toast('Recado no mural!');
  }

  async function del(id) {
    const r = await G.sb.from('mural_posts').delete().eq('id', id);
    if (r.error) { G.toast && G.toast('Não deu pra apagar.'); return; }
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
    if (!txt) return;
    btn.disabled = true; err.textContent = '';
    const r = await G.sb.from('admin_announcements').insert({ content: txt, created_by: G.session.user.id }).select('id, content, created_at').single();
    btn.disabled = false;
    if (r.error) { err.textContent = 'Não consegui publicar: ' + r.error.message; return; }
    state.rec = r.data;
    redrawRec();
    G.toast && G.toast('Recado macaquista publicado.');
  }

  async function delRec(id) {
    const r = await G.sb.from('admin_announcements').delete().eq('id', id);
    if (r.error) { G.toast && G.toast('Não deu pra apagar.'); return; }
    // se havia um anterior, ele volta a ser o mais recente
    const n = await G.sb.from('admin_announcements').select('id, content, created_at').order('created_at', { ascending: false }).limit(1);
    state.rec = (n.data && n.data[0]) || null;
    redrawRec();
  }

  function bind(view) {
    view.oninput = (e) => {
      if (e.target.id === 'mpTxt') {
        $('#mpCnt').textContent = e.target.value.length + '/' + MAX;
        $('#mpSend').disabled = !e.target.value.trim();
      } else if (e.target.id === 'recTxt') {
        $('#recCnt').textContent = e.target.value.length + '/' + MAX_REC;
      }
    };
    view.onclick = (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'mpSend') send();
      else if (t.id === 'recSend') sendRec();
      else if (t.id === 'recDel') delRec(t.dataset.id);
      else if (t.dataset.del) del(t.dataset.del);
      else if (t.dataset.react) react(t.dataset.react, t.dataset.emoji);
    };
    G.cleanup = function () {
      view.oninput = null; view.onclick = null;
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
      state = { posts: [], reacts: [], rec: (r.data && r.data[0]) || null };
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
