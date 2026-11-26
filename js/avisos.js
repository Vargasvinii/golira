// GOLIRA - notificações: ativar neste aparelho e escolher quais avisos receber.
(function () {
  'use strict';
  const G = window.GOLIRA;
  if (!G) return;

  const TIPOS = [['morning', 'Bom dia (8h)'], ['water', 'Água (11h, 15h e 19h)'], ['workout', 'Treino (18h)'], ['streak', 'Sequência (21h)']];
  const suporta = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function atual() {
    const reg = await navigator.serviceWorker.ready;
    return { reg, sub: await reg.pushManager.getSubscription() };
  }

  async function registrar(sub) {
    const j = sub.toJSON();
    const r = await G.sb.rpc('register_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (r.error) throw new Error(r.error.message);
  }

  async function ativar() {
    // o pedido de permissão precisa vir direto do toque (exigência do iPhone)
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão negada. Libere as notificações nos ajustes do celular.');
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.vapidKey) throw new Error('As notificações ainda não foram configuradas.');
    const { reg, sub } = await atual();
    await registrar(sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(cfg.vapidKey) }));
  }

  async function desativar() {
    if (!suporta()) return;
    const { sub } = await atual();
    if (!sub) return;
    await G.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  G.avisosSair = () => desativar().catch(() => {});

  G.avisosMount = async function (box) {
    if (!box) return;
    if (!suporta()) {
      box.innerHTML = '<p class="muted">Notificações: no iPhone, salve o GOLIRA na tela de início e abra por lá.</p>';
      return;
    }
    try {
      const { sub } = await atual();
      const ligado = !!sub && Notification.permission === 'granted';
      if (!ligado) {
        box.innerHTML = '<button class="btn-ghost" type="button" data-av="on">Ativar notificações</button><p class="error"></p>';
      } else {
        await registrar(sub);
        const r = await G.sb.from('notification_prefs').select('*').maybeSingle();
        if (r.error) throw new Error(r.error.message);
        const p = r.data || {};
        box.innerHTML = '<p class="muted">Notificações ligadas neste aparelho:</p>' + TIPOS.map((t) =>
          '<label class="check-line"><input type="checkbox" data-pref="' + t[0] + '"' + (p[t[0]] === false ? '' : ' checked') + '><span>' + t[1] + '</span></label>').join('') +
          '<button class="btn-link" type="button" data-av="off">Desligar neste aparelho</button><p class="error"></p>';
      }
    } catch (e) {
      box.innerHTML = '<p class="muted">Notificações ainda não disponíveis.</p>';
      return;
    }
    box.onclick = async (ev) => {
      const b = ev.target.closest('[data-av]');
      if (!b) return;
      b.disabled = true;
      try {
        await (b.dataset.av === 'on' ? ativar() : desativar());
        await G.avisosMount(box);
      } catch (e) {
        b.disabled = false;
        box.querySelector('.error').textContent = e.message;
      }
    };
    box.onchange = async (ev) => {
      const c = ev.target.closest('[data-pref]');
      if (!c) return;
      ev.stopPropagation();
      const row = { user_id: G.session.user.id };
      row[c.dataset.pref] = c.checked;
      const r = await G.sb.from('notification_prefs').upsert(row, { onConflict: 'user_id' });
      if (r.error) { c.checked = !c.checked; G.toast('Não consegui salvar: ' + r.error.message); }
    };
  };
})();
