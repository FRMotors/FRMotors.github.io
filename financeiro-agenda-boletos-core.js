/* FR Motors · parcelas de compras em boleto para Agenda e alertas.
 * Pureza: transforma apenas registros pendentes, sem lançar pagamentos.
 * Não confundir crédito parcelado e boletos; status pago/cancelado fica fora.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.frAgendaBoletosCore=api;
})(typeof window!=='undefined'?window:undefined,function(){
 'use strict';
 function openInstallments(rows,suppliers){
  const vendors=suppliers instanceof Map?suppliers:new Map();
  const seen=new Set(),result=[];
  for(const row of rows||[]){
   if(row.status!=='aberto'||row.fin_compras?.forma_pagamento!=='boleto'||!row.id||seen.has(row.id))continue;
   const n=Number(row.valor_cheio),cents=Math.round(n*100);
   if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(cents))
    throw Error('Parcela de boleto com valor inválido: não mostrar totais incompletos.');
   seen.add(row.id);
   const number=Number(row.numero);
   result.push({
    id:row.id,compraId:row.compra_id||row.fin_compras?.id||null,
    numero:Number.isInteger(number)&&number>0?number:null,
    vencimento:row.vencimento||null,
    fornecedor:vendors.get(row.fin_compras?.fornecedor_id)||'Fornecedor cadastrado',
    descricao:row.fin_compras?.descricao||'Compra em boleto',
    valorCentavos:cents
   });
  }
  return result.sort((a,b)=>String(a.vencimento||'9999-99-99').localeCompare(String(b.vencimento||'9999-99-99'))||
   String(a.id).localeCompare(String(b.id)));
 }
 return {openInstallments};
});
