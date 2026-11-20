-- FR Motors | aplicado ao Supabase em 20/11/2026
-- Registro oficial: 20261120215946_salvar_preferencias_fornecedores_por_usuario_20261120
-- Salva apenas opções visuais por conta. Nenhuma movimentação financeira é modificada.
CREATE TABLE IF NOT EXISTS public.fin_preferencias_fornecedores (
 usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 selecionados text[] NOT NULL DEFAULT '{}',
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fin_preferencias_fornecedores_limite
  CHECK (coalesce(array_length(selecionados,1),0) <= 10000)
);
ALTER TABLE public.fin_preferencias_fornecedores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fin_preferencias_fornecedores FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.fin_preferencias_fornecedores TO authenticated;
CREATE POLICY fin_pref_fornec_select ON public.fin_preferencias_fornecedores
 FOR SELECT TO authenticated
 USING (usuario_id=(SELECT auth.uid()) AND (SELECT public.fluxo_caixa_autorizado()));
CREATE POLICY fin_pref_fornec_insert ON public.fin_preferencias_fornecedores
 FOR INSERT TO authenticated
 WITH CHECK (usuario_id=(SELECT auth.uid()) AND (SELECT public.fluxo_caixa_autorizado()));
CREATE POLICY fin_pref_fornec_update ON public.fin_preferencias_fornecedores
 FOR UPDATE TO authenticated
 USING (usuario_id=(SELECT auth.uid()) AND (SELECT public.fluxo_caixa_autorizado()))
 WITH CHECK (usuario_id=(SELECT auth.uid()) AND (SELECT public.fluxo_caixa_autorizado()));
