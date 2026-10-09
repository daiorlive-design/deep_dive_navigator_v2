# Supabase — configuração do Deep Dive Navigator

Esta pasta **não** vai para o Netlify. Ela guarda o que roda no Supabase.

| Arquivo | O que é |
|---|---|
| `01_contas_e_progresso.sql` | Tabelas `profiles` e `expeditions`, regras de segurança (RLS) e criação automática do perfil no cadastro |
| `02_amigos.sql` | Amizades (pedidos, aceite, remoção), lista de amigos e XP da semana para o ranking |
| `functions/map-document/index.ts` | Edge Function que chama a IA (a chave fica só no servidor) |
| `functions/speak/index.ts` | Edge Function da leitura em voz alta (vozes neurais do Google / Gemini TTS) |

> **Ordem:** sempre rode o SQL novo **antes** de publicar a versão nova do site no Netlify.

## Passo a passo (uma vez só)

1. **Banco:** SQL Editor → New query → colar `01_contas_e_progresso.sql` → **Run**.
   Depois, numa nova query, colar `02_amigos.sql` → **Run**.
2. **Links dos e-mails:** Authentication → URL Configuration
   - Site URL: `https://deep-dive-navigator.netlify.app`
   - Redirect URLs: `https://deep-dive-navigator.netlify.app/**` e `http://localhost:5617/**`
3. **Chave da IA:** Edge Functions → Secrets → adicionar **uma** destas:
   - `OPENROUTER_API_KEY` (preferida — se existir, é a que a função usa)
   - `GEMINI_API_KEY` (Gemini direto do Google — usada só se não houver a do OpenRouter)

   Trocar de uma para outra é só adicionar/remover o segredo; não precisa publicar a função de novo.
4. **Função da IA:** Edge Functions → Deploy a new function → Via Editor
   - Nome: `map-document`
   - Colar o conteúdo de `functions/map-document/index.ts` → Deploy
   - Deixar **Verify JWT** ligado (só quem está logado consegue usar)

5. **Função da voz:** Edge Functions → Deploy a new function → Via Editor
   - Nome: `speak`
   - Colar o conteúdo de `functions/speak/index.ts` → Deploy
   - Deixar **Verify JWT** ligado
   - Usa o segredo `GEMINI_API_KEY` — **mantenha-o** mesmo depois de usar o OpenRouter para o texto.
   - Se a função falhar ou demorar, o app usa a voz do próprio navegador (no idioma do texto).

## Para trocar o modelo de IA

Editar as listas `OPENROUTER_MODELS` / `GEMINI_MODELS` no topo de `functions/map-document/index.ts` e fazer o deploy de novo
pelo editor do Supabase. Modelos disponíveis: https://openrouter.ai/models

## Observações

- O serviço de e-mail padrão do Supabase envia poucos e-mails por hora: serve para testes.
  Antes de abrir o beta, configurar um SMTP próprio (Authentication → Emails → SMTP Settings).
- A chave pública (`sb_publishable_...`) fica no site de propósito; a segurança vem das regras RLS.
