'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const core=require('../financeiro-agenda-boletos-core.js');
const agendaJS=read('financeiro-agenda-faturas.js'),centralJS=read('financeiro-central-vencimentos.js');
const html=read('financeiro.html');
const part=(id,numero,status='aberto',forma='boleto',date='2026-11-25')=>({
 id,compra_id:'compra-1',numero,vencimento:date,valor_cheio:101.27,status,
 fin_compras:{id:'compra-1',fornecedor_id:'fornecedor-1',descricao:'Compra de peças',forma_pagamento:forma}
});
test('parcela única e compras em 3 parcelas entram; pagas, canceladas e crédito não entram',()=>{
 const rows=[
  part('one',1,'aberto','boleto','2026-11-23'),part('p1',1,'aberto','boleto','2026-11-25'),
  part('p2',2,'aberto','boleto','2026-12-25'),part('p3',3,'aberto','boleto','2027-01-25'),
  part('paid',4,'pago','boleto'),part('cancel',5,'cancelado','boleto'),
  part('credit',1,'aberto','cartao_credito'),part('p1',1,'aberto','boleto')
 ];
 const selected=core.openInstallments(rows,new Map([['fornecedor-1','LOPES']]));
 assert.deepEqual(selected.map(x=>x.id),['one','p1','p2','p3']);
 assert.equal(selected[0].fornecedor,'LOPES');
 assert.equal(selected[0].valorCentavos,10127);
 assert.equal(new Set(selected.map(x=>x.id)).size,4);
 assert.equal(selected[3].vencimento,'2027-01-25');
});
test('sem vencimento continua como pendência sem inventar data',()=>{
 const rows=core.openInstallments([part('one',1,'aberto','boleto',null)],new Map());
 assert.equal(rows[0].vencimento,null);
 assert.equal(rows[0].fornecedor,'Fornecedor cadastrado');
});
test('valor incorreto de parcela bloqueia indicadores parciais',()=>{
 assert.throws(()=>core.openInstallments([{
  ...part('bad',1),valor_cheio:'NaN'
 }],new Map()),/valor inválido/);
});
function makeContext(source,replace,extra={}){
 const testSource=source.replace(replace.before,replace.after);
 assert.notEqual(source,testSource,'Precisa instalar o ponto de teste');
 const document={readyState:'loading',addEventListener(){},
  querySelector(){return {hidden:true}},getElementById(){return null}};
 const context={window:{
  frAgendaBoletosCore:core,
  frInvoiceStateCore:{buildInvoiceStates:()=>[]},
  frCardNames:{canonical:v=>v||''}
 },document,Intl,Date,Map,Set,Promise,Number,String,Error,...extra};
 vm.runInNewContext(testSource,context);
 return context.window;
}
test('agenda reúne boletos da planilha, avulsos e compras em 1 ou múltiplas parcelas, sem duplicar',()=>{
 const app=makeContext(agendaJS,{
  before:'window.frInvoicesAgendaUI={refresh};',
  after:`window.frInvoicesAgendaUI={refresh,__test:{
   seed:source=>{
    bills=source.bills;manualBills=source.manual;
    installmentBills=source.parts;supplierNames=new Map(source.suppliers);
    billLinks=source.links;manualBankLinks=source.bank;receivables=[];
    invoices=[];declarations=[];payments=[];fullPayments=[];deadlines=[];
   },allAgendaItems
  }};`
 });
 const manual=[
  {id:'avulso-aberto',fornecedor_nome:'SIMPLES',descricao:'Novembro',vencimento:'2026-11-23',valor_referencia:484.63},
  {id:'avulso-pago',fornecedor_nome:'INSS',descricao:'Pago',vencimento:'2026-11-19',valor_referencia:1200}
 ];
 app.frInvoicesAgendaUI.__test.seed({
  bills:[{id:'planilha-aberto',fornecedor_nome:'PARQUE',descricao:'Histórico',valor_referencia:800,vencimento:'2026-11-25',situacao:'aberto'}],
  manual,parts:[part('one',1,'aberto','boleto','2026-11-23'),part('p1',1),
   part('paid',2,'pago','boleto'),part('credit',3,'aberto','cartao_credito')],
  suppliers:[['fornecedor-1','LOPES']],links:[],bank:[{boleto_avulso_id:'avulso-pago'}]
 });
 const items=app.frInvoicesAgendaUI.__test.allAgendaItems();
 assert.equal(items.length,4);
 assert.deepEqual([...items.map(x=>x.agendaId)].sort(),
  ['avulso:avulso-aberto','conta:planilha-aberto','parcela:one','parcela:p1'].sort());
 assert.ok(items.every(x=>x.kind==='boleto'&&x.rest>0));
 assert.ok(items.some(x=>x.origin==='parcela'&&x.numero===1));
 assert.ok(items.some(x=>x.origin==='avulso'&&x.title==='SIMPLES'));
});
test('central de vencimentos inclui parcelas em boletos a pagar, sem misturar cartões de crédito',()=>{
 const app=makeContext(centralJS,{
  before:'window.frDeadlinesUI={refresh};',
  after:'window.frDeadlinesUI={refresh,__test:{createRecords}};'
 });
 const record=app.frDeadlinesUI.__test.createRecords(
  [],[],[],[],[],[part('p1',1),part('p2',2,'pago','boleto'),part('credit',3,'aberto','cartao_credito')],
  new Map([['fornecedor-1','LOPES']])
 );
 assert.equal(record.length,1);
 assert.equal(record[0].source,'parcela');
 assert.equal(record[0].name,'LOPES');
 assert.equal(record[0].amount,10127);
});
test('agenda expõe próximo vencimento, navegação por mês e ação específica para parcelas',()=>{
 assert.match(html,/id="ag-next-bills"/);
 assert.match(html,/id="ag-next-bill-month"/);
 assert.match(html,/financeiro-agenda-boletos-core\.js\?v=/);
 assert.ok(html.indexOf('financeiro-agenda-boletos-core.js')<html.indexOf('financeiro-agenda-faturas.js'));
 assert.ok(html.indexOf('financeiro-agenda-boletos-core.js')<html.indexOf('financeiro-central-vencimentos.js'));
 assert.match(agendaJS,/\.from\('fin_parcelas'\)/);
 assert.match(agendaJS,/\.eq\('status','aberto'\)\.eq\('fin_compras\.forma_pagamento','boleto'\)/);
 assert.match(agendaJS,/\.from\('fin_boletos_avulsos'\)/);
 assert.match(agendaJS,/data-ag-jump/);
 assert.match(agendaJS,/data-pay-id=/);
 assert.match(centralJS,/\.from\('fin_parcelas'\)/);
 assert.match(read('financeiro-pro-ui.js'),/window\.frInvoicesAgendaUI\?\.refresh\?\.\(\)/);
 assert.match(read('financeiro-baixas-operacionais.js'),/window\.frInvoicesAgendaUI\?\.refresh\?\.\(\)/);
 for(const name of ['financeiro-agenda-faturas.js','financeiro-central-vencimentos.js','financeiro-agenda-boletos-core.js']){
  assert.doesNotMatch(read(name),/\.insert\(|\.update\(|fin_\w+_criar\(/);
 }
});
