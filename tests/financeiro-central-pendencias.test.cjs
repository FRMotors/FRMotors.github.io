'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Pendências por natureza e data não misturam compromissos',()=>{
 const window={};vm.runInNewContext(read('financeiro-pendencias.js'),{window,document:{readyState:'loading',addEventListener(){},getElementById(){return null}},Intl,Date});
 const rows=[{kind:'boleto',vencimento:'2026-11-25',rest:10000},{kind:'cartao',vencimento:null,rest:20000},{kind:'receber',vencimento:'2026-11-25',rest:30000},{kind:'cartao',vencimento:'2026-11-26',rest:40000},{kind:'boleto',vencimento:'2026-11-30',rest:50000}];
 const r=window.frPendingUI.summarizeAgenda(rows,'2026-11-26');
 assert.equal(r['bills-late'].count,1);assert.equal(r['bills-late'].amount,10000);
 assert.equal(r['card-undated'].count,1);assert.equal(r['card-late'].count,0);
 assert.equal(r['receive-late'].amount,30000);assert.equal(r.today.count,1);
});
test('Cada pendência possui destino e fonte e a consulta não altera registros',()=>{
 const html=read('financeiro.html'),src=read('financeiro-pendencias.js');
 for(const key of ['bills-late','receive-late','card-late','today','bill-undated','card-undated','receive-undated','itau-new','itau-review','cash-category','card-planilha','card-importado'])assert.match(html,new RegExp('data-fp-action="'+key+'"'));
 assert.match(src,/state==='error'\?'Indisp\.'/);
 assert.doesNotMatch(src,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
 assert.match(read('financeiro-agenda-faturas.js'),/filter==='hoje'&&f.vencimento!==day/);
 assert.match(read('financeiro-historico.js'),/publish\('itau',null\)/);
});