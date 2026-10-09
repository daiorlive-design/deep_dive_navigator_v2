// Configurando o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// A IA é chamada pelo servidor (Supabase Edge Function "map-document"):
// nenhuma chave de IA fica neste arquivo.

// Contas, perfil e expedição ficam no Supabase (ver cloud.js)
const FONT_PREF_KEY = 'deepdive_navigator_font_pref';
const MIN_PASSWORD = 8;

// --- REGRAS DE RECOMPENSA ---
// Escala de níveis: cada nível pede 50 XP a mais que o anterior
// (1→2: 100 XP, 2→3: 150, 3→4: 200 … 9→10: 500). Com 50 XP por quiz, os
// primeiros níveis saem rápido e os seguintes pedem mais leituras.
const XP_FIRST_LEVEL = 100;
const XP_LEVEL_STEP = 50;
const XP_PER_QUIZ = 50;
const SHARDS_PER_QUIZ = 10;
const DEFAULT_SOUND = { music: true, track: 0, volume: 40, sfx: true, voice: 'Charon' };
// Avatares, molduras, títulos e DEFAULT_TITLE ficam no catálogo em shop.js

// --- ELEMENTOS DO DOM ---
const authScreen = document.getElementById('auth-screen');
const uploadScreen = document.getElementById('upload-screen');
const gameScreen = document.getElementById('game-screen');
const uploadInput = document.getElementById('upload-pdf');
const btnProcessar = document.getElementById('btn-processar');
const statusMsg = document.getElementById('status-msg');
const errorMsg = document.getElementById('error-msg');
const loadingText = statusMsg.querySelector('.loading-text');
const LOADING_TEXT_PADRAO = loadingText.textContent;
const fileNameDisplay = document.getElementById('file-name-display');

const resumeBanner = document.getElementById('resume-banner');
const resumeDetails = document.getElementById('resume-details');
const btnResume = document.getElementById('btn-resume');
const btnDiscard = document.getElementById('btn-discard');

const questTrail = document.getElementById('quest-trail');
const questTrailWrap = document.getElementById('quest-trail-wrap');
const questProgressFill = document.getElementById('quest-progress-fill');
const expeditionProgress = document.getElementById('expedition-progress');
const welcomeTitle = document.getElementById('welcome-title');

const playerHud = document.getElementById('player-hud');
const hudAvatar = document.getElementById('hud-avatar');
const hudName = document.getElementById('hud-name');
const hudTitle = document.getElementById('hud-title');
const hudLevel = document.getElementById('hud-level');
const hudXpText = document.getElementById('hud-xp-text');
const hudXpBar = document.getElementById('hud-xp-bar');
const hudXpFill = document.getElementById('hud-xp-fill');
const hudShards = document.getElementById('hud-shards');
const btnLogout = document.getElementById('btn-logout');
const toast = document.getElementById('toast');

const btnSound = document.getElementById('btn-sound');
const soundPanel = document.getElementById('sound-panel');
const toggleMusic = document.getElementById('toggle-music');
const toggleSfx = document.getElementById('toggle-sfx');
const trackList = document.getElementById('track-list');
const musicVolume = document.getElementById('music-volume');

const authLoading = document.getElementById('auth-loading');
const authTabs = document.getElementById('auth-tabs');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const forgotForm = document.getElementById('forgot-form');
const newpassForm = document.getElementById('newpass-form');
const loginMsg = document.getElementById('login-msg');
const registerMsg = document.getElementById('register-msg');
const forgotMsg = document.getElementById('forgot-msg');
const newpassMsg = document.getElementById('newpass-msg');
const btnResend = document.getElementById('btn-resend');
const btnForgot = document.getElementById('btn-forgot');
const btnBackLogin = document.getElementById('btn-back-login');
const avatarOptions = document.getElementById('avatar-options');

const phaseTitle = document.getElementById('phase-title');
const dynamicTextContainer = document.getElementById('dynamic-text-container');
const hintPanel = document.getElementById('hint-panel');
const hintList = document.getElementById('hint-list');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnQuiz = document.getElementById('btn-quiz');
const btnHint = document.getElementById('btn-hint');

const btnFontToggle = document.getElementById('btn-font-toggle');
const btnTts = document.getElementById('btn-tts');
const btnFocusMode = document.getElementById('btn-focus-mode');

const quizModal = document.getElementById('quiz-modal');
const quizQuestion = document.getElementById('quiz-question');
const quizOptionsContainer = document.getElementById('quiz-options');
const quizFeedback = document.getElementById('quiz-feedback');
const feedbackText = document.getElementById('feedback-text');
const btnNextPhase = document.getElementById('btn-next-phase');
const failControls = document.getElementById('fail-controls');
const btnTryAgain = document.getElementById('btn-try-again');
const btnReread = document.getElementById('btn-reread');

// --- VARIÁVEIS DE ESTADO (O CÉREBRO DO JOGO) ---
let trilhaDeFases = [];
let faseAtualIndex = 0;
let paragrafosDinamicos = [];
let paragrafoAtualIndex = 0;
let focusModeOn = true;
let readableFontOn = false;

// Jogador logado: { id, email, username, displayName, avatarId, frameId, title, xp, shards, owned, sound }
let currentUser = null;

// ==========================================
// 0. CONTAS, LOGIN E PERFIL (Supabase Auth — ver cloud.js)
// ==========================================

function saveCurrentUser() {
    salvarPerfilNaNuvem();
}

