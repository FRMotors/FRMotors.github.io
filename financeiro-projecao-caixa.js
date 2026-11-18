/* FR Motors | Projeção documental de caixa
 * Read-only. Não estima receitas recorrentes nem presume pagamentos em datas passadas.
 * Só entram nos horizontes documentos ainda em aberto com vencimento conhecido.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brlCents=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
const cents=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0;};
const localDate=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=type=>parts.find(p=>p.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
};
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const plusDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const put=(id,value)=>{if($(id))$(id).textContent=value};
const sourceLabels={planilha:'Conta homologada',avulso:'Boleto do site',receber:'Boleto do cliente'};
let items=[],movements=[],pendingCards=[],reference=null,loaded=false,loading=null,period=30,activeCategory='todos',recordsPage=0;
const PAGE=18;
async function allRows(builder,max=12000){
 const result=[],size=450;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await builder().range(offset,offset+size-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<size)return result;
 }
 throw Error('Consulta atingiu o limite seguro; nenhum indicador parcial foi apresentado.');
}
function assemble(accounts,manual,links,bankLinks,receivables){
 const paidAccounts=new Set(links.filter(x=>x.conta_pagar_id).map(x=>x.conta_pagar_id));
 const paidManual=new Set([...links.map(x=>x.boleto_avulso_id),...bankLinks.map(x=>x.boleto_avulso_id)].filter(Boolean));
 const out=[];
 accounts.filter(r=>r.situacao==='aberto'&&!paidAccounts.has(r.id)).forEach(r=>{
  const amt=cents(r.valor_referencia);
  if(amt<=0)return;
  out.push({id:r.id,kind:'saida',source:'planilha',due:r.vencimento||null,amount:amt,
    name:r.fornecedor_nome||'Fornecedor não informado',description:r.descricao||''});
 });
 manual.filter(r=>!r.excluido_em&&!paidManual.has(r.id)).forEach(r=>{
  const amt=cents(r.valor_referencia);
  if(amt<=0)return;
  out.push({id:r.id,kind:'saida',source:'avulso',due:r.vencimento||null,amount:amt,
    name:r.fornecedor_nome||'Fornecedor não informado',description:r.descricao||''});
 });
 receivables.filter(r=>['aberto','parcial'].includes(r.situacao)).forEach(r=>{
  const amt=Math.max(0,cents(r.valor)-cents(r.valor_recebido));
  if(amt<=0)return;
  out.push({id:r.id,kind:'entrada',source:'receber',due:r.vencimento||null,amount:amt,
    name:r.fin_receber_clientes?.nome||'Cliente não informado',
    description:[r.numero_documento,r.descricao].filter(Boolean).join(' · ')});
 });
 return out.sort((a,b)=>String(a.due||'9999-99-99').localeCompare(String(b.due||'9999-99-99'))||
   a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
}
function cardPending(invoices,declarations,partials,fulls,deadlines){
 const declared=new Set(declarations.map(x=>x.fatura_id));
 const paid=new Map(),integral=new Map(),due=new Map();
 partials.forEach(p=>paid.set(p.fatura_id,(paid.get(p.fatura_id)||0)+cents(p.valor_pago)));
 fulls.forEach(p=>integral.set(p.fatura_id,(integral.get(p.fatura_id)||0)+cents(p.valor_conferido)));
 deadlines.forEach(x=>{if(x.vencimento)due.set(x.fatura_id,x.vencimento)});
 return invoices.filter(x=>!declared.has(x.id)).map(x=>{
  const total=cents(x.valor_documental),paidCents=Math.max(paid.get(x.id)||0,integral.get(x.id)||0);
  return {id:x.id,name:x.cartao_nome,reference:x.mes_fatura,
   due:due.get(x.id)||null,amount:Math.max(0,total-paidCents)};
 }).filter(x=>x.amount>0);
}
function compute(rows,now,days){
 const end=plusDays(now,days-1);
 const scheduled=rows.filter(x=>x.due&&x.due>=now&&x.due<=end);
 const late=rows.filter(x=>x.due&&x.due<now);
 const nodate=rows.filter(x=>!x.due);
 const total=kind=>scheduled.filter(x=>x.kind===kind).reduce((s,x)=>s+x.amount,0);
 const lateSum=kind=>late.filter(x=>x.kind===kind).reduce((s,x)=>s+x.amount,0);
 const pay=total('saida'),receive=total('entrada');
 return {end,scheduled,late,nodate,pay,receive,net:receive-pay,
  latePay:lateSum('saida'),lateReceive:lateSum('entrada')};
}
function history(rows,now,days){
 const start=plusDays(now,-days);
 const historyRows=rows.filter(r=>r.estado==='confirmado'&&r.data_movimento&&r.data_movimento>=start&&r.data_movimento<now);
 const sum=kind=>historyRows.filter(r=>r.tipo===kind).reduce((v,r)=>v+cents(r.valor),0);
 const inValue=sum('entrada'),outValue=sum('saida');
 return {from:start,to:plusDays(now,-1),count:historyRows.length,inValue,outValue,net:inValue-outValue};
}
function forecastColumns(now,days=period){
 const groups=[];
 for(let start=0;start<days;start+=15){
  const stop=Math.min(days-1,start+14);
  const from=plusDays(now,start),to=plusDays(now,stop);
  const rows=items.filter(x=>x.due&&x.due>=from&&x.due<=to);
  const entry=rows.filter(x=>x.kind==='entrada').reduce((s,x)=>s+x.amount,0);
  const out=rows.filter(x=>x.kind==='saida').reduce((s,x)=>s+x.amount,0);
  groups.push({from,to,entry,out,net:entry-out,count:rows.length});
 }
 return groups;
}
function renderBars(now){
 const groups=forecastColumns(now),max=Math.max(1,...groups.map(x=>Math.max(x.entry,x.out)));
 const root=$('fc-bars');if(!root)return;
 root.innerHTML=groups.map(x=>{
  const ep=Math.max(0,Math.round((x.entry/max)*100)),op=Math.max(0,Math.round((x.out/max)*100));
  return '<div class="fc-bar-row">'+
   '<div class="fc-bar-title"><strong>'+esc(dateBR(x.from))+' a '+esc(dateBR(x.to))+'</strong>'+
    '<span>'+x.count+' registro(s)</span></div>'+
   '<div class="fc-bar-series"><div class="fc-bar-track"><span class="fc-bar-fill fc-bar-in" style="width:'+ep+'%"></span></div>'+
    '<b class="fc-bar-number">'+brlCents(x.entry)+'</b></div>'+
   '<div class="fc-bar-series"><div class="fc-bar-track"><span class="fc-bar-fill fc-bar-out" style="width:'+op+'%"></span></div>'+
    '<b class="fc-bar-number">'+brlCents(x.out)+'</b></div>'+
   '</div>';
 }).join('')||'<p class="fc-empty">Nenhuma data futura identificada.</p>';
}
function currentScenario(base,forecast,includeLate){
 return base+forecast.net+(includeLate?forecast.lateReceive-forecast.latePay:0);
}
function renderScenario(forecast){
 const text=($('fc-initial')?.value||'').trim().replace(',','.');
 const output=$('fc-scenario-value');
 const source=$('fc-scenario-note');
 if(!output||!source)return;
 if(!text){output.textContent='Informe um valor';output.classList.remove('fc-negative');source.textContent=
  'Saldo inicial opcional e informado manualmente. Nenhum dado será salvo no banco.';return}
 const parsed=Number(text);
 if(!Number.isFinite(parsed)||Math.abs(parsed)>999999999){
  output.textContent='Valor inválido';output.classList.remove('fc-negative');
  source.textContent='Informe um número válido, em reais, para simular o saldo.';return
 }
 const includeLate=$('fc-include-overdue')?.checked===true;
 const total=currentScenario(cents(parsed),forecast,includeLate);
 output.textContent=brlCents(total);output.classList.toggle('fc-negative',total<0);
 source.textContent='Simulação = saldo digitado + recebimentos previstos − pagamentos previstos'+
  (includeLate?' + recebimentos vencidos − pagamentos vencidos.':' . Vencidos fora da simulação.')+
  ' Não é saldo bancário verificado nem promessa de recebimento.';
}
function recordRow(x,now){
 const overdue=x.due&&x.due<now,missing=!x.due;
 const label=overdue?'Vencido':missing?'Sem data':x.due===now?'Hoje':'A vencer';
 const cls=overdue?'late':missing?'nodate':x.due===now?'today':'future';
 return '<div class="fc-record"><div class="fc-record-top"><span class="fc-pill fc-pill-'+(x.kind==='saida'?'out':'in')+'">'+
  (x.kind==='saida'?'A pagar':'A receber')+'</span><span class="fc-pill fc-pill-'+cls+'">'+label+'</span></div>'+
  '<div class="fc-record-main"><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.description||sourceLabels[x.source])+'</small>'+
   '<span class="fc-record-date">'+esc(dateBR(x.due))+' · '+esc(sourceLabels[x.source])+'</span></div>'+
  '<div class="fc-record-right"><b>'+brlCents(x.amount)+'</b>'+
    '<button type="button" class="btn fc-detail-button" data-fc-nav="'+(x.kind==='saida'?'payables':'receivables')+'" data-fc-search="'+esc(x.name)+'">Ver detalhes</button>'+
  '</div></div></div>';
}
function renderDetailList(now,forecast){
 let showing=items.filter(x=>x.due&&x.due>=now&&x.due<=forecast.end);
 if(activeCategory==='saida')showing=showing.filter(x=>x.kind==='saida');
 if(activeCategory==='entrada')showing=showing.filter(x=>x.kind==='entrada');
 const count=showing.length,numberPages=Math.max(1,Math.ceil(count/PAGE));
 recordsPage=Math.min(recordsPage,numberPages-1);
 const page=showing.slice(recordsPage*PAGE,(recordsPage+1)*PAGE);
 if($('fc-records'))$('fc-records').innerHTML=page.length?page.map(x=>recordRow(x,now)).join(''):
  '<div class="fc-empty">Nenhum compromisso com vencimento neste intervalo e filtro.</div>';
 put('fc-record-count',count+' registro(s) · página '+(recordsPage+1)+' de '+numberPages);
 if($('fc-page-prev'))$('fc-page-prev').disabled=recordsPage===0;
 if($('fc-page-next'))$('fc-page-next').disabled=recordsPage>=numberPages-1;
}
function renderCoverage(forecast){
 const cardSum=pendingCards.reduce((s,x)=>s+x.amount,0);
 const noDateOut=forecast.nodate.filter(x=>x.kind==='saida'),
 noDateIn=forecast.nodate.filter(x=>x.kind==='entrada');
 put('fc-late-pay',brlCents(forecast.latePay));
 put('fc-late-pay-count',String(forecast.late.filter(x=>x.kind==='saida').length));
 put('fc-late-receive',brlCents(forecast.lateReceive));
 put('fc-late-receive-count',String(forecast.late.filter(x=>x.kind==='entrada').length));
 put('fc-no-date-count',String(forecast.nodate.length));
 put('fc-no-date-pay',brlCents(noDateOut.reduce((s,x)=>s+x.amount,0)));
 put('fc-no-date-receive',brlCents(noDateIn.reduce((s,x)=>s+x.amount,0)));
 put('fc-cards-count',String(pendingCards.length));
 put('fc-cards-total',brlCents(cardSum));
 put('fc-cards-undated-count',String(pendingCards.filter(x=>!x.due).length));
 if($('fc-cards-status'))$('fc-cards-status').textContent=pendingCards.length?
  'Faturas históricas com saldo documental ficam fora da projeção principal para evitar dupla contagem. Confirme suas datas e conciliações na agenda de cartões.':
  'Não há faturas de cartão com saldo documental pendente.';
}
function renderBank(){
 if(!reference){put('fc-bank-balance','Sem referência');put('fc-bank-description','Nenhum saldo de referência disponível.');return}
 put('fc-bank-balance',brlCents(cents(reference.saldo)));
 put('fc-bank-description','Saldo informado de '+String(reference.conta||'conta').toUpperCase()+' em '+
  dateBR(reference.data_referencia)+'. NÃO representa o caixa consolidado e não é usado automaticamente nas projeções.');
}
function render(){
 if(!loaded)return;
 const now=localDate();
 const forecast=compute(items,now,period),historical=history(movements,now,30);
 for(const n of [30,60,90]){
  const r=compute(items,now,n),isActive=n===period;
  const btn=$('fc-horizon-'+n);
  if(btn){btn.classList.toggle('active',isActive);btn.setAttribute('aria-pressed',String(isActive))}
  put('fc-'+n+'-in',brlCents(r.receive));put('fc-'+n+'-out',brlCents(r.pay));
  put('fc-'+n+'-net',brlCents(r.net));put('fc-'+n+'-counts',
   r.scheduled.filter(x=>x.kind==='entrada').length+' recebimento(s) · '+
   r.scheduled.filter(x=>x.kind==='saida').length+' pagamento(s)');
 }
 put('fc-period-title','Compromissos com vencimento nos próximos '+period+' dias');
 put('fc-current-range',dateBR(now)+' a '+dateBR(forecast.end));
 put('fc-now',dateBR(now));
 put('fc-hist-in',brlCents(historical.inValue));
 put('fc-hist-out',brlCents(historical.outValue));
 put('fc-hist-net',brlCents(historical.net));
 put('fc-hist-period',dateBR(historical.from)+' a '+dateBR(historical.to)+
  ' · '+historical.count+' movimentações confirmadas');
 const net=$('fc-current-net');if(net){net.textContent=brlCents(forecast.net);net.classList.toggle('fc-negative',forecast.net<0)}
 put('fc-current-in',brlCents(forecast.receive));put('fc-current-out',brlCents(forecast.pay));
 put('fc-current-count',String(forecast.scheduled.length));
 renderBars(now);renderDetailList(now,forecast);renderCoverage(forecast);renderBank();renderScenario(forecast);
 put('fc-status','Dados conferidos em '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())+
  '. Consulta somente leitura. Sem estimar movimento futuro não documentado.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão com Supabase indisponível.');
  put('fc-status','Consultando registros oficiais e saldos de referência...');
  const {data:allowed,error:authErr}=await db.rpc('fluxo_caixa_autorizado');
  if(authErr||allowed!==true)throw Error('Usuário não autorizado a consultar o financeiro.');
  const [pay,manual,links,bankLinks,receivables,moves,invoices,declared,partials,confirmed,cardDates]=await Promise.all([
   allRows(()=>db.from('fin_contas_pagar').select('id,fornecedor_nome,descricao,vencimento,valor_referencia,situacao').is('arquivado_em',null).order('id')),
   allRows(()=>db.from('fin_boletos_avulsos').select('id,fornecedor_nome,descricao,vencimento,valor_referencia,excluido_em').order('id')),
   allRows(()=>db.from('fin_baixas_operacionais').select('conta_pagar_id,boleto_avulso_id').order('id')),
   allRows(()=>db.from('fin_baixas_extrato_avulsos').select('boleto_avulso_id').order('id')),
   allRows(()=>db.from('fin_contas_receber').select('id,numero_documento,descricao,vencimento,valor,valor_recebido,situacao,fin_receber_clientes(nome)').order('id')),
   allRows(()=>db.from('fin_movimentos').select('id,tipo,data_movimento,valor,estado').order('id')),
   allRows(()=>db.from('fin_faturas_historicas').select('id,cartao_nome,mes_fatura,valor_documental').order('id')),
   allRows(()=>db.from('fin_faturas_quitacoes_declaradas').select('fatura_id').order('id')),
   allRows(()=>db.from('fin_faturas_pagamentos_parciais').select('fatura_id,valor_pago').order('id')),
   allRows(()=>db.from('fin_comprovacoes_documentais').select('id,fatura_id,valor_conferido').order('id')),
   allRows(()=>db.from('fin_faturas_agenda').select('fatura_id,vencimento').order('id'))
  ]);
  // O saldo bancário é uma referência auxiliar: uma falha de acesso não esconde os compromissos.
  let bank=null;
  try{
   const refs=await allRows(()=>db.from('fin_saldos_bancarios_referencia').select('conta,data_referencia,saldo,origem').order('data_referencia',{ascending:false}).order('id',{ascending:false}),1000);
   bank=refs[0]||null;
  }catch(_){bank=null}
  items=assemble(pay,manual,links,bankLinks,receivables);
  movements=moves;
  pendingCards=cardPending(invoices,declared,partials,confirmed,cardDates);
  reference=bank;loaded=true;render();
 })().catch(e=>{
  loaded=false;
  put('fc-status','Não foi possível gerar a projeção: '+(e.message||e));
  if($('fc-records'))$('fc-records').textContent='Dados indisponíveis. Atualize após verificar a conexão.';
  if($('fc-bars'))$('fc-bars').textContent='Não foi possível consultar as datas.';
  ['fc-current-in','fc-current-out','fc-current-net','fc-hist-in','fc-hist-out','fc-hist-net'].forEach(id=>put(id,'—'));
 }).finally(()=>{loading=null});
 return loading;
}
function navTo(button){
 const to=button.dataset.fcNav;if(!['payables','receivables'].includes(to))return;
 window.frFinanceUI?.selectView?.(to);
 if(to==='payables'){
  const year=$('cp-year-filter'),month=$('cp-month-filter'),status=$('cp-status-filter');
  if(year){year.value='todos';year.dispatchEvent(new Event('change',{bubbles:true}))}
  if(month){month.value='todos';month.dispatchEvent(new Event('change',{bubbles:true}))}
  if(status){status.value='todos';status.dispatchEvent(new Event('change',{bubbles:true}))}
 }else if($('ar-filter')){
  $('ar-filter').value='todos';$('ar-filter').dispatchEvent(new Event('change',{bubbles:true}));
 }
 const input=$(to==='payables'?'cp-search':'ar-search');
 if(input){input.value=button.dataset.fcSearch||'';input.dispatchEvent(new Event('input',{bubbles:true}))}
}
function init(){
 if(!$('fc-bars'))return;
 [30,60,90].forEach(n=>$('fc-horizon-'+n)?.addEventListener('click',()=>{period=n;recordsPage=0;render()}));
 $('fc-initial')?.addEventListener('input',()=>{if(loaded)renderScenario(compute(items,localDate(),period))});
 $('fc-include-overdue')?.addEventListener('change',()=>{if(loaded)renderScenario(compute(items,localDate(),period))});
 $('fc-kind')?.addEventListener('change',e=>{activeCategory=e.target.value;recordsPage=0;render()});
 $('fc-page-prev')?.addEventListener('click',()=>{recordsPage=Math.max(0,recordsPage-1);render()});
 $('fc-page-next')?.addEventListener('click',()=>{recordsPage++;render()});
 $('fc-refresh')?.addEventListener('click',()=>refresh());
 $('fc-records')?.addEventListener('click',e=>{const btn=e.target.closest('[data-fc-nav]');if(btn)navTo(btn)});
 if(!document.querySelector('[data-view-panel="forecast"]')?.hidden)refresh();
}
window.frForecastUI={refresh,__test:{assemble,compute,history,cardPending,currentScenario,plusDays}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();