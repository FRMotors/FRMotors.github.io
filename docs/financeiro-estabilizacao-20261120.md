# FR Motors Financeiro | estabilização de 20/11/2026

## Escopo e rastreabilidade
Esta atualização preserva todo o histórico bancário. Não exclui boletos, pagamentos, faturas, extratos, importações ou documentos.
A rotina legada de pagamento de faturas na aba **Importações** foi removida da interface; dados originais de faturas e movimentos importados continuam disponíveis na conferência técnica e no histórico de arquivos. O pagamento de fatura fica na aba **Cartões** e o vencimento na **Agenda Financeira**.

Migração aplicada no Supabase: `20261120213610_estabilizar_funcoes_legadas_e_indices_financeiros_20261120`.
SQL versionado em `sql/migrations/20261120_estabilizar_financeiro_legado_indices.sql`.

## Segurança verificada
- As RPCs `fin_teste_definir_fatura`, `fin_teste_conciliar_fatura`, `fin_teste_desvincular_fatura` e `fin_teste_registrar_pagamento_fatura` foram revogadas para PUBLIC, anon e authenticated.
- A função interna de trigger `crm_recuperacao_log` também teve EXECUTE revogado nesses papéis; o trigger continua cadastrado em `crm_recuperacao_clientes`.
- As RPCs oficiais de comprovação e de pagamento parcial/externo continuam disponíveis ao papel authenticated, com validação de `fluxo_caixa_autorizado()` e `auth.uid()` internamente.
- A revisão de segurança do Supabase ainda aponta 24 avisos de funções SECURITY DEFINER acessíveis a usuários autenticados. Não foram revogadas indiscriminadamente: fazem parte da operação autorizada. Revisar permissões individualmente antes de qualquer nova alteração.
- As seis tabelas sem políticas RLS específicas são de serviço/estágio ou legadas. A ausência de política, com RLS habilitada, implica bloqueio das consultas comuns, e não acesso irrestrito.
- **Pendente no painel Supabase Auth:** habilitar proteção contra senhas vazadas (HaveIBeenPwned), aviso do advisor: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Desempenho
Foram adicionados sete índices de chaves estrangeiras, priorizando fornecedores, lotes homologados e faturas/extratos importados. A criação foi verificada no catálogo PostgreSQL. Outros avisos de índices não criados foram mantidos para análise futura, pois parte das tabelas está vazia ou com uso pouco frequente; índices desnecessários geram custo de escrita e manutenção.

## Ensaio de recuperação não destrutivo
Foi executado um teste de *round-trip* lógico com as tabelas:
| Tabela | Linhas de origem e reconstruídas | Hash |
| --- | ---: | --- |
| fin_movimentos | 914 | Idêntico |
| fin_contas_pagar | 59 | Idêntico |
| fin_documentos_despesas | 2.154 | Idêntico |
| fin_faturas_historicas | 48 | Idêntico |
| fin_teste_excel_linhas | 9.691 | Idêntico |
| **Total** | **12.866** | **Sem divergências** |

A verificação serializou cada registro como JSONB, reconstruiu a estrutura lógica usando o tipo PostgreSQL da tabela e comparou contagem e MD5 agregado, sem criar ou modificar registros persistentes. **Isso NÃO é um teste de restauração de backup externo**, pois nenhum backup físico/lógico ou ambiente de restauração separado foi disponibilizado pela integração.

### Para validar um backup real
1. Confirmar a existência e data do backup efetivo em **Supabase Dashboard > Database > Backups**. Histórico de exportações para Google Sheets não substitui backup de PostgreSQL.
2. Baixar uma cópia de backup oficial ou criar um dump com ferramenta documentada (sem colocar credenciais no repositório).
3. Restaurar **somente em um projeto/ambiente isolado**, nunca em produção.
4. Validar tabelas, políticas de segurança, funções, permissões, e comparar quantidade de linhas e hashes de documentos financeiros.
5. Executar testes de leitura de Cartões, Agenda Financeira e Conciliação no ambiente restaurado, e registrar data, versão e resultado do backup.
Documentação: https://supabase.com/docs/guides/platform/backups

## Validação operacional após publicação
Use uma sessão autenticada e autorizada, sem criar baixas de teste na produção:
- [ ] Abrir Financeiro em desktop e celular. Confirmar carregamento de Visão Geral, Cartões, Contas a pagar e Agenda Financeira.
- [ ] Conferir que as cinco compras antes pendentes aparecem como **comprovação manual** na Conciliação Documental, sem valor adicional no caixa.
- [ ] Verificar uma fatura parcialmente paga em **Cartões** e seu saldo pendente na Agenda.
- [ ] Confirmar que botão de pagamento da fatura abre o modal de Cartões, sem redirecionar a Autopeças.
- [ ] Em Importações, abrir **Arquivos de faturas importadas**. Confirmar que não existem formulários de baixa ou opção de gerar saída de teste; os documentos históricos continuam consultáveis.
- [ ] Conferir somente os estados de boletos já conciliados; não registrar novo pagamento sem comprovante.
- [ ] Verificar em telas pequenas que menu, filtros, tabela e modal não cortam informações essenciais.
- [ ] Conferir extrato do dia **16/10/2026** antes de alterar as duas saídas de **PROLABORE, R$ 1.000 cada**. As referências são diferentes, mas data/descrição/valor coincidem. Não excluir nem fundir automaticamente.

## Critérios de aceite
- Build do GitHub Pages concluído.
- Testes de conciliação documental, integração de categoria, Itaú, faturas e estabilização sem erros.
- Revisão de login e operações já registradas concluída sem criar novas transações artificiais.
- Backups reais restaurados e verificados em ambiente independente antes de considerar a recuperação plenamente testada.
