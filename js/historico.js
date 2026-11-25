// GOLIRA - aba HISTÓRICO (v4)
// Sequência de dias, semana (domingo a sábado), peso e IMC, e evolução de carga.
// Tudo calculado pelo app a partir dos registros brutos (nada de IA aqui).
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;
  const ic = G.icon;
  const $ = (s) => document.querySelector(s);

  const DAYS_BACK = 70;
  const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const isMissing = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || ''));
  const fmt = (n, d) => Number(n).toFixed(d == null ? 1 : d).replace('.', ',');
  const kg = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dayKey = (v) => G.hojeISO(new Date(v));
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // ------------------------------------------------------------------
  // Carregar
  // ------------------------------------------------------------------
  async function loadData() {
    const sb = G.sb;
    const since = addDays(new Date(), -DAYS_BACK);
    since.setHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();
    const sinceDay = G.hojeISO(since);

    const r = await Promise.all([
      sb.from('water_logs').select('amount_ml, logged_at').gte('logged_at', sinceISO).limit(2000),
      sb.from('workout_sessions').select('id, day_title, started_at, finished_at, difficulty').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(120),
      sb.from('habit_logs').select('habit, logged_on').gte('logged_on', sinceDay).limit(2000),
      sb.from('weight_logs').select('weight_kg, logged_on').order('logged_on', { ascending: true }).limit(400),
    ]);
    if (r.slice(1, 2).some((x) => isMissing(x.error)) || isMissing(r[3].error)) return { missing: 'v2' };
    const err = r.map((x) => x.error).find((e) => e && !isMissing(e));
    if (err) return { error: err.message };

    const sessions = r[1].data || [];
    let items = [];
    const ids = sessions.slice(0, 80).map((s) => s.id);
    if (ids.length) {
      const it = await sb.from('workout_session_items').select('session_id, name, kind, done, done_load_kg').in('session_id', ids).eq('done', true).limit(3000);
      if (!it.error) items = it.data || [];
    }
    return {
      water: r[0].error ? [] : (r[0].data || []),
      sessions,
      habits: r[2].error ? [] : (r[2].data || []),
      weights: r[3].data || [],
      items,
      habitsMissing: isMissing(r[2].error),
    };
  }

  // ------------------------------------------------------------------
  // Regras (a partir dos registros)
  // ------------------------------------------------------------------
  function buildDays(data) {
    const goal = G.profile.water_goal_ml || 3000;
    const map = {};
    const get = (k) => (map[k] || (map[k] = { water: 0, trained: false, junk: false }));
    data.water.forEach((w) => { get(dayKey(w.logged_at)).water += w.amount_ml; });
    data.sessions.forEach((s) => { get(dayKey(s.finished_at)).trained = true; });
    data.habits.forEach((h) => {
      const d = get(h.logged_on);
      if (h.habit === 'workout') d.trained = true;
      if (h.habit === 'junk') d.junk = true;
    });
    Object.values(map).forEach((d) => {
      d.waterOk = d.water >= goal;
      d.active = d.waterOk || d.trained;
      d.complete = d.waterOk && d.trained && !d.junk;
    });
    return map;
  }

  function streaks(map) {
    const today = new Date();
    let cur = 0;
    let d = new Date(today);
    // o dia de hoje só quebra a sequência quando acabar
    if (!(map[G.hojeISO(d)] && map[G.hojeISO(d)].active)) d = addDays(d, -1);
    while (map[G.hojeISO(d)] && map[G.hojeISO(d)].active) { cur++; d = addDays(d, -1); }
    let best = 0, run = 0;
    for (let i = DAYS_BACK; i >= 0; i--) {
      const k = G.hojeISO(addDays(today, -i));
      if (map[k] && map[k].active) { run++; best = Math.max(best, run); } else run = 0;
    }
    return { cur, best: Math.max(best, cur) };
  }

  function weekOf(map) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = addDays(now, -now.getDay());
    const todayKey = G.hojeISO(now);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const k = G.hojeISO(d);
      const v = map[k];
      let state = 'none';
      if (k > todayKey) state = 'future';
      else if (v && v.complete) state = 'full';
      else if (v && v.active) state = 'part';
      out.push({ k, i, state, today: k === todayKey, v });
    }
    return out;
  }

  function loadEvolution(data) {
    const order = new Map(data.sessions.map((s, i) => [s.id, i]));
    const groups = {};
    data.items.forEach((x) => {
      if (x.kind === 'time' || x.done_load_kg == null || Number(x.done_load_kg) <= 0) return;
      const k = norm(x.name);
      (groups[k] || (groups[k] = { name: x.name, pts: [] })).pts.push({ o: order.get(x.session_id), v: Number(x.done_load_kg) });
    });
    return Object.values(groups).map((g) => {
      const bySession = {};
      g.pts.forEach((p) => { bySession[p.o] = Math.max(bySession[p.o] || 0, p.v); });
      const seq = Object.keys(bySession).map(Number).sort((a, b) => b - a).map((o) => bySession[o]); // mais antigo -> mais novo
      return { name: g.name, seq };
    }).filter((g) => g.seq.length >= 1).sort((a, b) => b.seq.length - a.seq.length).slice(0, 6);
  }

  function imcInfo(w, hCm) {
    if (!(w > 0) || !(hCm > 0)) return null;
    const m = hCm / 100;
    const v = w / (m * m);
    let cls = 'Peso normal';
    if (v < 18.5) cls = 'Abaixo do peso';
    else if (v >= 30) cls = 'Obesidade';
    else if (v >= 25) cls = 'Sobrepeso';
    return { v, cls };
  }

  // ------------------------------------------------------------------
  // HTML
  // ------------------------------------------------------------------
  function flame() {
    return '<svg class="flame" viewBox="0 0 24 28" aria-hidden="true"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#D12B45"/><stop offset="0.6" stop-color="#FF7A45"/><stop offset="1" stop-color="#FFC857"/></linearGradient></defs>' +
      '<path d="M12 1c1.2 5 7 7.6 7 14.2A7 7 0 0 1 5 15.2c0-2.6 1.3-4.2 2.8-5.4.2 2.6 1.3 3.8 2.6 4.2C9.8 9.4 10.6 5 12 1z" fill="url(#fl)"/>' +
      '<path d="M12 14c.6 2 2.6 3 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1.4.8-2.2 1.6-3 .2 1 .6 1.5 1 1.6-.2-1.4 0-2.6 0-3.8z" fill="#FFE6A8" opacity="0.9"/></svg>';
  }

  function sparkline(vals) {
    if (vals.length < 2) return '';
    const w = 84, h = 26, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => (2 + (i / (vals.length - 1)) * (w - 4)).toFixed(1) + ',' + (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1));
    const last = pts[pts.length - 1].split(',');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="#2FBF71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.8" fill="#2FBF71"/></svg>';
  }

  function weightChart(ws) {
    const pts = ws.slice(-14);
    if (pts.length < 2) return '';
    const W = 300, H = 110, pl = 8, pr = 8, pt = 14, pb = 18;
    const vals = pts.map((p) => Number(p.weight_kg));
    const min = Math.min.apply(null, vals) - 0.5, max = Math.max.apply(null, vals) + 0.5;
    const x = (i) => pl + (i / (pts.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    const line = pts.map((p, i) => x(i).toFixed(1) + ',' + y(Number(p.weight_kg)).toFixed(1)).join(' ');
    const area = 'M' + x(0) + ' ' + (H - pb) + 'L' + line.replace(/ /g, 'L') + 'L' + x(pts.length - 1) + ' ' + (H - pb) + 'Z';
    const lab = (i, v) => '<text x="' + x(i) + '" y="' + (y(v) - 6) + '" text-anchor="' + (i === 0 ? 'start' : 'end') + '" font-size="9.5" font-weight="700" fill="#ECD3B5">' + fmt(v) + '</text>';
    return '<svg class="wchart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5AB8F0" stop-opacity="0.35"/><stop offset="1" stop-color="#5AB8F0" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#wg)"/>' +
      '<polyline points="' + line + '" fill="none" stroke="#5AB8F0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map((p, i) => '<circle cx="' + x(i) + '" cy="' + y(Number(p.weight_kg)) + '" r="3" fill="#0b0b0d" stroke="#5AB8F0" stroke-width="2"/>').join('') +
      lab(0, vals[0]) + lab(pts.length - 1, vals[vals.length - 1]) + '</svg>';
  }

  function render(data) {
    const map = buildDays(data);
    const st = streaks(map);
    const week = weekOf(map);
    const evo = loadEvolution(data);
    const now = new Date();

    // Sequência
    let h = '<div class="card-box highlight streak-card">' +
      '<div class="streak-row">' + flame() +
      '<div class="streak-num"><strong>' + st.cur + '</strong><span>' + (st.cur === 1 ? 'dia seguido' : 'dias seguidos') + '</span></div>' +
      '<div class="streak-best"><span>Recorde</span><strong>' + st.best + '</strong></div></div>' +
      '<p class="muted">' +
        (st.cur === 0 ? 'Sem sequência agora. Bata a meta de água ou treine hoje e ela começa.' :
          'Conta como dia ativo quando você bate a meta de água ou treina.') + '</p></div>';

    // Semana
    const trein = week.filter((d) => d.v && d.v.trained).length;
    const agua = week.filter((d) => d.v && d.v.waterOk).length;
    const junk = week.filter((d) => d.v && d.v.junk).length;
    h += '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Sua semana</span><span class="card-tag">Dom a Sáb</span></div>' +
      '<div class="week">' + week.map((d) =>
        '<div class="wd ' + d.state + (d.today ? ' today' : '') + '" title="' + NOMES[d.i] + '">' +
          '<span class="wl">' + LETTERS[d.i] + '</span>' +
          '<span class="wdot">' + (d.state === 'full' ? ic('check') : '') + '</span></div>').join('') + '</div>' +
      '<div class="legend"><span><i class="lg full"></i>Dia completo</span><span><i class="lg part"></i>Dia ativo</span><span><i class="lg none"></i>Sem registro</span></div>' +
      '<ul class="recent-list"><li><span>Treinos na semana</span><span class="ex-meta">' + trein + '</span></li>' +
      '<li><span>Dias com meta de água</span><span class="ex-meta">' + agua + ' de 7</span></li>' +
      '<li><span>Dias com junk</span><span class="ex-meta">' + junk + '</span></li></ul></div>';

    // 30 dias
    const d30 = addDays(now, -30);
    const ses30 = data.sessions.filter((s) => new Date(s.finished_at) >= d30);
    const ms = ses30.reduce((t, s) => t + (new Date(s.finished_at) - new Date(s.started_at)), 0);
    if (ses30.length) {
      const wk = ses30.length / (30 / 7);
      h += '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Últimos 30 dias</span></div>' +
        '<div class="stats"><div><strong>' + ses30.length + '</strong><span>treinos</span></div>' +
        '<div><strong>' + fmt(wk) + '</strong><span>por semana</span></div>' +
        '<div><strong>' + Math.round(ms / 60000 / ses30.length) + ' min</strong><span>duração média</span></div></div></div>';
    }

    // Peso e IMC
    const ws = data.weights;
    const lastW = ws.length ? Number(ws[ws.length - 1].weight_kg) : G.profile.weight_kg;
    const imc = imcInfo(Number(lastW), Number(G.profile.height_cm));
    h += '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Peso e IMC</span><span class="card-tag">Corpo</span></div>';
    if (imc) {
      h += '<div class="imc-row"><div class="imc-num"><strong>' + fmt(imc.v) + '</strong><span>IMC</span></div>' +
        '<div class="imc-txt"><div class="imc-cls">' + imc.cls + '</div><div class="muted">' + kg(lastW) + ' kg · ' + G.profile.height_cm + ' cm</div></div></div>' +
        '<p class="muted">O IMC não enxerga músculo: quem treina pode dar "sobrepeso" sem ter gordura sobrando. Use como referência, não como sentença.</p>';
    }
    if (ws.length >= 2) {
      const diff = Number(ws[ws.length - 1].weight_kg) - Number(ws[0].weight_kg);
      h += weightChart(ws) +
        '<div class="muted">' + ws.length + ' registros · ' + (diff > 0 ? '+' : '') + fmt(diff) + ' kg desde o primeiro</div>';
    } else {
      h += '<p class="muted">Registre seu peso na primeira vez da semana que o gráfico aparece aqui.</p>';
    }
    h += '</div>';

    // Evolução de carga
    h += '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Evolução de carga</span><span class="card-tag">Treino</span></div>';
    if (!evo.length) {
      h += '<p class="muted">Quando você terminar treinos com carga, a evolução de cada exercício aparece aqui.</p>';
    } else {
      h += '<ul class="evo">' + evo.map((e) => {
        const first = e.seq[0], last = e.seq[e.seq.length - 1];
        const pct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
        const dir = last > first ? 'up' : last < first ? 'down' : 'same';
        return '<li><div class="evo-main"><div class="evo-name">' + esc(e.name) + '</div>' +
          '<div class="ex-meta ' + dir + '">' + (e.seq.length > 1 ? kg(first) + ' → ' + kg(last) + ' kg' + (pct ? ' (' + (pct > 0 ? '+' : '') + pct + '%)' : ' (igual)') : kg(last) + ' kg · 1 registro') + '</div></div>' +
          sparkline(e.seq) + '</li>';
      }).join('') + '</ul>';
    }
    h += '</div>';
    return h;
  }

  // ------------------------------------------------------------------
  // Rota
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Sequência pública (nome, foto e streak que a matilha vê no Mural)
  // ------------------------------------------------------------------
  let lastSync = 0;
  async function streakSet(cur) {
    const p = G.profile;
    if (!p || !('streak_days' in p) || !G.session) return;
    const today = G.hojeISO();
    if (p.streak_days === cur && p.streak_day === today) return;
    const r = await G.sb.from('profiles').update({ streak_days: cur, streak_day: today }).eq('id', G.session.user.id);
    if (!r.error) { p.streak_days = cur; p.streak_day = today; }
  }
  G.streakSync = async function () {
    const p = G.profile;
    if (!p || !('streak_days' in p)) return;
    if (Date.now() - lastSync < 5 * 60 * 1000) return;
    lastSync = Date.now();
    try {
      const d = await loadData();
      if (d.missing || d.error) return;
      await streakSet(streaks(buildDays(d)).cur);
    } catch (e) { /* silencioso */ }
  };

  G.routes.historico = async function () {
    const view = $('#view');
    view.innerHTML = '<div class="card-box"><p class="muted">Carregando seu histórico…</p></div>';
    const data = await loadData();
    if (G.route !== 'historico') return;
    if (data.missing) {
      view.innerHTML = '<div class="card-box highlight"><div class="card-header-flex"><span class="card-title-text">Falta uma configuração</span></div>' +
        '<div class="card-body"><p>O Histórico usa as tabelas do Treino. Rode o <strong>schema-v2.sql</strong> no Supabase e atualize a página.</p></div></div>';
      return;
    }
    if (data.error) {
      view.innerHTML = '<div class="card-box"><p class="error">Erro ao carregar o histórico: ' + esc(data.error) + '</p></div>';
      return;
    }
    view.innerHTML = render(data);
    if (G.enter) G.enter();
    try { await streakSet(streaks(buildDays(data)).cur); lastSync = Date.now(); } catch (e) { /* silencioso */ }
  };
})();
