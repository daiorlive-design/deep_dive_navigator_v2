// ==========================================
// LOJA — catálogo de itens e tela de compra/equipar
// Carregado antes do script.js; usa currentUser, saveCurrentUser,
// renderizarHud, getLevelInfo e mostrarToast (definidos no script.js)
// somente quando a pessoa interage com a loja.
// ==========================================
const DEFAULT_TITLE = 'Novice Scholar';
const DEFAULT_FRAME = 'brass';

// Avatares iniciais (gratuitos, escolhidos no cadastro)
const AVATARS = [
    { id: 'owl',     emoji: '🦉', name: 'Owl' },
    { id: 'fox',     emoji: '🦊', name: 'Fox' },
    { id: 'octopus', emoji: '🐙', name: 'Octopus' },
    { id: 'turtle',  emoji: '🐢', name: 'Turtle' },
    { id: 'cat',     emoji: '🐱', name: 'Cat' },
    { id: 'penguin', emoji: '🐧', name: 'Penguin' }
];

const SHOP_ITEMS = {
    avatars: [
        ...AVATARS.map(a => ({ ...a, price: 0 })),
        { id: 'parrot',  emoji: '🦜', name: 'Parrot',   price: 40 },
        { id: 'ghost',   emoji: '👻', name: 'Ghost',    price: 50 },
        { id: 'wolf',    emoji: '🐺', name: 'Wolf',     price: 60 },
        { id: 'lion',    emoji: '🦁', name: 'Lion',     price: 60 },
        { id: 'robot',   emoji: '🤖', name: 'Robot',    price: 80 },
        { id: 'wizard',  emoji: '🧙', name: 'Wizard',   price: 90,  minLevel: 2 },
        { id: 'merfolk', emoji: '🧜', name: 'Merfolk',  price: 90,  minLevel: 2 },
        { id: 'dino',    emoji: '🦖', name: 'Dino',     price: 110, minLevel: 3 },
        { id: 'unicorn', emoji: '🦄', name: 'Unicorn',  price: 130, minLevel: 4 },
        { id: 'dragon',  emoji: '🐉', name: 'Dragon',   price: 160, minLevel: 5 }
    ],
    frames: [
        { id: 'brass',    name: 'Brass Ring',     price: 0 },
        { id: 'bronze',   name: 'Bronze',         price: 30 },
        { id: 'silver',   name: 'Silver',         price: 60 },
        { id: 'emerald',  name: 'Emerald',        price: 80 },
        { id: 'sapphire', name: 'Deep Sapphire',  price: 100, minLevel: 2 },
        { id: 'rose',     name: 'Rose Quartz',    price: 100, minLevel: 2 },
        { id: 'kraken',   name: 'Kraken Ink',     price: 140, minLevel: 3 },
        { id: 'gold',     name: 'Treasure Gold',  price: 180, minLevel: 4 },
        { id: 'rainbow',  name: 'Aurora',         price: 250, minLevel: 5 }
    ],
    titles: [
        { id: DEFAULT_TITLE,           name: DEFAULT_TITLE,           price: 0 },
        { id: 'Page Turner',           name: 'Page Turner',           price: 40 },
        { id: 'Focus Seeker',          name: 'Focus Seeker',          price: 60 },
        { id: 'Map Reader',            name: 'Map Reader',            price: 70 },
        { id: 'Lore Hunter',           name: 'Lore Hunter',           price: 90,  minLevel: 2 },
        { id: 'Deep Diver',            name: 'Deep Diver',            price: 120, minLevel: 3 },
        { id: 'Master Navigator',      name: 'Master Navigator',      price: 200, minLevel: 5 },
        { id: 'Legend of the Library', name: 'Legend of the Library', price: 300, minLevel: 8 }
    ]
};

// Onde cada categoria fica guardada no perfil do usuário
const SHOP_SLOTS = {
    avatars: { equippedKey: 'avatarId', label: 'Avatars' },
    frames:  { equippedKey: 'frameId',  label: 'Frames' },
    titles:  { equippedKey: 'title',    label: 'Titles' }
};

