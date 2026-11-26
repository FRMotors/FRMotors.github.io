'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Seleção em lote preserva páginas, não duplica IDs, limita a 100 e exclui registros fora do filtro',()=>{
 const window={};vm.runInNewContext(read('financeiro-classificacao-lote.js'),{window});
 const s=window.frBatchClassification.__test.createSelection(),rows=Array.from({length:101},(_,i)=>({id:String(i)}));
 assert.ok(s.add(rows.slice(0,20)));assert.ok(s.add(rows.slice(10,40)));assert.equal(s.selected.size,40);
 assert.equal(s.add(rows),false);assert.equal(s.selected.size,40);
 s.prune(rows.slice(20));assert.equal(s.selected.size,20);s.clear();assert.equal(s.selected.size,0);
});
test('Três telas reutilizam o controlador e um RPC de lote',()=>{
 for(const file of ['financeiro-cartoes-categorias.js','financeiro-classificacao.js','financeiro-import-categorias.js'])assert.match(read(file),/frBatchClassification\?\.create/);
 assert.match(read('financeiro-classificacao-lote.js'),/db\.rpc\('fin_classificar_despesas_lote'/);
 assert.match(read('financeiro-classificacao-lote.js'),/preview\.map\(config\.payload\)/);
});
test('Atalho seleciona no máximo 100 pendentes e exclui compras completas',()=>{
 const s=read('financeiro-classificacao-lote.js');assert.match(s,/filtered\.filter\(config\.isPending\)/);assert.match(s,/sel\.add\(rows\.slice\(0,LIMIT\)\)/);assert.match(s,/data\.alterados===0/);
});
