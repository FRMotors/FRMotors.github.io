'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'financeiro.html'),'utf8');
const script=fs.readFileSync(path.join(root,'financeiro-historico.js'),'utf8');
const importer=fs.readFileSync(path.join(root,'financeiro-import.js'),'utf8');
test('O motor de cálculo carrega antes da tela Itaú com defer',()=>{
 const core=html.indexOf('financeiro-itau-core.js');
 const history=html.indexOf('financeiro-historico.js');
 assert.ok(core>0&&history>core,'ordem dos scripts incorreta');
 assert.match(html,/financeiro-itau-core\.js[^"]*" defer><\/script>/);
 assert.match(html,/financeiro-historico\.js[^"]*" defer><\/script>/);
});
test('A página Itaú mantém avisos de prévia e rastreabilidade',()=>{
 assert.match(html,/id="hist-itau-data-sources"/);
 assert.match(html,/id="hist-itau-reconcile-diff"/);
 assert.match(html,/id="hist-itau-reconcile-rows"/);
});
test('A conciliação usa o motor testado e valida o fechamento antes de calcular',()=>{
 assert.match(script,/core\.ensureSnapshotMatches\(/);
 assert.match(script,/core\.canonicalBank\(/);
 assert.match(script,/core\.reconcile\(/);
 assert.match(script,/core\.compareBankReference\(/);
 assert.match(script,/core\.buildMonthly\(/);
 assert.doesNotMatch(script,/function uniqueBankMovements\(/);
 assert.doesNotMatch(script,/function overlappingImports\(/);
});
test('Falhas de conciliação não são ocultadas pela mensagem de sucesso',()=>{
 assert.match(script,/throw e;/);
 assert.match(script,/Falha de conciliação/);
 assert.match(script,/Não foi possível atualizar o Itaú/);
 assert.match(script,/weakMatches/);
});
test('Nova importação do Itaú solicita atualização do relatório',()=>{
 assert.match(importer,/bankItau\?\(window\.frHistoryUI\?\.refresh\?\.\(\)/);
 assert.match(importer,/updates\[3\]\?\.status==='rejected'/);
});

test('Conciliação do Itaú respeita aprovações de pares, sem confundir com saldo bancário',()=>{
 assert.match(script,/fin_conciliacao_confirmacoes/);
 assert.match(script,/core\.reviewWeakMatches\(rec\.weakMatches,confirmations\)/);
 assert.match(script,/state\.weakMatchCount=waiting\.length/);
 assert.match(script,/state\.approvedMatchCount=approved\.length/);
 assert.match(script,/badge:isApproved\(r\)\?'confirmed':'review'/);
 assert.match(script,/check\?\.status!=='conferido'\|\|state\.weakMatchCount>0/);
});
test('Histórico mensal substitui menu duplicado e prévia de quarenta movimentos',()=>{
 assert.doesNotMatch(html,/> Movimentações oficiais<\/button>/);
 assert.doesNotMatch(html,/id="hist-itau-transactions"/);
 assert.match(html,/id="hist-itau-mensal"/);
 assert.match(html,/data-view-panel="movements"/); // View fica preservada para integrações existentes.
 assert.doesNotMatch(script,/fetchTransactions\(/);
 assert.match(script,/window\.frItauMonthsUI\?\.refresh\?\.\(/);
});
