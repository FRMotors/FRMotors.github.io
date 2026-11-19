'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../financeiro-documentos-status-core.js');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'financeiro.html'),'utf8');
const documentsUI=fs.readFileSync(path.join(dir,'financeiro-documentos.js'),'utf8');
const reportsUI=fs.readFileSync(path.join(dir,'financeiro-relatorios-gerenciais.js'),'utf8');
const auditUI=fs.readFileSync(path.join(dir,'financeiro-central-auditoria.js'),'utf8');
const paymentUI=fs.readFileSync(path.join(dir,'financeiro-baixas-operacionais.js'),'utf8');
const part=(id,fornecedor,vencimento,valor,incluir=true)=>({id,grupo:'autopecas',fornecedor_nome:fornecedor,vencimento,
 data_evento:vencimento,valor_registrado:valor,incluir,situacao_origem:'A confirmar'});
const payable=(id,fornecedor,vencimento,valor,situacao='aberto',extra={})=>({id,fornecedor_nome:fornecedor,vencimento,
 valor_referencia:valor,situacao,valor_pago:null,data_pagamento:null,...extra});
test('PARQUE conciliado: o estado atual prevalece sobre A confirmar histórico',()=>{
 const docs=[part('A-CP26-0121','PARQUE','2026-11-18',1122.28)];
 const accounts=[payable('46344','PARQUE','2026-11-18',1122.28,'conciliado_extrato',
 {valor_pago:953.94,data_pagamento:'2026-11-18'})];
 const result=core.matchLiveDocs(docs,accounts);
 assert.equal(result.get('A-CP26-0121').status,'pago');
 assert.equal(result.get('A-CP26-0121').valuePaid,95394);
 assert.equal(result.get('A-CP26-0121').paidDate,'2026-11-18');
});
test('Pendente só aparece como aberto com compromisso individual e identificado',()=>{
 const result=core.matchLiveDocs([part('D','PARQUE','2026-11-20',1478)],
 [payable('C','PARQUE','2026-11-20',1478)]);
 assert.equal(result.get('D').status,'aberto');
});
test('Documentos excluídos não recebem baixa de outra carteira',()=>{
 const result=core.matchLiveDocs([part('excluded','PARQUE','2026-11-18',1122.28,false)],
 [payable('p','PARQUE','2026-11-18',1122.28,'conciliado_extrato')]);
 assert.equal(result.size,0);
});
test('Candidatos duplicados ou nomes diferentes não são marcados pagos por engano',()=>{
 const d=part('A','PARQUE','2026-11-18',1122.28);
 assert.equal(core.matchLiveDocs([d,d],[payable('P','PARQUE','2026-11-18',1122.28,'conciliado_extrato')]).size,0);
 assert.equal(core.matchLiveDocs([d],[payable('P','LOPES','2026-11-18',1122.28,'conciliado_extrato')]).size,0);
 assert.equal(core.matchLiveDocs([d],[payable('1','PARQUE','2026-11-18',1122.28,'conciliado_extrato'),
 payable('2','PARQUE','2026-11-18',1122.28,'conciliado_extrato')]).size,0);
});
test('Vencimento e valor exatos impedem vincular boleto de outra parcela',()=>{
 const d=part('A','PARQUE','2026-11-18',1122.28);
 assert.equal(core.matchLiveDocs([d],[payable('P','PARQUE','2026-11-19',1122.28,'conciliado_extrato')]).size,0);
 assert.equal(core.matchLiveDocs([d],[payable('P','PARQUE','2026-11-18',1122.29,'conciliado_extrato')]).size,0);
});
test('Conserva centavos e acentuação equivalente na identidade de fornecedor',()=>{
 assert.equal(core.cents(0.1)+core.cents(0.2),30);
 assert.equal(core.matchLiveDocs([part('D','ÓTIMA PEÇAS','2026-10-12',150)],
 [payable('P','OTIMA PECAS','2026-10-12',150,'conciliado_extrato')]).get('D').status,'pago');
});
test('Comparativo 2025/2026 usa documentos para ambos os anos sem inventar caixa',()=>{
 const docs=[part('1','PARQUE','2025-05-08',120),part('2','PARQUE','2026-05-08',180)];
 const bills=[{id:'1',mes_fatura:'2025-02-01',valor_documental:500},
 {id:'2',mes_fatura:'2026-02-01',valor_documental:750}];
 const result=core.annualDocuments(docs,bills,2026);
 assert.equal(result.parts.prior,12000);
 assert.equal(result.parts.current,18000);
 assert.equal(result.bills.prior,50000);
 assert.equal(result.bills.current,75000);
});
test('Ano mensal de cada fornecedor totaliza exatamente os documentos incluídos',()=>{
 const docs=[part('1','PARQUE','2025-01-08',100),
 part('2','PARQUE','2025-02-08',150),
 part('3','PARQUE','2026-01-08',300),
 part('4','LOPES','2025-01-08',80),part('excluded','LOPES','2025-01-08',1000,false)];
 const rows=core.monthlySuppliers(docs,2025);
 assert.equal(rows.length,2);
 assert.equal(rows[0].name,'PARQUE');
 assert.equal(rows[0].months[0],10000);
 assert.equal(rows[0].months[1],15000);
 assert.equal(rows[0].total,25000);
 assert.equal(rows[1].total,8000);
 assert.equal(rows.reduce((s,r)=>s+r.total,0),33000);
});
test('Painéis de comparativo anual e fornecedor estão na interface',()=>{
 for(const id of ['rg-auto-current','rg-auto-prev','rg-card-current','rg-card-prev',
  'doc-annual-suppliers','doc-by-supplier-year','doc-by-supplier-rows','doc-by-supplier-export'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('financeiro-documentos-status-core.js')<html.indexOf('financeiro-documentos.js'));
 assert.ok(html.indexOf('financeiro-documentos-status-core.js')<html.indexOf('financeiro-relatorios-gerenciais.js'));
});
test('Documentos se atualizam pelo operacional e não alteram cadastro nem parcelas',()=>{
 assert.match(documentsUI,/statusCore\.matchLiveDocs\(rows,accounts\)/);
 assert.match(documentsUI,/fetchAccounts/);
 assert.match(documentsUI,/Original da planilha/);
 assert.match(documentsUI,/Incluído no controle/);
 assert.doesNotMatch(documentsUI,/\.update\(/);
 assert.doesNotMatch(documentsUI,/\.insert\(/);
 assert.match(paymentUI,/window\.frDocumentsUI\?\.refresh\?\.\(\)/);
});
test('Auditoria identifica conciliação de extrato e mostra situação vigente',()=>{
 assert.match(auditUI,/Boleto conciliado com extrato/);
 assert.match(auditUI,/payableMap\.has\(e\.compromissoId\)/);
 assert.match(auditUI,/Situação atual/);
 assert.match(paymentUI,/window\.frAuditUI\?\.refresh\?\.\(\)/);
 assert.match(reportsUI,/docCore\?\.annualDocuments\(parts,bills,year\)/);
});
