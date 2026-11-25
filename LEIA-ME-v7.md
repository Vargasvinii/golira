# GOLIRA v7 — Fotos no Mural e no Recado macaquista

- Botão **Foto** ao lado de Postar: dá pra postar só foto, ou foto + texto.
- O **ADM** também pode anexar foto ao RECADO MACAQUISTA.
- A foto é reduzida no celular (lado maior 1080 px, ~100-300 KB) e vai pra um espaço **privado** do Supabase (Storage "mural"), em pasta por grupo. Só a matilha vê.
- Toque na foto pra ampliar.
- A foto "envelhece" junto com o recado (vai ficando sépia/desbotada).
- Apagar o recado apaga a foto. Fotos de recados que já sumiram (24h) são limpas sozinhas quando alguém abre o Mural.
- Sem rodar o SQL o app continua normal, só esconde o botão Foto.

## Pra implantar
1. Supabase (SQL Editor): `schema-v7-fotos.sql`
2. GitHub: `css/style.css`, `js/mural.js`
