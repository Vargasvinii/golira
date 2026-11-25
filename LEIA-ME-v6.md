# GOLIRA v6 — Perfil da matilha (inclui o v5.1)

## O que tem
- **Foto de perfil**: em Configurações, "Escolher foto". O app recorta o centro em quadrado, reduz pra 256 px e guarda.
- **Aparecer pra minha matilha** (liga/desliga): mostra só nome, foto e sequência de dias.
- **Faixa da matilha** no topo do Mural; toque numa pessoa (ou na foto dela num recado) pra abrir o cartão de perfil.
- **Sequência atualizada sozinha** ao abrir o app e ao abrir o Histórico.
- Inclui o v5.1: Mural compacto, RECADO MACAQUISTA e reações 👍🏽 🍪 🔥 💪 🍅.

## Ordem pra implantar
1. Rodar no Supabase (SQL Editor, nessa ordem): `schema-v5b-reacoes.sql` e `schema-v6-perfil.sql`
2. Subir no GitHub: `index.html` (sem mudança), `css/style.css`, `js/app.js`, `js/historico.js`, `js/mural.js`

Sem o `schema-v6-perfil.sql` o app continua funcionando normal, só não mostra a parte de foto.

## Privacidade
A faixa usa uma função do banco que devolve **somente** nome, foto e sequência de quem tem a mesma tag e deixou aparecer. Peso, altura, objetivo, água e cigarro nunca saem dali.
