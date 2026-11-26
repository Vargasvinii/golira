// GOLIRA - aviso de novidades: aparece uma vez em cada aparelho.
(function () {
  'use strict';
  const G = window.GOLIRA;
  if (!G) return;
  const CHAVE = 'golira-novidades-notificacoes';

  G.novidades = function () {
    const root = document.getElementById('modalRoot');
    try { if (localStorage.getItem(CHAVE)) return; } catch (e) { return; }
    if (!root || root.innerHTML) return;
    root.innerHTML =
      '<div class="modal-overlay"><div class="modal-card" role="dialog" aria-label="Novidades">' +
        '<div class="modal-header"><span class="modal-title">Novidades na selva 🦍</span></div>' +
        '<div class="card-title-text">Notificações 🔔</div>' +
        '<p class="muted">O Gorilão agora te chama: bom dia às 8h, água às 11h, 15h e 19h, treino às 18h e sequência às 21h. Ative em Configurações e escolha o que quer receber. No iPhone, abra o app pelo ícone da tela de início.</p>' +
        '<div class="card-title-text">TREINO PAGO ✅</div>' +
        '<p class="muted">Marcou o treino? Toque em "Comprovar treino" e tire uma foto (tênis, aparelho ou halter já serve). A IA confere, o app não guarda a foto e a matilha só vê o selo. A foto só aparece no Mural se você marcar essa opção. Sem foto, o treino continua valendo na sequência.</p>' +
        '<button class="btn-action" type="button" data-n="ativar">Ativar notificações</button>' +
        '<button class="btn-ghost" type="button" data-n="ok">Agora não</button>' +
      '</div></div>';
    root.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
      try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* ignora */ }
      root.innerHTML = '';
      if (b.dataset.n === 'ativar') {
        document.getElementById('userBadge').click();
        const box = document.getElementById('avisosBox');
        if (box) box.scrollIntoView({ block: 'center' });
      }
    }));
  };
})();
