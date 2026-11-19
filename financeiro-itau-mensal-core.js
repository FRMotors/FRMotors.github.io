/* FR Motors | Motor de visualização mensal do Itaú.
 * Somente leitura; históricos homologados e prévias nunca são regravados.
 * Centavos inteiros e origem explícita para evitar misturar fontes. */
(function(root){
'use strict';
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim();
function cents(value){
 const number=Number(value);
 if(!Number.isFinite(number)||number<0)throw Error('Movimento com valor inválido.');
 const result=Math.round(number*100);
 if(!Number.isSafeInteger(result))throw Error('Valor acima do limite seguro.');
 return result;
}
function validDate(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(new Date(value+'T00:00:00Z').getTime())&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function officialRows(records){
 if(!Array.isArray(records))throw Error('Histórico homologado indisponível.');
 const seen=new Set();
 return records.map(row=>{
  if(!row.id||seen.has(row.id))throw Error('Movimento homologado sem ID ou repetido.');
  seen.add(row.id);
  if(!validDate(row.data_movimento)||!['entrada','saida'].includes(row.tipo)||
   row.estado!=='confirmado'||row.origem!=='fluxo_caixa_homologado')
   throw Error('Histórico homologado com data, natureza ou estado inválido.');
  return {id:'oficial:'+row.id,date:row.data_movimento,type:row.tipo,
   value:cents(row.valor),description:row.descricao||'Sem descrição',
   category:row.categoria||'Sem categoria',method:row.meio_pagamento||'Não informado',
   origin:'homologado',source:'Caixa homologado'};
 });
}
function pendingRows(records,cutoff){
 if(!Array.isArray(records))throw Error('Prévia de extratos indisponível.');
 if(records.length&&(!validDate(cutoff)))throw Error('Não existe fechamento válido para a prévia bancária.');
 const seen=new Set();
 return records.map((row,index)=>{
  if(!validDate(row.data_lancamento)||!['entrada','saida'].includes(row.natureza)||
   row.data_lancamento<cutoff)
   throw Error('Prévia contém data ou natureza incompatível com o fechamento.');
  const id=String(row.id||row.fingerprint||index);
  if(seen.has(id))throw Error('Prévia bancária contém movimentações repetidas.');
  seen.add(id);
  return {id:'previa:'+id,date:row.data_lancamento,type:row.natureza,value:cents(row.valor),
   description:row.descricao_personalizada||row.descricao||'Sem descrição',
   category:row.categoria_personalizada||row.categoria||'Extrato bancário',
   method:'Importação do extrato (prévia)',origin:'previa',
   source:row.arquivo_nome||'PDF Itaú'};
 });
}
function combine(official,pending){
 if(!Array.isArray(official)||!Array.isArray(pending))throw Error('Fontes mensais indisponíveis.');
 const ids=new Set();
 const rows=[...official,...pending];
 for(const row of rows){
  if(ids.has(row.id))throw Error('IDs duplicados na listagem mensal.');
  ids.add(row.id);
  if(!validDate(row.date)||!['entrada','saida'].includes(row.type)||
   !Number.isSafeInteger(row.value)||row.value<0||!['homologado','previa'].includes(row.origin))
   throw Error('Linha mensal sem dados seguros.');
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.origin.localeCompare(b.origin)||
  String(a.id).localeCompare(String(b.id)));
}
function months(rows){
 return [...new Set(rows.map(row=>row.date.slice(0,7)))].sort((a,b)=>b.localeCompare(a));
}
function selectRows(rows,criteria={}){
 const month=String(criteria.month||'');
 const type=String(criteria.type||'todos'),origin=String(criteria.origin||'todos');
 const search=fold(criteria.search||'');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mês selecionado inválido.');
 if(!['todos','entrada','saida'].includes(type)||!['todos','homologado','previa'].includes(origin))
  throw Error('Filtro de movimentações inválido.');
 return rows.filter(row=>row.date.slice(0,7)===month&&
  (type==='todos'||row.type===type)&&
  (origin==='todos'||row.origin===origin)&&
  (!search||fold([row.date,row.description,row.category,row.method,row.source,row.type].join(' ')).includes(search)));
}
function totals(rows){
 const result={officialIn:0,officialOut:0,pendingIn:0,pendingOut:0,officialCount:0,pendingCount:0};
 for(const row of rows){
  const preview=row.origin==='previa';
  result[preview?'pendingCount':'officialCount']++;
  const key=(preview?'pending':'official')+(row.type==='entrada'?'In':'Out');
  result[key]+=row.value;
 }
 return result;
}
const api=Object.freeze({fold,cents,validDate,officialRows,pendingRows,combine,months,selectRows,totals});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frItauMonthlyCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
