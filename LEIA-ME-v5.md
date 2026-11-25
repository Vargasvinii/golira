# GOLIRA v5 — Mural + Hoje enxuta

## O que mudou
- **Hoje**: saiu o gorila desenhado e o recado. Ficou só a barra "Força do dia".
- **Mural** (aba nova de verdade):
  - recados da sua matilha (mesma tag de grupo), até 280 caracteres
  - somem em 24h e vão "envelhecendo": bordô neon -> bege escuro, com a borda esfarelando como areia
  - reações 🦍 🔥 💪 (toque de novo pra tirar)
  - **Recado macaquista**: só o ADM escreve, todo mundo lê, não expira e mostra a data
  - atualiza sozinho a cada ~25s
- Quem ainda não tem tag de grupo vê o aviso pra entrar numa (e já lê o recado macaquista).

## Como subir (GitHub, pelo site)
Substitua/adicione:
- `index.html`
- `css/style.css`
- `js/app.js`
- `js/gorilao.js`
- `js/mural.js`  (novo)
- `schema-v5-mural.sql`  (novo, opcional ficar no repo)

## Banco (Supabase)
O Mural já funciona com as tabelas que existem. O `schema-v5-mural.sql` só liga a
**faxina automática** (apaga de verdade recados com mais de 48h, todo dia 03:17).
Quem manda rodar sou eu, com o seu OK, ou você cola no SQL Editor.
