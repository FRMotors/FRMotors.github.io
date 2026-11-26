'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const html=read('financeiro.html');
test('Consultas secundárias recolhidas, tabelas principais preservadas',()=>{
 for(const id of ['cp-manual-aux','cb-classification-collapse','cb-installments-collapse','cb-documents-collapse','doc-match-collapse','doc-card-meios-collapse','rg-secondary-collapse']){
  const tag=html.match(new RegExp('<details[^>]*id="'+id+'"[^>]*>'));
  assert.ok(tag,id);assert.doesNotMatch(tag[0],/\bopen\b/);
 }
 for(const id of ['cp-rows','cp-show-paid','op-manual-rows','cb-rows','cbcat-rows','pc-rows','dc-fatura-rows','doc-auto-total','doc-by-supplier-rows','doc-month-rows','rg-months','rg-cat-outbars','rg-cash-rows','dc-auto-rows','doc-card-rows'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.ok(html.indexOf('id="doc-auto-total"')<html.indexOf('id="doc-by-supplier-rows"'));
 assert.doesNotMatch(html.match(/<details id="doc-supplier-chooser"[^>]*>/)[0],/\bopen\b/);
});
test('Atalhos abrem consultas recolhidas e mantêm destinos corretos',()=>{
 const cat=read('financeiro-cartoes-categorias.js'),ui=read('financeiro-pro-ui.js');
 assert.match(cat,/cb-classification-collapse'\);if\(panel\)panel\.open=true/);
 assert.match(ui,/cb-installments-collapse'\);if\(section\)\{section\.open=true/);
 assert.match(ui,/p\.tagName==='DETAILS'\)p\.open=true/);
 assert.match(html,/data-view="cardbills">Abrir faturas/);
});
test('Todos os IDs únicos e cada rota principal mantida no menu',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 const menu=html.slice(html.indexOf('<aside class="sidebar"'),html.indexOf('</aside>'));
 for(const view of ['overview','forecast','reports','audit','payables','receivables','agenda','cardbills','expenses','imports','itau','history'])assert.equal((menu.match(new RegExp('data-view="'+view+'"','g'))||[]).length,1,view);
});