/* FR Motors | Cálculo puro de margem estimada sobre entradas do caixa.
 * NÃO é lucro contábil. Entradas e saídas incluem movimentos de caixa,
 * que podem conter transferências, aportes e outros itens não operacionais.
 * Não adicionar documentos ou faturas ao total bancário.
 */
(function(root){
'use strict';
function calculate(incomingCents,outgoingCents){
 const incoming=Number(incomingCents),outgoing=Number(outgoingCents);
 if(!Number.isSafeInteger(incoming)||!Number.isSafeInteger(outgoing)||
  incoming<0||outgoing<0)
  return {available:false,percent:null,netCents:null,reason:'invalid'};
 const netCents=incoming-outgoing;
 if(incoming===0)return {available:false,percent:null,netCents,reason:'no_receipts'};
 return {available:true,percent:netCents/incoming*100,netCents,reason:null};
}
function format(percent){
 if(percent===null||percent===undefined||!Number.isFinite(percent))return '—';
 return new Intl.NumberFormat('pt-BR',{
  minimumFractionDigits:1,maximumFractionDigits:1
 }).format(percent)+'%';
}
const api=Object.freeze({calculate,format});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frProfitMarginCore=api;
})(typeof window!=='undefined'?window:null);
