// GOLIRA - Comprovação de treino: foto privada, conferida pelo Gorilão.
// Sem foto o treino continua contando na sequência; só não ganha o selo.
(function () {
  'use strict';

  const G = window.GOLIRA;
  if (!G) return;
  const esc = G.esc;

  // off = schema-v9 ainda não rodado (não mostra nada)
  const S = { off: true, paid: false, busy: false, msg: '', share: false, day: '' };

  function inner() {
    if (S.paid) return '<div class="card-title-text">TREINO PAGO ✅</div>' + (S.msg ? '<p class="muted">' + esc(S.msg) + '</p>' : '');
    return '<div class="card-title-text">Comprovar treino</div>' +
      '<p class="muted">A foto é analisada por uma IA e o app não a guarda. Pode ser só o tênis, o aparelho ou o halter.</p>' +
      '<label class="check-line"><input type="checkbox" data-p="share"' + (S.share ? ' checked' : '') + '><span>Mostrar a foto pra matilha no Mural <em>(some em 24h)</em></span></label>' +
      (S.msg ? '<p class="error">' + esc(S.msg) + '</p>' : '') +
      '<label class="btn-action prova-btn">' + (S.busy ? 'Gorilão analisando…' : S.msg ? 'Tentar de novo' : 'Tirar foto') +
      '<input type="file" accept="image/*" capture="environment" class="hidden" data-p="file"' + (S.busy ? ' disabled' : '') + '></label>';
  }

  G.provaHtml = function () {
    return S.off ? '' : '<div class="card-box prova-box">' + inner() + '</div>';
  };
  function redraw() {
    document.querySelectorAll('.prova-box').forEach((el) => { el.innerHTML = inner(); });
  }

  G.provaLoad = async function () {
    const today = G.hojeISO();
    if (S.day !== today) { S.day = today; S.msg = ''; S.share = false; }
    const r = await G.sb.from('workout_proofs').select('day').eq('day', today).limit(1);
    S.off = !!r.error;
    S.paid = !r.error && !!(r.data || []).length;
  };

  // Foto -> JPEG leve (lado maior 1024 px)
  async function toJpeg(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.75);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share(dataUrl) {
    const gid = G.profile && G.profile.group_id;
    if (!gid) return false;
    const blob = await (await fetch(dataUrl)).blob();
    const path = gid + '/' + crypto.randomUUID() + '.jpg';
    const up = await G.sb.storage.from('mural').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) return false;
    const r = await G.sb.from('mural_posts').insert({ content: 'TREINO PAGO ✅', image_path: path });
    if (r.error) { await G.sb.storage.from('mural').remove([path]); return false; }
    return true;
  }

  async function send(file) {
    if (S.busy) return;
    S.busy = true; S.msg = ''; redraw();
    try {
      const image = await toJpeg(file);
      const ses = await G.sb.auth.getSession();
      const token = ses.data && ses.data.session ? ses.data.session.access_token : '';
      const r = await fetch('/api/comprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ image }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Não consegui conferir a foto.');
      S.msg = j.reason || '';
      if (j.approved) {
        S.paid = true;
        G.toast('Treino pago!');
        // a foto só vai pro Mural se a pessoa marcou, e só depois de aprovada
        if (S.share && !(await share(image).catch(() => false))) G.toast('Selo salvo, mas a foto não foi pro Mural.');
      } else if (!S.msg) {
        S.msg = 'O Gorilão não reconheceu um treino nessa foto.';
      }
    } catch (e) {
      S.msg = (e && e.message) || 'Não consegui abrir essa foto.';
    } finally {
      S.busy = false; redraw();
    }
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.p === 'share') S.share = t.checked;
    else if (t.dataset.p === 'file' && t.files && t.files[0]) { send(t.files[0]); t.value = ''; }
  });
})();
