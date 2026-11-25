# GOLIRA v8 — Gorilão IA (chat + fichas)

## O que tem
- **Aba IA virou o chat do Gorilão** (Groq, modelo `openai/gpt-oss-20b`). Respostas curtas e zoeiras, com o seu contexto: nome, peso, altura, objetivo, água de hoje, treino/junk/cigarro de hoje, ficha ativa e treinos dos últimos 7 dias.
- **Recado do Gorilão** no topo da aba IA (por regras, não gasta IA): treino do dia, água no ritmo, hábitos.
- **Fichas pela IA**: peça "monta uma ficha pra mim". O Gorilão mostra a ficha e **só entra na aba Treino se você tocar em "Salvar na aba Treino"**. Se você ainda não tem ficha ativa, ela vira a ativa; senão fica na lista pra você ativar quando quiser.
- Conversa fica salva só no seu celular (últimas 24 mensagens). "Limpar conversa" apaga.
- A chave da Groq fica no servidor da Vercel (`api/gorilao.js`). Só quem está logado consegue usar, com limite de 40 mensagens por hora por pessoa.

## Pra implantar
1. **Supabase:** nada (sem SQL).
2. **GitHub**, subir/substituir:
   - `api/gorilao.js` (novo — crie a pasta `api` se precisar; `config.js` já está lá)
   - `js/ia.js` (novo)
   - `js/gorilao.js`, `index.html`, `css/style.css`
3. **Vercel:** nada de variável nova. A função lê `GROQ_API_KEY` e, se não existir, usa a `GEMINI_API_KEY` (que já guarda a chave da Groq).

## Privacidade
Ao conversar, o app manda pra Groq o contexto acima (peso, altura, objetivo, hábitos de hoje, ficha e treinos recentes) junto com a pergunta. Nada de e-mail, foto ou recados do Mural.
