-- FR Motors | Classificação individual de compras de cartão com origem preservada.
-- Documentos históricos são imutáveis; classificações são uma camada independente.
create table if not exists public.fin_cartoes_categorias_documentais (
 documento_id uuid primary key references public.fin_documentos_despesas(id) on delete restrict,
 categoria text not null check(length(btrim(categoria)) between 2 and 100),
 atualizado_por uuid not null references auth.users(id),
 atualizado_em timestamptz not null default now()
);
create table if not exists public.fin_cartoes_categorias_eventos (
 id bigint generated always as identity primary key,
 documento_id uuid not null references public.fin_documentos_despesas(id) on delete restrict,
 categoria_anterior text,
 categoria_nova text not null,
 alterado_por uuid not null references auth.users(id),
 alterado_em timestamptz not null default now()
);
create index if not exists fin_cartoes_categorias_eventos_doc_idx
 on public.fin_cartoes_categorias_eventos(documento_id,alterado_em desc);
alter table public.fin_cartoes_categorias_documentais enable row level security;
alter table public.fin_cartoes_categorias_eventos enable row level security;
revoke all on public.fin_cartoes_categorias_documentais from public,anon,authenticated;
revoke all on public.fin_cartoes_categorias_eventos from public,anon,authenticated;
grant select on public.fin_cartoes_categorias_documentais to authenticated;
grant select on public.fin_cartoes_categorias_eventos to authenticated;
drop policy if exists fin_cartoes_categorias_documentais_ler on public.fin_cartoes_categorias_documentais;
drop policy if exists fin_cartoes_categorias_eventos_ler on public.fin_cartoes_categorias_eventos;
create policy fin_cartoes_categorias_documentais_ler
 on public.fin_cartoes_categorias_documentais for select to authenticated
 using ((select public.fluxo_caixa_autorizado()));
create policy fin_cartoes_categorias_eventos_ler
 on public.fin_cartoes_categorias_eventos for select to authenticated
 using ((select public.fluxo_caixa_autorizado()));

create or replace function public.fin_cartao_categoria_definir(
 p_origem text,
 p_lancamento_id uuid,
 p_categoria text,
 p_categoria_esperada text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid;
 v_categoria text;
 v_antes text;
 v_doc public.fin_documentos_despesas%rowtype;
 v_cartao public.fin_teste_cartao_lancamentos%rowtype;
 v_depois public.fin_teste_cartao_lancamentos%rowtype;
begin
 v_user:=auth.uid();
 if v_user is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Acesso financeiro não autorizado' using errcode='42501';
 end if;
 if p_origem is null or p_origem not in ('planilha','importado') or p_lancamento_id is null then
  raise exception 'Origem de compra de cartão inválida' using errcode='22023';
 end if;
 v_categoria:=upper(btrim(coalesce(p_categoria,'')));
 if length(v_categoria) not between 2 and 100
    or v_categoria ~ '[[:cntrl:]]' then
  raise exception 'Categoria deve ter de 2 a 100 caracteres válidos' using errcode='22023';
 end if;
 if p_origem='planilha' then
  -- Um documento por vez e uma linha de auditoria por alteração, sem alterar Excel.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fr_card_cat:'||p_lancamento_id::text));
  select * into v_doc from public.fin_documentos_despesas
   where id=p_lancamento_id and grupo='cartoes' and incluir=true
    and upper(btrim(coalesce(cartao_nome,''))) not in ('PIX','DEBITO','DÉBITO')
   for share;
  if not found then
   raise exception 'Compra da planilha de cartão não encontrada' using errcode='P0002';
  end if;
  select categoria into v_antes from public.fin_cartoes_categorias_documentais
   where documento_id=p_lancamento_id for update;
  if v_antes is distinct from p_categoria_esperada then
   raise exception 'Categoria atualizada por outra pessoa. Atualize antes de salvar.'
    using errcode='40001';
  end if;
  if v_antes is distinct from v_categoria then
   insert into public.fin_cartoes_categorias_documentais
    (documento_id,categoria,atualizado_por,atualizado_em)
   values(p_lancamento_id,v_categoria,v_user,now())
   on conflict(documento_id) do update set
    categoria=excluded.categoria,atualizado_por=excluded.atualizado_por,
    atualizado_em=excluded.atualizado_em;
   insert into public.fin_cartoes_categorias_eventos
    (documento_id,categoria_anterior,categoria_nova,alterado_por)
   values(p_lancamento_id,v_antes,v_categoria,v_user);
  end if;
 else
  -- Compras importadas: só se altera a classificação, com o log já existente.
  select * into v_cartao from public.fin_teste_cartao_lancamentos
   where id=p_lancamento_id for update;
  if not found then
   raise exception 'Compra importada do cartão não encontrada' using errcode='P0002';
  end if;
  v_antes:=v_cartao.categoria;
  if v_antes is distinct from p_categoria_esperada then
   raise exception 'Categoria atualizada por outra pessoa. Atualize antes de salvar.'
    using errcode='40001';
  end if;
  if v_antes is distinct from v_categoria then
   update public.fin_teste_cartao_lancamentos
    set categoria=v_categoria where id=p_lancamento_id returning * into v_depois;
   insert into public.fin_teste_import_auditoria
    (tipo,registro_id,operacao,antes,depois,operador)
   values('cartao',p_lancamento_id,'editar',to_jsonb(v_cartao),to_jsonb(v_depois),v_user);
  end if;
 end if;
 return jsonb_build_object('origem',p_origem,'lancamento_id',p_lancamento_id,
  'categoria_anterior',v_antes,'categoria_nova',v_categoria,
  'alterada',v_antes is distinct from v_categoria);
end;
$function$;

revoke execute on function public.fin_cartao_categoria_definir(text,uuid,text,text) from public,anon;
grant execute on function public.fin_cartao_categoria_definir(text,uuid,text,text) to authenticated;
comment on function public.fin_cartao_categoria_definir(text,uuid,text,text) is
 'Categorização manual de compra do cartão com auditoria. Não cria despesa bancária nem modifica faturas ou valores.';
