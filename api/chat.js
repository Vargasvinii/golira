import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mensagem não fornecida' });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "Você é o GOLIRA IA, um assistente de inteligência artificial focado em musculação, hipertrofia, constância, disciplina e finanças de atletas. Seu tom é motivador, direto, parceiro e levemente zueiro (estilo 'matilha'). Agradeça e ajude o usuário com treinos, dicas de dieta e controle de gastos."
            }
        });

        return res.status(200).json({ reply: response.text });
    } catch (error) {
        console.error('Erro na API do Gemini:', error);
        return res.status(500).json({ error: 'Erro ao processar a resposta da IA.' });
    }
}
