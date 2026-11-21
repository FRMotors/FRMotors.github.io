/* FR Motors | Indicadores financeiros por O.S. da BASE do Dashboard.
 * Fonte: indicadores_oficina. Somente leitura, sem vínculo automático ao caixa.
 * O campo liquido já considera gastos/descontos lançados na O.S.; NÃO subtraí-lo de novo.
 * Margem de contribuição por O.S. NÃO é lucro contábil líquido da oficina.
 */
(function(root){
'use strict';
const months=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const percent=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function num(v){
 const value=v===null||v===undefined||v===''?0:Number(v);
 if(!Number.isFinite(value))throw Error('A base de O.S. contém valores monetários inválidos.');
 return value;
}
function years(rows){
 if(!Array.isArray(rows))return [];
 return [...new Set(rows.filter(x=>String(x.cliente||'').trim())
   .map(x=>Number(x.ano)).filter(x=>Number.isInteger(x)&&x>=2000&&x<=2100))]
  .sort((a,b)=>b-a);
}
function companies(rows,year='todos'){
 if(!Array.isArray(rows))return [];
 return [...new Set(rows.filter(x=>String(x.cliente||'').trim()&&
    (year==='todos'||String(x.ano)===String(year)))
   .map(x=>norm(x.empresa)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function summarize(rows,{year='todos',month='todos',company='TODAS'}={}){
 if(!Array.isArray(rows))throw Error('Dados das O.S. indisponíveis.');
 const chosenMonth=month==='todos'?'todos':norm(month);
 const chosenCompany=company==='TODAS'?'TODAS':norm(company);
 const filtered=rows.filter(r=>String(r.cliente||'').trim()&&
  (year==='todos'||String(r.ano)===String(year))&&
  (chosenMonth==='todos'||norm(r.mes)===chosenMonth)&&
  (chosenCompany==='TODAS'||norm(r.empresa)===chosenCompany));
 let bruto=0,gasto=0,liquido=0,maoObra=0;
 for(const r of filtered){
  bruto+=num(r.bruto);gasto+=num(r.gasto);
  liquido+=num(r.liquido);maoObra+=num(r.mao_obra);
 }
 const available=filtered.length>0&&bruto>0;
 return {count:filtered.length,bruto:round(bruto),gasto:round(gasto),
  liquido:round(liquido),maoObra:round(maoObra),
  margin:available?liquido/bruto*100:null,available};
}
const api=Object.freeze({months,norm,years,companies,summarize,
 formatMoney:value=>money.format(value),formatPercent:value=>value===null||!Number.isFinite(value)?'—':percent.format(value)+'%'});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frOrdersProfitCore=api;
})(typeof window!=='undefined'?window:null);
