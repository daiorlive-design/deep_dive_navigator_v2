// ==========================================
// NARRADOR — leitura em voz alta
// 1º tenta as vozes neurais do Google (Edge Function "speak", ver supabase/).
// Se a voz neural falhar ou demorar, usa a melhor voz do próprio navegador
// no idioma do texto. A leitura segue sozinha para as frases seguintes, com o
// destaque de foco acompanhando, até o fim da fase.
// Carregado antes do script.js; usa paragrafosDinamicos, paragrafoAtualIndex,
// atualizarFoco, chamarAtencaoParaQuiz e currentUser (do script.js).
// ==========================================
const VOZES_NEURAIS = [
    { id: 'Charon',   name: 'Charon',   description: 'Calm male narrator' },
    { id: 'Sulafat',  name: 'Sulafat',  description: 'Warm female voice' },
    { id: 'Achernar', name: 'Achernar', description: 'Soft female voice' },
    { id: 'Puck',     name: 'Puck',     description: 'Upbeat male voice' }
];
const VOZ_PADRAO = 'Charon'; // escolhida nos testes com a equipe
const LIMITE_ESPERA_VOZ_MS = 12000; // passou disso, lê esta frase com a voz do navegador
const FRASES_PREPARADAS = 2;        // quantas frases seguintes já vão sendo geradas
// WAV vazio: tocado no clique para "liberar" o áudio em navegadores mais rígidos (iPhone)
const AUDIO_SILENCIOSO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const btnTtsEl = document.getElementById('btn-tts');
const narracaoAudio = new Audio();
let narracaoAtiva = false;
let narracaoToken = 0;        // cada frase falada ganha um número; respostas antigas são ignoradas
let vozNeuralDesligada = false;
let idiomaDaFase = 'en-US';
const audiosPreparados = new Map(); // "voz|texto" → Promise<url do áudio>

function vozEscolhida() {
    const voz = currentUser && currentUser.sound && currentUser.sound.voice;
    return VOZES_NEURAIS.some(v => v.id === voz) ? voz : VOZ_PADRAO;
}

// --- Idioma do texto (para a voz do navegador; a neural detecta sozinha) ---
function detectarIdioma(texto) {
    const t = ` ${texto.toLowerCase()} `;
    const conta = (marcas) => marcas.reduce((n, m) => n + (t.split(m).length - 1), 0);
    const pontos = {
        'pt-BR': conta([' não ', ' você', ' é ', ' do ', ' da ', ' dos ', ' das ', 'ção', 'ções', 'ões', ' uma ', ' com ']),
        'en-US': conta([' the ', ' and ', ' of ', ' to ', ' is ', ' that ', ' with ', ' for ', ' are ', ' this ']),
        'es-ES': conta([' el ', ' los ', ' del ', ' y ', 'ción', 'ciones', ' una ', ' es ', ' muy ', ' pero '])
    };
    const [idioma, total] = Object.entries(pontos).sort((a, b) => b[1] - a[1])[0];
    return total > 0 ? idioma : 'en-US';
}

function melhorVozDoNavegador(idioma) {
    if (!window.speechSynthesis) return null;
    const base = idioma.slice(0, 2);
    const nota = (v) =>
        (/natural|neural/i.test(v.name) ? 8 : 0) +   // vozes "Natural" do Edge: as melhores
        (/online|google/i.test(v.name) ? 4 : 0) +
        (v.lang.toLowerCase() === idioma.toLowerCase() ? 2 : 0) +
        (v.localService ? 0 : 1);
    return speechSynthesis.getVoices()
        .filter(v => v.lang.toLowerCase().startsWith(base))
        .sort((a, b) => nota(b) - nota(a))[0] || null;
}
// O Chrome carrega a lista de vozes depois da página; isso garante que ela venha
if (window.speechSynthesis) speechSynthesis.getVoices();

// --- Áudio neural ---
function prepararAudio(texto, voz = vozEscolhida()) {
    const chave = `${voz}|${texto}`;
    if (!audiosPreparados.has(chave)) {
        const promessa = sb.functions.invoke('speak', { body: { text: texto, voice: voz } })
            .then(({ data, error }) => {
                if (error) {
                    const status = error.context && error.context.status;
                    // Função não publicada ou sem chave: não adianta insistir nesta sessão
                    if (error.name === 'FunctionsFetchError' || status === 404 || status === 500) {
                        vozNeuralDesligada = true;
                    }
                    throw error;
                }
                return URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
            });
        promessa.catch(() => audiosPreparados.delete(chave)); // permite tentar de novo depois
        audiosPreparados.set(chave, promessa);
    }
    return audiosPreparados.get(chave);
}

