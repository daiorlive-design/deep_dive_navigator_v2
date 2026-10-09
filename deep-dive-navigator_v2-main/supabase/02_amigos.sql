-- ==========================================================
-- Deep Dive Navigator — Etapa 3: amigos e ranking semanal
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Requer a etapa 1 (01_contas_e_progresso.sql). Pode rodar de novo sem problema.
-- ==========================================================

-- ---------- XP da semana (para o ranking) ----------
alter table public.profiles add column if not exists week_xp integer not null default 0 check (week_xp >= 0);
alter table public.profiles add column if not exists week_start date;
grant update (week_xp, week_start) on public.profiles to authenticated;

-- ---------- AMIZADES ----------
-- Uma linha por par de pessoas: 'pending' (pedido enviado) ou 'accepted' (amigos)
create table if not exists public.friendships (
    id           bigint generated always as identity primary key,
    requester_id uuid not null references public.profiles (id) on delete cascade,
    addressee_id uuid not null references public.profiles (id) on delete cascade,
    status       text not null default 'pending' check (status in ('pending', 'accepted')),
    created_at   timestamptz not null default now(),
    responded_at timestamptz,
    check (requester_id <> addressee_id)
);

-- Impede pedidos duplicados nos dois sentidos (A→B e B→A)
create unique index if not exists friendships_pair
    on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- Sem acesso direto à tabela: tudo passa pelas funções abaixo, que conferem quem está logado
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- ---------- Enviar pedido de amizade pelo nome de usuário ----------
-- Respostas: 'sent', 'accepted' (a outra pessoa já tinha pedido), 'already_friends',
--            'already_sent', 'not_found', 'self', 'not_signed_in'
create or replace function public.send_friend_request(target_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    eu uuid := auth.uid();
    alvo uuid;
    existente public.friendships;
begin
    if eu is null then return 'not_signed_in'; end if;

    select id into alvo from public.profiles where username = lower(trim(target_username));
    if alvo is null then return 'not_found'; end if;
    if alvo = eu then return 'self'; end if;

    select * into existente from public.friendships
     where (requester_id = eu and addressee_id = alvo)
        or (requester_id = alvo and addressee_id = eu);

    if found then
        if existente.status = 'accepted' then return 'already_friends'; end if;
        if existente.requester_id = eu then return 'already_sent'; end if;
        -- A outra pessoa já tinha mandado pedido: aceitar direto
        update public.friendships set status = 'accepted', responded_at = now() where id = existente.id;
        return 'accepted';
    end if;

    insert into public.friendships (requester_id, addressee_id) values (eu, alvo);
    return 'sent';
end;
$$;

-- ---------- Aceitar ou recusar um pedido recebido ----------
create or replace function public.respond_friend_request(request_id bigint, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if accept then
        update public.friendships
           set status = 'accepted', responded_at = now()
         where id = request_id and addressee_id = auth.uid() and status = 'pending';
    else
        delete from public.friendships
         where id = request_id and addressee_id = auth.uid() and status = 'pending';
    end if;
end;
$$;

-- ---------- Desfazer amizade ou cancelar pedido enviado ----------
create or replace function public.remove_friendship(friendship_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.friendships
     where id = friendship_id
       and auth.uid() in (requester_id, addressee_id);
$$;

-- ---------- Minha lista: amigos, pedidos recebidos e enviados ----------
-- direction: 'friend', 'incoming' (recebi) ou 'outgoing' (enviei)
-- week_xp só conta se for desta semana (a semana começa na segunda-feira, UTC)
create or replace function public.my_friends()
returns table (
    friendship_id bigint,
    direction     text,
    user_id       uuid,
    username      text,
    display_name  text,
    avatar_id     text,
    frame_id      text,
    title         text,
    xp            integer,
    week_xp       integer
)
language sql
stable
security definer
set search_path = ''
as $$
    select f.id,
           case when f.status = 'accepted' then 'friend'
                when f.requester_id = auth.uid() then 'outgoing'
                else 'incoming' end,
           p.id, p.username, p.display_name, p.avatar_id, p.frame_id, p.title, p.xp,
           case when p.week_start = date_trunc('week', now())::date then p.week_xp else 0 end
      from public.friendships f
      join public.profiles p
        on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
     where auth.uid() in (f.requester_id, f.addressee_id)
     order by lower(p.display_name);
$$;

-- ---------- Permissões das funções: só para quem está logado ----------
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(bigint, boolean) from public, anon;
revoke all on function public.remove_friendship(bigint) from public, anon;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(bigint, boolean) to authenticated;
grant execute on function public.remove_friendship(bigint) to authenticated;
grant execute on function public.my_friends() to authenticated;
