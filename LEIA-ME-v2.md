# GOLIRA v2: aba TREINO funcionando

Só 2 passos. Faça nesta ordem.

## 1. Banco de dados (Supabase)
1. Supabase, **SQL Editor, New query**.
2. Cole o conteúdo inteiro do `schema-v2.sql` e clique em **Run**.
3. Deve aparecer "Success. No rows returned". Pode rodar de novo sem medo.
> NÃO rode o `schema.sql` de novo.

## 2. Subir os arquivos no GitHub
1. **Descompacte** o zip no computador.
2. No repositório, **Add file, Upload files** e arraste o conteúdo da pasta (as pastas `css` e `js` junto com `index.html`). Os arquivos antigos são substituídos.
3. **Commit changes**. A Vercel publica sozinha em ~1 minuto.

Arquivos desta versão: `index.html`, `css/style.css`, `js/app.js`, `js/treino.js` (novo), `schema-v2.sql` (novo).

## O que testar
- Treino, **Criar minha ficha**: treinos A/B/C, exercícios por séries ou tempo, carga opcional.
- **Iniciar treino** (na primeira vez da semana ele sugere registrar o peso, e você pode pular).
- Cronômetro: feche o app e volte, o treino continua em andamento.
- Marque os exercícios, mude a carga, **Encerrar** (som e confete), escolha a dificuldade e leia o Gorilão.
- No 2º treino igual, aumente uma carga e veja o comentário de evolução.
- Aba Hoje: cartão "Treino de hoje" (se o treino tiver dia da semana).
- **iPhone:** o som só toca porque sai do toque no Encerrar. Se não tocar, avise.