function comTempoLimite(promessa, ms) {
    return Promise.race([
        promessa,
        new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('timeout')), ms))
    ]);
}

// Chamado ao trocar de fase: libera a memória dos áudios da fase anterior
function prepararNarracaoDaFase(textoDaFase) {
    idiomaDaFase = detectarIdioma(textoDaFase);
    audiosPreparados.forEach(p => p.then(url => URL.revokeObjectURL(url)).catch(() => {}));
    audiosPreparados.clear();
}

// --- Controle da narração ---
function pararSomDaNarracao() {
    narracaoAudio.pause();
    narracaoAudio.onended = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
}

function estadoDoBotao(ativo, carregando = false) {
    btnTtsEl.classList.toggle('tool-btn-active', ativo);
    btnTtsEl.classList.toggle('is-loading', carregando);
    btnTtsEl.setAttribute('aria-pressed', String(ativo));
    btnTtsEl.title = ativo ? 'Stop reading aloud' : 'Read aloud (continues through the section)';
}

function iniciarNarracao() {
    if (!paragrafosDinamicos[paragrafoAtualIndex]) return;
    // "Libera" o áudio enquanto ainda estamos dentro do clique da pessoa
    narracaoAudio.src = AUDIO_SILENCIOSO;
    narracaoAudio.play().catch(() => {});
    narracaoAtiva = true;
    Sound.duck(true);
    estadoDoBotao(true);
    falarTrechoAtual();
}

function pararNarracao() {
    narracaoAtiva = false;
    narracaoToken++;
    pararSomDaNarracao();
    Sound.duck(false);
    estadoDoBotao(false);
}

async function falarTrechoAtual() {
    const meuToken = ++narracaoToken;
    pararSomDaNarracao();
    const trecho = paragrafosDinamicos[paragrafoAtualIndex];
    if (!trecho) return pararNarracao();
    const texto = trecho.textContent;

    if (!vozNeuralDesligada) {
        // Enquanto esta frase toca, as próximas já vão sendo geradas
        for (let i = 1; i <= FRASES_PREPARADAS; i++) {
            const proxima = paragrafosDinamicos[paragrafoAtualIndex + i];
            if (proxima) prepararAudio(proxima.textContent).catch(() => {});
        }
        estadoDoBotao(true, true);
        try {
            const url = await comTempoLimite(prepararAudio(texto), LIMITE_ESPERA_VOZ_MS);
            if (meuToken !== narracaoToken) return;
            estadoDoBotao(true, false);
            narracaoAudio.src = url;
            narracaoAudio.onended = () => { if (meuToken === narracaoToken) aoTerminarTrecho(); };
            await narracaoAudio.play();
            return;
        } catch (e) {
            if (meuToken !== narracaoToken) return;
            console.warn('Neural voice unavailable, using the browser voice:', e);
        }
    }
    estadoDoBotao(true, false);
    falarComVozDoNavegador(texto, meuToken);
}

function falarComVozDoNavegador(texto, meuToken) {
    if (!window.speechSynthesis) return pararNarracao();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = idiomaDaFase;
    const voz = melhorVozDoNavegador(idiomaDaFase);
    if (voz) fala.voice = voz;
    fala.rate = 0.95;
    fala.onend = () => { if (meuToken === narracaoToken) aoTerminarTrecho(); };
    fala.onerror = (ev) => {
        if (meuToken === narracaoToken && ev.error !== 'interrupted' && ev.error !== 'canceled') pararNarracao();
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(fala);
}

// Terminou uma frase: vai para a próxima, ou para no fim da fase
function aoTerminarTrecho() {
    if (!narracaoAtiva) return;
    if (paragrafoAtualIndex < paragrafosDinamicos.length - 1) {
        paragrafoAtualIndex++;
        atualizarFoco({ pelaNarracao: true });
        falarTrechoAtual();
    } else {
        pararNarracao();
        chamarAtencaoParaQuiz();
    }
}

// Amostra ao escolher uma voz no painel de som
async function tocarAmostraDeVoz(voz) {
    if (narracaoAtiva) return; // não interrompe a leitura em andamento
    narracaoAudio.src = AUDIO_SILENCIOSO;
    narracaoAudio.play().catch(() => {});
    const meuToken = ++narracaoToken;
    try {
        const url = await comTempoLimite(prepararAudio("Hi! I'll read your expedition with you.", voz), LIMITE_ESPERA_VOZ_MS);
        if (meuToken !== narracaoToken || narracaoAtiva) return;
        narracaoAudio.src = url;
        await narracaoAudio.play();
    } catch (e) {
        mostrarToast("Couldn't load that voice right now — the browser voice will be used instead.");
    }
}
