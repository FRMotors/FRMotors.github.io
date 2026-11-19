/* FR Motors · Conciliação documental em modo de consulta.
   97 referências verificadas, 5 pendências, 48 faturas documentais e
   6 validações PIX/Débito do lote homologado atual. Nunca lança caixa. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const h=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const date=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const set=(id,value)=>{if($(id))$(id).textContent=value;};
const autoPageSize=18;
const invoicePageSize=10;
let documents=[],autoRefs=[],pixRefs=[],faturas=[],declaredFaturas=new Set(),movements=new Map();
let autoPage=0,faturaPage=0,loading=null,selectedInvoice=null,detailVersion=0;
async function fetchAll(builder,max=6000){
 const result=[],size=450;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await builder().range(offset,offset+size-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<size)return result;
 }
 throw Error('Limite de consulta atingido; totais não foram apresentados para evitar dados incompletos.');
}
const paidAuto=()=>documents.filter(x=>x.grupo==='autopecas'&&x.incluir&&x.situacao_origem==='Pago');
const referenceByDoc=()=>new Map(autoRefs.map(x=>[x.documento_id,x]));
function statusBadge(ok){return ok?
 '<span class="state paid">Localizado no Fluxo</span>':
 '<span class="state open">Revisar correspondência</span>';}
function autoFiltered(){
 const q=($('dc-auto-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const filter=$('dc-auto-filter')?.value||'todos',linked=referenceByDoc();
 return paidAuto().filter(d=>{
  const has=linked.has(d.id);
  if(filter==='localizados'&&!has)return false;
  if(filter==='pendentes'&&has)return false;
  return [d.fornecedor_nome,d.codigo_origem,d.descricao,d.vencimento,d.valor_pago_informado]
   .join(' ').toLocaleLowerCase('pt-BR').includes(q);
 }).sort((a,b)=>(b.vencimento||'').localeCompare(a.vencimento||'')||
  String(a.fornecedor_nome||'').localeCompare(String(b.fornecedor_nome||''),'pt-BR'));
}
function renderAuto(){
 const refs=referenceByDoc(),rows=autoFiltered(),totalPages=Math.max(1,Math.ceil(rows.length/autoPageSize));
 autoPage=Math.min(Math.max(0,autoPage),totalPages-1);
 const current=rows.slice(autoPage*autoPageSize,(autoPage+1)*autoPageSize);
 if($('dc-auto-rows'))$('dc-auto-rows').innerHTML=current.length?current.map(d=>{
  const r=refs.get(d.id),m=r&&movements.get(r.movimento_id);
  return '<tr><td><strong>'+h(d.codigo_origem)+'</strong>'+
     '<small>linha '+h(d.linha_excel)+'</small></td>'+
   '<td><strong>'+h(d.fornecedor_nome||d.descricao)+'</strong>'+
     (d.descricao&&d.descricao!==d.fornecedor_nome?'<small>'+h(d.descricao)+'</small>':'')+'</td>'+
   '<td>'+h(date(d.vencimento))+'</td>'+
   '<td class="money">'+brl(d.valor_pago_informado)+'</td>'+
   '<td>'+statusBadge(Boolean(r&&m))+
     (m?'<small>Saída: '+h(date(m.data_movimento))+' · '+brl(m.valor)+
      ' · '+h(m.referencia_origem||'Fluxo')+'</small>':
      '<small>Pagamento indicado na planilha, sem vínculo único no Fluxo</small>')+'</td>'+
   '<td>'+(r?'<small>Diferença '+r.diferenca_dias+' dia(s)</small>':'—')+'</td>'+
    '<td>'+(r?'<span class="state paid">Conferida</span>':
    '<button type="button" class="btn" data-dc-review-auto="'+h(d.id)+'">Revisar / localizar pagamento</button>')+'</td></tr>';
 }).join(''):'<tr><td colspan="7" class="empty">Nenhuma compra corresponde ao filtro.</td></tr>';
 set('dc-auto-paging',rows.length+' compra(s) · página '+(autoPage+1)+' de '+totalPages);
 if($('dc-auto-prev'))$('dc-auto-prev').disabled=autoPage===0;
 if($('dc-auto-next'))$('dc-auto-next').disabled=autoPage>=totalPages-1;
}
function invoiceFiltered(){
 const q=($('dc-fatura-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const year=$('dc-fatura-year')?.value||'todos',card=$('dc-fatura-card')?.value||'todos';
 return faturas.filter(x=>(year==='todos'||String(x.mes_fatura||'').slice(0,4)===year)&&
  (card==='todos'||x.cartao_nome===card)).filter(x=>[x.cartao_nome,date(x.mes_fatura),x.mes_fatura,
  x.valor_documental,x.quantidade_lancamentos].join(' ').toLocaleLowerCase('pt-BR').includes(q))
  .sort((a,b)=>b.mes_fatura.localeCompare(a.mes_fatura)||a.cartao_nome.localeCompare(b.cartao_nome,'pt-BR'));
}
function rebuildInvoiceFilters(){
 const y=$('dc-fatura-year'),c=$('dc-fatura-card');
 const years=[...new Set(faturas.map(x=>String(x.mes_fatura||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 const prevYear=y?.value||'todos';
 if(y){y.replaceChildren(new Option('Todos os anos','todos'),...years.map(x=>new Option(x,x)));if(years.includes(prevYear))y.value=prevYear;}
 const year=y?.value||'todos',prevCard=c?.value||'todos';
 const cards=[...new Set(faturas.filter(x=>year==='todos'||String(x.mes_fatura||'').startsWith(year)).map(x=>x.cartao_nome))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(c){c.replaceChildren(new Option('Todos os cartões','todos'),...cards.map(x=>new Option(x,x)));if(cards.includes(prevCard))c.value=prevCard;}
}
function renderFaturas(){
 const list=invoiceFiltered(),pages=Math.max(1,Math.ceil(list.length/invoicePageSize));
 const total=list.reduce((s,x)=>s+Math.round(Number(x.valor_documental)*100),0);
 set('dc-fatura-period-summary',list.length+' fatura(s) no filtro · total documental '+brl(total/100)+'. Valores de faturas, não pagamentos comprovados.');
 faturaPage=Math.min(Math.max(faturaPage,0),pages-1);
 const current=list.slice(faturaPage*invoicePageSize,(faturaPage+1)*invoicePageSize);
 if($('dc-fatura-rows'))$('dc-fatura-rows').innerHTML=current.length?current.map(f=>
  '<tr><td><strong>'+h(f.cartao_nome)+'</strong></td>'+
   '<td>'+h(date(f.mes_fatura).slice(3))+'</td>'+
   '<td class="money">'+f.quantidade_lancamentos+'</td>'+
   '<td class="money">'+brl(f.valor_positivo)+'</td>'+
   '<td class="money">'+brl(f.valor_ajustes)+
    (f.ajustes_negativos?'<small>'+f.ajustes_negativos+' ajustes negativos</small>':'')+'</td>'+
   '<td class="money"><strong>'+brl(f.valor_documental)+'</strong>'+
   (declaredFaturas.has(f.id)?'<small>Quitada por confirmação, sem conciliação</small>':'<small>Pagamento não confirmado nesta base</small>')+'</td>'+
   '<td><button type="button" class="btn" data-dc-invoice="'+h(f.id)+'">Ver lançamentos</button></td></tr>'
 ).join(''):'<tr><td colspan="7" class="empty">Nenhuma fatura documental corresponde à pesquisa.</td></tr>';
 set('dc-fatura-paging',list.length+' fatura(s) · 10 por página · página '+(faturaPage+1)+' de '+pages);
 if($('dc-fatura-prev'))$('dc-fatura-prev').disabled=faturaPage===0;
 if($('dc-fatura-next'))$('dc-fatura-next').disabled=faturaPage>=pages-1;
}
function renderPix(){
 const refs=pixRefs.slice().sort((a,b)=>String(b.validado_em||'').localeCompare(String(a.validado_em||'')));
 const docs=new Map(documents.map(d=>[d.id,d]));
 if($('dc-pix-rows'))$('dc-pix-rows').innerHTML=refs.length?refs.map(p=>{
  const d=docs.get(p.documento_id),m=p.movimento_id&&movements.get(p.movimento_id);
  return '<tr><td>'+h(d?.codigo_origem||p.documento_id)+'</td>'+
   '<td>'+h(d?.cartao_nome||d?.meio||'PIX/Débito')+'</td>'+
   '<td class="money">'+(d?brl(d.valor_registrado):'—')+'</td>'+
   '<td>'+ (p.classificacao==='conciliado_itau'?
    '<span class="state paid">Localizado no Itaú</span>':'<span class="state open">Outro banco</span>')+
   (m?'<small>Fluxo '+h(date(m.data_movimento))+' · '+brl(m.valor)+'</small>':
    '<small>Sem saída localizada neste Fluxo</small>')+'</td>'+
   '<td><small>'+h(p.justificativa||p.criterio||'')+'</small></td></tr>';
 }).join(''):'<tr><td colspan="5" class="empty">Nenhuma validação PIX/Débito disponível.</td></tr>';
}
async function showInvoice(id){
 const f=faturas.find(x=>x.id===id),detail=$('dc-fatura-detail');
 if(!f||!detail)return;
 selectedInvoice=id;
 const version=++detailVersion;
 detail.hidden=false;
 set('dc-detail-title',f.cartao_nome+' · '+date(f.mes_fatura).slice(3)+' · '+brl(f.valor_documental));
 set('dc-detail-status','Buscando lançamentos originais da fatura...');
 detail.scrollIntoView({behavior:'smooth',block:'nearest'});
 try{
  const {data,error}=await db.from('fin_documentos_despesas')
   .select('codigo_origem,descricao,data_evento,parcela,valor_registrado')
   .eq('grupo','cartoes').eq('incluir',true).eq('cartao_nome',f.cartao_nome)
   .eq('mes_fatura',f.mes_fatura).order('data_evento',{ascending:true}).limit(1000);
  if(error)throw error;
  if(version!==detailVersion)return;
  const all=data||[];
  const total=all.reduce((sum,x)=>sum+Math.round(Number(x.valor_registrado)*100),0);
  if(all.length!==f.quantidade_lancamentos||total!==Math.round(Number(f.valor_documental)*100))
    throw Error('Os registros e o resumo divergem. Confira o arquivo antes de utilizar os valores.');
  if($('dc-detail-rows'))$('dc-detail-rows').innerHTML=all.map(x=>
   '<tr><td>'+h(date(x.data_evento))+'</td><td><strong>'+h(x.descricao)+'</strong>'+
    '<small>'+h(x.codigo_origem)+(x.parcela?' · parcela '+h(x.parcela):'')+'</small></td>'+
    '<td class="money">'+brl(x.valor_registrado)+'</td></tr>').join('');
  set('dc-detail-status',all.length+' lançamentos do Excel, inclusive ajustes. Não são pagamentos de fatura.');
 }catch(e){
  if(version!==detailVersion)return;
  set('dc-detail-status','Não foi possível abrir a fatura documental: '+(e.message||e));
  if($('dc-detail-rows'))$('dc-detail-rows').innerHTML='';
 }
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Supabase indisponível.');
   set('dc-status','Conferindo referências de autopeças, PIX/Débito e faturas documentais...');
   const {data:allowed,error:authorizationError}=await db.rpc('fluxo_caixa_autorizado');
   if(authorizationError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   const [auto,pix,invoices,autoDocs,declarations]=await Promise.all([
    fetchAll(()=>db.from('fin_conciliacoes_documentais')
     .select('id,documento_id,movimento_id,valor_conferido,diferenca_dias,criterio').order('identificado_em',{ascending:false})),
    fetchAll(()=>db.from('fin_pix_debito_referencias')
     .select('id,documento_id,movimento_id,classificacao,criterio,justificativa,validado_em').order('validado_em',{ascending:false})),
    fetchAll(()=>db.from('fin_faturas_historicas')
     .select('id,cartao_nome,mes_fatura,quantidade_lancamentos,ajustes_negativos,valor_positivo,valor_ajustes,valor_documental,status')
     .order('mes_fatura',{ascending:false})),
    fetchAll(()=>db.from('fin_documentos_despesas')
     .select('id,grupo,incluir,codigo_origem,linha_excel,descricao,fornecedor_nome,cartao_nome,meio,vencimento,valor_registrado,valor_pago_informado,situacao_origem')
     .eq('grupo','autopecas').eq('incluir',true).eq('situacao_origem','Pago').order('linha_excel',{ascending:true})),
    fetchAll(()=>db.from('fin_faturas_quitacoes_declaradas')
     .select('fatura_id').order('registrado_em',{ascending:false}))
   ]);
   const pixIds=pix.map(x=>x.documento_id);
   let pixDocs=[];
   if(pixIds.length){
    const {data,error}=await db.from('fin_documentos_despesas')
     .select('id,grupo,codigo_origem,cartao_nome,meio,valor_registrado').in('id',pixIds).limit(300);
    if(error)throw error;
    pixDocs=data||[];
   }
   const movementIds=[...new Set([...auto,...pix].map(x=>x.movimento_id).filter(Boolean))];
   let found=[];
   if(movementIds.length){
    const {data,error}=await db.from('fin_movimentos')
     .select('id,descricao,valor,data_movimento,referencia_origem').in('id',movementIds).limit(250);
    if(error)throw error;
    found=data||[];
   }
   documents=[...autoDocs,...pixDocs];
   autoRefs=auto;pixRefs=pix;faturas=invoices;
   declaredFaturas=new Set(declarations.map(x=>x.fatura_id));
   movements=new Map(found.map(x=>[x.id,x]));
   if(auto.some(x=>!movements.has(x.movimento_id)))throw Error('Há referências sem saída no Fluxo. Confira a base.');
   const remaining=paidAuto().filter(x=>!new Set(auto.map(a=>a.documento_id)).has(x.id));
   set('dc-matched-count',String(auto.length));
   set('dc-matched-total',brl(auto.reduce((s,x)=>s+Math.round(Number(x.valor_conferido)*100),0)/100));
   set('dc-review-count',String(remaining.length));
   set('dc-invoice-count',String(invoices.length));
   set('dc-invoice-total',brl(invoices.reduce((s,x)=>s+Math.round(Number(x.valor_documental)*100),0)/100));
   set('dc-pix-count',String(pix.length));
   rebuildInvoiceFilters();renderAuto();renderFaturas();renderPix();
   set('dc-status',auto.length+' referências únicas às saídas existentes · '+remaining.length+
    ' compras pagas sem correspondência única · '+invoices.length+
    ' faturas documentais ('+declaredFaturas.size+' quitadas por confirmação, sem conciliação) · '+
    pix.length+' validações PIX/Débito. Nenhum novo pagamento lançado.');
   if(selectedInvoice)await showInvoice(selectedInvoice);
  }catch(e){
   set('dc-status','Não foi possível consultar as correspondências: '+(e.message||e));
  }
 })();
 try{await loading}finally{loading=null}
}
function initialize(){
 if(!$('dc-auto-rows'))return;
 $('dc-auto-filter')?.addEventListener('change',()=>{autoPage=0;renderAuto()});
 $('dc-auto-search')?.addEventListener('input',()=>{autoPage=0;renderAuto()});
 $('dc-fatura-search')?.addEventListener('input',()=>{faturaPage=0;renderFaturas()});
 $('dc-fatura-year')?.addEventListener('change',()=>{rebuildInvoiceFilters();faturaPage=0;renderFaturas()});
 $('dc-fatura-card')?.addEventListener('change',()=>{faturaPage=0;renderFaturas()});
 $('dc-auto-prev')?.addEventListener('click',()=>{autoPage--;renderAuto()});
 $('dc-auto-next')?.addEventListener('click',()=>{autoPage++;renderAuto()});
 $('dc-fatura-prev')?.addEventListener('click',()=>{faturaPage--;renderFaturas()});
 $('dc-fatura-next')?.addEventListener('click',()=>{faturaPage++;renderFaturas()});
 $('dc-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 $('dc-review-pending')?.addEventListener('click',()=>{
  const filter=$('dc-auto-filter'),search=$('dc-auto-search');
  if(filter)filter.value='pendentes';
  if(search)search.value='';
  autoPage=0;renderAuto();
  $('dc-auto-rows')?.scrollIntoView?.({behavior:'smooth',block:'center'});
 });
 $('dc-auto-rows')?.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-dc-review-auto]');
  if(!button)return;
  button.disabled=true;
  try{
   if(!window.frDocumentLinksUI?.openAuto)throw Error('A conferência de pagamentos não está disponível.');
   await window.frDocumentLinksUI.refresh(true);
   await window.frDocumentLinksUI.openAuto(button.dataset.dcReviewAuto);
  }catch(error){
   set('dc-status','Não foi possível abrir esta compra: '+String(error.message||error));
  }finally{button.disabled=false}
 });
 $('dc-fatura-rows')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-dc-invoice]');
  if(button)showInvoice(button.dataset.dcInvoice).catch(()=>{});
 });
 $('dc-detail-close')?.addEventListener('click',()=>{
  ++detailVersion;selectedInvoice=null;
  if($('dc-fatura-detail'))$('dc-fatura-detail').hidden=true;
 });
 if(!document.querySelector('[data-view-panel="expenses"]')?.hidden)refresh().catch(()=>{});
}
window.frDocsReconcileUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
else initialize();
})();