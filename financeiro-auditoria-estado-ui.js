/* FR Motors | Situação atual comprovada dos boletos.
 * Esta seção é independente da cronologia de auditoria e não gera baixas. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.frAuditCurrentCore;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=x=>Number.isFinite(Number(x))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)):'—';
const date=x=>/\d{4}-\d{2}-\d{2}/.test(String(x||''))?String(x).slice(0,10).split('-').reverse().join('/'):'—';
const state={rows:[],ready:false,loading:null,page:0,limit:25};
async function fetchAll(builder,max=6000){
 const rows=[],size=350;
 for(let off=0;off<max;off+=size){
  const {data,error}=await builder().range(off,off+size-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if((data||[]).length<size)return rows;
 }
 throw Error('Número de boletos acima do limite seguro. A listagem não pode ser parcial.');
}
function criteria(){
 return {status:$('audit-current-filter')?.value||'todos',
  kind:$('audit-current-origin')?.value||'todos',
  search:core.fold($('audit-current-search')?.value||'')};
}
function visible(){
 const {status,kind,search}=criteria();
 return state.rows.filter(r=>
  (status==='todos'||r.state===status)&&
  (kind==='todos'||r.kind===kind)&&
  (!search||core.fold([r.name,r.description,r.due,r.reference,
   r.paidValue,r.paidDate,r.evidence].join(' ')).includes(search)));
}
function render(){
 if(!state.ready)return;
 const count=core.counts(state.rows);
 for(const [k,id] of [['pago','audit-current-paid'],['aberto','audit-current-open'],['revisar','audit-current-review']]){
  const el=$(id);if(el)el.textContent=String(count[k]);
 }
 const filtered=visible(),maxPages=Math.max(1,Math.ceil(filtered.length/state.limit));
 state.page=Math.max(0,Math.min(state.page,maxPages-1));
 const rows=filtered.slice(state.page*state.limit,(state.page+1)*state.limit);
 const table=$('audit-current-rows');
 if(table)table.innerHTML=rows.length?rows.map(r=>
  '<tr>'+
  '<td><strong>'+esc(r.name)+'</strong><small>'+esc(r.kind==='conta'?'Compromisso cadastrado':'Boleto avulso')+
   (r.description&&r.name!==r.description?' · '+esc(r.description):'')+'</small></td>'+
  '<td>'+esc(date(r.due))+'</td>'+
  '<td class="money">'+brl(r.reference)+'</td>'+
  '<td class="money">'+(r.paidValue===null?'—':brl(r.paidValue))+'</td>'+
  '<td>'+esc(date(r.paidDate))+'</td>'+
  '<td><span class="audit-current-badge audit-current-'+esc(r.state)+'">'+esc(core.viewStatus(r.state))+'</span></td>'+
  '<td>'+esc(r.evidence)+'</td>'+
  '</tr>'
 ).join(''):'<tr><td colspan="7" class="empty">Nenhum boleto encontrado com esses filtros.</td></tr>';
 const page=$('audit-current-page');
 if(page)page.textContent=filtered.length+' de '+state.rows.length+' boletos · página '+(state.page+1)+' de '+maxPages;
 const prev=$('audit-current-prev'),next=$('audit-current-next');
 if(prev)prev.disabled=state.page===0;
 if(next)next.disabled=state.page===maxPages-1;
}
function status(text,bad=false){
 const el=$('audit-current-note');
 if(el){el.textContent=text;el.className='audit-current-note'+(bad?' error':'')}
}
async function refresh(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  if(!core)throw Error('Motor de conferência de boletos não carregado.');
  if(typeof db==='undefined'||!db)throw Error('Conexão com os boletos indisponível.');
  status('Atualizando a situação comprovada dos boletos...');
  const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
  if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
  const [accounts,manual,ops,extracts]=await Promise.all([
   fetchAll(()=>db.from('fin_contas_pagar')
    .select('id,fornecedor_nome,descricao,vencimento,valor_referencia,situacao,valor_pago,data_pagamento,movimento_teste_id,vinculo_teste_id,arquivado_em')
    .order('id')),
   fetchAll(()=>db.from('fin_boletos_avulsos')
    .select('id,fornecedor_nome,descricao,vencimento,valor_referencia,excluido_em').order('id')),
   fetchAll(()=>db.from('fin_baixas_operacionais')
    .select('id,conta_pagar_id,boleto_avulso_id,valor_pago,data_pagamento').order('id')),
   fetchAll(()=>db.from('fin_baixas_extrato_avulsos')
    .select('id,boleto_avulso_id,movimento_teste_id,valor_pago,data_pagamento').order('id'))
  ]);
  state.rows=core.currentBills(accounts,manual,ops,extracts);
  state.ready=true;state.page=0;render();
  const counters=core.counts(state.rows);
  status('Posição atual: '+counters.pago+' pagos/conciliados, '+counters.aberto+' abertos e '+counters.revisar+
   ' exigindo revisão. “Em aberto” é o estado que consta no cadastro; se houve baixa fora dele, ainda é necessário vincular a comprovação. '+
   'Os eventos históricos abaixo não são a posição atual.');
 })().catch(error=>{
  state.ready=false;state.rows=[];
  status('Não foi possível consultar todas as fontes: '+String(error.message||error),true);
  if($('audit-current-rows'))$('audit-current-rows').innerHTML='<tr><td colspan="7">Não foi possível verificar a situação atual.</td></tr>';
  for(const id of ['audit-current-paid','audit-current-open','audit-current-review'])if($(id))$(id).textContent='—';
 }).finally(()=>{state.loading=null});
 return state.loading;
}
function init(){
 if(!$('audit-current-rows'))return;
 for(const id of ['audit-current-filter','audit-current-origin'])
  $(id)?.addEventListener('change',()=>{state.page=0;render()});
 $('audit-current-search')?.addEventListener('input',()=>{state.page=0;render()});
 $('audit-current-prev')?.addEventListener('click',()=>{state.page=Math.max(0,state.page-1);render()});
 $('audit-current-next')?.addEventListener('click',()=>{state.page++;render()});
 if(!document.querySelector('[data-view-panel="audit"]')?.hidden)refresh();
}
window.frAuditCurrentUI={refresh,__test:{state,visible,render}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
