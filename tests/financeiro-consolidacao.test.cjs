'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('financeiro.html');
const nav=read('financeiro-pro-ui.js');
const docs=read('financeiro-conciliacao-documental.js');
const agenda=read('financeiro-agenda-faturas.js');
const cards=read('financeiro-faturas-cartoes.js');
const deadlines=read('financeiro-central-vencimentos.js');
const core=require('../financeiro-faturas-estado-core.js');

test('Estado da fatura é calculado por comprovantes e não pelo status bruto',()=>{
 const invoices=[
  {id:'a',cartao_nome:'SICOOB',mes_fatura:'2026-11-01',valor_documental:100},
  {id:'b',cartao_nome:'SICOOB',mes_fatura:'2026-12-01',valor_documental:100},
  {id:'c',cartao_nome:'BRAD. PRIME',mes_fatura:'2026-12-01',valor_documental:100},
  {id:'d',cartao_nome:'BRAD. PRIME',mes_fatura:'2026-11-01',valor_documental:100}
 ];
 const state=core.buildInvoiceStates(invoices,[{fatura_id:'a'}],
  [{fatura_id:'b',valor_pago:30,origem:'fluxo'},{fatura_id:'c',valor_pago:100,origem:'externo'}],
  [],[{fatura_id:'b',vencimento:'2026-12-20'}]);
 assert.equal(state[0].status,'declarada');assert.equal(state[0].remaining,0);
 assert.equal(state[1].status,'parcial');assert.equal(state[1].remaining,7000);
 assert.equal(state[1].due,'2026-12-20');
 assert.equal(state[2].status,'externa');assert.equal(state[2].remaining,0);
 assert.equal(state[3].status,'aberta');assert.equal(state[3].remaining,10000);
});
test('Faturas com valor dividido somam todos os pagamentos sem criar saída extra',()=>{
 const rows=core.buildInvoiceStates([{id:'x',valor_documental:200}],
  [],[{fatura_id:'x',valor_pago:80,origem:'externo'},{fatura_id:'x',valor_pago:120,origem:'fluxo'}],[],[]);
 assert.deepEqual(rows.map(x=>[x.status,x.paid,x.remaining,x.bankPaid,x.externalPaid]),
  [['mista',20000,0,12000,8000]]);
});
test('Agenda Financeira é o único calendário visual, com três naturezas separadas',()=>{
 assert.equal((html.match(/id="ag-calendar"/g)||[]).length,1);
 assert.equal((html.match(/id="cv-calendar"/g)||[]).length,0);
 const start=html.indexOf('data-view-panel="agenda"');
 const calendar=html.indexOf('id="ag-calendar"',start);
 const next=html.indexOf('data-view-panel="expenses"',start);
 assert.ok(start>=0&&calendar>start&&calendar<next);
 assert.match(html,/id="ag-receive-total"/);
 assert.match(html,/<option value="receber">Somente a receber<\/option>/);
 assert.match(agenda,/\.from\('fin_contas_receber'\)/);
 assert.match(agenda,/kind:'receber'/);
 assert.match(agenda,/kind!=='receber'/);
 assert.match(agenda,/data-ag-receive/);
});
test('Fluxo de faturas e navegação usam uma única regra de status e agenda',()=>{
 const coreAt=html.indexOf('financeiro-faturas-estado-core.js');
 const agAt=html.indexOf('financeiro-agenda-faturas.js');
 const cbAt=html.indexOf('financeiro-faturas-cartoes.js');
 assert.ok(coreAt>=0&&coreAt<agAt&&agAt<cbAt);
 assert.match(cards,/const engine=window\.frInvoiceStateCore/);
 assert.match(cards,/engine\.buildInvoiceStates/);
 assert.match(agenda,/engine\.buildInvoiceStates/);
 assert.match(cards,/selectView\?\.\('agenda'\)/);
 assert.match(nav,/if\(next==='agenda'\)window\.frInvoicesAgendaUI/);
 assert.match(nav,/requestedView==='deadlines'\?'agenda'/);
});
test('Conciliação documental considera comprovantes manuais e pagamentos parciais',()=>{
 assert.match(docs,/\.from\('fin_comprovacoes_documentais'\)/);
 assert.match(docs,/\.eq\('tipo','autopecas_excecao'\)/);
 assert.match(docs,/manualRefs\.map/);
 assert.match(docs,/!linked\.has\(x\.id\)/);
 assert.match(docs,/partialFaturas\.has\(f\.id\)/);
 assert.match(docs,/manual\.map\(x=>x\.movimento_fluxo_id\)/);
});
test('Resumo aprofundado do caixa permanece disponível, mas recolhido',()=>{
 assert.match(html,/<details class="fin-collapse fin-overview-analysis"/);
 assert.match(html,/<details class="fin-collapse fin-extra-conciliation"/);
 assert.match(deadlines,/if\(!\$\('cv-home-banner'\)\)return/);
 assert.match(html,/data-view="agenda">Abrir Agenda Financeira/);
});
