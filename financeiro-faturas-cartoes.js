/* FR Motors | Painel de Faturas dos Cartões | leitura documental sem dupla contagem.
 * Não registra pagamentos, não altera o caixa nem infere vencimento pela competência.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'Cartão não identificado');
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cents=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0};
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const monthBR=v=>v?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'})
 .format(new Date(String(v).slice(0,7)+'-01T12:00:00Z')):'Sem competência';
const dayBR=()=>{
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>pieces.find(x=>x.type===k)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
};
const put=(id,v)=>{const n=$(id);if(n)n.textContent=v};
const stateLabels={
 'declarada':'Quitada por declaração','conciliada':'Quitada por vínculo bancário',
 'externa':'Quitada por pagamento externo informado','mista':'Quitada por pagamentos mistos',
 'parcial':'Parcialmente paga','aberta':'Sem pagamento comprovado'
};
let all=[],ready=false,loading=null,sort='pendentes',filter='todos',card='todos',year='todos',search='',page=0;
const STEP=5;
const VISIBILITY_KEY='frmotors.faturas.mostrarCartoesAntigos.v1';
let showOtherCards=false;
try{showOtherCards=window.localStorage?.getItem(VISIBILITY_KEY)==='1'}catch(_){}
/* A preferência altera somente o que é apresentado, nunca os dados do banco. */
function activeCard(name){
 const normalized=cardName(name).trim().toLocaleUpperCase('pt-BR');
 return normalized==='BRADESCO PRIME'||normalized==='SICOOB'||normalized.startsWith('SICOOB ');
}
function inScope(){return all.filter(x=>showOtherCards||activeCard(x.card));}
function setShowOtherCards(value){
 showOtherCards=Boolean(value);
 try{window.localStorage?.setItem(VISIBILITY_KEY,showOtherCards?'1':'0')}catch(_){}
 if($('cb-show-other-cards'))$('cb-show-other-cards').checked=showOtherCards;
 page=0;render();
}
async function fetchAll(builder,max=5000){
 const rows=[],size=350;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await builder().range(offset,offset+size-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<size)return rows;
 }
 throw Error('A consulta ultrapassou o limite seguro, sem exibir totais incompletos.');
}
function buildInvoiceStates(invoices,declarations,partials,fullPayments,agendas){
 const declared=new Set(declarations.map(x=>x.fatura_id));
 const partial=new Map(),external=new Map(),integral=new Map(),due=new Map();
 partials.forEach(x=>{
  partial.set(x.fatura_id,(partial.get(x.fatura_id)||0)+cents(x.valor_pago));
  if(x.origem==='externo')external.set(x.fatura_id,(external.get(x.fatura_id)||0)+cents(x.valor_pago));
 });
 fullPayments.forEach(x=>integral.set(x.fatura_id,cents(x.valor_conferido)));
 agendas.forEach(x=>due.set(x.fatura_id,{vencimento:x.vencimento||null,observacoes:x.observacoes||''}));
 return invoices.map(x=>{
  const total=cents(x.valor_documental),isDeclared=declared.has(x.id);
  const paid=integral.has(x.id)?integral.get(x.id):partial.get(x.id)||0;
  const externalPaid=external.get(x.id)||0;
  const bankPaid=Math.max(0,paid-externalPaid);
  const remaining=isDeclared?0:Math.max(0,total-paid);
  const status=isDeclared?'declarada':
   remaining===0&&externalPaid>0&&bankPaid===0?'externa':
   remaining===0&&externalPaid>0?'mista':
   remaining===0?'conciliada':paid>0?'parcial':'aberta';
  return {
   id:x.id,card:cardName(x.cartao_nome),originalCard:x.cartao_nome||'',period:x.mes_fatura,
   transactions:x.quantidade_lancamentos||0,total,paid,bankPaid,externalPaid,remaining,status,
   due:due.get(x.id)?.vencimento||null,notes:due.get(x.id)?.observacoes||''
  };
 });
}
const sum=(rows,field)=>rows.reduce((total,x)=>total+x[field],0);
function compare(a,b){
 const priority=x=>x.remaining>0?0:1;
 if(sort==='recentes')return String(b.period).localeCompare(String(a.period))||a.card.localeCompare(b.card,'pt-BR');
 if(sort==='cartoes')return a.card.localeCompare(b.card,'pt-BR')||String(b.period).localeCompare(String(a.period));
 return priority(a)-priority(b)||String(a.due||'9999-99-99').localeCompare(String(b.due||'9999-99-99'))||
 String(b.period).localeCompare(String(a.period))||a.card.localeCompare(b.card,'pt-BR');
}
function visible(){
 return inScope().filter(x=>{
  if(card!=='todos'&&x.card!==card)return false;
  if(year!=='todos'&&String(x.period||'').slice(0,4)!==year)return false;
  if(filter==='pendentes'&&x.remaining===0)return false;
  if(filter==='sem-vencimento'&&!(x.remaining>0&&!x.due))return false;
  if(['declarada','conciliada','externa','mista','parcial','aberta'].includes(filter)&&x.status!==filter)return false;
  if(search&&![
   x.card,x.originalCard,x.period,monthBR(x.period),x.due,x.notes,stateLabels[x.status],x.total/100
  ].join(' ').toLocaleLowerCase('pt-BR').includes(search))return false;
  return true;
 }).sort(compare);
}
function renderMetrics(){
 const scope=inScope(),pending=scope.filter(x=>x.remaining>0);
 put('cb-count',String(scope.length));
 put('cb-open',String(pending.length));
 put('cb-outstanding',money(sum(pending,'remaining')));
 put('cb-declared',String(scope.filter(x=>x.status==='declarada').length));
 put('cb-conciliated',String(scope.filter(x=>x.status==='conciliada').length));
 put('cb-external',String(scope.filter(x=>x.status==='externa'||x.status==='mista').length));
 put('cb-partial',String(scope.filter(x=>x.status==='parcial').length));
 put('cb-undated',String(pending.filter(x=>!x.due).length));
 put('cb-pending-note',pending.length?
  'O saldo é documental e não deve ser somado às saídas já confirmadas no caixa.':
  'Não há fatura com saldo documental pendente.');
}
function renderCards(){
 const map=new Map(),scope=inScope();
 scope.forEach(f=>{
  let x=map.get(f.card);
  if(!x){x={card:f.card,items:0,pending:0,total:0,remaining:0};map.set(f.card,x)}
  x.items++;x.total+=f.total;x.remaining+=f.remaining;if(f.remaining>0)x.pending++;
 });
 const cards=[...map.values()].sort((a,b)=>b.remaining-a.remaining||a.card.localeCompare(b.card,'pt-BR'));
 const root=$('cb-card-summary');if(!root)return;
 root.innerHTML=cards.map(x=>
  '<button class="cb-card-item" type="button" data-cb-card="'+esc(x.card)+'">'+
   '<span class="cb-card-title">'+esc(x.card)+'</span>'+
   '<span class="cb-card-sub">'+x.items+' fatura(s) · '+x.pending+' pendente(s)</span>'+
   '<strong>'+money(x.remaining)+'</strong>'+
   '<small>Saldo documental pendente</small></button>'
 ).join('')||'<div class="cb-empty">Nenhuma fatura dos cartões selecionados.</div>';
 const hidden=all.filter(x=>!activeCard(x.card));
 const hiddenCards=new Set(hidden.map(x=>x.card)).size;
 put('cb-visibility-hint',showOtherCards?
  'Exibindo todos os cartões históricos. Desmarque para voltar aos cartões em uso.':
  'Exibindo apenas BRADESCO PRIME e SICOOB. '+hiddenCards+' cartão(ões) e '+hidden.length+
  ' fatura(s) antiga(s) oculto(s), sem exclusão de dados.');
 if($('cb-show-other-cards'))$('cb-show-other-cards').checked=showOtherCards;
}
function renderFilters(){
 const scope=inScope();
 const cards=[...new Set(scope.map(x=>x.card))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const y=[...new Set(scope.map(x=>String(x.period||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 const cardInput=$('cb-card'),yearInput=$('cb-year');
 if(cardInput){
  cardInput.replaceChildren(new Option('Todos os cartões','todos'),...cards.map(x=>new Option(x,x)));
  if(!cards.includes(card))card='todos';
  cardInput.value=card;
 }
 if(yearInput){
  yearInput.replaceChildren(new Option('Todos os anos','todos'),...y.map(x=>new Option(x,x)));
  if(!y.includes(year))year='todos';
  yearInput.value=year;
 }
}
function renderRows(){
 const arr=visible(),pages=Math.max(1,Math.ceil(arr.length/STEP));
 page=Math.min(Math.max(0,page),pages-1);
 const rows=arr.slice(page*STEP,(page+1)*STEP);
 const today=dayBR();
 const root=$('cb-rows');
 if(root)root.innerHTML=rows.length?rows.map(f=>{
  const overdue=f.remaining>0&&f.due&&f.due<today;
  const todayDue=f.remaining>0&&f.due===today;
  const dueLabel=f.due?dateBR(f.due):'Não informado';
  const dueBadge=f.remaining>0&&!f.due?'<span class="cb-label cb-warn">Informar vencimento</span>':
   overdue?'<span class="cb-label cb-danger">Vencido</span>':
   todayDue?'<span class="cb-label cb-today">Vence hoje</span>':'';
  const statusClass=f.status==='declarada'?'cb-declared':
    ['conciliada','externa','mista'].includes(f.status)?'cb-paid':
    f.status==='parcial'?'cb-partial':'cb-unpaid';
  return '<tr>'+
   '<td><strong>'+esc(f.card)+'</strong><small>'+f.transactions+' lançamento(s)</small></td>'+
   '<td>'+esc(monthBR(f.period))+'</td>'+
   '<td class="money">'+money(f.total)+'</td>'+
   '<td class="money">'+(f.status==='declarada'&&f.paid===0?'—':money(f.paid))+
    (f.externalPaid>0?'<small>'+money(f.externalPaid)+' declarado sem extrato</small>':'')+'</td>'+
   '<td class="money"><strong>'+money(f.remaining)+'</strong></td>'+
   '<td>'+esc(dueLabel)+dueBadge+'</td>'+
   '<td><span class="cb-label '+statusClass+'">'+esc(stateLabels[f.status])+'</span>'+
    (f.status==='declarada'?'<small>Quitação declarada; confira os vínculos</small>':'')+'</td>'+
   '<td><div class="cb-row-actions">'+
    '<button type="button" class="btn cb-action" data-cb-action="pay" data-cb-id="'+esc(f.id)+'">'+
     (f.remaining>0?'Pagar fatura / adicionar pagamento':'Ver pagamentos')+'</button>'+
    (f.remaining>0?'<button type="button" class="btn cb-action" data-cb-action="agenda" data-cb-id="'+esc(f.id)+'">Vencimento</button>':'')+
    '</div></td></tr>';
 }).join(''):'<tr><td colspan="8" class="cb-empty">Nenhuma fatura corresponde aos filtros.</td></tr>';
 put('cb-page-count',arr.length+' fatura(s) na seleção · página '+(page+1)+' de '+pages);
 if($('cb-prev'))$('cb-prev').disabled=page===0;
 if($('cb-next'))$('cb-next').disabled=page>=pages-1;
}
function render(){
 if(!ready)return;
 renderFilters();renderMetrics();renderCards();renderRows();
 put('cb-status','Atualizado às '+
  new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())+
  '. Exibindo '+inScope().length+' de '+all.length+' fatura(s). Filtro visual, sem alterar o caixa.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
  put('cb-status','Conferindo histórico de faturas e conciliações...');
  const {data:allowed,error:accessError}=await db.rpc('fluxo_caixa_autorizado');
  if(accessError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
  const [inv,dec,partial,full,agenda]=await Promise.all([
   fetchAll(()=>db.from('fin_faturas_historicas')
    .select('id,cartao_nome,mes_fatura,valor_documental,quantidade_lancamentos')
    .order('id')),
   fetchAll(()=>db.from('fin_faturas_quitacoes_declaradas')
    .select('fatura_id').order('registrado_em',{ascending:true})),
   fetchAll(()=>db.from('fin_faturas_pagamentos_parciais')
    .select('fatura_id,origem,valor_pago').order('confirmado_em',{ascending:true})),
   fetchAll(()=>db.from('fin_comprovacoes_documentais')
    .select('fatura_id,valor_conferido').not('fatura_id','is',null)
    .order('conferido_em',{ascending:true})),
   fetchAll(()=>db.from('fin_faturas_agenda')
    .select('fatura_id,vencimento,observacoes').order('registrado_em',{ascending:true}))
  ]);
  all=buildInvoiceStates(inv,dec,partial,full,agenda);ready=true;render();
 })().catch(e=>{
  ready=false;all=[];
  put('cb-status','Não foi possível consultar faturas: '+(e.message||e));
  for(const id of ['cb-count','cb-open','cb-outstanding','cb-declared','cb-conciliated','cb-external','cb-partial','cb-undated'])put(id,'—');
  if($('cb-rows'))$('cb-rows').innerHTML='<tr><td colspan="8" class="cb-empty">Dados indisponíveis. Clique em Atualizar para tentar novamente.</td></tr>';
  if($('cb-card-summary'))$('cb-card-summary').textContent='Não foi possível consultar os cartões.';
 }).finally(()=>{loading=null});
 return loading;
}
async function openExisting(f,action){
 if(action==='pay'){
  // A ação pertence à aba Cartões. O modal de pagamento é movido ao body
  // na inicialização, portanto não é necessário navegar para Autopeças.
  if(typeof window.frDocumentLinksUI?.openInvoice!=='function')throw Error('Módulo de conciliação indisponível.');
  await window.frDocumentLinksUI.refresh?.(true);
  await window.frDocumentLinksUI.openInvoice(f.id);
 }else{
  window.frFinanceUI?.selectView?.('expenses');
  if(typeof window.frInvoicesAgendaUI?.refresh!=='function')throw Error('Agenda de vencimentos indisponível.');
  await window.frInvoicesAgendaUI.refresh();
  const type=$('ag-type'),status=$('ag-filter'),input=$('ag-search');
  if(type){type.value='cartao';type.dispatchEvent(new Event('change',{bubbles:true}))}
  if(status){status.value=f.due?'todos':'sem-data';status.dispatchEvent(new Event('change',{bubbles:true}))}
  if(input){input.value=f.card;input.dispatchEvent(new Event('input',{bubbles:true}))}
  $('ag-title')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
}
function csvCell(v){
 const str=String(v??''),safe=/^[\s]*[=+\-@]/.test(str)?"'"+str:str;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportCSV(){
 if(!ready)return;
 const rows=visible();
 const columns=[['Cartão consolidado','Nome original do cartão','Competência','Valor documental (R$)','Pagamento bancário vinculado (R$)','Saldo documental (R$)',
  'Vencimento informado','Situação']];
 rows.forEach(x=>columns.push([x.card,x.originalCard,dateBR(x.period),(x.total/100).toFixed(2).replace('.',','),
  x.status==='declarada'&&x.paid===0?'':(x.paid/100).toFixed(2).replace('.',','),
  (x.remaining/100).toFixed(2).replace('.',','),dateBR(x.due),stateLabels[x.status]]));
 const blob=new Blob(['\ufeff'+columns.map(x=>x.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download='FR_Motors_Faturas_Cartoes.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 if(!$('cb-rows'))return;
 if($('cb-show-other-cards')){
  $('cb-show-other-cards').checked=showOtherCards;
  $('cb-show-other-cards').addEventListener('change',e=>setShowOtherCards(e.target.checked));
 }
 $('cb-refresh')?.addEventListener('click',()=>refresh());
 $('cb-filter')?.addEventListener('change',e=>{filter=e.target.value;page=0;renderRows()});
 $('cb-sort')?.addEventListener('change',e=>{sort=e.target.value;page=0;renderRows()});
 $('cb-card')?.addEventListener('change',e=>{card=e.target.value;page=0;renderRows()});
 $('cb-year')?.addEventListener('change',e=>{year=e.target.value;page=0;renderRows()});
 $('cb-search')?.addEventListener('input',e=>{search=e.target.value.trim().toLocaleLowerCase('pt-BR');page=0;renderRows()});
 $('cb-prev')?.addEventListener('click',()=>{page=Math.max(0,page-1);renderRows()});
 $('cb-next')?.addEventListener('click',()=>{page++;renderRows()});
 $('cb-card-summary')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-cb-card]');if(!b)return;card=b.dataset.cbCard;
  if($('cb-card'))$('cb-card').value=card;page=0;renderRows();
  $('cb-detail-title')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('cb-rows')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-cb-action]');if(!b)return;
  const invoice=all.find(x=>x.id===b.dataset.cbId);if(!invoice)return;
  openExisting(invoice,b.dataset.cbAction).catch(err=>{
   window.frFinanceUI?.showToast?.('Não foi possível abrir a fatura: '+(err.message||err),true);
  });
 });
 $('cb-export')?.addEventListener('click',exportCSV);
 if(!document.querySelector('[data-view-panel="cardbills"]')?.hidden)refresh();
}
window.frCardBillsUI={refresh,__test:{buildInvoiceStates,visible,monthBR,money,cents,activeCard,inScope,setShowOtherCards}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();