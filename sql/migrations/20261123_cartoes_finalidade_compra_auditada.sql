-- Classificação explícita de finalidade das compras, independente da categoria e do caixa.
-- Ambas as origens (planilha homologada e faturas PDF) permanecem imutáveis.
create table if not exists public.fin_cartoes_finalidades (
 origem text not null check (origem in ('planilha','importado')),
 lancamento_id uuid not null,
 finalidade text not null check (finalidade in ('oficina','outras','a_classificar')),
 atualizado_por uuid not null references auth.users(id),
 atualizado_em timestamptz not null default now(),
 primary key (origem,lancamento_id)
);
create table if not exists public.fin_cartoes_finalidades_eventos (
 id bigint generated always as identity primary key,
 origem text not null check (origem in ('planilha','importado')),
 lancamento_id uuid not null,
 finalidade_anterior text not null,
 finalidade_nova text not null,
 alterado_por uuid not null references auth.users(id),
 alterado_em timestamptz not null default now()
);
create index if not exists fin_cartoes_finalidades_eventos_origem_idx
 on public.fin_cartoes_finalidades_eventos(origem,lancamento_id,alterado_em desc);
alter table public.fin_cartoes_finalidades enable row level security;
alter table public.fin_cartoes_finalidades_eventos enable row level security;
revoke all on public.fin_cartoes_finalidades from public,anon,authenticated;
revoke all on public.fin_cartoes_finalidades_eventos from public,anon,authenticated;
grant select on public.fin_cartoes_finalidades to authenticated;
grant select on public.fin_cartoes_finalidades_eventos to authenticated;
drop policy if exists fin_cartoes_finalidades_ler on public.fin_cartoes_finalidades;
drop policy if exists fin_cartoes_finalidades_eventos_ler on public.fin_cartoes_finalidades_eventos;
create policy fin_cartoes_finalidades_ler
 on public.fin_cartoes_finalidades for select to authenticated
 using ((select public.fluxo_caixa_autorizado()));
create policy fin_cartoes_finalidades_eventos_ler
 on public.fin_cartoes_finalidades_eventos for select to authenticated
 using ((select public.fluxo_caixa_autorizado()));

-- Uma só chamada atômica: salva categoria (RPC já auditada) e finalidade (nova auditoria).
-- A finalidade não é inferida de fornecedores, descrição, categoria ou do mês.
create or replace function public.fin_cartao_classificacao_salvar(
 p_origem text, p_lancamento_id uuid, p_categoria text, p_categoria_esperada text,
 p_finalidade text, p_finalidade_esperada text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid;
 v_anterior text;
 v_categoria_resultado jsonb;
 v_finalidade_alterada boolean;
begin
 v_user:=auth.uid();
 if v_user is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Acesso financeiro não autorizado' using errcode='42501';
 end if;
 if p_origem is null or p_origem not in ('planilha','importado') or p_lancamento_id is null
    or p_finalidade is null or p_finalidade not in ('oficina','outras','a_classificar')
    or p_finalidade_esperada is null or p_finalidade_esperada not in ('oficina','outras','a_classificar') then
  raise exception 'Origem ou finalidade inválida' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fr_card_cat:'||p_lancamento_id::text));
 select f.finalidade into v_anterior from public.fin_cartoes_finalidades f
  where f.origem=p_origem and f.lancamento_id=p_lancamento_id for update;
 v_anterior:=coalesce(v_anterior,'a_classificar');
 if v_anterior is distinct from p_finalidade_esperada then
  raise exception 'A finalidade foi alterada por outra pessoa. Atualize os dados antes de salvar.'
   using errcode='40001';
 end if;
 -- Valida a compra de origem e audita qualquer atualização da categoria.
 v_categoria_resultado:=public.fin_cartao_categoria_definir(
  p_origem,p_lancamento_id,p_categoria,p_categoria_esperada);
 v_finalidade_alterada:=v_anterior is distinct from p_finalidade;
 if v_finalidade_alterada then
  insert into public.fin_cartoes_finalidades(origem,lancamento_id,finalidade,atualizado_por)
   values(p_origem,p_lancamento_id,p_finalidade,v_user)
   on conflict(origem,lancamento_id) do update set
    finalidade=excluded.finalidade,atualizado_por=excluded.atualizado_por,
    atualizado_em=now();
  insert into public.fin_cartoes_finalidades_eventos(
   origem,lancamento_id,finalidade_anterior,finalidade_nova,alterado_por)
   values(p_origem,p_lancamento_id,v_anterior,p_finalidade,v_user);
 end if;
 return jsonb_build_object(
  'origem',p_origem,'lancamento_id',p_lancamento_id,
  'categoria_nova',v_categoria_resultado->>'categoria_nova',
  'finalidade_nova',p_finalidade,
  'categoria_alterada',(v_categoria_resultado->>'alterada')::boolean,
  'finalidade_alterada',v_finalidade_alterada,
  'alterada',(v_categoria_resultado->>'alterada')::boolean or v_finalidade_alterada);
end;
$function$;

revoke execute on function public.fin_cartao_classificacao_salvar(text,uuid,text,text,text,text) from public,anon;
grant execute on function public.fin_cartao_classificacao_salvar(text,uuid,text,text,text,text) to authenticated;
comment on function public.fin_cartao_classificacao_salvar(text,uuid,text,text,text,text) is
 'Atualiza categoria e finalidade explicitamente, em transação auditada, sem movimentar caixa.';
