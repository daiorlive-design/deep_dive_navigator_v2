-- ==========================================================
-- Deep Dive Navigator — Etapa 4: consentimento (LGPD) e exclusão de conta
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Requer as etapas 1 e 2. Pode rodar de novo sem problema.
-- ==========================================================

-- ---------- Registro do consentimento ----------
-- Guarda quando a pessoa aceitou o aviso de privacidade e qual versão do texto.
alter table public.profiles add column if not exists consent_at timestamptz;
alter table public.profiles add column if not exists consent_version text;

-- O cadastro agora envia consent_version junto (ver account.js / script.js).
-- Mesma função da etapa 1, só com os dois campos novos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    versao text := nullif(trim(new.raw_user_meta_data ->> 'consent_version'), '');
begin
    insert into public.profiles (id, username, display_name, avatar_id, consent_version, consent_at)
    values (
        new.id,
        lower(trim(new.raw_user_meta_data ->> 'username')),
        left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Explorer'), 24),
        coalesce(nullif(new.raw_user_meta_data ->> 'avatar_id', ''), 'owl'),
        versao,
        case when versao is not null then now() end
    );
    return new;
end;
$$;

-- ---------- Excluir a própria conta ----------
-- Apaga o usuário em auth.users; perfil, expedição e amizades saem junto
-- (todas as tabelas têm "on delete cascade"). Só funciona para quem está logado
-- e só apaga a conta de quem chamou.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    eu uuid := auth.uid();
begin
    if eu is null then
        raise exception 'not_signed_in';
    end if;
    delete from auth.users where id = eu;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
