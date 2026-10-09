// ==========================================
// CONTA E PRIVACIDADE — aviso de privacidade (LGPD), exportar dados e excluir conta
// Carregado antes do script.js; usa currentUser, expedicaoSalva, sb, Sound,
// mostrarToast e limparTelaAoSair somente depois que a pessoa entra na conta.
// ==========================================

// Mude esta versão sempre que o texto do aviso de privacidade (index.html) mudar:
// ela fica gravada no perfil de quem aceitou.
const CONSENT_VERSION = '2026-10-09';

// E-mail da equipe para pedidos de correção de dados (aparece no aviso). Preencha antes do beta.
const PRIVACY_CONTACT = 'felipe.guirau3@hotmail.com';

const privacyModal = document.getElementById('privacy-modal');
const accountModal = document.getElementById('account-modal');
const btnAccount = document.getElementById('btn-account');
const btnAccountClose = document.getElementById('btn-account-close');
const btnPrivacyClose = document.getElementById('btn-privacy-close');
const btnExportData = document.getElementById('btn-export-data');
const btnDeleteAccount = document.getElementById('btn-delete-account');
const deleteConfirmInput = document.getElementById('delete-confirm-input');
const accountMsg = document.getElementById('account-msg');

document.getElementById('privacy-version').textContent = CONSENT_VERSION;
if (PRIVACY_CONTACT) {
    const wrap = document.getElementById('privacy-contact-wrap');
    wrap.textContent = ' at ';
    const link = document.createElement('a');
    link.href = `mailto:${PRIVACY_CONTACT}`;
    link.textContent = PRIVACY_CONTACT;
    wrap.appendChild(link);
}

// --- Abrir e fechar ---
let focoAntesDoAviso = null;

function abrirAviso() {
    focoAntesDoAviso = document.activeElement;
    privacyModal.classList.replace('modal-hidden', 'modal-visible');
    privacyModal.querySelector('.account-body').scrollTop = 0;
    btnPrivacyClose.focus();
}

function fecharAviso() {
    privacyModal.classList.replace('modal-visible', 'modal-hidden');
    if (focoAntesDoAviso && document.contains(focoAntesDoAviso)) focoAntesDoAviso.focus();
}

function abrirConta() {
    if (!currentUser) return;
    document.getElementById('account-email').textContent = currentUser.email || '';
    document.getElementById('account-username').textContent = currentUser.username;
    deleteConfirmInput.value = '';
    btnDeleteAccount.disabled = true;
    accountMsg.classList.add('hidden');
    accountModal.classList.replace('modal-hidden', 'modal-visible');
    btnAccountClose.focus();
}

function fecharConta() {
    accountModal.classList.replace('modal-visible', 'modal-hidden');
    btnAccount.focus();
}

document.querySelectorAll('[data-open-privacy]').forEach(el => el.addEventListener('click', abrirAviso));
btnPrivacyClose.addEventListener('click', fecharAviso);
btnAccount.addEventListener('click', abrirConta);
btnAccountClose.addEventListener('click', fecharConta);

// Clicar fora da caixa fecha
[privacyModal, accountModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        if (modal === privacyModal) fecharAviso(); else fecharConta();
    });
});

// Esc fecha primeiro o aviso (que fica por cima) e depois o painel da conta
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (privacyModal.classList.contains('modal-visible')) fecharAviso();
    else if (accountModal.classList.contains('modal-visible')) fecharConta();
});

// --- Aviso antes do primeiro envio de PDF ---
// Aparece sozinho depois do login e só some com "I understand". O aceite fica
// guardado neste navegador, por conta; mudar a versão faz o aviso voltar.
const uploadNoticeModal = document.getElementById('upload-notice-modal');
const btnUploadNoticeOk = document.getElementById('btn-upload-notice-ok');
const UPLOAD_NOTICE_VERSION = '1';

function chaveDoAvisoDeUpload() {
    return `ddn-upload-notice-${currentUser.id}`;
}

function verificarAvisoDeUpload() {
    let aceito = false;
    try {
        aceito = localStorage.getItem(chaveDoAvisoDeUpload()) === UPLOAD_NOTICE_VERSION;
    } catch { /* sem armazenamento: o aviso aparece a cada login */ }
    if (aceito) return;
    uploadNoticeModal.classList.replace('modal-hidden', 'modal-visible');
    btnUploadNoticeOk.focus();
}

btnUploadNoticeOk.addEventListener('click', () => {
    try {
        localStorage.setItem(chaveDoAvisoDeUpload(), UPLOAD_NOTICE_VERSION);
    } catch { /* ignora: o aviso volta no próximo login */ }
    uploadNoticeModal.classList.replace('modal-visible', 'modal-hidden');
    Sound.play('start');
});

// --- Baixar meus dados ---
btnExportData.addEventListener('click', async () => {
    if (!currentUser) return;
    btnExportData.disabled = true;
    try {
        // Garante que o que vai no arquivo é o que está salvo na nuvem
        await Promise.all([salvarPerfilNaNuvem(), salvarExpedicaoNaNuvem()]);
        const [{ data: perfil, error: erroPerfil }, { data: expedicao, error: erroExp }] = await Promise.all([
            sb.from('profiles').select('*').eq('id', currentUser.id).single(),
            sb.from('expeditions').select('*').eq('user_id', currentUser.id).maybeSingle()
        ]);
        if (erroPerfil || erroExp) throw (erroPerfil || erroExp);

        const arquivo = {
            exported_at: new Date().toISOString(),
            account: { id: currentUser.id, email: currentUser.email },
            profile: perfil,
            expedition: expedicao
        };
        const blob = new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deep-dive-navigator-${currentUser.username}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        mostrarToast('📥 Your data was downloaded.');
    } catch (e) {
        console.error('Export failed:', e);
        mostrarMensagem(accountMsg, "We couldn't prepare your data. Please try again in a moment.");
    } finally {
        btnExportData.disabled = false;
    }
});

// --- Excluir minha conta ---
deleteConfirmInput.addEventListener('input', () => {
    const confere = !!currentUser && deleteConfirmInput.value.trim().toLowerCase() === currentUser.username;
    btnDeleteAccount.disabled = !confere;
});

btnDeleteAccount.addEventListener('click', async () => {
    if (!currentUser || btnDeleteAccount.disabled) return;
    btnDeleteAccount.disabled = true;
    deleteConfirmInput.disabled = true;
    const textoOriginal = btnDeleteAccount.textContent;
    btnDeleteAccount.textContent = 'Deleting…';
    try {
        const { error } = await sb.rpc('delete_my_account');
        if (error) throw error;

        // A conta já não existe: encerra a sessão local e volta para o login
        accountModal.classList.replace('modal-visible', 'modal-hidden');
        const { error: erroSaida } = await sb.auth.signOut();
        if (erroSaida) limparTelaAoSair(); // sem o evento SIGNED_OUT, limpa a tela na mão
        mostrarToast('Your account and data were permanently deleted.', 5000);
    } catch (e) {
        console.error('Account deletion failed:', e);
        const faltaFuncao = e && (e.code === 'PGRST202' || /delete_my_account/.test(e.message || ''));
        mostrarMensagem(accountMsg, faltaFuncao
            ? 'Account deletion is not set up on the server yet. Please tell the team.'
            : traduzirErroDeAuth(e));
        btnDeleteAccount.textContent = textoOriginal;
        btnDeleteAccount.disabled = false;
        deleteConfirmInput.disabled = false;
    }
});
