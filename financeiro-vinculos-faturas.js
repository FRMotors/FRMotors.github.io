/* FR Motors | Vínculo manual de faturas e exceções com saídas já confirmadas.
 * Não insere nem modifica movimentos. Somente RPC autorizada e conferência explícita. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const cent=x=>Math.round(Number(x)*100);
const brdate=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const out=(id,t)=>{if($(id))$(id).textContent=t};
let invoices=[],autos=[],comprovs=[],banks=[],busy=false,loading=null,current=null;
let reservedFlow=new Set(),reservedExt=new Set(),autoRefs=new Set();
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
function refName(f){return f.cartao_nome+' · '+brdate(f.mes_fatura).slice(3)}
function dateDiff(a,b){return Math.abs(new Date(a+'T12:00:00Z').getTime()-new Date(b+'T12:00:00Z').getTime())/86400000}
function draw(){
 const invLinks=byInvoice(),autoLinks=byAuto();
 const pending=invoices.filter(x=>!invLinks.has(x.id));
 const unmatched=autos.filter(x=>!autoRefs.has(x.id)&&!autoLinks.has(x.id));
 out('vl-open-count',String(pending.length));
 out('vl-confirmed-count',String(invLinks.size));
 out('vl-auto-count',String(unmatched.length));
 out('vl-auto-confirmed-count',String(autoLinks.size));
 const q=($('vl-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const filter=$('vl-filter-status')?.value||'todos';
 const list=invoices.filter(f=>{
  if(filter==='pendentes'&&invLinks.has(f.id))return false;
  if(filter==='conferidos'&&!invLinks.has(f.id))return false;
  return [f.cartao_nome,f.mes_fatura,f.valor_documental].join(' ')
    .toLocaleLowerCase('pt-BR').includes(q);
 }).sort((a,b)=>b.mes_fatura.localeCompare(a.mes_fatura)||a.cartao_nome.localeCompare(b.cartao_nome,'pt-BR'));
 if($('vl-invoices'))$('vl-invoices').innerHTML=list.length?list.map(f=>{
  const link=invLinks.get(f.id);
  return '<tr><td><strong>'+esc(f.cartao_nome)+'</strong></td>'+
   '<td>'+brdate(f.mes_fatura).slice(3)+'</td>'+
   '<td class="money">'+f.quantidade_lancamentos+'</td>'+
   '<td class="money"><strong>'+money(f.valor_documental)+'</strong></td>'+
   '<td>'+(link?'<span class="state paid">Vinculada à saída</span><small>'+
     esc(link.origem_pagamento==='fluxo'?'Fluxo':'Extrato')+' · '+brdate(link.data_pagamento)+
     ' · '+money(link.valor_conferido)+'</small>':
     '<span class="state open">A conferir</span>')+'</td>'+
   '<td>'+(link?'—':'<button type="button" class="btn" data-vl-invoice="'+esc(f.id)+'">Vincular pagamento</button>')+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="empty">Nenhuma fatura corresponde aos filtros.</td></tr>';
 out('vl-invoice-count',list.length+' de '+invoices.length+' faturas');
 const review=autos.filter(x=>!autoRefs.has(x.id));
 if($('vl-auto-rows'))$('vl-auto-rows').innerHTML=review.length?review.map(d=>{
  const linked=autoLinks.get(d.id);
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
 if(!doc)return [];
 const expected=cent(current.tipo==='fatura'?doc.valor_documental:doc.valor_pago_informado);
 return banks.filter(b=>{
  if(b.source!==source||cent(b.valor)!==expected)return false;
  if((source==='fluxo'&&reservedFlow.has(b.id))||
    (source==='extrato'&&reservedExt.has(b.id)))return false;
  if(current.tipo==='autopecas_excecao'&&(
   source!=='fluxo'||!doc.data_pagamento_informada||
   b.data_movimento!==doc.data_pagamento_informada||
   String(b.descricao||'').trim().toUpperCase()!==String(doc.fornecedor_nome||'').trim().toUpperCase()
  ))return false;
  return true;
 }).sort((a,b)=>{
  const target=current.tipo==='fatura'?doc.mes_fatura:doc.data_pagamento_informada;
  const deltaA=dateDiff(a.data_movimento,target),deltaB=dateDiff(b.data_movimento,target);
  const key=String(doc.cartao_nome||doc.fornecedor_nome||'').toUpperCase();
  const matchA=String(a.descricao||'').toUpperCase().includes(key)?0:1;
  const matchB=String(b.descricao||'').toUpperCase().includes(key)?0:1;
  return matchA-matchB||deltaA-deltaB||b.data_movimento.localeCompare(a.data_movimento);
 });
}
function updateBankOptions(){
 const select=$('vl-bank');if(!select)return;
 const choices=candidateOptions(),previous=select.value;
 select.replaceChildren(new Option('Selecione uma saída já confirmada',''),
  ...choices.map(b=>new Option(money(b.valor)+' · '+brdate(b.data_movimento)+' · '+
   String(b.descricao).slice(0,46)+' · '+(b.source==='fluxo'?'Fluxo':'Extrato'),b.source+':'+b.id)));
 if(choices.some(b=>b.source+':'+b.id===previous))select.value=previous;
 out('vl-bank-info',choices.length?
  choices.length+' saída(s) com valor exatamente igual. Selecione a correta e registre o motivo da conferência.':
  'Nenhuma saída disponível com valor exatamente igual nessa origem. Não foi criada correspondência aproximada.');
 updateConfirm();
}
function updateConfirm(){
 const selectedValue=$('vl-bank')?.value||'';
 const item=selectedValue&&banks.find(x=>x.source+':'+x.id===selectedValue);
 const doc=selected(),just=$('vl-reason')?.value.trim()||'';
 const can=Boolean(!busy&&doc&&item&&just.length>=12&&just.length<=1000&&$('vl-ack')?.checked);
 if($('vl-submit'))$('vl-submit').disabled=!can;
 const base=doc?money(current.tipo==='fatura'?doc.valor_documental:doc.valor_pago_informado):'—';
 out('vl-match-check',item?base+' no documento = '+money(item.valor)+' na saída já registrada.':
  'Selecione o pagamento correto. Não é permitido usar valores aproximados.');
}
function open(type,id){
 current={tipo:type,id};
 const doc=selected();if(!doc)return;
 const invoice=type==='fatura';
 if($('vl-source'))$('vl-source').value='fluxo';
 if($('vl-ext-option'))$('vl-ext-option').disabled=!invoice;
 if($('vl-reason'))$('vl-reason').value='';
 if($('vl-ack'))$('vl-ack').checked=false;
 out('vl-title',invoice?'Vincular pagamento de fatura':'Conferir pagamento de autopeça');
 out('vl-description',invoice?refName(doc)+' · '+money(doc.valor_documental)+
  ' · '+doc.quantidade_lancamentos+' lançamentos.':
  doc.codigo_origem+' · '+doc.fornecedor_nome+' · '+money(doc.valor_pago_informado)+
  ' · vencimento '+brdate(doc.vencimento)+
  ', pagamento declarado '+brdate(doc.data_pagamento_informada)+
  '. A correspondência automática foi bloqueada pelo atraso.');
 out('vl-error','');
 updateBankOptions();
 const dialog=$('vl-dialog');if(dialog?.showModal)dialog.showModal();
 else dialog?.setAttribute('open','');
}
async function submit(event){
 event.preventDefault();if(busy||!current||!$('vl-ack')?.checked)return;
 const bankKey=$('vl-bank').value,bank=banks.find(x=>x.source+':'+x.id===bankKey);
 const doc=selected(),reason=$('vl-reason').value.trim();
 if(!doc||!bank||reason.length<12||reason.length>1000)return;
 if(cent(bank.valor)!==cent(current.tipo==='fatura'?doc.valor_documental:doc.valor_pago_informado))return;
 busy=true;updateConfirm();
 try{
  const {data,error}=await db.rpc('fin_comprovar_documento_pagamento',{
   p_tipo:current.tipo,p_documento:doc.id,p_origem:bank.source,
   p_movimento:bank.id,p_justificativa:reason
  });
  if(error)throw error;
  if(data?.resultado!=='vinculado')throw Error('O banco não confirmou a vinculação.');
  if($('vl-dialog')?.open)$('vl-dialog').close();
  current=null;
  await refresh(true);
  await window.frDocsReconcileUI?.refresh?.();
  window.frFinanceUI?.showToast('Saída existente vinculada ao documento, sem gerar novo pagamento.');
 }catch(e){
  out('vl-error','Não foi possível confirmar: '+(e.message||e));
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
   const [allInvoices,allAutos,knownAuto,pix,linked,flow,imp,paidFlow,payParcels,paidTestParcels,paidTestExcel,paidTestFaturas,paidTestAvulsos]=await Promise.all([
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
   invoices=allInvoices;autos=allAutos;comprovs=linked;
   autoRefs=new Set(knownAuto.map(x=>x.documento_id));
   reservedFlow=new Set([...knownAuto.map(x=>x.movimento_id),...pix.map(x=>x.movimento_id),
    ...linked.map(x=>x.movimento_fluxo_id),...paidFlow.map(x=>x.movimento_id),...payParcels.map(x=>x.movimento_id)].filter(Boolean));
   reservedExt=new Set([...linked.map(x=>x.movimento_extrato_id),...paidTestParcels.map(x=>x.movimento_id),
    ...paidTestExcel.map(x=>x.movimento_id),...paidTestFaturas.map(x=>x.movimento_id),
    ...paidTestAvulsos.map(x=>x.movimento_teste_id)].filter(Boolean));
   banks=[...flow.map(x=>({...x,source:'fluxo'})),...imp.map(x=>({...x,source:'extrato'}))];
   draw();
   out('vl-load-status',invoices.length+' faturas documentais, '+
    comprovs.filter(x=>x.tipo==='fatura').length+' com saída vinculada, '+
    autos.filter(x=>!autoRefs.has(x.id)&&!byAuto().has(x.id)).length+
    ' exceções de autopeças para conferir. Nenhuma nova movimentação criada.');
  }catch(e){
   out('vl-load-status','Não foi possível carregar a conferência: '+(e.message||e));
   if($('vl-invoices'))$('vl-invoices').innerHTML='<tr><td colspan="6" class="empty">Erro ao carregar vínculos.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!$('vl-invoices'))return;
 $('vl-search')?.addEventListener('input',draw);
 $('vl-filter-status')?.addEventListener('change',draw);
 $('vl-invoices')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-vl-invoice]');
  if(button)open('fatura',button.dataset.vlInvoice);
 });
 $('vl-auto-rows')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-vl-auto]');
  if(button)open('autopecas_excecao',button.dataset.vlAuto);
 });
 $('vl-source')?.addEventListener('change',()=>{if($('vl-ack'))$('vl-ack').checked=false;updateBankOptions()});
 $('vl-bank')?.addEventListener('change',()=>{if($('vl-ack'))$('vl-ack').checked=false;updateConfirm()});
 $('vl-reason')?.addEventListener('input',updateConfirm);
 $('vl-ack')?.addEventListener('change',updateConfirm);
 $('vl-form')?.addEventListener('submit',submit);
 $('vl-close')?.addEventListener('click',()=>{if(!busy&&$('vl-dialog')?.open)$('vl-dialog').close()});
 $('vl-dialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('vl-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(!document.querySelector('[data-view-panel="expenses"]')?.hidden)refresh().catch(()=>{});
}
window.frDocumentLinksUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();