'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const win={};
const ctx=vm.createContext({window:win,document:{readyState:'loading',addEventListener(){},getElementById(){return null}},Intl,Map,Set,Date});
for(const p of ['financeiro-agenda-boletos-core.js','financeiro-faturas-estado-core.js','financeiro-projecao-caixa.js'])vm.runInContext(read(p),ctx);
const forecast=win.frForecastUI.__test;
const source=read('financeiro-resumo-operacional.js').replace('window.frRealDashboard={refresh,__test:{monthShift,monthlyWindow,compareMonths,effectiveAccounts,effectiveInvoices}};','window.frRealDashboard={refresh,__test:{effectiveAccounts,effectiveInvoices,seed(a,b,p,v){accounts=a;manualBills=b;installmentBills=p;supplierNames=v;}}};');
vm.runInContext(source,ctx);
const dashboard=win.frRealDashboard.__test;
const vendors=new Map([['f','PARQUE']]);
const make=(id,status,forma='boleto')=>({id,numero:1,compra_id:'c',vencimento:'2026-12-10',valor_cheio:125.55,status,fin_compras:{id:'c',fornecedor_id:'f',descricao:'Compra',forma_pagamento:forma}});
test('Visão geral e projeção incluem exatamente as mesmas parcelas abertas, sem somar pagos, cancelados ou cartões',()=>{
 const a=[{id:'a',situacao:'aberto',valor_referencia:100,vencimento:'2026-12-05',fornecedor_nome:'A'}];
 const b=[{id:'b',valor_referencia:200,vencimento:'2026-12-05',fornecedor_nome:'B'}];
 const p=[make('p','aberto'),make('p','aberto'),make('paid','pago'),make('cancel','cancelado'),make('card','aberto','cartao_credito')];
 dashboard.seed(a,b,p,vendors);
 const rows=dashboard.effectiveAccounts(),projected=forecast.assemble(a,b,[],[],[],p,vendors);
 assert.equal(rows.length,3);assert.equal(projected.length,3);
 assert.equal(rows.reduce((s,x)=>s+Math.round(x.valor_referencia*100),0),42555);
 assert.equal(forecast.compute(projected,'2026-11-26',30).pay,42555);
 assert.equal(projected.find(x=>x.source==='parcela').name,'PARQUE');
});
test('Histórico da projeção usa exclusivamente movimentos homologados e confirmados',()=>{
 const move=(origem,estado,valor,tipo='saida')=>({origem,estado,valor,tipo,data_movimento:'2026-11-20'});
 const h=forecast.history([move('app','confirmado',100),move('extrato_itau_homologado','confirmado',100),move('fluxo_caixa_homologado','confirmado',200,'entrada'),move('fluxo_caixa_homologado','cancelado',100)],'2026-11-26',30);
 assert.equal(h.count,2);assert.equal(h.outValue,10000);assert.equal(h.net,10000);
});
test('Faturas quitadas, pagamentos parciais e integrais usam o mesmo motor na projeção e na agenda',()=>{
 const invoices=[{id:'f',cartao_nome:'BRADESCO PRIME',mes_fatura:'2026-11-01',valor_documental:1000},{id:'q',cartao_nome:'SICOOB',valor_documental:500}];
 const r=forecast.cardPending(invoices,[{fatura_id:'q'}],[{fatura_id:'f',valor_pago:250}],[],[{fatura_id:'f',vencimento:'2026-12-05'}]);
 assert.equal(r.length,1);assert.equal(r[0].amount,75000);assert.equal(r[0].due,'2026-12-05');
 const f=forecast.cardPending(invoices,[{fatura_id:'q'}],[{fatura_id:'f',valor_pago:250}],[{fatura_id:'f',valor_conferido:1000}],[]);
 assert.equal(f.length,0);
});