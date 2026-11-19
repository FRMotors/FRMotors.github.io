'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const core=require('../financeiro-categorias-core.js');
const combinedCore=require('../financeiro-categorias-consolidado.js');
const js=fs.readFileSync(path.join(root,'financeiro-categorias-relatorio.js'),'utf8');
const html=fs.readFileSync(path.join(root,'financeiro.html'),'utf8');
function fixture(){
 const files=[{id:'f1',tipo:'banco',conta_nome:'Itaú',arquivo_nome:'2026-11.pdf'}];
 const lines=[
  {id:'1',importacao_id:'f1',movimento_id:'m1',fingerprint:'fp1',data_lancamento:'2026-11-19',
   natureza:'saida',descricao:'PIX ENVIADO',descricao_personalizada:'Pró-labore',categoria_personalizada:'PRÓ-LABORE',valor:250},
  {id:'2',importacao_id:'f1',movimento_id:'m2',fingerprint:'fp2',data_lancamento:'2026-11-19',
   natureza:'entrada',descricao:'PIX RECEBIDO',descricao_personalizada:null,categoria_personalizada:null,valor:500},
  {id:'3',importacao_id:'f1',movimento_id:'m3',fingerprint:'fp3',data_lancamento:'2026-11-18',
   natureza:'saida',descricao:'PIX ANTIGO CANCELADO',descricao_personalizada:null,categoria_personalizada:null,valor:30}
 ];
 const movements=[
  {id:'m1',data_movimento:'2026-11-19',tipo:'saida',descricao:'Pró-labore',categoria:'PRÓ-LABORE',valor:250,estado:'confirmado',referencia_cliente:'extrato:fp1'},
  {id:'m2',data_movimento:'2026-11-19',tipo:'entrada',descricao:'PIX RECEBIDO',categoria:'RECEBIMENTOS',valor:500,estado:'confirmado',referencia_cliente:'extrato:fp2'},
  {id:'m3',data_movimento:'2026-11-18',tipo:'saida',descricao:'PIX ANTIGO CANCELADO',categoria:'OUTROS',valor:30,estado:'cancelado',referencia_cliente:'extrato:fp3'}
 ];
 const official=[
  {id:'off1',data_movimento:'2026-11-12',tipo:'saida',descricao:'PAGAMENTO',categoria:'FORNECEDORES',valor:700,estado:'confirmado',origem:'fluxo_caixa_homologado'},
  {id:'off2',data_movimento:'2026-11-10',tipo:'entrada',descricao:'VENDA',categoria:'VENDAS',valor:800,estado:'confirmado',origem:'fluxo_caixa_homologado'}
 ];
 return {fin_teste_importacoes:files,fin_teste_import_linhas:lines,fin_teste_movimentos:movements,fin_movimentos:official};
}
function harness(tables){
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,
   className:'',addEventListener(){}});
  return nodes.get(id);
 };
 get('rg-year').value='2026';get('rg-month').value='11';get('rg-cat-source').value='imported';
 const document={readyState:'loading',getElementById:get,addEventListener(){},
  querySelector(){return {hidden:true}}};
 const db={
  async rpc(name){assert.equal(name,'fluxo_caixa_autorizado');return {data:true,error:null}},
  from(name){
   const filters=[],orders=[];
   const list=()=>{
    const data=[...(tables[name]||[])].filter(x=>filters.every(fn=>fn(x)));
    data.sort((a,b)=>{for(const [field,asc] of orders){
     const val=String(a[field]||'').localeCompare(String(b[field]||''));
     if(val)return asc?val:-val;
    }return 0});
    return data;
   };
   const q={select(){return q},eq(field,v){filters.push(x=>x[field]===v);return q},
    in(field,vals){filters.push(x=>vals.includes(x[field]));return q},
    order(field,{ascending=true}={}){orders.push([field,ascending]);return q},
    async range(a,b){return {data:list().slice(a,b+1),error:null}}};
   return q;
  }
 };
 const window={frCategoryCore:core,frCategoryCombinedCore:combinedCore};
 vm.runInNewContext(js,{window,document,db});
 return {api:window.frCategoryReportUI,get,tables};
}
test('relatório e scripts carregam dentro da página gerencial',()=>{
 for(const id of ['rg-category-analysis','rg-cat-source','rg-cat-account','rg-cat-metrics',
  'rg-cat-inbars','rg-cat-outbars','rg-cat-table','rg-cat-movements','rg-cat-export-summary','rg-cat-export-movements']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.ok(html.indexOf('financeiro-categorias-core.js')<html.indexOf('financeiro-categorias-consolidado.js'));
 assert.ok(html.indexOf('financeiro-categorias-consolidado.js')<html.indexOf('financeiro-categorias-relatorio.js'));
 assert.ok(html.includes('value="combined">Consolidado: extratos + caixa homologado'));
});
test('importações exibem apenas confirmados com categorias manuais',async()=>{
 const h=harness(fixture());await h.api.refresh();
 const out=h.get('rg-cat-metrics').innerHTML;
 assert.match(out,/R\$\s*500,00/);
 assert.match(out,/R\$\s*250,00/);
 assert.match(h.get('rg-cat-table').innerHTML,/PRÓ-LABORE/);
 assert.match(h.get('rg-cat-status').textContent,/2 movimento/);
 assert.doesNotMatch(h.get('rg-cat-table').innerHTML,/OUTROS/);
});
test('trocar fonte muda valores sem somar extratos e caixa histórico',async()=>{
 const h=harness(fixture());await h.api.refresh();
 h.get('rg-cat-source').value='official';h.api.render();
 const out=h.get('rg-cat-metrics').innerHTML;
 assert.match(out,/R\$\s*800,00/);
 assert.match(out,/R\$\s*700,00/);
 assert.doesNotMatch(out,/R\$\s*250,00/);
 assert.equal(h.get('rg-cat-account-wrap').hidden,true);
 assert.match(h.get('rg-cat-provenance').textContent,/não estão somados/);
});
test('alteração de categoria no banco aparece na próxima atualização',async()=>{
 const t=fixture(),h=harness(t);await h.api.refresh();
 assert.match(h.get('rg-cat-table').innerHTML,/PRÓ-LABORE/);
 t.fin_teste_movimentos[0].categoria='FORNECEDORES';
 await h.api.refresh();
 assert.match(h.get('rg-cat-table').innerHTML,/FORNECEDORES/);
 assert.doesNotMatch(h.get('rg-cat-table').innerHTML,/PRÓ-LABORE/);
});
test('erro de vínculo bloqueia totais em vez de mostrar dados parciais',async()=>{
 const t=fixture(),h=harness(t);await h.api.refresh();
 t.fin_teste_movimentos[0].valor=251;
 await h.api.refresh();
 assert.equal(h.get('rg-cat-metrics').innerHTML,'');
 assert.match(h.get('rg-cat-status').textContent,/Não foi possível validar/);
});
test('o relatório aceita filtrar mês sem afetar dados de outras fontes',async()=>{
 const h=harness(fixture());await h.api.refresh();
 h.get('rg-month').value='10';h.api.render();
 assert.match(h.get('rg-cat-status').textContent,/0 movimento/);
 assert.match(h.get('rg-cat-movements').innerHTML,/Nenhuma movimentação/);
});

test('Consolidado junta entradas e saídas homologadas e bancárias sem somar cancelados',async()=>{
 const h=harness(fixture());await h.api.refresh();
 h.get('rg-cat-source').value='combined';h.api.render();
 const k=h.get('rg-cat-metrics').innerHTML;
 assert.ok(k.includes('1.300,00'));assert.ok(k.includes('950,00'));assert.ok(k.includes('350,00'));
 assert.ok(h.get('rg-cat-table').innerHTML.includes('PRÓ-LABORE'));
 assert.ok(h.get('rg-cat-combined-audit').innerHTML.includes('2</strong> homologados'));
 assert.ok(h.get('rg-cat-combined-audit').innerHTML.includes('2</strong> novos dos extratos'));
 assert.equal(h.get('rg-cat-account-wrap').hidden,true);
 assert.ok(h.get('rg-cat-provenance').textContent.includes('O filtro por conta fica indisponível'));
});
test('No fechamento não duplica homologados do mesmo valor e deixa rastreabilidade',async()=>{
 const t=fixture();
 t.fin_teste_import_linhas.push({
  id:'copy',importacao_id:'f1',movimento_id:'mc',fingerprint:'fpc',
  data_lancamento:'2026-11-12',natureza:'saida',valor:700,descricao:'PAGAMENTO',
  descricao_personalizada:null,categoria_personalizada:null
 });
 t.fin_teste_movimentos.push({
  id:'mc',data_movimento:'2026-11-12',tipo:'saida',valor:700,descricao:'PAGAMENTO',
  categoria:'EXTRATO BANCÁRIO',estado:'confirmado',referencia_cliente:'extrato:fpc'
 });
 const h=harness(t);await h.api.refresh();
 h.get('rg-cat-source').value='combined';h.api.render();
 assert.ok(h.get('rg-cat-combined-audit').innerHTML.includes('1</strong> não somados novamente'));
 assert.ok(h.get('rg-cat-status').textContent.includes('4 movimento'));
 assert.ok(h.get('rg-cat-provenance').textContent.includes('1 correspondência'));
 assert.ok(h.get('rg-cat-table').innerHTML.includes('FORNECEDORES'));
});