function xpParaPassarDoNivel(level) {
    return XP_FIRST_LEVEL + XP_LEVEL_STEP * (level - 1);
}

// { level, xpIntoLevel (XP dentro do nível atual), xpForNext (XP que o nível atual pede) }
function getLevelInfo(xp) {
    let level = 1;
    let restante = xp;
    while (restante >= xpParaPassarDoNivel(level)) {
        restante -= xpParaPassarDoNivel(level);
        level++;
    }
    return { level, xpIntoLevel: restante, xpForNext: xpParaPassarDoNivel(level) };
}

// --- Telas de login / cadastro / senha ---
const AUTH_VIEWS = { login: loginForm, register: registerForm, forgot: forgotForm, newpass: newpassForm };
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mostrarAba(aba) {
    authLoading.classList.add('hidden');
    authTabs.classList.toggle('hidden', aba === 'forgot' || aba === 'newpass');
    Object.entries(AUTH_VIEWS).forEach(([nome, form]) => form.classList.toggle('hidden', nome !== aba));
    tabLogin.classList.toggle('auth-tab-active', aba === 'login');
    tabRegister.classList.toggle('auth-tab-active', aba === 'register');
    tabLogin.setAttribute('aria-selected', String(aba === 'login'));
    tabRegister.setAttribute('aria-selected', String(aba === 'register'));
    [loginMsg, registerMsg, forgotMsg, newpassMsg].forEach(m => m.classList.add('hidden'));
    btnResend.classList.add('hidden');
    const primeiroCampo = AUTH_VIEWS[aba].querySelector('input');
    if (primeiroCampo) primeiroCampo.focus();
}

tabLogin.addEventListener('click', () => mostrarAba('login'));
tabRegister.addEventListener('click', () => mostrarAba('register'));
btnBackLogin.addEventListener('click', () => mostrarAba('login'));
btnForgot.addEventListener('click', () => {
    const email = document.getElementById('login-email').value.trim();
    mostrarAba('forgot');
    document.getElementById('forgot-email').value = email;
});

function mostrarMensagem(el, texto, tipo) {
    Sound.play(tipo === 'success' ? 'success' : 'error');
    el.textContent = texto;
    el.classList.remove('hidden', 'form-msg-error', 'form-msg-success');
    el.classList.add(tipo === 'success' ? 'form-msg-success' : 'form-msg-error');
}

// Desativa o botão do formulário enquanto espera o servidor
async function comBotaoOcupado(form, textoEspera, acao) {
    const btn = form.querySelector('button[type="submit"]');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = textoEspera;
    try {
        await acao();
    } catch (e) {
        console.error(e);
        mostrarMensagem(form.querySelector('.form-msg'), traduzirErroDeAuth(e));
    } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
}

// Seletor de avatar do cadastro
AVATARS.forEach((avatar, index) => {
    const label = document.createElement('label');
    label.className = 'avatar-option';
    label.title = avatar.name;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'avatar';
    input.value = avatar.id;
    input.checked = index === 0;

    const bubble = document.createElement('span');
    bubble.className = 'avatar-bubble';
    bubble.textContent = avatar.emoji;
    bubble.setAttribute('aria-hidden', 'true');

    const nome = document.createElement('span');
    nome.className = 'avatar-name';
    nome.textContent = avatar.name;

    label.append(input, bubble, nome);
    avatarOptions.appendChild(label);
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const displayName = document.getElementById('reg-display').value.trim();
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const avatarId = (registerForm.querySelector('input[name="avatar"]:checked') || {}).value || AVATARS[0].id;

    if (!displayName) return mostrarMensagem(registerMsg, 'Tell us your explorer name.');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return mostrarMensagem(registerMsg, 'Username must be 3–20 characters: letters, numbers or _.');
    }
    if (!EMAIL_VALIDO.test(email)) return mostrarMensagem(registerMsg, 'Please enter a valid email address.');
    if (password.length < MIN_PASSWORD) return mostrarMensagem(registerMsg, `Password must have at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return mostrarMensagem(registerMsg, "Passwords don't match.");
    if (!document.getElementById('reg-consent').checked) {
        return mostrarMensagem(registerMsg, 'Please read and accept the Privacy notice to create your account.');
    }

    comBotaoOcupado(registerForm, 'Creating account…', async () => {
        const { data: livre, error: erroNome } = await sb.rpc('username_available', { name: username });
        if (erroNome) return mostrarMensagem(registerMsg, traduzirErroDeAuth(erroNome));
        if (!livre) return mostrarMensagem(registerMsg, 'That username is already taken.');

        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: URL_DO_APP,
                data: { username, display_name: displayName, avatar_id: avatarId, consent_version: CONSENT_VERSION }
            }
        });
        if (error) return mostrarMensagem(registerMsg, traduzirErroDeAuth(error));
        // Com confirmação de e-mail ligada, um e-mail já cadastrado volta sem "identities"
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            return mostrarMensagem(registerMsg, 'An account with this email already exists. Try signing in.');
        }

        registerForm.reset();
        avatarOptions.querySelector('input').checked = true;
        if (data.session) return; // confirmação desligada: a pessoa já entra direto

        mostrarAba('login');
        document.getElementById('login-email').value = email;
        mostrarMensagem(loginMsg, `Almost there, ${displayName}! We sent a confirmation link to ${email}. Open it to activate your account (check spam too).`, 'success');
    });
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    btnResend.classList.add('hidden');
    if (!EMAIL_VALIDO.test(email) || !password) {
        return mostrarMensagem(loginMsg, 'Please enter your email and password.');
    }

    comBotaoOcupado(loginForm, 'Signing in…', async () => {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
            mostrarMensagem(loginMsg, traduzirErroDeAuth(error));
            btnResend.classList.toggle('hidden', !/email not confirmed/i.test(error.message));
            return;
        }
        // A entrada no app acontece pelo evento SIGNED_IN (ver iniciarAutenticacao)
        document.getElementById('login-password').value = '';
        Sound.play('start');
    });
});

btnResend.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: URL_DO_APP } });
    if (error) return mostrarMensagem(loginMsg, traduzirErroDeAuth(error));
    btnResend.classList.add('hidden');
    mostrarMensagem(loginMsg, `We sent a new confirmation link to ${email}.`, 'success');
});

forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    if (!EMAIL_VALIDO.test(email)) return mostrarMensagem(forgotMsg, 'Please enter a valid email address.');

    comBotaoOcupado(forgotForm, 'Sending…', async () => {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: URL_DO_APP });
        if (error) return mostrarMensagem(forgotMsg, traduzirErroDeAuth(error));
        mostrarMensagem(forgotMsg, `If an account exists for ${email}, a reset link is on its way. Check your inbox (and spam).`, 'success');
    });
});

newpassForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('newpass-password').value;
    const confirm = document.getElementById('newpass-confirm').value;
    if (password.length < MIN_PASSWORD) return mostrarMensagem(newpassMsg, `Password must have at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return mostrarMensagem(newpassMsg, "Passwords don't match.");

    comBotaoOcupado(newpassForm, 'Saving…', async () => {
        const { data, error } = await sb.auth.updateUser({ password });
        if (error) return mostrarMensagem(newpassMsg, traduzirErroDeAuth(error));
        newpassForm.reset();
        emRecuperacaoDeSenha = false;
        mostrarToast('🔑 Password updated!');
        await entrarComSessao(data.user);
    });
});

