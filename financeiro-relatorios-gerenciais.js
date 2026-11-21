/* FR Motors | Relatórios gerenciais | 2026-11-18
 * Três visões estritamente independentes:
 * (1) caixa realizado (fin_movimentos confirmado, origem homologada)
 * (2) compras documentais de autopeças (fin_documentos_despesas, incluir=true)
 * (3) faturas documentais (fin_faturas_historicas).
 * NÃO somar (1)+(2)+(3): isso duplicaria compras/faturas já pagas.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'Cartão não informado');
const docCore=window.frDocumentsStatusCore;
const marginCore=window.frProfitMarginCore;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(v)||0)/100);
const cents=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100):0};
const dateBR=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const put=(id,txt)=>{const n=$(id);if(n)n.textContent=txt};
const keyOf=date=>String(date||'').slice(0,7);
const asYear=date=>Number(String(date||'').slice(0,4))||0;
const localYear=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date());
 return Number(p);
};
let moves=[],parts=[],bills=[],suppliersById=new Map(),loaded=false,loading=null,year=localYear(),month='todos',cashPage=0;
const rowPage=25;
async function loadAll(builder,max=20000){
 const collected=[],size=400;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await builder().range(offset,offset+size-1);
  if(error)throw error;
  collected.push(...(data||[]));
  if(!data||data.length<size)return collected;
 }
 throw Error('Fonte excedeu o limite de dados; relatório parcial não é exibido.');
}
function scoped(data,dateField,yr=year,m=month){
 return data.filter(row=>{
  const date=String(row[dateField]||'');
  return asYear(date)===yr&&(m==='todos'||date.slice(5,7)===m);
 });
}
function total(rows,field){
 return rows.reduce((sum,r)=>sum+cents(r[field]),0);
}
function cashTotals(rows){
 const inRows=rows.filter(x=>x.tipo==='entrada'),outRows=rows.filter(x=>x.tipo==='saida');
 return {incoming:total(inRows,'valor'),outgoing:total(outRows,'valor'),entries:inRows.length,exits:outRows.length,net:total(inRows,'valor')-total(outRows,'valor')};
}
function aggregate(rows,labelFn,valueField){
 const map=new Map();
 for(const r of rows){
  const label=String(labelFn(r)||'Sem identificação').trim()||'Sem identificação';
  const old=map.get(label)||{label,value:0,count:0};
  old.value+=cents(r[valueField]);old.count++;map.set(label,old);
 }
 return [...map.values()].sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'pt-BR'));
}
function monthIndex(arr,field,yr,which,moneyField){
 const result=Array.from({length:12},()=>({sum:0,count:0}));
 for(const r of arr){
  if(asYear(r[field])!==yr||(which&&r.tipo!==which))continue;
  const idx=Number(String(r[field]).slice(5,7))-1;
  if(idx<0||idx>11)continue;
  result[idx].sum+=cents(r[moneyField]);result[idx].count++;
 }
 return result;
}
function renderSummary(){
 const cash=scoped(moves,'data_movimento');
 const pur=scoped(parts,'data_evento');
 const inv=scoped(bills,'mes_fatura');
 const t=cashTotals(cash);
 put('rg-income',brl(t.incoming));put('rg-expense',brl(t.outgoing));
 put('rg-net',brl(t.net));
 const margin=marginCore?.calculate(t.incoming,t.outgoing);
 put('rg-margin',margin?.available?marginCore.format(margin.percent):'—');
 put('rg-margin-info',margin?.available?
  '* Estimativa pelo caixa confirmado (resultado ÷ entradas). Não é lucro contábil.':
  '* Sem entradas confirmadas neste período. Margem indisponível.');
 $('rg-margin')?.classList.toggle('rg-negative',Boolean(margin?.available&&margin.percent<0));
 put('rg-auto',brl(total(pur,'valor_registrado')));
 put('rg-invoices',brl(total(inv,'valor_documental')));
 const nocat=cash.filter(r=>r.tipo==='saida'&&!String(r.categoria||'').trim());
 put('rg-uncat',String(nocat.length));
 put('rg-uncat-value',brl(total(nocat,'valor')));
 put('rg-income-count',t.entries+' entrada(s) confirmada(s)');
 put('rg-expense-count',t.exits+' saída(s) confirmada(s)');
 put('rg-auto-count',pur.length+' documento(s) incluído(s)');
 put('rg-invoices-count',inv.length+' fatura(s) registrada(s)');
 $('rg-net')?.classList.toggle('rg-negative',t.net<0);
 const previous=scoped(moves,'data_movimento',year-1,'todos'),thisYear=scoped(moves,'data_movimento',year,'todos');
 const tp=cashTotals(previous),tc=cashTotals(thisYear);
 put('rg-annual-title','Comparativo anual de '+year+' com '+(year-1));
 put('rg-year-cash',brl(tc.outgoing));
 put('rg-year-prior',previous.length?brl(tp.outgoing):'Sem caixa homologado');
 let statement='';
 if(previous.length){
  if(!tp.outgoing){statement='O ano anterior não tem saídas registradas para calcular variação percentual.';}
  else{
   const diff=(tc.outgoing-tp.outgoing)/tp.outgoing*100;
   statement=(diff>0?'+':'')+diff.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+
    '% nas saídas confirmadas, comparando anos completos da base.';
  }
 }else statement='O caixa homologado não possui movimentações em '+(year-1)+'. Veja abaixo os documentos de autopeças e faturas desse ano, disponíveis separadamente.';
 put('rg-year-change',statement);
 const docs=docCore?.annualDocuments(parts,bills,year);
 if(docs){
  put('rg-doc-year-current',String(year));put('rg-doc-year-prev',String(year-1));
  put('rg-auto-current',docs.parts.currentCount?brl(docs.parts.current):'Sem documentos');
  put('rg-auto-prev',docs.parts.priorCount?brl(docs.parts.prior):'Sem documentos');
  put('rg-card-current',docs.bills.currentCount?brl(docs.bills.current):'Sem faturas');
  put('rg-card-prev',docs.bills.priorCount?brl(docs.bills.prior):'Sem faturas');
  const variation=(current,prior,n)=>!n?'Sem base documental anterior':!prior?'Base anterior com valor zero':
   ((current-prior)/prior*100).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%';
  put('rg-auto-annual-diff','Variação: '+variation(docs.parts.current,docs.parts.prior,docs.parts.priorCount));
  put('rg-card-annual-diff','Variação: '+variation(docs.bills.current,docs.bills.prior,docs.bills.priorCount));
  put('rg-doc-note','Autopeças: documentos incluídos por data de evento. Cartões: faturas por competência. São fontes documentais distintas, não pagamentos comprovados e não devem ser somadas entre si ou ao caixa.');
 }
 put('rg-selected-period',month==='todos'?'Ano '+year:months[Number(month)-1]+' de '+year);
}
function drawBarRows(id,rows,empty){
 const root=$(id);if(!root)return;
 if(!rows.length){root.innerHTML='<div class="rg-empty">'+esc(empty)+'</div>';return}
 const max=Math.max(1,...rows.map(r=>Math.max(r.value,0)));
 root.innerHTML=rows.slice(0,12).map((r,index)=>{
  const pct=Math.round(Math.max(0,r.value)/max*100);
  return '<div class="rg-rank-row">'+
   '<div class="rg-rank-top"><span><b>'+String(index+1).padStart(2,'0')+'</b> '+esc(r.label)+'</span>'+
   '<strong>'+brl(r.value)+'</strong></div>'+
   '<div class="rg-rank-track"><span style="width:'+pct+'%"></span></div>'+
   '<small>'+r.count+' registro(s)</small></div>';
 }).join('');
}
function renderRankings(){
 const cash=scoped(moves,'data_movimento').filter(r=>r.tipo==='saida');
 const auto=scoped(parts,'data_evento');
 const cards=scoped(bills,'mes_fatura');
 const categories=aggregate(cash,r=>r.categoria||'Sem categoria','valor');
 const providers=aggregate(auto,r=>r.fornecedor_nome||'Fornecedor não informado','valor_registrado');
  const paidBySupplier=aggregate(cash,r=>suppliersById.get(r.fornecedor_id)||'Não identificado','valor');
 const credit=aggregate(cards,r=>cardName(r.cartao_nome),'valor_documental');
 drawBarRows('rg-categories',categories,'Nenhuma saída confirmada nesta seleção.');
 drawBarRows('rg-suppliers',providers,'Nenhuma compra documental de autopeças nesta seleção.');
  drawBarRows('rg-paid-suppliers',paidBySupplier,'Nenhuma saída confirmada nesta seleção.');
 drawBarRows('rg-cards',credit,'Nenhuma fatura documental nesta seleção.');
 put('rg-category-count',categories.length+' categoria(s) · caixa pago');
 put('rg-supplier-count',providers.length+' fornecedor(es) · autopeças documentais');
  put('rg-paid-supplier-count',paidBySupplier.length+' grupo(s) · saídas de caixa realmente pagas');
 put('rg-card-count',credit.length+' cartão(ões) · total de faturas');
}
function renderMonthly(){
 const cashIn=monthIndex(moves,'data_movimento',year,'entrada','valor');
 const cashOut=monthIndex(moves,'data_movimento',year,'saida','valor');
 const prevOut=monthIndex(moves,'data_movimento',year-1,'saida','valor');
 const auto=monthIndex(parts,'data_evento',year,null,'valor_registrado');
 const invoice=monthIndex(bills,'mes_fatura',year,null,'valor_documental');
 const max=Math.max(1,...cashIn.map(x=>x.sum),...cashOut.map(x=>x.sum));
 const root=$('rg-months');
 if(!root)return;
 root.innerHTML=months.map((label,i)=>{
  const selected=month!=='todos'&&Number(month)===i+1;
  const a=cashIn[i].sum,b=cashOut[i].sum;
  const pctIn=Math.round(a/max*100),pctOut=Math.round(b/max*100);
  return '<tr'+(selected?' class="rg-month-highlight"':'')+'><th scope="row">'+esc(label)+'</th>'+
   '<td class="money">'+brl(a)+'</td><td class="money">'+brl(b)+'</td>'+
   '<td class="money '+(a-b<0?'rg-negative':'')+'">'+brl(a-b)+'</td>'+
   '<td><div class="rg-inline-tracks">'+
   '<span class="rg-month-track"><i class="rg-month-in" style="width:'+pctIn+'%"></i></span>'+
   '<span class="rg-month-track"><i class="rg-month-out" style="width:'+pctOut+'%"></i></span>'+
   '</div></td>'+
   '<td class="money">'+brl(auto[i].sum)+'</td>'+
   '<td class="money">'+brl(invoice[i].sum)+'</td>'+
   '<td class="money">'+(prevOut[i].count?brl(prevOut[i].sum):'—')+'</td></tr>';
 }).join('');
 const currentYearCash=moves.filter(x=>asYear(x.data_movimento)===year).length;
 const priorYearCash=moves.filter(x=>asYear(x.data_movimento)===year-1).length;
 put('rg-months-note',
  'Movimentações confirmadas: '+currentYearCash+' em '+year+'; '+
  (priorYearCash?priorYearCash+' em '+(year-1):'sem caixa homologado em '+(year-1))+
  '. Valores documentais de cartões e autopeças não entram no caixa realizado.');
}
function renderDetail(){
 const cash=scoped(moves,'data_movimento').slice()
  .sort((a,b)=>String(b.data_movimento).localeCompare(String(a.data_movimento))||String(b.id).localeCompare(String(a.id)));
 const pages=Math.max(1,Math.ceil(cash.length/rowPage));
 cashPage=Math.max(0,Math.min(cashPage,pages-1));
 const page=cash.slice(cashPage*rowPage,(cashPage+1)*rowPage);
 const root=$('rg-cash-rows');
 if(root)root.innerHTML=page.length?page.map(r=>
  '<tr><td>'+esc(dateBR(r.data_movimento))+'</td>'+
  '<td>'+esc(r.descricao||'Sem descrição')+'</td>'+
  '<td>'+esc(r.categoria||'Sem categoria')+'</td>'+
  '<td><span class="rg-type rg-'+(r.tipo==='entrada'?'in':'out')+'">'+(r.tipo==='entrada'?'Entrada':'Saída')+'</span></td>'+
  '<td class="money">'+brl(cents(r.valor))+'</td></tr>'
 ).join(''):'<tr><td colspan="5" class="rg-empty">Nenhuma movimentação confirmada neste período.</td></tr>';
 put('rg-cash-pagination',cash.length+' registro(s) · página '+(cashPage+1)+' de '+pages);
 if($('rg-prev'))$('rg-prev').disabled=cashPage===0;
 if($('rg-next'))$('rg-next').disabled=cashPage>=pages-1;
}
function render(){
 if(!loaded)return;
 renderSummary();renderRankings();renderMonthly();renderDetail();
 const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date());
 put('rg-status','Atualizado às '+time+'. Relatórios somente leitura; fontes documentais não somadas ao caixa.');
}
function loadYears(){
 const available=new Set([localYear()]);
 moves.forEach(x=>available.add(asYear(x.data_movimento)));
 parts.forEach(x=>available.add(asYear(x.data_evento)));
 bills.forEach(x=>available.add(asYear(x.mes_fatura)));
 const sorted=[...available].filter(x=>x>=2000&&x<=2100).sort((a,b)=>b-a);
 const control=$('rg-year');if(!control)return;
 control.replaceChildren(...sorted.map(y=>new Option(String(y),String(y))));
 if(!sorted.includes(year))year=sorted[0]||localYear();
 control.value=String(year);
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('A conexão financeira não está disponível.');
  put('rg-status','Consultando caixa confirmado, compras e faturas documentais...');
  const {data:access,error:accessError}=await db.rpc('fluxo_caixa_autorizado');
  if(accessError||access!==true)throw Error('Acesso financeiro não autorizado.');
  const [bank,auto,invoices,providers]=await Promise.all([
   loadAll(()=>db.from('fin_movimentos').select('id,data_movimento,tipo,descricao,categoria,fornecedor_id,valor,estado,origem')
    .eq('estado','confirmado').eq('origem','fluxo_caixa_homologado').order('id')),
   loadAll(()=>db.from('fin_documentos_despesas')
    .select('id,grupo,incluir,data_evento,fornecedor_nome,descricao,valor_registrado')
    .eq('grupo','autopecas').eq('incluir',true).order('id')),
   loadAll(()=>db.from('fin_faturas_historicas')
    .select('id,cartao_nome,mes_fatura,valor_documental').order('id')),
   loadAll(()=>db.from('fin_fornecedores').select('id,nome').order('id'))
  ]);
  moves=bank;parts=auto;bills=invoices;suppliersById=new Map(providers.map(x=>[x.id,x.nome]));loaded=true;loadYears();render();
 })().catch(e=>{
   loaded=false;
   const root=$('rg-months');if(root)root.innerHTML='<tr><td colspan="8" class="rg-empty">Não foi possível consultar a base.</td></tr>';
   ['rg-income','rg-expense','rg-net','rg-margin','rg-auto','rg-invoices','rg-uncat','rg-year-cash','rg-year-prior'].forEach(id=>put(id,'—'));
   ['rg-categories','rg-suppliers','rg-paid-suppliers','rg-cards'].forEach(id=>{if($(id))$(id).textContent='Dados indisponíveis';});
   if($('rg-cash-rows'))$('rg-cash-rows').textContent='Dados indisponíveis';
   put('rg-status','Falha ao carregar relatórios: '+(e.message||e));
 }).finally(()=>{loading=null});
 return loading;
}
function safeField(v){
 const str=String(v??'');
 const guarded=/^\s*[=+\-@]/.test(str)?"'"+str:str;
 return '"'+guarded.replace(/"/g,'""')+'"';
}
function csvDownload(type){
 if(!loaded)return;
 let headers=[],data=[],name='relatorio';
 const asNumber=x=>(cents(x)/100).toFixed(2).replace('.',',');
 if(type==='caixa'){
  headers=['Data','Tipo','Descrição','Categoria','Fornecedor vinculado','Valor (R$)','Situação','Fonte'];
  data=scoped(moves,'data_movimento').map(r=>[dateBR(r.data_movimento),r.tipo,r.descricao,r.categoria||'Sem categoria',suppliersById.get(r.fornecedor_id)||'Não identificado',asNumber(r.valor),'Confirmado','Movimento de caixa']);
  name='caixa_confirmado';
 }else if(type==='autopecas'){
  headers=['Data documental','Fornecedor','Descrição','Valor documental (R$)','Incluir','Fonte'];
  data=scoped(parts,'data_evento').map(r=>[dateBR(r.data_evento),r.fornecedor_nome,r.descricao,asNumber(r.valor_registrado),'Sim','Autopeças (não somar ao caixa)']);
  name='autopecas_documentais';
 }else if(type==='cartoes'){
  headers=['Competência','Cartão consolidado','Nome original do cartão','Valor da fatura (R$)','Fonte'];
  data=scoped(bills,'mes_fatura').map(r=>[dateBR(r.mes_fatura),cardName(r.cartao_nome),r.cartao_nome,asNumber(r.valor_documental),'Fatura documental (não somar ao caixa)']);
  name='faturas_documentais';
 }else return;
 const content='\ufeff'+[headers,...data].map(row=>row.map(safeField).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download='FR_Motors_'+name+'_'+year+(month==='todos'?'':'_'+month)+'.csv';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 if(!$('rg-months'))return;
 $('rg-year')?.addEventListener('change',e=>{year=Number(e.target.value);cashPage=0;render()});
 $('rg-month')?.addEventListener('change',e=>{month=e.target.value;cashPage=0;render()});
 $('rg-refresh')?.addEventListener('click',()=>refresh());
 $('rg-prev')?.addEventListener('click',()=>{cashPage=Math.max(0,cashPage-1);renderDetail()});
 $('rg-next')?.addEventListener('click',()=>{cashPage++;renderDetail()});
 document.querySelectorAll('[data-rg-export]').forEach(x=>x.addEventListener('click',()=>csvDownload(x.dataset.rgExport)));
 $('rg-print')?.addEventListener('click',()=>{if(loaded)window.print()});
 if(!document.querySelector('[data-view-panel="reports"]')?.hidden)refresh();
}
window.frManagerReportsUI={refresh,__test:{cashTotals,aggregate,monthIndex,scoped,asYear,cents}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();