function getAvatar(id) {
    return SHOP_ITEMS.avatars.find(a => a.id === id) || AVATARS[0];
}

// Desenha avatar + moldura dentro de um elemento
function desenharAvatar(el, avatarId, frameId) {
    const frame = SHOP_ITEMS.frames.some(f => f.id === frameId) ? frameId : DEFAULT_FRAME;
    el.classList.add('avatar-framed');
    SHOP_ITEMS.frames.forEach(f => el.classList.remove(`frame-${f.id}`));
    el.classList.add(`frame-${frame}`);
    el.innerHTML = '';
    const core = document.createElement('span');
    core.className = 'avatar-core';
    core.textContent = getAvatar(avatarId).emoji;
    el.appendChild(core);
}

// Garante que perfis antigos tenham todos os campos da loja
function normalizarPerfil(user) {
    const owned = user.owned || {};
    const gratis = (lista) => SHOP_ITEMS[lista].filter(i => i.price === 0).map(i => i.id);
    ['avatars', 'frames', 'titles'].forEach(lista => {
        owned[lista] = Array.from(new Set([...(owned[lista] || []), ...gratis(lista)]));
    });
    user.owned = owned;
    user.frameId = user.frameId || DEFAULT_FRAME;
    user.title = user.title || DEFAULT_TITLE;
    return user;
}

// --- Tela da loja ---
const shopModal = document.getElementById('shop-modal');
const shopGrid = document.getElementById('shop-grid');
const shopBalance = document.getElementById('shop-balance');
const shopPreviewAvatar = document.getElementById('shop-preview-avatar');
const shopPreviewName = document.getElementById('shop-preview-name');
const shopPreviewTitle = document.getElementById('shop-preview-title');
const shopPreviewLevel = document.getElementById('shop-preview-level');
const shopTabs = document.querySelectorAll('#shop-modal .shop-tab');
const btnShop = document.getElementById('btn-shop');
const btnShopClose = document.getElementById('btn-shop-close');

let shopAbaAtual = 'avatars';
let confirmTimer = null;

function abrirLoja() {
    renderizarLoja();
    shopModal.classList.replace('modal-hidden', 'modal-visible');
    btnShopClose.focus();
}

function fecharLoja() {
    shopModal.classList.replace('modal-visible', 'modal-hidden');
    btnShop.focus();
}

btnShop.addEventListener('click', abrirLoja);
btnShopClose.addEventListener('click', fecharLoja);
shopModal.addEventListener('click', (e) => {
    if (e.target === shopModal) fecharLoja();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shopModal.classList.contains('modal-visible')) fecharLoja();
});

shopTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        shopAbaAtual = tab.dataset.tab;
        renderizarLoja();
        shopGrid.scrollTop = 0;
    });
});

function renderizarLoja() {
    const user = currentUser;
    const { level } = getLevelInfo(user.xp);

    shopBalance.textContent = `💎 ${user.shards}`;
    desenharAvatar(shopPreviewAvatar, user.avatarId, user.frameId);
    shopPreviewName.textContent = user.displayName;
    shopPreviewTitle.textContent = user.title;
    shopPreviewLevel.textContent = `Level ${level}`;

    shopTabs.forEach(tab => {
        const ativa = tab.dataset.tab === shopAbaAtual;
        tab.classList.toggle('shop-tab-active', ativa);
        tab.setAttribute('aria-selected', String(ativa));
    });

    shopGrid.innerHTML = '';
    const slot = SHOP_SLOTS[shopAbaAtual];
    SHOP_ITEMS[shopAbaAtual].forEach(item => {
        shopGrid.appendChild(criarCartao(item, slot, level));
    });
}

