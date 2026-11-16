/* FR Motors | Dar baixa sem duplicar pagamentos.
 * Boletos operacionais + boletos avulsos, com vínculo a saídas CONFIRMADAS
 * do Fluxo de Caixa. A tela antiga de baixas de teste continua isolada. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateBR=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'Sem data';
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cents=x=>Math.round(Number(x)*100);
const write=(id,t)=>{if($(id))$(id).textContent=t};
let accounts=[],avulsos=[],links=[],importedLinks=[],movements=[],otherUsed=new Set(),testUsed=new Set(),suppliers=new Map();
let loading=null,busy=false,deleteTarget=null;
const byId=new Map();
function validAmount(x){const n=Number(x),c=Math.round(n*100);return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(c)&&Math.abs(n*100-c)<.00001?c:null}
async function allRows(builder,max=15000){
 const out=[],size=500;
 for(let i=0;i<max;i+=size){
  const {data,error}=await builder().range(i,i+size-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<size)return out;
 }
 throw Error('Consulta extensa demais; dados não carregados por completo.');
}
const paidLinks=()=>{
 const cp=new Map(),manual=new Map(),movement=new Set();
 links.forEach(x=>{
  if(x.conta_pagar_id)cp.set(x.conta_pagar_id,x);
  if(x.boleto_avulso_id)manual.set(x.boleto_avulso_id,{...x,source:'fluxo'});
  movement.add('fluxo:'+x.movimento_id);
 });
 importedLinks.forEach(x=>manual.set(x.boleto_avulso_id,{...x,source:'extrato'}));
 return {cp,manual,movement};
};
function collectOpen(){
 const linked=paidLinks();
 const list=[];
 accounts.forEach(x=>{
  if(x.situacao!=='aberto'||linked.cp.has(x.id))return;
  list.push({tipo:'homologado',id:x.id,fornecedor:x.fornecedor_nome,descricao:x.descricao,
   valor:Number(x.valor_referencia),vencimento:x.vencimento,origem:'Planilha homologada',
   fornecedor_id:x.fornecedor_id,linha_origem_id:x.linha_origem_id});
 });
 avulsos.forEach(x=>{
  if(linked.manual.has(x.id))return;
  list.push({tipo:'avulso',id:x.id,fornecedor:x.fornecedor_nome,descricao:x.descricao,
   valor:Number(x.valor_referencia),vencimento:x.vencimento,origem:'Boleto adicionado',
   fornecedor_id:null});
 });
 return list.sort((a,b)=>String(a.vencimento||'9999-99-99').localeCompare(String(b.vencimento||'9999-99-99'))||
  a.fornecedor.localeCompare(b.fornecedor,'pt-BR'));
}
function optLabel(x){
 return brl(x.valor)+' · '+x.fornecedor+' · '+dateBR(x.vencimento)+' · '+x.origem;
}
function chosen(){
 return byId.get($('op-pay-select')?.value)||null;
}
function supplierDiscount(doc,bank){
 if(!doc||!bank||!doc.vencimento||bank.data_movimento>doc.vencimento)return null;
 const source=doc.fornecedor_id?
  suppliers.get(doc.fornecedor_id):
  [...suppliers.values()].find(x=>x.nome.trim().toLocaleUpperCase('pt-BR')===
    doc.fornecedor.trim().toLocaleUpperCase('pt-BR'));
 if(!source||!source.desconto_ate_vencimento)return null;
 const pct=Number(source.desconto_atual_pct);
 if(!Number.isFinite(pct)||pct<=0||pct>=100)return null;
 const value=cents(doc.valor);
 const diff=Math.round(value*pct/100);
 return value-diff===cents(bank.valor)?{pct,amount:diff}:null;
}
function availableBank(doc){
 if(!doc)return[];
 const paid=paidLinks().movement;
 return movements.filter(x=>{
  if((x.source==='fluxo'&&otherUsed.has(x.ref))||
    (x.source==='extrato'&&testUsed.has(x.ref))||paid.has(x.id))return false;
  if(doc.vencimento){
   const delta=Math.round((Date.parse(x.data_movimento+'T12:00:00Z')-
      Date.parse(doc.vencimento+'T12:00:00Z'))/86400000);
   if(!Number.isFinite(delta)||Math.abs(delta)>3)return false;
  }
  return true;
 }).sort((a,b)=>{
  const score=x=>{
   const exact=cents(x.valor)===cents(doc.valor);
   const hint=supplierDiscount(doc,x);
   const byValue=exact||Boolean(hint);
   const supplierName=String(doc.fornecedor||'').trim().toLocaleUpperCase('pt-BR');
   const sameName=String(x.descricao||'').trim().toLocaleUpperCase('pt-BR')===supplierName;
   return Number(byValue)*100+Number(sameName)*30;
  };
  return score(b)-score(a)||b.data_movimento.localeCompare(a.data_movimento)||a.descricao.localeCompare(b.descricao);
 });
}
function updateDeleteButton(){
 const doc=chosen();
 const canDelete=Boolean(doc&&doc.tipo==='avulso'&&!paidLinks().manual.has(doc.id));
 const button=$('op-pay-delete');
 if(button){button.hidden=!canDelete;button.disabled=busy||!canDelete;}
 write('op-pay-delete-note',canDelete?
  'Este boleto foi cadastrado no aplicativo e ainda não tem baixa. Você pode excluí-lo.':
  doc?.tipo==='homologado'?'Boletos da planilha homologada são protegidos contra exclusão.':'');
}
function updateBank(){
 const doc=chosen();
 updateDeleteButton();
 const previous=$('op-pay-movement').value;
 const candidates=availableBank(doc);
 const opts=candidates.map(x=>new Option(brl(x.valor)+' · '+dateBR(x.data_movimento)+' · '+x.descricao.slice(0,45)+
  (x.source==='extrato'?' · Extrato importado':' · Fluxo homologado'),x.id));
 $('op-pay-movement').replaceChildren(new Option(doc?'Selecione uma saída já paga':'Selecione primeiro o boleto',''),...opts);
 if(candidates.some(x=>x.id===previous))$('op-pay-movement').value=previous;
 write('op-pay-base',doc?brl(doc.valor):'—');
 write('op-pay-source',doc?doc.origem+' · '+doc.fornecedor+' · vencimento '+dateBR(doc.vencimento):'Selecione um compromisso.');
 $('op-pay-discount').value='0.00';$('op-pay-fees').value='0.00';
 const bank=candidates.find(x=>x.id===$('op-pay-movement').value);
 if(bank){
  const guess=supplierDiscount(doc,bank);
  if(guess)$('op-pay-discount').value=(guess.amount/100).toFixed(2);
 }
 recalc();
}
function movementChanged(){
 const doc=chosen(),bank=movements.find(x=>x.id===$('op-pay-movement').value);
 $('op-pay-discount').value='0.00';$('op-pay-fees').value='0.00';
 if(bank){
  const rule=supplierDiscount(doc,bank);
  if(rule)$('op-pay-discount').value=(rule.amount/100).toFixed(2);
 }
 recalc();
}
function recalc(){
 const doc=chosen(),bank=movements.find(x=>x.id===$('op-pay-movement').value);
 const disc=validAmount($('op-pay-discount').value),fees=validAmount($('op-pay-fees').value);
 const full=doc?cents(doc.valor):null,paid=bank?cents(bank.valor):null;
 const calc=full===null||disc===null||fees===null?null:full-disc+fees;
 const correct=Boolean(doc&&bank&&disc!==null&&fees!==null&&disc<=full&&calc===paid);
 const diff=(full!==null&&paid!==null&&fees!==null)?full+fees-paid:null;
 $('op-pay-use-difference').hidden=!(doc&&bank&&diff>0&&diff<=full&&disc!==diff);
 $('op-pay-confirm').disabled=busy||!correct||!$('op-pay-ack').checked;
 const rule=supplierDiscount(doc,bank);
 const desc=doc&&bank?
   'Valor do compromisso '+brl(doc.valor)+' − desconto '+brl((disc||0)/100)+
   ' + juros '+brl((fees||0)/100)+' = '+(calc===null?'—':brl(calc/100))+
   '. Saída já registrada ('+(bank.source==='extrato'?'extrato importado':'Fluxo de Caixa')+'): '+brl(bank.valor)+'. '+
   (correct?'Valores conferem. Confirme o vínculo sem criar pagamento.':
   'Os valores não conferem. Use desconto/juros somente com base no comprovante.')+
   (rule?' Regra '+rule.pct+'% do fornecedor aplicável até o vencimento.':''):
   'Escolha uma conta e uma saída já registrada no Fluxo de Caixa.';
 write('op-pay-info',desc);
 return correct;
}
function updateManualList(){
 const body=$('op-manual-rows');if(!body)return;
 const linked=paidLinks().manual;
 const sorted=[...avulsos].sort((a,b)=>b.criado_em.localeCompare(a.criado_em));
 body.innerHTML=sorted.length?sorted.map(x=>{
  const l=linked.get(x.id);
  return '<tr><td>'+esc(dateBR(x.vencimento))+'</td><td><strong>'+esc(x.fornecedor_nome)+'</strong>'+
   '<small>'+esc(x.descricao||'Boleto adicionado')+'</small></td>'+
   '<td class="money">'+brl(x.valor_referencia)+'</td>'+
   '<td>'+(l?'<span class="state paid">'+(l.source==='extrato'?'Conciliado no extrato':'Conciliado no Fluxo')+'</span>':'<span class="state open">Em aberto</span>')+
   (l?'<small>Pago '+esc(dateBR(l.data_pagamento))+' · '+brl(l.valor_pago)+'</small>':'')+'</td>'+
   '<td>'+(l?'—':'<div class="fin-op-manual-actions">'+
    '<button type="button" class="btn" data-op-pay-manual="'+esc(x.id)+'">Dar baixa</button>'+
    '<button type="button" class="btn fin-op-delete-button" data-op-delete-manual="'+esc(x.id)+'">Excluir</button>'+
   '</div>')+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="empty">Nenhum boleto adicional registrado aqui. Use “Novo boleto” para incluir um compromisso esquecido.</td></tr>';
 write('op-manual-count',String(avulsos.filter(x=>!linked.has(x.id)).length)+' pendente(s) · '+avulsos.length+' cadastrado(s)');
}
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
  const {data:allowed,error:accessError}=await db.rpc('fluxo_caixa_autorizado');
  if(accessError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
  const [cp,extra,linked,bank,used,vendors,testBank,usedTestParcels,usedTestExcel,usedTestCards,paidImported]=await Promise.all([
   allRows(()=>db.from('fin_contas_pagar').select('id,fornecedor_nome,fornecedor_id,descricao,valor_referencia,vencimento,situacao,linha_origem_id').order('vencimento',{ascending:true})),
   allRows(()=>db.from('fin_boletos_avulsos').select('id,fornecedor_nome,descricao,categoria,vencimento,valor_referencia,criado_em').is('excluido_em',null).order('criado_em',{ascending:false})),
   allRows(()=>db.from('fin_baixas_operacionais').select('conta_pagar_id,boleto_avulso_id,movimento_id,valor_pago,data_pagamento,desconto,juros').order('criado_em',{ascending:false})),
   allRows(()=>db.from('fin_movimentos').select('id,descricao,valor,data_movimento,meio_pagamento,estado,origem')
    .eq('tipo','saida').eq('estado','confirmado').eq('origem','fluxo_caixa_homologado')
    .order('data_movimento',{ascending:false})),
   allRows(()=>db.from('fin_vinculos_pagamento').select('movimento_id').order('id',{ascending:false})),
   allRows(()=>db.from('fin_fornecedores').select('id,nome,desconto_atual_pct,desconto_ate_vencimento').order('nome',{ascending:true})),
   allRows(()=>db.from('fin_teste_movimentos')
    .select('id,descricao,valor,data_movimento,estado,referencia_cliente')
    .eq('tipo','saida').eq('estado','confirmado').like('referencia_cliente','extrato:%')
    .order('data_movimento',{ascending:false})),
   allRows(()=>db.from('fin_teste_vinculos').select('movimento_id').order('id',{ascending:false})),
   allRows(()=>db.from('fin_teste_excel_abertos_vinculos').select('movimento_id').order('vinculado_em',{ascending:false})),
   allRows(()=>db.from('fin_teste_fatura_pagamentos').select('movimento_id').order('id',{ascending:false})),
   allRows(()=>db.from('fin_baixas_extrato_avulsos')
    .select('boleto_avulso_id,movimento_teste_id,valor_pago,data_pagamento,desconto,juros')
    .order('criado_em',{ascending:false}))
  ]);
  accounts=cp;avulsos=extra;links=linked;importedLinks=paidImported;
  movements=[...bank.map(x=>({...x,source:'fluxo',ref:x.id,id:'fluxo:'+x.id})),
   ...testBank.map(x=>({...x,source:'extrato',ref:x.id,id:'extrato:'+x.id}))];
  otherUsed=new Set(used.map(x=>x.movimento_id));
  testUsed=new Set([...usedTestParcels,...usedTestExcel,...usedTestCards,...paidImported]
    .map(x=>x.movimento_id||x.movimento_teste_id));
  suppliers=new Map(vendors.map(x=>[x.id,x]));
  updateManualList();
  const previously=$('op-pay-select')?.value||'';
  byId.clear();
  const due=collectOpen(),original=[],manual=[];
  due.forEach(x=>{
   const id=x.tipo+':'+x.id;byId.set(id,x);
   const opt=new Option(optLabel(x),id);
   if(x.tipo==='avulso')manual.push(opt);else original.push(opt);
  });
  const list=$('op-pay-select');
  list.replaceChildren(new Option('Selecione um boleto pendente',''));
  if(original.length){const grp=document.createElement('optgroup');grp.label='Contas homologadas';original.forEach(x=>grp.append(x));list.append(grp)}
  if(manual.length){const grp=document.createElement('optgroup');grp.label='Boletos adicionados';manual.forEach(x=>grp.append(x));list.append(grp)}
  if(due.some(x=>x.tipo+':'+x.id===previously))list.value=previously;
  updateBank();
  write('op-pay-list-status',due.length+' boletos disponíveis para baixa: '+
   original.length+' da planilha e '+manual.length+' adicionados no aplicativo. '+
   movements.filter(x=>x.source==='fluxo').length+' saídas no Fluxo e '+
   movements.filter(x=>x.source==='extrato').length+' saídas em extratos importados antes de excluir vínculos já utilizados.');
 })();
 try{await loading}finally{loading=null}
}
function openDialog(id){
 const dlg=$(id);if(dlg?.showModal)dlg.showModal();else dlg?.setAttribute('open','');
}
function closeDialog(id){if($(id)?.open)$(id).close()}
async function openPay(preselect){
 write('op-pay-error','');
 $('op-pay-ack').checked=false;
 openDialog('op-pay-dialog');
 try{
  await load();
  if(preselect&&byId.has(preselect)){$('op-pay-select').value=preselect;updateBank()}
 }catch(e){write('op-pay-error','Não foi possível carregar as contas: '+(e.message||e))}
}
function openAdd(){
 $('op-new-form').reset();
 write('op-new-status','Informe os dados do boleto esquecido. Ele será registrado em aberto, sem gerar saída financeira.');
 openDialog('op-new-dialog');
}
async function createManual(e){
 e.preventDefault();if(busy)return;
 const form=$('op-new-form');
 const value=validAmount(form.elements.valor.value);
 if(value===null||value<=0){write('op-new-status','Informe um valor válido.');return}
 busy=true;$('op-new-submit').disabled=true;
 try{
  const {data,error}=await db.rpc('fin_boleto_avulso_criar',{
   p_fornecedor:form.elements.fornecedor.value,
   p_vencimento:form.elements.vencimento.value||null,
   p_valor:value/100,
   p_descricao:form.elements.descricao.value,
   p_categoria:form.elements.categoria.value,
   p_observacoes:form.elements.observacoes.value
  });
  if(error)throw error;
  closeDialog('op-new-dialog');await load();
  window.frFinanceUI?.showToast('Boleto registrado em aberto. Nenhum pagamento foi criado.');
  await window.frOperationalPayablesUI?.refresh?.();
  await openPay('avulso:'+data.id);
 }catch(e){write('op-new-status','Não foi possível salvar boleto: '+(e.message||e))}
 finally{busy=false;$('op-new-submit').disabled=false}
}
function requestDelete(id){
 const doc=avulsos.find(x=>x.id===id);
 if(!doc){
  write('op-pay-error','Boleto não encontrado. Atualize a lista antes de excluir.');
  return;
 }
 if(paidLinks().manual.has(id)){
  write('op-pay-error','Um boleto já conciliado não pode ser excluído.');
  return;
 }
 deleteTarget={id:doc.id,fornecedor:doc.fornecedor_nome,valor:doc.valor_referencia,vencimento:doc.vencimento};
 write('op-delete-description',
  doc.fornecedor_nome+' · '+brl(doc.valor_referencia)+' · vencimento '+dateBR(doc.vencimento)+
  (doc.descricao?' · '+doc.descricao:''));
 write('op-delete-status','O boleto sairá das listas. O registro da exclusão ficará disponível para auditoria.');
 openDialog('op-delete-dialog');
}
async function confirmDelete(e){
 e.preventDefault();
 if(busy||!deleteTarget)return;
 const target={...deleteTarget};
 busy=true;
 const confirm=$('op-delete-submit');
 if(confirm)confirm.disabled=true;
 try{
  const {data,error}=await db.rpc('fin_boleto_avulso_excluir',{p_boleto:target.id});
  if(error)throw error;
  if(!data||data.resultado!=='excluido')throw Error('O servidor não confirmou a exclusão.');
  deleteTarget=null;
  closeDialog('op-delete-dialog');
  const result=await Promise.allSettled([
   load(),
   window.frOperationalUI?.refresh?.()||Promise.resolve(),
   window.frOperationalPayablesUI?.refresh?.()||Promise.resolve()
  ]);
  const failure=result.find(x=>x.status==='rejected');
  window.frFinanceUI?.showToast(failure?
    'Boleto excluído com sucesso. Atualize a página para rever a lista.':
    'Boleto excluído da carteira. Pagamentos e planilha original preservados.',Boolean(failure));
 }catch(error){
  write('op-delete-status','Não foi possível excluir: '+(error.message||error));
 }finally{
  busy=false;
  if(confirm)confirm.disabled=false;
  updateDeleteButton();
 }
}
async function confirmPay(e){
 e.preventDefault();
 if(busy||!recalc()||!$('op-pay-ack').checked)return;
 const doc=chosen(),payment=movements.find(x=>x.id===$('op-pay-movement').value);
 const discount=validAmount($('op-pay-discount').value),fees=validAmount($('op-pay-fees').value);
 if(!doc||!payment||discount===null||fees===null)return;
 busy=true;$('op-pay-confirm').disabled=true;
 try{
  let response;
  if(payment.source==='fluxo'){
   response=await db.rpc('fin_baixa_operacional_vincular',{
    p_tipo:doc.tipo,p_boleto:doc.id,p_movimento:payment.ref,p_desconto:discount/100,p_juros:fees/100
   });
  }else if(doc.tipo==='homologado'){
   response=await db.rpc('fin_teste_conciliar_aberto_excel',{
    p_aberto:doc.linha_origem_id,p_movimento:payment.ref,p_desconto:discount/100,p_juros:fees/100
   });
  }else{
   response=await db.rpc('fin_boleto_avulso_conciliar_extrato',{
    p_boleto:doc.id,p_movimento:payment.ref,p_desconto:discount/100,p_juros:fees/100
   });
  }
  if(response.error)throw response.error;
  let warning='';
  if(payment.source==='extrato'&&doc.tipo==='homologado'){
   const sync=await db.rpc('fin_cp_sincronizar_conciliacoes');
   if(sync.error)warning=' Baixa do extrato salva, porém a carteira não sincronizou: '+sync.error.message;
  }
  await load();
  window.frFinanceUI?.showToast('Baixa vinculada a pagamento existente. Nenhuma saída duplicada.'+
    (warning?' Atualize a carteira.':''));
  await Promise.allSettled([window.frOperationalPayablesUI?.refresh?.()||Promise.resolve(),
   window.frOperationalUI?.refresh?.()||Promise.resolve(),
   window.frImportUI?.refresh?.()||Promise.resolve()]);
  closeDialog('op-pay-dialog');
  if(warning)window.frFinanceUI?.showToast(warning,true);
 }catch(error){
  write('op-pay-error','Falha ao vincular: '+(error.message||error)+'. Nenhum pagamento novo foi criado.');
 }finally{busy=false;recalc()}
}

function init(){
 if(!$('op-pay-dialog'))return;
 document.querySelectorAll('[data-ops-pay]').forEach(button=>
  button.addEventListener('click',()=>openPay().catch(e=>write('op-pay-error',String(e)))));
 document.querySelectorAll('[data-ops-new]').forEach(button=>button.addEventListener('click',openAdd));
 $('op-pay-select')?.addEventListener('change',()=>{ $('op-pay-ack').checked=false;updateBank() });
 $('op-pay-delete')?.addEventListener('click',()=>{
  const doc=chosen();
  if(doc?.tipo==='avulso')requestDelete(doc.id);
 });
 $('op-delete-form')?.addEventListener('submit',confirmDelete);
 $('op-delete-cancel')?.addEventListener('click',()=>{
  deleteTarget=null;closeDialog('op-delete-dialog');
 });
 $('op-delete-dialog')?.addEventListener('close',()=>{deleteTarget=null;});
 $('op-pay-movement')?.addEventListener('change',()=>{$('op-pay-ack').checked=false;movementChanged()});
 ['op-pay-discount','op-pay-fees'].forEach(id=>$(id)?.addEventListener('input',recalc));
 $('op-pay-ack')?.addEventListener('change',recalc);
 $('op-pay-use-difference')?.addEventListener('click',()=>{
  const doc=chosen(),bank=movements.find(x=>x.id===$('op-pay-movement').value);
  if(!doc||!bank)return;
  const fees=validAmount($('op-pay-fees').value);
  if(fees===null)return;
  const diff=cents(doc.valor)+fees-cents(bank.valor);
  if(diff>0&&diff<=cents(doc.valor)){$('op-pay-discount').value=(diff/100).toFixed(2);recalc()}
 });
 $('op-pay-form')?.addEventListener('submit',confirmPay);
 $('op-new-form')?.addEventListener('submit',createManual);
 document.querySelectorAll('[data-op-close]').forEach(b=>
  b.addEventListener('click',()=>closeDialog(b.dataset.opClose)));
 if(!document.querySelector('[data-view-panel="payables"]')?.hidden){
  load().catch(e=>write('op-manual-count','Falha ao carregar boletos: '+(e.message||e)));
 }
 $('op-manual-rows')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-op-pay-manual]');
  const del=e.target.closest('[data-op-delete-manual]');
  if(button)openPay('avulso:'+button.dataset.opPayManual).catch(()=>{});
  else if(del)requestDelete(del.dataset.opDeleteManual);
 });
}
window.frBoletoUI={openPay,openAdd,refresh:load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
