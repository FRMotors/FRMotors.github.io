/* FR Motors | Pagamentos de faturas via extratos ou declarações de outra conta.
 * Não insere nem modifica movimentos; origem externa não é conciliação bancária. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const cent=x=>Math.round(Number(x)*100);
const brdate=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const todaySP=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const x=k=>parts.find(p=>p.type===k)?.value||'';
 return x('year')+'-'+x('month')+'-'+x('day');
};
const sourceIsExternal=()=>current?.tipo==='fatura'&&$('vl-source')?.value==='externo'&&$('vl-mode')?.value!=='revisao';
const out=(id,t)=>{if($(id))$(id).textContent=t};
let invoices=[],autos=[],comprovs=[],parts=[],revisions=[],declared=[],banks=[],busy=false,loading=null,current=null;
let reservedFlow=new Set(),reservedExt=new Set(),autoRefs=new Set();
let invoicePage=0;
const INVOICE_PAGE_SIZE=10;
const fields='id,tipo,fatura_id,documento_id,origem_pagamento,movimento_fluxo_id,movimento_extrato_id,valor_conferido,data_pagamento,justificativa';
async function getAll(query,max=6000){
 const arr=[],size=400;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await query().range(offset,offset+size-1);
  if(error)throw error;
  arr.push(...(data||[]));
  if(!data||data.length<size)return arr;
 }
 throw Error('A consulta superou o limite de 6.000 registros; nenhum total incompleto será exibido.');
}
const byInvoice=()=>new Map(comprovs.filter(x=>x.fatura_id).map(x=>[x.fatura_id,x]));
const byAuto=()=>new Map(comprovs.filter(x=>x.documento_id).map(x=>[x.documento_id,x]));
const byParts=()=>{
 const map=new Map();
 parts.forEach(p=>{const a=map.get(p.fatura_id)||[];a.push(p);map.set(p.fatura_id,a)});
 return map;
};
const byReview=()=>new Map(revisions.filter(x=>x.situacao==='em_revisao').map(x=>[x.fatura_id,x]));
const byDeclaration=()=>new Map(declared.map(x=>[x.fatura_id,x]));
function invoiceSummary(f){
 const older=byInvoice().get(f.id);
 const declaration=byDeclaration().get(f.id)||null;
 const list=byParts().get(f.id)||[];
 const paid=older?cent(older.valor_conferido):list.reduce((sum,x)=>sum+cent(x.valor_pago),0);
 const externalPaid=list.filter(x=>x.origem==='externo').reduce((sum,x)=>sum+cent(x.valor_pago),0);
 const bankPaid=Math.max(0,paid-externalPaid);
 const total=cent(f.valor_documental);
 // Quitação por declaração NÃO é um pagamento bancário conciliado.
 const displayPaid=declaration?total:paid;
 const balance=Math.max(0,total-displayPaid);
 return {total,paid,externalPaid,bankPaid,displayPaid,balance,parts:list,full:balance===0,
  partial:!declaration&&paid>0&&balance>0,isDeclared:Boolean(declaration),declaration};
}

function refName(f){return f.cartao_nome+' · '+brdate(f.mes_fatura).slice(3)}
function dateDiff(a,b){return Math.abs(new Date(a+'T12:00:00Z').getTime()-new Date(b+'T12:00:00Z').getTime())/86400000}
function draw(){
 const refs=byInvoice(),manualAutos=byAuto(),revs=byReview();
 const summaries=new Map(invoices.map(f=>[f.id,invoiceSummary(f)]));
 const pending=invoices.filter(f=>summaries.get(f.id).balance>0);
 const partially=invoices.filter(f=>summaries.get(f.id).partial);
 const completed=invoices.filter(f=>summaries.get(f.id).full);
 const unmatched=autos.filter(x=>!autoRefs.has(x.id)&&!manualAutos.has(x.id));
 out('vl-open-count',String(pending.length));
 out('vl-confirmed-count',String(completed.length));
 out('vl-declared-count',String(declared.length));
 out('vl-partial-count',String(partially.length));
 out('vl-review-count',String(revs.size));
 out('vl-auto-count',String(unmatched.length));
 out('vl-auto-confirmed-count',String(manualAutos.size));
 const q=($('vl-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const filter=$('vl-filter-status')?.value||'todos';
 const list=invoices.filter(f=>{
  const x=summaries.get(f.id);
  if(filter==='pendentes'&&x.balance===0)return false;
  if(filter==='conferidos'&&!x.full)return false;
  if(filter==='parciais'&&!x.partial)return false;
  if(filter==='revisao'&&!revs.has(f.id))return false;
  return [f.cartao_nome,f.mes_fatura,f.valor_documental].join(' ')
    .toLocaleLowerCase('pt-BR').includes(q);
 }).sort((a,b)=>b.mes_fatura.localeCompare(a.mes_fatura)||a.cartao_nome.localeCompare(b.cartao_nome,'pt-BR'));
 const invoicePages=Math.max(1,Math.ceil(list.length/INVOICE_PAGE_SIZE));
 invoicePage=Math.max(0,Math.min(invoicePage,invoicePages-1));
 const visibleInvoices=list.slice(invoicePage*INVOICE_PAGE_SIZE,(invoicePage+1)*INVOICE_PAGE_SIZE);
 if($('vl-invoices'))$('vl-invoices').innerHTML=visibleInvoices.length?visibleInvoices.map(f=>{
  const x=summaries.get(f.id),rev=revs.get(f.id);
  const status=x.isDeclared?'<span class="state paid">Quitada por confirmação</span><small>Sem conciliação bancária</small>':
   x.full&&x.externalPaid>0&&x.bankPaid===0?'<span class="state paid">Quitada por pagamento externo informado</span><small>Sem extrato vinculado</small>':
   x.full&&x.externalPaid>0?'<span class="state paid">Quitada por pagamentos mistos</span><small>Inclui pagamento externo informado</small>':
   x.full?'<span class="state paid">Quitada por vínculo(s) bancário(s)</span>':
   x.partial?'<span class="state open">Parcialmente paga</span>'+(x.externalPaid>0?'<small>Inclui pagamento externo informado</small>':''):
   rev?'<span class="state open">Em revisão, não quitada</span>':
   '<span class="state open">Sem pagamento registrado</span>';
  return '<tr><td><strong>'+esc(f.cartao_nome)+'</strong></td>'+
   '<td>'+brdate(f.mes_fatura).slice(3)+'</td>'+
   '<td class="money">'+f.quantidade_lancamentos+'</td>'+
   '<td class="money"><strong>'+money(f.valor_documental)+'</strong></td>'+
   '<td class="money">'+money(x.displayPaid/100)+'<small>'+(
     x.isDeclared?'Valor declarado quitado; sem saída bancária':x.parts.length+' pagamento(s) parcial(is) vinculados')+'</small></td>'+
   '<td class="money"><strong>'+money(x.balance/100)+'</strong></td>'+
   '<td>'+status+(rev?'<small>Revisão registrada, não é pagamento</small>':'')+'</td>'+
   '<td><button type="button" class="btn" data-vl-invoice="'+esc(f.id)+'">'+
    (x.isDeclared?'Ver quitação histórica':x.full?'Ver pagamentos':x.partial?'Adicionar outro pagamento':'Adicionar pagamento')+
    '</button></td></tr>';
 }).join(''):'<tr><td colspan="8" class="empty">Nenhuma fatura corresponde aos filtros.</td></tr>';
 out('vl-invoice-count',list.length+' de '+invoices.length+' faturas · 10 por página · página '+(invoicePage+1)+' de '+invoicePages);
 if($('vl-invoice-prev'))$('vl-invoice-prev').disabled=invoicePage===0;
 if($('vl-invoice-next'))$('vl-invoice-next').disabled=invoicePage>=invoicePages-1;

 // A conferência manual retira a exceção da lista ativa, mas preserva o histórico.
 const allExceptions=autos.filter(x=>!autoRefs.has(x.id));
 const confirmedExceptions=allExceptions.filter(x=>manualAutos.has(x.id)).length;
 const showConfirmed=$('vl-show-confirmed')?.checked===true;
 const review=showConfirmed?allExceptions:allExceptions.filter(x=>!manualAutos.has(x.id));
 const pendingCount=allExceptions.length-confirmedExceptions;
 out('vl-auto-summary',pendingCount+' pendente(s) · '+confirmedExceptions+
  ' conferida(s)'+(showConfirmed?' (histórico visível)':' (ocultas para liberar espaço)'));
 const wrap=$('vl-auto-table-wrap');
 if(wrap)wrap.hidden=review.length===0;
 if($('vl-auto-empty'))$('vl-auto-empty').hidden=review.length!==0;
 if($('vl-auto-rows'))$('vl-auto-rows').innerHTML=review.length?review.map(d=>{
  const linked=manualAutos.get(d.id);
  return '<tr><td><strong>'+esc(d.codigo_origem)+'</strong><small>'+
   esc(d.fornecedor_nome||d.descricao)+'</small></td>'+
   '<td>'+brdate(d.vencimento)+'</td>'+
   '<td>'+brdate(d.data_pagamento_informada)+'</td>'+
   '<td class="money">'+money(d.valor_pago_informado)+'</td>'+
   '<td>'+(linked?'<span class="state paid">Conferido manualmente</span>':
    '<span class="state open">Fora da janela de 3 dias</span>')+'</td>'+
   '<td>'+(linked?'—':'<button type="button" class="btn" data-vl-auto="'+esc(d.id)+'">Conferir saída</button>')+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="empty">Nenhuma exceção de autopeças para revisar.</td></tr>';
}
function selected(){
 if(!current)return null;
 return current.tipo==='fatura'?invoices.find(x=>x.id===current.id):autos.find(x=>x.id===current.id);
}
function candidateOptions(){
 const doc=selected(),source=$('vl-source')?.value||'fluxo';
 const mode=$('vl-mode')?.value||'pagamento';
 if(!doc)return {options:[],total:0};
 const invoice=current.tipo==='fatura',summary=invoice?invoiceSummary(doc):null;
 const expected=invoice?summary.balance:cent(doc.valor_pago_informado);
 const phrase=($('vl-bank-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const matches=banks.filter(b=>{
  if(b.source!==source||cent(b.valor)<=0)return false;
  if((source==='fluxo'&&reservedFlow.has(b.id))||
    (source==='extrato'&&reservedExt.has(b.id)))return false;
  const amount=cent(b.valor);
  if(!invoice){
   return source==='fluxo'&&amount===expected&&doc.data_pagamento_informada&&
    b.data_movimento===doc.data_pagamento_informada&&
    String(b.descricao||'').trim().toUpperCase()===String(doc.fornecedor_nome||'').trim().toUpperCase();
  }
  if(summary.balance===0)return false;
  if(mode==='revisao'){
   const target=Date.parse(doc.mes_fatura+'T12:00:00Z');
   const current=Date.parse(b.data_movimento+'T12:00:00Z');
   if(current<target-31*86400000||current>target+120*86400000)return false;
   if(amount<=summary.balance||amount===summary.total)return false;
  }else if(amount>summary.balance)return false;
  if(phrase&&![b.descricao,b.data_movimento,b.valor,
    money(b.valor),brdate(b.data_movimento)].join(' ').toLocaleLowerCase('pt-BR').includes(phrase))return false;
  return true;
 });
 const target=invoice?doc.mes_fatura:doc.data_pagamento_informada;
 const card=String(doc.cartao_nome||doc.fornecedor_nome||'').trim().toLocaleUpperCase('pt-BR');
 matches.sort((a,b)=>{
  const nameA=String(a.descricao||'').toLocaleUpperCase('pt-BR').includes(card)?0:1;
  const nameB=String(b.descricao||'').toLocaleUpperCase('pt-BR').includes(card)?0:1;
  const nearA=Math.abs(cent(a.valor)-expected),nearB=Math.abs(cent(b.valor)-expected);
  return nameA-nameB||dateDiff(a.data_movimento,target)-dateDiff(b.data_movimento,target)||
    nearA-nearB||b.data_movimento.localeCompare(a.data_movimento);
 });
 return {options:matches.slice(0,140),total:matches.length};
}
function updateBankOptions(){
 const select=$('vl-bank');if(!select)return;
 const doc=selected(),invoice=Boolean(doc&&current.tipo==='fatura');
 const external=invoice&&$('vl-source')?.value==='externo';
 const reviewOption=$('vl-mode')?.querySelector('option[value="revisao"]');
 if(reviewOption)reviewOption.disabled=external;
 if(external&&$('vl-mode')?.value==='revisao')$('vl-mode').value='pagamento';
 if($('vl-external-fields'))$('vl-external-fields').hidden=!external;
 if($('vl-bank-search-wrap'))$('vl-bank-search-wrap').hidden=external;
 if($('vl-bank-wrap'))$('vl-bank-wrap').hidden=external;
 select.required=!external;
 if($('vl-bank-search'))$('vl-bank-search').disabled=external;
 for(const id of ['vl-external-value','vl-external-date','vl-external-account']){
  const input=$(id);if(input){input.disabled=!external;input.required=external}
 }
 out('vl-reason-label-text',external?'Observação do pagamento externo':'Justificativa da conferência');
 out('vl-ack-text',external?
  'Confirmo que este pagamento já foi realizado por outra conta e que os dados são verdadeiros. Entendo que ele não terá conciliação bancária nem criará saída no caixa.':
  'Conferi a saída e confirmo que ela corresponde ao documento. Sei que não será criado um segundo pagamento no caixa.');
 if(external){
  out('vl-bank-info','Não precisa selecionar extrato. Informe abaixo o valor efetivamente pago, a data e de onde veio o pagamento.');
  updateConfirm();
  return;
 }
 const expected=invoice?invoiceSummary(doc).balance:doc?cent(doc.valor_pago_informado):0;
 const {options,total}=candidateOptions(),previous=select.value;
 select.replaceChildren(new Option('Selecione uma saída já confirmada',''),
  ...options.map(b=>{
   const suffix=invoice?' · saldo '+money(expected/100):'';
   return new Option(money(b.valor)+' · '+brdate(b.data_movimento)+' · '+
    String(b.descricao||'').slice(0,43)+' · '+(b.source==='fluxo'?'Fluxo':'Extrato')+suffix,b.source+':'+b.id);
  }));
 if(options.some(b=>b.source+':'+b.id===previous))select.value=previous;
 const review=invoice&&$('vl-mode')?.value==='revisao';
 out('vl-bank-info',total?
  total+' saída(s) disponíveis nesta origem'+(total>options.length?' (mostrando '+options.length+', use a pesquisa para localizar outras)':'')+
  '. '+(review?'A anotação NÃO é um pagamento confirmado.':'Cada saída selecionada será somada como um pagamento individual, nunca duplicada no caixa.'):
  'Nenhuma saída disponível com esses critérios. Se a fatura já foi paga por outra conta, selecione a opção sem extrato acima.');
 updateConfirm();
}
function renderHistory(){
 const f=selected(),invoice=f&&current.tipo==='fatura';
 const wrapper=$('vl-history-wrapper'),body=$('vl-history-rows');
 if(!wrapper||!body)return;
 if(!invoice){wrapper.hidden=true;return}
 const summary=invoiceSummary(f);
 if(summary.isDeclared){
  wrapper.hidden=false;
  body.innerHTML='<tr><td>Hist.</td><td>Não informada</td>'+
   '<td class="money"><strong>'+money(f.valor_documental)+'</strong></td>'+
   '<td>Confirmação do usuário, sem saída vinculada</td>'+
   '<td><small>'+esc(summary.declaration?.observacao||
    'Quitação histórica informada, não conciliada ao banco.')+'</small></td></tr>';
  out('vl-invoice-summary','Total da fatura: '+money(f.valor_documental)+
   ' · Quitado declarado: '+money(f.valor_documental)+
   ' · Saldo pendente: '+money(0)+
   ' · SEM CONCILIAÇÃO BANCÁRIA E SEM DATA DE PAGAMENTO INFORMADA');
  return;
 }
 const old=byInvoice().get(f.id);
 const payments=summary.parts.slice().sort((a,b)=>a.data_pagamento.localeCompare(b.data_pagamento));
 if(old)payments.unshift({valor_pago:old.valor_conferido,data_pagamento:old.data_pagamento,
  origem:old.origem_pagamento,justificativa:old.justificativa});
 wrapper.hidden=payments.length===0;
 body.innerHTML=payments.map((p,i)=>
  '<tr><td>'+(i+1)+'</td><td>'+brdate(p.data_pagamento)+'</td>'+
  '<td class="money"><strong>'+money(p.valor_pago)+'</strong></td>'+
  '<td>'+esc(p.origem==='externo'?'Outra conta informada · '+(p.conta_origem_externa||'Origem não informada'):
    p.origem==='fluxo'?'Fluxo de Caixa':'Extrato bancário')+'</td>'+
  '<td><small>'+esc(p.justificativa||'Conciliação anterior')+'</small></td></tr>'
 ).join('');
 out('vl-invoice-summary','Total da fatura: '+money(f.valor_documental)+
  ' · Pagamentos registrados: '+money(summary.paid/100)+
  (summary.externalPaid?' (inclui '+money(summary.externalPaid/100)+' informado sem extrato)':'')+
  ' · Saldo restante: '+money(summary.balance/100)+
  (summary.full?' · QUITADA':summary.partial?' · PAGAMENTO PARCIAL':' · A CONFERIR'));
}
function updateConfirm(){
 const selectedValue=$('vl-bank')?.value||'';
 const item=selectedValue&&banks.find(x=>x.source+':'+x.id===selectedValue);
 const doc=selected(),just=$('vl-reason')?.value.trim()||'';
 if(!doc||!current){if($('vl-submit'))$('vl-submit').disabled=true;return}
 const invoice=current.tipo==='fatura',mode=$('vl-mode')?.value||'pagamento';
 const summary=invoice?invoiceSummary(doc):null;
 const expected=invoice?summary.balance:cent(doc.valor_pago_informado);
 const actual=item?cent(item.valor):null;
 const review=invoice&&mode==='revisao';
 const valid=Boolean(item&&(review?(actual>summary.balance&&actual!==summary.total):actual>0&&actual<=expected));
 const minChars=review?30:12,maxChars=review?1500:1000;
 const can=Boolean(!busy&&!summary?.full&&valid&&just.length>=minChars&&just.length<=maxChars&&$('vl-ack')?.checked);
 if($('vl-submit')){
  $('vl-submit').disabled=!can;
  $('vl-submit').hidden=Boolean(summary?.full);
  $('vl-submit').textContent=review?'Registrar hipótese para revisão':
    (invoice?'Registrar pagamento de '+(item?money(item.valor):'saída selecionada'):'Confirmar correspondência');
 }
 if(invoice&&summary){
  out('vl-invoice-summary',summary.isDeclared?
    'Total da fatura: '+money(summary.total/100)+
    ' · Quitado por confirmação: '+money(summary.displayPaid/100)+
    ' · Saldo restante: '+money(0)+
    ' · SEM SAÍDA BANCÁRIA VINCULADA':
    'Total da fatura: '+money(summary.total/100)+
    ' · Pago no banco: '+money(summary.paid/100)+' · Saldo restante: '+money(summary.balance/100)+
    (summary.full?' · QUITADA':summary.partial?' · PARCIAL':''));
 }
 out('vl-match-check',item?
  (review?'Pagamento '+money(item.valor)+' superior ao saldo '+money(expected/100)+
     '. Será anotado para REVISÃO e NÃO contará como pago. Justifique a diferença (mínimo 30 caracteres).':
   invoice?'Registrar '+money(item.valor)+' desta saída. Saldo após o pagamento: '+
     money((expected-actual)/100)+'. '+(expected===actual?'A fatura ficará quitada.':'A fatura continuará parcialmente paga.'):
    'Valor da compra: '+money(expected/100)+' · saída confirmada: '+money(actual/100)+
    '. A exceção exige data e fornecedor idênticos no Fluxo.'):
  invoice&&summary.isDeclared?'Esta fatura foi declarada quitada sem conciliação. Consulte a anotação histórica.':
   invoice&&summary.full?'Esta fatura já está integralmente conciliada; consulte o histórico.':
   'Selecione uma saída existente. Para faturas, são aceitos vários pagamentos até completar o saldo.');
}
function open(type,id){
 current={tipo:type,id};
 const doc=selected();if(!doc)return;
 const invoice=type==='fatura',summary=invoice?invoiceSummary(doc):null;
 if($('vl-source'))$('vl-source').value='fluxo';
 if($('vl-mode'))$('vl-mode').value='pagamento';
 if($('vl-mode-wrap'))$('vl-mode-wrap').hidden=!invoice||Boolean(summary?.full);
 if($('vl-ext-option'))$('vl-ext-option').disabled=!invoice;
 if($('vl-personal-option'))$('vl-personal-option').disabled=!invoice;
 if($('vl-external-value'))$('vl-external-value').value=invoice?(summary.balance/100).toFixed(2):'';
 if($('vl-external-date')){$('vl-external-date').value=todaySP();$('vl-external-date').max=todaySP()}
 if($('vl-external-account'))$('vl-external-account').value='Conta pessoal';
 if($('vl-bank-search'))$('vl-bank-search').value='';
 if($('vl-reason'))$('vl-reason').value='';
 if($('vl-ack'))$('vl-ack').checked=false;
 if($('vl-entry-fields'))$('vl-entry-fields').hidden=Boolean(summary?.full);
 if($('vl-readonly-close'))$('vl-readonly-close').hidden=!Boolean(summary?.full);
 if($('vl-invoice-summary'))$('vl-invoice-summary').hidden=!invoice;
 out('vl-title',invoice&&summary?.isDeclared?'Quitação histórica da fatura':
   invoice?'Pagamentos da fatura':'Conferir pagamento da autopeça');
 out('vl-description',invoice?refName(doc)+' · '+doc.quantidade_lancamentos+' lançamentos.':
  doc.codigo_origem+' · '+doc.fornecedor_nome+' · '+money(doc.valor_pago_informado)+
  ' · vencimento '+brdate(doc.vencimento)+', pagamento informado '+brdate(doc.data_pagamento_informada)+
  '. Revise esta exceção à janela automática de três dias.');
 out('vl-error','');
 renderHistory();
 updateBankOptions();
 const dialog=$('vl-dialog');if(dialog?.showModal)dialog.showModal();
 else dialog?.setAttribute('open','');
}
async function submit(event){
 event.preventDefault();
 if(busy||!current||!$('vl-ack')?.checked)return;
 const key=$('vl-bank')?.value||'',bank=banks.find(x=>x.source+':'+x.id===key);
 const doc=selected(),reason=$('vl-reason')?.value.trim()||'';
 if(!doc||!bank)return;
 const invoice=current.tipo==='fatura',review=invoice&&$('vl-mode')?.value==='revisao';
 const expected=invoice?invoiceSummary(doc).balance:cent(doc.valor_pago_informado);
 const actual=cent(bank.valor);
 if(invoice&&invoiceSummary(doc).full)return;
 if(review?!(actual>expected&&actual!==cent(doc.valor_documental)):
   !(actual>0&&actual<=expected))return;
 if(reason.length<(review?30:12)||reason.length>(review?1500:1000))return;
 busy=true;updateConfirm();
 try{
  const req=review?
   db.rpc('fin_fatura_registrar_revisao',{
    p_fatura:doc.id,p_origem:bank.source,p_movimento:bank.id,p_justificativa:reason
   }):
   invoice?db.rpc('fin_fatura_registrar_pagamento_parcial',{
    p_fatura:doc.id,p_origem:bank.source,p_movimento:bank.id,p_justificativa:reason
   }):
   db.rpc('fin_comprovar_documento_pagamento',{
    p_tipo:current.tipo,p_documento:doc.id,p_origem:bank.source,
    p_movimento:bank.id,p_justificativa:reason
   });
  const {data,error}=await req;
  if(error)throw error;
  const status=review?'em_revisao':invoice?'pagamento_registrado':'vinculado';
  if(data?.resultado!==status)throw Error('O banco não confirmou a operação.');
  if($('vl-dialog')?.open)$('vl-dialog').close();
  current=null;
  await refresh();
  await window.frDocsReconcileUI?.refresh?.();
  window.frFinanceUI?.showToast(review?
   'Pagamento possível anotado para revisão, sem baixa da fatura.':
   invoice?(data.situacao==='quitada'?
    'Último pagamento vinculado. Fatura totalmente conciliada, sem saída duplicada.':
    'Pagamento parcial registrado. Saldo restante: '+money(data.saldo_restante)):
    'Pagamento da autopeça localizado e vinculado sem nova saída.');
 }catch(e){
  out('vl-error','Não foi possível registrar: '+(e.message||e));
 }finally{busy=false;updateConfirm()}
}
async function refresh(force=false){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Supabase indisponível.');
   out('vl-load-status','Consultando saídas confirmadas e vínculos existentes...');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   const [allInvoices,allAutos,knownAuto,pix,linked,partRows,reviewRows,declaredRows,flow,imp,paidFlow,payParcels,paidTestParcels,paidTestExcel,paidTestFaturas,paidTestAvulsos]=await Promise.all([
    getAll(()=>db.from('fin_faturas_historicas')
     .select('id,cartao_nome,mes_fatura,valor_documental,quantidade_lancamentos')
     .order('mes_fatura',{ascending:false})),
    getAll(()=>db.from('fin_documentos_despesas')
     .select('id,grupo,incluir,codigo_origem,descricao,fornecedor_nome,vencimento,data_pagamento_informada,valor_pago_informado,situacao_origem')
     .eq('grupo','autopecas').eq('incluir',true).eq('situacao_origem','Pago')),
    getAll(()=>db.from('fin_conciliacoes_documentais').select('documento_id,movimento_id')
     .order('identificado_em',{ascending:false})),
    getAll(()=>db.from('fin_pix_debito_referencias').select('movimento_id')
     .not('movimento_id','is',null).order('migrado_em',{ascending:false})),
    getAll(()=>db.from('fin_comprovacoes_documentais').select(fields)
     .order('conferido_em',{ascending:false})),
    getAll(()=>db.from('fin_faturas_pagamentos_parciais')
     .select('id,fatura_id,origem,movimento_fluxo_id,movimento_extrato_id,valor_pago,data_pagamento,justificativa,conta_origem_externa')
     .order('confirmado_em',{ascending:false})),
    getAll(()=>db.from('fin_revisoes_faturas_historicas')
     .select('id,fatura_id,origem,valor_documental,valor_movimento,diferenca,data_movimento,justificativa,situacao')
     .order('atualizado_em',{ascending:false})),
    getAll(()=>db.from('fin_faturas_quitacoes_declaradas')
     .select('fatura_id,valor_documental_declarado,observacao,registrado_em')
     .order('registrado_em',{ascending:false})),
    getAll(()=>db.from('fin_movimentos').select('id,descricao,data_movimento,valor')
     .eq('tipo','saida').eq('estado','confirmado').eq('origem','fluxo_caixa_homologado')
     .order('data_movimento',{ascending:false})),
    getAll(()=>db.from('fin_teste_movimentos').select('id,descricao,data_movimento,valor')
     .eq('tipo','saida').eq('estado','confirmado').like('referencia_cliente','extrato:%')
     .order('data_movimento',{ascending:false})),
    getAll(()=>db.from('fin_baixas_operacionais').select('movimento_id')
     .order('criado_em',{ascending:false})),
    getAll(()=>db.from('fin_vinculos_pagamento').select('movimento_id').order('id',{ascending:false})),
    getAll(()=>db.from('fin_teste_vinculos').select('movimento_id').order('id',{ascending:false})),
    getAll(()=>db.from('fin_teste_excel_abertos_vinculos').select('movimento_id').order('vinculado_em',{ascending:false})),
    getAll(()=>db.from('fin_teste_fatura_pagamentos').select('movimento_id').order('criado_em',{ascending:false})),
    getAll(()=>db.from('fin_baixas_extrato_avulsos').select('movimento_teste_id').order('criado_em',{ascending:false}))
   ]);
   invoices=allInvoices;autos=allAutos;comprovs=linked;parts=partRows;revisions=reviewRows;declared=declaredRows;
   autoRefs=new Set(knownAuto.map(x=>x.documento_id));
   reservedFlow=new Set([...knownAuto.map(x=>x.movimento_id),...pix.map(x=>x.movimento_id),
    ...linked.map(x=>x.movimento_fluxo_id),...partRows.map(x=>x.movimento_fluxo_id),
    ...paidFlow.map(x=>x.movimento_id),...payParcels.map(x=>x.movimento_id)].filter(Boolean));
   reservedExt=new Set([...linked.map(x=>x.movimento_extrato_id),...partRows.map(x=>x.movimento_extrato_id),
    ...paidTestParcels.map(x=>x.movimento_id),
    ...paidTestExcel.map(x=>x.movimento_id),...paidTestFaturas.map(x=>x.movimento_id),
    ...paidTestAvulsos.map(x=>x.movimento_teste_id)].filter(Boolean));
   banks=[...flow.map(x=>({...x,source:'fluxo'})),...imp.map(x=>({...x,source:'extrato'}))];
   draw();
   const fullyPaid=invoices.filter(x=>invoiceSummary(x).full).length;
   const partiallyPaid=invoices.filter(x=>invoiceSummary(x).partial).length;
   const finishedExternal=invoices.filter(x=>{const v=invoiceSummary(x);return v.full&&!v.isDeclared&&v.externalPaid>0}).length;
   out('vl-load-status',invoices.length+' faturas, '+declared.length+
    ' quitadas por confirmação histórica, '+
    (fullyPaid-declared.length-finishedExternal)+' quitadas apenas por conciliação bancária, '+
    finishedExternal+' quitadas com pagamento externo informado, '+partiallyPaid+
    ' parcialmente pagas, '+byReview().size+
    ' em revisão e '+autos.filter(x=>!autoRefs.has(x.id)&&!byAuto().has(x.id)).length+
    ' exceções de autopeças. Nenhuma movimentação adicional foi criada.');
  }catch(e){
   out('vl-load-status','Não foi possível carregar a conferência: '+(e.message||e));
   if($('vl-invoices'))$('vl-invoices').innerHTML='<tr><td colspan="8" class="empty">Erro ao carregar vínculos.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!$('vl-invoices'))return;
 $('vl-search')?.addEventListener('input',()=>{invoicePage=0;draw()});
 $('vl-filter-status')?.addEventListener('change',()=>{invoicePage=0;draw()});
 $('vl-invoice-prev')?.addEventListener('click',()=>{invoicePage--;draw()});
 $('vl-invoice-next')?.addEventListener('click',()=>{invoicePage++;draw()});
 $('vl-show-confirmed')?.addEventListener('change',draw);
 $('vl-invoices')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-vl-invoice]');
  if(button)open('fatura',button.dataset.vlInvoice);
 });
 $('vl-auto-rows')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-vl-auto]');
  if(button)open('autopecas_excecao',button.dataset.vlAuto);
 });
 $('vl-source')?.addEventListener('change',()=>{if($('vl-ack'))$('vl-ack').checked=false;updateBankOptions()});
 $('vl-mode')?.addEventListener('change',()=>{
  if($('vl-ack'))$('vl-ack').checked=false;
  if($('vl-reason'))$('vl-reason').value='';
  updateBankOptions();
 });
 $('vl-bank-search')?.addEventListener('input',()=>updateBankOptions());
 $('vl-bank')?.addEventListener('change',()=>{if($('vl-ack'))$('vl-ack').checked=false;updateConfirm()});
 $('vl-reason')?.addEventListener('input',updateConfirm);
 $('vl-external-value')?.addEventListener('input',updateConfirm);
 $('vl-external-date')?.addEventListener('change',updateConfirm);
 $('vl-external-account')?.addEventListener('change',updateConfirm);
 $('vl-ack')?.addEventListener('change',updateConfirm);
 $('vl-form')?.addEventListener('submit',submit);
 $('vl-close')?.addEventListener('click',()=>{if(!busy&&$('vl-dialog')?.open)$('vl-dialog').close()});
 $('vl-cancel')?.addEventListener('click',()=>{if(!busy&&$('vl-dialog')?.open)$('vl-dialog').close()});
 $('vl-close-history')?.addEventListener('click',()=>{if(!busy&&$('vl-dialog')?.open)$('vl-dialog').close()});
 $('vl-dialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('vl-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(!document.querySelector('[data-view-panel="expenses"]')?.hidden)refresh().catch(()=>{});
}
async function openInvoiceFromAgenda(id){
 if(loading)await loading;
 if(!invoices.some(x=>x.id===id))await refresh();
 if(!invoices.some(x=>x.id===id))throw Error('Fatura não encontrada. Atualize a conferência.');
 open('fatura',id);
}
window.frDocumentLinksUI={refresh,openInvoice:openInvoiceFromAgenda};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();