/* Financeiro FR Motors · edição e cancelamento auditados de novos registros do site. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const fmtBR=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const cash=v=>fmtBR.format(Number(v)||0);
let selected=null;
let busy=false;
const showError=(message)=>{
 const el=$('edit-feedback');if(el){el.textContent=message;el.className='status bad'}
};
function money(v){
 const n=Number(v);
 if(!Number.isFinite(n)||n<=0)return null;
 const cents=Math.round(n*100);
 if(!Number.isSafeInteger(cents)||Math.abs(n*100-cents)>0.00001)return null;
 return cents/100;
}
function moneyNonnegative(v){
 const n=Number(v);const cents=Math.round(n*100);
 return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(cents)&&Math.abs(n*100-cents)<0.00001?cents/100:null;
}
function dropdown(id,value,placeholder){
 const field=$(id);if(!field)return;
 const suppliers=window.frFinanceUI?.getSnapshot()?.suppliers||[];
 field.replaceChildren(new Option(placeholder,''));
 for(const s of suppliers.filter(s=>s.ativo)){
   field.add(new Option(s.nome,s.id));
 }
 field.value=value||'';
}
function toggleFields(kind){
 for(const [attr,show] of [['data-edit-move',kind==='movimento'],['data-edit-purchase',kind==='compra']]){
  document.querySelectorAll('['+attr+']').forEach(group=>{
   group.classList.toggle('hidden',!show);
   group.querySelectorAll('input,select,textarea').forEach(control=>control.disabled=!show);
  });
 }
}
function toggleBusy(on){
 busy=on;
 for(const id of ['edit-save','edit-delete-start','edit-delete-confirm','edit-delete-cancel']){if($(id))$(id).disabled=on;}
}
function resetDeleteConfirm(){
 $('edit-confirm').classList.add('hidden');
 $('edit-delete-start').classList.remove('hidden');
 if($('edit-save'))$('edit-save').disabled=busy||Boolean(selected?.locked);
}
function fillParts(parts){
 const root=$('edit-installments');
 root.replaceChildren();
 parts.sort((a,b)=>a.numero-b.numero).forEach(p=>{
  const row=document.createElement('div');
  row.className='installment-row';
  row.dataset.parcela=String(p.numero);
  const num=document.createElement('b');num.textContent=p.numero+'/'+parts.length;
  const dateLabel=document.createElement('label');dateLabel.textContent='Vencimento';
  const date=document.createElement('input');date.type='date';date.required=true;date.className='edit-part-date';date.value=p.vencimento;
  const amountLabel=document.createElement('label');amountLabel.textContent='Valor (R$)';
  const amount=document.createElement('input');amount.type='number';amount.min='0.01';amount.step='0.01';amount.required=true;amount.className='edit-part-amount';amount.value=Number(p.valor_cheio).toFixed(2);
  dateLabel.append(date);amountLabel.append(amount);row.append(num,dateLabel,amountLabel);
  root.append(row);
 });
 checkPurchaseTotal();
}
function readParts(){
 return [...document.querySelectorAll('#edit-installments .installment-row')].map((row,i)=>({
  numero:i+1,
  vencimento:row.querySelector('.edit-part-date').value,
  valor_cheio:money(row.querySelector('.edit-part-amount').value)
 }));
}
function checkPurchaseTotal(){
 const sum=readParts().reduce((a,p)=>a+Math.round((p.valor_cheio||0)*100),0);
 const total=money($('edit-purchase-amount')?.value);
 const valid=total!==null && readParts().length>0 && readParts().every(p=>p.vencimento&&p.valor_cheio!==null)
  && sum===Math.round(total*100);
 const label=$('edit-installments-check');
 label.textContent=(valid?'Parcelas conferidas':'A soma das parcelas não confere')+
  ': '+cash(sum/100)+' de '+cash(total||0)+'.';
 label.classList.toggle('bad',!valid);label.classList.toggle('ok',valid);
 return valid;
}
function close(){if(!busy)window.frFinanceUI?.closeModal('edit');}
async function open(kind,id){
 if(busy||!['movimento','compra'].includes(kind)||!/^[0-9a-f-]{36}$/i.test(id))return;
 const snapshot=window.frFinanceUI?.getSnapshot();if(!snapshot)return;
 let record=(kind==='movimento'?snapshot.moves:snapshot.purchases).find(r=>r.id===id);
 if(!record){window.frFinanceUI?.showToast('Registro não encontrado. Atualize a página.',true);return}
 const prefix=kind==='movimento'?'site-financeiro-mov-':'site-financeiro-compra-';
 if(record.origem!=='app'||!record.referencia_origem?.startsWith(prefix)){
  window.frFinanceUI?.showToast('Histórico protegido. Somente cadastros novos do site podem ser editados.',true);return;
 }
 selected={kind,id,linked:false,locked:false};
 $('edit-feedback').textContent='';
 $('edit-linked-notice').textContent='Este lançamento possui vínculos financeiros e está bloqueado para edição. Consulte as conciliações antes de qualquer correção.';
 $('edit-linked-notice').classList.add('hidden');
 resetDeleteConfirm();
 toggleFields(kind);
 $('edit-description').value=record.descricao||'';
 $('edit-title').textContent=kind==='movimento'?'Editar lançamento':'Editar compra';
 $('edit-subtitle').textContent=kind==='movimento'?'Ajuste as informações do lançamento.':'Corrija a compra e seus vencimentos antes de salvar.';
 dropdown('edit-move-supplier',kind==='movimento'?record.fornecedor_id:null,'Não se aplica');
 dropdown('edit-purchase-supplier',kind==='compra'?record.fornecedor_id:null,'Selecione');
 if(kind==='movimento'){
  $('edit-move-date').value=record.data_movimento||'';
  $('edit-move-type').value=record.tipo||'saida';
  $('edit-move-amount').value=Number(record.valor).toFixed(2);
  $('edit-move-category').value=record.categoria||'';
  $('edit-move-method').value=record.meio_pagamento||'';
  const {data,error}=await db.from('fin_vinculos_pagamento').select('id').eq('movimento_id',id).limit(1);
  if(error){window.frFinanceUI?.showToast('Não foi possível conferir os vínculos: '+error.message,true);return}
  if(selected?.id!==id)return;
  selected.linked=(data||[]).length>0;
  selected.locked=selected.linked;
  for(const field of ['edit-move-amount','edit-move-type','edit-move-supplier'])$(field).disabled=selected.locked;
  $('edit-linked-notice').classList.toggle('hidden',!selected.locked);
  $('edit-save').disabled=selected.locked;
  $('edit-delete-start').disabled=selected.locked;
 }else{
  $('edit-purchase-date').value=record.data_compra||'';
  $('edit-purchase-amount').value=Number(record.valor_total).toFixed(2);
  $('edit-purchase-method').value=record.forma_pagamento||'boleto';
  const {data,error}=await db.from('fin_parcelas').select('id,numero,vencimento,valor_cheio,status').eq('compra_id',id).order('numero');
  if(error){window.frFinanceUI?.showToast('Não foi possível carregar as parcelas: '+error.message,true);return}
  if(selected?.id!==id)return;
  if(!data?.length){window.frFinanceUI?.showToast('A compra não possui parcelas para editar.',true);return}
  fillParts(data);
  selected.locked=data.some(p=>p.status!=='aberto');
  if(selected.locked){
    $('edit-linked-notice').textContent='Esta compra tem parcelas pagas ou canceladas. As baixas e os registros anteriores precisam permanecer preservados; não é possível alterá-la aqui.';
    $('edit-linked-notice').classList.remove('hidden');
  }
  $('edit-save').disabled=selected.locked;
  $('edit-delete-start').disabled=selected.locked;
 }
 // Reabilitar ações no próximo registro (compras pagas ficam bloqueadas).
 if(!selected.locked){$('edit-save').disabled=false;$('edit-delete-start').disabled=false;}
 window.frFinanceUI?.openModal('edit');
}
async function save(e){
 e.preventDefault();
 if(!selected||busy)return;
 const {kind,id}=selected;
 if(selected.locked)return showError('Este registro tem vínculos ou parcelas finalizadas e não pode ser editado.');
 let payload;
 try{
  if(kind==='movimento'){
   const value=money($('edit-move-amount').value);
   if(value===null)throw Error('Informe um valor positivo válido.');
   payload={tipo:$('edit-move-type').value,data_movimento:$('edit-move-date').value,
     descricao:$('edit-description').value.trim(),valor:value,
     categoria:$('edit-move-category').value.trim()||null,
     fornecedor_id:$('edit-move-supplier').value||null,
     meio_pagamento:$('edit-move-method').value||null};
  }else{
   if(!checkPurchaseTotal())throw Error('A soma das parcelas deve ser igual ao total da compra.');
   const amount=money($('edit-purchase-amount').value);
   if(amount===null)throw Error('Informe um valor positivo válido.');
   payload={fornecedor_id:$('edit-purchase-supplier').value,
     data_compra:$('edit-purchase-date').value,descricao:$('edit-description').value.trim(),
     forma_pagamento:$('edit-purchase-method').value,
     valor_total:amount,parcelas:readParts()};
  }
  if(!payload.descricao&&kind==='movimento')throw Error('Informe a descrição do lançamento.');
  toggleBusy(true);
  const {error}=await db.rpc(kind==='movimento'?'fin_site_alterar_movimento':'fin_site_alterar_compra',
    {p_id:id,p_acao:'editar',p_dados:payload});
  if(error)throw error;
  window.frFinanceUI?.closeModal('edit');
  window.frFinanceUI?.showToast(kind==='movimento'?'Lançamento atualizado.':'Compra atualizada.');
  await render();
 }catch(error){showError(error.message||'Não foi possível salvar alterações.')}
 finally{toggleBusy(false)}
}
function beginDelete(){
 if(!selected||busy||selected.locked)return;
 $('edit-confirm').classList.remove('hidden');
 $('edit-delete-start').classList.add('hidden');
 $('edit-save').disabled=true;
 $('edit-delete-confirm').focus();
 const linked=selected.kind==='movimento'&&selected.linked;
 $('edit-confirm-description').textContent=linked?
  'Esta baixa possui vínculos e não pode ser cancelada por este formulário.':
  selected.kind==='compra'?
  'Esta compra e suas parcelas ainda não pagas serão CANCELADAS. Permanecerão no histórico e na auditoria.':
  'Este lançamento será CANCELADO, não apagado. A auditoria preservará os dados anteriores.';
}
async function remove(){
 if(!selected||busy||selected.locked)return;
 const {kind,id}=selected;
 try{
  toggleBusy(true);
  const {data,error}=await db.rpc(kind==='movimento'?'fin_site_alterar_movimento':'fin_site_alterar_compra',
    {p_id:id,p_acao:'cancelar',p_dados:{}});
  if(error)throw error;
  window.frFinanceUI?.closeModal('edit');
  window.frFinanceUI?.showToast(kind==='compra'?'Compra cancelada com registro de auditoria.':'Movimentação cancelada com registro de auditoria.');
  await render();
 }catch(error){showError(error.message||'Não foi possível cancelar o registro.')}
 finally{toggleBusy(false)}
}
function init(){
 const modal=$('modal-edit');if(!modal)return;
 document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-edit-record][data-edit-id]');
  if(btn){event.preventDefault();open(btn.dataset.editRecord,btn.dataset.editId).catch(e=>window.frFinanceUI?.showToast(e.message,true));}
 });
 $('edit-form').addEventListener('submit',save);
 $('edit-delete-start').addEventListener('click',beginDelete);
 $('edit-delete-cancel').addEventListener('click',()=>{resetDeleteConfirm();$('edit-delete-start').focus()});
 $('edit-delete-confirm').addEventListener('click',remove);
 $('edit-purchase-amount').addEventListener('input',checkPurchaseTotal);
 $('edit-installments').addEventListener('input',checkPurchaseTotal);
 modal.addEventListener('close',()=>{selected=null;resetDeleteConfirm();});
}
window.frFinanceEdit={open};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();