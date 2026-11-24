// GOLIRA - HÁBITOS (v3)
// Sem junk food (começa verde), treino do dia (check) e cigarro (opcional e privado).
// Tudo aparece na aba Hoje. Cada pessoa só enxerga os próprios registros.
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const ic = G.icon;

  const S = {
    loaded: false,
    missing: false,
    junk: false,          // comeu junk hoje?
    workoutManual: false, // marcou "treinei hoje" na mão
    sessionTitle: '',     // treino concluído na aba Treino hoje (se houver)
    smoke: [],            // registros de cigarro de hoje (mais novo primeiro)
    cfg: { smoke: false, goal: null },
  };

  const isMissing = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' ||
    /schema cache|does not exist/i.test(e.message || ''));

  // ------------------------------------------------------------------
  // Carregar
  // ------------------------------------------------------------------
  G.habitosLoad = async function () {
    const sb = G.sb;
    const today = G.hojeISO();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const r = await Promise.all([
      sb.from('habit_logs').select('id, habit, logged_at').eq('logged_on', today).order('logged_at', { ascending: false }),
      sb.from('user_habits').select('*').maybeSingle(),
      sb.from('workout_sessions').select('day_title').gte('finished_at', start.toISOString()).limit(1),
    ]);

    if (isMissing(r[0].error) || isMissing(r[1].error)) {
      S.missing = true;
      S.loaded = true;
      return;
    }
    S.missing = false;
    const logs = r[0].data || [];
    S.junk = logs.some((x) => x.habit === 'junk');
    S.workoutManual = logs.some((x) => x.habit === 'workout');
    S.smoke = logs.filter((x) => x.habit === 'smoke');
    const c = r[1].data;
    S.cfg = { smoke: !!(c && c.smoke_enabled), goal: c && c.smoke_goal ? Number(c.smoke_goal) : null };
    const ses = r[2].error ? null : (r[2].data || [])[0];
    S.sessionTitle = ses ? ses.day_title : '';
    S.loaded = true;
  };

  // leitura do estado do dia (usado pelo gorila da Hoje)
  G.habitosState = function () {
    return { loaded: S.loaded, missing: S.missing, junk: S.junk, workoutManual: S.workoutManual,
      sessionTitle: S.sessionTitle, smokeCount: S.smoke.length, cfg: { smoke: S.cfg.smoke, goal: S.cfg.goal } };
  };

  G.habitosCfg = function () { return { smoke: S.cfg.smoke, goal: S.cfg.goal }; };

  // devolve '' se deu certo, ou o texto do erro
  G.habitosSaveCfg = async function (on, goal) {
    const r = await G.sb.from('user_habits').upsert(
      { user_id: G.session.user.id, smoke_enabled: !!on, smoke_goal: on ? goal : null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (r.error) return isMissing(r.error) ? 'rode o schema-v3.sql no Supabase' : r.error.message;
    S.cfg = { smoke: !!on, goal: on ? goal : null };
    return '';
  };

  // ------------------------------------------------------------------
  // Pulmãozinho: escurece e encolhe conforme chega (e passa) da meta
  // ------------------------------------------------------------------
  function lungColor(t) {
    const a = [240, 140, 160], b = [52, 50, 56];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return 'rgb(' + c.join(',') + ')';
  }

  function lungsSvg(count, goal) {
    const t = Math.max(0, Math.min(1, count / ((goal || 10) * 1.5)));
    const color = lungColor(t);
    const scale = (1 - 0.2 * t).toFixed(3);
    return '<svg class="lungs" viewBox="0 0 120 100" role="img" aria-label="Pulmões" style="--lung:' + color + ';--ls:' + scale + '">' +
      '<g class="lg">' +
        '<path class="trq" d="M60 6v34M60 40c-6 6-10 8-14 10M60 40c6 6 10 8 14 10" />' +
        '<path class="lobe" d="M54 30C40 26 17 42 15 72c-1 15 9 21 21 19 11-2 18-9 18-22z"/>' +
        '<path class="lobe" d="M66 30C80 26 103 42 105 72c1 15-9 21-21 19-11-2-18-9-18-22z"/>' +
      '</g>' +
    '</svg>';
  }

  // ------------------------------------------------------------------
  // HTML dos cards
  // ------------------------------------------------------------------
  function missingHtml() {
    return '<div class="card-box"><div class="card-header-flex"><span class="card-title-text">Hábitos</span><span class="card-tag">Falta configurar</span></div>' +
      '<div class="card-body"><p>Para ligar os hábitos, rode o arquivo <strong>schema-v3.sql</strong> no SQL Editor do Supabase e atualize a página.</p></div></div>';
  }

  function junkCard() {
    if (!S.junk) {
      return '<div class="card-box habit ok">' +
        '<div class="habit-ico">' + ic('check') + '</div>' +
        '<div class="habit-title">Sem junk food</div>' +
        '<div class="habit-sub">Hoje está limpo. Segue firme.</div>' +
        '<button class="btn-ghost" type="button" data-h="junk-on">Comi junk</button></div>';
    }
    return '<div class="card-box habit bad">' +
      '<div class="habit-ico">' + ic('x') + '</div>' +
      '<div class="habit-title">Teve junk food</div>' +
      '<div class="habit-sub">Sem culpa. Amanhã zera.</div>' +
      '<button class="btn-ghost" type="button" data-h="junk-off">Desfazer</button></div>';
  }

  function trainCard() {
    if (S.sessionTitle) {
      return '<div class="card-box habit ok">' +
        '<div class="habit-ico">' + ic('check') + '</div>' +
        '<div class="habit-title">Treino feito</div>' +
        '<div class="habit-sub">' + G.esc(S.sessionTitle) + '</div></div>';
    }
    if (S.workoutManual) {
      return '<div class="card-box habit ok">' +
        '<div class="habit-ico">' + ic('check') + '</div>' +
        '<div class="habit-title">Treino feito</div>' +
        '<div class="habit-sub">Marcado por você.</div>' +
        '<button class="btn-ghost" type="button" data-h="train-off">Desmarcar</button></div>';
    }
    return '<div class="card-box habit">' +
      '<div class="habit-ico idle">' + ic('treino') + '</div>' +
      '<div class="habit-title">Treino de hoje</div>' +
      '<div class="habit-sub">Ainda não registrado.</div>' +
      '<button class="btn-ghost" type="button" data-h="train-on">Marcar treino feito</button></div>';
  }

  function smokeCard() {
    const n = S.smoke.length;
    const goal = S.cfg.goal || 10;
    let msg = 'Dia limpo até agora.';
    if (n > 0 && n <= goal) msg = 'Dentro da meta. Cada cigarro a menos conta.';
    if (n > goal) msg = 'Passou da meta de hoje. Amanhã é um novo dia.';
    return '<div class="card-box">' +
      '<div class="card-header-flex"><span class="card-title-text">Cigarros hoje</span><span class="card-tag">Privado</span></div>' +
      '<div class="water-row">' +
        lungsSvg(n, goal) +
        '<div class="water-side">' +
          '<div class="water-big"><strong id="smokeN">' + n + '</strong> <span>/ ' + goal + '</span></div>' +
          '<div class="muted">' + msg + '</div>' +
          (n ? '<button class="btn-link" type="button" data-h="smoke-undo">Desfazer último</button>' : '') +
        '</div>' +
      '</div>' +
      '<button class="btn-ghost" type="button" data-h="smoke-add">+ 1 cigarro</button>' +
    '</div>';
  }

  G.habitosHtml = function () {
    if (!S.loaded) return '';
    if (S.missing) return '<div id="habitosBox" class="habs">' + missingHtml() + '</div>';
    return '<div id="habitosBox" class="habs">' +
      '<div class="habit-grid">' + junkCard() + trainCard() + '</div>' +
      (S.cfg.smoke ? smokeCard() : '') +
    '</div>';
  };

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  async function insertLog(habit) {
    const r = await G.sb.from('habit_logs').insert({ habit, logged_on: G.hojeISO() }).select('id, habit, logged_at').single();
    // 23505 = já existe o registro do dia (duplo toque): tudo certo
    if (r.error && r.error.code !== '23505') { G.toast('Não consegui salvar: ' + r.error.message); return null; }
    return r.data || {};
  }
  async function deleteLogs(habit, id) {
    let q = G.sb.from('habit_logs').delete().eq('habit', habit).eq('logged_on', G.hojeISO());
    if (id) q = q.eq('id', id);
    const r = await q;
    if (r.error) { G.toast('Não consegui desfazer: ' + r.error.message); return false; }
    return true;
  }

  async function act(name, btn) {
    if (btn) btn.disabled = true;
    try {
      if (name === 'junk-on') { if (await insertLog('junk')) S.junk = true; }
      else if (name === 'junk-off') { if (await deleteLogs('junk')) S.junk = false; }
      else if (name === 'train-on') { if (await insertLog('workout')) S.workoutManual = true; }
      else if (name === 'train-off') { if (await deleteLogs('workout')) S.workoutManual = false; }
      else if (name === 'smoke-add') {
        const row = await insertLog('smoke');
        if (row) S.smoke.unshift(row);
      } else if (name === 'smoke-undo') {
        const last = S.smoke[0];
        if (last && (await deleteLogs('smoke', last.id))) S.smoke.shift();
      }
    } finally {
      if (G.route === 'hoje') G.redrawHoje();
    }
  }

  const view = document.querySelector('#view');
  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-h]');
    if (el && !el.disabled) act(el.dataset.h, el);
  });
})();
