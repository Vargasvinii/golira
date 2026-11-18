# GOLIRA, passo a passo (sem programar)

Este pacote é o **passo 1 a 3** do roteiro: app unificado com as 5 abas, login com Google, cadastro e água salva de verdade. Treino, Histórico, Mural e IA aparecem como "Em breve" e entram nos próximos passos.

Ordem importante: faça de 1 a 5 nesta sequência.

---

## 1. Criar as tabelas no Supabase
1. Abra o seu projeto no Supabase, menu **SQL Editor**, **New query**.
2. Cole o conteúdo inteiro do arquivo `schema.sql` e clique em **Run**.
3. Se aparecer algum erro, me mande a mensagem.

> Se você já tinha feito login no Supabase com algum usuário **antes** de rodar o schema, rode também esta linha para criar o perfil dele:
> ```sql
> insert into public.profiles (id) select id from auth.users on conflict do nothing;
> ```

## 2. Ligar o login com Google
**No Google Cloud** (console.cloud.google.com):
1. Crie um projeto (ou use um que já tenha), vá em **APIs e serviços, Credenciais, Criar credenciais, ID do cliente OAuth**.
2. Tipo: **Aplicativo da Web**.
3. Em **URIs de redirecionamento autorizados**, cole o endereço que o Supabase mostra em **Authentication, Sign In / Providers, Google** (termina em `/auth/v1/callback`).
4. Copie o **Client ID** e o **Client Secret**.

**No Supabase:**
1. **Authentication, Sign In / Providers, Google**: ative, cole o Client ID e o Secret, salve.
2. **Authentication, URL Configuration**:
   - **Site URL**: o endereço do seu app na Vercel (ex.: `https://goliira.vercel.app`).
   - **Redirect URLs**: adicione `https://SEU-APP.vercel.app/**`

## 3. Conferir as chaves na Vercel
A integração do Supabase com a Vercel já cria as variáveis sozinha. Em **Vercel, seu projeto, Settings, Environment Variables**, confira se existem:
- `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Se tiver só uma versão, tudo bem, o app aceita as duas. Se não existir nenhuma, crie `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os valores de **Supabase, Project Settings, API**. Use a chave **anon / publishable**, nunca a `service_role`.

## 4. Subir os arquivos no GitHub
1. Descompacte o `goliira.zip` no computador.
2. No GitHub, abra o repositório do projeto, **Add file, Upload files**.
3. Arraste **o conteúdo da pasta** (index.html, as pastas api, css, js, icons, assets e os demais arquivos), não a pasta em si.
4. Clique em **Commit changes**.
5. Se o repositório tiver os arquivos antigos do Gemini (historico.txt etc.), pode apagá-los depois.

A Vercel publica sozinha em cerca de 1 minuto. O `vercel.json` já avisa que é um site simples, sem Next.js.

## 5. Testar e instalar no celular
1. Abra o endereço da Vercel no celular e entre com o Google.
2. Preencha o cadastro. Use uma tag de grupo difícil de adivinhar, tipo `MATILHA-7K2Q`.
3. **iPhone:** Safari, botão compartilhar, **Adicionar à Tela de Início**.
   **Android:** Chrome, menu de três pontos, **Instalar app**.
4. Teste o login **de dentro do app instalado**. No iPhone o retorno do Google às vezes cai no Safari, e é bom descobrir isso agora.

## 6. Virar ADM (para o Recado macaquista)
Depois de fazer login uma vez, rode no SQL Editor:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'SEU_EMAIL@gmail.com');
```

---

## O que tem em cada arquivo
| Arquivo | Para que serve |
|---|---|
| `index.html` | A página única do app |
| `css/style.css` | Visual (bordô e areia, igual ao do Gemini) |
| `js/app.js` | Login, cadastro, abas e água |
| `api/config.js` | Entrega a chave pública do Supabase ao site |
| `img/` | A logo do GOLIRA em PNG transparente: completa (login), horizontal (cabeçalho) e só o gorila (marca d'água) |
| `assets/vitoria.mp3` | O som do treino, que antes estava dentro do HTML como Base64 |
| `manifest.webmanifest`, `sw.js`, `icons/` | Deixam o site instalável na tela inicial |
| `schema.sql` | Tabelas do banco (rodar uma vez no Supabase) |
