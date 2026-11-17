/* FR Motors | Documentos históricos de autopeças e cartões.
 * Somente leitura. Valores documentais nunca geram movimentos de caixa.
 * A inclusão (SIM/NÃO) e a classificação de pagamento vêm da planilha homologada. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const cents=v=>Math.round(Number(v)*100);
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const write=(id,text)=>{const node=$(id);if(node)node.textContent=text};
const groupName=g=>g==='autopecas'?'Autopeças':'Cartões / outros meios';
const monthOf=r=>(r.grupo==='cartoes'?r.mes_fatura:r.vencimento)?.slice(0,7)||'sem-mes';
const inYear=r=>{const y=$('doc-year')?.value||'todos';return y==='todos'||monthOf(r).slice(0,4)===y;};
let documents=[],page=0,monthPage=0,loading=null;
const PAGE_SIZE=35;
const MONTH_PAGE_SIZE=12;
const fields='id,grupo,codigo_origem,linha_excel,data_evento,vencimento,data_compra,mes_fatura,descricao,fornecedor_nome,cartao_nome,parcela,meio,valor_registrado,valor_cheio_documento,valor_com_desconto_informado,valor_pago_informado,data_pagamento_informada,situacao_origem,incluir,revisao_origem';
async function fetchAll(){
 const all=[],size=500;
 for(let from=0;from<10000;from+=size){
  const {data,error}=await db.from('fin_documentos_despesas')
   .select(fields).order('grupo',{ascending:true}).order('linha_excel',{ascending:true})
   .range(from,from+size-1);
  if(error)throw error;
  all.push(...(data||[]));
  if(!data||data.length<size)return all;
 }
 throw Error('Limite de 10.000 documentos excedido. A consulta foi interrompida para evitar totais incompletos.');
}
function filters(){
 const group=$('doc-type')?.value||'todos';
 const include=$('doc-include')?.value||'incluidos';
 const month=$('doc-month')?.value||'todos';
 const search=($('doc-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 return documents.filter(r=>{
  if(!inYear(r))return false;
  if(group!=='todos'&&r.grupo!==group)return false;
  if(include==='incluidos'&&!r.incluir)return false;
  if(include==='excluidos'&&r.incluir)return false;
  if(month!=='todos'&&monthOf(r)!==month)return false;
  return [r.codigo_origem,r.descricao,r.fornecedor_nome,r.cartao_nome,r.parcela,r.situacao_origem,
   r.vencimento,r.mes_fatura,r.meio].join(' ').toLocaleLowerCase('pt-BR').includes(search);
 });
}
function summaryRows(rows,keySelector){
 const groups=new Map();
 rows.forEach(r=>{
  const key=keySelector(r)||'Não informado';
  let group=groups.get(key);
  if(!group){
   group={name:key,count:0,total:0,full:0,fullCount:0,discountQuote:0,discountCount:0,
    paid:0,paidCount:0,credits:0};
   groups.set(key,group);
  }
  group.count++;
  group.total+=cents(r.valor_registrado);
  if(r.valor_registrado<0)group.credits++;
  if(r.valor_cheio_documento!==null){group.full+=cents(r.valor_cheio_documento);group.fullCount++}
  if(r.valor_com_desconto_informado!==null){group.discountQuote+=cents(r.valor_com_desconto_informado);group.discountCount++}
  if(r.valor_pago_informado!==null){group.paid+=cents(r.valor_pago_informado);group.paidCount++}
 });
 return [...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
}
function drawSummary(){
 const chosenMonth=$('doc-month')?.value||'todos';
 const inPeriod=r=>inYear(r)&&(chosenMonth==='todos'||monthOf(r)===chosenMonth);
 const included=documents.filter(r=>r.incluir&&inPeriod(r));
 const auto=included.filter(r=>r.grupo==='autopecas');
 const cards=included.filter(r=>r.grupo==='cartoes');
 const ignored=documents.filter(r=>!r.incluir&&inPeriod(r));
 write('doc-auto-count',String(auto.length));
 write('doc-auto-total',brl(auto.reduce((sum,r)=>sum+cents(r.valor_registrado),0)/100));
 write('doc-card-count',String(cards.length));
 write('doc-card-total',brl(cards.reduce((sum,r)=>sum+cents(r.valor_registrado),0)/100));
 write('doc-ignored-count',String(ignored.length));
 write('doc-paid-origin',String(auto.filter(r=>r.situacao_origem==='Pago').length));
 write('doc-credits-count',String(cards.filter(r=>r.valor_registrado<0).length));
 const suppliers=summaryRows(auto,r=>r.fornecedor_nome||r.descricao);
 const supplierBody=$('doc-supplier-rows');
 if(supplierBody)supplierBody.innerHTML=suppliers.length?suppliers.map(r=>
  '<tr><td>'+escapeHTML(r.name)+'</td><td class="money">'+r.count+'</td>'+
  '<td class="money">'+brl(r.full/100)+'</td>'+
  '<td class="money">'+(r.discountCount?brl(r.discountQuote/100)+' <small>'+r.discountCount+' informados</small>':'—')+'</td>'+
  '<td class="money">'+(r.paidCount?brl(r.paid/100)+' <small>'+r.paidCount+' informados</small>':'—')+'</td></tr>'
 ).join(''):'<tr><td colspan="5" class="empty">Sem fornecedores na carteira incluída.</td></tr>';
 const summaries=summaryRows(cards,r=>r.cartao_nome);
 const cardBody=$('doc-card-rows');
 if(cardBody)cardBody.innerHTML=summaries.length?summaries.map(r=>
  '<tr><td>'+escapeHTML(r.name)+'</td><td class="money">'+r.count+'</td>'+
  '<td class="money">'+brl(r.total/100)+'</td>'+
  '<td class="money">'+r.credits+'</td></tr>'
 ).join(''):'<tr><td colspan="4" class="empty">Sem lançamentos de cartões incluídos.</td></tr>';
 const byMonth=new Map();
 included.forEach(r=>{
  const key=monthOf(r);
  let value=byMonth.get(key);
  if(!value){value={auto:0,autoCount:0,card:0,cardCount:0};byMonth.set(key,value)}
  if(r.grupo==='autopecas'){value.auto+=cents(r.valor_registrado);value.autoCount++}
  else{value.card+=cents(r.valor_registrado);value.cardCount++}
 });
 const currentMonth=$('doc-month')?.value||'todos';
 const months=[...byMonth].filter(([key])=>currentMonth==='todos'||currentMonth===key)
  .sort(([a],[b])=>(b==='sem-mes'?'0000-00':b).localeCompare(a==='sem-mes'?'0000-00':a));
 const monthPages=Math.max(1,Math.ceil(months.length/MONTH_PAGE_SIZE));
 monthPage=Math.min(Math.max(monthPage,0),monthPages-1);
 const visibleMonths=months.slice(monthPage*MONTH_PAGE_SIZE,(monthPage+1)*MONTH_PAGE_SIZE);
 const monthly=$('doc-month-rows');
 if(monthly)monthly.innerHTML=visibleMonths.length?visibleMonths.map(([m,v])=>
  '<tr><td>'+escapeHTML(m==='sem-mes'?'Sem mês':m.slice(5,7)+'/'+m.slice(0,4))+'</td>'+
  '<td class="money">'+brl(v.auto/100)+' <small>'+v.autoCount+' registros</small></td>'+
  '<td class="money">'+brl(v.card/100)+' <small>'+v.cardCount+' registros</small></td></tr>'
 ).join(''):'<tr><td colspan="3" class="empty">Nenhum mês corresponde ao filtro.</td></tr>';
 write('doc-month-paging',months.length+' mês(es) · página '+(monthPage+1)+' de '+monthPages);
 if($('doc-month-prev'))$('doc-month-prev').disabled=monthPage===0;
 if($('doc-month-next'))$('doc-month-next').disabled=monthPage>=monthPages-1;
}
function draw(){
 const list=filters(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
 page=Math.min(Math.max(page,0),pages-1);
 const slice=list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 const body=$('doc-rows');
 if(body)body.innerHTML=slice.length?slice.map(r=>{
  const card=r.grupo==='cartoes';
  const mainDate=card?r.data_evento:r.vencimento;
  const referenceDate=card?r.mes_fatura:r.vencimento;
  const payment=r.situacao_origem==='Pago'?
   '<span class="state paid">Pago na planilha</span>':
   '<span class="state open">'+escapeHTML(r.situacao_origem||'A confirmar')+'</span>';
  const inclusion=r.incluir?'<span class="state open">Incluir</span>':'<span class="state">Não incluir</span>';
  const more=r.parcela?' <small>Parcela '+escapeHTML(r.parcela)+'</small>':'';
  return '<tr>'+
   '<td><strong>'+escapeHTML(r.codigo_origem)+'</strong> <small>linha '+escapeHTML(r.linha_excel)+'</small></td>'+
   '<td>'+escapeHTML(groupName(r.grupo))+'</td>'+
   '<td>'+escapeHTML(r.fornecedor_nome||r.descricao||'Não informado')+
   '<small>'+escapeHTML(r.descricao||'')+'</small>'+more+'</td>'+
   '<td>'+escapeHTML(r.cartao_nome||(card?'Não informado':r.meio||'Boleto'))+'</td>'+
   '<td>'+escapeHTML(dateBR(mainDate))+'<small>'+escapeHTML(card?'Mês fatura: ':'Vencimento: ')+escapeHTML(dateBR(referenceDate))+'</small></td>'+
   '<td class="money">'+brl(r.valor_registrado)+'</td>'+
   '<td class="money">'+(r.valor_cheio_documento===null?'—':brl(r.valor_cheio_documento))+'</td>'+
   '<td class="money">'+(r.valor_com_desconto_informado===null?'—':brl(r.valor_com_desconto_informado))+'</td>'+
   '<td class="money">'+(r.valor_pago_informado===null?'—':brl(r.valor_pago_informado)+
     '<small>'+escapeHTML(dateBR(r.data_pagamento_informada))+'</small>')+'</td>'+
   '<td>'+payment+'<small>'+inclusion+'</small></td></tr>';
 }).join(''):'<tr><td colspan="10" class="empty">Nenhum documento corresponde aos filtros.</td></tr>';
 const sum=list.reduce((v,r)=>v+cents(r.valor_registrado),0);
 write('doc-found',list.length+' de '+documents.length+' documentos · página '+(page+1)+' de '+pages);
 write('doc-selected-total',brl(sum/100)+' (total documental filtrado, não caixa)');
 if($('doc-prev'))$('doc-prev').disabled=page===0;
 if($('doc-next'))$('doc-next').disabled=page>=pages-1;
 drawSummary();
}
function updateYears(){
 const sel=$('doc-year');if(!sel)return;
 const prior=sel.value||'todos';
 const years=[...new Set(documents.map(monthOf).filter(m=>/^\d{4}-\d{2}$/.test(m)).map(m=>m.slice(0,4)))].sort().reverse();
 sel.replaceChildren(new Option('Todos os anos','todos'),...years.map(y=>new Option(y,y)));
 if(years.includes(prior))sel.value=prior;
}
function updateMonths(){
 const sel=$('doc-month');if(!sel)return;
 const value=sel.value||'todos';
 const months=[...new Set(documents.filter(inYear).map(monthOf))]
  .sort((a,b)=>(b==='sem-mes'?'0000-00':b).localeCompare(a==='sem-mes'?'0000-00':a));
 sel.replaceChildren(new Option('Todos os meses','todos'),
   ...months.map(m=>new Option(m==='sem-mes'?'Sem mês':m.slice(5,7)+'/'+m.slice(0,4),m)));
 if(months.includes(value))sel.value=value;
}
function csvQuoted(s){
 let value=String(s??'');
 // Texto de origem não deve executar fórmulas quando o CSV for aberto em planilhas.
 if(/^[\s\x00-\x1f]*[=+@]/.test(value)||
   (/^[\s\x00-\x1f]*-/.test(value)&&!/^\s*-\d+(?:[,.]\d+)?\s*$/.test(value))){
  value="'"+value;
 }
 return '"'+value.replace(/"/g,'""')+'"';
}
function exportCsv(){
 const rows=filters();
 const cols=[['Origem','Código','Linha Excel','Incluir','Descrição','Fornecedor','Cartão','Parcela','Data evento','Vencimento','Mês fatura',
 'Valor registrado','Valor cheio documento','Valor com desconto informado','Valor pago informado','Data pagamento informada','Situação na planilha']];
 for(const r of rows)cols.push([
  r.grupo,r.codigo_origem,r.linha_excel,r.incluir?'SIM':'NÃO',r.descricao,r.fornecedor_nome||'',r.cartao_nome||'',r.parcela||'',
  r.data_evento||'',r.vencimento||'',r.mes_fatura||'',
  Number(r.valor_registrado).toFixed(2).replace('.',','),
  r.valor_cheio_documento===null?'':Number(r.valor_cheio_documento).toFixed(2).replace('.',','),
  r.valor_com_desconto_informado===null?'':Number(r.valor_com_desconto_informado).toFixed(2).replace('.',','),
  r.valor_pago_informado===null?'':Number(r.valor_pago_informado).toFixed(2).replace('.',','),
  r.data_pagamento_informada||'',r.situacao_origem||''
 ]);
 const csv='\ufeff'+cols.map(row=>row.map(csvQuoted).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='FR_Motors_Autopecas_Cartoes_Historico_Filtrado.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
 write('doc-status','Exportação CSV gerada com '+rows.length+' documentos filtrados. Nenhum lançamento financeiro foi criado.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  write('doc-status','Consultando autopeças e cartões homologados...');
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão indisponível.');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   const rows=await fetchAll();
   documents=rows.sort((a,b)=>{
    const m1=monthOf(a)==='sem-mes'?'0000-00':monthOf(a);
    const m2=monthOf(b)==='sem-mes'?'0000-00':monthOf(b);
    return m2.localeCompare(m1)||
      String(b.data_evento||b.vencimento||'').localeCompare(String(a.data_evento||a.vencimento||''))||
      b.linha_excel-a.linha_excel;
   });
   updateYears();updateMonths();draw();
   const included=documents.filter(r=>r.incluir).length,ignored=documents.length-included;
   write('doc-status','Histórico conferido: '+documents.length+' documentos, '+included+
    ' incluídos e '+ignored+' excluídos. Todos preservados sem criar movimentos no caixa.');
  }catch(e){
   write('doc-status','Falha ao carregar documentos históricos: '+(e.message||e));
   if($('doc-rows'))$('doc-rows').innerHTML='<tr><td colspan="10" class="empty">Não foi possível consultar os documentos.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null;}
}
function setup(){
 if(!$('doc-rows'))return;
 $('doc-year')?.addEventListener('change',()=>{updateMonths();page=0;monthPage=0;draw()});
 for(const id of ['doc-type','doc-include','doc-month'])
  $(id)?.addEventListener('change',()=>{page=0;if(id==='doc-month')monthPage=0;draw()});
 $('doc-search')?.addEventListener('input',()=>{page=0;draw()});
 $('doc-prev')?.addEventListener('click',()=>{page--;draw()});
 $('doc-next')?.addEventListener('click',()=>{page++;draw()});
 $('doc-month-prev')?.addEventListener('click',()=>{monthPage--;drawSummary()});
 $('doc-month-next')?.addEventListener('click',()=>{monthPage++;drawSummary()});
 $('doc-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 $('doc-export')?.addEventListener('click',exportCsv);
}
window.frDocumentsUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
