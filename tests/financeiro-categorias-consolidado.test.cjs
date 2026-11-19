'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../financeiro-categorias-consolidado.js');
const bank=(id,file,date,type,amount,description,extra={})=>({
 id,importId:file,fileCreated:file==='a'?'2026-11-16T09:00:00':'2026-11-18T09:00:00',
 date,type,value:amount,bankDescription:description,description,category:'EXTRATO BANCÁRIO',
 account:'Itaú',manual:false,source:'Extrato importado',...extra
});
const official=[
 {id:'o1',date:'2026-11-11',type:'entrada',value:50000,description:'VENDA',category:'VENDAS',source:'Caixa homologado'},
 {id:'o2',date:'2026-11-12',type:'saida',value:560,description:'PÃO',category:'CAFÉ DA MANHÃ',source:'Caixa homologado'}
];
test('Consolida homologados e apenas lançamentos novos após o fechamento',()=>{
 const entries=[
  bank('b1','a','2026-11-11','entrada',50000,'PIX RECEBIDO'),
  bank('b2','a','2026-11-12','saida',560,'PAGAMENTOS MARLI CPF 113.624.818-82'),
  bank('b3','a','2026-11-12','entrada',50000,'PIX RECEBIDO FRED'),
  bank('b4','b','2026-11-13','saida',990,'PAGAMENTO LOJA')
 ];
 const r=core.combineSources(official,entries);
 assert.equal(r.cutoff,'2026-11-12');
 assert.equal(r.ignoredBeforeCutoff,1);
 assert.equal(r.matchedOnCutoff,1);
 assert.equal(r.weakMatches.length,1);
 assert.equal(r.addedCount,2);
 assert.equal(r.rows.length,4);
 assert.equal(r.addedIncoming,50000);
 assert.equal(r.addedOutgoing,990);
 assert.equal(r.rows.find(x=>x.id==='o2').category,'CAFÉ DA MANHÃ');
});
test('Duas compras idênticas no mesmo PDF são dois pagamentos',()=>{
 const imports=[
  bank('b1','a','2026-11-18','saida',2500,'PIX ENVIADO FORNECEDOR'),
  bank('b2','a','2026-11-18','saida',2500,'PIX ENVIADO FORNECEDOR'),
  bank('b3','b','2026-11-18','saida',2500,'PIX ENVIADO FORNECEDOR')
 ];
 const r=core.combineSources(official,imports);
 assert.equal(r.repeatedInPDFs,1);
 assert.equal(r.addedCount,2);
});
test('Mesmo CPF e valor em PDFs repetidos não geram despesas adicionais',()=>{
 const imports=[
  bank('a1','a','2026-11-18','saida',10000,'PIX ENVIADO JOÃO 123.456.789-00'),
  bank('b1','b','2026-11-18','saida',10000,'PIX ENVIADO JOAO CPF 123.456.789-00')
 ];
 const r=core.combineSources(official,imports);
 assert.equal(r.repeatedInPDFs,1);
 assert.equal(r.addedCount,1);
});
test('Cópia reclassificada manualmente ganha preferência entre PDFs repetidos',()=>{
 const imports=[
  bank('old','a','2026-11-18','saida',12000,'PIX ENVIADO CPF 123.456.789-00'),
  bank('new','b','2026-11-18','saida',12000,'PIX ENVIADO CPF 123.456.789-00',
   {manual:true,category:'PRÓ-LABORE',description:'Pró-labore mensal'})
 ];
 const r=core.combineSources(official,imports);
 assert.equal(r.addedCount,1);
 assert.equal(r.rows.at(-1).category,'PRÓ-LABORE');
});
test('Movimentos iguais de contas diferentes são mantidos',()=>{
 const a=bank('a','a','2026-11-18','saida',5000,'PIX ENVIADO A');
 const b=bank('b','b','2026-11-18','saida',5000,'PIX ENVIADO A',{account:'Sicoob'});
 const r=core.combineSources(official,[a,b]);
 assert.equal(r.addedCount,2);
});
test('Reconciliação do dia do fechamento compara ocorrências individualmente',()=>{
 const docs=[
  bank('a','a','2026-11-12','saida',560,'PÃO'),
  bank('b','a','2026-11-12','saida',560,'BOLETO DIFERENTE'),
  bank('c','a','2026-11-12','saida',560,'BOLETO DIFERENTE 2')
 ];
 const r=core.combineSources(official,docs);
 assert.equal(r.matchedOnCutoff,1);
 assert.equal(r.weakMatches.length,0);
 assert.equal(r.addedCount,2);
});
test('Na ausência de descrição equivalente, vínculo fica sinalizado para conferir',()=>{
 const r=core.combineSources(official,[bank('x','a','2026-11-12','saida',560,'TRANSFERÊNCIA XPTO')]);
 assert.equal(r.matchedOnCutoff,1);
 assert.equal(r.weakMatches.length,1);
 assert.equal(r.addedCount,0);
});
test('Consolidado preserva entradas e categorias do caixa homologado',()=>{
 const r=core.combineSources(official,[
  bank('old','a','2026-11-11','entrada',50000,'PIX RECEBIDO COM CLASSIFICAÇÃO DIFERENTE',{manual:true,category:'OUTRAS RECEITAS'})
 ]);
 assert.deepEqual(r.rows,official);
 assert.equal(r.addedCount,0);
 assert.equal(r.ignoredBeforeCutoff,1);
});
test('Importação incompleta interrompe cálculo consolidado',()=>{
 assert.throws(()=>core.combineSources(official,[
  bank('x','a','2026-11-18','saida',1000,'',{importId:''})
 ]),/Extrato sem dados/);
});
test('Ausência de caixa homologado não inventa fechamento',()=>{
 const r=core.combineSources([],[bank('x','a','2026-11-18','entrada',1500,'PIX RECEBIDO')]);
 assert.equal(r.cutoff,null);
 assert.equal(r.addedCount,1);
 assert.equal(r.rows.length,1);
});
