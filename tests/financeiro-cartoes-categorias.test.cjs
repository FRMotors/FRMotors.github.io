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
  'cbcat-edit-value','cbcat-edit-finalidade','cbcat-purpose-filter','cbcat-purpose-pending',
  'cbcat-edit-save','cbcat-breakdown','cbcat-unclassified'])
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
 assert.match(ui,/db\.rpc\('fin_cartao_classificacao_salvar'/);
 assert.doesNotMatch(ui,/db\.from\('fin_movimentos'\)/);
 assert.doesNotMatch(ui,/db\.from\('fin_documentos_despesas'\)\.update/);
});
test('modal salva categoria e finalidade com compare-and-swap',()=>{
 assert.match(ui,/p_categoria_esperada:row\.categoria/);
 assert.match(ui,/p_finalidade_esperada:row\.finalidade/);
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

test('pesquisa monetária reconhece vírgula, milhar e prefixo R$',()=>{
 const fake={frCardNames:{canonical:v=>v}};
 const doc={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(ui,{window:fake,document:doc,Intl,Map,Set,Number,String,Promise});
 const cents=fake.frCardCategoriesUI.__test.priceCents;
 assert.equal(cents('150,00'),15000);
 assert.equal(cents('R$ 150,00'),15000);
 assert.equal(cents('1250.50'),125050);
 assert.equal(cents('1250,50'),125050);
 assert.equal(cents('1.250,50'),125050);
 assert.equal(cents('R$ 1.250,50'),125050);
 assert.equal(cents('1,250.50'),125050);
 assert.equal(cents('1.250'),125000);
 assert.equal(cents('R$ -45,90'),-4590);
 assert.equal(cents('autopeças'),null);
});
test('botão Categorizar abre dialog a partir da tabela e pesquisa filtra por preço',async()=>{
 const elements=new Map(),events=new Map();
 function el(id){
  if(!elements.has(id)){
   const listeners=new Map();
   const fake={id,value:'todos',textContent:'',innerHTML:'',disabled:false,open:false,
    classList:{toggle(){},add(){},remove(){}},
    contains(){return true},
    addEventListener(name,fn){listeners.set(name,fn)},
    trigger(name,arg){const fn=listeners.get(name);if(!fn)throw Error('listener ausente '+id+'/'+name);return fn(arg)},
    focus(){},
    showModal(){this.open=true;this.showModalCount=(this.showModalCount||0)+1},
    close(){this.open=false},
   };
   elements.set(id,fake);
  }
  return elements.get(id);
 }
 const doc={readyState:'complete',getElementById:el,
  querySelector(){return {hidden:true}},
  addEventListener(name,fn,capture){events.set(name+(capture?':capture':''),fn)}
 };
 el('cbcat-source').value='planilha';
 el('cbcat-year').value='todos';
 el('cbcat-month').value='todos';
 el('cbcat-card').value='todos';
 el('cbcat-category').value='todos';
 el('cbcat-status-filter').value='todos';
 el('cbcat-search').value='';
 const docs=[
  {id:'a',grupo:'cartoes',incluir:true,cartao_nome:'BRADESCO PRIME',mes_fatura:'2026-11-01',
   data_evento:'2026-11-11',descricao:'Ferramentas',parcela:'1/2',valor_registrado:1250.50},
  {id:'b',grupo:'cartoes',incluir:true,cartao_nome:'SICOOB',mes_fatura:'2026-11-01',
   data_evento:'2026-11-12',descricao:'Pneus',parcela:'1/1',valor_registrado:150}
 ];
 function query(data){
  return {select(){return this},eq(){return this},order(){return this},
   range(from,to){return Promise.resolve({data:data.slice(from,to+1),error:null})}};
 }
 const db={rpc(){return Promise.resolve({data:true,error:null})},from(name){
  if(name==='fin_documentos_despesas')return query(docs);
  if(name==='fin_cartoes_categorias_documentais')return query([]);
  if(name==='fin_teste_cartao_lancamentos')return query([]);
  if(name==='fin_cartoes_finalidades')return query([]);
  throw Error('Tabela não esperada: '+name);
 }};
 const fake={frCardNames:{canonical:v=>v}};
 vm.runInNewContext(ui,{window:fake,document:doc,db,Intl,Map,Set,Number,String,Promise});
 await fake.frCardCategoriesUI.refresh();
 assert.equal(el('cbcat-count').textContent,'2');
 el('cbcat-search').value='R$ 1.250,50';
 el('cbcat-search').trigger('input',{});
 assert.equal(el('cbcat-count').textContent,'1');
 assert.match(el('cbcat-rows').innerHTML,/data-cbcat-id="a"/);
 const click=events.get('click:capture');
 assert.equal(typeof click,'function');
 let prevented=false,stopped=false;
 const button={dataset:{cbcatId:'a',cbcatOrigin:'planilha'}};
 click({target:{closest(){return button}},preventDefault(){prevented=true},
  stopPropagation(){stopped=true}});
 assert.equal(prevented,true);
 assert.equal(stopped,true);
 assert.equal(el('cbcat-dialog').open,true);
 assert.match(el('cbcat-edit-summary').textContent,/Ferramentas/);
 assert.equal(el('cbcat-edit-value').value,'');
 assert.equal(el('cbcat-edit-finalidade').value,'a_classificar');
 el('cbcat-dialog').close();
 el('cbcat-search').value='150,00';
 el('cbcat-search').trigger('input',{});
 assert.equal(el('cbcat-count').textContent,'1');
 assert.match(el('cbcat-rows').innerHTML,/data-cbcat-id="b"/);
});
