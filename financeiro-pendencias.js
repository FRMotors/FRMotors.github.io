/* FR Motors | Central de pendências: leitura dos mesmos módulos operacionais. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const keys={agenda:['bills-late','receive-late','card-late','today','bill-undated','card-undated','receive-undated'],
 itau:['itau-new','itau-review'],cash:['cash-category'],card:['card-planilha','card-importado']};
const ids=Object.values(keys).flat(),values=new Map(),states=new Map();
let loading=null,started=false;
function summarizeAgenda(items,today){
 const take=fn=>{const a=items.filter(fn);return {count:a.length,amount:a.reduce((s,x)=>s+x.rest,0)};};
 const late=x=>x.vencimento&&x.vencimento<today;
 return {'bills-late':take(x=>x.kind==='boleto'&&late(x)),
  'receive-late':take(x=>x.kind==='receber'&&late(x)),
  'card-late':take(x=>x.kind==='cartao'&&late(x)),
  today:take(x=>x.vencimento===today),
  'bill-undated':take(x=>x.kind==='boleto'&&!x.vencimento),
  'card-undated':take(x=>x.kind==='cartao'&&!x.vencimento),
  'receive-undated':take(x=>x.kind==='receber'&&!x.vencimento)};
}
function draw(){
 for(const id of ids){
  const el=$('fp-'+id),detail=$('fp-'+id+'-detail'),tile=$('fp-'+id+'-tile');
  const group=Object.keys(keys).find(k=>keys[k].includes(id)),state=states.get(group),value=values.get(id);
  if(!el||!detail)continue;
  el.textContent=state==='ok'&&value?String(value.count):state==='error'?'Indisp.':'—';
  detail.textContent=state==='error'?'Não foi possível consultar':state!=='ok'?'Consultando...':
   (id==='today'?'A pagar e a receber · sem soma líquida':value?.amount!==undefined?money(value.amount):value?.count===0?'Nenhuma pendência':'Revisar registros');
  tile?.classList.toggle('fp-attention',state==='ok'&&value?.count>0);
  tile?.classList.toggle('fp-clear',state==='ok'&&value?.count===0);
 }
 const errors=[...states.values()].filter(x=>x==='error').length,ok=[...states.values()].filter(x=>x==='ok').length;
 const status=$('fp-status');if(status)status.textContent=errors?errors+' fonte(s) indisponível(is). Atualize para tentar novamente; zero nunca substitui erro.':
  ok===Object.keys(keys).length?'Atualizado às '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())+' · indicadores independentes, não somáveis.':'Consultando as fontes financeiras...';
}
function publish(group,data){
 if(!keys[group])return;
 if(!data){states.set(group,'error');for(const id of keys[group])values.delete(id);}
 else{
  const valid=keys[group].every(id=>Number.isSafeInteger(data[id]?.count)&&data[id].count>=0&&(data[id].amount===undefined||Number.isSafeInteger(data[id].amount)));
  states.set(group,valid?'ok':'error');
  for(const id of keys[group]){if(valid)values.set(id,data[id]);else values.delete(id);}
 }
 draw();
}
function refresh(){
 if(loading)return loading;
 const app=$('app');if(!app||app.classList.contains('hidden'))return Promise.resolve();
 for(const group of Object.keys(keys))states.set(group,'loading');draw();
 const sources={agenda:window.frInvoicesAgendaUI,itau:window.frHistoryUI,cash:window.frClassificationUI,card:window.frCardCategoriesUI};
 const btn=$('fp-refresh');if(btn)btn.disabled=true;
 loading=Promise.allSettled(Object.entries(sources).map(async([group,api])=>{
  try{if(!api?.refresh)throw Error('Módulo indisponível');await api.refresh();if(states.get(group)==='loading')publish(group,null);}
  catch(_){publish(group,null);}
 })).finally(()=>{loading=null;if(btn)btn.disabled=false;draw()});
 return loading;
}
function showAgenda(kind,status){
 window.frFinanceUI?.selectView?.('agenda');
 return window.frPendingAgendaFilter?.(kind,status);
}
function showCash(){
 window.frFinanceUI?.selectView?.('classify');
 const c=$('cl-year'),s=$('cl-status-filter'),q=$('cl-search');
 if(c){c.value='todos';c.dispatchEvent(new Event('change',{bubbles:true}));}
 if(s){s.value='sem-categoria';s.dispatchEvent(new Event('change',{bubbles:true}));}
 if(q){q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));}
 $('cl-list-title')?.scrollIntoView?.({behavior:'smooth',block:'start'});
}
function showCards(source){
 window.frFinanceUI?.selectView?.('cardbills');
 const d=$('cb-classification-collapse');if(d)d.open=true;
 const field=$('cbcat-source');if(field){field.value=source;field.dispatchEvent(new Event('change',{bubbles:true}));}
 $('cbcat-clear')?.click();
 const f=$('cbcat-purpose-filter');if(f){f.value='a_classificar';f.dispatchEvent(new Event('change',{bubbles:true}));}
 $('cbcat-panel')?.scrollIntoView?.({behavior:'smooth',block:'start'});
}
function navigate(key){
 const route={'bills-late':['boleto','prazo-passado'],'receive-late':['receber','prazo-passado'],'card-late':['cartao','prazo-passado'],today:['todos','hoje'],
  'bill-undated':['boleto','sem-data'],'card-undated':['cartao','sem-data'],'receive-undated':['receber','sem-data']};
 if(route[key])return showAgenda(...route[key]);
 if(key==='cash-category')return showCash();
 if(key==='card-planilha'||key==='card-importado')return showCards(key==='card-planilha'?'planilha':'importado');
 if(key==='itau-new'||key==='itau-review'){
  window.frFinanceUI?.selectView?.('itau');
  if(key==='itau-review')for(const id of ['hist-itau-memoria-calculo']){const d=$(id);if(d)d.open=true;}
  $(key==='itau-new'?'hist-itau-approve-title':'hist-itau-reconcile-title')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
}
function init(){
 if(started||!$('fp-center'))return;started=true;
 $('fp-refresh')?.addEventListener('click',refresh);
 $('fp-center')?.addEventListener('click',e=>{const b=e.target.closest('[data-fp-action]');if(b)navigate(b.dataset.fpAction);});
 const app=$('app'),panel=document.querySelector('[data-view-panel="overview"]');
 if(app?.classList.contains('hidden')&&typeof MutationObserver!=='undefined'){
  const o=new MutationObserver(()=>{if(!app.classList.contains('hidden')){o.disconnect();if(!panel?.hidden)refresh();}});
  o.observe(app,{attributes:true,attributeFilter:['class']});
 }else if(!panel?.hidden)refresh();
}
window.frPendingUI={refresh,publish,summarizeAgenda,__test:{keys}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();