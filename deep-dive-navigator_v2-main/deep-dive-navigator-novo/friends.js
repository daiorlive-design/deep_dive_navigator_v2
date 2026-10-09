// ==========================================
// AMIGOS — pedidos de amizade, lista de amigos e ranking semanal
// Usa as funções do banco em supabase/02_amigos.sql.
// Carregado antes do script.js; usa currentUser, getLevelInfo, mostrarToast,
// mostrarMensagem e desenharAvatar somente depois que a pessoa entra.
// ==========================================
const ATUALIZAR_AMIGOS_A_CADA_MS = 90 * 1000;

const btnFriends = document.getElementById('btn-friends');
const friendsBadge = document.getElementById('friends-badge');
const friendsModal = document.getElementById('friends-modal');
const btnFriendsClose = document.getElementById('btn-friends-close');
const addFriendForm = document.getElementById('add-friend-form');
const addFriendInput = document.getElementById('add-friend-input');
const addFriendMsg = document.getElementById('add-friend-msg');
const myUsername = document.getElementById('my-username');
const btnCopyUsername = document.getElementById('btn-copy-username');
const friendsList = document.getElementById('friends-list');
const friendsTabs = document.querySelectorAll('.friends-tab');
const requestsCount = document.getElementById('requests-count');

let amigos = [];              // resultado de my_friends()
let amigosAbaAtual = 'friends';
let amigosTimer = null;
let pedidosJaVistos = null;   // ids de pedidos recebidos já notificados
let confirmarRemocao = null;  // id da amizade aguardando o 2º clique

// --- XP da semana (ranking) ---
// A semana começa na segunda-feira (UTC), igual ao cálculo do banco.
function inicioDaSemana() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
}

function registrarXpDaSemana(xp) {
    const semana = inicioDaSemana();
    if (currentUser.weekStart !== semana) {
        currentUser.weekStart = semana;
        currentUser.weekXp = 0;
    }
    currentUser.weekXp += xp;
}

function meuXpDaSemana() {
    return currentUser.weekStart === inicioDaSemana() ? currentUser.weekXp : 0;
}

// --- Ciclo de vida (chamado ao entrar e sair da conta) ---
function iniciarAmigos() {
    pedidosJaVistos = null;
    atualizarAmigos();
    clearInterval(amigosTimer);
    amigosTimer = setInterval(atualizarAmigos, ATUALIZAR_AMIGOS_A_CADA_MS);
}

function pararAmigos() {
    clearInterval(amigosTimer);
    amigosTimer = null;
    amigos = [];
    pedidosJaVistos = null;
    friendsModal.classList.replace('modal-visible', 'modal-hidden');
    atualizarBadge();
}

async function atualizarAmigos() {
    if (!currentUser) return;
    const { data, error } = await sb.rpc('my_friends');
    if (error) {
        console.warn('Could not load friends:', error);
        return;
    }
    amigos = data || [];
    avisarPedidosNovos();
    atualizarBadge();
    if (friendsModal.classList.contains('modal-visible')) renderizarAmigos();
}

function avisarPedidosNovos() {
    const recebidos = amigos.filter(a => a.direction === 'incoming');
    const ids = new Set(recebidos.map(a => a.friendship_id));
    if (pedidosJaVistos) {
        const novo = recebidos.find(a => !pedidosJaVistos.has(a.friendship_id));
        if (novo) {
            Sound.play('success');
            mostrarToast(`📨 ${novo.display_name} (@${novo.username}) wants to be your friend!`, 4500);
        }
    }
    pedidosJaVistos = ids;
}

function atualizarBadge() {
    const n = amigos.filter(a => a.direction === 'incoming').length;
    friendsBadge.textContent = String(n);
    friendsBadge.classList.toggle('hidden', n === 0);
    requestsCount.textContent = String(n);
    requestsCount.classList.toggle('hidden', n === 0);
    btnFriends.title = n ? `Friends — ${n} pending request${n > 1 ? 's' : ''}` : 'Friends';
}

// --- Abrir / fechar ---
function abrirAmigos() {
    myUsername.textContent = `@${currentUser.username}`;
    addFriendMsg.classList.add('hidden');
    addFriendInput.value = '';
    // Se houver pedidos esperando, abre direto nessa aba
    if (amigos.some(a => a.direction === 'incoming')) amigosAbaAtual = 'requests';
    renderizarAmigos();
    friendsModal.classList.replace('modal-hidden', 'modal-visible');
    addFriendInput.focus();
    atualizarAmigos();
}

function fecharAmigos() {
    friendsModal.classList.replace('modal-visible', 'modal-hidden');
    btnFriends.focus();
}

