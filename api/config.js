// Entrega ao site a URL e a chave PÚBLICA (anon) do Supabase.
// Elas ficam nas variáveis de ambiente da Vercel (a integração com o Supabase já cria isso).
// A chave anon é feita para ser pública: quem protege os dados é o RLS do banco.
module.exports = (req, res) => {
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!url || !anonKey) {
    return res.status(500).json({
      error: 'Faltam as variáveis SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.',
    });
  }
  return res.status(200).json({ url, anonKey });
};
