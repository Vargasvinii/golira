// GOLIRA - aba IA: chat com o Gorilão (Groq, via /api/gorilao) + fichas de treino com aprovação
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;
  const $ = (s, r) => (r || document).querySelector(s);

  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const CHIPS = ['Monta uma ficha pra mim', 'Como está meu dia?', 'Como foi minha semana?', 'Dica pra beber mais água'];
  const FICHA_RE = /```ficha\s*([\s\S]*?)(?:```|$)/i;

  const S = { uid: '', msgs: [], busy: false, ctx: null, ctxAt: 0, loadedFor: '' };

  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    }));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } };
  const key = () => 'golira_ia_' + S.uid;

  function carregaHistorico() {
    const uid = G.session && G.session.user ? G.session.user.id : '';
    if (S.loadedFor === uid) return;
    S.uid = uid; S.loadedFor = uid; S.ctx = null;
    try {
      const a = JSON.parse(lsGet(key()) || '[]');
      S.msgs = Array.isArray(a) ? a.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-24) : [];
    } catch (e) { S.msgs = []; }
  }
  function salvaHistorico() { lsSet(key(), JSON.stringify(S.msgs.slice(-24))); }

  // ------------------------------------------------------------------
  // Contexto do usuário (vai pro servidor junto com a pergunta)
  // ------------------------------------------------------------------
  async function buildContext() {
    if (S.ctx && Date.now() - S.ctxAt < 45000) return S.ctx;
    const sb = G.sb;
    const p = G.profile || {};
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const wk = new Date(); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - 7);

    try { if (G.habitosLoad) await G.habitosLoad(); } catch (e) { /* ignora */ }
    try { if (G.gorilaoLoad) await G.gorilaoLoad(); } catch (e) { /* ignora */ }

    const r = await Promise.all([
      sb.from('water_logs').select('amount_ml').gte('logged_at', start.toISOString()),
      sb.from('workout_plans').select('id, name, is_active'),
      sb.from('workout_days').select('id, plan_id, title, weekday, position'),
      sb.from('workout_exercises').select('day_id, name, kind, sets, reps, load_kg, duration_min, position'),
      sb.from('workout_sessions').select('day_title, started_at, finished_at, difficulty').not('finished_at', 'is', null)
        .gte('started_at', wk.toISOString()).order('started_at', { ascending: false }).limit(8),
    ]);
    const waterMl = (r[0].data || []).reduce((s, x) => s + (x.amount_ml || 0), 0);
    const plans = r[1].data || [];
    const act = plans.find((x) => x.is_active) || plans[0];
    const days = act ? (r[2].data || []).filter((d) => d.plan_id === act.id).sort((a, b) => a.position - b.position) : [];
    const exs = r[3].data || [];
    const h = G.habitosState ? G.habitosState() : null;

    const ctx = {
      nome: String(p.display_name || '').split(' ')[0] || null,
      peso_kg: p.weight_kg || null,
      altura_cm: p.height_cm || null,
      objetivo: p.goal || null,
      hoje: {
        agua_ml: waterMl, meta_agua_ml: p.water_goal_ml || 3000,
        treino_feito: !!(h && (h.sessionTitle || h.workoutManual)),
        comeu_junk: !!(h && h.junk),
      },
      ficha_ativa: act ? {
        nome: act.name,
        treinos: days.map((d) => ({
          titulo: d.title,
          dia: d.weekday == null ? 'livre' : DIAS[d.weekday],
          exercicios: exs.filter((e) => e.day_id === d.id).sort((a, b) => a.position - b.position).map((e) =>
            e.kind === 'time' ? e.name + ' ' + e.duration_min + 'min'
              : e.name + ' ' + e.sets + 'x' + e.reps + (e.load_kg != null ? ' ' + e.load_kg + 'kg' : '')),
        })),
      } : null,
      treinos_ultimos_7_dias: (r[4].data || []).map((s) => ({
        treino: s.day_title, data: s.started_at.slice(0, 10), dificuldade: s.difficulty || null,
      })),
    };
    if (h && h.cfg && h.cfg.smoke) ctx.hoje.cigarros = { fumados: h.smokeCount, meta_maxima: h.cfg.goal };
    S.ctx = ctx; S.ctxAt = Date.now();
    return ctx;
  }

  // ------------------------------------------------------------------
  // Ficha enviada pela IA -> validada -> mostrada pra aprovação
  // ------------------------------------------------------------------
  function parseFicha(raw) {
    const m = FICHA_RE.exec(raw || '');
    if (!m) return { text: raw, ficha: null, broken: false };
    const text = raw.replace(FICHA_RE, '').trim();
    let obj;
    try { obj = JSON.parse(m[1].trim()); } catch (e) { return { text, ficha: null, broken: true }; }
    const f = normalizaFicha(obj);
    return { text, ficha: f, broken: !f };
  }

  function normalizaFicha(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.treinos)) return null;
    const nome = String(o.nome || 'Ficha do Gorilão').trim().slice(0, 60) || 'Ficha do Gorilão';
    const treinos = [];
    for (const t of o.treinos.slice(0, 6)) {
      if (!t || !Array.isArray(t.exercicios)) continue;
      const exercicios = [];
      for (const e of t.exercicios.slice(0, 10)) {
        const name = String((e && e.nome) || '').trim().slice(0, 60);
        if (!name) continue;
        if (e.tipo === 'tempo') {
          const min = Math.round(Number(e.minutos));
          if (!(min >= 1 && min <= 300)) continue;
          exercicios.push({ name, kind: 'time', min });
        } else {
          const sets = Math.round(Number(e.series));
          const reps = String(e.reps == null ? '' : e.reps).trim().slice(0, 20);
          if (!(sets >= 1 && sets <= 10) || !reps) continue;
          let load = null;
          if (e.carga != null && e.carga !== '' && Number.isFinite(Number(e.carga)) && Number(e.carga) >= 0 && Number(e.carga) <= 9999) load = Number(e.carga);
          exercicios.push({ name, kind: 'sets', sets, reps, load });
        }
      }
      if (!exercicios.length) continue;
      const d = t.dia === null || t.dia === undefined || t.dia === '' ? null : Number(t.dia);
      treinos.push({
        title: String(t.titulo || 'Treino ' + String.fromCharCode(65 + treinos.length)).trim().slice(0, 40),
        weekday: Number.isInteger(d) && d >= 0 && d <= 6 ? d : null,
        exercicios,
      });
    }
    return treinos.length ? { nome, treinos } : null;
  }

  const fmtKg = (n) => String(n).replace('.', ',');
  function descEx(x) {
    return x.kind === 'time' ? x.min + ' min' : x.sets + 'x' + x.reps + (x.load != null ? ' · ' + fmtKg(x.load) + ' kg' : '');
  }

  function fichaHtml(f, idx, saved) {
    return '<div class="ia-ficha">' +
      '<div class="ia-ficha-name">' + esc(f.nome) + '</div>' +
      f.treinos.map((t) =>
        '<div class="ia-ficha-day"><strong>' + esc(t.title) + '</strong>' + (t.weekday != null ? ' <span>' + DIAS[t.weekday] + '</span>' : '') +
        '<ul>' + t.exercicios.map((x) => '<li><span>' + esc(x.name) + '</span><em>' + esc(descEx(x)) + '</em></li>').join('') + '</ul></div>'
      ).join('') +
      (saved
        ? '<div class="ia-saved">Ficha salva na aba Treino.</div><button class="btn-ghost" type="button" data-ia="goto-treino">Abrir Treino</button>'
        : '<div class="row-btns"><button class="btn-ghost" type="button" data-ia="ficha-no" data-i="' + idx + '">Descartar</button>' +
          '<button class="btn-action" type="button" data-ia="ficha-ok" data-i="' + idx + '">Salvar na aba Treino</button></div>' +
          '<small class="muted">Só entra na sua lista se você aprovar. Dá pra editar depois na aba Treino.</small>') +
      '</div>';
  }

  async function salvarFicha(idx) {
    const m = S.msgs[idx];
    if (!m || m.saved) return;
    const f = parseFicha(m.content).ficha;
    if (!f) return G.toast('Não consegui ler essa ficha. Pede de novo pro Gorilão.');
    const btn = document.querySelector('[data-ia="ficha-ok"][data-i="' + idx + '"]');
    if (btn) btn.disabled = true;
    const sb = G.sb;
    const fail = async (e, pid) => {
      if (pid) await sb.from('workout_plans').delete().eq('id', pid);
      if (btn) btn.disabled = false;
      G.toast('Erro ao salvar: ' + (e && e.message ? e.message : e));
    };

    const ex = await sb.from('workout_plans').select('id, is_active');
    if (ex.error) return fail(ex.error);
    const planId = newId();
    let r = await sb.from('workout_plans').insert({ id: planId, name: f.nome, is_active: !(ex.data || []).some((p) => p.is_active) });
    if (r.error) return fail(r.error);

    const dayRows = []; const exRows = [];
    f.treinos.forEach((t, i) => {
      const did = newId();
      dayRows.push({ id: did, plan_id: planId, title: t.title, weekday: t.weekday, position: i });
      t.exercicios.forEach((x, j) => exRows.push({
        id: newId(), day_id: did, name: x.name, kind: x.kind,
        sets: x.kind === 'time' ? 1 : x.sets, reps: x.kind === 'time' ? '1' : x.reps,
        load_kg: x.kind === 'time' ? null : x.load, duration_min: x.kind === 'time' ? x.min : null, position: j,
      }));
    });
    r = await sb.from('workout_days').insert(dayRows);
    if (r.error) return fail(r.error, planId);
    r = await sb.from('workout_exercises').insert(exRows);
    if (r.error) return fail(r.error, planId);

    m.saved = true; salvaHistorico(); S.ctx = null;
    G.toast('Ficha salva! 💪');
    if (G.route === 'ia') desenhaMsgs();
  }

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  function fmt(t) {
    return esc(t).split('\n').map((l) => {
      const b = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return /^\s*[-•*]\s+/.test(l) ? '<div class="ia-li">' + b.replace(/^\s*[-•*]\s+/, '') + '</div>' : (b.trim() ? '<p>' + b + '</p>' : '');
    }).join('');
  }

  function msgHtml(m, i) {
    if (m.role === 'user') return '<div class="ia-msg me"><div class="ia-bub">' + esc(m.content).replace(/\n/g, '<br>') + '</div></div>';
    const p = parseFicha(m.content);
    return '<div class="ia-msg bot' + (m.err ? ' err' : '') + '"><img class="ia-av" src="/img/gorila.png" alt=""><div class="ia-bub">' +
      (p.text ? fmt(p.text) : '') +
      (p.ficha ? fichaHtml(p.ficha, i, !!m.saved) : '') +
      (p.broken ? '<p class="muted">A ficha veio bagunçada. Pede de novo que eu refaço.</p>' : '') +
      '</div></div>';
  }

  function saudacao() {
    const n = String((G.profile && G.profile.display_name) || '').split(' ')[0];
    return '<div class="ia-msg bot"><img class="ia-av" src="/img/gorila.png" alt=""><div class="ia-bub"><p>E aí' + (n ? ', ' + esc(n) : '') +
      '! Sou o Gorilão. Posso montar uma ficha, olhar seu dia e te cobrar com carinho. Manda a pergunta. 🦍</p></div></div>';
  }

  function desenhaMsgs() {
    const box = $('#iaMsgs');
    if (!box) return;
    box.innerHTML = (S.msgs.length ? '' : saudacao()) + S.msgs.map(msgHtml).join('') +
      (S.busy ? '<div class="ia-msg bot"><img class="ia-av" src="/img/gorila.png" alt=""><div class="ia-bub ia-typing"><i></i><i></i><i></i></div></div>' : '');
    const chips = $('#iaChips');
    if (chips) chips.classList.toggle('hidden', S.msgs.length > 0);
    const send = $('#iaSend');
    if (send) send.disabled = S.busy;
    const clr = $('#iaClear');
    if (clr) clr.classList.toggle('hidden', !S.msgs.length);
  }

  function scrollFim() {
    const box = $('#iaMsgs');
    if (box && box.lastElementChild) box.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  async function enviar(texto) {
    texto = String(texto || '').trim().slice(0, 700);
    if (!texto || S.busy) return;
    S.msgs.push({ role: 'user', content: texto });
    S.busy = true; salvaHistorico();
    if (G.route === 'ia') { desenhaMsgs(); scrollFim(); }

    let resposta = null; let erro = '';
    try {
      const ctx = await buildContext();
      const { data } = await G.sb.auth.getSession();
      const token = data && data.session ? data.session.access_token : '';
      const hist = S.msgs.slice(-12).map((m) => ({ role: m.role, content: m.role === 'assistant' ? m.content.replace(FICHA_RE, '[ficha montada]') : m.content }));
      const r = await fetch('/api/gorilao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ messages: hist, context: ctx }),
      });
      let j = {}; try { j = await r.json(); } catch (e) { /* ignora */ }
      if (!r.ok || !j.reply) erro = j.error || 'O Gorilão não respondeu (erro ' + r.status + ').';
      else resposta = j.reply;
    } catch (e) {
      erro = 'Sem conexão com o Gorilão agora. Confere a internet e tenta de novo.';
    }
    S.busy = false;
    if (resposta) { S.msgs.push({ role: 'assistant', content: resposta }); salvaHistorico(); }
    if (G.route === 'ia') {
      desenhaMsgs();
      if (erro) {
        const box = $('#iaMsgs');
        box.insertAdjacentHTML('beforeend', '<div class="ia-msg bot err"><img class="ia-av" src="/img/gorila.png" alt=""><div class="ia-bub"><p>' + esc(erro) + '</p></div></div>');
      }
      scrollFim();
    }
  }

  G.routes.ia = async function () {
    carregaHistorico();
    const view = $('#view');
    view.innerHTML =
      '<div class="card-box highlight ia-recado"><div class="card-header-flex"><span class="card-title-text">Recado do Gorilão</span><span class="card-tag">Hoje</span></div>' +
      '<div class="ia-recado-body muted">Farejando seu dia…</div></div>' +
      '<div class="card-box ia-chat">' +
        '<div class="ia-msgs" id="iaMsgs"></div>' +
        '<div class="ia-chips" id="iaChips">' + CHIPS.map((c) => '<button class="btn-ghost" type="button" data-ia="chip">' + esc(c) + '</button>').join('') + '</div>' +
        '<form class="ia-compose" id="iaForm" autocomplete="off">' +
          '<textarea id="iaInput" rows="1" maxlength="700" placeholder="Fala com o Gorilão…" enterkeyhint="send"></textarea>' +
          '<button class="btn-action" id="iaSend" type="submit">Enviar</button>' +
        '</form>' +
        '<button class="btn-link" type="button" id="iaClear" data-ia="clear">Limpar conversa</button>' +
      '</div>';
    desenhaMsgs();

    // recado por regras (usa os dados de hoje; sem gastar IA)
    (async () => {
      try {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const [w] = await Promise.all([
          G.sb.from('water_logs').select('amount_ml').gte('logged_at', start.toISOString()),
          G.habitosLoad ? G.habitosLoad().catch(() => {}) : null,
          G.gorilaoLoad ? G.gorilaoLoad().catch(() => {}) : null,
        ]);
        if (G.route !== 'ia') return;
        const total = (w.data || []).reduce((s, x) => s + (x.amount_ml || 0), 0);
        const rec = G.gorilaoRecados ? G.gorilaoRecados(total) : [];
        const el = $('.ia-recado-body');
        if (el) { el.classList.remove('muted'); el.innerHTML = rec.slice(0, 3).map((t) => '<p>' + esc(t) + '</p>').join('') || 'Tudo certo por aqui.'; }
      } catch (e) {
        const el = $('.ia-recado-body'); if (el) el.textContent = 'Não consegui farejar seu dia agora.';
      }
    })();

    const form = $('#iaForm'); const input = $('#iaInput');
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value; input.value = ''; grow();
      enviar(t);
    });
    $('.ia-chat').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ia]');
      if (!b) return;
      const a = b.dataset.ia;
      if (a === 'chip') enviar(b.textContent);
      else if (a === 'ficha-ok') salvarFicha(Number(b.dataset.i));
      else if (a === 'ficha-no') {
        const m = S.msgs[Number(b.dataset.i)];
        if (m) { m.content = m.content.replace(FICHA_RE, '').trim() + '\n\n(Ficha descartada.)'; salvaHistorico(); desenhaMsgs(); }
      } else if (a === 'goto-treino') window.location.hash = 'treino';
      else if (a === 'clear') {
        if (!window.confirm('Apagar a conversa com o Gorilão? As fichas já salvas continuam na aba Treino.')) return;
        S.msgs = []; lsDel(key()); desenhaMsgs();
      }
    });
    if (S.msgs.length) setTimeout(scrollFim, 50);
  };
})();