function criarCartao(item, slot, level) {
    const user = currentUser;
    const possui = user.owned[shopAbaAtual].includes(item.id);
    const equipado = user[slot.equippedKey] === item.id;
    const bloqueadoPorNivel = !possui && item.minLevel && level < item.minLevel;
    const faltam = item.price - user.shards;

    const card = document.createElement('div');
    card.className = 'shop-card';
    if (equipado) card.classList.add('is-equipped');
    if (bloqueadoPorNivel) card.classList.add('is-locked');

    // Pré-visualização
    const preview = document.createElement('div');
    preview.className = 'shop-card-preview';
    if (shopAbaAtual === 'avatars') {
        const av = document.createElement('div');
        av.className = 'shop-item-avatar';
        desenharAvatar(av, item.id, user.frameId);
        preview.appendChild(av);
    } else if (shopAbaAtual === 'frames') {
        const av = document.createElement('div');
        av.className = 'shop-item-avatar';
        desenharAvatar(av, user.avatarId, item.id);
        preview.appendChild(av);
    } else {
        const badge = document.createElement('span');
        badge.className = 'shop-title-badge';
        badge.textContent = item.name;
        preview.appendChild(badge);
    }

    const info = document.createElement('div');
    info.className = 'shop-card-info';
    if (shopAbaAtual !== 'titles') {
        const name = document.createElement('p');
        name.className = 'shop-card-name';
        name.textContent = item.name;
        info.appendChild(name);
    }
    const rarity = getRaridade(item.price);
    const tag = document.createElement('span');
    tag.className = `rarity rarity-${rarity.toLowerCase()}`;
    tag.textContent = rarity;
    info.appendChild(tag);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-card-btn';
    btn.dataset.sfx = 'none';

    if (equipado) {
        btn.textContent = 'Equipped ✓';
        btn.disabled = true;
        btn.classList.add('is-equipped');
    } else if (possui) {
        btn.textContent = 'Equip';
        btn.classList.add('is-owned');
        btn.addEventListener('click', () => equipar(item, slot));
    } else if (bloqueadoPorNivel) {
        btn.textContent = `🔒 Level ${item.minLevel}`;
        btn.disabled = true;
        btn.title = `Reach level ${item.minLevel} to unlock`;
    } else {
        btn.textContent = `💎 ${item.price}`;
        btn.classList.add('is-buy');
        if (faltam > 0) {
            btn.classList.add('is-short');
            btn.title = `You need ${faltam} more Focus Shards`;
        }
        btn.addEventListener('click', () => tentarComprar(item, slot, btn));
    }

    card.append(preview, info, btn);
    return card;
}

function getRaridade(preco) {
    if (preco === 0) return 'Starter';
    if (preco <= 60) return 'Common';
    if (preco <= 120) return 'Rare';
    if (preco <= 200) return 'Epic';
    return 'Legendary';
}

function tentarComprar(item, slot, btn) {
    const faltam = item.price - currentUser.shards;
    if (faltam > 0) {
        Sound.play('error');
        mostrarToast(`You need ${faltam} more 💎 — keep reading to earn them!`);
        return;
    }
    // Primeiro clique pede confirmação; o segundo compra
    if (!btn.classList.contains('is-confirm')) {
        Sound.play('click');
        clearTimeout(confirmTimer);
        shopGrid.querySelectorAll('.is-confirm').forEach(b => {
            b.classList.remove('is-confirm');
            b.textContent = b.dataset.label;
        });
        btn.dataset.label = btn.textContent;
        btn.textContent = 'Confirm?';
        btn.classList.add('is-confirm');
        confirmTimer = setTimeout(() => {
            btn.classList.remove('is-confirm');
            btn.textContent = btn.dataset.label;
        }, 3000);
        return;
    }

    clearTimeout(confirmTimer);
    currentUser.shards -= item.price;
    currentUser.owned[shopAbaAtual].push(item.id);
    currentUser[slot.equippedKey] = item.id;
    saveCurrentUser();
    renderizarHud();
    renderizarLoja();
    Sound.play('coins');
    setTimeout(() => Sound.play('success'), 180);
    mostrarToast(`✨ Unlocked: ${item.name}!`);
}

function equipar(item, slot) {
    currentUser[slot.equippedKey] = item.id;
    saveCurrentUser();
    renderizarHud();
    renderizarLoja();
    Sound.play('toggle');
}
