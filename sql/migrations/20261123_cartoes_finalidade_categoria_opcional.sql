-- Permitir marcar finalidade sem exigir categoria, validando a origem e preservando a descrição.
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
 v_categoria_atual text;
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
 -- Para definir apenas a finalidade, preserve a categoria atual sem criar uma
 -- classificação fictícia. Valide a origem do documento antes de gravar.
 if coalesce(btrim(p_categoria),'')='' then
  if p_origem='planilha' then
   perform 1 from public.fin_documentos_despesas d
    where d.id=p_lancamento_id and d.grupo='cartoes' and d.incluir=true
     and upper(btrim(coalesce(d.cartao_nome,''))) not in ('PIX','DÉBITO','DEBITO')
    for share;
   if not found then
    raise exception 'Compra da planilha não encontrada' using errcode='P0002';
   end if;
   select c.categoria into v_categoria_atual from public.fin_cartoes_categorias_documentais c
    where c.documento_id=p_lancamento_id for update;
  else
   select c.categoria into v_categoria_atual from public.fin_teste_cartao_lancamentos c
    where c.id=p_lancamento_id for update;
   if not found then
    raise exception 'Compra importada não encontrada' using errcode='P0002';
   end if;
  end if;
  if v_categoria_atual is distinct from p_categoria_esperada then
   raise exception 'Categoria alterada por outra pessoa. Atualize antes de salvar.'
    using errcode='40001';
  end if;
  v_categoria_resultado:=jsonb_build_object(
   'categoria_nova',v_categoria_atual,'alterada',false);
 else
  -- Uma categoria informada continua usando a atualização individual auditada.
  v_categoria_resultado:=public.fin_cartao_categoria_definir(
   p_origem,p_lancamento_id,p_categoria,p_categoria_esperada);
 end if;
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
