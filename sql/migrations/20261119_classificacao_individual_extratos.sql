-- FR Motors Financeiro: descrições e categorias editáveis, sem perder descrição bancária.
-- Operação retrocompatível: linhas antigas permanecem iguais e a função usa os mesmos parâmetros.
alter table public.fin_teste_import_linhas
 add column if not exists descricao_personalizada text,
 add column if not exists categoria_personalizada text;
alter table public.fin_teste_cartao_lancamentos
 add column if not exists categoria text;
CREATE OR REPLACE FUNCTION public.fin_extrato_classificar_um(p_id uuid, p_modo text DEFAULT 'importacao'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.fin_teste_movimentos%rowtype;
 raw_desc text;
 user_desc text;
 user_category text;
 regra public.fin_extrato_regras_classificacao%rowtype;
 ultima record;
 v_meio text;
begin
 if p_modo not in ('importacao','aplicacao_manual','reaplicacao') then
  raise exception 'Origem da classificação inválida' using errcode='22023';
 end if;
 select * into m from public.fin_teste_movimentos where id=p_id for update;
 if not found or m.tipo<>'saida' or m.estado<>'confirmado'
   or m.referencia_cliente not like 'extrato:%' then return false; end if;
 select l.descricao,l.descricao_personalizada,l.categoria_personalizada
 into raw_desc,user_desc,user_category
 from public.fin_teste_import_linhas l
 where l.fingerprint=substring(m.referencia_cliente from 9)
 order by l.criado_em desc limit 1;
 -- Alteração individual na importação sempre tem prioridade sobre regras gerais,
 -- inclusive ao reaplicar regras antigas.
 if user_desc is not null or user_category is not null then return false; end if;
 if raw_desc is null or length(trim(raw_desc))<10 then return false; end if;
 if not (upper(trim(raw_desc)) like 'PIX ENVIADO %'
  or upper(trim(raw_desc)) like 'PAGAMENTOS %'
  or upper(trim(raw_desc)) like 'TRANSFERENCIA PIX %') then return false; end if;
 select * into regra from public.fin_extrato_regras_classificacao r
 where r.ativa and strpos(upper(raw_desc),upper(trim(r.trecho_destinatario)))>0
 order by length(r.trecho_destinatario) desc,r.criado_em desc limit 1;
 if not found then return false; end if;
 select a.descricao_padrao,a.categoria_padrao into ultima
 from public.fin_extrato_classificacoes_auditoria a
 where a.movimento_id=m.id order by a.criado_em desc,a.id desc limit 1;
 -- Uma classificação/manualização que não seja nossa nunca deve ser sobrescrita.
 if m.categoria is distinct from 'EXTRATO BANCÁRIO'
   and not (ultima.descricao_padrao=m.descricao and ultima.categoria_padrao=m.categoria)
 then return false; end if;
 v_meio=case when upper(trim(raw_desc)) like 'PIX %' or upper(trim(raw_desc)) like 'TRANSFERENCIA PIX %'
  then 'pix' else m.meio_pagamento end;
 if m.descricao=regra.descricao_padrao and m.categoria=regra.categoria_padrao
    and m.meio_pagamento is not distinct from v_meio then return false; end if;
 update public.fin_teste_movimentos
 set descricao=regra.descricao_padrao,categoria=regra.categoria_padrao,meio_pagamento=v_meio
 where id=m.id;
 insert into public.fin_extrato_classificacoes_auditoria
 (movimento_id,regra_id,descricao_bancaria,descricao_anterior,categoria_anterior,
 descricao_padrao,categoria_padrao,meio_anterior,meio_novo,modo)
 values (m.id,regra.id,raw_desc,m.descricao,m.categoria,
 regra.descricao_padrao,regra.categoria_padrao,m.meio_pagamento,v_meio,p_modo);
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.fin_teste_importar_extrato(p_tipo text, p_conta text, p_nome text, p_hash text, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_importacao uuid;
 v_repeticoes jsonb:='{}'::jsonb;
 v_chave text;
 v_ocorrencia integer;
 v_existentes integer;
 v_linha jsonb;
 v_fingerprint text;
 v_descricao text;
 v_descricao_personalizada text;
 v_descricao_destino text;
 v_categoria text;
 v_categoria_manual boolean;
 v_data date;
 v_valor numeric;
 v_natureza text;
 v_linha_id uuid;
 v_dest uuid;
 v_inseridos int:=0;
 v_ignorados int:=0;
 v_total int;
BEGIN
 IF NOT (select public.fluxo_caixa_autorizado()) THEN
  RAISE EXCEPTION 'Acesso financeiro negado' USING ERRCODE='42501'; END IF;
 IF p_tipo NOT IN ('banco','cartao') OR length(btrim(p_conta)) NOT BETWEEN 2 AND 120
   OR p_nome IS NULL OR length(p_nome) NOT BETWEEN 1 AND 255
   OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(p_linhas) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Cabeçalho de importação inválido' USING ERRCODE='22023'; END IF;
 -- Lock por banco/conta impede corrida entre importações simultâneas.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
  'fr_import_extrato:'||p_tipo||':'||pg_catalog.translate(lower(btrim(p_conta)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
 ));
 v_total:=jsonb_array_length(p_linhas);
 IF v_total NOT BETWEEN 1 AND 1500 THEN
  RAISE EXCEPTION 'Envie de 1 a 1.500 lançamentos por importação' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fin_teste_importacoes(tipo,conta_nome,arquivo_nome,arquivo_hash,linhas_selecionadas)
 VALUES(p_tipo,btrim(p_conta),left(p_nome,255),p_hash,v_total)
 ON CONFLICT(tipo,conta_nome,arquivo_hash)
 DO UPDATE SET linhas_selecionadas=GREATEST(
    public.fin_teste_importacoes.linhas_selecionadas,EXCLUDED.linhas_selecionadas)
 RETURNING id INTO v_importacao;
 -- Evitar duplicatas se o arquivo for reimportado após mudar a leitura do PDF.
 IF EXISTS(SELECT 1 FROM public.fin_teste_import_linhas WHERE importacao_id=v_importacao)
 THEN
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_linhas) AS item
     WHERE NOT EXISTS(
       SELECT 1 FROM public.fin_teste_import_linhas registro
       WHERE registro.importacao_id=v_importacao
         AND registro.fingerprint=(item.value->>'fingerprint')
     )
   ) THEN
     RAISE EXCEPTION 'Este arquivo já foi importado nesta conta. Corrija valores em Editar ou limpe os testes antes de importar novamente.'
       USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('importadas',0,'duplicadas',v_total,'total',v_total,'importacao_id',v_importacao);
 END IF;
 FOR v_linha IN SELECT value FROM jsonb_array_elements(p_linhas)
 LOOP
  v_fingerprint:=v_linha->>'fingerprint';
  -- A descricao original do banco nunca é substituída: é a identidade de deduplicação.
  v_descricao:=btrim(v_linha->>'descricao');
  v_descricao_personalizada:=nullif(btrim(coalesce(v_linha->>'descricao_personalizada','')),'');
  if v_descricao_personalizada=v_descricao then v_descricao_personalizada:=null; end if;
  v_descricao_destino:=coalesce(v_descricao_personalizada,v_descricao);
  v_natureza:=v_linha->>'natureza';
  v_categoria:=upper(btrim(coalesce(v_linha->>'categoria',
   case v_natureza when 'entrada' then 'RECEBIMENTOS'
    when 'saida' then 'EXTRATO BANCÁRIO'
    when 'compra' then 'COMPRAS NO CARTÃO'
    else 'ESTORNOS' end)));
  v_categoria_manual:=coalesce((v_linha->>'categoria_manual')::boolean,false);
  v_valor:=(v_linha->>'valor')::numeric;
  v_data:=(v_linha->>'data')::date;
  IF v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{64}$'
     OR length(v_descricao) NOT BETWEEN 1 AND 400
     OR (v_descricao_personalizada IS NOT NULL AND length(v_descricao_personalizada) NOT BETWEEN 2 AND 150)
     OR length(v_categoria) NOT BETWEEN 2 AND 100
     OR v_data IS NULL OR v_valor IS NULL OR v_valor<=0
     OR v_valor<>round(v_valor,2)
     OR (p_tipo='banco' AND v_natureza NOT IN ('entrada','saida'))
     OR (p_tipo='cartao' AND v_natureza NOT IN ('compra','estorno'))
  THEN RAISE EXCEPTION 'Lançamento inválido na linha %',v_inseridos+v_ignorados+1
    USING ERRCODE='22023'; END IF;
  -- Proteção para BANCO e CARTÃO, entre arquivos diferentes da mesma conta.
  -- Para cada data/tipo/valor/identidade, usar a MAIOR quantidade em um
  -- mesmo arquivo; assim duas compras iguais na mesma fatura são preservadas.
  v_chave:=v_data::text||'|'||v_natureza||'|'||round(v_valor*100)::bigint::text||
   '|'||public.fin_chave_descricao_financeira(v_descricao);
  v_ocorrencia:=coalesce((v_repeticoes->>v_chave)::integer,0)+1;
  v_repeticoes:=pg_catalog.jsonb_set(v_repeticoes,ARRAY[v_chave],
   pg_catalog.to_jsonb(v_ocorrencia),true);
  SELECT coalesce(max(ocorrencias),0) INTO v_existentes
  FROM (
   SELECT count(*) AS ocorrencias
   FROM public.fin_teste_import_linhas AS registro
   JOIN public.fin_teste_importacoes AS arquivo
    ON arquivo.id=registro.importacao_id
   WHERE arquivo.tipo=p_tipo
     AND pg_catalog.translate(lower(btrim(arquivo.conta_nome)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')=pg_catalog.translate(lower(btrim(p_conta)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
     AND arquivo.id<>v_importacao
     AND registro.data_lancamento=v_data
     AND registro.natureza=v_natureza
     AND registro.valor=v_valor
     AND public.fin_chave_descricao_financeira(registro.descricao)=
       public.fin_chave_descricao_financeira(v_descricao)
   GROUP BY arquivo.id
  ) AS por_arquivo;
  IF v_ocorrencia<=v_existentes THEN
   v_ignorados:=v_ignorados+1;
   CONTINUE;
  END IF;
  v_linha_id:=NULL;
  INSERT INTO public.fin_teste_import_linhas(importacao_id,fingerprint,data_lancamento,
   descricao,descricao_personalizada,categoria_personalizada,valor,natureza)
  VALUES(v_importacao,v_fingerprint,v_data,v_descricao,v_descricao_personalizada,
   case when v_categoria_manual then v_categoria else null end,v_valor,v_natureza)
  ON CONFLICT(fingerprint) DO NOTHING RETURNING id INTO v_linha_id;
  IF v_linha_id IS NULL THEN
    v_ignorados:=v_ignorados+1;
    CONTINUE;
  END IF;
  IF p_tipo='banco' THEN
   INSERT INTO public.fin_teste_movimentos(data_movimento,tipo,descricao,categoria,meio_pagamento,
     fornecedor_id,valor,estado,referencia_cliente)
   VALUES(v_data,v_natureza,v_descricao_destino,
     CASE WHEN v_categoria_manual THEN v_categoria
       WHEN v_descricao ~* '(fatura|cart[aã]o|credit card|pagto cart)' AND v_natureza='saida'
        THEN 'PAGAMENTO DE CARTÃO'
       WHEN v_natureza='entrada' THEN 'RECEBIMENTOS'
       ELSE 'EXTRATO BANCÁRIO' END,
     NULL,NULL,v_valor,'confirmado','extrato:'||v_fingerprint)
   RETURNING id INTO v_dest;
   UPDATE public.fin_teste_import_linhas SET movimento_id=v_dest WHERE id=v_linha_id;
  ELSE
   INSERT INTO public.fin_teste_cartao_lancamentos(importacao_id,fingerprint,cartao_nome,
     data_lancamento,descricao,natureza,valor,categoria)
   VALUES(v_importacao,v_fingerprint,btrim(p_conta),v_data,v_descricao_destino,v_natureza,v_valor,v_categoria)
   RETURNING id INTO v_dest;
   UPDATE public.fin_teste_import_linhas SET cartao_id=v_dest WHERE id=v_linha_id;
  END IF;
  v_inseridos:=v_inseridos+1;
 END LOOP;
 RETURN jsonb_build_object('importadas',v_inseridos,'duplicadas',v_ignorados,
   'total',v_total,'importacao_id',v_importacao);
END $function$;
