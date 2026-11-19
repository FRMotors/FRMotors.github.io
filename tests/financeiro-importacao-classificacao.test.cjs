'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../financeiro-import.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../financeiro.html'),'utf8');
const sql=fs.readFileSync(path.resolve(__dirname,'../sql/migrations/20261119_classificacao_individual_extratos.sql'),'utf8');
const marker='window.frImportUI={refresh,parseCSV,parseOFX,numMoney,dateISO};';
assert.ok(source.includes(marker),'Ponto de teste do importador não encontrado');
const sandbox={
 window:{},
 document:{readyState:'loading',addEventListener(){}},
};
vm.runInNewContext(source.replace(marker,
 'window.__testImport={importDefaultCategory,importPersonalName,importCategory,importLabelError,importPayloadRow,duplicateKey};\n'+marker),
 sandbox,{filename:'financeiro-import.js'});
const h=sandbox.window.__testImport;
const baseline={
 date:'2026-11-19',desc:'PIX ENVIADO FULANO DE TAL 123.456.789-00',
 nature:'saida',valor:500,customDesc:'',category:h.importDefaultCategory('saida'),categoryEdited:false
};
test('todas as naturezas recebem categoria inicial não vazia',()=>{
 for(const type of ['entrada','saida','compra','estorno']){
  const cat=h.importDefaultCategory(type);
  assert.equal(typeof cat,'string');assert.ok(cat.length>=2);
 }
});
test('o usuário pode atribuir nome Pró-labore e categoria personalizada sem alterar a origem',()=>{
 const row={...baseline,customDesc:'  Pró-labore mensal  ',category:'PRÓ-LABORE',categoryEdited:true};
 const payload=h.importPayloadRow(row,'abc123');
 assert.equal(payload.descricao,baseline.desc);
 assert.equal(payload.descricao_personalizada,'Pró-labore mensal');
 assert.equal(payload.categoria,'PRÓ-LABORE');
 assert.equal(payload.categoria_manual,true);
 assert.equal(h.importLabelError(row),'');
});
test('um lançamento não editado conserva descrição e permite regras existentes',()=>{
 const p=h.importPayloadRow(baseline,'hash');
 assert.equal(p.descricao,baseline.desc);
 assert.equal(p.descricao_personalizada,null);
 assert.equal(p.categoria,'EXTRATO BANCÁRIO');
 assert.equal(p.categoria_manual,false);
});
test('categoria é obrigatória e nomes inválidos impedem importação',()=>{
 assert.match(h.importLabelError({...baseline,category:'  '}),/categoria/);
 assert.match(h.importLabelError({...baseline,customDesc:'X'}),/nome personalizado/);
 assert.match(h.importLabelError({...baseline,category:'X'}),/categoria/);
 assert.equal(h.importLabelError({...baseline,category:'FORNECEDORES'}),'');
});
test('editar apelido ou categoria não afeta chave de repetição do extrato',()=>{
 const oldKey=h.duplicateKey(baseline);
 const edited={...baseline,customDesc:'Pró-labore',category:'PRÓ-LABORE',categoryEdited:true};
 assert.equal(h.duplicateKey(edited),oldKey);
 assert.ok(oldKey.includes('2026-11-19|saida|50000|doc:12345678900'));
});
test('a interface oferece categorias de Pró-labore e outras opções',()=>{
 assert.match(html,/id="import-category-options"/);
 assert.match(html,/value="PRÓ-LABORE"/);
 assert.match(html,/Categoria \(editável\)/);
 assert.match(source,/data-import-category/);
 assert.match(source,/data-import-label/);
});
test('o servidor preserva descrição bancária para auditoria e deduplicação',()=>{
 assert.match(sql,/descricao,descricao_personalizada,categoria_personalizada,valor,natureza/);
 assert.match(sql,/v_descricao_destino:=coalesce\(v_descricao_personalizada,v_descricao\)/);
 assert.match(sql,/public\.fin_chave_descricao_financeira\(registro\.descricao\)/);
});
test('regras de PIX não sobrescrevem classificação manual',()=>{
 assert.match(sql,/if user_desc is not null or user_category is not null then return false; end if;/);
});
test('categorias aparecem no cartão importado e não ficam só na tela de prévia',()=>{
 assert.match(sql,/data_lancamento,descricao,natureza,valor,categoria\)/);
 assert.match(source,/\.select\('id,importacao_id,cartao_nome,data_lancamento,descricao,categoria,natureza,valor'\)/);
 assert.match(html,/<th>Cartão<\/th><th>Categoria<\/th>/);
});
