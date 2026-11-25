// GOLIRA - Pedidos de acesso. Cole este código no Apps Script da planilha "Usuarios Golira"
// (na planilha: Extensões > Apps Script). Cada pedido vira uma linha com status "Pendente".
const ABA = 'Página1';
const CABECALHO = ['Data', 'Nome', 'E-mail', 'Status', 'Observação'];
const MAX_LINHAS = 600; // trava anti-spam

// Rode UMA vez pelo botão "Executar" pra deixar a planilha pronta (cabeçalho + lista Pendente/Aprovado/Recusado)
function prepararPlanilha() {
  const sh = pegaAba();
  sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const regra = SpreadsheetApp.newDataValidation().requireValueInList(['Pendente', 'Aprovado', 'Recusado'], true).build();
  sh.getRange(2, 4, MAX_LINHAS, 1).setDataValidation(regra);
  sh.getRange(2, 1, MAX_LINHAS, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.setColumnWidths(1, 1, 130); sh.setColumnWidths(2, 1, 160); sh.setColumnWidths(3, 1, 260); sh.setColumnWidths(4, 1, 100); sh.setColumnWidths(5, 1, 240);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let d = {};
    try { d = JSON.parse(e.postData.contents); } catch (x) { /* ignora */ }
    if (d.site) return resp({ ok: true });                       // campo-isca: robô preencheu, finge que deu certo
    const email = String(d.email || '').trim().toLowerCase();
    const nome = String(d.nome || '').trim().replace(/^[=+\-@\s]+/, '').slice(0, 60);
    if (email.length > 100 || !/^[a-z0-9][^\s@]*@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return resp({ ok: false, erro: 'Esse e-mail não parece válido.' });
    }
    const sh = pegaAba();
    if (sh.getLastRow() === 0) prepararPlanilha();
    if (sh.getLastRow() >= MAX_LINHAS) return resp({ ok: false, erro: 'A lista está cheia. Fale com o Vinícius.' });
    const n = sh.getLastRow();
    const jaTem = n > 1 && sh.getRange(2, 3, n - 1, 1).getValues().some((r) => String(r[0]).trim().toLowerCase() === email);
    if (jaTem) return resp({ ok: true, repetido: true });
    sh.appendRow([new Date(), nome, email, 'Pendente', '']);
    return resp({ ok: true });
  } catch (err) {
    return resp({ ok: false, erro: 'Não consegui registrar agora. Tenta de novo em instantes.' });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* ignora */ }
  }
}

function doGet() { return resp({ ok: true, msg: 'GOLIRA acessos no ar' }); }

function pegaAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(ABA) || ss.getSheets()[0];
}
function resp(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