// --- Entrar e sair ---
let entrandoComo = null;
let emRecuperacaoDeSenha = false;
let mensagemDeSaida = null;

async function entrarComSessao(authUser) {
    if (!authUser || entrandoComo === authUser.id || (currentUser && currentUser.id === authUser.id)) return;
    entrandoComo = authUser.id;
    try {
        currentUser = normalizarPerfil(await carregarPerfil(authUser));
        currentUser.sound = { ...DEFAULT_SOUND, ...currentUser.sound };
        saveCurrentUser(); // grava os campos que a normalização completou
        await carregarExpedicao();

        playerHud.classList.remove('hidden');
        renderizarHud();
        aplicarPreferenciasDeSom();
        mostrarTelaUpload();
        verificarAvisoDeUpload();
        iniciarAmigos();
    } catch (e) {
        console.error('Could not load profile:', e);
        currentUser = null;
        mensagemDeSaida = "We couldn't load your profile. Please try again in a moment.";
        await sb.auth.signOut();
    } finally {
        entrandoComo = null;
    }
}

function limparTelaAoSair() {
    pararLeituraEmVoz();
    Sound.setMusic(false);
    fecharPainelDeSom();
    shopModal.classList.replace('modal-visible', 'modal-hidden');
    quizModal.classList.replace('modal-visible', 'modal-hidden');
    accountModal.classList.replace('modal-visible', 'modal-hidden');
    privacyModal.classList.replace('modal-visible', 'modal-hidden');
    uploadNoticeModal.classList.replace('modal-visible', 'modal-hidden');
    pararAmigos();
    currentUser = null;
    trilhaDeFases = [];
    expedicaoSalva = null;
    playerHud.classList.add('hidden');
    mostrarTela(authScreen);
    mostrarAba('login');
    if (mensagemDeSaida) {
        mostrarMensagem(loginMsg, mensagemDeSaida);
        mensagemDeSaida = null;
    }
}

btnLogout.addEventListener('click', async () => {
    btnLogout.disabled = true;
    // Garante que as últimas alterações chegaram ao banco antes de sair
    await Promise.all([salvarPerfilNaNuvem(), salvarExpedicaoNaNuvem()]);
    const { error } = await sb.auth.signOut();
    btnLogout.disabled = false;
    if (error) limparTelaAoSair(); // a sessão local é apagada mesmo se o servidor falhar
});

function iniciarAutenticacao() {
    // Links de e-mail (confirmação / nova senha) voltam com dados no endereço
    const paramsDoLink = new URLSearchParams(location.hash.slice(1));
    const erroNoLink = paramsDoLink.get('error_description');
    if (paramsDoLink.get('type') === 'recovery') emRecuperacaoDeSenha = true;

    sb.auth.onAuthStateChange((evento, sessao) => {
        // A biblioteca recomenda não chamar o Supabase direto aqui dentro: adiamos
        setTimeout(() => {
            if (location.hash.includes('access_token') || erroNoLink) {
                history.replaceState(null, '', URL_DO_APP);
            }

            if (evento === 'PASSWORD_RECOVERY') {
                emRecuperacaoDeSenha = true;
                mostrarTela(authScreen);
                mostrarAba('newpass');
                return;
            }
            if (evento === 'SIGNED_OUT') {
                limparTelaAoSair();
                return;
            }
            if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') {
                if (emRecuperacaoDeSenha) {
                    mostrarAba('newpass');
                } else if (sessao) {
                    entrarComSessao(sessao.user);
                } else if (evento === 'INITIAL_SESSION') {
                    mostrarAba('login');
                    if (erroNoLink) {
                        mostrarMensagem(loginMsg, 'That link has expired or was already used. Please request a new one.');
                    }
                }
            }
        }, 0);
    });
}

