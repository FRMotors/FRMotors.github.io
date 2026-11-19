/* FR Motors · Consulta de todas as movimentações do Itaú por mês.
 * Paginação e pesquisa no navegador, sem limite artificial de 40 linhas.
 * Fonte oficial e extratos ainda em conferência permanecem separados. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.frItauMonthlyCore;
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const brl=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const number=value=>new Intl.NumberFormat('pt-BR').format(value);
const dateBR=value=>String(value||'').slice(0,10).split('-').reverse().join('/');
const monthBR=value=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})
 .format(new Date(value+'-01T12:00:00Z'));
const status=(message,failed=false)=>{
 const area=$('hist-itau-mes-status');if(!area)return;
 area.textContent=message;area.className='hist-itau-mes-status'+(failed?' error':'');
};
const state={rows:[],months:[],selected:'',page:0,limit:25,loaded:false,loading:null,cutoff:'',lastVersion:0};
async function pages(makeQuery,max=20000){
 const result=[],limit=400;
 for(let start=0;start<max;start+=limit){
  const {data,error}=await makeQuery().range(start,start+limit-1);
  if(error)throw error;
  result.push(...(data||[]));
  if((data||[]).length<limit)return result;
 }
 throw Error('O histórico excede '+number(max)+' linhas. O sistema não apresenta dados parciais.');
}
function selectedMonth(){
 return $('hist-itau-mes-select')?.value||state.selected;
}
function criteria(){
 return {month:selectedMonth(),type:$('hist-itau-mes-type')?.value||'todos',
  origin:$('hist-itau-mes-origin')?.value||'todos',
  search:$('hist-itau-mes-search')?.value||''};
}
function scope(all=false){
 return core.selectRows(state.rows,{
  ...criteria(),
  ...(all?{type:'todos',origin:'todos',search:''}:{})
 });
}
function metric(label,value,note){
 return '<article class="hist-itau-mes-kpi"><span>'+safe(label)+'</span>'+
  '<strong>'+safe(value)+'</strong><small>'+safe(note)+'</small></article>';
}
function renderRows(){
 const root=$('hist-itau-mes-rows');
 if(!root||!state.loaded)return;
 const filtered=scope(),base=scope(true),totalPages=Math.max(1,Math.ceil(filtered.length/state.limit));
 state.page=Math.max(0,Math.min(state.page,totalPages-1));
 const page=filtered.slice(state.page*state.limit,(state.page+1)*state.limit);
 root.innerHTML=page.length?page.map(row=>{
  const income=row.type==='entrada',preview=row.origin==='previa';
  return '<tr>'+
   '<td>'+safe(dateBR(row.date))+'</td>'+
   '<td><strong>'+safe(row.description)+'</strong>'+
    (preview?'<small class="hist-itau-mes-sub">'+safe(row.source)+'</small>':'')+'</td>'+
   '<td><span class="hist-itau-mes-type '+(income?'income':'out')+'">'+
    (income?'Entrada':'Saída')+'</span></td>'+
   '<td>'+safe(row.category)+
    '<small class="hist-itau-mes-sub">'+safe(row.method)+'</small></td>'+
   '<td><span class="hist-itau-mes-source '+(preview?'pending':'official')+'">'+
    (preview?'Extrato em conferência':'Homologado')+'</span></td>'+
   '<td class="money '+(income?'hist-money-positive':'hist-money-negative')+'">'+
    (income?'+ ':'− ')+brl(row.value)+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="hist-empty">Nenhuma movimentação corresponde aos filtros deste mês.</td></tr>';
 const paginator=$('hist-itau-mes-pages');
 if(paginator)paginator.textContent=number(filtered.length)+' de '+number(base.length)+
  ' lançamento(s) · página '+(state.page+1)+' de '+totalPages;
 const prev=$('hist-itau-mes-page-prev'),next=$('hist-itau-mes-page-next');
 if(prev)prev.disabled=state.page<=0;
 if(next)next.disabled=state.page>=totalPages-1;
}
function render(){
 if(!state.loaded)return;
 const selector=$('hist-itau-mes-select'),choice=state.selected;
 if(selector&&selector.value!==choice)selector.value=choice;
 const all=scope(true),t=core.totals(all);
 const notes=$('hist-itau-mes-totals');
 if(notes)notes.innerHTML=
  metric('Entradas homologadas',brl(t.officialIn),number(all.filter(x=>x.origin==='homologado'&&x.type==='entrada').length)+' recebimento(s)')+
  metric('Saídas homologadas',brl(t.officialOut),number(all.filter(x=>x.origin==='homologado'&&x.type==='saida').length)+' pagamento(s)')+
  metric('Entradas em conferência',brl(t.pendingIn),number(all.filter(x=>x.origin==='previa'&&x.type==='entrada').length)+' extrato(s) não homologado(s)')+
  metric('Saídas em conferência',brl(t.pendingOut),number(all.filter(x=>x.origin==='previa'&&x.type==='saida').length)+' extrato(s) não homologado(s)');
 const info=$('hist-itau-mes-explanation');
 if(info)info.textContent='Movimentações de '+monthBR(choice)+': '+
  number(t.officialCount)+' homologada(s) e '+number(t.pendingCount)+' de extratos em conferência. '+
  'As prévias não entram novamente no caixa homologado. Os totais acima não são saldo bancário.';
 const index=state.months.indexOf(choice);
 const older=$('hist-itau-mes-older'),newer=$('hist-itau-mes-newer');
 if(older)older.disabled=index===-1||index>=state.months.length-1;
 if(newer)newer.disabled=index<=0;
 renderRows();
 status('Mostrando '+monthBR(choice)+' · '+number(all.length)+
  ' movimento(s) disponíveis. Use os filtros ou avance as páginas para consultar todos.');
}
function changeMonth(value){
 if(!state.months.includes(value))return;
 state.selected=value;state.page=0;render();
}
function changeMonthBy(direction){
 const pos=state.months.indexOf(selectedMonth());
 const next=state.months[pos+direction];
 if(next)changeMonth(next);
}
function setMonths(){
 const selector=$('hist-itau-mes-select');if(!selector)return;
 const preserved=selector.value||state.selected;
 const url=new URLSearchParams(window.location.search);
 const direct=url.get('itau_mes');
 selector.innerHTML=state.months.map(month=>'<option value="'+safe(month)+'">'+
  safe(monthBR(month))+'</option>').join('');
 const selected=state.months.includes(preserved)?preserved:
  state.months.includes(direct)?direct:state.months[0]||'';
 state.selected=selected;selector.value=selected;
}
async function refresh(options={}){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  if(!core)throw Error('Motor de movimentos mensais não carregado.');
  if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
  status('Consultando o histórico completo de movimentações do Itaú...');
  const {data:authorized,error:accessError}=await db.rpc('fluxo_caixa_autorizado');
  if(accessError||authorized!==true)throw Error('Acesso financeiro não autorizado.');
  const official=await pages(()=>db.from('fin_movimentos')
   .select('id,data_movimento,tipo,descricao,categoria,meio_pagamento,valor,estado,origem')
   .eq('origem','fluxo_caixa_homologado').eq('estado','confirmado')
   .order('data_movimento',{ascending:false}).order('id',{ascending:false}));
  const records=core.officialRows(official);
  const pending=core.pendingRows(options.pending||[],options.cutoff||'');
  const all=core.combine(records,pending);
  state.rows=all;state.months=core.months(all);state.cutoff=options.cutoff||'';
  state.loaded=true;state.page=0;
  setMonths();
  if(!state.months.length){
   status('Nenhum mês registrado na base do Itaú.');
   const body=$('hist-itau-mes-rows');
   if(body)body.innerHTML='<tr><td colspan="6" class="hist-empty">Não há movimentações neste histórico.</td></tr>';
   if($('hist-itau-mes-totals'))$('hist-itau-mes-totals').innerHTML='';
   return;
  }
  render();
 })().catch(err=>{
  state.loaded=false;state.rows=[];state.months=[];
  const rows=$('hist-itau-mes-rows');
  if(rows)rows.innerHTML='<tr><td colspan="6" class="hist-empty">Falha ao carregar o histórico completo.</td></tr>';
  if($('hist-itau-mes-totals'))$('hist-itau-mes-totals').innerHTML='';
  status('Não foi possível consultar todos os meses: '+String(err.message||err),true);
 }).finally(()=>{state.loading=null});
 return state.loading;
}
function csvSafe(value){
 const v=String(value??'');
 return '"'+(/^\s*[=+\-@]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
}
function exportCsv(){
 if(!state.loaded||!state.selected)return;
 const rows=scope();
 const header=['Data','Descrição','Tipo','Categoria','Meio de pagamento','Situação','Fonte','Valor (R$)'];
 const lines=rows.map(r=>[dateBR(r.date),r.description,r.type,r.category,r.method,
  r.origin==='previa'?'Em conferência':'Homologado',r.source,
  (r.value/100).toFixed(2).replace('.',',')]);
 const data='\ufeff'+[header,...lines].map(row=>row.map(csvSafe).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;
 a.download='FR_Motors_Itau_movimentacoes_'+state.selected+'.csv';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 if(!$('hist-itau-mes-select'))return;
 $('hist-itau-mes-select').addEventListener('change',event=>changeMonth(event.target.value));
 $('hist-itau-mes-older')?.addEventListener('click',()=>changeMonthBy(1));
 $('hist-itau-mes-newer')?.addEventListener('click',()=>changeMonthBy(-1));
 for(const id of ['hist-itau-mes-type','hist-itau-mes-origin','hist-itau-mes-search']){
  $(id)?.addEventListener(id.endsWith('search')?'input':'change',()=>{
   state.page=0;if(state.loaded)renderRows();
  });
 }
 $('hist-itau-mes-page-size')?.addEventListener('change',event=>{
  const value=Number(event.target.value);
  if([25,50,100].includes(value)){state.limit=value;state.page=0;if(state.loaded)renderRows()}
 });
 $('hist-itau-mes-page-prev')?.addEventListener('click',()=>{
  if(state.page>0){state.page--;renderRows()}
 });
 $('hist-itau-mes-page-next')?.addEventListener('click',()=>{
  if((state.page+1)*state.limit<scope().length){state.page++;renderRows()}
 });
 $('hist-itau-mes-export')?.addEventListener('click',exportCsv);
 $('hist-itau-mes-refresh')?.addEventListener('click',()=>{
  window.frHistoryUI?.refresh?.().catch?.(err=>status('Falha ao atualizar Itaú: '+err.message,true));
 });
}
window.frItauMonthsUI={refresh,__test:{state,scope,changeMonth,changeMonthBy,renderRows,exportCsv}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
