/* Leitor específico de faturas Sicoobcard com tabelas em duas colunas.
   Não envia PDFs ao servidor; apenas linhas selecionadas pelo usuário. */
(function(){
'use strict';
const months={JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const cents=s=>{
 const cleaned=String(s||'').replace(/\u00a0/g,'').replace(/\s+/g,'').replace(/R\$/gi,'').replace(/[\u2212\u2013]/g,'-');
 if(!/^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(cleaned)&&!/^[+-]?\d+,\d{2}$/.test(cleaned))return null;
 const number=Number(cleaned.replace(/\./g,'').replace(',','.'));
 const value=Math.round(number*100);
 return Number.isSafeInteger(value)?value:null;
};
function groupByLine(items,minX,maxX){
 const groups=[];
 const sorted=items.filter(i=>i.x>=minX&&i.x<maxX).sort((a,b)=>a.y-b.y||a.x-b.x);
 for(const item of sorted){
  let row=groups[groups.length-1];
  if(!row||Math.abs(item.y-row.y)>2.4){row={y:item.y,items:[]};groups.push(row)}
  row.items.push(item);
 }
 for(const row of groups)row.items.sort((a,b)=>a.x-b.x);
 return groups;
}
const join=items=>items.map(i=>i.text).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
const moneyFrom=(row,start)=>cents(join(row.items.filter(i=>i.x>=start)));
function transactionDate(label,year,dueMonth){
 const m=norm(label).match(/^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/);
 if(!m)return null;
 const month=months[m[2]],day=Number(m[1]);
 const adjustedYear=month>dueMonth?year-1:year;
 const date=new Date(Date.UTC(adjustedYear,month-1,day));
 if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return date.toISOString().slice(0,10);
}
function readPurchases(rows,side,from,to,year,dueMonth){
 const dateEnd=side==='left'?59:339;
 const descStart=side==='left'?61:341;
 const amountStart=side==='left'?229:505;
 const result=[];
 for(const row of rows){
  if(row.y<=from||row.y>=to)continue;
  const date=transactionDate(join(row.items.filter(i=>i.x<dateEnd)),year,dueMonth);
  if(!date)continue;
  const val=moneyFrom(row,amountStart);
  if(val===null||val<=0)continue;
  const desc=join(row.items.filter(i=>i.x>=descStart&&i.x<amountStart)).slice(0,380);
  if(!desc)continue;
  result.push({date,desc,amount:val,group:'compras',y:row.y,side});
 }
 return result;
}
function readAccountMovements(leftRows,allItems,from,to,year,dueMonth){
 const out=[];
 for(const row of leftRows){
  if(row.y<=from||row.y>=to)continue;
  const date=transactionDate(join(row.items.filter(i=>i.x<59)),year,dueMonth);
  if(!date)continue;
  const val=moneyFrom(row,229);
  if(val===null||val===0)continue;
  // Algumas descrições Sicoob têm duas linhas com pequenas diferenças de altura.
  const descItems=allItems.filter(i=>i.x>=61&&i.x<225&&Math.abs(i.y-row.y)<=7.5)
    .sort((a,b)=>a.y-b.y||a.x-b.x);
  const desc=join(descItems).slice(0,380);
  if(!desc)continue;
  out.push({date,desc,amount:val,group:val>0?'encargos':'pagamentos',y:row.y,side:'left'});
 }
 return out;
}
function cellValue(row,label){
 return row?moneyFrom(row,label):null;
}
function getHeaderY(rows,match,minY=-Infinity){
 const found=rows.filter(r=>r.y>minY&&match(join(r.items)));
 return found.length?found[found.length-1].y:null;
}
function parseTablePage(rawItems,width,height,year,dueMonth){
 const s=width/595;
 const items=rawItems.map(i=>({
  x:(Number(i.transform?.[4])||0)/s,
  y:(height-(Number(i.transform?.[5])||0))/s,
  text:String(i.str||'').trim()
 })).filter(i=>i.text);
 const left=groupByLine(items,0,289),right=groupByLine(items,289,595);
 const leftStart=getHeaderY(left,r=>/^DATA\b/.test(norm(r))&&norm(r).includes('DESCR'));
 const rightStart=getHeaderY(right,r=>/^DATA\b/.test(norm(r))&&norm(r).includes('DESCR'));
 const accountStart=getHeaderY(left,r=>norm(r).includes('MOVIMENTACOES DA CONTA'));
 const rightTotalRow=right.find(r=>/^TOTAL DE\b/.test(norm(join(r.items))));
 const rightTotal=right.find(r=>/^TOTAL\b/.test(norm(join(r.items)))&&!/^TOTAL DE\b/.test(norm(join(r.items))));
 if(leftStart===null||rightStart===null||!rightTotalRow||!rightTotal)
  throw Error('Não foi possível identificar todas as tabelas do Sicoob. Nenhum lançamento foi importado.');
 const purchases=[
  ...readPurchases(left,'left',leftStart+4,Infinity,year,dueMonth),
  ...readPurchases(right,'right',rightStart+4,rightTotalRow.y-3,year,dueMonth)
 ];
 const account=accountStart===null?[]:readAccountMovements(left,items,accountStart+6,leftStart-4,year,dueMonth);
 const subtotal=moneyFrom(rightTotalRow,505),total=moneyFrom(rightTotal,505);
 const balanceRow=left.find(r=>norm(join(r.items)).includes('SALDO ANTERIOR'));
 const balance=balanceRow?moneyFrom(balanceRow,229):null;
 const purchaseSum=purchases.reduce((s,r)=>s+r.amount,0);
 const feeSum=account.filter(r=>r.amount>0).reduce((s,r)=>s+r.amount,0);
 const payments=account.filter(r=>r.amount<0).reduce((s,r)=>s+r.amount,0);
 if(!purchases.length||subtotal===null||purchaseSum!==subtotal){
  throw Error('Conferência Sicoob divergente: compras extraídas R$ '+(purchaseSum/100).toFixed(2)+
   ', subtotal da fatura R$ '+(subtotal===null?'indisponível':(subtotal/100).toFixed(2))+
   '. Não importe até revisar o PDF.');
 }
 if(total!==null&&balance!==null&&balance+purchaseSum+feeSum+payments!==total){
  throw Error('A composição da fatura Sicoob não confere com o valor total. Nenhum lançamento foi importado.');
 }
 return {purchases,account,subtotal,purchaseSum,feeSum,payments,balance,total};
}
async function parse(pdf,kind){
 let found=null,invoiceText='',invoiceYear=null,dueMonth=12;
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p),content=await page.getTextContent();
  const text=norm(content.items.map(i=>i.str).join(' '));
  if(p<=3)invoiceText+=' '+text;
  if(text.includes('LANCAMENTOS')&&text.includes('SICOOB')&&text.includes('VISA PLATINUM')){
   found={page,items:content.items};
  }
 }
 if(!found)return null;
 if(kind!=='cartao')throw Error('Este PDF é uma fatura Sicoob Visa Platinum. Selecione Fatura de cartão, não Extrato bancário.');
 const due=invoiceText.match(/\b(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(20\d{2})\b/);
 if(due){dueMonth=months[due[2]];invoiceYear=Number(due[3]);}
 else{
  const years=[...invoiceText.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
  invoiceYear=years.length?years[0]:new Date().getFullYear();
 }
 const pageHeight=found.page.getViewport({scale:1}).height;
 const width=found.page.getViewport({scale:1}).width;
 const result=parseTablePage(found.items,width,pageHeight,invoiceYear,dueMonth);
 // 'PAGAMENTO-BOLETO' e débito automático de fatura anterior reduzem o saldo
 // da conta do cartão. Não são estornos de compras nem novas despesas.
 const rows=[['Data','Descrição','Valor']],meta=[];
 for(const r of result.purchases){
  rows.push([r.date,r.desc,(r.amount/100).toFixed(2).replace('.',',')]);
  meta.push({sicoobGroup:'compras',defaultInclude:true});
 }
 for(const r of result.account.filter(x=>x.amount>0)){
  rows.push([r.date,'ENCARGO DA FATURA · '+r.desc,(r.amount/100).toFixed(2).replace('.',',')]);
  meta.push({sicoobGroup:'encargos',defaultInclude:true});
 }
 return {
  rows,meta,special:true,
  year:invoiceYear,
  sicoob:{
   compras:result.purchases.length,comprasCentavos:result.purchaseSum,
   encargos:result.account.filter(x=>x.amount>0).length,
   encargosCentavos:result.feeSum,
   pagamentosAnterioresCentavos:result.payments,
   saldoAnteriorCentavos:result.balance,
   totalFaturaCentavos:result.total,
   subtotalValidado:true
  }
 };
}
window.frSicoobParser={parse};
})();