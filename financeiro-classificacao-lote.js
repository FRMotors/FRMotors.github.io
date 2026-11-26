/* FR Motors | Classificação em lote, com seleção explícita e auditoria individual. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const LIMIT=100;
function createSelection(){
 const selected=new Map();
 return {selected,prune(rows){const allowed=new Set(rows.map(r=>r.id));for(const id of selected.keys())if(!allowed.has(id))selected.delete(id);},
 add(rows){if(new Set([...selected.keys(),...rows.map(r=>r.id)]).size>LIMIT)return false;for(const r of rows)if(!selected.has(r.id))selected.set(r.id,{...r});return true;},
 remove(id){selected.delete(id)},clear(){selected.clear()}};
}
function create(config){
 const sel=createSelection();let filtered=[],visible=[],saving=false,preview=null,initialized=false;
 const prefix='batch-'+config.mode,el=id=>$(prefix+'-'+id),eligible=r=>!config.eligible||config.eligible(r);
 const total=rows=>money(rows.reduce((s,r)=>s+Math.round(Number(r.valor||0)*100),0)/100);
 function status(t){if(el('status'))el('status').textContent=t;}
 const pending=()=>config.isPending?filtered.filter(config.isPending):[];
 function update(){
  const n=sel.selected.size;if(el('count'))el('count').textContent=n+' selecionado(s) · '+total([...sel.selected.values()]);
  const p=pending();if(el('next-pending'))el('next-pending').textContent='Selecionar '+Math.min(LIMIT,p.length)+' pendente(s)';
  for(const [id,disabled] of [['page',!visible.length],['all',!filtered.length],['next-pending',!p.length],['clear',!n],['open',!n]])if(el(id))el(id).disabled=saving||disabled;
  $(config.body)?.querySelectorAll?.('[data-batch-id]').forEach(e=>{e.checked=sel.selected.has(e.dataset.batchId);e.disabled=saving});
 }
 function mount(){
  if(initialized)return;
  const body=$(config.body),wrap=body?.closest?.('.table-wrap');if(!wrap)return;
  const bar=document.createElement('div');bar.className='fin-batch-toolbar';bar.id=prefix+'-toolbar';
  bar.innerHTML='<div class="fin-batch-actions"><strong id="'+prefix+'-count">0 selecionado(s)</strong>'+[['page','Selecionar página'],['all','Selecionar todos os filtrados'],...(config.isPending?[['next-pending','Selecionar até 100 pendentes']]:[]),['clear','Limpar seleção'],['open','Classificar selecionados']].map(([id,label])=>'<button type="button" class="btn'+(id==='open'?' btn-primary':'')+'" id="'+prefix+'-'+id+'">'+label+'</button>').join('')+'</div><p class="info-note" id="'+prefix+'-status" role="status">Pesquise a loja e selecione até 100 registros, inclusive em outras páginas.</p>';
  wrap.before(bar);
  const dlg=document.createElement('dialog');dlg.id=prefix+'-dialog';dlg.className='fin-dialog fin-batch-dialog';dlg.setAttribute('aria-labelledby',prefix+'-title');
  dlg.innerHTML='<div class="dialog-head"><div><h2 id="'+prefix+'-title">Classificar despesas em lote</h2><p id="'+prefix+'-summary"></p></div></div><div class="dialog-body"><form id="'+prefix+'-form"><label>Categoria '+(config.mode==='cartao'?'(opcional, em branco mantém a atual)':'')+'<input id="'+prefix+'-category" maxlength="'+(config.mode==='caixa'?120:100)+'" list="'+prefix+'-options" placeholder="Escolha ou digite uma categoria"></label><datalist id="'+prefix+'-options"></datalist>'+
  (config.mode==='cartao'?'<label>Finalidade<select id="'+prefix+'-purpose"><option value="">Manter finalidade atual</option><option value="oficina">Uso na oficina</option><option value="outras">Pessoal / outras</option><option value="a_classificar">A definir</option></select></label>':'')+
  '<p class="info-note">Revise todos os registros. '+(config.mode==='caixa'?'O fornecedor de cada saída será mantido. ':'')+'Nenhum valor, data ou pagamento será alterado.</p><div class="fin-batch-preview" id="'+prefix+'-preview"></div><label class="fin-batch-confirm"><input type="checkbox" id="'+prefix+'-ack" required> Confirmo a classificação dos registros selecionados.</label><p id="'+prefix+'-feedback" role="status" aria-live="polite"></p><div class="form-actions"><button type="button" class="btn" id="'+prefix+'-cancel">Cancelar</button><button type="submit" class="btn btn-primary" id="'+prefix+'-save">Confirmar classificação</button></div></form></div>';
  document.body.appendChild(dlg);initialized=true;
  const choose=rows=>{status(sel.add(rows)?'Seleção atualizada. Confira antes de classificar.':'Mais de 100 registros. Reduza os filtros ou selecione menos registros.');update()};
  el('page').addEventListener('click',()=>choose(visible));el('all').addEventListener('click',()=>choose(filtered));
  el('next-pending')?.addEventListener('click',()=>{if(saving)return;const rows=pending();sel.clear();sel.add(rows.slice(0,LIMIT));update();status(sel.selected.size+' pendente(s) selecionado(s) de '+rows.length+' encontrado(s). Confira categoria e finalidade antes de confirmar.');});
  el('clear').addEventListener('click',()=>{sel.clear();update();status('Seleção limpa.')});
  body.addEventListener('change',e=>{const x=e.target.closest('[data-batch-id]');if(!x||saving)return;const r=filtered.find(v=>v.id===x.dataset.batchId);if(!r)return;if(x.checked)choose([r]);else{sel.remove(r.id);update()}});
  el('open').addEventListener('click',open);el('cancel').addEventListener('click',()=>{if(!saving)dlg.close()});
  dlg.addEventListener('cancel',e=>{if(saving)e.preventDefault()});el('form').addEventListener('submit',save);
 }
 function prepare(rows,pageRows){filtered=rows.filter(eligible);visible=pageRows.filter(eligible);sel.prune(filtered);mount();update();}
 function checkbox(r){return '<td class="fin-batch-check">'+(eligible(r)?'<input type="checkbox" data-batch-id="'+esc(r.id)+'" aria-label="Selecionar '+esc(config.name(r))+'"'+(sel.selected.has(r.id)?' checked':'')+(saving?' disabled':'')+'>':'')+'</td>';}
 function open(){
  if(saving||!sel.selected.size)return;preview=[...sel.selected.values()].map(r=>({...r}));
  el('summary').textContent=preview.length+' lançamento(s) · '+total(preview);el('category').value='';if(el('purpose'))el('purpose').value='';
  el('options').innerHTML=[...new Set(config.categories().filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(c=>'<option value="'+esc(c)+'"></option>').join('');
  el('preview').innerHTML=preview.map(r=>'<div><strong>'+esc(config.name(r))+'</strong><small>'+esc(config.description(r))+'</small><b>'+money(r.valor)+'</b></div>').join('');
  el('ack').checked=false;el('feedback').textContent='';el('dialog').showModal();
 }
 async function save(e){
  e.preventDefault();if(saving||!preview?.length)return;
  const cat=el('category').value.trim().toLocaleUpperCase('pt-BR'),purpose=el('purpose')?.value||null,feedback=el('feedback');
  if(!el('ack').checked||(!cat&&(!purpose||config.mode!=='cartao'))||(cat&&(cat.length<2||cat.length>(config.mode==='caixa'?120:100)))){feedback.textContent='Informe uma classificação válida e confirme a seleção.';return;}
  if(preview.some(r=>!filtered.some(x=>x.id===r.id))){feedback.textContent='A seleção mudou. Feche e confira os filtros novamente.';return;}
  saving=true;el('save').disabled=true;el('cancel').disabled=true;update();feedback.textContent='Salvando lote em uma única operação...';
  try{
   const {data,error}=await db.rpc('fin_classificar_despesas_lote',{p_modo:config.mode,p_registros:preview.map(config.payload),p_categoria:cat,p_finalidade:purpose});
   if(error)throw error;if(data?.resultado!=='concluido'||data.quantidade!==preview.length)throw Error('Servidor não confirmou o lote.');
   sel.clear();preview=null;el('dialog').close();await config.refresh();
   const message=data.alterados===0?'Nenhum registro foi alterado: as classificações selecionadas já estavam iguais. Revise o filtro de pendências.':data.alterados+' registro(s) alterado(s) de '+data.quantidade+' selecionado(s), com auditoria individual.'+(config.isPending?' '+pending().length+' pendente(s) na seleção atual.':'');
   status(message);window.frFinanceUI?.showToast?.(message);
  }catch(err){feedback.textContent='Lote não confirmado: '+(err.message||err)+'. Atualize a lista antes de tentar novamente.';}
  finally{saving=false;el('save').disabled=false;el('cancel').disabled=false;update();}
 }
 return {prepare,checkbox,update};
}
window.frBatchClassification={create,__test:{createSelection}};
})();