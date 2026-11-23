/* FR Motors | Comparativo documental de autopeças e cartões por finalidade.
 * Não infere destino por categoria, descrição, fornecedor ou competência.
 * Autopeças e cartões são fontes independentes; não somá-las como caixa. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.frDocumentPurposeCore=api;
})(typeof window!=='undefined'?window:undefined,function(){
 'use strict';
 const OTHER_MEANS=new Set(['PIX','DÉBITO','DEBITO']);
 const isOtherMean=name=>OTHER_MEANS.has(String(name||'').trim().toLocaleUpperCase('pt-BR'));
 const signedCents=value=>{
  const c=Math.round(Number(value)*100);
  if(!Number.isSafeInteger(c))throw Error('Documento com valor inválido');
  return c;
 };
 const monthOf=row=>{
  const value=row?.grupo==='cartoes'?(row.mes_fatura||row.data_evento):(row.vencimento||row.data_evento);
  return /^\d{4}-\d{2}/.test(String(value||''))?String(value).slice(0,7):'sem-mes';
 };
 function summarizeMonths(documents,manualFinalidades){
  const byMonth=new Map(),finalidades=manualFinalidades||new Map();
  for(const row of documents){
   if(row.incluir!==true)continue;
   const key=monthOf(row);
   let target=byMonth.get(key);
   if(!target){
    target={auto:0,autoCount:0,card:0,cardCount:0,oficina:0,oficinaCount:0,
     outras:0,outrasCount:0,pendentes:0,pendentesCount:0,meios:0,meiosCount:0};
    byMonth.set(key,target);
   }
   const c=signedCents(row.valor_registrado);
   if(row.grupo==='autopecas'){target.auto+=c;target.autoCount++;continue}
   if(row.grupo!=='cartoes')continue;
   target.card+=c;target.cardCount++;
   if(isOtherMean(row.cartao_nome)){target.meios+=c;target.meiosCount++;continue}
   const finalidade=finalidades.get(row.id);
   if(finalidade==='oficina'){target.oficina+=c;target.oficinaCount++}
   else if(finalidade==='outras'){target.outras+=c;target.outrasCount++}
   else{target.pendentes+=c;target.pendentesCount++}
  }
  for(const item of byMonth.values()){
   if(item.card!==item.oficina+item.outras+item.pendentes+item.meios)
    throw Error('Divergência no fechamento das finalidades de cartão');
   if(item.cardCount!==item.oficinaCount+item.outrasCount+item.pendentesCount+item.meiosCount)
    throw Error('Divergência na quantidade de compras por finalidade');
  }
  return byMonth;
 }
 return {isOtherMean,monthOf,summarizeMonths};
});
