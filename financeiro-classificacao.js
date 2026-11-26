/* FR Motors | Central de Classificação de Despesas | 2026-11-18
 * Só classifica saídas homologadas/confirmadas via RPC auditada.
 * Nenhuma alteração de valor, data, tipo, estado, descrição ou conciliação.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateBR=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const atBR=x=>x?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—';
const put=(id,v)=>{if($(id))$(id).textContent=v;};
const label=v=>String(v||'').trim()||'Não informado';
let all=[],suppliers=[],history=[],ready=false,loading=null,busy=false,active=null,page=0,year='todos',status='sem-categoria',query='';
const PAGE=25;
const batch=window.frBatchClassification?.create({mode:'caixa',body:'cl-rows',name:r=>r.descricao,description:r=>[dateBR(r.data_movimento),r.categoria||'Sem categoria',nameOf(r.fornecedor_id)].join(' · '),categories,payload:r=>({id:r.id,fornecedor_id:r.fornecedor_id??null,versao:r.atualizado_em}),refresh:async()=>{await refresh();window.frManagerReportsUI?.refresh?.();window.frRealDashboard?.refresh?.();window.frCategoryReportUI?.refresh?.();}});
async function rowsAll(builder,max=10000){
 const list=[],step=400;
 for(let offset=0;offset<max;offset+=step){
  const {data,error}=await builder().range(offset,offset+step-1);
  if(error)throw error;
  list.push(...(data||[]));
  if(!data||data.length<step)return list;
 }
 throw Error('Consulta ultrapassou o limite de segurança. Não foram exibidos dados parciais.');
}
const nameOf=id=>!id?'Não identificado':suppliers.find(s=>s.id===id)?.nome||'Fornecedor não encontrado';
const assigned=x=>String(x.categoria||'').trim().length>0;
function listFiltered(){
 const q=query.toLocaleLowerCase('pt-BR');
 return all.filter(x=>{
  if(year!=='todos'&&String(x.data_movimento).slice(0,4)!==year)return false;
  if(status==='sem-categoria'&&assigned(x))return false;
  if(status==='sem-fornecedor'&&x.fornecedor_id)return false;
  if(status==='classificadas'&&!assigned(x))return false;
  if(q){
   const hay=[x.descricao,x.categoria,nameOf(x.fornecedor_id),x.data_movimento,x.valor].join(' ').toLocaleLowerCase('pt-BR');
   if(!hay.includes(q))return false;
  }
  return true;
 }).sort((a,b)=>String(b.data_movimento).localeCompare(String(a.data_movimento))||
   String(b.id).localeCompare(String(a.id)));
}
function categories(){
 return [...new Set(all.map(x=>String(x.categoria||'').trim()).filter(Boolean))]
  .sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function fillCategoryOptions(current){
 const target=$('cl-category');if(!target)return;
 const values=categories(),list=[new Option('Selecione a categoria','')];
 if(current&&!values.includes(current))values.push(current);
 values.sort((a,b)=>a.localeCompare(b,'pt-BR'));
 values.forEach(x=>list.push(new Option(x,x)));
 list.push(new Option('Criar nova categoria...','__new__'));
 target.replaceChildren(...list);
 target.value=current||'';
 $('cl-new-category').hidden=true;$('cl-new-category').value='';
}
function fillSuppliers(current){
 const el=$('cl-supplier');if(!el)return;
 const previous=current===undefined?el.value:current;
 const opts=[new Option('Sem fornecedor vinculado','')];
 suppliers.filter(x=>x.ativo===true||x.id===previous).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).forEach(x=>
  opts.push(new Option(x.nome+(x.ativo?'':' (inativo)'),x.id)));
 el.replaceChildren(...opts);
 el.value=previous||'';
 if(previous&&!opts.some(x=>x.value===previous))el.value='';
}
function renderStats(){
 const missing=all.filter(x=>!assigned(x));
 window.frPendingUI?.publish('cash',{'cash-category':{count:missing.length,amount:missing.reduce((s,x)=>s+Math.round(Number(x.valor||0)*100),0)}});
 const unlinked=all.filter(x=>!x.fornecedor_id);
 put('cl-total',String(all.length));
 put('cl-missing',String(missing.length));
 put('cl-nolink',String(unlinked.length));
 put('cl-missing-money',money(missing.reduce((a,x)=>a+Number(x.valor||0),0)));
 put('cl-complete',String(all.filter(x=>assigned(x)&&x.fornecedor_id).length));
 put('cl-cat-count',String(categories().length));
}
function renderRows(){
 const entries=listFiltered();
 const totalPages=Math.max(1,Math.ceil(entries.length/PAGE));
 page=Math.min(Math.max(0,page),totalPages-1);
 const pageRows=entries.slice(page*PAGE,(page+1)*PAGE);
 batch?.prepare(entries,pageRows);
 const root=$('cl-rows');
 if(root)root.innerHTML=pageRows.length?pageRows.map(x=>
  '<tr>'+(batch?.checkbox(x)||'<td></td>')+'<td>'+esc(dateBR(x.data_movimento))+'</td>'+
  '<td><strong>'+esc(x.descricao||'Sem descrição')+'</strong><small class="cl-row-sub">'+esc(x.meio_pagamento||'Meio não informado')+'</small></td>'+
  '<td class="money">'+money(x.valor)+'</td>'+
  '<td><span class="cl-tag '+(assigned(x)?'cl-tag-good':'cl-tag-warn')+'">'+esc(x.categoria||'Sem categoria')+'</span></td>'+
  '<td>'+esc(nameOf(x.fornecedor_id))+'</td>'+
  '<td><button type="button" class="btn cl-edit-btn" data-cl-edit="'+esc(x.id)+'">Classificar</button></td></tr>'
 ).join(''):'<tr><td colspan="7" class="empty">Nenhuma saída encontrada. Altere os filtros para consultar outros registros.</td></tr>';
 batch?.update();
 put('cl-range',entries.length+' saída(s) no filtro · página '+(page+1)+' de '+totalPages);
 if($('cl-prev'))$('cl-prev').disabled=page===0;
 if($('cl-next'))$('cl-next').disabled=page>=totalPages-1;
}
function renderHistory(){
 const root=$('cl-history');if(!root)return;
 root.innerHTML=history.length?history.map(h=>{
  const old=h.antes||{},next=h.depois||{};
  const changeCat=label(old.categoria)+' → '+label(next.categoria);
  const changeSupplier=nameOf(old.fornecedor_id)+' → '+nameOf(next.fornecedor_id);
  return '<div class="cl-history-item"><div>'+
   '<strong>'+esc(next.descricao||old.descricao||'Movimentação')+'</strong>'+
   '<small>'+esc(dateBR(next.data_movimento||old.data_movimento))+' · '+esc(atBR(h.criado_em))+'</small>'+
   '<span class="cl-history-line">Categoria: '+esc(changeCat)+'</span>'+
   '<span class="cl-history-line">Fornecedor: '+esc(changeSupplier)+'</span>'+
   '</div><span class="cl-history-badge">Auditado</span></div>';
 }).join(''):
  '<div class="cl-empty">Ainda não há classificações feitas por esta central.</div>';
 put('cl-history-count',history.length+' alteração(ões) recente(s) · registro de antes/depois preservado no banco');
}
function fillYears(){
 const el=$('cl-year');if(!el)return;
 const values=[...new Set(all.map(x=>String(x.data_movimento).slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 el.replaceChildren(new Option('Todos os anos','todos'),...values.map(x=>new Option(x,x)));
 if(!values.includes(year))year='todos';
 el.value=year;
}
function render(){
 if(!ready)return;
 renderStats();fillYears();renderRows();renderHistory();
 put('cl-status','Consultado às '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date())+
  '. As alterações só são aplicadas após confirmação e não modificam valores ou pagamentos.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão com o Supabase indisponível.');
  put('cl-status','Consultando despesas e auditorias...');
  const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
  if(authError||allowed!==true)throw Error('Acesso ao financeiro não autorizado.');
  const [mov,forn,auditResult]=await Promise.all([
   rowsAll(()=>db.from('fin_movimentos').select(
    'id,data_movimento,tipo,descricao,categoria,fornecedor_id,valor,meio_pagamento,estado,origem,atualizado_em'
   ).eq('tipo','saida').eq('estado','confirmado').eq('origem','fluxo_caixa_homologado').order('id')),
   rowsAll(()=>db.from('fin_fornecedores').select('id,nome,ativo').order('nome')),
   db.from('fin_site_auditoria').select('id,registro_id,acao,antes,depois,usuario_id,criado_em')
    .eq('entidade','movimento').eq('acao','classificar_saida').order('id',{ascending:false}).limit(50)
  ]);
  if(auditResult.error)throw auditResult.error;
  all=mov;suppliers=forn;history=auditResult.data||[];ready=true;render();
 })().catch(e=>{
  ready=false;all=[];history=[];batch?.prepare([],[]);
  window.frPendingUI?.publish('cash',null);
  put('cl-status','Não foi possível carregar a central: '+(e.message||e));
  for(const id of ['cl-total','cl-missing','cl-nolink','cl-missing-money','cl-complete'])put(id,'—');
  if($('cl-rows'))$('cl-rows').innerHTML='<tr><td colspan="7" class="empty">Falha de consulta. Tente atualizar a página.</td></tr>';
  if($('cl-history'))$('cl-history').textContent='Histórico temporariamente indisponível.';
 }).finally(()=>{loading=null});
 return loading;
}
async function refreshSuppliers(){
 if(typeof db==='undefined'||!db)return;
 const {data,error}=await db.from('fin_fornecedores').select('id,nome,ativo').order('nome');
 if(error){put('cl-feedback','Atualize a central para obter a nova lista de fornecedores.');return}
 suppliers=data||[];
 fillSuppliers(active?.fornecedor_id);
 if(active){const selection=$('cl-supplier');if(selection&&selection.value===active.fornecedor_id)selection.value=active.fornecedor_id||''}
 renderRows();renderHistory();
}
function selectionCategory(){
 const selection=$('cl-category')?.value;
 return (selection==='__new__'?$('cl-new-category')?.value:selection||'').trim().toLocaleUpperCase('pt-BR');
}
function updatePreview(){
 const cat=selectionCategory();
 const supplier=$('cl-supplier')?.value||'';
 put('cl-after-cat',cat||'Selecione uma categoria');
 put('cl-after-supplier',nameOf(supplier));
 const changed=active&&(cat!==String(active.categoria||'').trim().toLocaleUpperCase('pt-BR')||
  supplier!==(active.fornecedor_id||''));
 if($('cl-save'))$('cl-save').disabled=busy||!cat||cat.length<2||cat.length>120||!changed;
}
function openEdit(id){
 if(busy)return;
 const row=all.find(x=>x.id===id);if(!row)return;
 active={...row};
 put('cl-edit-title','Classificar saída bancária');
 put('cl-edit-summary',dateBR(row.data_movimento)+' · '+row.descricao+' · '+money(row.valor));
 put('cl-before-cat',row.categoria||'Sem categoria');
 put('cl-before-supplier',nameOf(row.fornecedor_id));
 fillCategoryOptions(row.categoria);fillSuppliers(row.fornecedor_id);
 put('cl-feedback','Os valores, data e descrição bancária não serão alterados.');
 updatePreview();
 const dlg=$('cl-dialog');if(dlg?.showModal)dlg.showModal();else dlg?.setAttribute('open','');
}
function closeEdit(){
 const dlg=$('cl-dialog');
 if(dlg?.open&&dlg.close)dlg.close();else dlg?.removeAttribute('open');
 active=null;
}
async function commit(event){
 event.preventDefault();
 if(busy||!active)return;
 const category=selectionCategory(),supplier=$('cl-supplier')?.value||null;
 if(category.length<2||category.length>120){put('cl-feedback','Informe uma categoria de 2 a 120 caracteres.');return}
 if(category===String(active.categoria||'').trim().toLocaleUpperCase('pt-BR')&&supplier===(active.fornecedor_id||null)){
  put('cl-feedback','Nenhuma classificação foi alterada.');return;
 }
 busy=true;updatePreview();
 const row={...active};
 try{
  const {data,error}=await db.rpc('fin_movimento_classificar',{
   p_movimento:row.id,p_categoria:category,p_fornecedor:supplier,p_versao:row.atualizado_em
  });
  if(error)throw error;
  if(!data||data.resultado!=='atualizado')throw Error(data?.resultado==='sem_alteracoes'?'Nenhuma alteração identificada.':'O banco não confirmou a classificação.');
  closeEdit();
  await refresh();
  window.frManagerReportsUI?.refresh?.();
  window.frRealDashboard?.refresh?.();
  window.frFinanceUI?.showToast?.('Classificação salva e auditada. Nenhum valor do caixa foi alterado.');
 }catch(e){
  put('cl-feedback','Não foi possível salvar: '+(e.message||e));
 }finally{busy=false;updatePreview()}
}
function init(){
 if(!$('cl-rows'))return;
 $('cl-refresh')?.addEventListener('click',()=>refresh());
 $('cl-search')?.addEventListener('input',e=>{query=e.target.value.trim();page=0;renderRows()});
 $('cl-status-filter')?.addEventListener('change',e=>{status=e.target.value;page=0;renderRows()});
 $('cl-year')?.addEventListener('change',e=>{year=e.target.value;page=0;renderRows()});
 $('cl-prev')?.addEventListener('click',()=>{page--;renderRows()});
 $('cl-next')?.addEventListener('click',()=>{page++;renderRows()});
 $('cl-rows')?.addEventListener('click',e=>{const btn=e.target.closest('[data-cl-edit]');if(btn)openEdit(btn.dataset.clEdit)});
 $('cl-category')?.addEventListener('change',e=>{
  const custom=e.target.value==='__new__';$('cl-new-category').hidden=!custom;
  if(custom)$('cl-new-category').focus();
  updatePreview();
 });
 $('cl-new-category')?.addEventListener('input',updatePreview);
 $('cl-supplier')?.addEventListener('change',updatePreview);
 $('cl-form')?.addEventListener('submit',commit);
 $('cl-cancel')?.addEventListener('click',()=>{if(!busy)closeEdit()});
 $('cl-cancel-footer')?.addEventListener('click',()=>{if(!busy)closeEdit()});
 $('cl-dialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault();else active=null});
 $('cl-dialog')?.addEventListener('close',()=>{if(!busy)active=null});
 $('modal-supplier')?.addEventListener('close',()=>refreshSuppliers());
 if(!document.querySelector('[data-view-panel="imports"]')?.hidden&&
   document.getElementById('imports-classificacao')?.open)refresh();
}
window.frClassificationUI={refresh,__test:{assigned,label,atBR}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();