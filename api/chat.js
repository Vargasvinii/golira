export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mensagem não fornecida' });
        }

        // Aceita tanto a GEMINI_API_KEY quanto GROQ_API_KEY configuradas na Vercel
        const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API Key não configurada nas variáveis de ambiente da Vercel.' });
        }

        // Requisição para a API da Groq usando o modelo ativo openai/gpt-oss-20b
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-20b',
                messages: [
                    {
                        role: 'system',
                        content: "Você é o GOLIRA IA, um assistente de inteligência artificial focado em musculação, hipertrofia, constância, disciplina e finanças de atletas. Seu tom é motivador, direto, parceiro e levemente zueiro (estilo 'matilha'). Ajude o usuário com treinos, dicas de dieta e controle de gastos."
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await groqResponse.json();

        if (data.error) {
            console.error('Erro retornado pela Groq:', data.error);
            return res.status(500).json({ error: data.error.message || 'Erro na API da Groq' });
        }

        const replyText = data.choices?.[0]?.message?.content || 'Sem resposta gerada.';

        return res.status(200).json({ reply: replyText });
    } catch (error) {
        console.error('Erro interno no servidor:', error);
        return res.status(500).json({ error: 'Erro ao processar a resposta da IA.' });
    }
}
