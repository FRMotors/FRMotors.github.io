/* FR Motors · Histórico homologado: Itaú isolado das outras fontes. Somente SELECT. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const count=n=>new Intl.NumberFormat('pt-BR').format(Number(n)||0);
const num=n=>Number(n)||0;
const sum=(rows,k)=>rows.reduce((a,r)=>a+Math.round(num(r[k])*100),0)/100;
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const monthBR=v=>v?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(String(v).slice(0,7)+'-01T12:00:00Z')).replace('.',''):'Sem data';
const state={lote:null,monthly:[],cards:[],parts:[],open:[],categories:[],banks:[]};
let loading=null,ready=false,activeTab='cards',transactionSerial=0,initialized=false;
function status(id,message,error=false){
 const el=$(id);if(!el)return;el.textContent=message;el.className='status'+(error?' bad':' ok');
}
function metric(label,value,note,kind=''){
 return '<article class="hist-kpi"><span class="hist-kpi-label">'+safe(label)+'</span>'+
 '<strong class="hist-kpi-value '+safe(kind)+'">'+safe(value)+'</strong>'+
 '<span class="hist-kpi-caption">'+safe(note)+'</span></article>';
}
function renderError(message){
 status('hist-itau-status',message,true);
 status('hist-other-status',message,true);
}
async function query(table,cols,lote){
 const {data,error}=await db.from(table).select(cols).eq('lote_id',lote);
 if(error)throw Error(table+': '+error.message);
 return data||[];
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   status('hist-itau-status','Consultando o histórico homologado...');
   status('hist-other-status','Consultando as fontes financeiras...');
   if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
   const {data:lote,error}=await db.from('fin_teste_excel_lotes')
    .select('id,arquivo_nome,esperado_linhas,status,concluido_em')
    .eq('status','conferido').order('concluido_em',{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;
   if(!lote)throw Error('Nenhum arquivo Financeiro Unificado homologado. Importe e confira a planilha na aba Importações.');
   const [monthly,cards,parts,open,categories,banks]=await Promise.all([
    query('fin_teste_excel_itau_mensal','mes,entradas_operacionais,saldo_abertura,saidas,entradas_qtd,saidas_qtd,resultado_operacional,saldo_teorico_acumulado',lote.id),
    query('fin_teste_excel_cartoes_resumo','fonte,modalidade,qtd,total_historico,total_incluido,total_excluido,qtd_excluida,sem_data',lote.id),
    query('fin_teste_excel_fornecedores_resumo','fornecedor,qtd,valor_cheio,valor_incluido,valor_excluido,qtd_excluida,previsto_incluido,pago_real,qtd_paga,qtd_confirmar',lote.id),
    query('fin_teste_excel_abertos_mensal','mes,qtd,total',lote.id),
    query('fin_teste_excel_itau_categorias','grupo,categoria,qtd,total',lote.id),
    query('fin_teste_excel_pix_debito_itau','linha_excel,descricao,data_evento,mes_referencia,valor,meio_pagamento,situacao_analise',lote.id)
   ]);
   Object.assign(state,{lote,
    monthly:monthly.sort((a,b)=>a.mes.localeCompare(b.mes)),
    cards:cards.sort((a,b)=>num(b.total_incluido)-num(a.total_incluido)),
    parts:parts.sort((a,b)=>num(b.valor_incluido)-num(a.valor_incluido)),
    open:open.sort((a,b)=>(a.mes||'9999').localeCompare(b.mes||'9999')),
    categories:categories.sort((a,b)=>num(b.total)-num(a.total)),
    banks});
   ready=true;
   renderItau();renderOther();
   status('hist-itau-status','Histórico do Itaú atualizado. Fonte: '+lote.arquivo_nome+'.');
   status('hist-other-status','Fontes homologadas atualizadas. Nenhum lançamento operacional foi modificado.');
  }catch(e){ready=false;renderError('Não foi possível carregar a visualização: '+e.message);throw e}
  finally{loading=null}
 })();
 return loading;
}
function open(view){
 if(!ready){refresh().catch(()=>{});return}
 if(view==='itau')renderItau();
 else renderOther();
}
function period(){
 const months=state.monthly;
 const a=$('hist-itau-from'),b=$('hist-itau-to');
 if(!months.length)return [];
 const min=months[0].mes.slice(0,7),max=months[months.length-1].mes.slice(0,7);
 if(!a.value)a.value=min;
 if(!b.value)b.value=max;
 a.min=b.min=min;a.max=b.max=max;
 if(a.value>b.value){status('hist-itau-status','O mês inicial deve ser anterior ou igual ao mês final.',true);return null}
 return months.filter(r=>r.mes.slice(0,7)>=a.value&&r.mes.slice(0,7)<=b.value);
}
function renderItau(){
 if(!ready)return;
 const selected=period();
 if(selected===null)return;
 const start=$('hist-itau-from').value,end=$('hist-itau-to').value;
 const income=sum(selected,'entradas_operacionais');
 const expenses=sum(selected,'saidas');
 const opening=sum(selected,'saldo_abertura');
 const result=income-expenses;
 const last=selected.length?num(selected[selected.length-1].saldo_teorico_acumulado):0;
 $('hist-itau-period-note').textContent=selected.length?
  selected.length+' mês(es) · saldo acumulado até o fim do período (não confirmado pelo banco)':
  'Nenhum movimento registrado nesse intervalo.';
 $('hist-itau-kpis').innerHTML=
 metric('Entradas operacionais',money(income),count(selected.reduce((s,r)=>s+num(r.entradas_qtd),0))+' lançamentos · sem saldo inicial','positive')+
 metric('Saídas efetivas',money(expenses),count(selected.reduce((s,r)=>s+num(r.saidas_qtd),0))+' pagamentos registrados no Itaú')+
 metric('Resultado operacional',money(result),'Entradas operacionais menos saídas; não é lucro contábil',result<0?'negative':'positive')+
 metric('Saldo acumulado calculado',money(last),'Saldo histórico estimado até '+(selected.length?monthBR(selected[selected.length-1].mes):'o período')+(opening?' · saldo inicial no recorte: '+money(opening):''),last<0?'negative':'positive');
 drawChart(selected);
 const categories=state.categories.filter(r=>r.grupo==='saidas_fluxo');
 const max=Math.max(1,...categories.map(r=>num(r.total)));
 $('hist-itau-categories').innerHTML=categories.slice(0,8).map(r=>
  '<div class="hist-category-item"><div class="hist-category-top"><span>'+safe(r.categoria)+'</span><strong>'+money(r.total)+
  '</strong></div><div class="hist-category-track"><div class="hist-category-fill" style="width:'+Math.max(1,Math.min(100,num(r.total)/max*100))+'%"></div></div>'+
  '<span class="hist-category-hint">'+count(r.qtd)+' lançamento(s) · total do histórico completo</span></div>'
 ).join('')||'<p class="hist-empty">Nenhuma categoria identificada.</p>';
 $('hist-itau-monthly').innerHTML=selected.length?selected.map(r=>{
  const result=num(r.resultado_operacional),saldo=num(r.saldo_teorico_acumulado);
  return '<tr><td><strong>'+safe(monthBR(r.mes))+'</strong>'+
   (num(r.saldo_abertura)?'<small class="hist-subline">Saldo inicial: '+money(r.saldo_abertura)+'</small>':'')+'</td>'+
   '<td class="money hist-money-positive">'+money(r.entradas_operacionais)+'</td>'+
   '<td class="money">'+money(r.saidas)+'</td><td class="money '+(result<0?'hist-money-negative':'hist-money-positive')+'">'+
   money(result)+'</td><td class="money '+(saldo<0?'hist-money-negative':'hist-money-positive')+'">'+money(saldo)+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="hist-empty">Nenhum mês no intervalo selecionado.</td></tr>';
 fetchTransactions(start,end).catch(e=>status('hist-itau-status','O resumo está disponível, mas os lançamentos não puderam ser carregados: '+e.message,true));
}
function drawChart(rows){
 const root=$('hist-itau-chart');if(!root)return;
 if(!rows.length){root.innerHTML='<p class="hist-empty">Sem valores para os meses selecionados.</p>';return}
 const maximum=Math.max(1,...rows.flatMap(r=>[num(r.entradas_operacionais),num(r.saidas)]));
 const pct=v=>Math.max(0,Math.min(100,num(v)/maximum*100));
 root.innerHTML='<div class="hist-chart-plot">'+rows.map(r=>{
  const label=monthBR(r.mes),a=pct(r.entradas_operacionais),b=pct(r.saidas);
  return '<div class="hist-chart-month"><div class="hist-chart-bars">'+
   '<div class="hist-bar" style="height:'+a+'%" title="'+safe(label+' · Entradas '+money(r.entradas_operacionais))+'"></div>'+
   '<div class="hist-bar out" style="height:'+b+'%" title="'+safe(label+' · Saídas '+money(r.saidas))+'"></div>'+
   '</div><div class="hist-chart-label">'+safe(label.split(' ')[0])+'</div></div>';
 }).join('')+'</div>';
}
function lastDay(ym){
 const [y,m]=ym.split('-').map(Number);
 return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}
async function fetchTransactions(from,to){
 const tbody=$('hist-itau-transactions');
 if(!tbody||!state.lote||!from||!to)return;
 const request=++transactionSerial;
 tbody.innerHTML='<tr><td colspan="5" class="hist-empty">Carregando lançamentos...</td></tr>';
 const fetch=async grupo=>{
  const {data,error}=await db.from('fin_teste_excel_linhas')
   .select('grupo,data_evento,descricao,valor,dados')
   .eq('lote_id',state.lote.id).eq('grupo',grupo)
   .gte('data_evento',from+'-01').lte('data_evento',lastDay(to))
   .order('data_evento',{ascending:false}).limit(40);
  if(error)throw error;return data||[];
 };
 const fetchExtra=async()=>{
  const {data,error}=await db.from('fin_teste_excel_recebimentos_complementares')
   .select('data_recebimento,descricao,cliente,categoria,conta,valor,linha_origem,aba_origem')
   .eq('lote_id',state.lote.id)
   .gte('data_recebimento',from+'-01').lte('data_recebimento',lastDay(to))
   .order('data_recebimento',{ascending:false}).limit(40);
  if(error)throw error;
  return (data||[]).map(item=>({
   grupo:'entradas_fluxo',data_evento:item.data_recebimento,
   descricao:item.descricao,valor:item.valor,
   fonte:'Contas a Receber',linha_origem:item.linha_origem,
   dados:{categoria:item.categoria||'VENDAS',meio:'Boleto recebido · Itaú',saldo_inicial:false},
   cliente:item.cliente
  }));
 };
 const [received,paid,supplement]=await Promise.all([
  fetch('entradas_fluxo'),fetch('saidas_fluxo'),fetchExtra()
 ]);
 if(request!==transactionSerial)return;
 const records=[...received,...paid,...supplement]
  .sort((a,b)=>b.data_evento.localeCompare(a.data_evento)).slice(0,40);
 tbody.innerHTML=records.length?records.map(r=>{
  const isIn=r.grupo==='entradas_fluxo',isOpening=Boolean(r.dados?.saldo_inicial);
  const origin=r.fonte==='Contas a Receber'
   ?'<small class="hist-subline">Contas a Receber · linha '+safe(r.linha_origem)+
    ' · '+safe(r.cliente||'')+'</small>':'';
  return '<tr><td>'+dateBR(r.data_evento)+'</td>'+
   '<td><strong>'+safe(r.descricao)+'</strong>'+origin+'</td>'+
   '<td><span class="hist-kind '+(isIn?'in':'out')+'">'+
    (isOpening?'Saldo de abertura':isIn?'Entrada':'Saída')+'</span></td>'+
   '<td>'+safe(r.dados?.categoria||'Sem categoria')+
   '<small class="hist-subline">'+safe(r.dados?.meio||'Meio não indicado')+'</small></td>'+
   '<td class="money '+(isIn?'hist-money-positive':'hist-money-negative')+'">'+
   (isIn?'+ ':'− ')+money(r.valor)+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="hist-empty">Nenhuma movimentação neste período.</td></tr>';
}
function renderOther(){
 if(!ready)return;
 renderCards();renderParts();renderBanks();renderOpen();
 selectTab(activeTab);
}
function renderCards(){
 const credits=state.cards.filter(x=>x.modalidade==='cartao_credito');
 const cash=state.cards.filter(x=>x.modalidade==='pagamento_avista');
 $('hist-cards-kpis').innerHTML=
 metric('Compras de crédito incluídas',money(sum(credits,'total_incluido')),
  count(credits.reduce((s,r)=>s+num(r.qtd),0))+' registros de cartão · não são saídas do caixa')+
 metric('Pagamentos à vista',money(sum(cash,'total_incluido')),'PIX e Débito, contabilizados separadamente')+
 metric('Valor marcado NÃO incluir',money(sum(state.cards,'total_excluido')),
  count(state.cards.reduce((s,r)=>s+num(r.qtd_excluida),0))+' registros preservados fora dos indicadores elegíveis')+
 metric('Datas ausentes',count(state.cards.reduce((s,r)=>s+num(r.sem_data),0)),
  'Valores preservados; datas não foram inventadas');
 $('hist-cards-rows').innerHTML=state.cards.length?state.cards.map(r=>
  '<tr><td><strong>'+safe(r.fonte)+'</strong>'+
   '<small class="hist-subline">'+(r.modalidade==='pagamento_avista'?'Pagamento à vista':'Crédito')+'</small></td>'+
  '<td class="money">'+count(r.qtd)+'</td><td class="money">'+money(r.total_incluido)+'</td>'+
  '<td class="money">'+money(r.total_excluido)+'</td><td>'+
  (num(r.sem_data)?count(r.sem_data)+' sem data exata':'Datas preservadas')+
  (num(r.qtd_excluida)?'<small class="hist-subline">'+count(r.qtd_excluida)+' excluídos dos indicadores</small>':'')+
  '</td></tr>').join(''):'<tr><td colspan="5" class="hist-empty">Nenhum cartão importado.</td></tr>';
}
function renderParts(){
 const r=state.parts;
 $('hist-parts-kpis').innerHTML=
 metric('Compras incluídas',money(sum(r,'valor_incluido')),'Valor cheio dos registros marcados SIM')+
 metric('Não incluir',money(sum(r,'valor_excluido')),
 count(r.reduce((s,x)=>s+num(x.qtd_excluida),0))+' registros excluídos dos indicadores')+
 metric('Pagamentos identificados',money(sum(r,'pago_real')),
 count(r.reduce((s,x)=>s+num(x.qtd_paga),0))+' baixas existentes no Fluxo, sem duplicação')+
 metric('Registros a confirmar',count(r.reduce((s,x)=>s+num(x.qtd_confirmar),0)),
 'Status herdado do Excel; não significa que todos estão em aberto');
 $('hist-parts-rows').innerHTML=r.length?r.map(x=>
  '<tr><td><strong>'+safe(x.fornecedor)+'</strong></td>'+
  '<td class="money">'+count(x.qtd)+'</td>'+
  '<td class="money">'+money(x.valor_incluido)+'</td>'+
  '<td class="money">'+money(x.valor_excluido)+'</td>'+
  '<td class="money">'+money(x.pago_real)+'<small class="hist-subline">'+count(x.qtd_paga)+' pago(s) identificado(s)</small></td></tr>'
 ).join(''):'<tr><td colspan="5" class="hist-empty">Nenhuma compra de autopeças.</td></tr>';
}
function renderBanks(){
 const all=state.banks;
 const others=all.filter(x=>x.situacao_analise==='outro_banco');
 const earlier=all.filter(x=>x.situacao_analise==='fora_recorte');
 const undated=all.filter(x=>x.situacao_analise==='sem_data_exata');
 const itau=all.filter(x=>x.situacao_analise==='conciliado_itau');
 $('hist-banks-kpis').innerHTML=
 metric('Outros bancos desde junho',money(sum(others,'valor')),count(others.length)+' pagamentos classificados pelo usuário')+
 metric('Antes de junho',money(sum(earlier,'valor')),count(earlier.length)+' registros fora do fluxo Itaú')+
 metric('Sem data exata',money(sum(undated,'valor')),count(undated.length)+' registros sem banco atribuído')+
 metric('Já conciliado no Itaú',money(sum(itau,'valor')),count(itau.length)+' saídas já presentes no caixa; não adicionar');
 const show=[...others,...earlier,...undated].sort((a,b)=>{
  if(!a.data_evento)return 1;if(!b.data_evento)return -1;
  return b.data_evento.localeCompare(a.data_evento);
 });
 $('hist-banks-rows').innerHTML=show.length?show.map(r=>{
  const label=r.situacao_analise==='outro_banco'?'Outro banco':
   r.situacao_analise==='fora_recorte'?'Outro período / banco':'Pendente sem data';
  return '<tr><td>'+dateBR(r.data_evento)+'</td><td><strong>'+safe(r.descricao)+'</strong>'+
  '<small class="hist-subline">Excel · linha '+count(r.linha_excel)+'</small></td>'+
  '<td>'+safe(r.meio_pagamento)+'</td><td><span class="hist-kind">'+safe(label)+'</span></td>'+
  '<td class="money">'+money(r.valor)+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="hist-empty">Sem pagamentos de outras fontes.</td></tr>';
}
function renderOpen(){
 const data=state.open;
 const noDate=data.filter(r=>!r.mes);
 $('hist-open-kpis').innerHTML=
 metric('Contas em aberto',money(sum(data,'total')),
  count(data.reduce((s,r)=>s+num(r.qtd),0))+' compromissos importados do Excel')+
 metric('Sem vencimento exato',money(sum(noDate,'total')),
  count(noDate.reduce((s,r)=>s+num(r.qtd),0))+' pendentes de identificação')+
 metric('Com data',money(sum(data.filter(r=>r.mes),'total')),
  'Somatório dos meses identificados')+
 metric('Meses com compromissos',count(data.filter(r=>r.mes).length),
  'Agrupados por mês de vencimento');
 $('hist-open-rows').innerHTML=data.length?data.map(r=>
  '<tr><td><strong>'+safe(monthBR(r.mes))+'</strong></td>'+
  '<td class="money">'+count(r.qtd)+'</td>'+
  '<td class="money">'+money(r.total)+'</td></tr>'
 ).join(''):'<tr><td colspan="3" class="hist-empty">Sem contas em aberto no histórico.</td></tr>';
}
function selectTab(next){
 if(!['cards','parts','banks','open'].includes(next))return;
 activeTab=next;
 document.querySelectorAll('[data-hist-pane]').forEach(n=>{n.hidden=n.dataset.histPane!==next});
 document.querySelectorAll('[data-hist-tab]').forEach(n=>{
  const on=n.dataset.histTab===next;
  n.classList.toggle('active',on);
  n.setAttribute('aria-selected',String(on));
 });
}
function exportCsv(){
 if(!ready)return;
 const rows=period();if(!rows?.length)return;
 const fields=['Mes','Entradas operacionais','Saidas','Resultado operacional','Saldo de abertura','Saldo teorico acumulado'];
 const lines=rows.map(r=>[r.mes.slice(0,7),num(r.entradas_operacionais),num(r.saidas),
   num(r.resultado_operacional),num(r.saldo_abertura),num(r.saldo_teorico_acumulado)]);
 const csv='\uFEFF'+[fields,...lines].map(row=>row.map(cell=>'"'+String(cell).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='FR_Motors_Itau_Historico_'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function initialize(){
 if(initialized||!$('hist-itau-kpis'))return;
 initialized=true;
 $('hist-itau-from').addEventListener('change',renderItau);
 $('hist-itau-to').addEventListener('change',renderItau);
 $('hist-itau-reload').addEventListener('click',()=>refresh().catch(()=>{}));
 $('hist-other-reload').addEventListener('click',()=>refresh().catch(()=>{}));
 $('hist-itau-export').addEventListener('click',exportCsv);
 document.querySelectorAll('[data-hist-tab]').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.histTab)));
}
window.frHistoryUI={open,refresh,selectTab};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
else initialize();
})();