// ==========================================================
// Supabase Edge Function: map-document
// Recebe o texto do PDF, monta o prompt e chama a IA usando uma chave guardada
// como segredo no servidor. A chave nunca vai para o navegador.
// Só usuários logados conseguem chamar (verificação de JWT).
//
// Qual IA é usada depende dos segredos configurados no Supabase:
//   - OPENROUTER_API_KEY existe → usa o OpenRouter (preferido)
//   - senão, GEMINI_API_KEY existe → usa o Gemini direto do Google
// Trocar de um para outro é só adicionar/remover o segredo — sem novo deploy.
// ==========================================================

// 1º = principal; se ele falhar, o 2º é usado como reserva.
// Testado com um PDF de 12 páginas: flash-lite ≈ 4s, 3.8-flash ≈ 21s.
const OPENROUTER_MODELS = ['google/gemini-3.5-flash-lite', 'google/gemini-3.8-flash'];
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const MIN_CHARS = 50;
const MAX_CHARS = 150_000; // ~50 páginas de artigo

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

function montarPrompt(texto: string) {
    return `You are a gamified educational engine for students with ADHD.
    Read the academic text and divide it into "phases" (short chapters).
    For EACH phase, extract the corresponding portion of the text, create 1 multiple-choice
    question to validate focus, and provide 2-3 short scaffolding hints (key terms or ideas
    the reader should notice — NOT the answer itself, just pointers).

    CRITICAL RULES:
    1. The extracted text ("conteudo_leitura") MUST be kept EXACTLY in its original language. DO NOT translate the source text.
    2. The newly generated content ("titulo_fase", "pergunta", "alternativas", "dicas") MUST be in ENGLISH.
    3. "titulo_fase" must be SHORT (max 3 words) — it is used as a label on a map.

    Return STRICTLY a JSON array using these exact keys:
    [
      {
        "fase_numero": 1,
        "titulo_fase": "Short Title",
        "conteudo_leitura": "Original text, word for word, in its original language...",
        "dicas": ["Key term or idea 1", "Key term or idea 2"],
        "quiz": {
          "pergunta": "Question in English...",
          "alternativas": ["Option A", "Option B", "Option C", "Option D"],
          "resposta_correta_index": 0
        }
      }
    ]
    TEXT: ${texto}`;
}

// Resultado de uma chamada: o texto da IA, ou um erro com o status HTTP a devolver
type Resultado = { content: string } | { error: string; status: number };

async function chamarOpenRouter(apiKey: string, prompt: string): Promise<Resultado> {
    let resposta: Response;
    try {
        resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'X-Title': 'Deep Dive Navigator',
            },
            body: JSON.stringify({
                models: OPENROUTER_MODELS, // o OpenRouter troca para o reserva sozinho
                messages: [{ role: 'user', content: prompt }],
            }),
        });
    } catch {
        return { error: 'Could not reach the AI provider', status: 503 };
    }

    const data = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        // 401 do provedor = chave do servidor inválida (não é culpa de quem está logado)
        if (resposta.status === 401) return { error: 'The server AI key was rejected', status: 500 };
        return { error: data?.error?.message || `AI request failed (${resposta.status})`, status: resposta.status };
    }
    // O OpenRouter às vezes devolve 200 com um erro do provedor dentro
    if (data.error) return { error: data.error.message || 'The AI provider failed', status: 502 };
    return { content: data.choices?.[0]?.message?.content ?? '' };
}

async function chamarGemini(apiKey: string, prompt: string): Promise<Resultado> {
    let ultimo: Resultado = { error: 'AI request failed', status: 500 };
    for (const modelo of GEMINI_MODELS) {
        let resposta: Response;
        try {
            resposta = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                },
            );
        } catch {
            ultimo = { error: 'Could not reach the AI provider', status: 503 };
            continue;
        }

        const data = await resposta.json().catch(() => ({}));
        if (resposta.ok) {
            return { content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '' };
        }
        const msg: string = data?.error?.message || `AI request failed (${resposta.status})`;
        if (resposta.status === 401 || resposta.status === 403 || /api key/i.test(msg)) {
            return { error: 'The server AI key was rejected', status: 500 };
        }
        ultimo = { error: msg, status: resposta.status };
        // Modelo indisponível (404) ou ocupado (429/5xx): tenta o reserva
        if (resposta.status !== 404 && resposta.status !== 429 && resposta.status < 500) break;
    }
    return ultimo;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return responder({ error: 'Method not allowed' }, 405);

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!openRouterKey && !geminiKey) {
        return responder({ error: 'The server has no AI key configured (OPENROUTER_API_KEY or GEMINI_API_KEY)' }, 500);
    }

    let texto: unknown;
    try {
        ({ text: texto } = await req.json());
    } catch {
        return responder({ error: 'Invalid request' }, 400);
    }
    if (typeof texto !== 'string' || texto.trim().length < MIN_CHARS) {
        return responder({ error: 'This document has too little text to map (is it a scanned image?)' }, 400);
    }
    if (texto.length > MAX_CHARS) {
        return responder({ error: `This document is too long — please use one under ~${Math.round(MAX_CHARS / 3000)} pages` }, 413);
    }

    const prompt = montarPrompt(texto);
    const resultado = openRouterKey
        ? await chamarOpenRouter(openRouterKey, prompt)
        : await chamarGemini(geminiKey!, prompt);

    if ('error' in resultado) return responder({ error: resultado.error }, resultado.status);
    return responder({ content: resultado.content });
});
