# FR Motors | Homologação manual de extratos Itaú

Data: 23/11/2026.

## Por que um PDF importado não é automaticamente homologado

A última planilha financeira conferida contém 913 movimentos de caixa, com fechamento em **12/11/2026**. Os PDFs do Itaú importados nos dias posteriores representam uma fonte separada. A mesma movimentação pode aparecer em vários PDFs sucessivos e ainda pode coincidir com uma saída da planilha. Importá-los automaticamente produziria **dupla contagem**.

## Como autorizar

1. Faça login com uma conta que já possui autorização para o Financeiro.
2. Abra **Financeiro → Itaú · Fluxo de Caixa**.
3. No bloco **Homologação de novos lançamentos do Itaú**, clique **Revisar e homologar extrato**.
4. Confira **data, descrição bancária, arquivo de origem, natureza e valor** em cada linha. **Nenhuma linha vem marcada.**
5. Marque apenas lançamentos que conferiu com o PDF. Há opção de selecionar todos os novos, mas esta ação **não equivale à homologação**.
6. Descreva o motivo da conferência em pelo menos 12 caracteres, marque a declaração de responsabilidade e pressione **Homologar selecionados**.
7. Aguarde a confirmação do servidor e atualize os dados. O relatório mostrará a origem **PDF Itaú homologado** separada do Excel.

A autorização é uma transação atômica. Se uma linha for inválida, estiver em outra fonte histórica ou tiver sido homologada anteriormente, **nenhuma das linhas selecionadas é homologada naquela tentativa**.

## Segurança e rastreabilidade

- A base original da planilha **nunca é alterada** e o PDF original permanece intacto.
- A inclusão no caixa oficial ocorre em `public.fin_movimentos`, com `origem='extrato_itau_homologado'`.
- `public.fin_itau_homologacoes` guarda o identificador exato da linha do PDF, o movimento oficial criado, data, tipo, valor, justificativa, usuário e horário.
- Uma linha do PDF pode ser homologada apenas uma vez, inclusive sob tentativas concorrentes; a operação usa bloqueio transacional e identificador único.
- A função `fin_itau_homologar_linhas` exige conta financeira autorizada via `fluxo_caixa_autorizado()`. Execução anônima é proibida; a tabela de auditoria tem RLS e não permite escrita direta do navegador.
- Linhas com mesmo valor, data e tipo de movimentos históricos do Excel não podem ser homologadas como novos movimentos, mesmo se a descrição divergir. Devem ser revisadas como correspondências, não somadas novamente.
- Somente movimentações bancárias do Itaú existentes, confirmadas na origem e com data a partir do fechamento homologado são elegíveis.

## Exibição de resultados

O painel apresenta, lado a lado, três medidas independentes:

| Indicador | Fórmula e significado |
| --- | --- |
| Resultado operacional homologado | Soma das entradas menos as saídas do Excel **mais** os movimentos dos PDFs que alguém aprovou. Não inclui saldo inicial |
| Saldo de abertura | Valor inicial informado na planilha homologada |
| Saldo Itaú **estimado** | Saldo de abertura + resultado operacional homologado + resultado dos PDFs ainda em conferência |

O saldo estimado só equivale ao saldo bancário real se uma referência bancária contemporânea comprovar a conciliação. A tela do Itaú mostra a última referência disponível e possíveis divergências.

### Situação em 23/11/2026

- Fechamento Excel: 12/11/2026.
- Histórico homologado: 913 movimentos.
- Resultado operacional do histórico: **−R$ 8.572,05**.
- Saldo inicial: **+R$ 7.998,83**.
- Resultado dos PDFs ainda não aprovados: **+R$ 1.756,71**.
- Saldo Itaú estimado até 23/11: **+R$ 1.183,49**.
- Última referência bancária informada: **−R$ 2.090,76 em 17/11**.
- Os 27 lançamentos ainda em conferência foram calculados pela conciliação de arquivos sobrepostos e correspondências; a seleção pode mudar com novas importações.

**Nenhuma homologação real foi executada na instalação do recurso.** Só a ação explícita, após login e conferência, poderá aprovar movimentos.

## Verificação

Foram exercitados testes automatizados de resultado antes/depois de homologação, fonte, filtros mensais, previsão de saldo e consolidação por categorias. A migração de schema aplicada no Supabase foi consultada para verificar grants, RLS e preservação do histórico. A confirmação real com o usuário logado deverá ser realizada na própria interface, usando movimentos efetivamente conferidos.