btnFriends.addEventListener('click', abrirAmigos);
btnFriendsClose.addEventListener('click', fecharAmigos);
friendsModal.addEventListener('click', (e) => {
    if (e.target === friendsModal) fecharAmigos();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && friendsModal.classList.contains('modal-visible')) fecharAmigos();
});

friendsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        amigosAbaAtual = tab.dataset.tab;
        confirmarRemocao = null;
        renderizarAmigos();
    });
});

btnCopyUsername.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(currentUser.username);
        mostrarToast('📋 Username copied — share it with your friends!');
    } catch (e) {
        mostrarToast(`Your username is @${currentUser.username}`);
    }
});

// --- Enviar pedido ---
const RESPOSTAS_DO_PEDIDO = {
    sent:            [(u) => `Request sent to @${u}! They'll see it next time they open the app.`, 'success'],
    accepted:        [(u) => `🎉 You and @${u} are now friends!`, 'success'],
    already_friends: [(u) => `You're already friends with @${u}.`, 'error'],
    already_sent:    [(u) => `You already sent a request to @${u}.`, 'error'],
    not_found:       [() => 'No explorer found with that username.', 'error'],
    self:            [() => "That's you! Try a friend's username.", 'error'],
    not_signed_in:   [() => 'Your session has expired — please sign in again.', 'error']
};

addFriendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = addFriendInput.value.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return mostrarMensagem(addFriendMsg, 'Usernames have 3–20 letters, numbers or _.');
    }
    const btn = addFriendForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    const { data, error } = await sb.rpc('send_friend_request', { target_username: username });
    btn.disabled = false;
    if (error) return mostrarMensagem(addFriendMsg, "Couldn't send the request. Check your connection and try again.");

    const [texto, tipo] = RESPOSTAS_DO_PEDIDO[data] || [() => 'Something went wrong.', 'error'];
    mostrarMensagem(addFriendMsg, texto(username), tipo);
    if (tipo === 'success') {
        addFriendInput.value = '';
        amigosAbaAtual = data === 'accepted' ? 'friends' : 'requests';
        await atualizarAmigos();
        renderizarAmigos();
    }
});

// --- Ações nas listas ---
async function responderPedido(id, aceitar) {
    const { error } = await sb.rpc('respond_friend_request', { request_id: id, accept: aceitar });
    if (error) return mostrarToast("⚠️ Couldn't update the request — try again.");
    if (aceitar) {
        Sound.play('success');
        const quem = amigos.find(a => a.friendship_id === id);
        if (quem) mostrarToast(`🎉 You and ${quem.display_name} are now friends!`);
    }
    await atualizarAmigos();
    renderizarAmigos();
}

async function removerAmizade(id) {
    const { error } = await sb.rpc('remove_friendship', { friendship_id: id });
    if (error) return mostrarToast("⚠️ Couldn't update — try again.");
    confirmarRemocao = null;
    await atualizarAmigos();
    renderizarAmigos();
}

// --- Desenho das listas ---
function botao(texto, classe, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `friend-btn ${classe}`;
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    return b;
}

function linhaDePessoa({ avatarId, frameId, displayName, username, title, xp, destaque }) {
    const row = document.createElement('div');
    row.className = 'friend-row' + (destaque ? ' is-me' : '');

    const av = document.createElement('div');
    av.className = 'friend-avatar';
    desenharAvatar(av, avatarId, frameId);

    const info = document.createElement('div');
    info.className = 'friend-info';
    const nome = document.createElement('span');
    nome.className = 'friend-name';
    nome.textContent = destaque ? `${displayName} (you)` : displayName;
    const sub = document.createElement('span');
    sub.className = 'friend-sub';
    sub.textContent = `@${username} · ${title}`;
    info.append(nome, sub);

    const { level, xpIntoLevel, xpForNext } = getLevelInfo(xp);
    const nivel = document.createElement('div');
    nivel.className = 'friend-level';
    nivel.innerHTML = '<span class="friend-level-badge"></span><span class="friend-xp-track"><span class="friend-xp-fill"></span></span>';
    nivel.querySelector('.friend-level-badge').textContent = `Lvl ${level}`;
    nivel.querySelector('.friend-xp-fill').style.width = `${Math.round((xpIntoLevel / xpForNext) * 100)}%`;

    const acoes = document.createElement('div');
    acoes.className = 'friend-actions';

    row.append(av, info, nivel, acoes);
    return { row, acoes, nivel };
}

