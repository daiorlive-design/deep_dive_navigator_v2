// ==========================================================
// Supabase Edge Function: speak
// Transforma um trecho de texto em áudio com as vozes neurais do Google
// (Gemini TTS). Usa o segredo GEMINI_API_KEY — mesmo que a IA de texto use
// o OpenRouter, a voz precisa desta chave. Só usuários logados podem chamar.
// Devolve um arquivo WAV (application/octet-stream).
// ==========================================================

// 1º = principal; se ele falhar ou demorar, tenta o 2º
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'];
const VOZES = ['Charon', 'Sulafat', 'Achernar', 'Puck'];
const VOZ_PADRAO = 'Charon';
const MAX_CHARS = 1200;
const TEMPO_LIMITE_MS = 25_000;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function erro(mensagem: string, status: number) {
    return new Response(JSON.stringify({ error: mensagem }), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

// Alguns modelos devolvem PCM "cru" (audio/L16); aqui ele ganha o cabeçalho WAV
function pcmParaWav(pcm: Uint8Array, taxa: number, canais = 1, bits = 16): Uint8Array {
    const wav = new Uint8Array(44 + pcm.length);
    const v = new DataView(wav.buffer);
    const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
    texto(0, 'RIFF');
    v.setUint32(4, 36 + pcm.length, true);
    texto(8, 'WAVE');
    texto(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, canais, true);
    v.setUint32(24, taxa, true);
    v.setUint32(28, taxa * canais * bits / 8, true);
    v.setUint16(32, canais * bits / 8, true);
    v.setUint16(34, bits, true);
    texto(36, 'data');
    v.setUint32(40, pcm.length, true);
    wav.set(pcm, 44);
    return wav;
}

function base64ParaBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return erro('Method not allowed', 405);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return erro('The server is missing the GEMINI_API_KEY secret', 500);

    let texto: unknown, voz: unknown;
    try {
        ({ text: texto, voice: voz } = await req.json());
    } catch {
        return erro('Invalid request', 400);
    }
    if (typeof texto !== 'string' || !texto.trim()) return erro('Nothing to read', 400);
    if (texto.length > MAX_CHARS) return erro('This passage is too long to read aloud at once', 413);
    const nomeDaVoz = VOZES.includes(voz as string) ? voz as string : VOZ_PADRAO;

    let ultimoErro = 'The voice service is unavailable right now';
    for (const modelo of TTS_MODELS) {
        const controle = new AbortController();
        const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
        try {
            const resposta = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
                {
                    method: 'POST',
                    signal: controle.signal,
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: texto.trim() }] }],
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: nomeDaVoz } } },
                        },
                    }),
                },
            );
            const data = await resposta.json().catch(() => ({}));
            if (!resposta.ok) {
                const msg: string = data?.error?.message || `Voice request failed (${resposta.status})`;
                if (resposta.status === 401 || resposta.status === 403 || /api key/i.test(msg)) {
                    return erro('The server voice key was rejected', 500);
                }
                ultimoErro = msg;
                continue; // ocupado, limite ou modelo indisponível: tenta o próximo
            }

            const parte = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!parte?.data) {
                ultimoErro = 'The voice service returned no audio';
                continue;
            }
            let audio = base64ParaBytes(parte.data);
            const mime = String(parte.mimeType || '').toLowerCase();
            if (!mime.includes('wav')) {
                const taxa = Number(/rate=(\d+)/.exec(mime)?.[1] || 24000);
                audio = pcmParaWav(audio, taxa);
            }
            return new Response(audio, {
                headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
            });
        } catch {
            ultimoErro = 'The voice service took too long to answer';
        } finally {
            clearTimeout(timer);
        }
    }
    return erro(ultimoErro, 503);
});
