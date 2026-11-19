-- FR Motors | Classificação manual de extratos já importados.
-- Não regrava descrição bancária, fingerprint, data, natureza ou valores.
-- A alteração afeta apenas categoria de um movimento vinculado + preferência manual,
-- com trilha de auditoria imutável para usuários do aplicativo.
CREATE TABLE IF NOT EXISTS public.fin_extrato_categorias_auditoria (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 linha_id uuid NOT NULL,
 movimento_id uuid NOT NULL,
 arquivo_nome text NOT NULL,
 conta_nome text NOT NULL,
 descricao_bancaria text NOT NULL,
 categoria_anterior text,
 categoria_nova text NOT NULL,
 personalizada_anterior boolean NOT NULL DEFAULT false,
 criado_por uuid NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_extrato_categorias_auditoria_linha_data_idx
 ON public.fin_extrato_categorias_auditoria(linha_id,criado_em DESC);
ALTER TABLE public.fin_extrato_categorias_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_extrato_categorias_auditoria_leitura ON public.fin_extrato_categorias_auditoria;
CREATE POLICY fin_extrato_categorias_auditoria_leitura
 ON public.fin_extrato_categorias_auditoria FOR SELECT TO authenticated
 USING ((SELECT public.fluxo_caixa_autorizado()));
REVOKE ALL ON TABLE public.fin_extrato_categorias_auditoria FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.fin_extrato_categorias_auditoria TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_extrato_categoria_editar(
 p_linha_id uuid,
 p_categoria text,
 p_categoria_esperada text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_linha public.fin_teste_import_linhas%ROWTYPE;
 v_movimento public.fin_teste_movimentos%ROWTYPE;
 v_conta text;
 v_arquivo text;
 v_categoria text;
 v_alterada boolean;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.fluxo_caixa_autorizado())
 THEN
  RAISE EXCEPTION 'Acesso financeiro não autorizado' USING ERRCODE='42501';
 END IF;
 v_categoria:=upper(btrim(coalesce(p_categoria,'')));
 IF length(v_categoria) NOT BETWEEN 2 AND 100
 THEN
  RAISE EXCEPTION 'Informe uma categoria de 2 a 100 caracteres' USING ERRCODE='22023';
 END IF;
 IF p_linha_id IS NULL THEN
  RAISE EXCEPTION 'Movimentação não informada' USING ERRCODE='22023';
 END IF;
 -- Trava o registro original e restringe ao tipo extrato bancário.
 SELECT l.* INTO v_linha
 FROM public.fin_teste_import_linhas l
 JOIN public.fin_teste_importacoes i ON i.id=l.importacao_id
 WHERE l.id=p_linha_id AND i.tipo='banco'
 FOR UPDATE OF l;
 IF NOT FOUND OR v_linha.movimento_id IS NULL THEN
  RAISE EXCEPTION 'Extrato bancário não encontrado ou sem movimentação vinculada' USING ERRCODE='P0002';
 END IF;
 SELECT m.* INTO v_movimento
 FROM public.fin_teste_movimentos m
 WHERE m.id=v_linha.movimento_id FOR UPDATE;
 IF NOT FOUND OR
    v_movimento.referencia_cliente IS DISTINCT FROM ('extrato:'||v_linha.fingerprint) THEN
  RAISE EXCEPTION 'Vínculo financeiro divergente: atualização cancelada' USING ERRCODE='23514';
 END IF;
 IF v_movimento.categoria IS DISTINCT FROM p_categoria_esperada THEN
  RAISE EXCEPTION 'A categoria foi alterada em outra sessão. Atualize a lista antes de salvar.'
   USING ERRCODE='40001';
 END IF;
 SELECT i.conta_nome,i.arquivo_nome INTO v_conta,v_arquivo
 FROM public.fin_teste_importacoes i WHERE i.id=v_linha.importacao_id;
 v_alterada:=(v_movimento.categoria IS DISTINCT FROM v_categoria)
   OR (v_linha.categoria_personalizada IS DISTINCT FROM v_categoria);
 IF v_alterada THEN
  UPDATE public.fin_teste_movimentos
   SET categoria=v_categoria
   WHERE id=v_movimento.id;
  -- Prioridade individual sobre qualquer regra global de PIX reaplicada no futuro.
  UPDATE public.fin_teste_import_linhas
   SET categoria_personalizada=v_categoria
   WHERE id=v_linha.id;
  INSERT INTO public.fin_extrato_categorias_auditoria(
   linha_id,movimento_id,arquivo_nome,conta_nome,descricao_bancaria,
   categoria_anterior,categoria_nova,personalizada_anterior,criado_por
  ) VALUES (
   v_linha.id,v_movimento.id,v_arquivo,v_conta,v_linha.descricao,
   v_movimento.categoria,v_categoria,v_linha.categoria_personalizada IS NOT NULL,auth.uid()
  );
 END IF;
 RETURN jsonb_build_object(
  'id',v_linha.id,'categoria_anterior',v_movimento.categoria,
  'categoria_nova',v_categoria,'alterada',v_alterada,
  'protegida_por_edicao_manual',true
 );
END;
$function$;

-- Privilegio de execução explícito; somente usuários autorizados no corpo da função.
REVOKE ALL ON FUNCTION public.fin_extrato_categoria_editar(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_extrato_categoria_editar(uuid,text,text) TO authenticated;
