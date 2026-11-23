/* FR Motors | Agenda unificada de boletos, faturas e contas a receber.
 * Vencimentos da carteira operacional e dos boletos manuais são reais.
 * Faturas usam somente as datas da agenda informadas pelo usuário.
 * Nenhum compromisso gera saída bancária por aparecer neste calendário.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'');
const boletoCore=window.frAgendaBoletosCore;
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
let bills=[],manualBills=[],installmentBills=[],supplierNames=new Map(),billLinks=[],manualBankLinks=[],receivables=[];
let working=null,loading=null,filter='todos',typeFilter='todos',selectedDay=null,month=new Date(),busy=false,page=0;
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
function allActive(){
 const engine=window.frInvoiceStateCore;
 if(!engine)throw Error('Motor de situação das faturas indisponível.');
 return engine.buildInvoiceStates(invoices,declarations,payments,fullPayments,deadlines,cardName)
  .filter(f=>f.remaining>0)
  .map(f=>({
   id:f.id,cartao_nome:f.originalCard,mes_fatura:f.period,
   quantidade_lancamentos:f.transactions,valor_documental:f.total/100,
   total:f.total,paid:f.paid,rest:f.remaining,vencimento:f.due,observacoes:f.notes
  }))
  .sort((a,b)=>String(a.vencimento||'9999-99-99').localeCompare(String(b.vencimento||'9999-99-99'))||
   String(a.mes_fatura).localeCompare(String(b.mes_fatura))||
   cardName(a.cartao_nome).localeCompare(cardName(b.cartao_nome),'pt-BR'));
}
/* A carteira de boletos é documental. Se já há baixa vinculada, não aparece
 * novamente como vencimento pendente e nunca é somada como saída do caixa. */
