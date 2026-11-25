// GOLIRA - Força do dia (barra na Hoje) + recado do Gorilão (por regras)
// A força (0 a 100%) vem da água, do treino e dos hábitos do dia.
// O gorila desenhado saiu; o recado será exibido na aba IA.
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;

  const S = { loaded: false, hasPlan: false, planDay: '', open: false };

  const L = (a, b, p) => a + (b - a) * p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtL = (ml) => (ml / 1000).toFixed(1).replace('.', ',');

  // ------------------------------------------------------------------
  // Carregar o que falta (ficha de hoje e treino em andamento)
  // ------------------------------------------------------------------
  G.gorilaoLoad = async function () {
    const sb = G.sb;
    const r = await Promise.all([
      sb.from('workout_plans').select('id, is_active'),
      sb.from('workout_days').select('plan_id, title, weekday'),
      sb.from('workout_sessions').select('id').is('finished_at', null).limit(1),
    ]);
    S.hasPlan = false; S.planDay = ''; S.open = false;
    if (!r[0].error && !r[1].error) {
      const act = (r[0].data || []).find((p) => p.is_active);
      const days = act ? (r[1].data || []).filter((d) => d.plan_id === act.id) : [];
      S.hasPlan = days.length > 0;
      const today = days.find((d) => d.weekday === new Date().getDay());
      S.planDay = today ? today.title : '';
    }
    if (!r[2].error) S.open = (r[2].data || []).length > 0;
    S.loaded = true;
  };

  // ------------------------------------------------------------------
  // Fatos do dia -> força e recado
  // ------------------------------------------------------------------
  function facts(waterTotal) {
    const w = G.waterState ? G.waterState() : { total: 0, goal: 3000 };
    if (typeof waterTotal === 'number') w.total = waterTotal; // aba IA passa a água lida do banco
    const h = G.habitosState ? G.habitosState() : null;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const waterPct = clamp(w.total / (w.goal || 3000), 0, 1);
    const trained = !!(h && (h.sessionTitle || h.workoutManual));
    const junk = !!(h && h.junk);
    const smokeOn = !!(h && h.cfg && h.cfg.smoke);
    const smokeN = h ? h.smokeCount : 0;
    const smokeGoal = h && h.cfg && h.cfg.goal ? h.cfg.goal : 10;
    return { w, hour, waterPct, trained, junk, smokeOn, smokeN, smokeGoal, open: S.open, planDay: S.planDay, hasPlan: S.hasPlan };
  }

  function power(f) {
    const t = f.trained ? 1 : (f.open ? 0.3 : 0);
    const j = f.junk ? 0 : 1;
    if (f.smokeOn) {
      const s = f.smokeN <= f.smokeGoal ? 1 : Math.max(0, 1 - (f.smokeN - f.smokeGoal) / f.smokeGoal);
      return 0.45 * f.waterPct + 0.35 * t + 0.1 * j + 0.1 * s;
    }
    return 0.5 * f.waterPct + 0.4 * t + 0.1 * j;
  }

  function stageOf(p) {
    if (p < 0.2) return 'Seco no deserto';
    if (p < 0.4) return 'Murchinho';
    if (p < 0.6) return 'Se recuperando';
    if (p < 0.8) return 'Ficando forte';
    if (p < 0.95) return 'Bombadão';
    return 'GOLIRA FODÃO';
  }

  function recados(f, p) {
    const m = [];
    const hh = String(Math.floor(f.hour));
    // treino
    if (f.open) m.push('Treino rolando! Foco e respiração. Quando terminar, é só apertar Encerrar.');
    else if (f.trained) m.push('Treino feito hoje. O gorila já está estufando o peito.');
    else if (f.planDay) {
      if (f.hour < 12) m.push('Hoje é dia de ' + f.planDay + '. Já separa a roupa e a garrafinha.');
      else if (f.hour < 18) m.push('Hoje é dia de ' + f.planDay + ' e ainda não rolou. Reserva um horário antes que o dia fuja.');
      else if (f.hour < 21) m.push('São ' + hh + 'h e o ' + f.planDay + ' ainda não saiu. Dá tempo! O gorila está murchando aqui.');
      else m.push('Última chamada para o ' + f.planDay + '! Até um treino curto salva o dia.');
    } else if (!f.hasPlan) m.push('Monte sua ficha na aba Treino e eu passo a te lembrar do treino de cada dia.');
    else m.push('Hoje não tem treino na sua ficha. Descanso bem feito também faz o gorila crescer.');

    // água
    const expected = clamp((f.hour - 7) / 15, 0, 1);
    if (f.waterPct >= 1) m.push('Meta de água batida. Gorila hidratado!');
    else if (f.waterPct === 0 && f.hour < 11) m.push('Bom dia! Primeiro copo d\'água do dia, bora? O gorila está seco.');
    else if (expected - f.waterPct > 0.2) {
      const falta = Math.round(((expected - f.waterPct) * f.w.goal) / 50) * 50;
      m.push('Você está uns ' + falta + ' ml atrás do ritmo de hoje. Um copão agora e a gente empata.');
    } else m.push('Água no ritmo: ' + fmtL(f.w.total) + 'L de ' + fmtL(f.w.goal) + 'L. Segue assim.');

    // hábitos
    if (f.junk) m.push('Teve junk hoje, acontece. Compensa com água e treino, sem culpa.');
    if (f.smokeOn && f.smokeN > f.smokeGoal) m.push('Cigarros acima da meta hoje. Sem julgamento: amanhã a gente tenta de novo.');

    if (p >= 0.95) m.unshift('Dia fechado no verde! Gorila FODÃO desbloqueado.');
    return m;
  }

  // ------------------------------------------------------------------
  // Barra "Força do dia" na Hoje (o gorila e o recado ficam para a aba IA)
  // ------------------------------------------------------------------
  G.gorilaoHtml = function () {
    const h = G.habitosState ? G.habitosState() : null;
    if (!S.loaded || !(h && h.loaded)) return '';
    const pct = Math.round(clamp(power(facts()), 0, 1) * 100);
    const old = document.querySelector('.forca .progress-fill');
    const from = old ? Number(old.dataset.to) || 0 : 0;
    return '<div class="card-box forca" data-to="' + pct + '">' +
      '<div class="power-top"><span>Força do dia</span><strong>' + pct + '%</strong></div>' +
      '<div class="progress-bar"><div class="progress-fill done" data-to="' + pct + '" style="width:' + from + '%"></div></div>' +
      '<div class="muted">Soma da água, do treino e dos hábitos de hoje.</div></div>';
  };

  // depois de desenhar a Hoje: a barra enche devagar até o valor do dia
  G.gorilaoMount = function () {
    const fill = document.querySelector('.forca .progress-fill');
    if (!fill) return;
    const to = Number(fill.dataset.to) || 0;
    if (parseFloat(fill.style.width) === to) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = to + '%'; }));
  };

  // recado do Gorilão (por regras): será usado na aba IA
  G.gorilaoRecados = function (waterTotal) {
    const f = facts(waterTotal);
    return recados(f, clamp(power(f), 0, 1));
  };

  // ao voltar pro app, atualiza a Hoje
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && G.route === 'hoje' && S.loaded) G.redrawHoje();
  });
})();
