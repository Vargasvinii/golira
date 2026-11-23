// GOLIRA - aba TREINO (v2)
// Fichas (A, B, C...), executar treino com cronômetro, checks e carga,
// dificuldade, resumo do Gorilão (por regras, sem IA ainda) e peso semanal.
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;
  const toast = G.toast;
  const confetti = G.confetti;
  const pad = G.pad2;
  const ic = G.icon;
  const $ = (sel, root) => (root || document).querySelector(sel);

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DIFFS = [
    { id: 'babinha', label: 'Babinha', emoji: '😎' },
    { id: 'file', label: 'Só o filé 👌🏽', emoji: '👌🏽' },
    { id: 'pesado', label: 'Pesado', emoji: '💪' },
    { id: 'deus', label: 'Vi Deus de perto', emoji: '🙏' },
  ];
  const diffOf = (id) => DIFFS.find((d) => d.id === id);

  // Estado da aba
  const S = {
    view: 'home',     // home | editor | run | finish
    missing: false,   // tabelas da v2 ainda não existem
    plans: [], days: [], exercises: [], recent: [],
    active: null,     // { session, items } do treino em andamento
    planId: null,
    ed: null,         // ficha em edição
    fin: null,        // dados da tela de treino concluído
  };
  let tickTimer = null;
  let lastView = null;

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  const num = (v) => parseFloat(String(v == null ? '' : v).replace(',', '.'));
  const fmtKg = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
  const byPos = (a, b) => (a.position || 0) - (b.position || 0);
  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const isMissing = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' ||
    /schema cache|does not exist/i.test(e.message || ''));

  function fmtClock(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }
  function fmtMin(ms) { return Math.round(Math.max(0, ms) / 60000) + ' min'; }
  function fmtData(iso) { const d = new Date(iso); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  function weekStartISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return G.hojeISO(d);
  }
  function listaNomes(arr) {
    const n = arr.map((x) => x.name);
    if (n.length <= 3) return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : n[0];
    return n.slice(0, 2).join(', ') + ' e mais ' + (n.length - 2);
  }

  const planDays = (pid) => S.days.filter((d) => d.plan_id === pid);
  const dayExs = (did) => S.exercises.filter((e) => e.day_id === did);
  function describe(x) {
    if (x.kind === 'time') return x.duration_min + ' min';
    return x.sets + 'x' + x.reps + (x.load_kg != null ? ' · ' + fmtKg(x.load_kg) + ' kg' : '');
  }

  // ------------------------------------------------------------------
  // Carregar dados
  // ------------------------------------------------------------------
  async function loadAll() {
    const sb = G.sb;
    const r = await Promise.all([
      sb.from('workout_plans').select('*').order('created_at', { ascending: true }),
      sb.from('workout_days').select('*'),
      sb.from('workout_exercises').select('*'),
      sb.from('workout_sessions').select('*').is('finished_at', null).order('started_at', { ascending: false }).limit(1),
      sb.from('workout_sessions').select('*').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(5),
    ]);
    const err = r.map((x) => x.error).find(Boolean);
    S.missing = false;
    if (err) {
      if (isMissing(err)) { S.missing = true; return null; }
      return err;
    }
    S.plans = r[0].data || [];
    S.days = (r[1].data || []).sort(byPos);
    S.exercises = (r[2].data || []).sort(byPos);
    S.recent = r[4].data || [];

    if (S.plans.length && !S.plans.some((p) => p.is_active)) {
      await sb.from('workout_plans').update({ is_active: true }).eq('id', S.plans[0].id);
      S.plans[0].is_active = true;
    }
    if (!S.planId || !S.plans.some((p) => p.id === S.planId)) {
      const act = S.plans.find((p) => p.is_active) || S.plans[0];
      S.planId = act ? act.id : null;
    }

    S.active = null;
    const open = (r[3].data || [])[0];
    if (open) {
      const it = await sb.from('workout_session_items').select('*').eq('session_id', open.id).order('position', { ascending: true });
      S.active = { session: open, items: (it.data || []).sort(byPos) };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Entrada da aba
  // ------------------------------------------------------------------
  G.routes.treino = async function () {
    const view = $('#view');
    if (!S.active) view.innerHTML = '<div class="card-box"><p class="muted">Carregando seu treino…</p></div>';
    const err = await loadAll();
    if (G.route !== 'treino') return;
    if (err) {
      view.innerHTML = '<div class="card-box"><p class="error">Erro ao carregar o treino: ' + esc(err.message || err) + '</p></div>';
      return;
    }
    if (S.active) S.view = 'run';
    else if (S.view !== 'finish' || !S.fin) S.view = 'home';
    render();
  };

  function render() {
    if (G.route !== 'treino') return;
    const view = $('#view');
    stopTick();
    if (S.view !== lastView) { lastView = S.view; if (G.enter) G.enter(); }
    if (S.missing) view.innerHTML = missingHtml();
    else if (S.view === 'editor' && S.ed) view.innerHTML = editorHtml();
    else if (S.view === 'run' && S.active) { view.innerHTML = runHtml(); startTick(); }
    else if (S.view === 'finish' && S.fin) view.innerHTML = finishHtml();
    else { S.view = 'home'; view.innerHTML = homeHtml(); }
    G.cleanup = stopTick;
  }

  function rerender() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  // ------------------------------------------------------------------
  // HOME: ficha, treinos A/B/C, últimos treinos
  // ------------------------------------------------------------------
  function missingHtml() {
    return '<div class="card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">Falta uma configuração</span><span class="card-tag">Treino</span></div>' +
      '<div class="card-body"><p>A aba Treino precisa das tabelas novas do banco. Rode o arquivo <strong>schema-v2.sql</strong> no SQL Editor do Supabase e depois atualize esta página.</p></div>' +
      '</div>';
  }

  function emptyHtml() {
    return '<div class="card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">Sua ficha de treino</span><span class="card-tag">Treino</span></div>' +
      '<div class="card-body"><p>Você ainda não tem ficha. Monte a sua com treinos A, B, C…, exercícios ou aparelhos, séries, tempo e carga. Em breve o Gorilão também vai montar uma pra você.</p></div>' +
      '<button class="btn-action btn-lg" type="button" data-t="new-plan">' + ic('plus') + ' Criar minha ficha</button>' +
      '</div>';
  }

  function homeHtml() {
    const plan = S.plans.find((p) => p.id === S.planId);
    if (!plan) return emptyHtml();
    const today = new Date().getDay();
    let h = '<div class="card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">' + esc(plan.name) + '</span><span class="card-tag">Ficha ativa</span></div>' +
      (S.plans.length > 1
        ? '<label class="field">Trocar de ficha<select class="select" data-t="plan-select">' +
          S.plans.map((p) => '<option value="' + p.id + '"' + (p.id === plan.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
          '</select></label>'
        : '') +
      '<div class="row-btns">' +
        '<button class="btn-action" type="button" data-t="edit-plan">' + ic('edit') + ' Editar ficha</button>' +
        '<button class="btn-action" type="button" data-t="new-plan">' + ic('plus') + ' Nova ficha</button>' +
      '</div></div>';

    planDays(plan.id).forEach((d) => {
      const exs = dayExs(d.id);
      const isToday = d.weekday === today;
      h += '<div class="card-box' + (isToday ? ' highlight' : '') + '">' +
        '<div class="card-header-flex"><span class="card-title-text">' + esc(d.title) + '</span><span class="tags">' +
          (isToday ? '<span class="card-tag hoje">Hoje</span>' : '') +
          (d.weekday != null ? '<span class="card-tag">' + DIAS[d.weekday] + '</span>' : '') +
        '</span></div>' +
        (exs.length
          ? '<ul class="ex-preview">' + exs.map((x) => '<li><span>' + esc(x.name) + '</span><span class="ex-meta">' + esc(describe(x)) + '</span></li>').join('') + '</ul>'
          : '<p class="muted">Sem exercícios ainda. Toque em Editar ficha.</p>') +
        '<button class="btn-action btn-lg" type="button" data-t="start" data-day="' + d.id + '"' + (exs.length ? '' : ' disabled') + '>' + ic('play', 'fill') + ' Iniciar treino</button>' +
        '</div>';
    });

    if (S.recent.length) {
      h += '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Últimos treinos</span></div><ul class="recent-list">' +
        S.recent.map((s) => {
          const dur = s.finished_at ? fmtMin(new Date(s.finished_at) - new Date(s.started_at)) : '';
          const df = diffOf(s.difficulty);
          return '<li><span>' + fmtData(s.started_at) + ' · ' + esc(s.day_title) + '</span><span class="ex-meta">' + dur + (df ? ' ' + df.emoji : '') + '</span></li>';
        }).join('') + '</ul></div>';
    }
    return h;
  }

  async function setActivePlan(id) {
    const sb = G.sb;
    const a = await sb.from('workout_plans').update({ is_active: false }).neq('id', id);
    if (a.error) return toast('Não consegui trocar: ' + a.error.message);
    const b = await sb.from('workout_plans').update({ is_active: true }).eq('id', id);
    if (b.error) return toast('Não consegui trocar: ' + b.error.message);
    S.plans.forEach((p) => { p.is_active = p.id === id; });
    S.planId = id;
    render();
  }

  // ------------------------------------------------------------------
  // EDITOR DE FICHA
  // ------------------------------------------------------------------
  function newDay(i) {
    return { id: uuid(), isNew: true, title: 'Treino ' + (i < 26 ? String.fromCharCode(65 + i) : i + 1), weekday: '', exercises: [] };
  }
  function newEx() {
    return { id: uuid(), isNew: true, name: '', kind: 'sets', sets: '3', reps: '10', load: '', min: '10' };
  }
  function newEditor() {
    return { id: uuid(), isNew: true, name: 'Minha ficha', days: [newDay(0)], removedDays: [], removedEx: [] };
  }
  function editorFromPlan(plan) {
    return {
      id: plan.id, isNew: false, name: plan.name, removedDays: [], removedEx: [],
      days: planDays(plan.id).map((d) => ({
        id: d.id, isNew: false, title: d.title, weekday: d.weekday == null ? '' : String(d.weekday),
        exercises: dayExs(d.id).map((x) => ({
          id: x.id, isNew: false, name: x.name, kind: x.kind || 'sets',
          sets: String(x.sets == null ? 3 : x.sets), reps: x.reps == null ? '10' : String(x.reps),
          load: x.load_kg == null ? '' : String(x.load_kg).replace('.', ','),
          min: x.duration_min == null ? '10' : String(x.duration_min),
        })),
      })),
    };
  }

  function exerciseRowHtml(x, di, xi, n) {
    const base = ' data-d="' + di + '" data-e="' + xi + '"';
    return '<div class="ed-ex">' +
      '<div class="ed-ex-top">' +
        '<input class="ed-name"' + base + ' data-f="name" maxlength="80" placeholder="Exercício ou aparelho (ex.: Leg press)" value="' + esc(x.name) + '">' +
        '<select class="select kind"' + base + ' data-f="kind"><option value="sets"' + (x.kind === 'sets' ? ' selected' : '') + '>Séries</option><option value="time"' + (x.kind === 'time' ? ' selected' : '') + '>Tempo</option></select>' +
      '</div>' +
      '<div class="ed-ex-vals">' +
        (x.kind === 'time'
          ? '<label class="mini-field">Minutos<input' + base + ' data-f="min" inputmode="numeric" value="' + esc(x.min) + '"></label>'
          : '<label class="mini-field">Séries<input' + base + ' data-f="sets" inputmode="numeric" value="' + esc(x.sets) + '"></label>' +
            '<label class="mini-field">Reps<input' + base + ' data-f="reps" maxlength="20" value="' + esc(x.reps) + '"></label>' +
            '<label class="mini-field">Carga (kg)<input' + base + ' data-f="load" inputmode="decimal" placeholder="opcional" value="' + esc(x.load) + '"></label>') +
      '</div>' +
      '<div class="mini-btns">' +
        '<button class="mini" type="button" data-t="ex-up"' + base + (xi === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="mini" type="button" data-t="ex-down"' + base + (xi === n - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="mini danger" type="button" data-t="ex-del"' + base + '>Remover</button>' +
      '</div></div>';
  }

  function editorHtml() {
    const ed = S.ed;
    let h = '<div class="card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">' + (ed.isNew ? 'Nova ficha' : 'Editar ficha') + '</span></div>' +
      '<label class="field">Nome da ficha<input data-f="name" maxlength="60" value="' + esc(ed.name) + '"></label>' +
      '<p class="muted">Cada treino (A, B, C…) tem seus exercícios. O dia da semana é opcional.</p></div>';

    ed.days.forEach((d, di) => {
      h += '<div class="card-box ed-day">' +
        '<div class="ed-day-head">' +
          '<label class="field grow">Treino<input data-d="' + di + '" data-f="title" maxlength="80" value="' + esc(d.title) + '"></label>' +
          '<label class="field">Dia<select class="select" data-d="' + di + '" data-f="weekday"><option value="">—</option>' +
            DIAS.map((n, i) => '<option value="' + i + '"' + (String(d.weekday) === String(i) ? ' selected' : '') + '>' + n + '</option>').join('') +
          '</select></label>' +
        '</div>' +
        '<div class="mini-btns">' +
          '<button class="mini" type="button" data-t="day-up" data-d="' + di + '"' + (di === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="mini" type="button" data-t="day-down" data-d="' + di + '"' + (di === ed.days.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="mini danger" type="button" data-t="day-del" data-d="' + di + '">Remover treino</button>' +
        '</div>';
      d.exercises.forEach((x, xi) => { h += exerciseRowHtml(x, di, xi, d.exercises.length); });
      h += '<button class="btn-ghost" type="button" data-t="ex-add" data-d="' + di + '">+ Adicionar exercício</button></div>';
    });

    h += '<button class="btn-ghost" type="button" data-t="day-add">+ Adicionar treino</button>' +
      '<div class="error" id="edError"></div>' +
      '<div class="row-btns"><button class="btn-ghost" type="button" data-t="ed-cancel">Cancelar</button>' +
      '<button class="btn-action" type="button" data-t="ed-save" id="edSave">Salvar ficha</button></div>' +
      (!ed.isNew ? '<button class="btn-link danger" type="button" data-t="plan-del">Apagar esta ficha</button>' : '');
    return h;
  }

  function validateEditor() {
    const ed = S.ed;
    if (!ed.name.trim()) return 'Dê um nome para a ficha.';
    if (!ed.days.length) return 'Adicione pelo menos um treino.';
    for (const d of ed.days) {
      if (!d.title.trim()) return 'Todo treino precisa de um nome (ex.: Treino A).';
      for (const x of d.exercises) {
        const label = x.name.trim() || 'exercício sem nome';
        if (!x.name.trim()) return 'Tem exercício sem nome em "' + d.title + '".';
        if (x.kind === 'time') {
          const m = num(x.min);
          if (!(m >= 1 && m <= 300) || !Number.isInteger(m)) return 'Em "' + label + '", os minutos devem ser um número inteiro de 1 a 300.';
        } else {
          const s = num(x.sets);
          if (!(s >= 1 && s <= 10) || !Number.isInteger(s)) return 'Em "' + label + '", as séries devem ser de 1 a 10.';
          if (!x.reps.trim() || x.reps.trim().length > 20) return 'Em "' + label + '", preencha as repetições (ex.: 10 ou 8-10).';
          if (String(x.load).trim() !== '') {
            const l = num(x.load);
            if (!(l >= 0 && l <= 9999)) return 'Em "' + label + '", a carga deve ser um número (kg).';
          }
        }
      }
    }
    return '';
  }

  async function saveEditor() {
    const err = $('#edError');
    err.textContent = '';
    const msg = validateEditor();
    if (msg) { err.textContent = msg; return; }

    const btn = $('#edSave');
    btn.disabled = true;
    const sb = G.sb;
    const ed = S.ed;
    const fail = (e) => { btn.disabled = false; err.textContent = 'Erro ao salvar: ' + (e && e.message ? e.message : e); };

    const planRow = { id: ed.id, name: ed.name.trim() };
    if (ed.isNew) planRow.is_active = S.plans.length === 0;
    let r = await sb.from('workout_plans').upsert(planRow);
    if (r.error) return fail(r.error);

    if (ed.removedDays.length) {
      r = await sb.from('workout_days').delete().in('id', ed.removedDays);
      if (r.error) return fail(r.error);
    }
    if (ed.removedEx.length) {
      r = await sb.from('workout_exercises').delete().in('id', ed.removedEx);
      if (r.error) return fail(r.error);
    }

    const dayRows = ed.days.map((d, i) => ({
      id: d.id, plan_id: ed.id, title: d.title.trim(),
      weekday: d.weekday === '' ? null : Number(d.weekday), position: i,
    }));
    r = await sb.from('workout_days').upsert(dayRows);
    if (r.error) return fail(r.error);

    const exRows = [];
    ed.days.forEach((d) => d.exercises.forEach((x, i) => {
      const isTime = x.kind === 'time';
      const hasLoad = !isTime && String(x.load).trim() !== '';
      exRows.push({
        id: x.id, day_id: d.id, name: x.name.trim(), kind: isTime ? 'time' : 'sets',
        sets: isTime ? 1 : Math.round(num(x.sets)), reps: isTime ? '1' : x.reps.trim(),
        load_kg: hasLoad ? num(x.load) : null,
        duration_min: isTime ? Math.round(num(x.min)) : null, position: i,
      });
    }));
    if (exRows.length) {
      r = await sb.from('workout_exercises').upsert(exRows);
      if (r.error) return fail(r.error);
    }

    S.planId = ed.id;
    S.ed = null;
    S.view = 'home';
    toast('Ficha salva!');
    const e2 = await loadAll();
    if (e2) return toast('Salvei, mas não consegui recarregar: ' + e2.message);
    render();
    window.scrollTo(0, 0);
  }

  async function deletePlan() {
    if (!window.confirm('Apagar esta ficha? Os treinos que você já fez continuam no histórico.')) return;
    const sb = G.sb;
    const r = await sb.from('workout_plans').delete().eq('id', S.ed.id);
    if (r.error) return toast('Não consegui apagar: ' + r.error.message);
    S.ed = null;
    S.planId = null;
    S.view = 'home';
    await loadAll();
    render();
    window.scrollTo(0, 0);
    toast('Ficha apagada.');
  }

  // ------------------------------------------------------------------
  // PESO DA SEMANA (pergunta ao iniciar o treino)
  // ------------------------------------------------------------------
  async function maybeAskWeight() {
    const today = G.hojeISO();
    const ws = weekStartISO();
    if (lsGet('goliira:peso:semana') === ws || lsGet('goliira:peso:adiado') === today) return;
    const r = await G.sb.from('weight_logs').select('weight_kg, logged_on').order('logged_on', { ascending: false }).limit(1);
    if (r.error) return;
    const last = (r.data || [])[0];
    if (last && last.logged_on >= ws) return;
    await askWeightModal(last);
  }

  function askWeightModal(last) {
    return new Promise((resolve) => {
      const root = $('#modalRoot');
      root.innerHTML =
        '<div class="modal-overlay"><form class="modal-card" id="pesoForm" novalidate>' +
          '<div class="modal-header"><span class="modal-title">Peso da semana</span></div>' +
          '<p class="muted">Se a academia tiver balança, que tal registrar seu peso antes do treino? Assim a gente compara com as semanas anteriores.</p>' +
          (last ? '<p class="muted">Último registro: <strong>' + fmtKg(last.weight_kg) + ' kg</strong> em ' + esc(last.logged_on.slice(8, 10) + '/' + last.logged_on.slice(5, 7)) + '</p>' : '') +
          '<label class="field">Peso hoje (kg)<input name="peso" inputmode="decimal" autocomplete="off" placeholder="Ex.: 82,5">' +
            '<small>Pese-se sempre nas mesmas condições (antes do treino, com roupa parecida).</small></label>' +
          '<div class="error" id="pesoErr"></div>' +
          '<button class="btn-action" type="submit">Registrar e iniciar treino</button>' +
          '<button class="btn-ghost" type="button" id="pesoSkip">Agora não</button>' +
          '<button class="btn-link" type="button" id="pesoSemana">Não perguntar esta semana</button>' +
        '</form></div>';
      const close = () => { root.innerHTML = ''; resolve(); };
      $('#pesoSkip').onclick = () => { lsSet('goliira:peso:adiado', G.hojeISO()); close(); };
      $('#pesoSemana').onclick = () => { lsSet('goliira:peso:semana', weekStartISO()); close(); };
      $('#pesoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const w = num(e.target.peso.value);
        if (!(w >= 20 && w <= 400)) { $('#pesoErr').textContent = 'Coloque um peso entre 20 e 400 kg.'; return; }
        const rounded = Math.round(w * 10) / 10;
        const sb = G.sb;
        const up = await sb.from('weight_logs').upsert({ weight_kg: rounded, logged_on: G.hojeISO() }, { onConflict: 'user_id,logged_on' });
        if (up.error) { $('#pesoErr').textContent = 'Erro ao salvar: ' + up.error.message; return; }
        await sb.from('profiles').update({ weight_kg: rounded }).eq('id', G.session.user.id);
        G.profile.weight_kg = rounded;
        if (last) {
          const diff = Math.round((rounded - Number(last.weight_kg)) * 10) / 10;
          toast('Peso registrado: ' + fmtKg(rounded) + ' kg (' + (diff > 0 ? '+' : '') + fmtKg(diff) + ' desde a última vez)');
        } else {
          toast('Peso registrado: ' + fmtKg(rounded) + ' kg');
        }
        close();
      });
    });
  }

  // ------------------------------------------------------------------
  // TREINO EM ANDAMENTO
  // ------------------------------------------------------------------
  async function startWorkout(dayId, btn) {
    if (S.active) return;
    btn.disabled = true;
    try {
      await maybeAskWeight();
      const sb = G.sb;
      const day = S.days.find((d) => d.id === dayId);
      const plan = S.plans.find((p) => p.id === day.plan_id);
      const exs = dayExs(dayId);
      const ins = await sb.from('workout_sessions')
        .insert({ plan_id: plan.id, day_id: day.id, plan_name: plan.name, day_title: day.title })
        .select('*').single();
      if (ins.error) throw ins.error;
      const rows = exs.map((x, i) => ({
        session_id: ins.data.id, exercise_id: x.id, name: x.name, kind: x.kind || 'sets',
        sets: x.kind === 'time' ? null : x.sets, reps: x.kind === 'time' ? null : x.reps,
        duration_min: x.duration_min, planned_load_kg: x.load_kg, done_load_kg: x.load_kg,
        done: false, position: i,
      }));
      const it = await sb.from('workout_session_items').insert(rows).select('*');
      if (it.error) {
        await sb.from('workout_sessions').delete().eq('id', ins.data.id);
        throw it.error;
      }
      S.active = { session: ins.data, items: (it.data || []).sort(byPos) };
      S.view = 'run';
      render();
      window.scrollTo(0, 0);
    } catch (e) {
      btn.disabled = false;
      toast('Não consegui iniciar: ' + (e && e.message ? e.message : e));
    }
  }

  function runHtml() {
    const s = S.active.session;
    const items = S.active.items;
    const done = items.filter((i) => i.done).length;
    let h = '<div class="run-bar" id="runBar">' +
      '<div class="run-info"><div class="run-title">' + esc(s.day_title) + '</div>' +
      '<div class="run-sub"><span id="runCount">' + done + '/' + items.length + '</span> exercícios</div></div>' +
      '<div class="run-timer" id="runTimer">' + fmtClock(Date.now() - new Date(s.started_at).getTime()) + '</div>' +
      '<button class="btn-action btn-small" type="button" data-t="finish">Encerrar</button></div>' +
      '<div id="finishWarn"></div>';
    items.forEach((it, i) => { h += itemHtml(it, i); });
    h += '<button class="btn-link danger" type="button" data-t="discard">Descartar este treino</button>';
    return h;
  }

  function itemHtml(it, i) {
    const target = it.kind === 'time' ? it.duration_min + ' min' : it.sets + 'x' + it.reps;
    return '<div class="card-box ex-card' + (it.done ? ' done' : '') + '" data-card="' + i + '">' +
      '<button class="check" type="button" data-t="check" data-i="' + i + '" aria-label="Marcar como feito">' + (it.done ? ic('check') : '') + '</button>' +
      '<div class="ex-main"><div class="ex-name">' + esc(it.name) + '</div><div class="ex-target">' + esc(target) + '</div></div>' +
      (it.kind === 'time' ? '' :
        '<label class="load-box">Carga<span><input data-load="' + i + '" inputmode="decimal" placeholder="—" value="' +
        (it.done_load_kg == null ? '' : esc(fmtKg(it.done_load_kg))) + '"> kg</span></label>') +
      '</div>';
  }

  function startTick() {
    stopTick();
    if (!S.active) return;
    const t0 = new Date(S.active.session.started_at).getTime();
    const upd = () => { const el = $('#runTimer'); if (el) el.textContent = fmtClock(Date.now() - t0); };
    upd();
    tickTimer = setInterval(upd, 1000);
    const hdr = $('.app-header');
    const bar = $('#runBar');
    if (hdr && bar) bar.style.top = hdr.offsetHeight + 'px';
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function refreshItemDom(i) {
    const it = S.active.items[i];
    const card = document.querySelector('[data-card="' + i + '"]');
    if (card) {
      card.classList.toggle('done', !!it.done);
      const ck = card.querySelector('.check');
      if (ck) ck.innerHTML = it.done ? ic('check') : '';
    }
    const c = $('#runCount');
    if (c) c.textContent = S.active.items.filter((x) => x.done).length + '/' + S.active.items.length;
  }

  async function toggleItem(i) {
    const it = S.active.items[i];
    const wasDone = it.done;
    const wasAt = it.done_at;
    const inp = document.querySelector('[data-load="' + i + '"]');
    if (inp) { const v = num(inp.value); it.done_load_kg = isNaN(v) ? null : v; }
    it.done = !wasDone;
    it.done_at = it.done ? new Date().toISOString() : null;
    refreshItemDom(i);
    const r = await G.sb.from('workout_session_items')
      .update({ done: it.done, done_at: it.done_at, done_load_kg: it.done_load_kg }).eq('id', it.id);
    if (r.error) {
      it.done = wasDone; it.done_at = wasAt;
      refreshItemDom(i);
      toast('Não consegui salvar o check: ' + r.error.message);
    }
  }

  async function saveLoad(i, input) {
    const it = S.active.items[i];
    const raw = input.value.trim();
    let v = null;
    if (raw !== '') {
      v = num(raw);
      if (isNaN(v) || v < 0 || v > 9999) { toast('Carga inválida.'); input.value = it.done_load_kg == null ? '' : fmtKg(it.done_load_kg); return; }
    }
    it.done_load_kg = v;
    input.value = v == null ? '' : fmtKg(v);
    const r = await G.sb.from('workout_session_items').update({ done_load_kg: v }).eq('id', it.id);
    if (r.error) toast('Não consegui salvar a carga: ' + r.error.message);
  }

  async function syncLoads() {
    const jobs = [];
    S.active.items.forEach((it, i) => {
      const inp = document.querySelector('[data-load="' + i + '"]');
      if (!inp) return;
      const raw = inp.value.trim();
      const v = raw === '' ? null : num(raw);
      if (raw !== '' && isNaN(v)) return;
      if ((v == null ? null : v) !== (it.done_load_kg == null ? null : Number(it.done_load_kg))) {
        it.done_load_kg = v;
        jobs.push(G.sb.from('workout_session_items').update({ done_load_kg: v }).eq('id', it.id));
      }
    });
    if (jobs.length) await Promise.all(jobs);
  }

  function onFinishTap() {
    const pend = S.active.items.filter((i) => !i.done).length;
    if (pend > 0) {
      const w = $('#finishWarn');
      w.innerHTML = '<div class="card-box warn"><p>Faltam <strong>' + pend + '</strong> exercício(s). Encerrar mesmo assim?</p>' +
        '<div class="row-btns"><button class="btn-ghost" type="button" data-t="finish-back">Voltar pro treino</button>' +
        '<button class="btn-action" type="button" data-t="finish-anyway">Encerrar mesmo</button></div></div>';
      w.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    doFinish();
  }

  function playVictory() {
    try {
      const a = new Audio('/assets/vitoria.mp3');
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* sem som */ }
  }

  async function doFinish() {
    // som e confete no toque (o iPhone só libera o áudio com um toque do usuário)
    playVictory();
    confetti();
    setTimeout(confetti, 350);
    stopTick();
    try { await syncLoads(); } catch (e) { /* segue */ }
    const finishedAt = new Date().toISOString();
    const r = await G.sb.from('workout_sessions').update({ finished_at: finishedAt }).eq('id', S.active.session.id);
    if (r.error) {
      toast('Não consegui encerrar: ' + r.error.message);
      startTick();
      return;
    }
    const session = Object.assign({}, S.active.session, { finished_at: finishedAt });
    const items = S.active.items.map((x) => Object.assign({}, x));
    S.fin = {
      session, items, step: 'ask', diff: null,
      done: items.filter((x) => x.done).length, total: items.length,
      durationMs: new Date(finishedAt) - new Date(session.started_at),
      facts: null, parts: [], changes: [], changesState: 'idle',
    };
    S.active = null;
    S.view = 'finish';
    render();
    window.scrollTo(0, 0);
  }

  async function discardWorkout() {
    if (!window.confirm('Descartar este treino? Nada será salvo no histórico.')) return;
    const r = await G.sb.from('workout_sessions').delete().eq('id', S.active.session.id);
    if (r.error) return toast('Não consegui descartar: ' + r.error.message);
    S.active = null;
    S.view = 'home';
    await loadAll();
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // TREINO CONCLUÍDO: dificuldade, resumo e mensagem do Gorilão
  // ------------------------------------------------------------------
  function finishHtml() {
    const f = S.fin;
    if (f.step === 'ask') {
      return '<div class="card-box highlight center">' +
        '<img class="fin-gorila" src="/img/gorila.png" alt=""><div class="card-title-text">Treino concluído!</div>' +
        '<div class="stats"><div><strong>' + fmtClock(f.durationMs) + '</strong><span>tempo</span></div>' +
        '<div><strong>' + f.done + '/' + f.total + '</strong><span>exercícios</span></div></div></div>' +
        '<div class="card-box"><div class="card-title-text">Como foi o treino?</div><div class="diff-grid">' +
        DIFFS.map((d) => '<button class="btn-action" type="button" data-t="diff" data-id="' + d.id + '">' + esc(d.label) + '</button>').join('') +
        '</div></div>';
    }

    const df = diffOf(f.diff);
    let h = '<div class="card-box highlight"><div class="card-header-flex"><span class="card-title-text">🦍 Gorilão</span><span class="card-tag">Avaliação</span></div>' +
      '<div class="card-body">' + f.parts.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
      '<div class="muted">' + fmtClock(f.durationMs) + ' · ' + f.done + '/' + f.total + ' exercícios' + (df ? ' · ' + esc(df.label) : '') + '</div></div>';

    const cmp = f.facts ? f.facts.compare : [];
    if (cmp.length) {
      h += '<div class="card-box"><div class="card-title-text">Comparado com o último treino</div><ul class="recent-list">' +
        cmp.map((c) => '<li><span>' + esc(c.name) + '</span><span class="ex-meta ' + c.dir + '">' + fmtKg(c.from) + ' → ' + fmtKg(c.to) + ' kg ' + (c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '=') + '</span></li>').join('') +
        '</ul></div>';
    }

    if (f.changes.length && f.changesState === 'idle') {
      h += '<div class="card-box"><div class="card-title-text">Atualizar a ficha com as cargas de hoje?</div><ul class="recent-list">' +
        f.changes.map((c) => '<li><span>' + esc(c.name) + '</span><span class="ex-meta">' + (c.from == null ? '—' : fmtKg(c.from)) + ' → ' + fmtKg(c.to) + ' kg</span></li>').join('') +
        '</ul><div class="row-btns"><button class="btn-ghost" type="button" data-t="keep-ficha">Manter a ficha</button>' +
        '<button class="btn-action" type="button" data-t="upd-ficha">Atualizar ficha</button></div></div>';
    }
    h += '<button class="btn-action btn-lg" type="button" data-t="fin-back">Voltar ao Treino</button>';
    return h;
  }

  async function computeFacts(fin) {
    const sb = G.sb;
    const cur = fin.session;
    const prev = await sb.from('workout_sessions').select('*').not('finished_at', 'is', null)
      .neq('id', cur.id).order('started_at', { ascending: false }).limit(40);
    if (prev.error) throw prev.error;
    const sessions = prev.data || [];
    const sameDay = sessions.filter((s) => (cur.day_id && s.day_id === cur.day_id) || norm(s.day_title) === norm(cur.day_title));

    let items = [];
    if (sessions.length) {
      const it = await sb.from('workout_session_items').select('*').in('session_id', sessions.map((s) => s.id)).eq('done', true);
      if (!it.error) items = it.data || [];
    }
    const order = new Map(sessions.map((s, i) => [s.id, i]));
    items.sort((a, b) => order.get(a.session_id) - order.get(b.session_id));
    const lastByName = {};
    items.forEach((x) => {
      if (x.kind === 'time' || x.done_load_kg == null) return;
      const k = norm(x.name);
      if (!(k in lastByName)) lastByName[k] = Number(x.done_load_kg);
    });

    const ups = [], downs = [], same = [], compare = [];
    fin.items.forEach((x) => {
      if (!x.done || x.kind === 'time' || x.done_load_kg == null) return;
      const before = lastByName[norm(x.name)];
      if (before == null) return;
      const now = Number(x.done_load_kg);
      const row = { name: x.name, from: before, to: now };
      if (now > before) { ups.push(row); compare.push(Object.assign({ dir: 'up' }, row)); }
      else if (now < before) { downs.push(row); compare.push(Object.assign({ dir: 'down' }, row)); }
      else { same.push(row); compare.push(Object.assign({ dir: 'same' }, row)); }
    });

    const recentSame = sameDay.slice(0, 5).filter((s) => s.finished_at);
    const avgMs = recentSame.length
      ? recentSame.reduce((t, s) => t + (new Date(s.finished_at) - new Date(s.started_at)), 0) / recentSame.length
      : 0;

    return {
      firstTime: sameDay.length === 0, ups, downs, same, compare,
      done: fin.done, total: fin.total, durationMs: fin.durationMs, avgMs,
      difficulty: fin.diff, prevDifficulty: sameDay[0] ? sameDay[0].difficulty : null,
    };
  }

  // O app calcula os fatos; o Gorilão (por enquanto, por regras) só comenta.
  function gorilaoParts(f) {
    const p = [];
    if (f.firstTime) p.push('Primeiro registro desse treino! Esse é o ponto de partida. Nos próximos, a gente compara carga e tempo.');
    if (f.ups.length === 1) {
      p.push('Você aumentou a carga no ' + f.ups[0].name + ' (' + fmtKg(f.ups[0].from) + ' → ' + fmtKg(f.ups[0].to) + ' kg). Muito bem, evolução na veia! 🦍');
    } else if (f.ups.length > 1) {
      p.push('Você aumentou a carga em ' + f.ups.length + ' exercícios, como no ' + f.ups[0].name + ' (' + fmtKg(f.ups[0].from) + ' → ' + fmtKg(f.ups[0].to) + ' kg). Evolução de verdade! 🦍');
    }
    if (f.downs.length) {
      p.push('Você baixou a carga em ' + listaNomes(f.downs) + '. Sem problema: dia ruim acontece, e o que vale é não faltar.');
    } else if (!f.firstTime && !f.ups.length && f.same.length) {
      p.push('Cargas iguais às do último treino. Constância também é resultado.');
    }
    if (f.done < f.total) p.push('Você fez ' + f.done + ' de ' + f.total + ' exercícios. Sem cobrança: no próximo, a gente fecha o que faltou.');
    if (f.avgMs) p.push('Tempo: ' + fmtMin(f.durationMs) + ' (sua média nesse treino: ' + fmtMin(f.avgMs) + ').');
    switch (f.difficulty) {
      case 'babinha':
        p.push(f.prevDifficulty === 'babinha'
          ? 'Dois treinos seguidos na babinha: já dá pra subir as cargas, aos poucos (algo entre 2% e 5%).'
          : 'Você marcou babinha. Se repetir no próximo, a gente sobe as cargas.');
        break;
      case 'file': p.push('Só o filé! Intensidade na medida, segue assim. 👌🏽'); break;
      case 'pesado': p.push('Treino pesado. Mantenha as cargas e capriche na execução.'); break;
      case 'deus': p.push('Vi Deus de perto, hein! 🙏 Hidrate, descanse e pegue mais leve no próximo treino. Se você sentiu dor (e não só cansaço), pare e procure um profissional.'); break;
      default: break;
    }
    return p;
  }

  async function pickDifficulty(id) {
    const f = S.fin;
    document.querySelectorAll('[data-t="diff"]').forEach((b) => { b.disabled = true; });
    f.diff = id;
    const r = await G.sb.from('workout_sessions').update({ difficulty: id }).eq('id', f.session.id);
    if (r.error) toast('Não consegui salvar a dificuldade: ' + r.error.message);
    f.session.difficulty = id;
    try {
      f.facts = await computeFacts(f);
      f.parts = gorilaoParts(f.facts);
    } catch (e) {
      f.facts = null;
      f.parts = ['Treino registrado! Não consegui comparar com os anteriores agora, mas ele já está salvo.'];
    }
    f.changes = f.items
      .filter((x) => x.done && x.exercise_id && x.kind !== 'time' && x.done_load_kg != null &&
        Number(x.done_load_kg) !== (x.planned_load_kg == null ? null : Number(x.planned_load_kg)))
      .map((x) => ({ id: x.exercise_id, name: x.name, from: x.planned_load_kg == null ? null : Number(x.planned_load_kg), to: Number(x.done_load_kg) }));
    f.step = 'result';
    render();
    window.scrollTo(0, 0);
  }

  async function updateFicha() {
    const f = S.fin;
    const sb = G.sb;
    const results = await Promise.all(f.changes.map((c) => sb.from('workout_exercises').update({ load_kg: c.to }).eq('id', c.id)));
    const bad = results.find((x) => x.error);
    if (bad) return toast('Não consegui atualizar a ficha: ' + bad.error.message);
    f.changes.forEach((c) => {
      const ex = S.exercises.find((x) => x.id === c.id);
      if (ex) ex.load_kg = c.to;
    });
    f.changesState = 'done';
    toast('Ficha atualizada!');
    rerender();
  }

  async function finishBack() {
    S.fin = null;
    S.view = 'home';
    const err = await loadAll();
    if (err) return toast('Erro ao recarregar: ' + err.message);
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Eventos (um só ouvinte para toda a aba)
  // ------------------------------------------------------------------
  function onClick(e) {
    const el = e.target.closest('[data-t]');
    if (!el || el.tagName === 'SELECT') return;
    const t = el.dataset.t;
    const d = el.dataset.d != null ? Number(el.dataset.d) : null;
    const x = el.dataset.e != null ? Number(el.dataset.e) : null;
    const ed = S.ed;

    switch (t) {
      case 'new-plan': S.ed = newEditor(); S.view = 'editor'; render(); window.scrollTo(0, 0); break;
      case 'edit-plan': {
        const plan = S.plans.find((p) => p.id === S.planId);
        if (plan) { S.ed = editorFromPlan(plan); S.view = 'editor'; render(); window.scrollTo(0, 0); }
        break;
      }
      case 'start': startWorkout(el.dataset.day, el); break;

      // editor
      case 'ex-add': ed.days[d].exercises.push(newEx()); rerender(); break;
      case 'ex-del': {
        const gone = ed.days[d].exercises.splice(x, 1)[0];
        if (gone && !gone.isNew) ed.removedEx.push(gone.id);
        rerender(); break;
      }
      case 'ex-up': { const a = ed.days[d].exercises; [a[x - 1], a[x]] = [a[x], a[x - 1]]; rerender(); break; }
      case 'ex-down': { const a = ed.days[d].exercises; [a[x + 1], a[x]] = [a[x], a[x + 1]]; rerender(); break; }
      case 'day-add': ed.days.push(newDay(ed.days.length)); rerender(); break;
      case 'day-del': {
        if (!window.confirm('Remover este treino e os exercícios dele?')) break;
        const gone = ed.days.splice(d, 1)[0];
        if (gone && !gone.isNew) ed.removedDays.push(gone.id);
        rerender(); break;
      }
      case 'day-up': { const a = ed.days; [a[d - 1], a[d]] = [a[d], a[d - 1]]; rerender(); break; }
      case 'day-down': { const a = ed.days; [a[d + 1], a[d]] = [a[d], a[d + 1]]; rerender(); break; }
      case 'ed-cancel': S.ed = null; S.view = 'home'; render(); window.scrollTo(0, 0); break;
      case 'ed-save': saveEditor(); break;
      case 'plan-del': deletePlan(); break;

      // treino em andamento
      case 'check': toggleItem(Number(el.dataset.i)); break;
      case 'finish': onFinishTap(); break;
      case 'finish-back': $('#finishWarn').innerHTML = ''; break;
      case 'finish-anyway': doFinish(); break;
      case 'discard': discardWorkout(); break;

      // treino concluído
      case 'diff': pickDifficulty(el.dataset.id); break;
      case 'upd-ficha': updateFicha(); break;
      case 'keep-ficha': S.fin.changesState = 'kept'; rerender(); break;
      case 'fin-back': finishBack(); break;
      default: break;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (S.view !== 'editor' || !S.ed || t.tagName === 'SELECT') return;
    const f = t.dataset.f;
    if (!f) return;
    if (t.dataset.d == null) { S.ed[f] = t.value; return; }
    const day = S.ed.days[Number(t.dataset.d)];
    if (t.dataset.e == null) { day[f] = t.value; return; }
    day.exercises[Number(t.dataset.e)][f] = t.value;
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.t === 'plan-select') { setActivePlan(t.value); return; }
    if (t.dataset.load != null && S.active) { saveLoad(Number(t.dataset.load), t); return; }
    if (S.view !== 'editor' || !S.ed || t.tagName !== 'SELECT') return;
    const f = t.dataset.f;
    if (!f) return;
    const day = S.ed.days[Number(t.dataset.d)];
    if (t.dataset.e == null) { day[f] = t.value; return; }
    day.exercises[Number(t.dataset.e)][f] = t.value;
    if (f === 'kind') rerender();
  }

  const view = $('#view');
  view.addEventListener('click', onClick);
  view.addEventListener('input', onInput);
  view.addEventListener('change', onChange);

  // ------------------------------------------------------------------
  // Cartão na aba HOJE
  // ------------------------------------------------------------------
  G.hojeCard = async function () {
    const sb = G.sb;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const r = await Promise.all([
      sb.from('workout_sessions').select('id, day_title').is('finished_at', null).limit(1),
      sb.from('workout_sessions').select('id, day_title').gte('finished_at', start.toISOString()).limit(1),
      sb.from('workout_plans').select('id, is_active'),
      sb.from('workout_days').select('id, plan_id, title, weekday'),
    ]);
    if (r.some((x) => x.error)) return '';
    const card = (title, text, btn) => '<div class="card-box highlight">' +
      '<div class="card-header-flex"><span class="card-title-text">' + title + '</span><span class="card-tag">Treino</span></div>' +
      '<div class="card-body"><p>' + text + '</p></div>' +
      (btn ? '<a class="btn-action link" href="#treino">' + btn + '</a>' : '') + '</div>';

    const open = (r[0].data || [])[0];
    if (open) return card('Treino em andamento', '<strong>' + esc(open.day_title) + '</strong> está rolando. Bora terminar!', 'Continuar treino');
    const doneToday = (r[1].data || [])[0];
    if (doneToday) return card('Treino de hoje concluído', '<strong>' + esc(doneToday.day_title) + '</strong> feito. A matilha agradece! 🦍', '');
    const act = (r[2].data || []).find((x) => x.is_active);
    if (!act) return '';
    const day = (r[3].data || []).find((x) => x.plan_id === act.id && x.weekday === new Date().getDay());
    if (!day) return '';
    return card('Treino de hoje', '<strong>' + esc(day.title) + '</strong> está na sua agenda de hoje. Bora?', 'Ir para o Treino');
  };
})();
