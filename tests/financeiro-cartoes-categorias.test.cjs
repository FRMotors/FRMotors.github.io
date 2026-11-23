'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('financeiro.html'),ui=read('financeiro-cartoes-categorias.js');
const sql=read('sql/migrations/20261123_classificar_compras_cartoes_com_auditoria.sql');
test('a área Cartões permite classificar por mês e fonte sem lançar pagamentos',()=>{
 for(const id of ['cbcat-panel','cbcat-source','cbcat-year','cbcat-month','cbcat-card',
  'cbcat-category','cbcat-status-filter','cbcat-search','cbcat-rows','cbcat-dialog',
  'cbcat-edit-value','cbcat-edit-save','cbcat-breakdown','cbcat-unclassified'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/option value="planilha">Histórico da planilha/);
 assert.match(html,/option value="importado">Faturas importadas/);
 assert.match(html,/Classificar compras/);
 assert.match(html,/financeiro-cartoes-categorias\.js\?v=/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(v=>v[1]);
 assert.equal(ids.length,new Set(ids).size);
});
test('fontes não são somadas entre si, e a classificação não cria entrada de caixa',()=>{
 assert.match(ui,/x\.origem===values\('cbcat-source'\)/);
 assert.match(ui,/if\(x\.origem!==source\)return false/);
 assert.match(ui,/if\(month!=='todos'&&x\.mes!==month\)return false/);
 assert.match(ui,/cbcat-breakdown/);
 assert.match(ui,/cbcat-status-filter/);
 assert.match(ui,/db\.rpc\('fin_cartao_categoria_definir'/);
 assert.doesNotMatch(ui,/db\.from\('fin_movimentos'\)/);
 assert.doesNotMatch(ui,/db\.from\('fin_documentos_despesas'\)\.update/);
});
test('modal salva somente categoria com compare-and-swap',()=>{
 assert.match(ui,/p_categoria_esperada:row\.categoria/);
 assert.match(ui,/p_lancamento_id:row\.id/);
 assert.match(ui,/p_origem:row\.origem/);
 assert.match(sql,/v_antes is distinct from p_categoria_esperada/);
 assert.match(sql,/for update/);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/);
});
test('SQL exige acesso autorizado e audita as duas origens',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.fluxo_caixa_autorizado\(\)/);
 assert.match(sql,/grupo='cartoes' and incluir=true/);
 assert.match(sql,/update public\.fin_teste_cartao_lancamentos\s+set categoria=v_categoria/);
 assert.match(sql,/fin_cartoes_categorias_eventos/);
 assert.match(sql,/fin_teste_import_auditoria/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke execute on function public\.fin_cartao_categoria_definir/);
 assert.match(sql,/grant execute on function public\.fin_cartao_categoria_definir/);
 assert.doesNotMatch(sql,/update\s+public\.fin_documentos_despesas/i);
 assert.doesNotMatch(sql,/insert\s+into\s+public\.fin_movimentos/i);
});
test('identificação de categorias genéricas',()=>{
 const fake={frCardNames:{canonical:v=>v}};
 const doc={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(ui,{window:fake,document:doc,Intl,Map,Set,Number,String,Promise});
 const generic=fake.frCardCategoriesUI.__test.generic;
 assert.equal(generic(null),true);
 assert.equal(generic('COMPRAS NO CARTÃO'),true);
 assert.equal(generic('SEM CATEGORIA'),true);
 assert.equal(generic('AUTOPEÇAS'),false);
 assert.equal(generic('DESPESAS DA OFICINA'),false);
});
test('sistema carrega a classificação quando o usuário abre Cartões',()=>{
 assert.match(read('financeiro-pro-ui.js'),/window\.frCardCategoriesUI\?\.refresh\?\.\(\)/);
});
