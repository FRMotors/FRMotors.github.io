-- FR Motors | Homologação humana de movimentações do Itaú a partir de PDFs importados.
-- A aprovação é EXPLÍCITA por linha, com autoria e trilha imutável; importações não alteram o caixa.
-- Mantém a origem distinta do Excel histórico e permite recompor o saldo sem dupla contagem.

create table if not exists public.fin_itau_homologacoes (
 linha_id uuid primary key references public.fin_teste_import_linhas(id) on delete restrict,
 importacao_id uuid not null references public.fin_teste_importacoes(id) on delete restrict,
 movimento_id uuid not null unique references public.fin_movimentos(id) on delete restrict,
 data_movimento date not null,
 tipo text not null check (tipo in ('entrada','saida')),
 valor numeric(14,2) not null check (valor>0),
 observacao text not null check (length(btrim(observacao)) between 12 and 500),
 homologado_por uuid not null references auth.users(id),
 homologado_em timestamptz not null default now()
);
create index if not exists fin_itau_homologacoes_importacao_idx
 on public.fin_itau_homologacoes(importacao_id,data_movimento);

alter table public.fin_itau_homologacoes enable row level security;
revoke all on table public.fin_itau_homologacoes from public,anon,authenticated;
grant select on public.fin_itau_homologacoes to authenticated;
drop policy if exists fin_itau_homologacoes_consulta_financeiro
 on public.fin_itau_homologacoes;
create policy fin_itau_homologacoes_consulta_financeiro
 on public.fin_itau_homologacoes for select to authenticated
 using ((select public.fluxo_caixa_autorizado()));

