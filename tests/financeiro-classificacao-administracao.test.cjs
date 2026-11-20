'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('financeiro.html');
const nav=read('financeiro-pro-ui.js');
const classify=read('financeiro-classificacao.js');

test('Carteira histórica foi renomeada sem alterar seu identificador funcional',()=>{
 assert.match(html,/data-view="expenses"[^>]*>[^\n]*Autopeças e compras<\/button>/);
 assert.match(html,/<h1 class="page-heading">Autopeças e compras<\/h1>/);
 assert.match(html,/data-view-panel="expenses" hidden/);
 assert.match(nav,/expenses:'Autopeças e compras'/);
 assert.doesNotMatch(html,/>Autopeças e cartões<\/button>/);
});
test('Classificar despesas integra o painel Administração sem duplicar tela nem diálogo',()=>{
 const imports=html.indexOf('data-view-panel="imports"');
 const classifyAccordion=html.indexOf('id="imports-classificacao"');
 const importForm=html.indexOf('id="import-file"');
 assert.ok(imports>0&&classifyAccordion>imports&&importForm>classifyAccordion);
 assert.match(html,/id="imports-classificacao"[\s\S]*?<summary><span>Classificar despesas<\/span>/);
 assert.equal((html.match(/id="cl-rows"/g)||[]).length,1);
 assert.equal((html.match(/id="cl-dialog"/g)||[]).length,1);
 assert.equal((html.match(/id="cl-form"/g)||[]).length,1);
 assert.equal((html.match(/data-view-panel="classify"/g)||[]).length,0);
 assert.doesNotMatch(html,/<button[^>]*data-view="classify"[^>]*>[^\n]*Classificar despesas<\/button>\s*<button[^>]*data-view="expenses"/);
});
test('Atalhos legados da classificação navegam para Administração e abrem painel',()=>{
 assert.match(html,/data-view="classify"[^>]*>[^\n]*Classificar despesas<\/button>/);
 assert.match(nav,/const classificationRequested=next==='classify'/);
 assert.match(nav,/if\(classificationRequested\)\{[\s\S]*?next='imports'/);
 assert.match(nav,/requestedView==='classify'\?'imports'/);
 assert.match(nav,/byId\('imports-classificacao'\)\?\.scrollIntoView/);
 assert.match(nav,/byId\('imports-classificacao'\)\?\.addEventListener\('toggle'/);
});
test('Classificação recarrega em Administração aberta e mantém RPC auditada',()=>{
 assert.match(nav,/if\(next==='imports'&&byId\('imports-classificacao'\)\?\.open\)window\.frClassificationUI/);
 assert.match(classify,/\[data-view-panel="imports"\]/);
 assert.match(classify,/getElementById\('imports-classificacao'\)\?\.open\)refresh\(\)/);
 assert.match(classify,/fin_extrato_categoria_editar|fin_movimento_classificar|fin_extrato_classificar/);
});
test('Navegação continua com ids HTML únicos e abas originais',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const tab of ['overview','imports','reports','expenses','cardbills','payables']){
  assert.match(html,new RegExp('data-view-panel="'+tab+'"'));
 }
});
