/* FR Motors · Situação consolidada de faturas, sem modificar dados de origem.
 * O status documental bruto não indica pagamento: comprovantes e declarações são a fonte.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.frInvoiceStateCore=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const cents=value=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0;};
function buildInvoiceStates(invoices,declarations,partials,fullPayments,agendas,normalize){
 const canonical=typeof normalize==='function'?normalize:(x=>String(x||'Cartão não identificado'));
 const declared=new Set((declarations||[]).map(x=>x.fatura_id));
 const part=new Map(),external=new Map(),full=new Map(),due=new Map();
 (partials||[]).forEach(x=>{
  part.set(x.fatura_id,(part.get(x.fatura_id)||0)+cents(x.valor_pago));
  if(x.origem==='externo')external.set(x.fatura_id,(external.get(x.fatura_id)||0)+cents(x.valor_pago));
 });
 (fullPayments||[]).forEach(x=>
  full.set(x.fatura_id,(full.get(x.fatura_id)||0)+cents(x.valor_conferido)));
 (agendas||[]).forEach(x=>due.set(x.fatura_id,{
  vencimento:x.vencimento||null,observacoes:x.observacoes||''
 }));
 return (invoices||[]).map(x=>{
  const total=Math.max(0,cents(x.valor_documental)),isDeclared=declared.has(x.id);
  const paid=Math.max(0,full.has(x.id)?full.get(x.id):part.get(x.id)||0);
  const externalPaid=Math.min(paid,external.get(x.id)||0);
  const bankPaid=Math.max(0,paid-externalPaid);
  const remaining=isDeclared?0:Math.max(0,total-paid);
  const status=isDeclared?'declarada':remaining===0&&externalPaid>0&&bankPaid===0?'externa':
   remaining===0&&externalPaid>0?'mista':remaining===0?'conciliada':
   paid>0?'parcial':'aberta';
  return {id:x.id,card:canonical(x.cartao_nome),originalCard:x.cartao_nome||'',
   period:x.mes_fatura,transactions:x.quantidade_lancamentos||0,total,paid,
   bankPaid,externalPaid,remaining,status,due:due.get(x.id)?.vencimento||null,
   notes:due.get(x.id)?.observacoes||''};
 });
}
return {cents,buildInvoiceStates};
});