function pessoaDoBanco(a) {
    return {
        avatarId: a.avatar_id, frameId: a.frame_id, displayName: a.display_name,
        username: a.username, title: a.title, xp: a.xp
    };
}

function vazio(texto) {
    const p = document.createElement('p');
    p.className = 'friends-empty';
    p.textContent = texto;
    return p;
}

function tituloDeSecao(texto) {
    const h = document.createElement('h4');
    h.className = 'friends-section';
    h.textContent = texto;
    return h;
}

function renderizarAmigos() {
    friendsTabs.forEach(tab => {
        const ativa = tab.dataset.tab === amigosAbaAtual;
        tab.classList.toggle('shop-tab-active', ativa);
        tab.setAttribute('aria-selected', String(ativa));
    });
    friendsList.innerHTML = '';

    if (amigosAbaAtual === 'friends') renderizarListaDeAmigos();
    else if (amigosAbaAtual === 'requests') renderizarPedidos();
    else renderizarRanking();
}

function renderizarListaDeAmigos() {
    const lista = amigos.filter(a => a.direction === 'friend');
    if (!lista.length) {
        friendsList.appendChild(vazio(`No friends yet. Add someone above, or share your username @${currentUser.username} so they can add you.`));
        return;
    }
    lista.forEach(a => {
        const { row, acoes } = linhaDePessoa(pessoaDoBanco(a));
        const confirmando = confirmarRemocao === a.friendship_id;
        acoes.appendChild(botao(confirmando ? 'Remove?' : '✕', confirmando ? 'is-danger' : 'is-subtle', () => {
            if (confirmando) return removerAmizade(a.friendship_id);
            confirmarRemocao = a.friendship_id;
            renderizarAmigos();
        }));
        if (!confirmando) acoes.lastChild.title = 'Remove friend';
        friendsList.appendChild(row);
    });
}

function renderizarPedidos() {
    const recebidos = amigos.filter(a => a.direction === 'incoming');
    const enviados = amigos.filter(a => a.direction === 'outgoing');

    friendsList.appendChild(tituloDeSecao('Received'));
    if (!recebidos.length) friendsList.appendChild(vazio('No pending requests.'));
    recebidos.forEach(a => {
        const { row, acoes } = linhaDePessoa(pessoaDoBanco(a));
        acoes.append(
            botao('Accept', 'is-accept', () => responderPedido(a.friendship_id, true)),
            botao('Decline', 'is-subtle', () => responderPedido(a.friendship_id, false))
        );
        friendsList.appendChild(row);
    });

    friendsList.appendChild(tituloDeSecao('Sent'));
    if (!enviados.length) friendsList.appendChild(vazio('No requests waiting for an answer.'));
    enviados.forEach(a => {
        const { row, acoes } = linhaDePessoa(pessoaDoBanco(a));
        const pendente = document.createElement('span');
        pendente.className = 'friend-pending';
        pendente.textContent = 'Pending…';
        acoes.append(pendente, botao('Cancel', 'is-subtle', () => removerAmizade(a.friendship_id)));
        friendsList.appendChild(row);
    });
}

function renderizarRanking() {
    const eu = {
        avatarId: currentUser.avatarId, frameId: currentUser.frameId, displayName: currentUser.displayName,
        username: currentUser.username, title: currentUser.title, xp: currentUser.xp,
        weekXp: meuXpDaSemana(), destaque: true
    };
    const pessoas = amigos
        .filter(a => a.direction === 'friend')
        .map(a => ({ ...pessoaDoBanco(a), weekXp: a.week_xp }))
        .concat(eu)
        .sort((a, b) => b.weekXp - a.weekXp || b.xp - a.xp);

    const intro = document.createElement('p');
    intro.className = 'friends-intro';
    intro.textContent = 'XP earned since Monday. The ranking resets every week, so everyone gets a fresh start!';
    friendsList.appendChild(intro);

    const medalhas = ['🥇', '🥈', '🥉'];
    pessoas.forEach((p, i) => {
        const { row, nivel } = linhaDePessoa(p);
        const pos = document.createElement('span');
        const temMedalha = p.weekXp > 0 && i < 3;
        pos.className = 'rank-pos' + (temMedalha ? ' is-medal' : '');
        pos.textContent = temMedalha ? medalhas[i] : `#${i + 1}`;
        row.prepend(pos);

        const semanal = document.createElement('span');
        semanal.className = 'rank-xp';
        semanal.textContent = `${p.weekXp} XP`;
        nivel.replaceWith(semanal);
        friendsList.appendChild(row);
    });

    if (pessoas.length === 1) {
        friendsList.appendChild(vazio('Add friends to see how you compare!'));
    }
}
