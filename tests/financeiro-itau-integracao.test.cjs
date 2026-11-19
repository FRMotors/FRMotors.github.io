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
});
