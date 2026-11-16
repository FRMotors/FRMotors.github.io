/* FR Motors | Agenda das faturas sem quitação registrada
 * Competência mensal NÃO é vencimento; prazos são informados pelo usuário.
 * Pagamentos parciais são referências a saídas existentes. Sem lançamento novo.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const cents=x=>Math.round(Number(x)*100);
const date=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Não informado';
const localDay=()=>{const d=new Date();return [
 String(d.getFullYear()).padStart(4,'0'),String(d.getMonth()+1).padStart(2,'0'),
 String(d.getDate()).padStart(2,'0')].join('-')};
const cmpMonth=x=>x?date(x).slice(3):'Mês desconhecido';
const out=(id,t)=>{if($(id))$(id).textContent=t};
let invoices=[],declarations=[],payments=[],fullPayments=[],deadlines=[];
let working=null,loading=null,filter='todos',month=new Date(),busy=false,page=0;
const PAGE_SIZE=10;
month=new Date(month.getFullYear(),month.getMonth(),1);
async function queryAll(builder,max=3000){
 const all=[],page=350;
 for(let offset=0;offset<max;offset+=page){
  const {data,error}=await builder().range(offset,offset+page-1);
  if(error)throw error;
  all.push(...(data||[]));
  if(!data||data.length<page)return all;
 }
 throw Error('Consulta maior que o limite seguro; confira a base.');
}
const declaredIds=()=>new Set(declarations.map(x=>x.fatura_id));
const agendaById=()=>new Map(deadlines.map(x=>[x.fatura_id,x]));
const partialById=()=>{
 const map=new Map();
 payments.forEach(x=>map.set(x.fatura_id,(map.get(x.fatura_id)||0)+cents(x.valor_pago)));
 return map;
};
const fullById=()=>new Map(fullPayments.filter(x=>x.fatura_id).map(x=>[x.fatura_id,x]));
function allActive(){
 const declared=declaredIds(),partials=partialById(),integral=fullById(),agenda=agendaById();
 return invoices.filter(x=>!declared.has(x.id)).map(f=>{
  const total=cents(f.valor_documental),
   paid=integral.has(f.id)?cents(integral.get(f.id).valor_conferido):(partials.get(f.id)||0),
   rest=Math.max(0,total-paid);
  return {...f,total,paid,rest,vencimento:agenda.get(f.id)?.vencimento||null,
   observacoes:agenda.get(f.id)?.observacoes||''};
 }).filter(x=>x.rest>0).sort((a,b)=>
  String(a.vencimento||'9999-99-99').localeCompare(String(b.vencimento||'9999-99-99'))||
  a.mes_fatura.localeCompare(b.mes_fatura)||a.cartao_nome.localeCompare(b.cartao_nome,'pt-BR'));
}
function condition(f,today){
 if(!f.vencimento)return 'sem-data';
 if(f.vencimento<today)return 'prazo-passado';
 const todayNumber=Date.parse(today+'T12:00:00Z');
 const dueNumber=Date.parse(f.vencimento+'T12:00:00Z');
 return dueNumber-todayNumber<=7*86400000?'proximos-7':'programada';
}
function situationText(f,today){
 const c=condition(f,today);
 const prefix=f.paid>0?'Parcialmente paga; ':'';
 return c==='sem-data'?prefix+'Vencimento não informado':
  c==='prazo-passado'?prefix+'Prazo passado, quitação não confirmada':
  c==='proximos-7'?prefix+'Vence nos próximos 7 dias':
  prefix+'Prazo programado';
}
function render(){
 const day=localDay(),pending=allActive();
 const noDate=pending.filter(f=>condition(f,day)==='sem-data');
 const overdue=pending.filter(f=>condition(f,day)==='prazo-passado');
 const soon=pending.filter(f=>condition(f,day)==='proximos-7');
 const partial=pending.filter(f=>f.paid>0);
 out('ag-count',String(pending.length));
 out('ag-total',brl(pending.reduce((s,f)=>s+f.rest,0)/100));
 out('ag-no-date',String(noDate.length));
 out('ag-overdue',String(overdue.length));
 out('ag-soon',String(soon.length));
 out('ag-partial',String(partial.length));
 const q=($('ag-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const rows=pending.filter(f=>{
  if(filter!=='todos'&&condition(f,day)!==filter&&!(filter==='parcial'&&f.paid>0))return false;
  return [f.cartao_nome,f.mes_fatura,f.vencimento,f.observacoes,
   f.valor_documental,f.rest/100].join(' ').toLocaleLowerCase('pt-BR').includes(q);
 });
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 page=Math.max(0,Math.min(page,pages-1));
 const visible=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 if($('ag-rows'))$('ag-rows').innerHTML=visible.length?visible.map(f=>{
  const status=condition(f,day);
  return '<tr id="ag-row-'+esc(f.id)+'" tabindex="-1">'+
   '<td><strong>'+esc(f.cartao_nome)+'</strong><small>'+f.quantidade_lancamentos+' lançamentos</small></td>'+
   '<td>'+esc(cmpMonth(f.mes_fatura))+'</td>'+
   '<td class="money">'+brl(f.valor_documental)+'</td>'+
   '<td class="money">'+brl(f.paid/100)+'</td>'+
   '<td class="money"><strong>'+brl(f.rest/100)+'</strong></td>'+
   '<td><strong>'+esc(f.vencimento?date(f.vencimento):'Sem data')+'</strong>'+
    (f.observacoes?'<small>'+esc(f.observacoes.slice(0,100))+'</small>':'')+'</td>'+
   '<td><span class="ag-state '+status+'">'+esc(situationText(f,day))+'</span></td>'+
   '<td><div class="ag-actions"><button type="button" class="btn" data-ag-edit="'+esc(f.id)+'">'+
    (f.vencimento?'Editar vencimento':'Informar vencimento')+'</button>'+
    '<button type="button" class="btn btn-teal" data-ag-pay="'+esc(f.id)+'">Adicionar pagamento</button></div></td></tr>';
 }).join(''):'<tr><td colspan="8" class="empty">Nenhuma fatura corresponde aos filtros. As faturas declaradas quitadas não fazem parte desta carteira.</td></tr>';
 out('ag-listed',rows.length+' fatura(s) com saldo · 10 por página · página '+(page+1)+' de '+pages);
 if($('ag-page-prev'))$('ag-page-prev').disabled=page===0;
 if($('ag-page-next'))$('ag-page-next').disabled=page>=pages-1;
 renderCalendar(pending);
}
function renderCalendar(pending){
 const name=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month);
 out('ag-month-label',name.charAt(0).toUpperCase()+name.slice(1));
 const year=month.getFullYear(),m=month.getMonth();
 const days=new Date(year,m+1,0).getDate();
 const start=(new Date(year,m,1).getDay()+6)%7;
 const due=new Map();
 pending.forEach(f=>{
  if(!f.vencimento||f.vencimento.slice(0,7)!==year+'-'+String(m+1).padStart(2,'0'))return;
  const list=due.get(f.vencimento)||[];
  list.push(f);due.set(f.vencimento,list);
 });
 const headers=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=>
  '<div class="ag-weekday">'+x+'</div>').join('');
 let cells='';
 for(let i=0;i<start;i++)cells+='<div class="ag-day ag-pad" aria-hidden="true"></div>';
 for(let d=1;d<=days;d++){
  const id=year+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const list=due.get(id)||[],today=id===localDay(),past=id<localDay();
  const cl='ag-day'+(list.length?' with-invoices':'')+(today?' is-today':'')+(past?' is-past':'');
  const content='<span class="ag-day-number">'+d+'</span>'+
   (list.length?'<small>'+list.length+' fatura(s)</small>':'');
  cells+=list.length?'<button type="button" class="'+cl+'" data-ag-day="'+id+
   '" aria-label="'+list.length+' faturas com vencimento em '+date(id)+'">'+content+'</button>':
   '<div class="'+cl+'">'+content+'</div>';
 }
 if($('ag-calendar'))$('ag-calendar').innerHTML=headers+cells;
 out('ag-calendar-note',due.size?
  'Os dias marcados mostram datas informadas. Clique para localizar as faturas.':
  'Nenhum vencimento informado para este mês. Informe as datas reais para preencher o calendário.');
}
function edit(id){
 const f=allActive().find(x=>x.id===id);
 if(!f)return;
 working=id;
 out('ag-edit-title','Vencimento · '+f.cartao_nome+' · '+cmpMonth(f.mes_fatura));
 out('ag-edit-summary','Valor da fatura: '+brl(f.valor_documental)+
  ' · Total vinculado: '+brl(f.paid/100)+' · Saldo a conferir: '+brl(f.rest/100));
 $('ag-date').value=f.vencimento||'';
 $('ag-notes').value=f.observacoes||'';
 out('ag-edit-error','Informe a data que aparece na fatura ou deixe em branco se ainda não souber.');
 const dlg=$('ag-dialog');
 if(dlg?.showModal)dlg.showModal();else dlg?.setAttribute('open','');
}
async function save(event){
 event.preventDefault();
 if(!working||busy)return;
 const f=allActive().find(x=>x.id===working);
 if(!f)return;
 const value=$('ag-date').value||null;
 const notes=$('ag-notes').value.trim();
 if(notes.length>1000){out('ag-edit-error','Observação muito longa.');return}
 busy=true;$('ag-save').disabled=true;
 try{
  const {data,error}=await db.rpc('fin_fatura_agenda_salvar',{
   p_fatura:f.id,p_vencimento:value,p_observacoes:notes
  });
  if(error)throw error;
  if(data?.resultado!=='salvo')throw Error('O servidor não confirmou o registro.');
  if($('ag-dialog')?.open)$('ag-dialog').close();
  working=null;
  await refresh();
  window.frFinanceUI?.showToast('Vencimento registrado. Nenhum pagamento foi criado.');
 }catch(e){
  out('ag-edit-error','Não foi possível salvar vencimento: '+(e.message||e));
 }finally{busy=false;$('ag-save').disabled=false}
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
   out('ag-status','Carregando faturas, saldos e vencimentos...');
   const {data:authorized,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||authorized!==true)throw Error('Acesso ao financeiro não autorizado.');
   const [inv,dec,par,full,ag]=await Promise.all([
    queryAll(()=>db.from('fin_faturas_historicas')
     .select('id,cartao_nome,mes_fatura,valor_documental,quantidade_lancamentos')
     .order('mes_fatura',{ascending:true})),
    queryAll(()=>db.from('fin_faturas_quitacoes_declaradas')
     .select('fatura_id').order('registrado_em',{ascending:false})),
    queryAll(()=>db.from('fin_faturas_pagamentos_parciais')
     .select('fatura_id,valor_pago').order('confirmado_em',{ascending:false})),
    queryAll(()=>db.from('fin_comprovacoes_documentais')
     .select('fatura_id,valor_conferido').not('fatura_id','is',null)
     .order('conferido_em',{ascending:false})),
    queryAll(()=>db.from('fin_faturas_agenda')
     .select('fatura_id,vencimento,observacoes').order('registrado_em',{ascending:false}))
   ]);
   invoices=inv;declarations=dec;payments=par;fullPayments=full;deadlines=ag;
   render();
   const left=allActive().length;
   out('ag-status',left+' fatura(s) sem quitação registrada, '+declarations.length+
    ' quitadas por confirmação histórica, '+ag.filter(x=>x.vencimento).length+
    ' com data real de vencimento. Saldos documentais não são saldo bancário.');
  }catch(e){
   out('ag-status','Erro ao consultar agenda: '+(e.message||e));
   if($('ag-rows'))$('ag-rows').innerHTML='<tr><td colspan="8" class="empty">Não foi possível carregar a agenda.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!$('ag-rows'))return;
 $('ag-search')?.addEventListener('input',()=>{page=0;render()});
 $('ag-filter')?.addEventListener('change',x=>{filter=x.target.value;page=0;render()});
 $('ag-page-prev')?.addEventListener('click',()=>{page--;render()});
 $('ag-page-next')?.addEventListener('click',()=>{page++;render()});
 $('ag-prev')?.addEventListener('click',()=>{
  month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar(allActive())
 });
 $('ag-next')?.addEventListener('click',()=>{
  month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar(allActive())
 });
 $('ag-today')?.addEventListener('click',()=>{
  const now=new Date();month=new Date(now.getFullYear(),now.getMonth(),1);renderCalendar(allActive())
 });
 $('ag-calendar')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-ag-day]');
  if(!btn)return;
  filter='todos';if($('ag-filter'))$('ag-filter').value='todos';
  if($('ag-search'))$('ag-search').value='';
  const rows=allActive();
  const index=rows.findIndex(x=>x.vencimento===btn.dataset.agDay);
  page=index<0?0:Math.floor(index/PAGE_SIZE);
  render();
  const f=rows.find(x=>x.vencimento===btn.dataset.agDay);
  const row=f&&$('ag-row-'+f.id);
  row?.scrollIntoView({behavior:'smooth',block:'center'});
  row?.focus({preventScroll:true});
 });
 $('ag-rows')?.addEventListener('click',e=>{
  const setDate=e.target.closest('[data-ag-edit]');
  const pay=e.target.closest('[data-ag-pay]');
  if(setDate)edit(setDate.dataset.agEdit);
  else if(pay){
   const linked=window.frDocumentLinksUI?.openInvoice;
   if(typeof linked!=='function'){
    out('ag-status','O módulo de pagamentos não está disponível. Atualize a página.');
    return;
   }
   linked(pay.dataset.agPay).catch(error=>{
    out('ag-status','Não foi possível abrir a fatura: '+(error.message||error));
   });
  }
 });
 $('ag-form')?.addEventListener('submit',save);
 $('ag-close')?.addEventListener('click',()=>{if(!busy&&$('ag-dialog')?.open)$('ag-dialog').close()});
 $('ag-cancel')?.addEventListener('click',()=>{if(!busy&&$('ag-dialog')?.open)$('ag-dialog').close()});
 $('ag-dialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('ag-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(!document.querySelector('[data-view-panel="expenses"]')?.hidden)refresh().catch(()=>{});
}
window.frInvoicesAgendaUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();