// --- HUD do jogador ---
function renderizarHud() {
    if (!currentUser) return;
    const { level, xpIntoLevel, xpForNext } = getLevelInfo(currentUser.xp);
    const pct = Math.round((xpIntoLevel / xpForNext) * 100);

    desenharAvatar(hudAvatar, currentUser.avatarId, currentUser.frameId);
    hudName.textContent = currentUser.displayName;
    hudTitle.textContent = currentUser.title || DEFAULT_TITLE;
    hudLevel.textContent = `Lvl ${level}`;
    hudXpText.textContent = `${xpIntoLevel} / ${xpForNext} XP`;
    hudXpBar.parentElement.title = `${xpForNext - xpIntoLevel} XP to reach level ${level + 1}`;
    hudXpFill.style.width = `${pct}%`;
    hudXpBar.setAttribute('aria-valuenow', String(pct));
    hudShards.textContent = `💎 ${currentUser.shards}`;
}

function concederRecompensa(xp, shards) {
    const nivelAntes = getLevelInfo(currentUser.xp).level;
    currentUser.xp += xp;
    currentUser.shards += shards;
    registrarXpDaSemana(xp);
    saveCurrentUser();
    renderizarHud();

    hudShards.classList.remove('bump');
    void hudShards.offsetWidth; // reinicia a animação
    hudShards.classList.add('bump');

    const nivelDepois = getLevelInfo(currentUser.xp).level;
    if (nivelDepois > nivelAntes) {
        Sound.play('levelup');
        mostrarToast(`🎉 Level up! You reached level ${nivelDepois}.`);
    } else {
        Sound.play('coins');
    }
}

let toastTimer = null;
function mostrarToast(texto, duracao = 3200) {
    toast.textContent = texto;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), duracao);
}

// --- Música e efeitos sonoros ---
Sound.tracks.forEach((track, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track-option';
    btn.setAttribute('role', 'radio');
    btn.dataset.index = String(index);
    btn.innerHTML = `
        <span class="track-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="track-text">
            <span class="track-name"></span>
            <span class="track-desc"></span>
        </span>`;
    btn.querySelector('.track-name').textContent = track.name;
    btn.querySelector('.track-desc').textContent = track.description;
    btn.addEventListener('click', () => {
        currentUser.sound.track = index;
        currentUser.sound.music = true;
        salvarPreferenciasDeSom();
    });
    trackList.appendChild(btn);
});

// Vozes de leitura (voice.js): escolher uma toca uma amostra
const voiceList = document.getElementById('voice-list');
VOZES_NEURAIS.forEach(voz => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track-option voice-option';
    btn.setAttribute('role', 'radio');
    btn.dataset.voice = voz.id;
    btn.innerHTML = `
        <span class="voice-icon" aria-hidden="true">&#128483;</span>
        <span class="track-text">
            <span class="track-name"></span>
            <span class="track-desc"></span>
        </span>`;
    btn.querySelector('.track-name').textContent = voz.name;
    btn.querySelector('.track-desc').textContent = voz.description;
    btn.addEventListener('click', () => {
        currentUser.sound.voice = voz.id;
        salvarPreferenciasDeSom();
        tocarAmostraDeVoz(voz.id);
    });
    voiceList.appendChild(btn);
});

function aplicarPreferenciasDeSom() {
    const s = currentUser.sound;
    Sound.setSfx(s.sfx);
    Sound.setVolume(s.volume / 100);
    Sound.setTrack(s.track);
    Sound.setMusic(s.music);
    renderizarPainelDeSom();
}

function salvarPreferenciasDeSom() {
    saveCurrentUser();
    aplicarPreferenciasDeSom();
}

function renderizarPainelDeSom() {
    const s = currentUser.sound;
    toggleMusic.setAttribute('aria-checked', String(s.music));
    toggleSfx.setAttribute('aria-checked', String(s.sfx));
    musicVolume.value = String(s.volume);
    trackList.querySelectorAll('.track-option').forEach(btn => {
        const selected = Number(btn.dataset.index) === s.track;
        btn.setAttribute('aria-checked', String(selected));
        btn.classList.toggle('is-playing', selected && s.music);
    });
    voiceList.querySelectorAll('.voice-option').forEach(btn => {
        btn.setAttribute('aria-checked', String(btn.dataset.voice === vozEscolhida()));
    });
    btnSound.classList.toggle('is-muted', !s.music);
    btnSound.title = s.music ? `Music: ${Sound.tracks[s.track].name}` : 'Music & sounds (music off)';
}

function fecharPainelDeSom() {
    soundPanel.classList.add('hidden');
    btnSound.setAttribute('aria-expanded', 'false');
}

btnSound.addEventListener('click', () => {
    const abrir = soundPanel.classList.contains('hidden');
    soundPanel.classList.toggle('hidden', !abrir);
    btnSound.setAttribute('aria-expanded', String(abrir));
});

document.addEventListener('click', (e) => {
    if (!soundPanel.classList.contains('hidden') && !e.target.closest('.hud-sound')) fecharPainelDeSom();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !soundPanel.classList.contains('hidden')) {
        fecharPainelDeSom();
        btnSound.focus();
    }
});

