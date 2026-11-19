/* FR Motors | Análise financeira por categoria e conta bancária.
 * Fontes separadas ou consolidação cuidadosa: banco novo após o caixa homologado.
 * Somente leitura. Mudanças de classificação são lidas do Supabase a cada atualização. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.frCategoryCore;
const consolidatedCore=window.frCategoryCombinedCore;
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const count=n=>new Intl.NumberFormat('pt-BR').format(n);
const percent=(n,total)=>total?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n/total):'0%';
const dateBR=value=>String(value||'').slice(0,10).split('-').reverse().join('/');
const state={official:[],imported:[],combined:[],combination:null,confirmations:new Map(),savingMatch:null,files:[],loaded:false,loading:null,detailPage:0,detailLimit:20,categoryKey:'',detailSearch:'',generation:0};
const elements={
 source:'rg-cat-source',account:'rg-cat-account',status:'rg-cat-status',note:'rg-cat-provenance',
 kpis:'rg-cat-metrics',inBars:'rg-cat-inbars',outBars:'rg-cat-outbars',
 table:'rg-cat-table',categoryFilter:'rg-cat-category',search:'rg-cat-search',
 details:'rg-cat-movements',pagination:'rg-cat-page',prev:'rg-cat-prev',next:'rg-cat-next'
};
const el=name=>$(elements[name]);
function setStatus(message,bad=false){
 const node=el('status');if(!node)return;
 node.textContent=message;node.className='rg-cat-status'+(bad?' rg-cat-error':'');
}
async function all(makeQuery,max=20000){
 const result=[],step=400;
 for(let i=0;i<max;i+=step){
  const {data,error}=await makeQuery().range(i,i+step-1);
  if(error)throw error;
  result.push(...(data||[]));
  if((data||[]).length<step)return result;
 }
 throw Error('O relatório excedeu o limite seguro de '+max+' lançamentos; não serão exibidos totais parciais.');
}
function filters(){
 const source=el('source')?.value||'imported';
 const year=Number($('rg-year')?.value||new Date().getFullYear());
 const month=$('rg-month')?.value||'todos';
 const account=source==='imported'?(el('account')?.value||''):'';
 return {source,year,month,account};
}
function sourceRows(){
 const kind=filters().source;
 if(kind==='official')return state.official;
 if(kind==='combined')return state.combined;
 return state.imported;
}
function grouped(){
 const f=filters();
 return core.summarize(sourceRows(),f);
}
function accountOptions(){
 const control=el('account');if(!control)return;
 const old=control.value;
 const byName=new Map();
 state.files.forEach(f=>{
  const name=String(f.conta_nome||'').trim();
  const key=core.fold(name);
  if(key&&!byName.has(key))byName.set(key,name);
 });
 const options=[...byName].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 control.innerHTML='<option value="">Todas as contas importadas</option>'+
  options.map(([key,label])=>'<option value="'+safe(key)+'">'+safe(label)+'</option>').join('');
 if(options.some(([key])=>key===old))control.value=old;
}
function metric(label,value,note,kind=''){
 return '<article class="rg-cat-metric '+kind+'"><span>'+safe(label)+'</span>'+
  '<strong>'+safe(value)+'</strong><small>'+safe(note)+'</small></article>';
}
function bars(node,groups,total,empty){
 if(!node)return;
 if(!groups.length){node.innerHTML='<p class="rg-cat-empty">'+safe(empty)+'</p>';return}
 const max=Math.max(...groups.map(g=>g.value),1);
 node.innerHTML=groups.slice(0,12).map(group=>{
  const width=Math.max(0,Math.round(group.value/max*100));
  return '<div class="rg-cat-bar-item">'+
   '<div class="rg-cat-bar-head"><span title="'+safe(group.label)+'">'+safe(group.label)+'</span>'+
    '<strong>'+money(group.value)+'</strong></div>'+
   '<div class="rg-cat-bar-track"><span style="width:'+width+'%"></span></div>'+
   '<small>'+count(group.count)+' movimentação(ões) · '+percent(group.value,total)+' do '+(group.type==='entrada'?'recebido':'pago')+'</small>'+
   '</div>';
 }).join('');
}
function categoryOptions(summary){
 const input=el('categoryFilter');
 if(!input)return;
 const current=state.categoryKey;
 const choices=summary.allGroups.map(g=>'<option value="'+safe(g.key)+'">'+
  safe((g.type==='entrada'?'Entrada: ':'Saída: ')+g.label)+'</option>');
 input.innerHTML='<option value="">Todas as categorias</option>'+choices.join('');
 if(summary.allGroups.some(g=>g.key===current))input.value=current;
 else{state.categoryKey='';input.value=''}
}
function resultRows(summary){
 const root=el('table');
 if(!root)return;
 const groups=summary.allGroups;
 root.innerHTML=groups.length?groups.map(group=>{
  const base=group.type==='entrada'?summary.incoming:summary.outgoing;
  const selected=group.key===state.categoryKey?' rg-cat-selected':'';
  return '<tr class="rg-cat-category-row'+selected+'">'+
   '<td><button type="button" class="rg-cat-catbutton" data-rg-cat-key="'+safe(group.key)+'">'+safe(group.label)+'</button></td>'+
   '<td><span class="rg-cat-kind '+(group.type==='entrada'?'income':'expense')+'">'+
    (group.type==='entrada'?'Receita':'Despesa')+'</span></td>'+
   '<td class="money">'+count(group.count)+'</td>'+
   '<td class="money">'+money(group.value)+'</td>'+
   '<td class="money">'+percent(group.value,base)+'</td>'+
   '<td class="money">'+money(Math.round(group.value/group.count))+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="rg-cat-empty">Sem movimentações nesta fonte e período.</td></tr>';
}
function filteredDetails(summary){
 const term=core.fold(state.detailSearch);
 return summary.rows.filter(row=>
  (!state.categoryKey||row.type+'|'+core.categoryKey(row.category)===state.categoryKey)&&
  (!term||core.fold([row.date,dateBR(row.date),row.description,row.bankDescription,
   row.category,row.account,row.file].join(' ')).includes(term))
 ).sort((a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id)));
}
function detailRows(summary){
 const root=el('details');if(!root)return;
 const rows=filteredDetails(summary);
 const totalPages=Math.max(1,Math.ceil(rows.length/state.detailLimit));
 state.detailPage=Math.max(0,Math.min(state.detailPage,totalPages-1));
 const page=rows.slice(state.detailPage*state.detailLimit,(state.detailPage+1)*state.detailLimit);
 root.innerHTML=page.length?page.map(r=>
  '<tr><td>'+safe(dateBR(r.date))+'</td>'+
   '<td><strong>'+safe(r.description)+'</strong>'+
    (r.bankDescription&&r.bankDescription!==r.description?'<small class="rg-cat-sub">No extrato: '+safe(r.bankDescription)+'</small>':'')+
    '</td><td>'+safe(r.category)+'</td>'+
   '<td>'+safe(r.account||'Caixa homologado')+'</td>'+
   '<td><span class="rg-cat-kind '+(r.type==='entrada'?'income':'expense')+'">'+
    (r.type==='entrada'?'Entrada':'Saída')+'</span></td>'+
   '<td class="money">'+(r.type==='saida'?'− ':'+ ')+money(r.value)+'</td></tr>'
 ).join(''):'<tr><td colspan="6" class="rg-cat-empty">Nenhuma movimentação corresponde à busca.</td></tr>';
 const pageInfo=el('pagination');
 if(pageInfo)pageInfo.textContent=count(rows.length)+' registro(s) · página '+(state.detailPage+1)+' de '+totalPages;
 if(el('prev'))el('prev').disabled=state.detailPage===0;
 if(el('next'))el('next').disabled=state.detailPage>=totalPages-1;
}
function approvedMatch(item){
 const approval=state.confirmations.get(item.bank.id);
 return approval?.situacao==='conferido'&&
  approval.movimento_homologado_id===item.official.id;
}
function unresolvedMatches(){
 return (state.combination?.weakMatches||[]).filter(item=>!approvedMatch(item));
}
function renderMatches(){
 const panel=$('rg-cat-match-panel'),counter=$('rg-cat-match-count'),body=$('rg-cat-match-rows');
 if(!panel||!counter||!body)return;
 const isCombined=filters().source==='combined';
 const matches=state.combination?.weakMatches||[];
 const pending=unresolvedMatches();
 panel.hidden=!isCombined;
 counter.textContent=pending.length+' pendente(s) · '+(matches.length-pending.length)+' conferida(s)';
 if(!isCombined)return;
 body.innerHTML=matches.length?matches.map((item,index)=>{
  const yes=approvedMatch(item),bank=item.bank,official=item.official;
  const approval=state.confirmations.get(bank.id),saving=state.savingMatch===bank.id;
  const stamp=yes&&approval?.confirmado_em?
   new Date(approval.confirmado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  const noteId='rg-cat-match-note-'+index;
  return '<tr data-match-line="'+safe(bank.id)+'">'+
   '<td><strong>'+safe(dateBR(bank.date))+'</strong><small class="rg-cat-sub">'+money(bank.value)+' · '+
    safe(bank.type==='entrada'?'Entrada':'Saída')+'</small></td>'+
   '<td><strong>'+safe(bank.bankDescription)+'</strong>'+
    '<small class="rg-cat-sub">Conta: '+safe(bank.account)+' · '+safe(bank.file||'Arquivo importado')+'</small></td>'+
   '<td><strong>'+safe(official.description)+'</strong>'+
    '<small class="rg-cat-sub">Categoria: '+safe(official.category)+'</small></td>'+
   '<td><span class="rg-cat-match-state '+(yes?'approved':'review')+'">'+
    (yes?'Conferido':'Pendente de conferência')+'</span>'+
    (yes?'<small class="rg-cat-sub">Aprovado em '+safe(stamp)+'</small>':'')+'</td>'+
   '<td><label for="'+noteId+'" class="rg-cat-match-note-label">Observação opcional</label>'+
    '<input id="'+noteId+'" data-match-note="'+safe(bank.id)+'" maxlength="500" placeholder="Ex.: confirmei no extrato" '+
     'value="'+safe(yes?(approval?.observacao||''):'')+'"'+(saving?' disabled':'')+'>'+
    '<button type="button" class="btn '+(yes?'':'btn-primary')+' rg-cat-match-action" '+
     'data-match-action="'+(yes?'reabrir':'confirmar')+'" data-match-line="'+safe(bank.id)+'" '+
     'data-match-official="'+safe(official.id)+'"'+(saving?' disabled':'')+'>'+
      (saving?'Salvando...':yes?'Reabrir conferência':'Confirmar correspondência')+
    '</button></td></tr>';
 }).join(''):'<tr><td colspan="5" class="rg-cat-empty">Nenhuma correspondência com descrição diferente neste fechamento.</td></tr>';
}
async function saveMatch(lineId,officialId,confirm){
 if(state.savingMatch||state.loading||!state.loaded)return;
 if(filters().source!=='combined')return;
 const match=(state.combination?.weakMatches||[]).find(item=>
  item.bank.id===lineId&&item.official.id===officialId);
 if(!match){setMatchStatus('A correspondência mudou. Atualize o relatório antes de confirmar.',true);return}
 const current=approvedMatch(match);
 if(confirm===current)return;
 const noteInput=Array.from($('rg-cat-match-rows')?.querySelectorAll?.('[data-match-note]')||[])
  .find(input=>input.dataset.matchNote===lineId);
 const observation=String(noteInput?.value||'').trim();
 if(observation.length>500){setMatchStatus('A observação deve ter no máximo 500 caracteres.',true);return}
 const prompt=confirm?
  'Você conferiu que as duas descrições representam a mesma movimentação de '+money(match.bank.value)+
  ' em '+dateBR(match.bank.date)+'? Esta confirmação não é uma baixa financeira.':
  'Reabrir a conferência desta correspondência? O histórico da aprovação será preservado.';
 if(typeof window.confirm==='function'&&!window.confirm(prompt))return;
 state.savingMatch=lineId;renderMatches();
 setMatchStatus(confirm?'Registrando conferência...':'Reabrindo conferência...');
 try{
  const {data,error}=await db.rpc('fin_conciliacao_correspondencia_confirmar',{
   p_linha_id:lineId,p_movimento_homologado_id:officialId,
   p_confirmar:confirm,p_observacao:observation||null
  });
  if(error)throw error;
  if(!data||data.linha_id!==lineId||data.movimento_homologado_id!==officialId||
   data.situacao!==(confirm?'conferido':'reaberto'))
   throw Error('O servidor não confirmou a atualização de conciliação.');
  state.savingMatch=null;
  await refresh();
  if(!state.loaded)throw Error('A gravação foi recebida, mas o relatório não pôde ser atualizado. Recarregue a página.');
  setMatchStatus(confirm?
   'Correspondência conferida e registrada. Nenhum pagamento, valor ou saldo foi alterado.':
   'Conferência reaberta. O histórico de aprovação foi preservado.');
 }catch(err){
  state.savingMatch=null;renderMatches();
  setMatchStatus('Falha na conferência: '+String(err.message||err),true);
 }
}
function setMatchStatus(text,bad=false){
 const el=$('rg-cat-match-status');
 if(!el)return;
 el.textContent=text;el.className='rg-cat-match-status'+(bad?' error':'');
}
function render(){
 if(!state.loaded||!core)return;
 const f=filters(),summary=grouped();
 const sourceSelect=el('account');
 if(sourceSelect)sourceSelect.disabled=f.source!=='imported';
 const accountWrap=$('rg-cat-account-wrap');
 if(accountWrap)accountWrap.hidden=f.source!=='imported';
 const labelledPeriod=f.month==='todos'?String(f.year):f.month+'/'+f.year;
 const pending=unresolvedMatches().length;
 const reviewed=(state.combination?.weakMatches.length||0)-pending;
 const reconciliation=$('rg-cat-combined-audit');
 if(reconciliation){
  const audit=state.combination;
  reconciliation.hidden=f.source!=='combined';
  if(f.source==='combined'&&audit){
   reconciliation.innerHTML=
    '<span><strong>'+count(audit.officialCount)+'</strong> homologados</span>'+
    '<span><strong>'+count(audit.addedCount)+'</strong> novos dos extratos</span>'+
    '<span><strong>'+count(audit.ignoredBeforeCutoff+audit.matchedOnCutoff+audit.repeatedInPDFs+audit.cancelledIgnored)+'</strong> não somados novamente</span>'+
    '<span class="'+(pending?'rg-cat-audit-attention':'')+'"><strong>'+
     count(pending)+'</strong> pendente(s) · '+count(reviewed)+' conferida(s)</span>';
  }else reconciliation.innerHTML='';
 }
 const audit=state.combination;
 const note=f.source==='combined'?
  'CONSOLIDADO: todo o caixa homologado até '+(audit?.cutoff||'sem fechamento')+
  ' + somente movimentações bancárias não repetidas após o corte. '+
  (audit?audit.addedCount+' nova(s); '+audit.ignoredBeforeCutoff+' anterior(es) ao corte não somada(s); '+
   audit.matchedOnCutoff+' correspondência(s) no dia do corte; '+
   audit.repeatedInPDFs+' repetição(ões) entre PDFs ignorada(s); '+
   audit.cancelledIgnored+' movimentação(ões) cancelada(s) excluída(s). ':'')+
  (pending?pending+' correspondência(s) por data, tipo e valor com descrição diferente exigem conferência. ': 
   reviewed?reviewed+' correspondência(s) com descrição diferente já conferida(s) manualmente. ':'')+
  'Movimentos coincidentes mantêm a categoria homologada. O resultado é uma prévia consolidada, não saldo bancário confirmado. '+
  'O filtro por conta fica indisponível porque a base homologada não informa a conta.':
  f.source==='official'?
   'CAIXA HOMOLOGADO: movimentações confirmadas da origem oficial, sem vínculo individual de conta bancária nesta base. '+
   'Os extratos importados não estão somados aqui.':
   'EXTRATOS IMPORTADOS: somente movimentações confirmadas provenientes dos arquivos bancários, sem cancelamentos. '+
   'Pode haver operações que também constam do histórico homologado. Nesta visão não são combinadas com o histórico oficial.';
 if(el('note'))el('note').textContent=note;
 if(el('kpis'))el('kpis').innerHTML=
  metric('Receitas',money(summary.incoming),count(summary.entries)+' entradas','income')+
  metric('Despesas',money(summary.outgoing),count(summary.exits)+' saídas','expense')+
  metric('Resultado do período',money(summary.net),'Receitas menos despesas',summary.net<0?'negative':'positive')+
  metric('A classificar',money(summary.pendingClassAmount),count(summary.pendingClass)+' linha(s) genérica(s) ou sem categoria','review');
 bars(el('inBars'),summary.inGroups,summary.incoming,'Nenhuma entrada nesta seleção.');
 bars(el('outBars'),summary.outGroups,summary.outgoing,'Nenhuma saída nesta seleção.');
 categoryOptions(summary);resultRows(summary);detailRows(summary);renderMatches();
 setStatus('Análise de '+labelledPeriod+' · '+count(summary.rows.length)+' movimento(s) · '+summary.allGroups.length+
  ' categoria(s) agrupada(s). '+(f.source==='combined'?
   'Consolidado em prévia: '+state.combination.addedCount+' movimentos bancários adicionais'+
   (pending?'; '+pending+' correspondência(s) exigem revisão.':'; correspondências conferidas.'):
   f.source==='official'?'Caixa homologado.':'Extratos importados, sem movimentos cancelados.'),
  f.source==='combined'&&pending>0);
}
async function refresh(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  setStatus('Consultando categorias e movimentações no Supabase...');
  if(!core||!consolidatedCore)throw Error('Motor de categorias ou conciliação indisponível. Recarregue a página.');
  if(typeof db==='undefined'||!db)throw Error('Sem conexão com o banco financeiro.');
  const access=await db.rpc('fluxo_caixa_autorizado');
  if(access.error||access.data!==true)throw Error('Acesso financeiro não autorizado.');
  const [official,files,confirmedMatches]=await Promise.all([
   all(()=>db.from('fin_movimentos').select('id,data_movimento,tipo,descricao,categoria,valor,estado,origem')
    .eq('estado','confirmado').eq('origem','fluxo_caixa_homologado').order('id')),
   all(()=>db.from('fin_teste_importacoes').select('id,tipo,conta_nome,arquivo_nome,criado_em')
    .eq('tipo','banco').order('id')),
   all(()=>db.from('fin_conciliacao_confirmacoes')
    .select('linha_id,movimento_homologado_id,situacao,confirmado_em,confirmado_por,observacao')
    .order('linha_id'))
  ]);
  const lines=[];
  for(let i=0;i<files.length;i+=30){
   const ids=files.slice(i,i+30).map(x=>x.id);
   if(!ids.length)break;
   const part=await all(()=>db.from('fin_teste_import_linhas').select(
    'id,importacao_id,movimento_id,fingerprint,data_lancamento,descricao,descricao_personalizada,categoria_personalizada,natureza,valor')
    .in('importacao_id',ids).order('id'));
   lines.push(...part);
  }
  const movements=[],movementIds=[...new Set(lines.map(x=>x.movimento_id).filter(Boolean))];
  for(let i=0;i<movementIds.length;i+=30){
   const ids=movementIds.slice(i,i+30);
   const part=await all(()=>db.from('fin_teste_movimentos')
    .select('id,data_movimento,tipo,descricao,categoria,valor,estado,referencia_cliente')
    .in('id',ids).order('id'));
   movements.push(...part);
  }
  // Somente após validar todas as fontes substituímos os dados exibidos.
  const a=core.sourceRowsOfficial(official),b=core.sourceRowsImported(files,lines,movements);
  const combination=consolidatedCore.combineSources(a,b);
  combination.cancelledIgnored=lines.length-b.length;
  state.official=a;state.imported=b;state.combined=combination.rows;state.combination=combination;
  state.confirmations=new Map(confirmedMatches.map(row=>[row.linha_id,row]));
  state.files=files;state.loaded=true;
  accountOptions();render();
 })().catch(err=>{
  state.loaded=false;state.official=[];state.imported=[];state.combined=[];state.combination=null;state.confirmations=new Map();state.files=[];
  const matchBody=$('rg-cat-match-rows');if(matchBody)matchBody.innerHTML='<tr><td colspan="5">Conciliação indisponível. Atualize o relatório.</td></tr>';
  for(const name of ['kpis','inBars','outBars','table','details']){
   const node=el(name);if(node)node.innerHTML='';
  }
  setStatus('Não foi possível validar as categorias: '+String(err.message||err),true);
 }).finally(()=>{state.loading=null});
 return state.loading;
}
function csvSafe(value){
 const str=String(value??'');
 return '"'+(/^\s*[=+\-@]/.test(str)?"'"+str:str).replace(/"/g,'""')+'"';
}
function exportCSV(kind){
 if(!state.loaded)return;
 const summary=grouped(),f=filters();
 const data=kind==='movements'?
  [['Data','Origem','Conta bancária','Tipo','Descrição','Descrição do banco','Categoria','Valor (R$)'],
   ...filteredDetails(summary).map(r=>[dateBR(r.date),r.source,r.account,r.type,r.description,
    r.bankDescription||r.description,r.category,(r.value/100).toFixed(2).replace('.',',')])]:
  [['Tipo','Categoria','Quantidade','Total (R$)','Participação','Média (R$)'],
   ...summary.allGroups.map(g=>[g.type,g.label,g.count,(g.value/100).toFixed(2).replace('.',','),
    percent(g.value,g.type==='entrada'?summary.incoming:summary.outgoing),
    (g.value/g.count/100).toFixed(2).replace('.',',')])];
 const content='\ufeff'+data.map(r=>r.map(csvSafe).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download='FR_Motors_categorias_'+(kind==='movements'?'movimentos_':'resumo_')+
  f.source+'_'+f.year+(f.month==='todos'?'':'_'+f.month)+'.csv';
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 if(!el('source'))return;
 el('source').addEventListener('change',()=>{state.detailPage=0;state.categoryKey='';render()});
 el('account')?.addEventListener('change',()=>{state.detailPage=0;state.categoryKey='';render()});
 for(const id of ['rg-year','rg-month'])$(id)?.addEventListener('change',()=>{
  state.detailPage=0;state.categoryKey='';render()
 });
 el('categoryFilter')?.addEventListener('change',e=>{
  state.categoryKey=e.target.value;state.detailPage=0;render()
 });
 el('search')?.addEventListener('input',e=>{
  state.detailSearch=e.target.value;state.detailPage=0;detailRows(grouped())
 });
 el('table')?.addEventListener('click',e=>{
  const button=e.target.closest('[data-rg-cat-key]');if(!button)return;
  state.categoryKey=button.dataset.rgCatKey;state.detailPage=0;render();
  $('rg-cat-details')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 });
 el('prev')?.addEventListener('click',()=>{state.detailPage--;detailRows(grouped())});
 el('next')?.addEventListener('click',()=>{state.detailPage++;detailRows(grouped())});
 $('rg-cat-reload')?.addEventListener('click',refresh);
 $('rg-cat-match-rows')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-match-action]');
  if(!button)return;
  saveMatch(button.dataset.matchLine,button.dataset.matchOfficial,
   button.dataset.matchAction==='confirmar');
 });
 $('rg-refresh')?.addEventListener('click',refresh);
 $('rg-cat-export-summary')?.addEventListener('click',()=>exportCSV('summary'));
 $('rg-cat-export-movements')?.addEventListener('click',()=>exportCSV('movements'));
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-view="reports"]'))refresh();
 });
 if(!document.querySelector('[data-view-panel="reports"]')?.hidden)refresh();
}
window.frCategoryReportUI={refresh,render,__test:{approvedMatch,unresolvedMatches,saveMatch}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
