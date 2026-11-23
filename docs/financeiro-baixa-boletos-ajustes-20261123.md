# Financeiro FR Motors | Baixa de boletos importados com valor real divergente

Atualização: 23/11/2026.

## Problema resolvido

A carteira importada mantém um `valor_referencia` que nem sempre coincide com o valor da saída bancária efetiva. Anteriormente, o fluxo de baixa só permitia igualdade exata após desconto e juros, além de bloquear saídas bancárias com diferença superior a três dias do vencimento. Isso impedia conciliar correções reais do boleto, mesmo quando o pagamento constava no banco.

## Operação após atualização

1. Acessar **Financeiro > Contas a pagar > Dar baixa** e selecionar um boleto da planilha.
2. Selecionar a **saída bancária confirmada** correspondente. A busca aceita valor, data e descrição. Para boletos da planilha, a busca não exclui automaticamente pagamentos fora da janela de três dias. Limita a visualização inicial a 250 resultados e permite refinar pela busca.
3. Conferir **valor original da planilha** e **valor pago registrado no banco**. Desconto real e juros/multas comprovados continuam em campos independentes.
4. Quando o valor original estava incorreto ou foi revisado, clicar em **Usar diferença como ajuste da planilha**. O ajuste pode ser positivo ou negativo. Para ajustes, uma **justificativa com pelo menos 12 caracteres** é obrigatória.
5. Se a saída homologada ocorreu mais de três dias antes/depois do vencimento, registrar a justificativa da data, mesmo sem ajuste monetário.
6. Conferir o cálculo e marcar o aceite antes de **Confirmar baixa sem duplicação**.

Fórmula do vínculo:

`valor_efetivamente_pago = valor_original_do_Excel - desconto_comprovado + juros_comprovados + ajuste_justificado`

Exemplo: referência R$ 500,00, pagamento real de R$ 450,00, sem desconto e sem juros: ajuste de -R$ 50,00, com justificativa (não classificar indevidamente como desconto).

## Implementação

- Migration `sql/migrations/20261123_baixa_boletos_importados_valor_real_ajustado.sql` aplicada no Supabase em produção.
- Campos novos em `fin_baixas_operacionais`, `fin_teste_excel_abertos_vinculos` e `fin_contas_pagar`, com restrições de consistência monetária e justificativa.
- Novas RPCs com autenticação e autorização `fluxo_caixa_autorizado()`: `fin_baixa_operacional_ajustada` e `fin_teste_conciliar_aberto_excel_ajustado`. Chamadas anônimas não possuem permissão de execução. RPCs originais permanecem intactas para os casos comuns.
- A sincronização `fin_cp_sincronizar_conciliacoes` foi atualizada para preservar o ajuste do extrato importado.
- Auditoria: o operador fica registrado nos vínculos, e a justificativa permanece junto ao ajuste. O valor original da planilha nunca é sobrescrito.
- A tela **Contas a pagar** mostra valor efetivamente pago, ajuste e justificativa quando presentes. Não cria nova movimentação de caixa.
- Boletos avulsos continuam com a validação anterior de três dias e sem alteração de referência por ajuste.

## Limites e cuidados

- Este fluxo vincula um boleto **a uma saída bancária já confirmada**. Se o pagamento foi efetivado mas ainda não aparece no Financeiro, é necessário importar/conferir o extrato. O site não inventa uma saída para liberar a baixa.
- O formulário registra a conciliação do pagamento integral selecionado, não pagamentos parciais do mesmo boleto.
- As garantias de prevenção de vínculo duplicado existentes são preservadas. Atualizações de status e histórico permanecem auditáveis.
- O teste automatizado abrange diferença positiva e negativa, juros/descontos, pagamento com data distante, ausência de justificativa e regressão em boleto avulso. Também foram conferidas a integridade das constraints, permissões e ausência de divergências nos vínculos existentes.
- A confirmação autenticada em navegador real ainda depende de teste manual com um boleto/pagamento conhecido; não foi realizada nenhuma baixa real pela automação.

## Escopo de banco

A migração introduziu colunas e regras, mas **não executou conciliações reais nem editou os valores de boletos ou movimentações existentes**.
