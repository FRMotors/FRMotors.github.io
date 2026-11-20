-- FR Motors | migração aplicada ao projeto Supabase em 20/11/2026
-- Migration no Supabase: 20261120213610_estabilizar_funcoes_legadas_e_indices_financeiros_20261120
-- Preserva todos os registros. Não altera valores nem faturas. Idempotente quando reaplicada.
-- Desativar a superfície RPC de quitação do módulo legado (tabelas fin_teste_faturas).
REVOKE EXECUTE ON FUNCTION public.fin_teste_definir_fatura(uuid,numeric,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_teste_conciliar_fatura(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_teste_desvincular_fatura(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_teste_registrar_pagamento_fatura(uuid,date,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
-- Função de gatilho CRM: execução só pelo próprio trigger, nunca por clientes RPC.
REVOKE EXECUTE ON FUNCTION public.crm_recuperacao_log() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.crm_recuperacao_log() SET search_path = '';
-- Índices para relações de fornecedores, origem do lote e importações bancárias/cartões.
CREATE INDEX IF NOT EXISTS fin_contas_pagar_fornecedor_fk_idx ON public.fin_contas_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS fin_contas_pagar_lote_fk_idx ON public.fin_contas_pagar (lote_origem_id);
CREATE INDEX IF NOT EXISTS fin_documentos_despesas_fornecedor_fk_idx ON public.fin_documentos_despesas (fornecedor_id);
CREATE INDEX IF NOT EXISTS fin_documentos_despesas_lote_fk_idx ON public.fin_documentos_despesas (lote_origem_id);
CREATE INDEX IF NOT EXISTS fin_teste_cartao_lancamentos_importacao_fk_idx ON public.fin_teste_cartao_lancamentos (importacao_id);
CREATE INDEX IF NOT EXISTS fin_teste_import_linhas_cartao_fk_idx ON public.fin_teste_import_linhas (cartao_id);
CREATE INDEX IF NOT EXISTS fin_teste_import_linhas_movimento_fk_idx ON public.fin_teste_import_linhas (movimento_id);
-- Reversão pontual de privilégios (apenas se o fluxo legado for reativado formalmente):
-- GRANT EXECUTE ON FUNCTION public.fin_teste_definir_fatura(uuid,numeric,date) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fin_teste_conciliar_fatura(uuid,uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fin_teste_desvincular_fatura(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fin_teste_registrar_pagamento_fatura(uuid,date,numeric,text,uuid) TO authenticated;
-- NÃO reabrir crm_recuperacao_log() como RPC: é uma função exclusiva de trigger.