toggleMusic.addEventListener('click', () => {
    currentUser.sound.music = !currentUser.sound.music;
    salvarPreferenciasDeSom();
});

toggleSfx.addEventListener('click', () => {
    currentUser.sound.sfx = !currentUser.sound.sfx;
    salvarPreferenciasDeSom();
});

musicVolume.addEventListener('input', () => {
    currentUser.sound.volume = Number(musicVolume.value);
    Sound.setVolume(currentUser.sound.volume / 100);
});
musicVolume.addEventListener('change', saveCurrentUser);

// Som de clique em todos os botões (data-sfx="none" desliga; data-sfx="nome" troca o som)
document.addEventListener('click', (e) => {
    if (e.target.matches('input')) return; // evita som duplo em <label> com input
    const el = e.target.closest('button, .btn-outline, .avatar-option');
    if (!el || el.disabled) return;
    const efeito = el.dataset.sfx || 'click';
    if (efeito !== 'none') Sound.play(efeito);
});

// Navegadores só liberam áudio após um gesto do usuário (ex.: depois de um F5)
['pointerdown', 'keydown'].forEach(evt => document.addEventListener(evt, () => Sound.unlock()));

// --- Troca de telas ---
function mostrarTela(tela) {
    [authScreen, uploadScreen, gameScreen].forEach(s => s.classList.toggle('screen-active', s === tela));
    window.scrollTo(0, 0);
}

function mostrarTelaUpload() {
    welcomeTitle.textContent = `Welcome, ${currentUser.displayName}`;
    uploadInput.value = '';
    fileNameDisplay.classList.add('hidden');
    btnProcessar.disabled = true;
    errorMsg.classList.add('hidden');

    const saved = getSavedSession();
    if (saved && saved.trilhaDeFases && saved.trilhaDeFases.length) {
        resumeBanner.classList.remove('hidden');
        resumeDetails.textContent = `Phase ${(saved.faseAtualIndex || 0) + 1} of ${saved.trilhaDeFases.length}`;
    } else {
        resumeBanner.classList.add('hidden');
    }
    mostrarTela(uploadScreen);
}

// ==========================================
// 0.1 PREFERÊNCIAS E EXPEDIÇÃO SALVA (por usuário)
// ==========================================
(function init() {
    if (localStorage.getItem(FONT_PREF_KEY) === 'on') {
        readableFontOn = true;
        document.body.classList.add('readable-font');
        btnFontToggle.classList.add('tool-btn-active');
        btnFontToggle.setAttribute('aria-pressed', 'true');
    }

    if (typeof sb === 'undefined') {
        // A biblioteca do Supabase não carregou (sem internet ou bloqueada)
        authLoading.textContent = 'Could not connect to the server. Check your internet connection and reload the page.';
        return;
    }
    iniciarAutenticacao();
})();

// A expedição em andamento fica na nuvem (cloud.js); aqui só usamos a cópia local
function getSavedSession() {
    return expedicaoSalva;
}

function saveSession() {
    if (!currentUser) return;
    expedicaoSalva = { trilhaDeFases, faseAtualIndex };
    salvarExpedicaoNaNuvem();
}

function clearSession() {
    expedicaoSalva = null;
    salvarExpedicaoNaNuvem();
}

btnResume.addEventListener('click', () => {
    const saved = getSavedSession();
    if (!saved) return;
    trilhaDeFases = saved.trilhaDeFases;
    faseAtualIndex = saved.faseAtualIndex || 0;
    iniciarJogo(true);
});

btnDiscard.addEventListener('click', () => {
    clearSession();
    resumeBanner.classList.add('hidden');
});

// Evento que escuta a seleção do arquivo
uploadInput.addEventListener('change', () => {
    const file = uploadInput.files[0];
    if (file) {
        fileNameDisplay.textContent = `Selected file: ${file.name}`;
        fileNameDisplay.classList.remove('hidden');
        btnProcessar.disabled = false;
    } else {
        fileNameDisplay.classList.add('hidden');
        btnProcessar.disabled = true;
    }
});

// ==========================================
// 1. MOTOR DE PROCESSAMENTO (PDF + IA)
// ==========================================
btnProcessar.addEventListener('click', async () => {
    const file = uploadInput.files[0];
    if (!file) {
        alert("Please select a PDF file first.");
        return;
    }

    errorMsg.classList.add('hidden');
    loadingText.textContent = LOADING_TEXT_PADRAO;
    statusMsg.classList.remove('hidden');
    btnProcessar.disabled = true;

    try {
        const textoDoPDF = await extrairTextoDoPDF(file);
        const jsonIA = await analisarComIA(textoDoPDF);

        if (jsonIA && jsonIA.length > 0) {
            trilhaDeFases = jsonIA;
            faseAtualIndex = 0;
            iniciarJogo(false);
        } else {
            throw new Error('The AI did not return any reading phases.');
        }
    } catch (error) {
        console.error("Erro no processo:", error);
        errorMsg.textContent = `We couldn't map this document: ${error.message || 'unknown error'}. Please try again in a moment.`;
        errorMsg.classList.remove('hidden');
    } finally {
        statusMsg.classList.add('hidden');
        btnProcessar.disabled = false;
    }
});

async function extrairTextoDoPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let textoCompleto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        textoCompleto += conteudo.items.map(item => item.str).join(' ') + '\n';
    }
    return textoCompleto;
}

