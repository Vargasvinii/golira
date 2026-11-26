// GOLIRA - envia as notificações. Quem chama é o agendador do Supabase, com o segredo AVISOS_SECRET.
// Horários (Brasília): 8h bom dia; 11h, 15h e 19h água; 18h treino; 21h sequência.
const FRASES = require('./_frases');
const AGENDA = { 8: 'bomdia', 11: 'agua', 15: 'agua', 18: 'treino', 19: 'agua', 21: 'sequencia' };
const PREF = { bomdia: 'morning', agua: 'water', treino: 'workout', sequencia: 'streak' };
const TITULO = { bomdia: 'Bom dia, matilha ☀️', agua: 'Hora da água 💧', treino: 'Bora treinar 🏋️', sequencia: 'Sua sequência 🔥' };

// data e hora de Brasília (UTC-3, sem horário de verão)
function agoraBR(d) {
  const b = new Date((d || new Date()).getTime() - 3 * 3600e3);
  const dia = b.toISOString().slice(0, 10);
  const ontem = new Date(b.getTime() - 86400e3).toISOString().slice(0, 10);
  return { dia, ontem, hora: b.getUTCHours(), semana: b.getUTCDay(), inicio: dia + 'T03:00:00Z' };
}

// decide se esta pessoa recebe o aviso e monta o texto (null = não envia)
function montar(tipo, p, t, sorte) {
  const seq = p.profile.streak_day >= t.ontem ? p.profile.streak_days || 0 : 0;
  const meta = p.profile.water_goal_ml || 3000;
  const ativo = p.agua >= meta || p.treinou;
  if (tipo === 'agua' && p.agua / meta >= Math.min(1, (t.hora - 7) / 15)) return null;
  if (tipo === 'treino' && (!p.treino || p.treinou)) return null;
  if (tipo === 'sequencia' && ativo) return null;

  let lista = FRASES[tipo] || [];
  if (tipo === 'bomdia' && seq >= 2) lista = lista.concat(FRASES.sequenciaDia || []);
  if (seq < 2) lista = lista.filter((f) => !f.includes('{sequencia}'));
  if (!p.treino) lista = lista.filter((f) => !f.includes('{treino}'));
  if (!lista.length) return null;
  const nome = String(p.profile.display_name || 'gorila').trim().split(/\s+/)[0];
  const texto = lista[Math.floor(sorte * lista.length)]
    .replace(/\{nome\}/g, nome).replace(/\{sequencia\}/g, seq).replace(/\{treino\}/g, p.treino);
  return { title: TITULO[tipo], body: texto.charAt(0).toUpperCase() + texto.slice(1), tag: tipo };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const e = process.env;
  const url = (e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SECRET_KEY;
  if (!url || !key || !e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !e.AVISOS_SECRET) return res.status(500).json({ error: 'Notificações ainda não configuradas na Vercel.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (req.headers.authorization !== 'Bearer ' + e.AVISOS_SECRET) return res.status(401).json({ error: 'Não autorizado.' });

  const t = agoraBR();
  const tipo = AGENDA[t.hora];
  if (!tipo) return res.status(200).json({ enviado: 0, motivo: 'fora da agenda' });

  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const db = async (path, opt) => {
    const r = await fetch(url + '/rest/v1/' + path, Object.assign({ headers }, opt));
    if (!r.ok) throw new Error(path.split('?')[0] + ': ' + r.status);
    return r.status === 204 || r.status === 201 ? null : r.json();
  };

  try {
    const webpush = require('web-push');
    webpush.setVapidDetails('https://github.com/Vargasvinii/golira', e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    const subs = await db('push_subscriptions?select=endpoint,p256dh,auth,user_id');
    let enviado = 0;
    await Promise.all([...new Set(subs.map((s) => s.user_id))].map(async (id) => {
      try {
        const q = 'user_id=eq.' + id;
        const [prof, prefs, agua, sessoes, habitos, planos] = await Promise.all([
          db('profiles?select=display_name,water_goal_ml,streak_days,streak_day&id=eq.' + id),
          db('notification_prefs?select=*&' + q),
          db('water_logs?select=amount_ml&' + q + '&logged_at=gte.' + t.inicio),
          db('workout_sessions?select=id&' + q + '&finished_at=gte.' + t.inicio + '&limit=1'),
          db('habit_logs?select=habit&' + q + '&habit=eq.workout&logged_on=eq.' + t.dia),
          db('workout_plans?select=id&is_active=is.true&' + q),
        ]);
        if (!prof[0] || (prefs[0] && prefs[0][PREF[tipo]] === false)) return;
        const dias = planos[0] ? await db('workout_days?select=title&plan_id=eq.' + planos[0].id + '&weekday=eq.' + t.semana) : [];
        const msg = montar(tipo, {
          profile: prof[0],
          agua: agua.reduce((s, x) => s + x.amount_ml, 0),
          treinou: sessoes.length > 0 || habitos.length > 0,
          treino: dias[0] ? dias[0].title : '',
        }, t, Math.random());
        if (!msg) return;
        // trava contra envio repetido no mesmo horário
        const trava = await fetch(url + '/rest/v1/push_sent', { method: 'POST', headers, body: JSON.stringify({ user_id: id, day: t.dia, hour: t.hora }) });
        if (!trava.ok) return;
        for (const s of subs.filter((x) => x.user_id === id)) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 });
            enviado++;
          } catch (err) {
            // aparelho que desinstalou ou bloqueou: apaga a inscrição
            if (err.statusCode === 404 || err.statusCode === 410) await db('push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' });
          }
        }
      } catch (err) { console.error('avisos', err.message); }
    }));
    return res.status(200).json({ tipo, enviado });
  } catch (err) {
    console.error('avisos', err.message);
    return res.status(500).json({ error: 'Falha ao enviar os avisos.' });
  }
}

module.exports = handler;
module.exports.montar = montar;
module.exports.agoraBR = agoraBR;
