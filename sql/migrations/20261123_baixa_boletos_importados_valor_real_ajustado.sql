-- FR Motors | Baixa corrigida de boletos originados do Excel.
-- Operações monetárias existentes permanecem imutáveis. Este script somente
-- amplia a representação de um vínculo com uma saída CONFIRMADA já existente.
-- Um ajuste NÃO é desconto nem juros. Justificativa é obrigatória para ajustes
-- de valor ou datas divergentes, com operador registrado na própria baixa.

alter table public.fin_baixas_operacionais
 add column if not exists ajuste_valor numeric(14,2) not null default 0,
 add column if not exists justificativa_ajuste text;
alter table public.fin_teste_excel_abertos_vinculos
 add column if not exists ajuste_valor numeric(14,2) not null default 0,
 add column if not exists justificativa_ajuste text;
alter table public.fin_contas_pagar
 add column if not exists ajuste_efetivo numeric(14,2) not null default 0,
 add column if not exists justificativa_ajuste text;

alter table public.fin_baixas_operacionais
 drop constraint fin_baixa_operacional_valor,
 add constraint fin_baixa_operacional_valor
  check (valor_base-desconto+juros+ajuste_valor=valor_pago),
 add constraint fin_baixa_operacional_ajuste_justificado
  check (ajuste_valor=0 or length(btrim(coalesce(justificativa_ajuste,'')))>=12);

alter table public.fin_teste_excel_abertos_vinculos
 drop constraint fin_teste_excel_abertos_valores,
 add constraint fin_teste_excel_abertos_valores
  check (valor_previsto-desconto+juros+ajuste_valor=valor_pago),
 add constraint fin_teste_excel_abertos_ajuste_justificado
  check (ajuste_valor=0 or length(btrim(coalesce(justificativa_ajuste,'')))>=12);

alter table public.fin_contas_pagar
 drop constraint fin_cp_estado_coerente,
 add constraint fin_cp_estado_coerente check (
  (situacao='aberto' and valor_pago is null and data_pagamento is null
   and vinculo_teste_id is null and movimento_teste_id is null
   and desconto_efetivo is null and juros_efetivos is null
   and ajuste_efetivo=0 and justificativa_ajuste is null)
  or
  (situacao='conciliado_extrato' and valor_pago is not null and data_pagamento is not null
   and vinculo_teste_id is not null and movimento_teste_id is not null
   and desconto_efetivo is not null and juros_efetivos is not null
   and valor_referencia-desconto_efetivo+juros_efetivos+ajuste_efetivo=valor_pago
   and (ajuste_efetivo=0 or length(btrim(coalesce(justificativa_ajuste,'')))>=12))
 );