// O prompt, os modelos e a chave da IA ficam no servidor:
// supabase/functions/map-document/index.ts
async function analisarComIA(textoOriginal) {
    const parte = await chamarIA(textoOriginal);
    if (!parte) throw new Error('The AI returned an empty answer');

    // Tira cercas de código e qualquer texto antes/depois do array JSON
    let respostaTexto = parte.replace(/```json/g, '').replace(/```/g, '').trim();
    const inicio = respostaTexto.indexOf('[');
    const fim = respostaTexto.lastIndexOf(']');
    if (inicio !== -1 && fim > inicio) respostaTexto = respostaTexto.slice(inicio, fim + 1);

    try {
        return JSON.parse(respostaTexto);
    } catch (e) {
        throw new Error('The AI answer came back in an unexpected format');
    }
}

// --- Chamada à IA com novas tentativas ---
// O serviço às vezes responde "ocupado" (503) ou "limite de uso" (429) por
// alguns instantes; nesses casos tentamos de novo antes de desistir.
const ERROS_TEMPORARIOS = [408, 429, 500, 502, 503, 504];
const TENTATIVAS = 3;

// tipo: 'temporario' (serviço ocupado), 'rede' (sem conexão) ou 'final' (não adianta repetir)
function erroIA(mensagem, tipo) {
    const e = new Error(mensagem.replace(/\.+$/, ''));
    e.tipo = tipo;
    return e;
}

// Chama a Edge Function "map-document" (a chave da IA fica guardada no servidor)
async function pedirMapeamento(texto) {
    const { data, error } = await sb.functions.invoke('map-document', { body: { text: texto } });
    if (!error) return (data && data.content) || '';

    if (error.name === 'FunctionsFetchError') {
        throw erroIA('Could not reach the AI service — check your internet connection', 'rede');
    }
    let status = 0;
    let msg = error.message || 'AI request failed';
    if (error.context && typeof error.context.json === 'function') {
        status = error.context.status;
        try {
            const corpo = await error.context.json();
            if (corpo && corpo.error) msg = corpo.error;
        } catch (e) { /* resposta sem JSON */ }
    }
    if (status === 401) throw erroIA('Your session has expired — please sign out and sign in again', 'final');
    if (status === 402) throw erroIA('The AI account has run out of credits — please tell the research team', 'final');
    if (status === 404) throw erroIA('The AI service is not set up on the server yet', 'final');
    if (error.name === 'FunctionsRelayError' || ERROS_TEMPORARIOS.includes(status)) throw erroIA(msg, 'temporario');
    throw erroIA(msg, 'final');
}

async function chamarIA(texto) {
    let ultimoErro = null;
    let servicoOcupado = false;

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
        try {
            return await pedirMapeamento(texto);
        } catch (e) {
            ultimoErro = e;
            if (e.tipo !== 'temporario' && e.tipo !== 'rede') throw e; // ex.: sem créditos
            if (e.tipo === 'temporario') servicoOcupado = true;
        }

        if (tentativa < TENTATIVAS) {
            const espera = 2000 * 2 ** (tentativa - 1);
            loadingText.textContent = `The AI is busy right now — retry ${tentativa + 1} of ${TENTATIVAS} in ${espera / 1000}s…`;
            await new Promise(r => setTimeout(r, espera));
            loadingText.textContent = LOADING_TEXT_PADRAO;
        }
    }

    if (servicoOcupado) {
        throw new Error('the AI service is overloaded right now (this usually passes in a few minutes)');
    }
    throw ultimoErro || new Error('API request failed');
}

// ==========================================
// 2. LÓGICA DE JOGO E INTERFACE (GAME LOOP)
// ==========================================
function iniciarJogo(isResume) {
    mostrarTela(gameScreen);

    if (!isResume) {
        faseAtualIndex = 0;
    }
    mostrarDicaDeLeitura();
    renderizarQuestMap();
    carregarFase();
}

function progressoDaFase() {
    return paragrafosDinamicos.length
        ? Math.round((paragrafoAtualIndex / paragrafosDinamicos.length) * 100)
        : 0;
}

function renderizarQuestMap() {
    QuestMap.render(questTrail, questTrailWrap, trilhaDeFases, faseAtualIndex, progressoDaFase());

    const pct = trilhaDeFases.length > 0
        ? Math.round((faseAtualIndex / trilhaDeFases.length) * 100)
        : 0;
    questProgressFill.style.width = `${pct}%`;
    expeditionProgress.textContent = `Expedition progress: ${pct}%`;
}

// Redesenha o mapa quando a janela muda de tamanho
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (gameScreen.classList.contains('screen-active') && faseAtualIndex < trilhaDeFases.length) {
            renderizarQuestMap();
        }
    }, 150);
});

function carregarFase() {
    pararLeituraEmVoz();
    const fase = trilhaDeFases[faseAtualIndex];
    prepararNarracaoDaFase(fase.conteudo_leitura);
    phaseTitle.textContent = fase.titulo_fase;

    hintPanel.classList.add('hidden');
    hintList.innerHTML = '';
    (fase.dicas || []).forEach(dica => {
        const li = document.createElement('li');
        li.textContent = dica;
        hintList.appendChild(li);
    });
    btnHint.classList.toggle('hidden', !(fase.dicas && fase.dicas.length));

    dynamicTextContainer.innerHTML = '';

    const pedacos = fase.conteudo_leitura.match(/[^.!?]+[.!?]+/g) || [fase.conteudo_leitura];

    pedacos.forEach(pedaco => {
        if (pedaco.trim().length > 5) {
            const p = document.createElement('p');
            p.className = 'text-segment';
            p.textContent = pedaco.trim();
            dynamicTextContainer.appendChild(p);
        }
    });

    paragrafosDinamicos = document.querySelectorAll('#dynamic-text-container .text-segment');
    paragrafoAtualIndex = 0;
    atualizarFoco();
    renderizarQuestMap();
    saveSession();
}