function allAgendaItems(){
 const cards=allActive().map(f=>({...f,kind:'cartao',agendaId:'cartao:'+f.id,
  title:cardName(f.cartao_nome),details:'Fatura '+cmpMonth(f.mes_fatura),source:'Cartão'}));
 const linkedCp=new Set(billLinks.filter(x=>x.conta_pagar_id).map(x=>x.conta_pagar_id));
 const linkedManual=new Set([
  ...billLinks.filter(x=>x.boleto_avulso_id).map(x=>x.boleto_avulso_id),
  ...manualBankLinks.map(x=>x.boleto_avulso_id)
 ]);
 const paidStates=new Set(['conciliado_extrato','conciliado_fluxo','pago','quitado','liquidado']);
 const openAccounts=bills.filter(x=>!linkedCp.has(x.id)&&!paidStates.has(String(x.situacao||'').toLowerCase()))
 .map(x=>{
  const amount=cents(x.valor_referencia);
  return {...x,kind:'boleto',origin:'conta',agendaId:'conta:'+x.id,
   title:x.fornecedor_nome,details:x.descricao,source:'Planilha de contas',
   total:amount,paid:0,rest:amount};
 });
 const openManual=manualBills.filter(x=>!linkedManual.has(x.id))
 .map(x=>{
  const amount=cents(x.valor_referencia);
  return {...x,kind:'boleto',origin:'avulso',agendaId:'avulso:'+x.id,
   title:x.fornecedor_nome,details:x.descricao,source:'Cadastrado no aplicativo',
   total:amount,paid:0,rest:amount};
 });
 // Inclui tanto compras em boleto com 1 parcela (boleto único) quanto
 // compras parceladas, exclusivamente enquanto a parcela estiver aberta.
 if(!boletoCore)throw Error('Módulo de parcelas dos boletos não carregado.');
 const openInstallments=boletoCore.openInstallments(installmentBills,supplierNames).map(x=>({
  id:x.id,compra_id:x.compraId,numero:x.numero,kind:'boleto',origin:'parcela',
  agendaId:'parcela:'+x.id,title:x.fornecedor,
  details:(x.numero?'Parcela '+x.numero+' · ':'')+x.descricao,
  source:'Compra em boleto',vencimento:x.vencimento,observacoes:null,
  total:x.valorCentavos,paid:0,rest:x.valorCentavos
 }));
 const receivableItems=receivables.filter(x=>['aberto','parcial'].includes(String(x.situacao||'').toLowerCase()))
 .map(x=>{
  const total=cents(x.valor),paid=Math.max(0,cents(x.valor_recebido));
  return {...x,kind:'receber',agendaId:'receber:'+x.id,origin:'cliente',
   title:x.fin_receber_clientes?.nome||'Cliente não informado',
   details:[x.numero_documento,x.descricao].filter(Boolean).join(' · '),source:'Contas a receber',
   total,paid,rest:Math.max(0,total-paid),vencimento:x.vencimento||null};
 });
 return [...cards,...openAccounts,...openManual,...openInstallments,...receivableItems]
  .filter(x=>Number.isSafeInteger(x.rest)&&x.rest>0)
  .sort((a,b)=>String(a.vencimento||'9999-99-99').localeCompare(String(b.vencimento||'9999-99-99'))||
   String(a.title).localeCompare(String(b.title),'pt-BR')||
   String(a.agendaId).localeCompare(String(b.agendaId)));
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
 const day=localDay(),pending=allAgendaItems();
 const noDate=pending.filter(f=>condition(f,day)==='sem-data');
 const overdue=pending.filter(f=>condition(f,day)==='prazo-passado');
 const soon=pending.filter(f=>condition(f,day)==='proximos-7');
 const partial=pending.filter(f=>f.kind==='cartao'&&f.paid>0);
 const cardCount=pending.filter(f=>f.kind==='cartao').length;
 const billCount=pending.filter(f=>f.kind==='boleto').length;
 const receiveCount=pending.filter(f=>f.kind==='receber').length;
 out('ag-count',String(pending.length));
 out('ag-count-detail',billCount+' boleto(s), '+cardCount+' fatura(s) e '+receiveCount+' a receber');
 out('ag-total',brl(pending.filter(f=>f.kind!=='receber').reduce((s,f)=>s+f.rest,0)/100));
 out('ag-receive-total',brl(pending.filter(f=>f.kind==='receber').reduce((s,f)=>s+f.rest,0)/100));
 out('ag-no-date',String(noDate.length));
 out('ag-overdue',String(overdue.length));
 out('ag-soon',String(soon.length));
 out('ag-partial',String(partial.length));
 if($('ag-clear-day'))$('ag-clear-day').hidden=!selectedDay;
 const q=($('ag-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const rows=pending.filter(f=>{
  if(selectedDay&&f.vencimento!==selectedDay)return false;
  if(typeFilter!=='todos'&&f.kind!==typeFilter)return false;
  if(filter!=='todos'&&condition(f,day)!==filter&&!(filter==='parcial'&&f.kind==='cartao'&&f.paid>0))return false;
  return [f.title,f.details,f.source,f.categoria,f.mes_fatura,f.vencimento,f.observacoes,
   f.total/100,f.rest/100,f.kind].join(' ').toLocaleLowerCase('pt-BR').includes(q);
 });
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 page=Math.max(0,Math.min(page,pages-1));
 const visible=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 if($('ag-rows'))$('ag-rows').innerHTML=visible.length?visible.map(f=>{
  const status=condition(f,day),card=f.kind==='cartao',receiving=f.kind==='receber';
  const badge='<span class="ag-kind '+(card?'ag-kind-card':receiving?'ag-kind-receive':'ag-kind-bill')+
   '">'+(card?'Cartão':receiving?'A receber':'Boleto')+'</span>';
  const details=card?(f.quantidade_lancamentos+' lançamentos'):f.details;
  const buttons=receiving?
   '<button type="button" class="btn btn-teal" data-ag-receive="'+esc(f.id)+'">Ver recebimento</button>':card?
   '<button type="button" class="btn" data-ag-edit="'+esc(f.id)+'">'+
    (f.vencimento?'Editar vencimento':'Informar vencimento')+'</button>'+
   '<button type="button" class="btn btn-teal" data-ag-pay="'+esc(f.id)+'">Adicionar pagamento</button>':
   f.origin==='parcela'?
    '<button type="button" class="btn" data-ag-show-parcel="'+esc(f.id)+'">Ver parcela</button>'+
    '<button type="button" class="btn btn-teal" data-pay-id="'+esc(f.id)+'">Dar baixa da parcela</button>':
   (f.origin==='avulso'?
    '<button type="button" class="btn" data-ag-bill-edit="'+esc(f.id)+'">Editar boleto</button>':'')+
   '<button type="button" class="btn btn-teal" data-ag-bill-pay="'+esc(f.agendaId)+'">Dar baixa</button>';
  return '<tr id="ag-row-'+esc(f.agendaId)+'" tabindex="-1">'+
   '<td><strong>'+esc(f.title)+'</strong>'+badge+
    (details&&details!==f.title?'<small>'+esc(details)+'</small>':'')+'</td>'+
   '<td>'+esc(card?cmpMonth(f.mes_fatura):f.source)+'</td>'+
   '<td class="money">'+brl(f.total/100)+'</td>'+
   '<td class="money">'+(card||receiving?brl(f.paid/100):'—')+'</td>'+
   '<td class="money"><strong>'+brl(f.rest/100)+'</strong></td>'+
   '<td><strong>'+esc(f.vencimento?date(f.vencimento):'Sem data')+'</strong>'+
    (f.observacoes?'<small>'+esc(f.observacoes.slice(0,100))+'</small>':'')+'</td>'+
   '<td><span class="ag-state '+status+'">'+esc(situationText(f,day))+'</span></td>'+
   '<td><div class="ag-actions">'+buttons+'</div></td></tr>';
 }).join(''):'<tr><td colspan="8" class="empty">Nenhum boleto ou fatura corresponde aos filtros. Compromissos quitados não aparecem como pendentes.</td></tr>';
 out('ag-listed',(selectedDay?'Vencimento de '+date(selectedDay)+' · ':'')+
  rows.length+' compromisso(s) · '+PAGE_SIZE+' por página · página '+(page+1)+' de '+pages);
 if($('ag-page-prev'))$('ag-page-prev').disabled=page===0;
 if($('ag-page-next'))$('ag-page-next').disabled=page>=pages-1;
 renderCalendar(pending);
 renderUpcomingBills(pending,day);
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
  const bills=list.filter(x=>x.kind==='boleto').length,
   cards=list.filter(x=>x.kind==='cartao').length,
   receiving=list.filter(x=>x.kind==='receber').length;
  const cl='ag-day'+(list.length?' with-invoices':'')+(bills?' has-boletos':'')+
    (today?' is-today':'')+(past?' is-past':'')+(id===selectedDay?' is-selected':'');
  const breakdown=(bills?'<span class="ag-calendar-bill">'+bills+' bol.</span>':'')+
    (cards?'<span class="ag-calendar-card">'+cards+' cart.</span>':'')+
    (receiving?'<span class="ag-calendar-receive">'+receiving+' rec.</span>':'');
  const content='<span class="ag-day-number">'+d+'</span>'+
   (list.length?'<small class="ag-day-breakdown">'+breakdown+'</small>':'');
  cells+=list.length?'<button type="button" class="'+cl+'" data-ag-day="'+id+
   '" aria-pressed="'+(id===selectedDay)+'" aria-label="'+bills+' boletos, '+cards+
   ' faturas e '+receiving+' recebíveis com vencimento em '+date(id)+'">'+content+'</button>':
   '<div class="'+cl+'">'+content+'</div>';
 }
 if($('ag-calendar'))$('ag-calendar').innerHTML=headers+cells;
 out('ag-calendar-note',due.size?
  'Boletos, faturas e contas a receber ainda pendentes. Toque em um dia para consultar.':
  'Nenhum compromisso pendente com vencimento neste mês.');
}
function renderUpcomingBills(pending,today){
 const upcoming=pending.filter(x=>x.kind==='boleto'&&x.vencimento&&x.vencimento>=today)
  .sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.title.localeCompare(b.title,'pt-BR'))
  .slice(0,6);
 const target=$('ag-next-bills');
 if(!target)return;
 target.innerHTML=upcoming.length?upcoming.map(x=>
  '<button type="button" class="btn ag-upcoming-item" data-ag-jump="'+esc(x.vencimento)+'" title="Ir ao vencimento no calendário">'+
  '<strong>'+esc(date(x.vencimento))+'</strong> <span>'+esc(x.title)+' · '+brl(x.rest/100)+
  (x.origin==='parcela'&&x.numero?' · parcela '+x.numero:'')+'</span></button>'
 ).join(''):'<span class="info-note">Nenhum boleto com vencimento futuro registrado. Consulte os vencidos na tabela.</span>';
}
function jumpToDate(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
 const year=Number(day.slice(0,4)),mon=Number(day.slice(5,7));
 if(year<2000||mon<1||mon>12)return;
 month=new Date(year,mon-1,1);
 selectedDay=day;page=0;filter='todos';typeFilter='todos';
 if($('ag-filter'))$('ag-filter').value='todos';
 if($('ag-type'))$('ag-type').value='todos';
 if($('ag-search'))$('ag-search').value='';
 render();
 $('ag-calendar')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function edit(id){
 const f=allActive().find(x=>x.id===id);
 if(!f)return;
 working=id;
 out('ag-edit-title','Vencimento · '+cardName(f.cartao_nome)+' · '+cmpMonth(f.mes_fatura));
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
   out('ag-status','Carregando boletos, faturas, saldos e vencimentos...');
   const {data:authorized,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||authorized!==true)throw Error('Acesso ao financeiro não autorizado.');
   const [inv,dec,par,full,ag,cp,av,linked,linkedBank,rec,parcelas,fornecedores]=await Promise.all([
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
     .select('fatura_id,vencimento,observacoes').order('registrado_em',{ascending:false})),
    queryAll(()=>db.from('fin_contas_pagar')
     .select('id,fornecedor_nome,descricao,categoria,vencimento,valor_referencia,observacoes,situacao').is('arquivado_em',null)
     .order('vencimento',{ascending:true,nullsFirst:false})),
    queryAll(()=>db.from('fin_boletos_avulsos')
     .select('id,fornecedor_nome,descricao,categoria,vencimento,valor_referencia,observacoes')
     .is('excluido_em',null).order('criado_em',{ascending:false})),
    queryAll(()=>db.from('fin_baixas_operacionais')
     .select('conta_pagar_id,boleto_avulso_id').order('criado_em',{ascending:false})),
    queryAll(()=>db.from('fin_baixas_extrato_avulsos')
     .select('boleto_avulso_id').order('criado_em',{ascending:false})),
    queryAll(()=>db.from('fin_contas_receber')
     .select('id,numero_documento,descricao,valor,valor_recebido,vencimento,situacao,fin_receber_clientes(nome)')
     .order('vencimento',{ascending:true,nullsFirst:false})),
    queryAll(()=>db.from('fin_parcelas')
     .select('id,compra_id,numero,vencimento,valor_cheio,status,fin_compras!inner(id,fornecedor_id,descricao,forma_pagamento)')
     .eq('status','aberto').eq('fin_compras.forma_pagamento','boleto')
     .order('vencimento',{ascending:true,nullsFirst:false}).order('id',{ascending:true})),
    queryAll(()=>db.from('fin_fornecedores')
     .select('id,nome').order('nome',{ascending:true}))
   ]);
   invoices=inv;declarations=dec;payments=par;fullPayments=full;deadlines=ag;
   bills=cp;manualBills=av;installmentBills=parcelas; supplierNames=new Map(fornecedores.map(x=>[x.id,x.nome]));
   billLinks=linked;manualBankLinks=linkedBank;receivables=rec;
   render();
   const active=allAgendaItems();
   const billCount=active.filter(x=>x.kind==='boleto').length;
   const cardCount=active.filter(x=>x.kind==='cartao').length;
   const receiveCount=active.filter(x=>x.kind==='receber').length;
   const purchaseCount=active.filter(x=>x.origin==='parcela').length;
   const manualCount=active.filter(x=>x.origin==='avulso').length;
   out('ag-status',billCount+' boleto(s), incluindo '+purchaseCount+' parcela(s) de compras e '+
    manualCount+' boleto(s) unitário(s) cadastrado(s), '+cardCount+' fatura(s) e '+receiveCount+
    ' conta(s) a receber pendentes no calendário. '+declarations.length+
    ' faturas quitadas por confirmação histórica. Nenhuma nova saída de caixa.');
  }catch(e){
   out('ag-status','Erro ao consultar agenda: '+(e.message||e));
   if($('ag-rows'))$('ag-rows').innerHTML='<tr><td colspan="8" class="empty">Não foi possível carregar a agenda.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!$('ag-rows'))return;
 $('ag-search')?.addEventListener('input',()=>{selectedDay=null;page=0;render()});
 $('ag-next-bills')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-ag-jump]');
  if(button)jumpToDate(button.dataset.agJump);
 });
 $('ag-next-bill-month')?.addEventListener('click',()=>{
  const current=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0');
  const dates=allAgendaItems().filter(x=>x.kind==='boleto'&&x.vencimento&&x.vencimento.slice(0,7)>current)
   .sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
  if(dates.length)jumpToDate(dates[0].vencimento);
  else out('ag-status','Não há boletos em meses posteriores. Use Anterior para conferir os vencidos.');
 });
 $('ag-filter')?.addEventListener('change',x=>{filter=x.target.value;selectedDay=null;page=0;render()});
 $('ag-type')?.addEventListener('change',x=>{typeFilter=x.target.value;selectedDay=null;page=0;render()});
 $('ag-clear-day')?.addEventListener('click',()=>{selectedDay=null;page=0;render()});
 $('ag-page-prev')?.addEventListener('click',()=>{page--;render()});
 $('ag-page-next')?.addEventListener('click',()=>{page++;render()});
 $('ag-prev')?.addEventListener('click',()=>{
  month=new Date(month.getFullYear(),month.getMonth()-1,1);selectedDay=null;render()
 });
 $('ag-next')?.addEventListener('click',()=>{
  month=new Date(month.getFullYear(),month.getMonth()+1,1);selectedDay=null;render()
 });
 $('ag-today')?.addEventListener('click',()=>{
  const now=new Date();month=new Date(now.getFullYear(),now.getMonth(),1);selectedDay=null;render()
 });
 $('ag-calendar')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-ag-day]');
  if(!btn)return;
  filter='todos';typeFilter='todos';
  if($('ag-filter'))$('ag-filter').value='todos';
  if($('ag-type'))$('ag-type').value='todos';
  if($('ag-search'))$('ag-search').value='';
  selectedDay=selectedDay===btn.dataset.agDay?null:btn.dataset.agDay;
  page=0;render();
  const f=allAgendaItems().find(x=>x.vencimento===selectedDay);
  const row=f&&$('ag-row-'+f.agendaId);
  row?.scrollIntoView({behavior:'smooth',block:'center'});
  row?.focus({preventScroll:true});
 });
 $('ag-rows')?.addEventListener('click',e=>{
  const setDate=e.target.closest('[data-ag-edit]');
  const pay=e.target.closest('[data-ag-pay]');
  const billPay=e.target.closest('[data-ag-bill-pay]');
  const billEdit=e.target.closest('[data-ag-bill-edit]');
  const receive=e.target.closest('[data-ag-receive]');
  const showParcel=e.target.closest('[data-ag-show-parcel]');
  if(showParcel){
   const item=allAgendaItems().find(x=>x.origin==='parcela'&&x.id===showParcel.dataset.agShowParcel);
   window.frFinanceUI?.selectView?.('payables');
   const source=$('cp-source-filter'),query=$('cp-search');
   if(source){source.value='parcela';source.dispatchEvent(new Event('change',{bubbles:true}));}
   if(query){query.value=item?.title||'';query.dispatchEvent(new Event('input',{bubbles:true}));}
   return;
  }
  if(receive){
   const item=receivables.find(x=>String(x.id)===receive.dataset.agReceive);
   window.frFinanceUI?.selectView?.('receivables');
   const search=$('ar-search');
   if(search){
    search.value=item?.numero_documento||item?.fin_receber_clientes?.nome||item?.descricao||'';
    search.dispatchEvent(new Event('input',{bubbles:true}));
   }
  }else if(billEdit){
   if(typeof window.frBoletoUI?.openEdit==='function')window.frBoletoUI.openEdit(billEdit.dataset.agBillEdit);
   else out('ag-status','Não foi possível abrir a edição do boleto. Atualize a página.');
  }else if(billPay){
   if(typeof window.frBoletoUI?.openPay==='function'){
    window.frBoletoUI.openPay(billPay.dataset.agBillPay).catch(error=>{
     out('ag-status','Não foi possível abrir o boleto: '+(error.message||error));
    });
   }else out('ag-status','Módulo de baixas indisponível. Atualize a página.');
  }else if(setDate)edit(setDate.dataset.agEdit);
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
 if(!document.querySelector('[data-view-panel="agenda"]')?.hidden)refresh().catch(()=>{});
}
window.frInvoicesAgendaUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();