-- FR Motors · Confirmação manual, reversível e auditável de correspondências.
-- Jamais altera o valor, data, descrição, categoria ou status de movimentos financeiros.
-- Aprovação é uma verificação da identidade entre duas fontes, NÃO uma baixa de pagamento.

CREATE TABLE IF NOT EXISTS public.fin_conciliacao_confirmacoes (
 linha_id uuid PRIMARY KEY,
 movimento_homologado_id uuid NOT NULL,
 situacao text NOT NULL DEFAULT 'conferido'
  CHECK (situacao IN ('conferido','reaberto')),
 data_movimento date NOT NULL,
 tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
 valor numeric(18,2) NOT NULL CHECK (valor > 0),
 descricao_bancaria text NOT NULL,
 descricao_homologada text NOT NULL,
 observacao text,
 confirmado_por uuid NOT NULL,
 confirmado_em timestamptz NOT NULL DEFAULT now(),
 reaberto_por uuid,
 reaberto_em timestamptz,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_conciliacao_confirmacoes_oficial_ativo
 ON public.fin_conciliacao_confirmacoes(movimento_homologado_id)
 WHERE situacao='conferido';

CREATE TABLE IF NOT EXISTS public.fin_conciliacao_confirmacoes_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 linha_id uuid NOT NULL,
 movimento_homologado_id uuid NOT NULL,
 acao text NOT NULL CHECK (acao IN ('confirmar','reabrir')),
 usuario_id uuid NOT NULL,
 observacao text,
 registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_conciliacao_confirmacoes_eventos_linha
 ON public.fin_conciliacao_confirmacoes_eventos(linha_id,registrado_em DESC);

ALTER TABLE public.fin_conciliacao_confirmacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_conciliacao_confirmacoes_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_conciliacao_confirmacoes_read ON public.fin_conciliacao_confirmacoes;
CREATE POLICY fin_conciliacao_confirmacoes_read
 ON public.fin_conciliacao_confirmacoes FOR SELECT TO authenticated
 USING ((SELECT public.fluxo_caixa_autorizado()));
DROP POLICY IF EXISTS fin_conciliacao_confirmacoes_eventos_read ON public.fin_conciliacao_confirmacoes_eventos;
CREATE POLICY fin_conciliacao_confirmacoes_eventos_read
 ON public.fin_conciliacao_confirmacoes_eventos FOR SELECT TO authenticated
 USING ((SELECT public.fluxo_caixa_autorizado()));

REVOKE ALL ON TABLE public.fin_conciliacao_confirmacoes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.fin_conciliacao_confirmacoes_eventos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.fin_conciliacao_confirmacoes TO authenticated;
GRANT SELECT ON TABLE public.fin_conciliacao_confirmacoes_eventos TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_conciliacao_correspondencia_confirmar(
 p_linha_id uuid,
 p_movimento_homologado_id uuid,
 p_confirmar boolean DEFAULT true,
 p_observacao text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_linha public.fin_teste_import_linhas%ROWTYPE;
 v_importacao public.fin_teste_importacoes%ROWTYPE;
 v_banco public.fin_teste_movimentos%ROWTYPE;
 v_oficial public.fin_movimentos%ROWTYPE;
 v_existente public.fin_conciliacao_confirmacoes%ROWTYPE;
 v_nota text;
 v_user uuid;
BEGIN
 v_user := auth.uid();
 IF v_user IS NULL OR NOT (SELECT public.fluxo_caixa_autorizado()) THEN
  RAISE EXCEPTION 'Acesso financeiro não autorizado' USING ERRCODE='42501';
 END IF;
 IF p_linha_id IS NULL OR p_movimento_homologado_id IS NULL THEN
  RAISE EXCEPTION 'Escolha os dois lançamentos para conciliar' USING ERRCODE='22023';
 END IF;
 v_nota := nullif(btrim(coalesce(p_observacao,'')),'');
 IF length(coalesce(v_nota,'')) > 500 THEN
  RAISE EXCEPTION 'Observação deve ter até 500 caracteres' USING ERRCODE='22023';
 END IF;
 -- Nunca confiar em data, tipo, valor ou descrição enviados pelo navegador.
 SELECT l.* INTO v_linha
 FROM public.fin_teste_import_linhas l
 WHERE l.id=p_linha_id FOR SHARE;
 IF NOT FOUND OR v_linha.movimento_id IS NULL THEN
  RAISE EXCEPTION 'Lançamento de extrato não encontrado' USING ERRCODE='P0002';
 END IF;
 SELECT i.* INTO v_importacao
 FROM public.fin_teste_importacoes i WHERE i.id=v_linha.importacao_id;
 IF NOT FOUND OR v_importacao.tipo<>'banco' THEN
  RAISE EXCEPTION 'Origem não é extrato bancário' USING ERRCODE='23514';
 END IF;
 SELECT m.* INTO v_banco FROM public.fin_teste_movimentos m
 WHERE m.id=v_linha.movimento_id FOR SHARE;
 IF NOT FOUND OR v_banco.estado<>'confirmado' OR
    v_banco.referencia_cliente IS DISTINCT FROM ('extrato:'||v_linha.fingerprint) OR
    v_banco.data_movimento IS DISTINCT FROM v_linha.data_lancamento OR
    v_banco.tipo IS DISTINCT FROM v_linha.natureza OR
    v_banco.valor IS DISTINCT FROM v_linha.valor THEN
  RAISE EXCEPTION 'Vínculo bancário inválido ou cancelado. Atualize a conciliação.' USING ERRCODE='23514';
 END IF;
 SELECT m.* INTO v_oficial FROM public.fin_movimentos m
 WHERE m.id=p_movimento_homologado_id FOR SHARE;
 IF NOT FOUND OR v_oficial.origem<>'fluxo_caixa_homologado' OR
    v_oficial.estado<>'confirmado' OR
    v_oficial.data_movimento IS DISTINCT FROM v_linha.data_lancamento OR
    v_oficial.tipo IS DISTINCT FROM v_linha.natureza OR
    v_oficial.valor IS DISTINCT FROM v_linha.valor THEN
  RAISE EXCEPTION 'Os dois lançamentos não correspondem em data, tipo e valor.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_existente FROM public.fin_conciliacao_confirmacoes
 WHERE linha_id=p_linha_id FOR UPDATE;
 IF FOUND AND v_existente.movimento_homologado_id<>p_movimento_homologado_id THEN
  RAISE EXCEPTION 'Há outra correspondência registrada para esse extrato. Consulte a auditoria.'
   USING ERRCODE='23505';
 END IF;
 IF p_confirmar THEN
  IF v_existente.situacao='conferido' THEN
   RETURN jsonb_build_object('linha_id',p_linha_id,
    'movimento_homologado_id',p_movimento_homologado_id,
    'situacao','conferido','alterado',false);
  END IF;
  INSERT INTO public.fin_conciliacao_confirmacoes(
   linha_id,movimento_homologado_id,situacao,data_movimento,tipo,valor,
   descricao_bancaria,descricao_homologada,observacao,confirmado_por,confirmado_em,
   reaberto_por,reaberto_em,atualizado_em
  ) VALUES (
   p_linha_id,p_movimento_homologado_id,'conferido',v_linha.data_lancamento,
   v_linha.natureza,v_linha.valor,v_linha.descricao,v_oficial.descricao,
   v_nota,v_user,now(),null,null,now()
  ) ON CONFLICT(linha_id) DO UPDATE SET
   situacao='conferido',valor=excluded.valor,data_movimento=excluded.data_movimento,
   tipo=excluded.tipo,descricao_bancaria=excluded.descricao_bancaria,
   descricao_homologada=excluded.descricao_homologada,
   observacao=excluded.observacao,confirmado_por=excluded.confirmado_por,
   confirmado_em=excluded.confirmado_em,reaberto_por=null,reaberto_em=null,
   atualizado_em=now();
  INSERT INTO public.fin_conciliacao_confirmacoes_eventos(
   linha_id,movimento_homologado_id,acao,usuario_id,observacao
  ) VALUES (p_linha_id,p_movimento_homologado_id,'confirmar',v_user,v_nota);
 ELSE
  IF v_existente.linha_id IS NULL OR v_existente.situacao='reaberto' THEN
   RETURN jsonb_build_object('linha_id',p_linha_id,
    'movimento_homologado_id',p_movimento_homologado_id,
    'situacao','reaberto','alterado',false);
  END IF;
  UPDATE public.fin_conciliacao_confirmacoes
   SET situacao='reaberto',reaberto_por=v_user,reaberto_em=now(),atualizado_em=now()
   WHERE linha_id=p_linha_id;
  INSERT INTO public.fin_conciliacao_confirmacoes_eventos(
   linha_id,movimento_homologado_id,acao,usuario_id,observacao
  ) VALUES (p_linha_id,p_movimento_homologado_id,'reabrir',v_user,v_nota);
 END IF;
 RETURN jsonb_build_object('linha_id',p_linha_id,
  'movimento_homologado_id',p_movimento_homologado_id,
  'situacao',case when p_confirmar then 'conferido' else 'reaberto' end,
  'alterado',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_conciliacao_correspondencia_confirmar(uuid,uuid,boolean,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_conciliacao_correspondencia_confirmar(uuid,uuid,boolean,text)
 TO authenticated;
