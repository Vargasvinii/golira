(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Estado e utilidades
  // ------------------------------------------------------------------
  const TABS = [
    { id: 'hoje', icon: '📍', label: 'Hoje' },
    { id: 'treino', icon: '💪', label: 'Treino' },
    { id: 'historico', icon: '📊', label: 'Histórico' },
    { id: 'mural', icon: '💬', label: 'Mural' },
    { id: 'ia', icon: '🤖', label: 'IA' },
  ];

  let sb = null;          // cliente do Supabase
  let session = null;     // sessão do usuário logado
  let profile = null;     // linha da tabela profiles
  let groupTag = '';      // tag do grupo (texto)
  let route = 'hoje';
  let water = { logs: [], total: 0 };

  const $ = (sel, root) => (root || document).querySelector(sel);

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
    const colors = ['#ECD3B5', '#58111A', '#E9E9E9', '#A3333D'];
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
    $('#tabBar').innerHTML = TABS.map((t) => (
      '<button class="tab-item" type="button" data-route="' + t.id + '">' +
      '<span class="icon">' + t.icon + '</span><span>' + t.label + '</span></button>'
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
    window.scrollTo(0, 0);
    if (!profile) return;
    if (route === 'hoje') renderHoje();
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
    drawHoje();
  }

  function drawHoje() {
    if (route !== 'hoje') return;
    const goal = profile.water_goal_ml;
    const pct = Math.min(100, Math.round((water.total / goal) * 100));
    const done = water.total >= goal;

    $('#view').innerHTML =
      '<div class="greeting">Fala, ' + esc(profile.display_name) + '! 🦍</div>' +

      '<div class="card-box highlight">' +
        '<div class="card-header-flex"><span class="card-title-text">Meta de Hidratação</span><span class="card-tag">Água</span></div>' +
        '<div class="card-body">' +
          '<div>💧 Consumido hoje: <strong>' + fmtLitros(water.total) + 'L / ' + fmtLitros(goal) + 'L</strong> (' + pct + '%)</div>' +
          '<div class="progress-bar"><div class="progress-fill' + (done ? ' done' : '') + '" style="width:' + pct + '%"></div></div>' +
          (done ? '<div>✅ Meta batida! Bora manter a matilha hidratada.</div>' : '') +
        '</div>' +
        '<div class="water-buttons">' +
          '<button class="btn-action" type="button" data-ml="300">+ 300ml 💧</button>' +
          '<button class="btn-action" type="button" data-ml="500">+ 500ml 💧</button>' +
        '</div>' +
        (water.logs.length ? '<button class="btn-link" type="button" id="undoWater">Desfazer último (' + water.logs[0].amount_ml + 'ml)</button>' : '') +
      '</div>' +

      '<div class="card-box">' +
        '<div class="card-header-flex"><span class="card-title-text">Foco da Matilha</span><span class="card-tag">Prioridade</span></div>' +
        '<div class="card-body"><p>Mantenha o foco nos treinos, siga o plano e registre seus hábitos com precisão para fechar o dia no verde! 🔥</p></div>' +
      '</div>';

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
    treino: {
      title: 'Treino', tag: 'Em breve',
      text: 'Aqui você vai criar e salvar suas fichas de treino. O Gorilão também vai poder montar fichas para você, e elas só são salvas depois que você aprovar.',
      itens: ['Fichas com dias e exercícios', 'Ficha ativa aparece na aba Hoje', 'Finalizar treino com som e confete 🦍'],
    },
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

  function openSettings(forced) {
    $('#modalRoot').innerHTML =
      '<div class="modal-overlay"><form class="modal-card" id="settingsForm" novalidate>' +
        '<div class="modal-header"><span class="modal-title">' + (forced ? 'Bem-vindo à matilha 🦍' : 'Cadastro e configurações') + '</span>' +
        (forced ? '' : '<button class="modal-close" type="button" id="closeSettings" aria-label="Fechar">✕</button>') + '</div>' +
        (forced ? '<p class="muted">Preencha seus dados para o app calcular seu IMC e sua meta de água.</p>' : '') +
        '<label class="field">Seu nome<input name="display_name" maxlength="20" autocomplete="given-name"></label>' +
        '<div class="row">' +
          '<label class="field">Peso (kg)<input name="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 82,5"></label>' +
          '<label class="field">Altura (cm)<input name="height" type="text" inputmode="numeric" autocomplete="off" placeholder="Ex.: 178"></label>' +
        '</div>' +
        '<label class="field">Objetivo<input name="goal" maxlength="80" placeholder="Ex.: ganhar massa, emagrecer, saúde"></label>' +
        '<label class="field">Meta de água por dia (litros)<input name="water" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 3,0"></label>' +
        '<label class="field">Tag do grupo<input name="tag" maxlength="30" autocapitalize="characters" placeholder="Ex.: MATILHA-7K2Q">' +
          '<small>Quem tem a mesma tag vê os recados do Mural uns dos outros. Use uma tag difícil de adivinhar, ela funciona como uma senha do grupo. Deixe vazio para ficar sem grupo.</small></label>' +
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

    if (!forced) $('#closeSettings').addEventListener('click', closeModal);
    $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); });
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

    if (!name) return (err.textContent = 'Coloque seu nome.');
    if (!(weight >= 20 && weight <= 400)) return (err.textContent = 'Peso deve ficar entre 20 e 400 kg.');
    if (!(height >= 80 && height <= 260)) return (err.textContent = 'Altura deve ficar entre 80 e 260 cm.');
    if (!(waterL >= 0.5 && waterL <= 10)) return (err.textContent = 'Meta de água deve ficar entre 0,5 e 10 litros.');
    if (tag && (tag.length < 3 || tag.length > 30)) return (err.textContent = 'A tag precisa ter de 3 a 30 letras ou números.');

    const btn = $('#saveBtn');
    btn.disabled = true;

    const up = await sb.from('profiles').update({
      display_name: name,
      weight_kg: weight,
      height_cm: height,
      goal: f.goal.value.trim() || null,
      water_goal_ml: Math.round(waterL * 1000),
    }).eq('id', session.user.id);
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

    await loadProfile();
    updateBadge();
    closeModal();
    toast('Perfil salvo! 🦍');
    renderRoute();
  }

  init();
})();
