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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API Key do Gemini não configurada na Vercel.' });
        }

        // Requisição direta via fetch nativo usando o modelo gemini-1.5-flash
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: "Você é o GOLIRA IA, um assistente de inteligência artificial focado em musculação, hipertrofia, constância, disciplina e finanças de atletas. Seu tom é motivador, direto, parceiro e levemente zueiro (estilo 'matilha'). Ajude o usuário com treinos, dicas de dieta e controle de gastos." },
                            { text: message }
                        ]
                    }
                ]
            })
        });

        const data = await geminiResponse.json();

        if (data.error) {
            console.error('Erro retornado pela API do Gemini:', data.error);
            return res.status(500).json({ error: data.error.message || 'Erro na API do Gemini' });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta gerada.';

        return res.status(200).json({ reply: replyText });
    } catch (error) {
        console.error('Erro interno no servidor:', error);
        return res.status(500).json({ error: 'Erro ao processar a resposta da IA.' });
    }
}
