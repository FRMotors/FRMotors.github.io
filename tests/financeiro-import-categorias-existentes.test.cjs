'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(base,'financeiro-import-categorias.js'),'utf8');
const html=fs.readFileSync(path.join(base,'financeiro.html'),'utf8');
const sql=fs.readFileSync(path.join(base,'sql/migrations/20261119_edicao_categorias_extratos_existentes.sql'),'utf8');
function environment(){
 const lines=[
  {id:'l1',importacao_id:'f1',movimento_id:'m1',descricao:'PIX ENVIADO MARIA',data_lancamento:'2026-11-19',
   natureza:'saida',valor:250,fingerprint:'hash1',descricao_personalizada:null,categoria_personalizada:null},
  {id:'l2',importacao_id:'f1',movimento_id:'m2',descricao:'PAGAMENTO POSTO',data_lancamento:'2026-11-18',
   natureza:'saida',valor:50,fingerprint:'hash2',descricao_personalizada:null,categoria_personalizada:null},
  {id:'l3',importacao_id:'f2',movimento_id:null,descricao:'COMPRA CARTÃO',data_lancamento:'2026-11-17',
   natureza:'compra',valor:90,fingerprint:'hash3'}
 ];
 const files=[
  {id:'f1',tipo:'banco',conta_nome:'itau',arquivo_nome:'Itau_novembro.pdf',criado_em:'2026-11-19'},
  {id:'f2',tipo:'cartao',conta_nome:'Bradesco',arquivo_nome:'Cartao.pdf',criado_em:'2026-11-18'}
 ];
 const moves=[
  {id:'m1',categoria:'EXTRATO BANCÁRIO',descricao:'PIX ENVIADO MARIA',estado:'confirmado'},
  {id:'m2',categoria:'COMBUSTÍVEL',descricao:'PAGAMENTO POSTO',estado:'cancelado'}
 ];
 const audit=[];
 const db={from(table){
  const t={fin_teste_importacoes:files,fin_teste_import_linhas:lines,
   fin_teste_movimentos:moves,fin_extrato_categorias_auditoria:audit}[table]||[];
  const filters=[];let ordering=[],lim=null;
  const fetch=()=>{
   const data=t.filter(x=>filters.every(fn=>fn(x))).slice();
   data.sort((a,b)=>{
    for(const [k,asc] of ordering){
     const x=String(a[k]||''),y=String(b[k]||'');
     const diff=x.localeCompare(y);if(diff)return asc?diff:-diff;
    }
    return 0;
   });
   return lim===null?data:data.slice(0,lim);
  };
  const q={
   select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},
   in(k,v){filters.push(r=>v.includes(r[k]));return q},
   order(k,{ascending=true}={}){ordering.push([k,ascending]);return q},
   limit(v){lim=v;return q},
   async range(a,b){return {data:fetch().slice(a,b+1),error:null}},
   then(resolve,reject){return Promise.resolve({data:fetch(),error:null}).then(resolve,reject)}
  };return q;
 },async rpc(fn,args){
  assert.equal(fn,'fin_extrato_categoria_editar');
  const line=lines.find(x=>x.id===args.p_linha_id);
  const move=moves.find(x=>x.id===line?.movimento_id);
  if(!line||!move)return {data:null,error:{message:'Movimento não encontrado'}};
  if(move.categoria!==args.p_categoria_esperada)
   return {data:null,error:{message:'A categoria foi alterada em outra sessão.'}};
  const previous=move.categoria;
  const next=args.p_categoria.trim().toLocaleUpperCase('pt-BR');
  move.categoria=next;line.categoria_personalizada=next;
  audit.push({id:'aud1',conta_nome:'itau',descricao_bancaria:line.descricao,
   categoria_anterior:previous,categoria_nova:next,criado_em:'2026-11-19T12:00:00Z'});
  return {data:{id:line.id,categoria_anterior:previous,categoria_nova:next,alterada:true},error:null};
 }};
 const map=new Map();
 const node=id=>{
  if(!map.has(id))map.set(id,{
   value:'',innerHTML:'',textContent:'',className:'',open:false,disabled:false,addEventListener(){}
  });
  return map.get(id);
 };
 node('imports-editar-categorias').open=true;
 const context={window:{location:{search:'',hash:''}},document:{readyState:'loading',
  getElementById:node,addEventListener(){}},db};
 const instrumented=js.replace('window.frImportCategoriasUI={refresh};',
  'window.frImportCategoriasUI={refresh,_saveCategory:saveCategory,_state:state,_validateCategory:validateCategory,_filteredRows:filteredRows};');
 assert.notEqual(js,instrumented,'Não foi possível instrumentar módulo de teste.');
 vm.runInNewContext(instrumented,context);
 return {api:context.window.frImportCategoriasUI,node,lines,moves,files,audit};
}
test('a interface disponibiliza editor com busca e categorias para extratos antigos',()=>{
 for(const id of ['imports-editar-categorias','import-categories-account','import-categories-search',
  'import-categories-rows','import-categories-audit','import-categories-next'])
  assert.ok(html.includes('id="'+id+'"'),id+' não encontrado');
 assert.ok(html.includes('financeiro-import-categorias.js'));
});
test('consulta apenas linhas de extrato bancário, inclusive as canceladas',async()=>{
 const x=environment();await x.api.refresh();
 assert.equal(x.api._state.rows.length,2);
 assert.equal(x.api._state.rows.find(r=>r.id==='l2').estado,'cancelado');
 assert.ok(x.node('import-categories-rows').innerHTML.includes('Cancelado, fora do caixa'));
 assert.ok(x.node('import-categories-rows').innerHTML.includes('PIX ENVIADO MARIA'));
 assert.ok(!x.node('import-categories-rows').innerHTML.includes('COMPRA CARTÃO'));
});
test('categoria pode ser trocada em movimentação anterior sem reimportar PDF',async()=>{
 const x=environment();await x.api.refresh();
 const original={...x.lines[0]};
 x.api._state.rows.find(r=>r.id==='l1').draft='Pró-labore';
 await x.api._saveCategory('l1');
 assert.equal(x.moves[0].categoria,'PRÓ-LABORE');
 assert.equal(x.lines[0].categoria_personalizada,'PRÓ-LABORE');
 assert.equal(x.lines[0].descricao,original.descricao);
 assert.equal(x.lines[0].valor,original.valor);
 assert.equal(x.lines[0].data_lancamento,original.data_lancamento);
 assert.equal(x.lines[0].fingerprint,original.fingerprint);
 assert.equal(x.audit.length,1);
 assert.match(x.node('import-categories-status').textContent,/salva e registrada/);
});
test('edição concorrente não sobrescreve categoria de outra sessão',async()=>{
 const x=environment();await x.api.refresh();
 x.api._state.rows.find(r=>r.id==='l1').draft='PRÓ-LABORE';
 x.moves[0].categoria='SALÁRIOS';
 await x.api._saveCategory('l1');
 assert.equal(x.moves[0].categoria,'SALÁRIOS');
 assert.equal(x.audit.length,0);
 assert.match(x.node('import-categories-status').textContent,/outra sessão/);
});
test('categoria vazia ou longa é rejeitada pelo cliente',()=>{
 const x=environment();
 assert.throws(()=>x.api._validateCategory(''),/2 a 100/);
 assert.throws(()=>x.api._validateCategory('X'),/2 a 100/);
 assert.throws(()=>x.api._validateCategory('A'.repeat(101)),/2 a 100/);
 assert.equal(x.api._validateCategory('pró-labore'),'PRÓ-LABORE');
});
test('backend audita alterações, aplica autenticação e não modifica valor nem data',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/fluxo_caixa_autorizado\(\)/);
 assert.match(sql,/FOR UPDATE OF l/);
 assert.match(sql,/v_movimento\.categoria IS DISTINCT FROM p_categoria_esperada/);
 assert.match(sql,/categoria_personalizada=v_categoria/);
 assert.match(sql,/INSERT INTO public\.fin_extrato_categorias_auditoria/);
 assert.doesNotMatch(sql,/SET\s+valor\s*=/i);
 assert.doesNotMatch(sql,/SET\s+data_lancamento\s*=/i);
 assert.doesNotMatch(sql,/SET\s+descricao\s*=/i);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.fin_extrato_categoria_editar\(uuid,text,text\) TO authenticated/);
});
