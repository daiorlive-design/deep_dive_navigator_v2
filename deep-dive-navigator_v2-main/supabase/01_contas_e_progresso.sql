-- ==========================================================
-- Deep Dive Navigator — Etapa 1: contas, perfil e progresso
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (o script é idempotente).
-- ==========================================================

-- ---------- PERFIS (um por conta) ----------
create table if not exists public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
    display_name text not null check (char_length(display_name) between 1 and 24),
    avatar_id    text not null default 'owl',
    frame_id     text not null default 'brass',
    title        text not null default 'Novice Scholar',
    xp           integer not null default 0 check (xp >= 0),
    shards       integer not null default 0 check (shards >= 0),
    owned        jsonb not null default '{}'::jsonb,   -- itens comprados na loja
    sound        jsonb not null default '{}'::jsonb,   -- preferências de música/sons
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Quem está logado pode ver perfis (necessário para buscar amigos depois).
-- O e-mail NÃO fica nesta tabela, então não é exposto.
drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users"
    on public.profiles for select to authenticated
    using (true);

-- Cada pessoa só altera o próprio perfil
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- O nome de usuário não pode ser trocado pelo app (só estas colunas são editáveis)
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_id, frame_id, title, xp, shards, owned, sound)
    on public.profiles to authenticated;

-- ---------- EXPEDIÇÃO EM ANDAMENTO (uma por conta) ----------
create table if not exists public.expeditions (
    user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    phases        jsonb not null,
    current_index integer not null default 0 check (current_index >= 0),
    updated_at    timestamptz not null default now()
);

alter table public.expeditions enable row level security;

drop policy if exists "Users manage their own expedition" on public.expeditions;
create policy "Users manage their own expedition"
    on public.expeditions for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

revoke all on public.expeditions from anon;
grant select, insert, update, delete on public.expeditions to authenticated;

-- ---------- updated_at automático ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
    for each row execute function public.touch_updated_at();

drop trigger if exists expeditions_touch on public.expeditions;
create trigger expeditions_touch before update on public.expeditions
    for each row execute function public.touch_updated_at();

-- ---------- Cria o perfil automaticamente no cadastro ----------
-- O app envia username, display_name e avatar_id junto com o cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, username, display_name, avatar_id)
    values (
        new.id,
        lower(trim(new.raw_user_meta_data ->> 'username')),
        left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Explorer'), 24),
        coalesce(nullif(new.raw_user_meta_data ->> 'avatar_id', ''), 'owl')
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------- Verifica se um nome de usuário está livre (usado no cadastro) ----------
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1 from public.profiles where username = lower(trim(name))
    );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
