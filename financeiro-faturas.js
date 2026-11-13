/* FR Motors · Conciliação de faturas pagas, exclusivamente no ambiente de testes. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const format=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateBR=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'Não informado';
let rows={imports:[],faturas:[],payments:[],cardMoves:[],bank:[],boletoLinks:[]};
let selected=null,busy=false,refreshing=null,manualRequestKey=null;
function say(text,bad=false){
 const el=$('invoice-message');if(!el)return;
 el.textContent=text;el.className='status '+(bad?'bad':'ok');
}
async function getRows(builder,limit=8000){
 const result=[],size=700;
 for(let start=0;start<limit;start+=size){
  const {data,error}=await builder().range(start,start+size-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<size)return result;
 }
 throw Error('Existem mais registros do que o limite da consulta. Verifique o período e a paginação.');
}
function invoiceFor(importId){return rows.faturas.find(i=>i.importacao_id===importId)}
function stats(importId){
 const i=invoiceFor(importId);
 const values=rows.cardMoves.filter(m=>m.importacao_id===importId);
 const estimated=values.reduce((sum,v)=>sum+Math.round(Number(v.valor)*100)*(v.natureza==='compra'?1:-1),0)/100;
 const linked=i?rows.payments.filter(x=>x.fatura_id===i.id):[];
 const paid=linked.reduce((sum,p)=>sum+Math.round(Number(p.valor_aplicado)*100),0)/100;
 return {i,estimated,linked,paid,total:i?Number(i.valor_total):null,remaining:i?Number(i.valor_total)-paid:null};
}
function badge(stats){
 if(!stats.i)return '<span class="state">A confirmar</span>';
 if(stats.remaining<0.005)return '<span class="state paid">Paga</span>';
 if(stats.paid>0)return '<span class="state open">Parcial</span>';
 return '<span class="state open">Em aberto</span>';
}
function showList(){
 const root=$('invoice-list');
 if(!root)return;
 if(!rows.imports.length){
  root.innerHTML='<div class="empty-state"><strong>Nenhuma fatura importada</strong><p>Importe uma fatura de cartão para confirmar o valor e acompanhar a quitação.</p></div>';
  return;
 }
 root.innerHTML=rows.imports.map(item=>{
  const s=stats(item.id),active=selected===item.id;
  return '<button type="button" class="invoice-row'+(active?' selected':'')+'" data-select-invoice="'+esc(item.id)+'" aria-pressed="'+active+'">'+
   '<span><strong>'+esc(item.conta_nome)+'</strong><small>'+esc(item.arquivo_nome)+'</small>'+
   '<small>Compras menos estornos: '+format(s.estimated)+'</small></span>'+
   '<span class="invoice-status-side">'+badge(s)+'<b>'+(!s.i?'Total pendente':format(s.total))+'</b></span></button>';
 }).join('');
}
function detail(){
 showList();
 const item=rows.imports.find(i=>i.id===selected);
 $('invoice-empty').classList.toggle('hidden',Boolean(item));
 $('invoice-detail').classList.toggle('hidden',!item);
 if(!item)return;
 const s=stats(item.id);
 $('invoice-name').textContent=item.conta_nome+' · '+item.arquivo_nome;
 $('invoice-total').value=s.i?Number(s.total).toFixed(2):'';
 $('invoice-total').placeholder='Confirme o total no PDF (estimado: '+format(s.estimated)+')';
 $('invoice-due-date').value=s.i?.vencimento||'';
 $('invoice-value-status').innerHTML=badge(s)+
  (s.i?'<span>Total confirmado: <b>'+format(s.total)+'</b> · Pago: <b>'+format(s.paid)+'</b> · Restante: <b>'+format(Math.max(0,s.remaining))+'</b></span>':
    '<span>Confirme o valor total da fatura antes de conciliar pagamentos. Compras do cartão não correspondem necessariamente ao total devido.</span>');
 const bankRoot=$('invoice-bank-move'),prev=bankRoot.value;
 const unavailable=new Set([...rows.boletoLinks.map(x=>x.movimento_id),...rows.payments.map(x=>x.movimento_id)]);
 const candidates=rows.bank.filter(x=>!unavailable.has(x.id));
 bankRoot.disabled=!candidates.length;
 $('invoice-bank-empty').hidden=candidates.length>0;
 $('invoice-bank-empty').textContent=candidates.length?
  '':
  'Nenhuma saída bancária disponível. Importe um extrato bancário ou registre abaixo um pagamento já realizado. Pagamentos vinculados a outros compromissos não aparecem nesta lista.';
 bankRoot.replaceChildren(new Option('Selecione uma saída do extrato',''),
  ...candidates.map(m=>new Option(dateBR(m.data_movimento)+' · '+m.descricao.slice(0,45)+' · '+format(m.valor),m.id)));
 if(candidates.some(m=>m.id===prev))bankRoot.value=prev;
 const payRoot=$('invoice-payments');
 payRoot.replaceChildren();
 if(!s.linked.length){
  payRoot.innerHTML='<p class="info-note">Nenhum pagamento bancário vinculado a esta fatura.</p>';
 }else{
  const bankLookup=new Map(rows.bank.map(m=>[m.id,m]));
  for(const pay of s.linked){
   const line=document.createElement('div');line.className='invoice-payment-line';
   const m=bankLookup.get(pay.movimento_id);
   const label=document.createElement('span');
   label.textContent=dateBR(m?.data_movimento)+' · '+format(pay.valor_aplicado)+(m?' · '+m.descricao.slice(0,44):'');
   const button=document.createElement('button');
   button.type='button';button.className='row-edit-button';button.textContent='Desvincular';
   button.dataset.unlinkMove=pay.movimento_id;
   line.append(label,button);payRoot.append(line);
  }
 }
 const amount=$('invoice-manual-amount');
 if(document.activeElement!==amount)amount.value=s.i&&s.remaining>0?Number(s.remaining).toFixed(2):'';
 if(!$('invoice-manual-date').value){
  const d=new Date();
  $('invoice-manual-date').value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 }
 updateButton();
}
function updateButton(){
 if(!$('invoice-apply-bank'))return;
 const s=selected?stats(selected):null;
 const move=rows.bank.find(b=>b.id===$('invoice-bank-move').value);
 const enough=Boolean(s?.i&&move&&s.remaining>0.005&&Math.round(Number(move.valor)*100)<=Math.round(s.remaining*100));
 $('invoice-apply-bank').disabled=busy||!enough;
 const manualAmount=Number($('invoice-manual-amount')?.value);
 const manualCents=Math.round(manualAmount*100);
 const manualValid=Boolean(s?.i&&$('invoice-manual-date').value&&
  Number.isSafeInteger(manualCents)&&manualCents>0&&
  Math.abs(manualAmount*100-manualCents)<0.00001&&
  s.remaining>0.005&&manualCents<=Math.round(s.remaining*100));
 $('invoice-register-manual').disabled=busy||!manualValid;
 if(!busy&&s?.i&&move&&!enough&&Math.round(Number(move.valor)*100)>Math.round(s.remaining*100)){
  say('A saída escolhida supera o saldo da fatura. Confira se o valor total do PDF está correto.',true);
 }
}
async function refresh(){
 if(typeof db==='undefined'||!db||!$('invoice-list'))return;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const [imports,faturas,payments,cardMoves,allBankMoves,boletoLinks]=await Promise.all([
   getRows(()=>db.from('fin_teste_importacoes').select('id,conta_nome,arquivo_nome,criado_em')
    .eq('tipo','cartao').order('criado_em',{ascending:false}).order('id',{ascending:false})),
   getRows(()=>db.from('fin_teste_faturas').select('id,importacao_id,valor_total,vencimento').order('criado_em',{ascending:false})),
   getRows(()=>db.from('fin_teste_fatura_pagamentos').select('id,fatura_id,movimento_id,valor_aplicado').order('criado_em',{ascending:false})),
   getRows(()=>db.from('fin_teste_cartao_lancamentos').select('importacao_id,natureza,valor').order('id',{ascending:false})),
   getRows(()=>db.from('fin_teste_movimentos').select('id,descricao,valor,data_movimento,referencia_cliente,tipo,estado')
    .eq('tipo','saida').eq('estado','confirmado')
    .order('data_movimento',{ascending:false}).order('id',{ascending:false})),
   getRows(()=>db.from('fin_teste_vinculos').select('movimento_id').order('id',{ascending:false}))
  ]);
  const bank=allBankMoves.filter(m=>m.referencia_cliente?.startsWith('extrato:')||
    m.referencia_cliente?.startsWith('fatura_manual:'));
  rows={imports,faturas,payments,cardMoves,bank,boletoLinks};
  if(selected&&!imports.some(x=>x.id===selected))selected=null;
  if(!selected&&imports.length)selected=imports[0].id;
  detail();
 })().catch(e=>{say('Não foi possível atualizar faturas: '+e.message,true);throw e})
 .finally(()=>{refreshing=null});
 return refreshing;
}
async function registerManualPayment(){
 if(busy||!selected)return;
 const s=stats(selected);
 if(!s.i){say('Confirme primeiro o valor total da fatura.',true);return;}
 const amount=Number($('invoice-manual-amount').value);
 const cents=Math.round(amount*100);
 const date=$('invoice-manual-date').value;
 const method=$('invoice-manual-method').value;
 if(!date||!Number.isSafeInteger(cents)||cents<=0||
    Math.abs(amount*100-cents)>0.00001||cents>Math.round(s.remaining*100)){
  say('Confira a data e o valor pago. Ele não pode superar o saldo restante da fatura.',true);
  return;
 }
 if(!window.confirm('Confirma que este pagamento de '+format(amount)+
   ' já foi realizado? Isso registrará uma saída no caixa de TESTES e vinculará à fatura.'))return;
 if(!manualRequestKey)manualRequestKey=crypto.randomUUID();
 busy=true;updateButton();
 try{
  const {data,error}=await db.rpc('fin_teste_registrar_pagamento_fatura',{
   p_fatura:s.i.id,
   p_data:date,
   p_valor:cents/100,
   p_meio:method,
   p_chave:manualRequestKey
  });
  if(error)throw error;
  manualRequestKey=null;
  await Promise.allSettled([refresh(),typeof render==='function'?render():Promise.resolve()]);
  say(data?.status==='paga'?
    'Fatura quitada com pagamento manual. A saída foi registrada uma única vez no caixa de testes.':
    'Pagamento manual vinculado. Falta pagar '+format(data?.saldo_restante)+'.');
  window.frFinanceUI?.showToast('Pagamento registrado e conciliado.');
 }catch(e){
  say('Não foi possível registrar o pagamento: '+e.message,true);
 }finally{busy=false;updateButton()}
}
async function saveTotal(){
 if(!selected||busy)return;
 const raw=Number($('invoice-total').value);
 if(!Number.isFinite(raw)||raw<=0||Math.abs(raw*100-Math.round(raw*100))>0.00001){
  return say('Informe o valor total exato que aparece na fatura.',true);
 }
 busy=true;$('invoice-save-total').disabled=true;updateButton();
 try{
  const {error}=await db.rpc('fin_teste_definir_fatura',{
   p_importacao:selected,p_total:Math.round(raw*100)/100,
   p_vencimento:$('invoice-due-date').value||null
  });
  if(error)throw error;
  say('Total da fatura confirmado. Agora selecione uma saída bancária.');
  await refresh();
 }catch(e){say('Não foi possível confirmar a fatura: '+e.message,true)}
 finally{busy=false;$('invoice-save-total').disabled=false;updateButton()}
}
async function settle(){
 const s=selected?stats(selected):null;
 const movement=$('invoice-bank-move').value;
 if(busy||!s?.i||!movement||$('invoice-apply-bank').disabled)return;
 busy=true;updateButton();
 try{
  const {data,error}=await db.rpc('fin_teste_conciliar_fatura',{p_fatura:s.i.id,p_movimento:movement});
  if(error)throw error;
  say(data?.status==='paga'?'Fatura quitada! Saída bancária vinculada sem duplicar despesas.':
   'Pagamento parcial conciliado. Saldo restante: '+format(data.saldo_restante));
  window.frFinanceUI?.showToast('Pagamento da fatura conciliado sem gerar estorno.');
  await refresh();
 }catch(e){say('Erro ao conciliar: '+e.message,true)}
 finally{busy=false;updateButton()}
}
async function unlink(id){
 if(busy||!id||!window.confirm('Desvincular este pagamento da fatura? A saída bancária continuará no extrato, sem ser excluída.'))return;
 busy=true;updateButton();
 try{
  const {error}=await db.rpc('fin_teste_desvincular_fatura',{p_movimento:id});
  if(error)throw error;
  say('Vínculo desfeito. O lançamento bancário original foi preservado.');
  await refresh();
 }catch(e){say('Não foi possível desvincular: '+e.message,true)}
 finally{busy=false;updateButton()}
}
function init(){
 if(!$('invoice-list'))return;
 $('invoice-list').addEventListener('click',e=>{
  const t=e.target.closest('[data-select-invoice]');
  if(!t)return;
  if(selected!==t.dataset.selectInvoice)manualRequestKey=null;
  selected=t.dataset.selectInvoice;detail();say('');
 });
 $('invoice-save-total').addEventListener('click',saveTotal);
 $('invoice-apply-bank').addEventListener('click',settle);
 $('invoice-register-manual').addEventListener('click',registerManualPayment);
 ['invoice-manual-amount','invoice-manual-date','invoice-manual-method'].forEach(id=>{
  $(id).addEventListener(id==='invoice-manual-amount'?'input':'change',updateButton);
 });
 $('invoice-go-import').addEventListener('click',()=>{
  const radio=document.querySelector('input[name="import-kind"][value="banco"]');
  if(radio&&!radio.checked){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}
  const file=$('import-file');
  file?.scrollIntoView({behavior:'smooth',block:'center'});
  file?.click();
 });
 $('invoice-bank-move').addEventListener('change',updateButton);
 $('invoice-payments').addEventListener('click',e=>{
  const t=e.target.closest('[data-unlink-move]');
  if(t)unlink(t.dataset.unlinkMove);
 });
}
window.frFaturasUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();