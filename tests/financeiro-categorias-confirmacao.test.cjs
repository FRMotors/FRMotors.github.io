'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const core=require('../financeiro-categorias-core.js');
const combinedCore=require('../financeiro-categorias-consolidado.js');
const ui=fs.readFileSync(path.join(root,'financeiro-categorias-relatorio.js'),'utf8');
const html=fs.readFileSync(path.join(root,'financeiro.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'sql/migrations/20261119_confirmar_correspondencia_consolidado.sql'),'utf8');
function fixture(){
 const files=[{id:'f1',tipo:'banco',conta_nome:'itau',arquivo_nome:'Itau_2026_11.pdf',
  criado_em:'2026-11-19T12:00:00Z'}];
 const lines=[
  {id:'l1',importacao_id:'f1',movimento_id:'m1',fingerprint:'fp1',
   data_lancamento:'2026-11-12',natureza:'saida',valor:5.60,
   descricao:'PAGAMENTOS MARLI ROMAN LOPEZ',descricao_personalizada:null,categoria_personalizada:null},
  {id:'l2',importacao_id:'f1',movimento_id:'m2',fingerprint:'fp2',
   data_lancamento:'2026-11-13',natureza:'entrada',valor:100,
   descricao:'PIX RECEBIDO FRED',descricao_personalizada:null,categoria_personalizada:null}
 ];
 const bank=[
  {id:'m1',data_movimento:'2026-11-12',tipo:'saida',valor:5.60,estado:'confirmado',
   categoria:'CAFÉ DA MANHÃ',descricao:'PAGAMENTOS MARLI ROMAN LOPEZ',referencia_cliente:'extrato:fp1'},
  {id:'m2',data_movimento:'2026-11-13',tipo:'entrada',valor:100,estado:'confirmado',
   categoria:'RECEBIMENTOS',descricao:'PIX RECEBIDO FRED',referencia_cliente:'extrato:fp2'}
 ];
 const official=[
  {id:'o1',data_movimento:'2026-11-12',tipo:'saida',valor:5.60,descricao:'PÃO',categoria:'CAFÉ DA MANHÃ',
   estado:'confirmado',origem:'fluxo_caixa_homologado'},
  {id:'o2',data_movimento:'2026-11-11',tipo:'entrada',valor:200,descricao:'VENDA',categoria:'VENDAS',
   estado:'confirmado',origem:'fluxo_caixa_homologado'}
 ];
 return {fin_teste_importacoes:files,fin_teste_import_linhas:lines,
  fin_teste_movimentos:bank,fin_movimentos:official,fin_conciliacao_confirmacoes:[],events:[]};
}
function harness(tables,deny=false){
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',
   disabled:false,hidden:false,className:'',dataset:{},addEventListener(){},
   querySelectorAll(){return []}});
  return nodes.get(id);
 };
 get('rg-year').value='2026';get('rg-month').value='11';get('rg-cat-source').value='combined';
 const window={frCategoryCore:core,frCategoryCombinedCore:combinedCore,confirm(){return true}};
 const document={readyState:'loading',getElementById:get,addEventListener(){},
  querySelector(){return {hidden:true}}};
 const db={
  async rpc(name,args){
   if(name==='fluxo_caixa_autorizado')return {data:!deny,error:null};
   assert.equal(name,'fin_conciliacao_correspondencia_confirmar');
   if(deny)return {data:null,error:{message:'Acesso negado'}};
   const line=tables.fin_teste_import_linhas.find(x=>x.id===args.p_linha_id);
   const official=tables.fin_movimentos.find(x=>x.id===args.p_movimento_homologado_id);
   const bank=tables.fin_teste_movimentos.find(x=>x.id===line?.movimento_id);
   if(!line||!official||bank.estado!=='confirmado'||line.data_lancamento!==official.data_movimento||
    line.natureza!==official.tipo||line.valor!==official.valor){
    return {data:null,error:{message:'A origem não corresponde ao movimento'}};
   }
   let row=tables.fin_conciliacao_confirmacoes.find(x=>x.linha_id===line.id);
   if(row&&row.movimento_homologado_id!==official.id)
    return {data:null,error:{message:'Outra correspondência foi registrada'}};
   const status=args.p_confirmar?'conferido':'reaberto';
   if(!row){
    row={linha_id:line.id,movimento_homologado_id:official.id};
    tables.fin_conciliacao_confirmacoes.push(row);
   }
   Object.assign(row,{situacao:status,confirmado_em:'2026-11-19T18:20:00Z',
    confirmado_por:'authorized-user',observacao:args.p_observacao||null});
   tables.events.push({acao:args.p_confirmar?'confirmar':'reabrir'});
   return {data:{linha_id:line.id,movimento_homologado_id:official.id,situacao:status,alterado:true},
    error:null};
  },
  from(name){
   const filters=[],orders=[];
   const list=()=>{
    const data=[...(tables[name]||[])].filter(x=>filters.every(fn=>fn(x)));
    data.sort((a,b)=>{for(const [field,asc] of orders){
     const d=String(a[field]||'').localeCompare(String(b[field]||''));
     if(d)return asc?d:-d;
    }return 0});
    return data;
   };
   const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},
    in(k,values){filters.push(r=>values.includes(r[k]));return q},
    order(k,{ascending=true}={}){orders.push([k,ascending]);return q},
    async range(a,b){return {data:list().slice(a,b+1),error:null}}};
   return q;
  }
 };
 vm.runInNewContext(ui,{window,document,db});
 return {api:window.frCategoryReportUI,get,tables};
}
test('A interface apresenta painel com os dois registros e ação de confirmar',async()=>{
 const h=harness(fixture());await h.api.refresh();
 const content=h.get('rg-cat-match-rows').innerHTML;
 assert.match(content,/PAGAMENTOS MARLI ROMAN LOPEZ/);
 assert.match(content,/PÃO/);
 assert.match(content,/5,60/);
 assert.match(content,/Confirmar correspondência/);
 assert.equal(h.get('rg-cat-match-panel').hidden,false);
 assert.match(h.get('rg-cat-match-count').textContent,/1 pendente/);
});
test('A confirmação não altera os movimentos nem o resultado financeiro',async()=>{
 const data=fixture(),h=harness(data);await h.api.refresh();
 const firstMetrics=h.get('rg-cat-metrics').innerHTML;
 const before=JSON.stringify({official:data.fin_movimentos,bank:data.fin_teste_movimentos,lines:data.fin_teste_import_linhas});
 await h.api.__test.saveMatch('l1','o1',true);
 assert.equal(data.fin_conciliacao_confirmacoes.length,1);
 assert.equal(data.fin_conciliacao_confirmacoes[0].situacao,'conferido');
 assert.equal(data.events.length,1);
 assert.equal(data.events[0].acao,'confirmar');
 assert.equal(h.get('rg-cat-metrics').innerHTML,firstMetrics);
 assert.equal(JSON.stringify({official:data.fin_movimentos,bank:data.fin_teste_movimentos,lines:data.fin_teste_import_linhas}),before);
 assert.match(h.get('rg-cat-match-count').textContent,/0 pendente/);
 assert.match(h.get('rg-cat-match-count').textContent,/1 conferida/);
 assert.match(h.get('rg-cat-match-rows').innerHTML,/Reabrir conferência/);
 assert.match(h.get('rg-cat-match-status').textContent,/Nenhum pagamento/);
});
test('A reabertura retoma o alerta e deixa trilha de auditoria',async()=>{
 const data=fixture(),h=harness(data);await h.api.refresh();
 await h.api.__test.saveMatch('l1','o1',true);
 await h.api.__test.saveMatch('l1','o1',false);
 assert.equal(data.fin_conciliacao_confirmacoes[0].situacao,'reaberto');
 assert.deepEqual(data.events.map(x=>x.acao),['confirmar','reabrir']);
 assert.match(h.get('rg-cat-match-count').textContent,/1 pendente/);
 assert.match(h.get('rg-cat-match-rows').innerHTML,/Confirmar correspondência/);
 assert.match(h.get('rg-cat-match-status').textContent,/Conferência reaberta/);
});
test('Usuário não autorizado não vê as correspondências nem confirma',async()=>{
 const data=fixture(),h=harness(data,true);await h.api.refresh();
 assert.equal(h.get('rg-cat-metrics').innerHTML,'');
 await h.api.__test.saveMatch('l1','o1',true);
 assert.equal(data.fin_conciliacao_confirmacoes.length,0);
 assert.match(h.get('rg-cat-status').textContent,/Acesso financeiro não autorizado/);
});
test('A interface só confirma pares sinalizados pelo algoritmo atual',async()=>{
 const data=fixture(),h=harness(data);await h.api.refresh();
 await h.api.__test.saveMatch('l2','o1',true);
 assert.equal(data.fin_conciliacao_confirmacoes.length,0);
 assert.match(h.get('rg-cat-match-status').textContent,/correspondência mudou/);
});
test('O banco grava aprovação e reabertura auditáveis, protegido por RLS',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/fluxo_caixa_autorizado\(\)/);
 assert.match(sql,/v_user := auth\.uid\(\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION/);
 assert.match(sql,/WHERE situacao='conferido'/);
 assert.match(sql,/INSERT INTO public\.fin_conciliacao_confirmacoes_eventos/);
 assert.doesNotMatch(sql,/UPDATE public\.fin_movimentos/);
 assert.doesNotMatch(sql,/UPDATE public\.fin_teste_movimentos/);
});
test('Existe painel completo e os arquivos JS estão versionados',()=>{
 for(const id of ['rg-cat-match-panel','rg-cat-match-count','rg-cat-match-rows','rg-cat-match-status']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/financeiro-categorias-relatorio\.js\?v=20261119match1/);
});
