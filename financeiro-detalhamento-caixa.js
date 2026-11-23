/* FR Motors | Análise detalhada do Fluxo de Caixa homologado (somente leitura).
 * Nenhum valor de cartão, boleto ou extrato em "fin_teste_*" é somado aqui.
 * Fornecedor não é inferido a partir da descrição, pois não há vinculação cadastral. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const percent=n=>new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(n);
const cents=n=>Math.round(Number(n||0)*100);
const date=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Data não informada';
const monthLabel=m=>m?String(m).slice(0,7).split('-').reverse().join('/'):'Não informado';
const category=x=>String(x?.categoria??'').trim()||'Sem categoria';
const put=(id,value)=>{const el=$(id);if(el)el.textContent=value};
const PAGE_SIZE=10;
const STORAGE_KEY='fr-financeiro-detalhe-periodo';
let rows=[],page=0,loading=null,hasData=false,lastMonth='',currentMonth='',selectedCategory='todos';
function getStored(){
 try{return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)||'null')}catch(_){return null}
}
function persist(){
 try{window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify({
  month:currentMonth,category:selectedCategory,type:$('cashx-type')?.value||'saida',
  sort:$('cashx-sort')?.value||'valor',query:$('cashx-search')?.value||''
 }))}catch(_){}
}
async function getAll(builder){
 const all=[],size=400,limit=12000;
 for(let off=0;off<limit;off+=size){
  const {data,error}=await builder().range(off,off+size-1);
  if(error)throw error;
  all.push(...(data||[]));
  if((data||[]).length<size)return all;
 }
 throw Error('Base financeira excedeu o limite de 12 mil movimentos. Totais incompletos não serão exibidos.');
}
const monthOf=x=>String(x.data_movimento||'').slice(0,7);
function updateMonthOptions(){
 const sel=$('cashx-month');if(!sel)return;
 const months=[...new Set(rows.map(monthOf).filter(x=>/^\d{4}-\d{2}$/.test(x)))].sort().reverse();
 lastMonth=months[0]||'';
 const saved=getStored(),validSaved=saved&&months.includes(saved.month);
 if(!currentMonth)currentMonth=validSaved?saved.month:(lastMonth||'todos');
 if(currentMonth!=='todos'&&!months.includes(currentMonth))currentMonth=lastMonth||'todos';
 sel.replaceChildren(new Option('Todo o histórico','todos'),
  ...months.map(m=>new Option(monthLabel(m),m)));
 sel.value=currentMonth;
}
function periodRows(){
 return currentMonth==='todos'?rows:rows.filter(x=>monthOf(x)===currentMonth);
}
function typeRows(){
 const type=$('cashx-type')?.value||'saida';
 return periodRows().filter(x=>type==='todos'||x.tipo===type);
}
function categoriesOptions(){
 const el=$('cashx-category');if(!el)return;
 const options=[...new Set(typeRows().map(category))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(selectedCategory!=='todos'&&!options.includes(selectedCategory))selectedCategory='todos';
 el.replaceChildren(new Option('Todas as categorias','todos'),
  ...options.map(c=>new Option(c,c)));
 el.value=selectedCategory;
}
function categoryStats(){
 const stats=new Map();
 for(const r of periodRows()){
  if(r.tipo!=='saida')continue;
  const name=category(r),x=stats.get(name)||{name,count:0,total:0};
  x.count++;x.total+=cents(r.valor);
  stats.set(name,x);
 }
 return [...stats.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
}
function renderCategories(){
 const stats=categoryStats(),total=stats.reduce((s,x)=>s+x.total,0),top=stats.slice(0,8),other=stats.slice(8);
 put('cashx-categories-summary',stats.length+' categorias de saídas, incluindo registros não classificados');
 const html=top.map(x=>{
  const share=total?x.total/total:0;
  return '<button type="button" class="cashx-category-row" data-cashx-pick="'+safe(x.name)+'" title="Filtrar movimentações desta categoria">'+
   '<span class="cashx-category-head"><strong>'+safe(x.name)+'</strong><b>'+money(x.total/100)+'</b></span>'+
   '<span class="cashx-category-foot"><small>'+x.count+' saída(s)</small><small>'+percent(share)+' do total</small></span>'+
   '<span class="cashx-category-bar"><span style="width:'+Math.min(100,Math.max(0,share*100)).toFixed(2)+'%"></span></span></button>';
 }).join('');
 const othersSum=other.reduce((s,x)=>s+x.total,0);
 const footer=other.length?'<p class="cashx-other">Outras '+other.length+' categoria(s): '+money(othersSum/100)+
  ' ('+percent(total?othersSum/total:0)+' das saídas). Veja todas no filtro de categoria.</p>':'';
 if($('cashx-categories'))$('cashx-categories').innerHTML=html+footer||
  '<p class="cashx-empty">Nenhuma saída confirmada neste período.</p>';
}
function matchesQuery(x,q){
 if(!q)return true;
 const value=[x.descricao,x.categoria,x.meio_pagamento,x.data_movimento,x.valor].join(' ').toLocaleLowerCase('pt-BR');
 return value.includes(q);
}
function filteredRows(){
 const type=$('cashx-type')?.value||'saida',q=($('cashx-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const sort=$('cashx-sort')?.value||'valor';
 const list=periodRows().filter(r=>(type==='todos'||r.tipo===type)&&
  (selectedCategory==='todos'||category(r)===selectedCategory)&&matchesQuery(r,q));
 list.sort((a,b)=>{
  if(sort==='data')return String(b.data_movimento).localeCompare(String(a.data_movimento))||cents(b.valor)-cents(a.valor);
  if(sort==='antiga')return String(a.data_movimento).localeCompare(String(b.data_movimento))||cents(b.valor)-cents(a.valor);
  return cents(b.valor)-cents(a.valor)||String(b.data_movimento).localeCompare(String(a.data_movimento));
 });
 return list;
}
function draw(){
 if(!hasData)return;
 const period=periodRows();
 const entradas=period.filter(r=>r.tipo==='entrada').reduce((s,x)=>s+cents(x.valor),0);
 const saidas=period.filter(r=>r.tipo==='saida').reduce((s,x)=>s+cents(x.valor),0);
 const net=entradas-saidas;
 put('cashx-in',money(entradas/100));
 put('cashx-out',money(saidas/100));
 put('cashx-net',money(net/100));
 put('cashx-period-summary',period.length+' movimentos confirmados neste período');
 const netEl=$('cashx-net');if(netEl)netEl.classList.toggle('negative',net<0);
 categoriesOptions();
 renderCategories();
 const filtered=filteredRows(),total=filtered.reduce((s,r)=>s+cents(r.valor),0);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 page=Math.max(0,Math.min(page,pages-1));
 const shown=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 if($('cashx-rows'))$('cashx-rows').innerHTML=shown.length?shown.map(r=>
  '<tr><td>'+date(r.data_movimento)+'</td>'+
  '<td><strong>'+safe(r.descricao||'Sem descrição')+'</strong></td>'+
  '<td>'+safe(category(r))+'</td>'+
  '<td>'+safe(r.tipo==='entrada'?'Entrada':'Saída')+'</td>'+
  '<td>'+safe(r.meio_pagamento||'Não informado')+'</td>'+
  '<td class="money '+(r.tipo==='saida'?'negative':'')+'">'+
    (r.tipo==='saida'?'−':'+')+money(r.valor)+'</td></tr>'
 ).join(''):'<tr><td colspan="6" class="empty">Nenhuma movimentação corresponde aos filtros.</td></tr>';
 put('cashx-filter-summary',filtered.length+' movimento(s) encontrados · valor bruto filtrado: '+money(total/100)+
  ' · página '+(page+1)+' de '+pages);
 if($('cashx-prev'))$('cashx-prev').disabled=page===0;
 if($('cashx-next'))$('cashx-next').disabled=page>=pages-1;
 const label=currentMonth==='todos'?'todo o histórico':monthLabel(currentMonth);
 const range=period.map(x=>x.data_movimento).filter(Boolean).sort();
 put('cashx-range','Análise de '+label+(range.length?' · lançamentos de '+date(range[0])+' a '+date(range[range.length-1]):'')+
  '. Filtros da tabela não alteram os totais do período. Nenhum fornecedor está vinculado por ID na base homologada.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
   put('cashx-status','Carregando exclusivamente movimentações homologadas...');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   const data=await getAll(()=>db.from('fin_movimentos')
    .select('id,data_movimento,tipo,descricao,categoria,meio_pagamento,valor,estado,origem')
    .in('origem',['fluxo_caixa_homologado','extrato_itau_homologado']).eq('estado','confirmado')
    .order('data_movimento',{ascending:false}).order('id',{ascending:false}));
   if(data.some(x=>!['entrada','saida'].includes(x.tipo)))throw Error('Tipo inesperado no Fluxo de Caixa; confira a base antes de calcular.');
   rows=data;
   hasData=true;
   updateMonthOptions();page=0;draw();
   put('cashx-status','Fonte: Fluxo de Caixa homologado. '+rows.length+
    ' movimentações confirmadas, sem somar boletos, faturas ou extratos importados.');
  }catch(err){
   hasData=false;
   put('cashx-status','Não foi possível carregar os lançamentos homologados: '+(err.message||err));
   if($('cashx-rows'))$('cashx-rows').innerHTML='<tr><td colspan="6" class="empty">Dados indisponíveis. Tente atualizar novamente.</td></tr>';
   if($('cashx-categories'))$('cashx-categories').innerHTML='<p class="cashx-empty">Detalhamento indisponível.</p>';
  }
 })();
 try{await loading}finally{loading=null}
}
function init(){
 if(!$('cashx-rows'))return;
 const saved=getStored();
 if(saved){
  selectedCategory=typeof saved.category==='string'?saved.category:'todos';
  if(['todos','entrada','saida'].includes(saved.type))$('cashx-type').value=saved.type;
  if(['valor','data','antiga'].includes(saved.sort))$('cashx-sort').value=saved.sort;
  if(typeof saved.query==='string')$('cashx-search').value=saved.query.slice(0,120);
 }
 $('cashx-month')?.addEventListener('change',x=>{
  currentMonth=x.target.value;selectedCategory='todos';page=0;draw();persist();
 });
 $('cashx-type')?.addEventListener('change',()=>{selectedCategory='todos';page=0;draw();persist()});
 $('cashx-category')?.addEventListener('change',x=>{selectedCategory=x.target.value;page=0;draw();persist()});
 $('cashx-sort')?.addEventListener('change',()=>{page=0;draw();persist()});
 $('cashx-search')?.addEventListener('input',()=>{page=0;draw();persist()});
 $('cashx-prev')?.addEventListener('click',()=>{page--;draw()});
 $('cashx-next')?.addEventListener('click',()=>{page++;draw()});
 $('cashx-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 $('cashx-categories')?.addEventListener('click',event=>{
  const item=event.target.closest('[data-cashx-pick]');
  if(!item)return;
  $('cashx-type').value='saida';
  selectedCategory=item.dataset.cashxPick;
  $('cashx-search').value='';
  page=0;draw();persist();
  $('cashx-rows')?.closest('.table-wrap')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 const app=$('app'),panel=document.querySelector('[data-view-panel="overview"]');
 const begin=()=>{if(!panel?.hidden)refresh().catch(()=>{})};
 if(app?.classList.contains('hidden')&&typeof MutationObserver!=='undefined'){
  const observer=new MutationObserver(()=>{
   if(!app.classList.contains('hidden')){observer.disconnect();begin()}
  });
  observer.observe(app,{attributes:true,attributeFilter:['class']});
 }else begin();
}
window.frCashDetailUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();