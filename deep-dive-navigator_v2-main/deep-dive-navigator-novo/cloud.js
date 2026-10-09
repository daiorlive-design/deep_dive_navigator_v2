// ==========================================
// NUVEM — Supabase: contas, perfil e expedição salva
// Carregado antes do script.js; usa currentUser e mostrarToast (do script.js)
// somente depois que a pessoa entra na conta.
// ==========================================
const SUPABASE_URL = 'https://ddbfrfdimjavirejcfhq.supabase.co';
// Chave pública: é feita para ficar no site. Quem protege os dados são as
// regras de segurança (RLS) do banco — ver a pasta supabase/ do projeto.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8EAJ5dGG1MSnWqpPsyivtg_7Gob9Of-';

// flowType 'implicit': os links de e-mail funcionam mesmo se abertos em outro
// aparelho/navegador (ex.: cadastro no PC, confirmação pelo celular)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'implicit' }
});

// Endereço para onde os links de e-mail (confirmação, nova senha) voltam
const URL_DO_APP = location.origin + location.pathname;

// --- Conversão entre o formato do banco (snake_case) e o do app (camelCase) ---
function perfilDoBanco(row, email) {
    return {
        id: row.id,
        email,
        username: row.username,
        displayName: row.display_name,
        avatarId: row.avatar_id,
        frameId: row.frame_id,
        title: row.title,
        xp: row.xp,
        shards: row.shards,
        weekXp: row.week_xp || 0,
        weekStart: row.week_start || null,
        owned: row.owned || {},
        sound: row.sound || {}
    };
}

function perfilParaBanco(u) {
    return {
        display_name: u.displayName,
        avatar_id: u.avatarId,
        frame_id: u.frameId,
        title: u.title,
        xp: u.xp,
        shards: u.shards,
        week_xp: u.weekXp,
        week_start: u.weekStart,
        owned: u.owned,
        sound: u.sound
    };
}

async function carregarPerfil(authUser) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
    if (error) throw error;
    return perfilDoBanco(data, authUser.email);
}

// --- Fila de gravação ---
// Nunca envia duas gravações ao mesmo tempo e garante que o estado mais
// recente sempre chega ao banco (cliques rápidos viram um envio extra no fim).
// Devolve uma promessa que só termina quando tudo foi gravado.
function criarFilaDeGravacao(enviar) {
    let promessaAtual = null;
    let pendente = false;
    return function gravar() {
        if (promessaAtual) {
            pendente = true;
            return promessaAtual;
        }
        promessaAtual = (async () => {
            try {
                do {
                    pendente = false;
                    await enviar();
                } while (pendente);
            } finally {
                promessaAtual = null;
            }
        })();
        return promessaAtual;
    };
}

let ultimoAvisoDeFalha = 0;
function avisarFalhaDeSincronizacao(error) {
    console.warn('Cloud sync failed:', error);
    if (Date.now() - ultimoAvisoDeFalha > 10000) {
        ultimoAvisoDeFalha = Date.now();
        mostrarToast("⚠️ Couldn't save to the cloud — check your connection.", 4500);
    }
}

const salvarPerfilNaNuvem = criarFilaDeGravacao(async () => {
    if (!currentUser) return;
    const dados = perfilParaBanco(currentUser);
    let { error } = await sb.from('profiles').update(dados).eq('id', currentUser.id);
    // Banco ainda sem as colunas do ranking (02_amigos.sql não rodou): grava o resto
    if (error && error.code === 'PGRST204' && /week_/.test(error.message)) {
        console.warn('Weekly ranking columns missing — run supabase/02_amigos.sql');
        delete dados.week_xp;
        delete dados.week_start;
        ({ error } = await sb.from('profiles').update(dados).eq('id', currentUser.id));
    }
    if (error) avisarFalhaDeSincronizacao(error);
});

// --- Expedição em andamento ---
// Cópia local da expedição salva: { trilhaDeFases, faseAtualIndex } ou null
let expedicaoSalva = null;

async function carregarExpedicao() {
    const { data, error } = await sb
        .from('expeditions')
        .select('phases, current_index')
        .eq('user_id', currentUser.id)
        .maybeSingle();
    if (error) {
        avisarFalhaDeSincronizacao(error);
        expedicaoSalva = null;
        return;
    }
    expedicaoSalva = data ? { trilhaDeFases: data.phases, faseAtualIndex: data.current_index } : null;
}

const salvarExpedicaoNaNuvem = criarFilaDeGravacao(async () => {
    if (!currentUser) return;
    const { error } = expedicaoSalva
        ? await sb.from('expeditions').upsert({
            user_id: currentUser.id,
            phases: expedicaoSalva.trilhaDeFases,
            current_index: expedicaoSalva.faseAtualIndex
        })
        : await sb.from('expeditions').delete().eq('user_id', currentUser.id);
    if (error) avisarFalhaDeSincronizacao(error);
});

// --- Mensagens de erro do Supabase Auth em linguagem simples ---
function traduzirErroDeAuth(error) {
    const msg = (error && error.message) || '';
    if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
    if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox (and spam folder).';
    if (/already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
    if (/rate limit|too many/i.test(msg)) return 'Too many attempts right now. Please wait a little and try again.';
    if (/password should be|weak password/i.test(msg)) return 'Please choose a stronger password (at least 8 characters).';
    if (/valid email|invalid email|unable to validate email/i.test(msg)) return 'Please enter a valid email address.';
    if (/failed to fetch|network/i.test(msg)) return 'Could not reach the server — check your internet connection.';
    if (/database error saving new user/i.test(msg)) return 'That username was just taken — please pick another one.';
    return msg || 'Something went wrong. Please try again.';
}
