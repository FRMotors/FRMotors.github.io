/* FR Motors · Consulta da base financeira migrada.
   Somente leitura. Os totais vêm de fin_movimentos, sem somar compras ou cartões. */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const dateBR=v=>v?v.slice(0,10).split('-').reverse().join('/'):'Sem data';
let list=[],page=0,loading=null;
const perPage=40;
function setText(id,text){const n=el(id);if(n)n.textContent=text;}
async function fetchAll(build){
 const result=[],limit=15000,size=600;
 for(let offset=0;offset<limit;offset+=size){
  const {data,error}=await build().range(offset,offset+size-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<size)return result;
 }
 throw Error('Mais de 15.000 movimentos. Consulta interrompida para evitar totais incompletos.');
}
function filtered(){
 const q=(el('ops-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const type=el('ops-type')?.value||'todos';
 return list.filter(x=>(type==='todos'||x.tipo===type)&&
  [x.descricao,x.categoria,x.data_movimento,x.meio_pagamento,x.referencia_origem]
   .join(' ').toLocaleLowerCase('pt-BR').includes(q));
}
function draw(){
 const found=filtered(),pages=Math.max(1,Math.ceil(found.length/perPage));
 page=Math.min(Math.max(0,page),pages-1);
 const displayed=found.slice(page*perPage,(page+1)*perPage);
 const tbody=el('ops-rows');
 if(tbody)tbody.innerHTML=displayed.length?displayed.map(x=>
  '<tr><td><span class="row-main">'+esc(dateBR(x.data_movimento))+'</span></td>'+
  '<td><span class="row-main">'+esc(x.descricao)+'</span><span class="row-sub">'+esc(x.categoria||'Sem categoria registrada')+'</span></td>'+
  '<td><span class="state '+(x.tipo==='entrada'?'in':'out')+'">'+esc(x.tipo==='entrada'?'Entrada':'Saída')+'</span></td>'+
  '<td>'+esc(x.meio_pagamento||'Não identificado')+'</td>'+
  '<td class="money">'+brl(x.valor)+'</td>'+
  '<td><span class="row-sub">'+esc(x.referencia_origem)+'</span></td></tr>'
 ).join(''):'<tr><td colspan="6" class="empty">Nenhum lançamento correspondente.</td></tr>';
 setText('ops-pagination',found.length+' movimentação(ões) encontradas · página '+(page+1)+' de '+pages);
 if(el('ops-prev'))el('ops-prev').disabled=page===0;
 if(el('ops-next'))el('ops-next').disabled=page>=pages-1;
}
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão com o Supabase indisponível.');
   setText('ops-status','Carregando a base financeira migrada...');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso ao histórico financeiro não autorizado.');
   const [moves,importResp,abertosResp,ignoradosResp,linksResp]=await Promise.all([
    fetchAll(()=>db.from('fin_movimentos')
     .select('id,data_movimento,tipo,descricao,categoria,meio_pagamento,valor,origem,referencia_origem')
     .eq('origem','fluxo_caixa_homologado')
     .order('data_movimento',{ascending:false}).order('id',{ascending:false})),
    db.from('fin_importacoes').select('nome_arquivo,linhas_importadas,estado,finalizado_em')
     .eq('fonte','arquivo_financeiro_unificado_homologado')
     .order('finalizado_em',{ascending:false}).limit(1).maybeSingle(),
    db.from('fin_contas_pagar').select('id',{count:'exact',head:true}).eq('situacao','aberto'),
    db.from('fin_legacy_registros').select('id',{count:'exact',head:true}).eq('situacao','ignorar'),
    db.from('fin_teste_excel_abertos_vinculos').select('id',{count:'exact',head:true})
   ]);
   for(const response of [importResp,abertosResp,ignoradosResp,linksResp])
    if(response.error)throw response.error;
   const imported=importResp.data;
   if(!imported||imported.estado!=='concluida')throw Error('Nenhuma migração financeira concluída encontrada.');
   list=moves;
   const ins=moves.filter(x=>x.tipo==='entrada'),outs=moves.filter(x=>x.tipo==='saida');
   const entradasCent=ins.reduce((sum,x)=>sum+Math.round(Number(x.valor)*100),0);
   const saidasCent=outs.reduce((sum,x)=>sum+Math.round(Number(x.valor)*100),0);
   setText('ops-count',String(moves.length));
   setText('ops-entradas',brl(entradasCent/100));
   setText('ops-saidas',brl(saidasCent/100));
   setText('ops-result',brl((entradasCent-saidasCent)/100));
   setText('ops-open',String(abertosResp.count??0));
   setText('ops-ignored',String(ignoradosResp.count??0));
   setText('ops-links',String(linksResp.count??0));
   setText('ops-source',imported.nome_arquivo+' · '+imported.linhas_importadas+' registros arquivados');
   setText('ops-status',ins.length+' recebimentos e '+outs.length+
    ' pagamentos efetivos conferidos no histórico migrado. Nenhuma transação adicional foi gerada por esta consulta.');
   draw();
  }catch(e){
   setText('ops-status','Não foi possível consultar a base migrada: '+(e.message||e));
   if(el('ops-rows'))el('ops-rows').innerHTML='<tr><td colspan="6" class="empty">Não foi possível consultar os lançamentos.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!el('ops-rows'))return;
 el('ops-search')?.addEventListener('input',()=>{page=0;draw()});
 el('ops-type')?.addEventListener('change',()=>{page=0;draw()});
 el('ops-prev')?.addEventListener('click',()=>{page--;draw()});
 el('ops-next')?.addEventListener('click',()=>{page++;draw()});
 el('ops-refresh')?.addEventListener('click',()=>load().catch(()=>{}));
}
window.frOperationalUI={open:load,refresh:load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
