(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Estado e utilidades
  // ------------------------------------------------------------------
  const TABS = [
    { id: 'hoje', icon: 'hoje', label: 'Hoje' },
    { id: 'treino', icon: 'treino', label: 'Treino' },
    { id: 'historico', icon: 'historico', label: 'Histórico' },
    { id: 'mural', icon: 'mural', label: 'Mural' },
    { id: 'ia', icon: 'ia', label: 'IA' },
  ];

  // Ícones de traço (todos no mesmo tom, herdam a cor do texto)
  const ICONS = {
    hoje: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15.2l2 2 4-4.2"/>',
    treino: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    historico: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
    mural: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.2-4.3A8.5 8.5 0 1 1 20.5 12z"/>',
    ia: '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M19 3.5v3M17.5 5h3"/>',
    drop: '<path d="M12 3.2s6.3 6.3 6.3 10.7a6.3 6.3 0 0 1-12.6 0C5.7 9.5 12 3.2 12 3.2z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  };
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  let sb = null;          // cliente do Supabase
  let session = null;     // sessão do usuário logado
  let profile = null;     // linha da tabela profiles
  let groupTag = '';      // tag do grupo (texto)
  let route = 'hoje';
  let water = { logs: [], total: 0 };
  let hojeExtra = '';     // HTML extra da aba Hoje (cartão do treino)
  let hojeFirst = true;   // primeira montagem da aba Hoje (anima só ela)

  const $ = (sel, root) => (root || document).querySelector(sel);

  // Ponte com os outros arquivos (ex.: treino.js). Eles se registram em G.routes.
  const G = window.GOLIRA = {
    routes: {},
    cleanup: null,
    get sb() { return sb; },
    get session() { return session; },
    get profile() { return profile; },
    get route() { return route; },
    get groupTag() { return groupTag; },
  };

  function pad2(n) { return String(n).padStart(2, '0'); }
  // Data local no formato 2026-11-18
  function hojeISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtLitros(ml) {
    return (ml / 1000).toFixed(1).replace('.', ',');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function confetti() {
    const colors = ['#ECD3B5', '#D12B45', '#E9E9E9', '#2FBF71', '#5AB8F0'];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.setProperty('--dx', (Math.random() - 0.5) * 200 + 'px');
      c.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
      c.style.animationDelay = Math.random() * 0.3 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
  }

  let enterTimer = null;
  G.enter = function () {
    const v = $('#view');
    if (!v) return;
    clearTimeout(enterTimer);
    v.classList.remove('no-anim', 'route-enter');
    void v.offsetWidth;
    v.classList.add('route-enter');
    enterTimer = setTimeout(() => v.classList.remove('route-enter'), 1000);
  };
  // Avatar: foto (data URL) ou a inicial do nome
  G.avatarHtml = function (src, name, cls) {
    const c = 'avatar ' + (cls || '');
    if (src && /^data:image\//.test(src)) return '<span class="' + c + '"><img src="' + src + '" alt=""></span>';
    return '<span class="' + c + ' ini">' + esc((String(name || '?').trim()[0] || '?').toUpperCase()) + '</span>';
  };
  G.icon = icon;
  G.waterState = function () { return { total: water.total, goal: profile ? profile.water_goal_ml : 3000 }; };
  G.redrawHoje = function () { drawHoje(); };
  G.icon = icon;
  G.esc = esc;
  G.toast = toast;
  G.confetti = confetti;
  G.hojeISO = hojeISO;
  G.pad2 = pad2;

  function showScreen(name) {
    ['boot', 'login', 'app'].forEach((id) => $('#' + id).classList.toggle('hidden', id !== name));
  }

  function bootError(msg) {
    showScreen('boot');
    $('#bootText').innerHTML = esc(msg);
  }

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------
  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    try {
      if (!window.supabase) throw new Error('Não consegui carregar o Supabase. Confira a internet e atualize a página.');
      const res = await fetch('/api/config');
      const cfg = await res.json().catch(() => ({}));
      if (!res.ok || !cfg.url || !cfg.anonKey) {
        throw new Error(cfg.error || 'O site ainda não recebeu as chaves do Supabase.');
      }
      sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { flowType: 'pkce' } });
    } catch (e) {
      bootError(e.message);
      return;
    }

    buildTabBar();
    $('#googleBtn').addEventListener('click', loginGoogle);
    $('#userBadge').addEventListener('click', () => openSettings(false));
    window.addEventListener('hashchange', renderRoute);

    const { data } = await sb.auth.getSession();
    session = data.session;
    await afterAuth();

    sb.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' && !session) {
        session = s;
        setTimeout(afterAuth, 0);
      } else if (event === 'SIGNED_OUT') {
        session = null;
        profile = null;
        closeModal();
        showScreen('login');
      }
    });
  }

  async function loginGoogle() {
    $('#loginError').textContent = '';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) $('#loginError').textContent = 'Não deu pra entrar: ' + error.message;
  }

  async function afterAuth() {
    if (!session) {
      showScreen('login');
      return;
    }
    const ok = await loadProfile();
    if (!ok) return;
    showScreen('app');
    updateBadge();
    renderRoute();
    if (profile.weight_kg == null || profile.height_cm == null) openSettings(true);
    else if (window.GOLIRA.novidades) window.GOLIRA.novidades();
  }

  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) {
      bootError('Não encontrei seu perfil. Rode o arquivo schema.sql no Supabase e depois o comando de "perfis antigos" do LEIA-ME.');
      return false;
    }
    profile = data;
    groupTag = '';
    if (profile.group_id) {
      const g = await sb.from('groups').select('tag').eq('id', profile.group_id).maybeSingle();
      groupTag = g.data ? g.data.tag : '';
    }
    return true;
  }

  function updateBadge() {
    $('#userBadge').textContent = (profile.display_name || 'Gorila').toUpperCase();
  }

  // ------------------------------------------------------------------
  // Navegação
  // ------------------------------------------------------------------
  function buildTabBar() {
    $('#tabBar').innerHTML = '<span class="tab-pill" aria-hidden="true"></span>' + TABS.map((t) => (
      '<button class="tab-item" type="button" data-route="' + t.id + '" aria-label="' + t.label + '">' +
      icon(t.icon) + '<span>' + t.label + '</span></button>'
    )).join('');
    $('#tabBar').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-item');
      if (btn) window.location.hash = btn.dataset.route;
    });
  }

  function renderRoute() {
    const id = (window.location.hash || '#hoje').slice(1);
    route = TABS.some((t) => t.id === id) ? id : 'hoje';
    document.querySelectorAll('.tab-item').forEach((b) => b.classList.toggle('active', b.dataset.route === route));
    $('#tabBar').style.setProperty('--i', Math.max(0, TABS.findIndex((t) => t.id === route)));
    window.scrollTo(0, 0);
    G.enter();
    if (G.cleanup) { G.cleanup(); G.cleanup = null; }
    if (!profile) return;
    if (route === 'hoje') renderHoje();
    else if (G.routes[route]) G.routes[route]();
    else renderEmBreve(route);
  }

  // ------------------------------------------------------------------
  // Aba HOJE (água)
  // ------------------------------------------------------------------
  async function renderHoje() {
    const view = $('#view');
    view.innerHTML = '<div class="card-box"><p class="muted">Carregando seu dia…</p></div>';

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from('water_logs')
      .select('id, amount_ml')
      .gte('logged_at', start.toISOString())
      .order('logged_at', { ascending: false });

    if (route !== 'hoje') return;
    if (error) {
      view.innerHTML = '<div class="card-box"><p class="error">Erro ao carregar a água: ' + esc(error.message) + '</p></div>';
      return;
    }
    water.logs = data || [];
    water.total = water.logs.reduce((s, l) => s + l.amount_ml, 0);
    hojeExtra = '';
    hojeFirst = true;
    drawHoje();
    // Cartão do treino de hoje (vem do treino.js; falha em silêncio se não houver)
    if (G.streakSync) G.streakSync();
    if (G.gorilaoLoad) {
      G.gorilaoLoad().then(() => { if (route === 'hoje') drawHoje(); }).catch(() => {});
    }
    if (G.habitosLoad) {
      G.habitosLoad().then(() => { if (route === 'hoje') drawHoje(); }).catch(() => {});
    }
    if (G.hojeCard) {
      G.hojeCard().then((html) => {
        hojeExtra = html || '';
        if (route === 'hoje' && hojeExtra) drawHoje();
      }).catch(() => {});
    }
  }

  // ------------------------------------------------------------------
  // Garrafinha de água (SVG com onda e bolhas)
  // ------------------------------------------------------------------
  function bottleY(p) { return Math.round((165 - 131 * Math.max(0, Math.min(100, p)) / 100) * 10) / 10; }

  function bottleHtml(fromPct, toPct, done) {
    const body = 'M38 28h24v10c0 6 18 10 18 24v86a14 14 0 0 1-14 14H34a14 14 0 0 1-14-14V62c0-14 18-18 18-24z';
    const fill = done ? 'url(#bge)' : 'url(#bgw)';
    return '<svg class="bottle' + (done ? ' done' : '') + '" viewBox="0 0 100 176" data-pct="' + toPct + '" role="img" aria-label="Garrafa com ' + toPct + '% da meta de água">' +
      '<defs>' +
        '<clipPath id="bclip"><path d="' + body + '"/></clipPath>' +
        '<linearGradient id="bgw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8AD3FA"/><stop offset="1" stop-color="#2F7FC4"/></linearGradient>' +
        '<linearGradient id="bge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BE79B"/><stop offset="1" stop-color="#1F9A57"/></linearGradient>' +
      '</defs>' +
      '<g clip-path="url(#bclip)">' +
        '<rect width="100" height="176" fill="rgba(255,255,255,0.05)"/>' +
        '<g class="bw" style="transform:translateY(' + bottleY(fromPct) + 'px)">' +
          '<path class="wave w2" d="M-62 2q12.5-5 25 0t25 0 25 0 25 0 25 0 25 0 25 0 25 0 25 0 25 0V140H-62z" fill="' + fill + '" opacity="0.5"/>' +
          '<path class="wave w1" d="M-50 0q12.5-5 25 0t25 0 25 0 25 0 25 0 25 0 25 0 25 0 25 0V140H-50z" fill="' + fill + '"/>' +
          '<circle class="bub b1" cx="34" cy="120" r="2.4"/><circle class="bub b2" cx="52" cy="130" r="1.8"/>' +
          '<circle class="bub b3" cx="66" cy="115" r="2.8"/><circle class="bub b4" cx="44" cy="125" r="1.5"/>' +
          '<circle class="bub b5" cx="58" cy="135" r="2.1"/>' +
        '</g>' +
      '</g>' +
      '<path d="' + body + '" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M30 70v62" stroke="rgba(255,255,255,0.28)" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<rect x="40" y="16" width="20" height="12" rx="4" fill="rgba(236,211,181,0.85)"/>' +
    '</svg>';
  }

  function drawHoje() {
    if (route !== 'hoje') return;
    const goal = profile.water_goal_ml;
    const pct = Math.min(100, Math.round((water.total / goal) * 100));
    const done = water.total >= goal;

    // nível anterior da garrafinha (para ela encher devagar em vez de pular)
    const oldBottle = $('.bottle');
    const prevPct = oldBottle ? Number(oldBottle.dataset.pct) || 0 : 0;

    // só a primeira montagem anima; atualizações (água, cartão do treino) não piscam
    $('#view').classList.toggle('no-anim', !hojeFirst);
    hojeFirst = false;

    $('#view').innerHTML =
      '<div class="greeting">Fala, ' + esc(profile.display_name) + '!</div>' +
      (G.gorilaoHtml ? G.gorilaoHtml() : '') +

      '<div class="card-box highlight">' +
        '<div class="card-header-flex"><span class="card-title-text">Meta de Hidratação</span><span class="card-tag">Água</span></div>' +
        '<div class="water-row">' +
          bottleHtml(prevPct, pct, done) +
          '<div class="water-side">' +
            '<div class="water-big"><strong>' + fmtLitros(water.total) + 'L</strong> <span>/ ' + fmtLitros(goal) + 'L</span></div>' +
            '<div class="muted">' + pct + '% da meta de hoje</div>' +
            (done ? '<div class="ok-line">' + icon('check') + ' Meta batida! Bora manter a matilha hidratada.</div>' : '') +
            (water.logs.length ? '<button class="btn-link" type="button" id="undoWater">Desfazer último (' + water.logs[0].amount_ml + 'ml)</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="water-buttons">' +
          '<button class="btn-action btn-agua" type="button" data-ml="300">' + icon('drop') + ' + 300ml</button>' +
          '<button class="btn-action btn-agua" type="button" data-ml="500">' + icon('drop') + ' + 500ml</button>' +
        '</div>' +
      '</div>' +

      hojeExtra +
      (G.habitosHtml ? G.habitosHtml() : '') +

      '<div class="card-box">' +
        '<div class="card-header-flex"><span class="card-title-text">Foco da Matilha</span><span class="card-tag">Prioridade</span></div>' +
        '<div class="card-body"><p>Mantenha o foco nos treinos, siga o plano e registre seus hábitos com precisão para fechar o dia no verde!</p></div>' +
      '</div>';

    if (G.gorilaoMount) G.gorilaoMount();
    const bw = $('.bw');
    if (bw && prevPct !== pct) {
      requestAnimationFrame(() => requestAnimationFrame(() => { bw.style.transform = 'translateY(' + bottleY(pct) + 'px)'; }));
    }
    const bt = $('.bottle');
    if (bt) bt.dataset.pct = String(pct);

    document.querySelectorAll('[data-ml]').forEach((b) => b.addEventListener('click', () => addWater(Number(b.dataset.ml), b)));
    const undo = $('#undoWater');
    if (undo) undo.addEventListener('click', undoWater);
  }

  async function addWater(ml, btn) {
    btn.disabled = true;
    const before = water.total;
    const { data, error } = await sb.from('water_logs').insert({ amount_ml: ml }).select('id, amount_ml').single();
    if (error) {
      btn.disabled = false;
      toast('Não consegui salvar: ' + error.message);
      return;
    }
    water.logs.unshift(data);
    water.total += data.amount_ml;
    drawHoje();
    if (before < profile.water_goal_ml && water.total >= profile.water_goal_ml) {
      confetti();
      toast('Meta de hidratação batida, matilha! 🦍💧');
    }
  }

  async function undoWater() {
    const last = water.logs[0];
    if (!last) return;
    const { error } = await sb.from('water_logs').delete().eq('id', last.id);
    if (error) {
      toast('Não consegui desfazer: ' + error.message);
      return;
    }
    water.logs.shift();
    water.total -= last.amount_ml;
    drawHoje();
  }

  // ------------------------------------------------------------------
  // Abas ainda em construção
  // ------------------------------------------------------------------
  const EM_BREVE = {
    historico: {
      title: 'Histórico', tag: 'Em breve',
      text: 'Sua evolução calculada com os seus registros de verdade.',
      itens: ['Streak de dias seguidos', 'Semana de domingo a sábado', 'IMC com base no seu peso e altura'],
    },
    mural: {
      title: 'Mural da Matilha', tag: 'Em breve',
      text: 'Recados que ficam 24h, vistos só por quem tem a mesma tag de grupo que você.',
      itens: ['Recado macaquista do ADM', 'Reações 🦍 🔥 💪', 'Atualização ao vivo'],
    },
    ia: {
      title: 'Gorilão IA', tag: 'Em breve',
      text: 'O chat com o Gorilão vai ser ligado na Groq, com o contexto do seu treino, da sua água e do seu objetivo.',
      itens: ['Respostas de verdade, sem simulação', 'Monta fichas de treino para você aprovar', 'Chave da IA protegida no servidor'],
    },
  };

  function renderEmBreve(id) {
    const c = EM_BREVE[id];
    $('#view').innerHTML =
      '<div class="card-box highlight">' +
        '<div class="card-header-flex"><span class="card-title-text">' + esc(c.title) + '</span><span class="card-tag">' + esc(c.tag) + '</span></div>' +
        '<div class="card-body"><p>' + esc(c.text) + '</p><ul>' + c.itens.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul></div>' +
      '</div>';
  }

  // ------------------------------------------------------------------
  // Cadastro / Configurações
  // ------------------------------------------------------------------
  function closeModal() {
    $('#modalRoot').innerHTML = '';
  }

  function normalizaTag(raw) {
    return String(raw || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  }

  // as colunas do perfil (schema-v6) existem?
  function hasAvatarCols() { return !!profile && ('avatar' in profile); }

  // Lê a foto escolhida, recorta o centro em quadrado e reduz pra 256 px (JPEG leve)
  async function fotoParaAvatar(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((ok, no) => {
        const img = new Image(); const u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => no(new Error('img')); img.src = u;
      });
    }
    const w = bmp.width, h = bmp.height, side = Math.min(w, h);
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#111'; cx.fillRect(0, 0, 256, 256);
    cx.drawImage(bmp, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 256, 256);
    let q = 0.82, out = cv.toDataURL('image/jpeg', q);
    while (out.length > 60000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
    return out;
  }

  function openSettings(forced) {
    $('#modalRoot').innerHTML =
      '<div class="modal-overlay"><form class="modal-card" id="settingsForm" novalidate>' +
        '<div class="modal-header"><span class="modal-title">' + (forced ? 'Bem-vindo à matilha' : 'Cadastro e configurações') + '</span>' +
        (forced ? '' : '<button class="modal-close" type="button" id="closeSettings" aria-label="Fechar">✕</button>') + '</div>' +
        (forced ? '<p class="muted">Preencha seus dados para o app calcular seu IMC e sua meta de água.</p>' : '') +
        (hasAvatarCols() ? '<div class="avatar-pick"><div id="avPrev"></div><div class="av-actions">' +
          '<button type="button" class="btn-ghost btn-small" id="avPick">Escolher foto</button>' +
          '<button type="button" class="btn-link" id="avDel">Remover foto</button>' +
          '<input type="file" accept="image/*" id="avFile" class="hidden"></div></div>' +
          '<small class="av-note">A foto vira um quadradinho 256 px, aparece no seu perfil pra matilha e fica salva no app. Use a imagem que quiser (selfie, desenho, avatar de IA).</small>' : '') +
        '<label class="field">Seu nome<input name="display_name" maxlength="20" autocomplete="given-name"></label>' +
        '<div class="row">' +
          '<label class="field">Peso (kg)<input name="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 82,5"></label>' +
          '<label class="field">Altura (cm)<input name="height" type="text" inputmode="numeric" autocomplete="off" placeholder="Ex.: 178"></label>' +
        '</div>' +
        '<label class="field">Objetivo<input name="goal" maxlength="80" placeholder="Ex.: ganhar massa, emagrecer, saúde"></label>' +
        '<label class="field">Meta de água por dia (litros)<input name="water" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 3,0">' +
          '<small id="waterHint"></small></label>' +
        (hasAvatarCols() ? '<label class="check-line"><input type="checkbox" name="show_profile"><span>Aparecer pra minha matilha <em>(só nome, foto e sequência de dias)</em></span></label>' : '') +
        '<div class="opt-box">' +
          '<label class="check-line"><input type="checkbox" name="smoke_on"><span>Acompanhar cigarros <em>(opcional, só você vê)</em></span></label>' +
          '<label class="field hidden" id="smokeGoalField">Máximo de cigarros por dia<input name="smoke_goal" type="text" inputmode="numeric" autocomplete="off" placeholder="Ex.: 10"></label>' +
        '</div>' +
        '<label class="field">Tag do grupo<input name="tag" maxlength="30" autocapitalize="characters" placeholder="Ex.: MATILHA-7K2Q">' +
          '<small>Quem tem a mesma tag vê os recados do Mural uns dos outros. Use uma tag difícil de adivinhar, ela funciona como uma senha do grupo. Deixe vazio para ficar sem grupo.</small></label>' +
        '<div class="opt-box" id="avisosBox"></div>' +
        '<div class="error" id="formError"></div>' +
        '<button class="btn-action" type="submit" id="saveBtn">Salvar</button>' +
        '<button class="btn-ghost" type="button" id="logoutBtn">Sair da conta</button>' +
      '</form></div>';

    const f = $('#settingsForm');
    f.display_name.value = profile.display_name || '';
    f.weight.value = profile.weight_kg == null ? '' : String(profile.weight_kg).replace('.', ',');
    f.height.value = profile.height_cm == null ? '' : String(profile.height_cm).replace('.', ',');
    f.goal.value = profile.goal || '';
    f.water.value = (profile.water_goal_ml / 1000).toFixed(1).replace('.', ',');
    f.tag.value = groupTag;

    // foto de perfil: undefined = não mexeu, null = remover, texto = nova foto
    let avatarNew;
    if (hasAvatarCols()) {
      const prev = () => {
        const cur = avatarNew === undefined ? profile.avatar : avatarNew;
        $('#avPrev').innerHTML = G.avatarHtml(cur, f.display_name.value || profile.display_name, 'av-big');
        $('#avDel').classList.toggle('hidden', !cur);
      };
      f.show_profile.checked = profile.show_profile !== false;
      prev();
      f.display_name.addEventListener('input', prev);
      $('#avPick').addEventListener('click', () => $('#avFile').click());
      $('#avDel').addEventListener('click', () => { avatarNew = null; prev(); });
      $('#avFile').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try { avatarNew = await fotoParaAvatar(file); prev(); }
        catch (x) { $('#formError').textContent = 'Não consegui abrir essa imagem. Tente outra.'; }
        e.target.value = '';
      });
      f._avatar = () => avatarNew;
    }

    // sugestão de meta de água pelo peso (referência geral: 35 ml por kg)
    const fmtL = (n) => n.toFixed(1).replace('.', ',');
    const updHint = () => {
      const w = parseFloat(String(f.weight.value).replace(',', '.'));
      const hint = $('#waterHint');
      if (!(w >= 20 && w <= 400)) { hint.innerHTML = ''; return; }
      const l = Math.round(w * 35 / 100) / 10;
      hint.innerHTML = 'Sugestão pelo seu peso: <button type="button" class="btn-link inline" id="useSugg">' + fmtL(l) + ' L, usar</button>' +
        ' (referência geral de 35 ml por kg; com condição de saúde, siga a orientação do seu médico).';
      $('#useSugg').addEventListener('click', () => { f.water.value = fmtL(l); });
    };
    f.weight.addEventListener('input', updHint);
    updHint();

    // cigarro (opcional e privado)
    const cfg = G.habitosCfg ? G.habitosCfg() : { smoke: false, goal: null };
    const syncSmoke = () => $('#smokeGoalField').classList.toggle('hidden', !f.smoke_on.checked);
    f.smoke_on.checked = !!cfg.smoke;
    f.smoke_goal.value = cfg.goal ? String(cfg.goal) : '';
    f.smoke_on.addEventListener('change', syncSmoke);
    syncSmoke();

    if (!forced) $('#closeSettings').addEventListener('click', closeModal);
    $('#logoutBtn').addEventListener('click', async () => { if (G.avisosSair) await G.avisosSair(); await sb.auth.signOut(); });
    if (G.avisosMount) G.avisosMount($('#avisosBox'));
    f.addEventListener('submit', (e) => { e.preventDefault(); saveSettings(f); });
  }

  async function saveSettings(f) {
    const err = $('#formError');
    err.textContent = '';
    const num = (v) => parseFloat(String(v).replace(',', '.'));

    const name = f.display_name.value.trim();
    const weight = num(f.weight.value);
    const height = num(f.height.value);
    const waterL = num(f.water.value);
    const tag = normalizaTag(f.tag.value);
    const smokeOn = f.smoke_on.checked;
    const smokeGoal = parseInt(String(f.smoke_goal.value).trim(), 10);

    if (!name) return (err.textContent = 'Coloque seu nome.');
    if (!(weight >= 20 && weight <= 400)) return (err.textContent = 'Peso deve ficar entre 20 e 400 kg.');
    if (!(height >= 80 && height <= 260)) return (err.textContent = 'Altura deve ficar entre 80 e 260 cm.');
    if (!(waterL >= 0.5 && waterL <= 10)) return (err.textContent = 'Meta de água deve ficar entre 0,5 e 10 litros.');
    if (smokeOn && !(smokeGoal >= 1 && smokeGoal <= 100)) return (err.textContent = 'Defina o máximo de cigarros por dia (de 1 a 100).');
    if (tag && (tag.length < 3 || tag.length > 30)) return (err.textContent = 'A tag precisa ter de 3 a 30 letras ou números.');

    const btn = $('#saveBtn');
    btn.disabled = true;

    const payload = {
      display_name: name,
      weight_kg: weight,
      height_cm: height,
      goal: f.goal.value.trim() || null,
      water_goal_ml: Math.round(waterL * 1000),
    };
    if (hasAvatarCols()) {
      payload.show_profile = f.show_profile.checked;
      const a = f._avatar ? f._avatar() : undefined;
      if (a !== undefined) payload.avatar = a;
    }
    const up = await sb.from('profiles').update(payload).eq('id', session.user.id);
    if (up.error) {
      btn.disabled = false;
      return (err.textContent = 'Erro ao salvar: ' + up.error.message);
    }

    if (tag !== groupTag) {
      const g = await sb.rpc('set_group', { p_tag: tag });
      if (g.error) {
        btn.disabled = false;
        return (err.textContent = 'Erro ao entrar no grupo: ' + g.error.message);
      }
    }

    // Guarda o peso no histórico (um registro por dia). Falha em silêncio se a tabela ainda não existe.
    if (weight !== profile.weight_kg) {
      try {
        await sb.from('weight_logs').upsert(
          { weight_kg: Math.round(weight * 10) / 10, logged_on: hojeISO() },
          { onConflict: 'user_id,logged_on' }
        );
      } catch (e) { /* ignora */ }
    }

    let smokeErr = '';
    if (G.habitosSaveCfg) smokeErr = await G.habitosSaveCfg(smokeOn, smokeOn ? smokeGoal : null);

    await loadProfile();
    updateBadge();
    closeModal();
    toast(smokeErr ? 'Perfil salvo, mas não salvei o cigarro: ' + smokeErr : 'Perfil salvo! 🦍');
    renderRoute();
  }

  init();
})();
