-- FR Motors · V4.4.18 · Histórico e auditoria
-- Execute uma única vez no Supabase: SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.ficha_auditoria (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas(id) on delete cascade,
  user_id uuid,
  user_email text not null default 'USUÁRIO',
  acao text not null check (acao in ('CRIACAO','ALTERACAO')),
  alteracoes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ficha_auditoria_ficha_created_idx
  on public.ficha_auditoria (ficha_id, created_at desc);

alter table public.ficha_auditoria enable row level security;

drop policy if exists "ficha_auditoria_select_authenticated" on public.ficha_auditoria;
create policy "ficha_auditoria_select_authenticated"
on public.ficha_auditoria
for select
to authenticated
using (auth.uid() is not null);

revoke insert, update, delete on public.ficha_auditoria from anon, authenticated;
grant select on public.ficha_auditoria to authenticated;

create or replace function public.log_ficha_audit(
  p_ficha_id uuid,
  p_acao text,
  p_alteracoes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_acao not in ('CRIACAO','ALTERACAO') then
    raise exception 'Ação de auditoria inválida';
  end if;

  if not exists (select 1 from public.fichas where id = p_ficha_id) then
    raise exception 'O.S. não encontrada';
  end if;

  v_email := coalesce(auth.jwt() ->> 'email', 'USUÁRIO');

  insert into public.ficha_auditoria (
    ficha_id, user_id, user_email, acao, alteracoes
  )
  values (
    p_ficha_id,
    auth.uid(),
    v_email,
    p_acao,
    coalesce(p_alteracoes, '[]'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_ficha_audit(uuid,text,jsonb) from public, anon;
grant execute on function public.log_ficha_audit(uuid,text,jsonb) to authenticated;