create or replace function public.fin_itau_homologar_linhas(
 p_linhas uuid[],
 p_fechamento date,
 p_observacao text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid;
 v_cutoff date;
 v_count integer;
 v_id uuid;
 v_linha public.fin_teste_import_linhas%rowtype;
 v_importacao public.fin_teste_importacoes%rowtype;
 v_banco public.fin_teste_movimentos%rowtype;
 v_movimento uuid;
 v_total_in numeric(14,2):=0;
 v_total_out numeric(14,2):=0;
 v_nota text;
begin
 v_user:=auth.uid();
 if v_user is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Sua conta não está autorizada a homologar o Itaú.'
   using errcode='42501';
 end if;
 v_count:=coalesce(cardinality(p_linhas),0);
 v_nota:=btrim(coalesce(p_observacao,''));
 if v_count not between 1 and 250 or
    (select count(distinct x) from unnest(p_linhas) as x)<>v_count or
    exists(select 1 from unnest(p_linhas) x where x is null) or
    length(v_nota) not between 12 and 500 or p_fechamento is null then
  raise exception 'Escolha de 1 a 250 lançamentos distintos e descreva a conferência (12 a 500 caracteres).'
   using errcode='22023';
 end if;
 -- Uma homologação por vez em toda a carteira Itaú.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fr_itau_homologacao'));
 select max(l.data_evento) into v_cutoff
 from public.fin_teste_excel_linhas l
 where l.lote_id=(select b.id from public.fin_teste_excel_lotes b
  where b.status='conferido' order by b.concluido_em desc,b.id desc limit 1)
  and l.grupo in ('entradas_fluxo','saidas_fluxo');
 if v_cutoff is null or v_cutoff<>p_fechamento then
  raise exception 'Fechamento histórico alterado. Atualize o painel e revise os lançamentos.'
   using errcode='22023';
 end if;
 for v_id in select distinct x from unnest(p_linhas) as x order by x loop
  select * into v_linha from public.fin_teste_import_linhas
   where id=v_id for update;
  if not found then
   raise exception 'Uma linha do extrato não foi encontrada. Atualize a lista.'
    using errcode='P0002';
  end if;
  select * into v_importacao from public.fin_teste_importacoes
   where id=v_linha.importacao_id for share;
  if not found or v_importacao.tipo<>'banco'
    or pg_catalog.translate(lower(btrim(v_importacao.conta_nome)),
      'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')<>'itau' then
   raise exception 'A origem não é um extrato bancário do Itaú.'
    using errcode='23514';
  end if;
  if v_linha.data_lancamento<v_cutoff
     or v_linha.data_lancamento>(now() at time zone 'America/Sao_Paulo')::date
     or v_linha.natureza not in ('entrada','saida')
     or v_linha.valor<=0 or v_linha.valor<>round(v_linha.valor,2)
     or v_linha.movimento_id is null then
   raise exception 'Linha fora do fechamento, futura ou sem movimentação bancária confirmada (%).',v_id
    using errcode='23514';
  end if;
  select * into v_banco from public.fin_teste_movimentos
   where id=v_linha.movimento_id for share;
  if not found or v_banco.estado<>'confirmado' or
    v_banco.referencia_cliente is distinct from ('extrato:'||v_linha.fingerprint)
    or v_banco.data_movimento is distinct from v_linha.data_lancamento
    or v_banco.tipo is distinct from v_linha.natureza
    or v_banco.valor is distinct from v_linha.valor then
   raise exception 'Inconsistência entre a linha do PDF e a saída bancária importada (%).',v_id
    using errcode='23514';
  end if;
  if exists(select 1 from public.fin_itau_homologacoes h where h.linha_id=v_id)
   or exists(select 1 from public.fin_movimentos m
    where m.origem='extrato_itau_homologado'
     and m.referencia_origem='itau-extrato:'||v_linha.fingerprint) then
   raise exception 'Este lançamento já foi homologado. Atualize o painel.'
    using errcode='23505';
  end if;
  -- Se o Excel homologado já contém data/tipo/valor, o usuário precisa
  -- conferir a correspondência. Não homologamos lançamentos ambíguos.
  if exists(select 1 from public.fin_movimentos m
    where m.origem='fluxo_caixa_homologado' and m.estado='confirmado'
     and m.data_movimento=v_linha.data_lancamento
     and m.tipo=v_linha.natureza and m.valor=v_linha.valor) or
   exists(select 1 from public.fin_conciliacao_confirmacoes c
     where c.linha_id=v_id and c.situacao='conferido') then
   raise exception 'A linha coincide com um lançamento histórico. Confira a correspondência, não duplique o pagamento (%).',v_id
    using errcode='23505';
  end if;
  insert into public.fin_movimentos (
   data_movimento,tipo,descricao,categoria,meio_pagamento,
   valor,estado,origem,referencia_origem,dados_origem,criado_por
  ) values (
   v_linha.data_lancamento,v_linha.natureza,
   coalesce(nullif(btrim(v_linha.descricao_personalizada),''),v_linha.descricao),
   coalesce(nullif(btrim(v_linha.categoria_personalizada),''),v_banco.categoria),
   null,v_linha.valor,'confirmado','extrato_itau_homologado',
   'itau-extrato:'||v_linha.fingerprint,
   pg_catalog.jsonb_build_object('linha_importada_id',v_id,'importacao_id',v_importacao.id,
     'arquivo',v_importacao.arquivo_nome,'conta','ITAU','aprovado_manualmente',true),
   v_user
  ) returning id into v_movimento;
  insert into public.fin_itau_homologacoes (
   linha_id,importacao_id,movimento_id,data_movimento,tipo,valor,observacao,homologado_por
  ) values (
   v_id,v_importacao.id,v_movimento,v_linha.data_lancamento,
   v_linha.natureza,v_linha.valor,v_nota,v_user
  );
  if v_linha.natureza='entrada' then
   v_total_in:=v_total_in+v_linha.valor;
  else
   v_total_out:=v_total_out+v_linha.valor;
  end if;
 end loop;
 return jsonb_build_object('resultado','homologado','quantidade',v_count,
  'entradas',v_total_in,'saidas',v_total_out,
  'resultado_liquido',v_total_in-v_total_out,
  'fechamento_excel',v_cutoff,'origem','extrato_itau_homologado',
  'usuario',v_user);
end;
$function$;

revoke execute on function public.fin_itau_homologar_linhas(uuid[],date,text)
 from public,anon;
grant execute on function public.fin_itau_homologar_linhas(uuid[],date,text)
 to authenticated;

comment on table public.fin_itau_homologacoes is
 'Auditoria imutável da inclusão manual de linhas do PDF Itaú no caixa confirmado. Nunca substitui a linha original do Excel.';
