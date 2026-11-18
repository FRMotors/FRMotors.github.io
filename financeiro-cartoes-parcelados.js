/* FR Motors · parcelas históricas de cartões.
   Somente leitura da base homologada. Parcelas são lançamentos documentais,
   não pagamentos individuais de fatura e não criam saídas bancárias. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'');
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const cent=x=>Math.round(Number(x)*100);
const date=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Não informada';
const month=x=>x?date(x).slice(3):'Não informado';
const write=(id,value)=>{const el=$(id);if(el)el.textContent=value};
const limit=15;
let installments=[],invoices=[],declared=[],parts=[],full=[],busy=null,page=0;
async function allRows(query,max=6000){
 const out=[],size=450;
 for(let from=0;from<max;from+=size){
  const {data,error}=await query().range(from,from+size-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<size)return out;
 }
 throw Error('Consulta maior que o limite seguro; não exibimos totais incompletos.');
}
function invoiceStates(){
 const declaredSet=new Set(declared.map(x=>x.fatura_id));
 const partialMap=new Map(),externalMap=new Map();
 parts.forEach(x=>{
  partialMap.set(x.fatura_id,(partialMap.get(x.fatura_id)||0)+cent(x.valor_pago));
  if(x.origem==='externo')externalMap.set(x.fatura_id,(externalMap.get(x.fatura_id)||0)+cent(x.valor_pago));
 });
 const fullMap=new Map(full.filter(x=>x.fatura_id).map(x=>[x.fatura_id,cent(x.valor_conferido)]));
 const states=new Map();
 invoices.forEach(x=>{
  const declaredPaid=declaredSet.has(x.id);
  const paid=fullMap.get(x.id)??partialMap.get(x.id)??0;
  const total=cent(x.valor_documental);
  const key=cardName(x.cartao_nome)+'|'+String(x.mes_fatura||'');
  const status=declaredPaid?'declarada':paid>=total?'integral':paid>0?'parcial':'nao-conciliada';
  states.set(key,{status,paid,externalPaid:externalMap.get(x.id)||0,
   rest:declaredPaid?0:Math.max(0,total-paid),total});
 });
 return states;
}
function eligible(x){
 return x.incluir===true&&x.grupo==='cartoes'&&
  /^\d{1,2}\/\d{1,2}$/.test(String(x.parcela||''))&&
  !['PIX','DÉBITO','DEBITO'].includes(String(x.cartao_nome||'').trim().toLocaleUpperCase('pt-BR'));
}
function statusOf(row,states){
 return states.get(cardName(row.cartao_nome)+'|'+String(row.mes_fatura||''))||
  {status:'nao-conciliada',paid:0,rest:null,total:null};
}
function render(){
 const states=invoiceStates(),active=installments.filter(eligible);
 const card=$('pc-card')?.value||'todos',year=$('pc-year')?.value||'todos';
 const m=$('pc-month')?.value||'todos',situation=$('pc-status')?.value||'todos';
 const q=($('pc-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const list=active.filter(x=>{
  const status=statusOf(x,states).status,period=String(x.mes_fatura||'');
  if(card!=='todos'&&card!==cardName(x.cartao_nome))return false;
  if(year!=='todos'&&period.slice(0,4)!==year)return false;
  if(m!=='todos'&&m!==period.slice(0,7))return false;
  if(situation!=='todos'&&situation!==status)return false;
  return [x.descricao,x.cartao_nome,cardName(x.cartao_nome),x.parcela,x.mes_fatura,x.data_evento,
   x.codigo_origem,x.valor_registrado].join(' ').toLocaleLowerCase('pt-BR').includes(q);
 }).sort((a,b)=>String(b.mes_fatura||'').localeCompare(String(a.mes_fatura||''))||
    String(b.data_evento||'').localeCompare(String(a.data_evento||''))||
    Number(b.linha_excel||0)-Number(a.linha_excel||0));
 const total=list.reduce((sum,x)=>sum+cent(x.valor_registrado),0);
 write('pc-count',String(list.length));
 write('pc-total',money(total/100));
 write('pc-cards-count',String(new Set(list.map(x=>cardName(x.cartao_nome))).size));
 write('pc-declared-count',String(list.filter(x=>statusOf(x,states).status==='declarada').length));
 const pages=Math.max(1,Math.ceil(list.length/limit));
 page=Math.max(0,Math.min(page,pages-1));
 const current=list.slice(page*limit,(page+1)*limit);
 if($('pc-rows'))$('pc-rows').innerHTML=current.length?current.map(x=>{
  const st=statusOf(x,states);
  const desc=st.status==='declarada'?'Fatura quitada por confirmação (sem vínculo bancário)':
   st.status==='integral'&&st.externalPaid>0?
    'Fatura quitada com pagamento externo informado'+(st.paid>st.externalPaid?' e pagamento bancário':''):
   st.status==='integral'?'Fatura quitada por vínculo bancário':
   st.status==='parcial'&&st.externalPaid>0?'Fatura parcialmente paga, incluindo pagamento de outra conta informado':
   st.status==='parcial'?'Fatura parcialmente paga':
   'Fatura sem quitação registrada';
  return '<tr><td><strong>'+escapeHTML(x.descricao||'Lançamento sem descrição')+'</strong>'+
    '<small>'+escapeHTML(x.codigo_origem||'')+' · linha '+escapeHTML(x.linha_excel)+'</small></td>'+
   '<td>'+escapeHTML(cardName(x.cartao_nome))+'</td>'+        
   '<td><strong>'+escapeHTML(x.parcela)+'</strong></td>'+
   '<td>'+escapeHTML(month(x.mes_fatura))+'</td>'+
   '<td>'+escapeHTML(date(x.data_evento))+'</td>'+
   '<td class="money">'+money(x.valor_registrado)+'</td>'+
   '<td><small>'+escapeHTML(desc)+'</small></td></tr>';
 }).join(''):'<tr><td colspan="7" class="empty">Nenhuma parcela de cartão corresponde a esses filtros.</td></tr>';
 write('pc-pagination',list.length+' lançamento(s) · página '+(page+1)+' de '+pages);
 if($('pc-previous'))$('pc-previous').disabled=page===0;
 if($('pc-next'))$('pc-next').disabled=page===pages-1;
 write('pc-status-message','Exibindo '+list.length+' de '+active.length+' parcelas no período selecionado. Valor documental: '+money(total/100)+'. Não representa pagamento bancário.');
}
function rebuildFilters(){
 const base=installments.filter(eligible);
 const years=[...new Set(base.map(x=>String(x.mes_fatura||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 const y=$('pc-year'),prior=y?.value||'todos';
 if(y){
  y.replaceChildren(new Option('Todos os anos','todos'),...years.map(x=>new Option(x,x)));
  if(years.includes(prior))y.value=prior;
 }
 const selectedYear=y?.value||'todos';
 const cards=[...new Set(base.map(x=>cardName(x.cartao_nome)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const months=[...new Set(base.filter(x=>selectedYear==='todos'||String(x.mes_fatura||'').slice(0,4)===selectedYear)
  .map(x=>x.mes_fatura?.slice(0,7)).filter(Boolean))].sort().reverse();
 const c=$('pc-card'),m=$('pc-month'),cv=c?.value||'todos',mv=m?.value||'todos';
 if(c){
  c.replaceChildren(new Option('Todos os cartões','todos'),...cards.map(x=>new Option(x,x)));
  if(cards.includes(cv))c.value=cv;
 }
 if(m){
  m.replaceChildren(new Option('Todos os meses','todos'),
   ...months.map(x=>new Option(x.slice(5,7)+'/'+x.slice(0,4),x)));
  if(months.includes(mv))m.value=mv;
 }
}
async function refresh(){
 if(busy)return busy;
 busy=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
   write('pc-status-message','Carregando parcelas da planilha homologada...');
   const {data:authorized,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||authorized!==true)throw Error('Acesso financeiro não autorizado.');
   const [docs,inv,dec,pay,whole]=await Promise.all([
    allRows(()=>db.from('fin_documentos_despesas')
     .select('id,grupo,incluir,cartao_nome,mes_fatura,parcela,descricao,data_evento,codigo_origem,linha_excel,valor_registrado')
     .eq('grupo','cartoes').eq('incluir',true)
     .order('linha_excel',{ascending:true})),
    allRows(()=>db.from('fin_faturas_historicas')
     .select('id,cartao_nome,mes_fatura,valor_documental').order('mes_fatura',{ascending:false})),
    allRows(()=>db.from('fin_faturas_quitacoes_declaradas')
     .select('fatura_id').order('registrado_em',{ascending:false})),
    allRows(()=>db.from('fin_faturas_pagamentos_parciais')
     .select('fatura_id,origem,valor_pago').order('confirmado_em',{ascending:false})),
    allRows(()=>db.from('fin_comprovacoes_documentais')
     .select('fatura_id,valor_conferido').not('fatura_id','is',null)
     .order('conferido_em',{ascending:false}))
   ]);
   installments=docs;invoices=inv;declared=dec;parts=pay;full=whole;
   rebuildFilters();render();
  }catch(err){
   write('pc-status-message','Não foi possível carregar as parcelas: '+(err.message||err));
   if($('pc-rows'))$('pc-rows').innerHTML='<tr><td colspan="7" class="empty">Erro ao carregar parcelas dos cartões.</td></tr>';
  }
 })();
 try{await busy}finally{busy=null}
}
function setup(){
 if(!$('pc-rows'))return;
 $('pc-year')?.addEventListener('change',()=>{rebuildFilters();page=0;render()});
 ['pc-search','pc-card','pc-month','pc-status'].forEach(id=>{
  $(id)?.addEventListener(id==='pc-search'?'input':'change',()=>{page=0;render()});
 });
 $('pc-previous')?.addEventListener('click',()=>{page--;render()});
 $('pc-next')?.addEventListener('click',()=>{page++;render()});
 $('pc-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(!document.querySelector('[data-view-panel="cardbills"]')?.hidden)refresh().catch(()=>{});
}
window.frCardInstallmentsUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();