// opcoes.pelaNarracao: o próprio narrador avançou (não precisa reiniciar a fala)
function atualizarFoco(opcoes = {}) {
    paragrafosDinamicos.forEach(p => p.classList.remove('focus-active'));

    if (paragrafosDinamicos[paragrafoAtualIndex]) {
        paragrafosDinamicos[paragrafoAtualIndex].classList.add('focus-active');
        paragrafosDinamicos[paragrafoAtualIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    QuestMap.setPhaseProgress(questTrail, progressoDaFase());
    btnPrev.classList.toggle('hidden', paragrafoAtualIndex === 0);

    if (paragrafoAtualIndex === paragrafosDinamicos.length - 1) {
        btnNext.classList.add('hidden');
        btnQuiz.classList.remove('hidden');
    } else {
        btnNext.classList.remove('hidden');
        btnQuiz.classList.add('hidden');
    }

    // Se a pessoa pulou de frase durante a leitura em voz alta, a voz acompanha
    if (narracaoAtiva && !opcoes.pelaNarracao) falarTrechoAtual();
}

btnNext.addEventListener('click', () => avancarLeitura(1));
btnPrev.addEventListener('click', () => avancarLeitura(-1));

// --- Navegar pela leitura sem precisar clicar em "Next" ---
// Mouse: rodinha para baixo/cima. Teclado: ↓ ↑ / espaço / Page Up/Down.
// Celular: toque no trecho destacado avança; toque em outro trecho vai até ele.
// Com o Modo Foco desligado, a rodinha volta a rolar a página normalmente.
const HINT_SEEN_KEY = 'deepdive_navigator_reading_hint_seen';
const readingHint = document.getElementById('reading-hint');
let avancosSemBotao = 0;

function avancarLeitura(direcao) {
    if (direcao > 0) {
        if (paragrafoAtualIndex < paragrafosDinamicos.length - 1) {
            paragrafoAtualIndex++;
            atualizarFoco();
        } else {
            chamarAtencaoParaQuiz();
        }
    } else if (paragrafoAtualIndex > 0) {
        paragrafoAtualIndex--;
        atualizarFoco();
    }
}

// No último trecho, em vez de abrir o quiz sozinho, destaca o botão
function chamarAtencaoParaQuiz() {
    btnQuiz.classList.remove('pulse');
    void btnQuiz.offsetWidth; // reinicia a animação
    btnQuiz.classList.add('pulse');
}

function leituraAtiva() {
    return gameScreen.classList.contains('screen-active')
        && paragrafosDinamicos.length > 0
        && !document.querySelector('.modal-visible')
        && soundPanel.classList.contains('hidden');
}

// Depois de algumas vezes usando rodinha/toque/teclado, a dica some para sempre
function registrarAvancoSemBotao() {
    avancosSemBotao++;
    if (avancosSemBotao >= 3 && !readingHint.classList.contains('hidden')) {
        readingHint.classList.add('hidden');
        try { localStorage.setItem(HINT_SEEN_KEY, '1'); } catch (e) { /* ignore */ }
    }
}

function mostrarDicaDeLeitura() {
    let jaViu = false;
    try { jaViu = localStorage.getItem(HINT_SEEN_KEY) === '1'; } catch (e) { /* ignore */ }
    const toque = window.matchMedia('(hover: none)').matches;
    readingHint.textContent = toque
        ? '👆 Tip: tap the highlighted text to move forward, or tap any other line to jump to it.'
        : '🖱️ Tip: scroll the mouse wheel (or press ↓ ↑) to move through the text.';
    readingHint.classList.toggle('hidden', jaViu);
}

// Rodinha do mouse / touchpad: um passo por movimento, ignorando a "inércia"
const RODA_LIMIAR = 40;        // quanto rolar para contar um passo
const RODA_PAUSA_MS = 180;     // eventos mais próximos que isso são o mesmo gesto
const RODA_INTERVALO_MS = 450; // rolando sem parar: no máximo um passo a cada 450ms
let rodaAcumulada = 0;
let ultimoEventoRoda = 0;
let ultimoPassoRoda = 0;
let rodaBloqueada = false;

window.addEventListener('wheel', (e) => {
    if (!leituraAtiva() || !focusModeOn || e.ctrlKey) return;
    e.preventDefault();

    const agora = Date.now();
    const mesmoGesto = agora - ultimoEventoRoda < RODA_PAUSA_MS;
    ultimoEventoRoda = agora;
    if (rodaBloqueada && mesmoGesto && agora - ultimoPassoRoda < RODA_INTERVALO_MS) return;
    if (!mesmoGesto) rodaAcumulada = 0;
    rodaBloqueada = false;

    rodaAcumulada += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // linhas → pixels
    if (Math.abs(rodaAcumulada) >= RODA_LIMIAR) {
        avancarLeitura(Math.sign(rodaAcumulada));
        registrarAvancoSemBotao();
        rodaAcumulada = 0;
        ultimoPassoRoda = agora;
        rodaBloqueada = true;
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (!leituraAtiva() || e.altKey || e.ctrlKey || e.metaKey) return;
    const alvo = e.target instanceof Element ? e.target : null;
    if (alvo && alvo.closest('input, textarea, select, button, [contenteditable]')) return;
    const frente = ['ArrowDown', 'PageDown', ' '].includes(e.key);
    const tras = ['ArrowUp', 'PageUp'].includes(e.key);
    if (!frente && !tras) return;
    e.preventDefault();
    avancarLeitura(frente ? 1 : -1);
    registrarAvancoSemBotao();
});

// Toque / clique no texto
dynamicTextContainer.addEventListener('click', (e) => {
    const trecho = e.target.closest('.text-segment');
    if (!trecho || !leituraAtiva()) return;
    if (String(window.getSelection())) return; // a pessoa está selecionando texto
    const indice = Array.prototype.indexOf.call(paragrafosDinamicos, trecho);
    if (indice === paragrafoAtualIndex) {
        avancarLeitura(1);
    } else {
        paragrafoAtualIndex = indice;
        atualizarFoco();
    }
    registrarAvancoSemBotao();
});

btnHint.addEventListener('click', () => {
    hintPanel.classList.toggle('hidden');
});

// ==========================================
// 3. ACESSIBILIDADE — fonte legível, leitura em voz alta, modo foco
// ==========================================
btnFontToggle.addEventListener('click', () => {
    readableFontOn = !readableFontOn;
    document.body.classList.toggle('readable-font', readableFontOn);
    btnFontToggle.classList.toggle('tool-btn-active', readableFontOn);
    btnFontToggle.setAttribute('aria-pressed', String(readableFontOn));
    localStorage.setItem(FONT_PREF_KEY, readableFontOn ? 'on' : 'off');
});

btnFocusMode.addEventListener('click', () => {
    focusModeOn = !focusModeOn;
    document.body.classList.toggle('focus-mode-off', !focusModeOn);
    btnFocusMode.classList.toggle('tool-btn-active', focusModeOn);
    btnFocusMode.setAttribute('aria-pressed', String(focusModeOn));
});

// Leitura em voz alta: ver voice.js
btnTts.addEventListener('click', () => (narracaoAtiva ? pararNarracao() : iniciarNarracao()));

function pararLeituraEmVoz() {
    pararNarracao();
}

// ==========================================
// 4. SISTEMA DO QUIZ E RECOMPENSAS
// ==========================================
btnQuiz.addEventListener('click', abrirQuiz);

function abrirQuiz() {
    pararLeituraEmVoz();
    const quiz = trilhaDeFases[faseAtualIndex].quiz;
    quizQuestion.textContent = quiz.pergunta;

    quizOptionsContainer.innerHTML = '';
    quizFeedback.classList.add('hidden');
    btnNextPhase.classList.add('hidden');
    failControls.classList.add('hidden');

    quiz.alternativas.forEach((alt, index) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        btn.dataset.sfx = 'none';
        btn.textContent = `${String.fromCharCode(65 + index)}) ${alt}`;
        btn.onclick = () => checarResposta(index, btn);
        quizOptionsContainer.appendChild(btn);
    });

    quizModal.classList.replace('modal-hidden', 'modal-visible');
}

function checarResposta(selectedIndex, btnClicado) {
    const quiz = trilhaDeFases[faseAtualIndex].quiz;
    const acertou = (selectedIndex === quiz.resposta_correta_index);

    document.querySelectorAll('.quiz-option-btn').forEach(b => b.disabled = true);
    quizFeedback.classList.remove('hidden');

    Sound.play(acertou ? 'correct' : 'wrong');

    if (acertou) {
        btnClicado.style.backgroundColor = '#4C6444';
        btnClicado.style.borderColor = '#3A4E34';
        btnClicado.style.color = '#EDE6D8';
        feedbackText.textContent = `🎯 Brilliant! You kept your focus and got it right! (+${XP_PER_QUIZ} XP · +${SHARDS_PER_QUIZ} 💎)`;
        feedbackText.style.color = '#4C6444';
        btnNextPhase.classList.remove('hidden');
    } else {
        btnClicado.style.backgroundColor = '#B5482D';
        btnClicado.style.borderColor = '#8C3620';
        btnClicado.style.color = '#EDE6D8';
        feedbackText.textContent = "Hmm, that's not the correct answer. What would you like to do?";
        feedbackText.style.color = '#B5482D';
        failControls.classList.remove('hidden');
    }
}

btnNextPhase.addEventListener('click', () => {
    concederRecompensa(XP_PER_QUIZ, SHARDS_PER_QUIZ);
    quizModal.classList.replace('modal-visible', 'modal-hidden');

    faseAtualIndex++;
    if (faseAtualIndex < trilhaDeFases.length) {
        carregarFase();
    } else {
        pararLeituraEmVoz();
        clearSession();
        trilhaDeFases = [];
        mostrarTelaUpload();
        setTimeout(() => Sound.play('complete'), 500);
        mostrarToast('🏆 Expedition complete! You reached the Final Summit.', 5000);
    }
});

btnTryAgain.addEventListener('click', () => {
    abrirQuiz();
});

btnReread.addEventListener('click', () => {
    quizModal.classList.replace('modal-visible', 'modal-hidden');
    paragrafoAtualIndex = 0;
    atualizarFoco();
});
