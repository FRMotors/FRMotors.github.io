'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const html=read('financeiro.html');
const migrations=read('sql/migrations/20261120_estabilizar_financeiro_legado_indices.sql');
const nav=read('financeiro-pro-ui.js');
const payments=read('financeiro-vinculos-faturas.js');
const importJs=read('financeiro-import.js');

test('Importações não possuem mais opção de criar pagamento financeiro de teste',()=>{
 for(const id of ['invoice-register-manual','invoice-apply-bank','invoice-save-total','invoice-list'])
  assert.ok(!html.includes('id="'+id+'"'),id+' não deveria estar acessível');
 assert.doesNotMatch(html,/<script[^>]+src="\.\/financeiro-faturas\.js/);
 assert.match(html,/id="imports-faturas"/);
 assert.match(html,/A antiga rotina de registro de pagamentos no caixa de testes foi desativada/);
 assert.match(html,/id="import-card-rows"/);
 assert.match(html,/id="import-card-summary"/);
 assert.match(html,/data-view="cardbills">Abrir Cartões e pagamentos/);
});
test('Pagamentos oficiais seguem em Cartões e com verificações de autorização',()=>{
 assert.match(html,/data-view-panel="cardbills"/);
 assert.match(html,/id="cb-rows"/);
 assert.match(payments,/frDocumentLinksUI=\{refresh,openInvoice/);
 assert.match(payments,/\.rpc\('fluxo_caixa_autorizado'\)/);
 assert.match(nav,/if\(next==='cardbills'\)/);
});
test('Scripts preservam importação técnica e sem duplicação de ids',()=>{
 assert.match(importJs,/fin_teste_guardar_pagamentos_fatura/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs HTML duplicados');
 assert.match(html,/data-view-panel="agenda"/);
 assert.match(html,/data-view-panel="imports"/);
});
test('Regras de banco desativam o legado e preservam função de pagamento oficial',()=>{
 for(const name of ['fin_teste_definir_fatura','fin_teste_conciliar_fatura',
  'fin_teste_desvincular_fatura','fin_teste_registrar_pagamento_fatura','crm_recuperacao_log'])
  assert.match(migrations,new RegExp('REVOKE EXECUTE ON FUNCTION public\\.'+name+'\\('));
 assert.doesNotMatch(migrations,/REVOKE EXECUTE ON FUNCTION public\.fin_fatura_registrar_pagamento_parcial/);
 assert.doesNotMatch(migrations,/DELETE FROM public\./i);
 assert.doesNotMatch(migrations,/TRUNCATE /i);
 const indexes=[...migrations.matchAll(/CREATE INDEX IF NOT EXISTS /g)];
 assert.equal(indexes.length,7);
});
test('Página continua com breakpoint mobile e atalhos do menu da agenda',()=>{
 assert.match(html,/@media\(max-width:620px\)/);
 assert.match(html,/Abrir Agenda Financeira/);
 assert.match(html,/data-view-panel="agenda"/);
});
