# Financeiro FR Motors: MVP relacional

## Estado em 12/11/2026
- Base Supabase: projeto existente `FRMotors`, sem alterar tabelas de oficina ou `fluxo_caixa_snapshot`.
- Novas tabelas: `fin_fornecedores`, `fin_contas`, `fin_compras`, `fin_parcelas`, `fin_movimentos`, `fin_vinculos_pagamento`, `fin_importacoes`.
- Função transacional: `fin_criar_compra_parcela` (invoker), grava compra e parcela única de modo atômico.
- Autorização inicial: políticas RLS reutilizam `fluxo_caixa_autorizado()`; acesso exclusivo a contas financeiras autorizadas.
- Tela: `financeiro-v2.html`, em branch separada; Dashboard ganha link sem substituir tela legada.
- Fornecedores: 13 inseridos, PARQUE com percentual atual de 15% para pagamentos até o vencimento.
- Histórico: **não importado para as novas tabelas ainda**. Nada foi baixado ou reclassificado automaticamente.

## Próximas entregas antes de produção
1. Testes autenticados das consultas, inserções e restrições RLS com usuários autorizados e não autorizados.
2. Cadastro de compras parceladas (30/60/90) com transação atômica e validação do somatório.
3. Conciliação de pagamentos com parcelas, incluindo juros, desconto, pagamentos parciais e pagamentos agrupados.
4. Migração idempotente de dados de `FLUXO DE CAIXA-2.xlsm` e `FR_Motors_Financeiro_Unificado_Integrado_Fluxo_2026.xlsx`, com relatório de divergências e chave de origem por registro.
5. Exportação para Excel no OneDrive pessoal com controle de versões, cópia de segurança e proteção contra conflitos.
6. Conferir permissão do recurso de importação legado e decidir quando torná-lo somente leitura.
7. Revisar avisos preexistentes do Supabase Security Advisor relativos a funções SECURITY DEFINER e proteção contra senhas comprometidas.

## Regras preservadas
- Fluxo de Caixa é a referência para **pagamentos** (valor, data e vencimento).
- Contas a pagar em aberto continuam em aberto; não considerar pagas.
- Todos os pagamentos do Fluxo foram confirmados pelo usuário; ausência de vínculo documental não invalida pagamento.
- Conferir fornecedor, valor e até 3 dias entre vencimentos para associação automática **apenas se única**.
- PARQUE: desconto atual de 15% até vencimento, sem alteração retroativa do histórico; atrasos podem gerar encargos não estimados.
- Demais boletos: valor cheio; LOPES tem casos confirmados de juros de R$ 5.
- Compras por cartão e pagamento de fatura não podem duplicar o gasto; boletos liquidados por cartão também não criam novas compras.
- Exportações e snapshots não são banco de dados principal; compras, parcelas e pagamentos são entidades distintas.

## Observações técnicas
- O dashboard de lançamentos do MVP limita-se a 1.000 registros no período (requer paginação para crescer).
- O cartão e a parcela múltipla ainda não têm fluxo completo; não lançar operações reais parceladas pelo formulário atual.
- Não houve mudanças no repositório `main` ou na interface de produção. Avaliar a branch em ambiente de testes antes de merge.

## Continuação de 12/11/2026
- Função `fin_criar_compra_parcelada`: grava compras com 1–24 parcelas de forma transacional, valida a soma e a sequência.
- Função `fin_baixar_parcela`: grava saída financeira e vínculo com a parcela, com desconto e juros informados, em transação.
- `financeiro-v2.html`: formulário para valores e vencimentos individuais de parcelas, além da baixa de boleto/parcela.
- `fin_legacy_registros`: tabela isolada de pré-migração com chave única `(origem,referencia)`, políticas RLS e sem acesso público.
- `financeiro-importar.html`: importa pacote JSON em lotes, ignora duplicados e mantém comprovantes históricos separados da nova operação.
- Histórico analisado: 3.223 registros no pacote JSON privativo local, com 3.052 para futura migração, 157 históricos excluídos de indicadores e 14 para revisão.
- O pacote financeiro **não foi incluído no GitHub**, pois contém dados privados e pode ser importado somente por conta autorizada.
- Testes SQL de transação com rollback realizados; conferência posterior confirmou zero linhas de teste nas tabelas operacionais.
- Nenhuma migração histórica foi efetivada nesta etapa. A importação do pacote para a área de revisão ainda requer ação do usuário na interface de testes após aprovação do PR.

## Riscos e pendências de implantação
1. Teste ponta a ponta com navegador autenticado e perfis não autorizados.
2. Migração definitiva do staging para tabelas de produção, preservando saldos de abertura, estornos de cartão e vínculos validados.
3. Reconciliação de 59 contas abertas com boletos existentes sem baixar duas vezes.
4. Paginação real nos indicadores (atual `limit(1000)` nos movimentos do período).
5. Pagamentos parciais, pagamentos agrupados e cartões/faturas com regras de não duplicação.
6. Testar produção em celular e computador, inclusive falha de rede e repetição de gravação.
7. Configurar exportação e backups externos antes de substituir fluxo operacional antigo.