-- Fluxo oficial: rotina dedicada a compromissos HOMOLOGADOS, com motivo
-- obrigatório. A RPC antiga permanece intacta para baixa sem divergência.
create or replace function public.fin_baixa_operacional_ajustada(
 p_boleto uuid,p_movimento uuid,p_desconto numeric,p_juros numeric,
 p_ajuste numeric,p_justificativa text
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_mov public.fin_movimentos%rowtype;
 v_conta public.fin_contas_pagar%rowtype;
 v_id uuid;
 v_dias int;
begin
 if auth.uid() is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Acesso ao financeiro não autorizado.' using errcode='42501';
 end if;
 if p_boleto is null or p_movimento is null or p_desconto is null or p_juros is null
  or p_ajuste is null or p_desconto<0 or p_juros<0
  or p_desconto<>round(p_desconto,2) or p_juros<>round(p_juros,2)
  or p_ajuste<>round(p_ajuste,2)
  or length(btrim(coalesce(p_justificativa,'')))<12
  or length(p_justificativa)>500 then
  raise exception 'Informe desconto, juros, ajuste monetário e justificativa de pelo menos 12 caracteres.'
   using errcode='22023';
 end if;
 select * into v_mov from public.fin_movimentos where id=p_movimento for update;
 if not found or v_mov.tipo<>'saida' or v_mov.estado<>'confirmado'
  or v_mov.origem<>'fluxo_caixa_homologado' or v_mov.valor<=0 then
  raise exception 'Selecione uma saída real e confirmada do Fluxo de Caixa.' using errcode='22023';
 end if;
 select * into v_conta from public.fin_contas_pagar where id=p_boleto for update;
 if not found or v_conta.situacao<>'aberto' or v_conta.arquivado_em is not null then
  raise exception 'O compromisso da planilha não está em aberto.' using errcode='22023';
 end if;
 if exists(select 1 from public.fin_baixas_operacionais
  where conta_pagar_id=p_boleto or movimento_id=p_movimento)
  or exists(select 1 from public.fin_vinculos_pagamento where movimento_id=p_movimento)
  or exists(select 1 from public.fin_faturas_pagamentos_parciais where movimento_fluxo_id=p_movimento)
  or exists(select 1 from public.fin_comprovacoes_documentais where movimento_fluxo_id=p_movimento)
  or exists(select 1 from public.fin_conciliacoes_documentais where movimento_id=p_movimento)
  or exists(select 1 from public.fin_pix_debito_referencias where movimento_id=p_movimento) then
  raise exception 'O boleto ou o movimento bancário já está vinculado a outro pagamento.'
   using errcode='23505';
 end if;
 if p_desconto>v_conta.valor_referencia or
  v_conta.valor_referencia-p_desconto+p_juros+p_ajuste<>v_mov.valor then
  raise exception 'Valor original menos desconto mais juros mais ajuste deve coincidir com a saída real.'
   using errcode='22023';
 end if;
 v_dias:=case when v_conta.vencimento is null then 0
  else abs(v_mov.data_movimento-v_conta.vencimento) end;
 if p_ajuste=0 and v_dias<=3 then
  raise exception 'Baixa sem divergência deve utilizar a conciliação padrão.'
   using errcode='22023';
 end if;
 insert into public.fin_baixas_operacionais
 (conta_pagar_id,movimento_id,valor_base,desconto,juros,
  ajuste_valor,justificativa_ajuste,valor_pago,data_pagamento,operador)
 values (v_conta.id,v_mov.id,v_conta.valor_referencia,p_desconto,p_juros,
  p_ajuste,btrim(p_justificativa),v_mov.valor,v_mov.data_movimento,auth.uid())
 returning id into v_id;
 return jsonb_build_object('vinculo_id',v_id,'tipo','homologado',
  'valor_original',v_conta.valor_referencia,'valor_pago',v_mov.valor,
  'ajuste',p_ajuste,'data_pagamento',v_mov.data_movimento,
  'dias_diferenca',v_dias,'resultado','vinculado_sem_nova_saida');
end;
$fn$;
revoke execute on function public.fin_baixa_operacional_ajustada(uuid,uuid,numeric,numeric,numeric,text)
 from public,anon;
grant execute on function public.fin_baixa_operacional_ajustada(uuid,uuid,numeric,numeric,numeric,text)
 to authenticated;

-- Extrato importado: mesma garantia de histórico e anti-duplicação do legado.
create or replace function public.fin_teste_conciliar_aberto_excel_ajustado(
 p_aberto uuid,p_movimento uuid,p_desconto numeric,p_juros numeric,
 p_ajuste numeric,p_justificativa text
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_mov public.fin_teste_movimentos%rowtype;
 v_aberto public.fin_teste_excel_linhas%rowtype;
 v_lote public.fin_teste_excel_lotes%rowtype;
 v_ultimo uuid;
 v_chave text;
 v_id uuid;
 v_dias int;
begin
 if auth.uid() is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Acesso ao financeiro não autorizado.' using errcode='42501';
 end if;
 if p_aberto is null or p_movimento is null or p_desconto is null or p_juros is null
  or p_ajuste is null or p_desconto<0 or p_juros<0
  or p_desconto<>round(p_desconto,2) or p_juros<>round(p_juros,2)
  or p_ajuste<>round(p_ajuste,2) or
  length(btrim(coalesce(p_justificativa,'')))<12
  or length(p_justificativa)>500 then
  raise exception 'Informe a justificativa e os valores da baixa com até duas casas decimais.'
   using errcode='22023';
 end if;
 select * into v_mov from public.fin_teste_movimentos where id=p_movimento for update;
 if not found or v_mov.tipo<>'saida' or v_mov.estado<>'confirmado'
  or v_mov.referencia_cliente not like 'extrato:%' or v_mov.valor<=0 then
  raise exception 'Selecione uma saída confirmada do extrato importado.' using errcode='22023';
 end if;
 select * into v_aberto from public.fin_teste_excel_linhas
  where id=p_aberto and grupo='abertos_fluxo' for update;
 if not found or upper(trim(coalesce(v_aberto.dados->>'situacao','')))<>'EM ABERTO' then
  raise exception 'Compromisso da planilha não está aberto.' using errcode='22023';
 end if;
 select * into v_lote from public.fin_teste_excel_lotes where id=v_aberto.lote_id;
 select id into v_ultimo from public.fin_teste_excel_lotes
  where status='conferido' order by criado_em desc,id desc limit 1;
 if not found or v_lote.status<>'conferido' or v_aberto.lote_id is distinct from v_ultimo then
  raise exception 'A planilha foi atualizada. Atualize a lista antes de conciliar.'
   using errcode='22023';
 end if;
 if exists(select 1 from public.fin_teste_vinculos where movimento_id=p_movimento)
  or exists(select 1 from public.fin_teste_fatura_pagamentos where movimento_id=p_movimento)
  or exists(select 1 from public.fin_teste_excel_abertos_vinculos
    where movimento_id=p_movimento)
  or exists(select 1 from public.fin_baixas_extrato_avulsos where movimento_teste_id=p_movimento)
  or exists(select 1 from public.fin_faturas_pagamentos_parciais where movimento_extrato_id=p_movimento)
  or exists(select 1 from public.fin_comprovacoes_documentais where movimento_extrato_id=p_movimento) then
  raise exception 'Saída do extrato já utilizada em outro compromisso.'
   using errcode='23505';
 end if;
 v_chave:=coalesce(nullif(trim(v_aberto.dados->>'linha_original'),''),'linha:'||v_aberto.linha_excel::text)
  ||'|'||upper(trim(v_aberto.descricao))
  ||'|'||coalesce(v_aberto.data_evento::text,'sem-data')
  ||'|'||round(v_aberto.valor*100)::bigint::text;
 if exists(select 1 from public.fin_teste_excel_abertos_vinculos
   where origem_chave=v_chave or linha_aberto_id=p_aberto) then
  raise exception 'Este boleto já foi conciliado, inclusive em planilhas anteriores.'
   using errcode='23505';
 end if;
 if p_desconto>v_aberto.valor or
  v_aberto.valor-p_desconto+p_juros+p_ajuste<>v_mov.valor then
  raise exception 'Valor original menos desconto mais juros mais ajuste deve igualar o pagamento.'
   using errcode='22023';
 end if;
 v_dias:=case when v_aberto.data_evento is null then 0
  else abs(v_mov.data_movimento-v_aberto.data_evento) end;
 if p_ajuste=0 and v_dias<=3 then
  raise exception 'Use a conciliação padrão quando não houver divergência.'
   using errcode='22023';
 end if;
 insert into public.fin_teste_excel_abertos_vinculos
 (lote_id,linha_aberto_id,origem_chave,movimento_id,valor_previsto,
  desconto,juros,ajuste_valor,justificativa_ajuste,valor_pago,vinculado_por)
 values(v_aberto.lote_id,v_aberto.id,v_chave,v_mov.id,v_aberto.valor,
  p_desconto,p_juros,p_ajuste,btrim(p_justificativa),v_mov.valor,auth.uid())
 returning id into v_id;
 return jsonb_build_object('resultado','conciliado','vinculo_id',v_id,
  'valor_original',v_aberto.valor,'valor_pago',v_mov.valor,'ajuste',p_ajuste);
end;
$fn$;
revoke execute on function public.fin_teste_conciliar_aberto_excel_ajustado(uuid,uuid,numeric,numeric,numeric,text)
 from public,anon;
grant execute on function public.fin_teste_conciliar_aberto_excel_ajustado(uuid,uuid,numeric,numeric,numeric,text)
 to authenticated;

-- A sincronização da carteira aceita agora a diferença justificada.
create or replace function public.fin_cp_sincronizar_conciliacoes()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_count int;
begin
 if auth.uid() is null or not public.fluxo_caixa_autorizado() then
  raise exception 'Acesso financeiro negado' using errcode='42501';
 end if;
 update public.fin_contas_pagar cp
 set situacao='conciliado_extrato',
     desconto_efetivo=v.desconto,juros_efetivos=v.juros,
     ajuste_efetivo=v.ajuste_valor,justificativa_ajuste=v.justificativa_ajuste,
     valor_pago=v.valor_pago,data_pagamento=m.data_movimento,
     vinculo_teste_id=v.id,movimento_teste_id=m.id,atualizado_em=now()
 from public.fin_teste_excel_abertos_vinculos v
 join public.fin_teste_movimentos m on m.id=v.movimento_id
 where cp.origem_chave=v.origem_chave
   and cp.situacao='aberto'
   and cp.valor_referencia=v.valor_previsto
   and v.valor_previsto-v.desconto+v.juros+v.ajuste_valor=v.valor_pago
   and m.valor=v.valor_pago
   and m.tipo='saida' and m.estado='confirmado'
   and m.referencia_cliente like 'extrato:%';
 get diagnostics v_count=row_count;
 return jsonb_build_object('novos_vinculos',v_count,
  'mensagem','Conciliações confirmadas sincronizadas sem gerar outro pagamento.');
end;
$fn$;
-- Preserva o ACL da função existente e exige autenticação/fluxo autorizado internamente.
