'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Busca do caixa aceita centavos brasileiros, formato decimal, moeda, data e acentos',()=>{
 const window={};vm.runInNewContext(read('financeiro-detalhamento-caixa.js'),{window,document:{readyState:'loading',addEventListener(){}},Intl,Date});
 const search=window.frCashDetailUI.__test.matchesQuery;
 const row={descricao:'Aquisição de peças',categoria:'FORNECEDORES',data_movimento:'2026-11-26',valor:1731.66};
 for(const q of ['1731.66','1731,66','1.731,66','R$ 1.731,66','aquisicao','26/11/2026'])assert.ok(search(row,q),q);
 assert.equal(search(row,'9999,99'),false);
});
test('Atalhos de agenda, central e projeção encaminham identificador do documento',()=>{
 assert.match(read('financeiro-agenda-faturas.js'),/focusRecord\?\.\(showParcel\.dataset\.agShowParcel\)/);
 assert.match(read('financeiro-central-vencimentos.js'),/focusRecord\?\.\(button\.dataset\.cvId\)/);
 assert.match(read('financeiro-projecao-caixa.js'),/focusRecord\?\.\(button\.dataset\.fcId\)/);
});