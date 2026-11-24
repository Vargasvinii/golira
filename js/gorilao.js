// GOLIRA - O gorila da Hoje (estilo Tamagochi) + recado do Gorilão
// A força do gorila (0 a 100%) vem da água, do treino e dos hábitos do dia.
// O recado é calculado pelo app com regras (a IA de verdade entra no chat do Gorilão).
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;

  const S = { loaded: false, hasPlan: false, planDay: '', open: false };
  let lastP = 0;
  let raf = null;

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
  function facts() {
    const w = G.waterState ? G.waterState() : { total: 0, goal: 3000 };
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
  // O gorila (SVG que muda com a força p, de 0 a 1)
  // ------------------------------------------------------------------
  function scene(p) {
    const cx = 120;
    const rx = L(30, 60, p), ry = L(46, 58, p), ty = L(172, 166, p);
    const hy = L(130, 103, p), hr = L(21, 25, p);
    const sy = L(152, 140, p), sr = L(12, 27, p);
    const aw = L(11, 30, p);
    const fur = '#2E292B', hi = '#4A4245', skin = '#B89A84', sd = '#8C7262', dark = '#161213';
    let o = '';

    // sombra no chão e pernas
    o += '<ellipse cx="' + cx + '" cy="241" rx="' + L(34, 62, p) + '" ry="6" fill="rgba(0,0,0,0.35)"/>';
    [-1, 1].forEach((s) => {
      o += '<ellipse cx="' + (cx + s * rx * 0.5) + '" cy="226" rx="' + L(13, 24, p) + '" ry="13" fill="' + fur + '"/>';
    });

    // corpo e peito
    o += '<ellipse cx="' + cx + '" cy="' + ty + '" rx="' + rx + '" ry="' + ry + '" fill="url(#gfur)"/>';
    o += '<ellipse cx="' + cx + '" cy="' + (ty - 8) + '" rx="' + rx * 0.6 + '" ry="' + ry * 0.55 + '" fill="' + hi + '" opacity="0.35"/>';

    // regata GOLIRA FODÃO (larga e caída quando está fraco, justa quando está forte)
    const th = L(rx * 1.22, rx * 0.99, p);
    const so = L(rx * 0.7, rx * 0.74, p);
    const nk = L(15, 19, p);
    const yTop = sy - 8;
    const yBot = ty + ry - 4 + L(9, -2, p);
    o += '<path d="M' + (cx - so) + ' ' + yTop + 'L' + (cx - nk) + ' ' + yTop + 'L' + cx + ' ' + (yTop + 24) + 'L' + (cx + nk) + ' ' + yTop +
      'L' + (cx + so) + ' ' + yTop + 'Q' + (cx + th) + ' ' + (yTop + 16) + ' ' + (cx + th) + ' ' + ty +
      'L' + (cx + th * 0.96) + ' ' + yBot + 'Q' + cx + ' ' + (yBot + 6) + ' ' + (cx - th * 0.96) + ' ' + yBot +
      'L' + (cx - th) + ' ' + ty + 'Q' + (cx - th) + ' ' + (yTop + 16) + ' ' + (cx - so) + ' ' + yTop + 'Z" fill="#7A1B2B" stroke="#D12B45" stroke-width="1.4" stroke-linejoin="round"/>';
    const fs = L(8.5, 14.5, p);
    o += '<g fill="#F6E7D4" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="900" text-anchor="middle" opacity="' + L(0.75, 1, p) + '">' +
      '<text x="' + cx + '" y="' + (ty + 2) + '" font-size="' + fs + '" letter-spacing="0.6">GOLIRA</text>' +
      '<text x="' + cx + '" y="' + (ty + 2 + fs * 1.15) + '" font-size="' + fs + '" letter-spacing="0.6">FODÃO</text></g>';

    // ombros, braços e bíceps
    [-1, 1].forEach((s) => {
      const sx = cx + s * rx * 0.92;
      o += '<ellipse cx="' + sx + '" cy="' + sy + '" rx="' + sr + '" ry="' + sr * 0.9 + '" fill="' + fur + '"/>';
      const S0 = [sx, sy + 4];
      const E = [cx + s * L(rx + 14, rx + 46, p), L(188, 164, p)];
      const H = [cx + s * L(rx + 8, rx + 30, p), L(216, 122, p)];
      const d = 'M' + S0[0] + ' ' + S0[1] + 'Q' + E[0] + ' ' + E[1] + ' ' + H[0] + ' ' + H[1];
      o += '<path d="' + d + '" stroke="' + fur + '" stroke-width="' + aw + '" stroke-linecap="round" fill="none"/>';
      o += '<path d="' + d + '" stroke="' + hi + '" stroke-width="' + aw * 0.3 + '" stroke-linecap="round" fill="none" opacity="0.5"/>';
      if (p > 0.35) {
        const br = L(0, 17, p);
        o += '<circle cx="' + (E[0] - s * 4) + '" cy="' + (E[1] - 8) + '" r="' + br + '" fill="' + fur + '" stroke="' + hi + '" stroke-width="1.6" opacity="' + clamp((p - 0.35) * 3, 0, 1) + '"/>';
      }
      o += '<circle cx="' + H[0] + '" cy="' + H[1] + '" r="' + aw * 0.62 + '" fill="' + sd + '"/>';
    });

    // cabeça (cai para frente quando está fraco)
    const tilt = L(9, 0, p);
    o += '<g transform="rotate(' + tilt + ' ' + cx + ' ' + (hy + hr) + ')">';
    [-1, 1].forEach((s) => { o += '<circle cx="' + (cx + s * hr * 0.98) + '" cy="' + hy + '" r="' + hr * 0.28 + '" fill="' + fur + '"/>'; });
    o += '<circle cx="' + cx + '" cy="' + hy + '" r="' + hr + '" fill="' + fur + '" stroke="' + hi + '" stroke-width="1.2"/>';
    o += '<ellipse cx="' + cx + '" cy="' + (hy + hr * 0.2) + '" rx="' + hr * 0.74 + '" ry="' + hr * 0.64 + '" fill="' + skin + '"/>';
    o += '<ellipse cx="' + cx + '" cy="' + (hy - hr * 0.22) + '" rx="' + hr * 0.82 + '" ry="' + hr * 0.2 + '" fill="' + fur + '"/>';
    const ey = hy - hr * 0.02, ex = hr * 0.36, yb = hy - hr * 0.36;
    // sobrancelhas: tristes (fraco) -> marrentas (forte)
    [-1, 1].forEach((s) => {
      o += '<path d="M' + (cx + s * (ex + 6)) + ' ' + (yb + L(3, -3, p)) + 'L' + (cx + s * (ex - 5)) + ' ' + (yb + L(-3, 3, p)) + '" stroke="' + dark + '" stroke-width="3" stroke-linecap="round"/>';
      o += '<ellipse cx="' + (cx + s * ex) + '" cy="' + ey + '" rx="3.3" ry="' + L(0.9, 3.4, p) + '" fill="' + dark + '"/>';
      if (p > 0.5) o += '<circle cx="' + (cx + s * ex - 1) + '" cy="' + (ey - 1) + '" r="1" fill="#fff" opacity="0.9"/>';
    });
    o += '<circle cx="' + (cx - 2.4) + '" cy="' + (hy + hr * 0.24) + '" r="1.3" fill="' + sd + '"/><circle cx="' + (cx + 2.4) + '" cy="' + (hy + hr * 0.24) + '" r="1.3" fill="' + sd + '"/>';
    // boca: de bico caído a sorriso com dentes
    const my = hy + hr * 0.5, ye = my + L(3, -1, p), cy2 = my + L(-4, 8, p);
    const mouth = 'M' + (cx - 8) + ' ' + ye + 'Q' + cx + ' ' + cy2 + ' ' + (cx + 8) + ' ' + ye;
    if (p > 0.75) o += '<path d="' + mouth + 'Z" fill="#F4EFE6" opacity="' + clamp((p - 0.75) * 4, 0, 1) + '"/>';
    o += '<path d="' + mouth + '" stroke="#2A1D1A" stroke-width="2.2" stroke-linecap="round" fill="none"/>';
    // óculos escuros no nível máximo
    if (p > 0.92) {
      const a = clamp((p - 0.92) / 0.06, 0, 1);
      o += '<g opacity="' + a + '"><rect x="' + (cx - hr * 0.7) + '" y="' + (ey - 5) + '" width="' + hr * 1.4 + '" height="9" rx="3.5" fill="#0E0B0C"/>' +
        '<path d="M' + (cx - hr * 0.5) + ' ' + (ey - 3) + 'l5 0M' + (cx + hr * 0.2) + ' ' + (ey - 3) + 'l5 0" stroke="#D12B45" stroke-width="1.6" stroke-linecap="round"/></g>';
    }
    o += '</g>';
    return o;
  }

  function shell() {
    const star = (x, y, r) => '<path class="st" d="M' + x + ' ' + (y - r) + 'L' + (x + r * 0.3) + ' ' + (y - r * 0.3) + 'L' + (x + r) + ' ' + y + 'L' + (x + r * 0.3) + ' ' + (y + r * 0.3) + 'L' + x + ' ' + (y + r) + 'L' + (x - r * 0.3) + ' ' + (y + r * 0.3) + 'L' + (x - r) + ' ' + y + 'L' + (x - r * 0.3) + ' ' + (y - r * 0.3) + 'Z" fill="#9BF0C2"/>';
    return '<svg class="mascot" viewBox="0 0 240 250" role="img" aria-label="Seu gorila">' +
      '<defs>' +
        '<linearGradient id="gbgd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A4A2E"/><stop offset="1" stop-color="#26180F"/></linearGradient>' +
        '<linearGradient id="gbgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14614B"/><stop offset="1" stop-color="#06201A"/></linearGradient>' +
        '<linearGradient id="gfur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C3537"/><stop offset="1" stop-color="#221D1F"/></linearGradient>' +
        '<clipPath id="gclip"><rect width="240" height="250" rx="22"/></clipPath>' +
      '</defs>' +
      '<g clip-path="url(#gclip)">' +
        '<rect class="l-dry" width="240" height="250" fill="url(#gbgd)"/>' +
        '<rect class="l-lush" width="240" height="250" fill="url(#gbgl)"/>' +
        '<circle class="l-sun" cx="192" cy="54" r="26" fill="#E8A55A"/>' +
        '<circle class="l-glow" cx="192" cy="54" r="40" fill="#2FBF71" opacity="0"/>' +
        '<path class="l-dunes" d="M0 206Q60 182 120 202T240 196V250H0Z" fill="#8A6A48"/>' +
        '<path class="l-hills" d="M0 206Q60 188 120 204T240 198V250H0Z" fill="#1C7A55"/>' +
        '<g class="l-cactus" fill="#4F7A3A"><rect x="30" y="170" width="12" height="46" rx="6"/><rect x="18" y="182" width="9" height="22" rx="4.5"/><rect x="22" y="196" width="14" height="8" rx="4"/><rect x="45" y="176" width="9" height="20" rx="4.5"/><rect x="38" y="190" width="14" height="8" rx="4"/></g>' +
        '<g class="l-dust" fill="#E9D3B0"><circle class="dust d1" cx="30" cy="150" r="2"/><circle class="dust d2" cx="60" cy="120" r="1.6"/><circle class="dust d3" cx="20" cy="95" r="1.8"/><circle class="dust d4" cx="50" cy="165" r="1.4"/></g>' +
        '<g class="l-spark">' + star(48, 60, 6) + star(205, 130, 5) + star(30, 140, 4) + star(210, 88, 4) + '</g>' +
        '<g class="gbody"></g>' +
        '<path class="l-sweat" d="M146 114q-5 8 0 11q5-3 0-11z" fill="#7CCBF7"/>' +
      '</g></svg>';
  }

  function applyP(svg, p) {
    if (!svg) return;
    const body = svg.querySelector('.gbody');
    if (body) body.innerHTML = scene(p);
    const set = (sel, v) => { const e = svg.querySelector(sel); if (e) e.style.opacity = String(clamp(v, 0, 1)); };
    set('.l-dry', 1 - p);
    set('.l-lush', p);
    set('.l-sun', (1 - p) * 0.95);
    set('.l-glow', p > 0.9 ? (p - 0.9) * 8 : 0);
    set('.l-dunes', 1 - p);
    set('.l-hills', p);
    set('.l-cactus', (1 - p) * 1.1);
    set('.l-dust', (1 - p * 1.6));
    set('.l-spark', (p - 0.7) * 3.3);
    set('.l-sweat', 1 - p * 3);
    svg.classList.toggle('maxed', p >= 0.95);
  }

  // ------------------------------------------------------------------
  // Card da Hoje
  // ------------------------------------------------------------------
  G.gorilaoHtml = function () {
    const h = G.habitosState ? G.habitosState() : null;
    if (!S.loaded || !(h && h.loaded)) return '';
    const f = facts();
    const p = clamp(power(f), 0, 1);
    const msgs = recados(f, p);
    const pct = Math.round(p * 100);

    const chip = (txt, ok) => '<span class="chip' + (ok ? ' ok' : '') + '">' + txt + '</span>';
    const chips =
      chip('Água ' + Math.round(f.waterPct * 100) + '%', f.waterPct >= 1) +
      chip(f.trained ? 'Treino feito' : (f.open ? 'Treinando' : (f.planDay ? 'Treino pendente' : 'Sem treino hoje')), f.trained) +
      chip(f.junk ? 'Teve junk' : 'Sem junk', !f.junk) +
      (f.smokeOn ? chip('Cigarros ' + f.smokeN + '/' + f.smokeGoal, f.smokeN <= f.smokeGoal) : '');

    return '<div class="card-box gorilao" data-p="' + p + '">' +
      '<div class="card-header-flex"><span class="card-title-text">Seu gorila</span><span class="card-tag" id="gStage">' + stageOf(p) + '</span></div>' +
      '<div class="mascot-wrap">' + shell() + '</div>' +
      '<div class="power"><div class="power-top"><span>Força do dia</span><strong id="gPct">' + pct + '%</strong></div>' +
        '<div class="progress-bar"><div class="progress-fill done" style="width:' + pct + '%"></div></div></div>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="recado"><div class="recado-from">Gorilão</div><p>' + esc(msgs[0]) + '</p>' +
        (msgs.length > 1 ? '<ul>' + msgs.slice(1, 3).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      '</div></div>';
  };

  // chamado depois que a Hoje é desenhada: anima o gorila do nível anterior até o atual
  G.gorilaoMount = function () {
    const card = document.querySelector('.card-box.gorilao');
    if (!card) return;
    const svg = card.querySelector('.mascot');
    const target = Number(card.dataset.p) || 0;
    const from = lastP;
    cancelAnimationFrame(raf);
    if (Math.abs(target - from) < 0.005) { applyP(svg, target); lastP = target; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const p = from + (target - from) * e;
      applyP(svg, p);
      lastP = p;
      if (k < 1) raf = requestAnimationFrame(step); else lastP = target;
    };
    applyP(svg, from);
    raf = requestAnimationFrame(step);
  };

  // para conferir o visual em qualquer nível (uso interno)
  G.gorilaoPreview = function (p) {
    const svg = document.querySelector('.mascot');
    cancelAnimationFrame(raf);
    applyP(svg, p);
    lastP = p;
  };

  // ao voltar pro app, atualiza o recado (a hora do dia muda a mensagem)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && G.route === 'hoje' && S.loaded) G.redrawHoje();
  });
})();
