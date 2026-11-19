'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const supplier=require('../financeiro-documentos-status-core.js');
const audit=require('../financeiro-auditoria-estado-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('financeiro.html'),docs=read('financeiro-documentos.js');
const aUI=read('financeiro-auditoria-estado-ui.js');
const cb=read('financeiro-faturas-cartoes.js'),vl=read('financeiro-vinculos-faturas.js');
const dc=read('financeiro-conciliacao-documental.js'),nav=read('financeiro-pro-ui.js');
const entry=(id,group,name,desc,day,value,month)=>({id,grupo:group,
 fornecedor_nome:name,descricao:desc,vencimento:day,data_evento:day,mes_fatura:month,
 incluir:true,valor_registrado:value});

test('Fornecedores de Autopeças, retíficas e marketplace são descobertos em suas origens',()=>{
 const items=[entry('a','autopecas','PARQUE','PARQUE','2026-11-18',100),
  entry('b','cartoes','PRM RETÍFICA','PRM RETIFICA','2026-11-20',200,'2026-11-01'),
  entry('c','cartoes',null,'MERCADO LIVRE*VENDOR','2026-12-16',300,'2026-02-01'),
  entry('d','cartoes','LANCHONETE','LANCHONETE','2026-11-20',50,'2026-11-01')];
 const list=supplier.supplierCatalogue(items,[{nome:'RETIFICAS'}]);
 const keys=supplier.defaultSupplierKeys(list);
 assert.equal(list.length,5);assert.equal(keys.size,3);
 assert.ok(keys.has('autopecas|PARQUE'));assert.ok(keys.has('cartoes|PRM RETIFICA'));
 assert.ok(keys.has('cartoes|MERCADO LIVRE'));assert.ok(!keys.has('cartoes|LANCHONETE'));
 assert.ok(list.some(r=>r.name==='RETIFICAS'&&r.group==='cadastro'&&r.count===0));
 const rows=supplier.monthlySuppliers(items,2026,keys);
 assert.equal(rows.find(r=>r.name==='MERCADO LIVRE').months[1],30000);
 assert.equal(rows.find(r=>r.name==='MERCADO LIVRE').months[11],0);
});
test('Não mistura origens idênticas e mantém estornos negativos de cartão',()=>{
 const docs=[entry('a','autopecas','PARQUE','PARQUE','2026-11-18',100),
  entry('b','cartoes','PARQUE','PARQUE','2026-11-18',200,'2026-11-01'),
  entry('c','cartoes','PARQUE','PARQUE','2026-11-18',-50,'2026-11-01')];
 const keys=new Set(['autopecas|PARQUE','cartoes|PARQUE']);
 const rows=supplier.monthlySuppliers(docs,2026,keys);
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.group==='autopecas').total,10000);
 assert.equal(rows.find(r=>r.group==='cartoes').total,15000);
});
test('Não altera boletos nem presume que mesma descrição é quitação',()=>{
 const accounts=[{id:'a',fornecedor_nome:'PARQUE',situacao:'conciliado_extrato',
  valor_referencia:1122.28,valor_pago:953.94,data_pagamento:'2026-11-18'},
  {id:'b',fornecedor_nome:'PARQUE',situacao:'aberto',valor_referencia:1478,valor_pago:null}];
 const rows=audit.currentBills(accounts,[],[],[]);
 assert.deepEqual(audit.counts(rows),{pago:1,aberto:1,revisar:0});
 assert.equal(rows.find(r=>r.id==='a').paidValue,953.94);
 assert.equal(rows.find(r=>r.id==='b').state,'aberto');
});
test('Boletos avulsos com mesmo fornecedor dependem de vínculo pelo ID',()=>{
 const docs=[{id:'1',fornecedor_nome:'PARQUE',valor_referencia:200},
 {id:'2',fornecedor_nome:'PARQUE',valor_referencia:200}];
 const links=[{boleto_avulso_id:'2',valor_pago:170,data_pagamento:'2026-11-19'}];
 const rows=audit.currentBills([],docs,links,[]);
 assert.equal(rows.find(r=>r.id==='1').state,'aberto');
 assert.equal(rows.find(r=>r.id==='2').state,'pago');
});
test('Auditoria atual lê fontes autorizadas, sem escrever dados financeiros',()=>{
 for(const source of [aUI,docs])assert.doesNotMatch(source,/db\.from\([^)]*\)\.(insert|update|upsert|delete)\(/);
 for(const source of ['fin_contas_pagar','fin_boletos_avulsos','fin_baixas_operacionais','fin_baixas_extrato_avulsos'])
  assert.ok(aUI.includes(source));
 assert.match(aUI,/fluxo_caixa_autorizado/);
 assert.match(html,/id="audit-live-bills"/);
 assert.match(nav,/frAuditCurrentUI\?\.refresh/);
});
test('A seleção dos 295 nomes potenciais usa as duas origens e permite revisar todos',()=>{
 for(const id of ['doc-supplier-chooser','doc-supplier-choice-list','doc-supplier-pick-all',
 'doc-supplier-pick-none','doc-supplier-pick-default','doc-supplier-choice-search'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(docs,/statusCore\.supplierCatalogue\(rows,registered\)/);
 assert.match(docs,/statusCore\.monthlySuppliers\(documents,year,selectedSuppliers\)/);
 assert.match(docs,/window\.localStorage/);
});
test('PIX e débito já conferidos podem ser recolhidos abaixo das exceções',()=>{
 const a=html.indexOf('Exceções de autopeças pagas após o vencimento');
 const b=html.indexOf('id="dc-pix-details"');
 assert.ok(a>=0&&b>a);assert.match(html,/<details class="fin-doc-pix-collapse" id="dc-pix-details">/);
});
test('Fatura é paga na aba Cartões e não exige abrir Autopeças',()=>{
 assert.doesNotMatch(html,/<h2>Faturas e pagamentos bancários<\/h2>/);
 assert.ok(!html.includes('id="vl-invoices"'));
 assert.match(cb,/Pagar fatura \/ adicionar pagamento/);
 const pay=cb.slice(cb.indexOf('async function openExisting'),cb.indexOf('function csvCell'));
 assert.match(pay,/frDocumentLinksUI\.openInvoice\(f.id\)/);
 assert.match(vl,/document\.body\.appendChild\(\$\('vl-dialog'\)\)/);
});
test('Faturas documentais ficam em Cartões com recarregamento ao abrir',()=>{
 const cards=html.indexOf('data-view-panel="cardbills"');
 const docs=html.indexOf('<h2>Faturas documentais por cartão e mês</h2>');
 const nextView=html.indexOf('<section class="view cl-view"',cards);
 assert.ok(cards>=0&&docs>cards&&docs<nextView);
 assert.match(nav,/frDocsReconcileUI\?\.refresh/);
});
test('Existe acesso direto às compras pendentes pelo identificador exato',()=>{
 assert.match(html,/id="dc-review-pending"/);assert.match(dc,/data-dc-review-auto/);
 assert.match(vl,/openAuto:openAutoFromReconciliation/);
 assert.match(dc,/openAuto\(button\.dataset\.dcReviewAuto\)/);
});
