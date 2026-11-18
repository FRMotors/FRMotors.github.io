/* FR Motors | Central de vencimentos: apenas compromissos pendentes.
 * Boletos a pagar e a receber são documentos, não movimentações de caixa.
 * Os alertas de atenção abrangem somente hoje e datas já vencidas.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(v)||0)/100);
const toCents=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0;};
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const put=(id,v)=>{if($(id))$(id).textContent=v;};
function today(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const val=k=>parts.find(p=>p.type===k)?.value||'';
 return val('year')+'-'+val('month')+'-'+val('day');
}
let records=[],ready=false,loading=null,selectedDate=null,category='todos';
const start=today().split('-');
let visibleYear=Number(start[0]),visibleMonth=Number(start[1])-1;
async function fetchAll(builder,max=10000){
 const out=[],step=450;
 for(let i=0;i<max;i+=step){
  const {data,error}=await builder().range(i,i+step-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<step)return out;
 }
 throw Error('Consulta excedeu o limite seguro. Nenhum total parcial foi apresentado.');
}
const dueStatus=(r,now)=>!r.due?'sem-data':r.due<now?'vencido':r.due===now?'hoje':'programado';
const sum=rows=>rows.reduce((v,r)=>v+r.amount,0);
const typeText=r=>r.kind==='pagar'?'A pagar':'A receber';
function createRecords(cp,manual,links,bankLinks,receivables){
 const linkedAccounts=new Set(links.map(x=>x.conta_pagar_id).filter(Boolean));
 const linkedManual=new Set([...links.map(x=>x.boleto_avulso_id),...bankLinks.map(x=>x.boleto_avulso_id)].filter(Boolean));
 const output=[];
 cp.filter(x=>x.situacao==='aberto'&&!linkedAccounts.has(x.id)).forEach(x=>{
  const value=toCents(x.valor_referencia);
  if(value>0)output.push({id:x.id,kind:'pagar',source:'planilha',due:x.vencimento||null,
   name:x.fornecedor_nome||x.descricao||'Fornecedor não informado',info:x.descricao||'Conta da planilha',
   amount:value,lookup:x.codigo_origem||x.fornecedor_nome||x.descricao||''});
 });
 manual.filter(x=>!x.excluido_em&&!linkedManual.has(x.id)).forEach(x=>{
  const value=toCents(x.valor_referencia);
  if(value>0)output.push({id:x.id,kind:'pagar',source:'avulso',due:x.vencimento||null,
   name:x.fornecedor_nome||'Fornecedor não informado',info:x.descricao||'Boleto cadastrado no aplicativo',
   amount:value,lookup:x.fornecedor_nome||x.descricao||''});
 });
 receivables.filter(x=>['aberto','parcial'].includes(x.situacao)).forEach(x=>{
  const value=Math.max(0,toCents(x.valor)-toCents(x.valor_recebido));
  if(value>0)output.push({id:x.id,kind:'receber',source:'cliente',due:x.vencimento||null,
   name:x.fin_receber_clientes?.nome||'Cliente não informado',
   info:[x.numero_documento,x.descricao].filter(Boolean).join(' · ')||'Boleto a receber',
   amount:value,lookup:x.numero_documento||x.fin_receber_clientes?.nome||x.descricao||''});
 });
 return output.sort((a,b)=>String(a.due||'9999-99-99').localeCompare(String(b.due||'9999-99-99'))||
    a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
}
function recordMarkup(r,now,compact=false){
 const st=dueStatus(r,now),label=st==='vencido'?'Vencido':st==='hoje'?'Vence hoje':st==='programado'?'Agendado':'Sem data';
 const nav=r.kind==='pagar'?'payables':'receivables';
 return '<div class="cv-record cv-record-'+esc(r.kind)+'">'+
  '<div class="cv-record-main">'+
   '<strong>'+esc(r.name)+'</strong><small>'+esc(r.info)+'</small>'+
   '<span class="cv-record-meta"><span class="cv-state cv-state-'+esc(st)+'">'+label+'</span> '+
    '<span>'+esc(dateBR(r.due))+'</span> '+(!compact?'<span>· '+esc(typeText(r))+'</span>':'')+'</span>'+
  '</div><div class="cv-record-right"><b>'+money(r.amount)+'</b>'+
  '<button type="button" class="btn cv-record-action" data-cv-open="'+nav+'" data-cv-query="'+esc(r.lookup)+'">Ver detalhes</button>'+
  '</div></div>';
}
function renderOverview(now){
 const urgent=records.filter(x=>x.due&&x.due<=now);
 const dueToday=urgent.filter(x=>x.due===now),overdue=urgent.filter(x=>x.due<now);
 put('cv-home-today',String(dueToday.length));
 put('cv-home-overdue',String(overdue.length));
 put('cv-home-receive',String(urgent.filter(x=>x.kind==='receber').length));
 put('cv-home-status',dueToday.length||overdue.length?
  'Existem compromissos que precisam de atenção. Confira os detalhes em Contas a pagar.':
  'Nenhuma conta vencida ou com vencimento hoje entre os registros pendentes.');
 const strip=$('cv-home-banner');if(strip)strip.classList.toggle('cv-home-clear',!urgent.length);
}
function renderAlertColumn(id,list,now,empty){
 const target=$(id);if(!target)return;
 const urgent=list.filter(x=>x.due&&x.due<=now);
 target.innerHTML=urgent.length?urgent.map(r=>recordMarkup(r,now,true)).join(''):
  '<div class="cv-empty"><strong>Tudo em dia por aqui.</strong><span>'+esc(empty)+'</span></div>';
}
function renderCalendar(now){
 const first=new Date(visibleYear,visibleMonth,1),year=first.getFullYear(),month=first.getMonth();
 const text=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(first);
 put('cv-month-title',text.charAt(0).toUpperCase()+text.slice(1));
 const prefix=year+'-'+String(month+1).padStart(2,'0');
 const byDate=new Map();
 records.forEach(x=>{
  if(!x.due||x.due.slice(0,7)!==prefix)return;
  const list=byDate.get(x.due)||[];list.push(x);byDate.set(x.due,list);
 });
 const week=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=>'<div class="cv-weekday">'+x+'</div>').join('');
 const pad=(first.getDay()+6)%7;let cells='';
 for(let i=0;i<pad;i++)cells+='<span class="cv-blank" aria-hidden="true"></span>';
 for(let d=1,total=new Date(year,month+1,0).getDate();d<=total;d++){
  const ymd=prefix+'-'+String(d).padStart(2,'0');
  const list=byDate.get(ymd)||[];
  const pay=list.filter(x=>x.kind==='pagar').length,receive=list.length-pay;
  const classes=['cv-day',ymd===now?'cv-day-today':'',ymd===selectedDate?'cv-day-selected':'',
   ymd<now?'cv-day-past':'',list.length?'cv-day-filled':''].filter(Boolean).join(' ');
  cells+='<button type="button" class="'+classes+'" data-cv-day="'+ymd+'" aria-pressed="'+(ymd===selectedDate)+
   '" aria-label="'+d+' de '+esc(text)+': '+pay+' a pagar, '+receive+' a receber">'+
   '<span class="cv-day-number">'+d+'</span><span class="cv-day-counts">'+
   (pay?'<span class="cv-dot cv-dot-pay">'+pay+' pagar</span>':'')+
   (receive?'<span class="cv-dot cv-dot-receive">'+receive+' receber</span>':'')+
   '</span></button>';
 }
 if($('cv-calendar'))$('cv-calendar').innerHTML=week+cells;
 put('cv-calendar-note',byDate.size?
  'Selecione um dia para consultar os boletos correspondentes. Clique novamente para voltar ao mês.':
  'Não há boletos pendentes com vencimento informado neste mês.');
}
function renderMonthList(now){
 const prefix=visibleYear+'-'+String(visibleMonth+1).padStart(2,'0');
 const result=records.filter(r=>r.due&&(selectedDate?r.due===selectedDate:r.due.slice(0,7)===prefix)&&
  (category==='todos'||category===r.kind));
 const title=selectedDate?'Boletos de '+dateBR(selectedDate):'Boletos do mês';
 put('cv-list-title',title);
 put('cv-list-count',result.length+' compromisso(s)'+(category==='todos'?'':' · '+(category==='pagar'?'a pagar':'a receber')));
 const root=$('cv-month-records');
 if(root)root.innerHTML=result.length?result.map(r=>recordMarkup(r,now)).join(''):
  '<div class="cv-empty"><strong>Nenhum boleto nesta seleção.</strong><span>Altere o mês, o tipo ou o dia selecionado.</span></div>';
 if($('cv-clear-day'))$('cv-clear-day').hidden=!selectedDate;
}
function render(){
 if(!ready)return;
 const now=today(),pay=records.filter(x=>x.kind==='pagar'),receive=records.filter(x=>x.kind==='receber');
 const todayPay=pay.filter(x=>x.due===now),oldPay=pay.filter(x=>x.due&&x.due<now);
 const todayRec=receive.filter(x=>x.due===now),oldRec=receive.filter(x=>x.due&&x.due<now);
 put('cv-today-date',dateBR(now));
 put('cv-pay-today-count',String(todayPay.length));put('cv-pay-today-value',money(sum(todayPay)));
 put('cv-pay-overdue-count',String(oldPay.length));put('cv-pay-overdue-value',money(sum(oldPay)));
 put('cv-receive-today-count',String(todayRec.length));put('cv-receive-today-value',money(sum(todayRec)));
 put('cv-receive-overdue-count',String(oldRec.length));put('cv-receive-overdue-value',money(sum(oldRec)));
 put('cv-pay-total',money(sum(pay)));put('cv-pay-total-count',String(pay.length));
 put('cv-receive-total',money(sum(receive)));put('cv-receive-total-count',String(receive.length));
 put('cv-undated-count',String(records.filter(x=>!x.due).length));
 renderOverview(now);
 renderAlertColumn('cv-pay-alerts',pay,now,'Nenhum boleto a pagar vence hoje ou está atrasado.');
 renderAlertColumn('cv-receive-alerts',receive,now,'Nenhum boleto a receber vence hoje ou está atrasado.');
 renderCalendar(now);renderMonthList(now);
 put('cv-status','Atualizado em '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())+
  '. Valores nominais em aberto, sem somá-los às movimentações do caixa.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Supabase indisponível.');
  put('cv-status','Consultando os vencimentos registrados...');
  const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
  if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
  const [cp,manual,links,bank,rec]=await Promise.all([
   fetchAll(()=>db.from('fin_contas_pagar').select('id,codigo_origem,fornecedor_nome,descricao,valor_referencia,vencimento,situacao').is('arquivado_em',null).order('id')),
   fetchAll(()=>db.from('fin_boletos_avulsos').select('id,fornecedor_nome,descricao,valor_referencia,vencimento,excluido_em').order('id')),
   fetchAll(()=>db.from('fin_baixas_operacionais').select('conta_pagar_id,boleto_avulso_id').order('id')),
   fetchAll(()=>db.from('fin_baixas_extrato_avulsos').select('boleto_avulso_id').order('id')),
   fetchAll(()=>db.from('fin_contas_receber').select('id,numero_documento,descricao,valor,valor_recebido,vencimento,situacao,fin_receber_clientes(nome)').order('id'))
  ]);
  records=createRecords(cp,manual,links,bank,rec);ready=true;render();
 })().catch(e=>{
   ready=false;
   put('cv-status','Não foi possível carregar a central: '+(e.message||e));
   put('cv-home-status','Alertas indisponíveis. Abra Contas a pagar ou tente atualizar.');
   ['cv-home-today','cv-home-overdue','cv-home-receive',
    'cv-pay-today-count','cv-pay-overdue-count','cv-receive-today-count','cv-receive-overdue-count',
    'cv-pay-today-value','cv-pay-overdue-value','cv-receive-today-value','cv-receive-overdue-value',
    'cv-pay-total','cv-receive-total','cv-pay-total-count','cv-receive-total-count'].forEach(id=>put(id,'—'));
   if($('cv-pay-alerts'))$('cv-pay-alerts').textContent='Dados temporariamente indisponíveis.';
   if($('cv-receive-alerts'))$('cv-receive-alerts').textContent='Dados temporariamente indisponíveis.';
   if($('cv-month-records'))$('cv-month-records').textContent='Não foi possível consultar os registros.';
 }).finally(()=>{loading=null});
 return loading;
}
function openSection(button){
 const destination=button.dataset.cvOpen;
 if(!['payables','receivables'].includes(destination))return;
 const nav=window.frFinanceUI?.selectView;
 if(typeof nav!=='function')return;
 nav(destination);
 if(destination==='payables'){
  const year=$('cp-year-filter'),mon=$('cp-month-filter'),status=$('cp-status-filter');
  if(year){year.value='todos';year.dispatchEvent(new Event('change',{bubbles:true}))}
  if(mon){mon.value='todos';mon.dispatchEvent(new Event('change',{bubbles:true}))}
  if(status){status.value='todos';status.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 if(destination==='receivables'&&$('ar-filter')){
  $('ar-filter').value='todos';$('ar-filter').dispatchEvent(new Event('change',{bubbles:true}));
 }
 const input=$(destination==='payables'?'cp-search':'ar-search');
 if(input){input.value=button.dataset.cvQuery||'';input.dispatchEvent(new Event('input',{bubbles:true}))}
 if(destination==='payables')$('fin-cp-operacional')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function init(){
 if(!$('cv-calendar'))return;
 $('cv-refresh')?.addEventListener('click',()=>refresh());
 $('cv-prev')?.addEventListener('click',()=>{visibleMonth--;if(visibleMonth<0){visibleMonth=11;visibleYear--}selectedDate=null;render()});
 $('cv-next')?.addEventListener('click',()=>{visibleMonth++;if(visibleMonth>11){visibleMonth=0;visibleYear++}selectedDate=null;render()});
 $('cv-current')?.addEventListener('click',()=>{const t=today().split('-');visibleYear=Number(t[0]);visibleMonth=Number(t[1])-1;selectedDate=null;render()});
 $('cv-kind')?.addEventListener('change',e=>{category=e.target.value;renderMonthList(today())});
 $('cv-clear-day')?.addEventListener('click',()=>{selectedDate=null;render()});
 $('cv-calendar')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-cv-day]');if(!button)return;
  selectedDate=selectedDate===button.dataset.cvDay?null:button.dataset.cvDay;
  render();
  $('cv-list-title')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('cv-metrics')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-cv-alert-kind]');if(!btn)return;
  const selected=btn.dataset.cvAlertKind;
  const kind=selected.includes('receive')?'receber':'pagar';
  category=kind;
  if($('cv-kind'))$('cv-kind').value=kind;
  const now=today();visibleYear=Number(now.slice(0,4));visibleMonth=Number(now.slice(5,7))-1;
  selectedDate=selected.includes('today')?now:null;
  render();
  if(selected.includes('today')&&$('cv-calendar-more'))$('cv-calendar-more').open=true;
  (selected.includes('today')?$('cv-list-title'):$(kind==='pagar'?'cv-pay-alerts':'cv-receive-alerts'))?.scrollIntoView({behavior:'smooth',block:'center'});
 });
 document.addEventListener('click',e=>{
  const button=e.target.closest('[data-cv-open]');if(button)openSection(button);
  const jump=e.target.closest('[data-cv-anchor]');
  if(jump?.dataset.cvAnchor==='fin-cp-operacional')$('fin-cp-operacional')?.scrollIntoView({behavior:'smooth',block:'start'});
 });
 const active=!document.querySelector('[data-view-panel="payables"]')?.hidden||
  !document.querySelector('[data-view-panel="overview"]')?.hidden;
 if(active)refresh();
}
window.frDeadlinesUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();