/* FR Motors | Lixeira de boletos | 2026-11-18
 * Arquivamento reversível e auditado, sem excluir registros financeiros.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateBR=x=>x?String(x).slice(0,10).split('-').reverse().join('/'):'Sem data';
const dateTime=x=>x?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(x)):'—';
const put=(id,value)=>{if($(id))$(id).textContent=value};
let archived=[],loading=null,busy=false,pending=null,kind='todos',search='',showAll=false;
async function allRows(builder,max=6000){
 const out=[],step=300;
 for(let i=0;i<max;i+=step){
  const {data,error}=await builder().range(i,i+step-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<step)return out;
 }
 throw Error('A consulta ultrapassou o limite seguro; atualize os filtros.');
}
function rows(){
 return archived.filter(r=>(kind==='todos'||r.kind===kind)&&
  [r.name,r.details,r.due,r.code,r.source].join(' ').toLocaleLowerCase('pt-BR').includes(search))
  .sort((a,b)=>String(b.archivedAt||'').localeCompare(String(a.archivedAt||'')));
}
function render(){
 const visible=rows(),view=showAll?visible:visible.slice(0,30);
 put('trash-count',String(archived.length));
 put('trash-count-detail',archived.filter(x=>x.kind==='importado').length+' da planilha · '+
   archived.filter(x=>x.kind==='manual').length+' do aplicativo');
 const body=$('trash-rows');if(!body)return;
 body.innerHTML=view.length?view.map(r=>'<tr>'+
  '<td><strong>'+esc(r.name)+'</strong><small class="trash-detail">'+esc(r.details||'')+'</small></td>'+
  '<td>'+esc(r.kind==='importado'?'Planilha homologada':'Cadastrado no site')+
   '<small class="trash-detail">'+esc(r.code||'')+'</small></td>'+
  '<td>'+esc(dateBR(r.due))+'</td><td class="money">'+money(r.value)+'</td>'+
  '<td>'+esc(dateTime(r.archivedAt))+'</td>'+
  '<td><button type="button" class="btn btn-teal" data-trash-restore="'+esc(r.kind)+':'+esc(r.id)+'">Restaurar</button></td>'+
  '</tr>').join(''):'<tr><td colspan="6" class="empty">Nenhum boleto na lixeira com os filtros selecionados.</td></tr>';
 if($('trash-more')){$('trash-more').hidden=visible.length<=30;$('trash-more').textContent=showAll?'Mostrar os 30 mais recentes':'Ver todos ('+visible.length+')'}
 put('trash-status',archived.length+' boleto(s) arquivado(s). A restauração devolve o compromisso ao calendário e às listas de pendentes, sem registrar pagamento.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão com o financeiro indisponível.');
  put('trash-status','Consultando boletos arquivados...');
  const {data:allowed,error:accessErr}=await db.rpc('fluxo_caixa_autorizado');
  if(accessErr||allowed!==true)throw Error('Acesso financeiro não autorizado.');
  const [old,manual]=await Promise.all([
   allRows(()=>db.from('fin_contas_pagar').select(
    'id,fornecedor_nome,descricao,codigo_origem,linha_excel,vencimento,valor_referencia,arquivado_em,situacao'
   ).not('arquivado_em','is',null).order('arquivado_em',{ascending:false})),
   allRows(()=>db.from('fin_boletos_avulsos').select(
    'id,fornecedor_nome,descricao,vencimento,valor_referencia,excluido_em'
   ).not('excluido_em','is',null).order('excluido_em',{ascending:false}))
  ]);
  archived=[
   ...old.map(x=>({id:x.id,kind:'importado',name:x.fornecedor_nome,details:x.descricao,
     code:x.codigo_origem||('Linha '+x.linha_excel),source:'planilha',due:x.vencimento,
     value:x.valor_referencia,archivedAt:x.arquivado_em,status:x.situacao})),
   ...manual.map(x=>({id:x.id,kind:'manual',name:x.fornecedor_nome,details:x.descricao,
     code:'',source:'site',due:x.vencimento,value:x.valor_referencia,archivedAt:x.excluido_em}))
  ];
  render();
 })().catch(e=>{
  archived=[];
  put('trash-count','—');
  put('trash-count-detail','Não foi possível consultar o histórico');
  if($('trash-rows'))$('trash-rows').innerHTML='<tr><td colspan="6" class="empty">Não foi possível consultar os boletos arquivados. Atualize para tentar novamente.</td></tr>';
  put('trash-status','Erro ao carregar a lixeira: '+(e.message||e));
 }).finally(()=>{loading=null});
 return loading;
}
function openDialog(){
 const dialog=$('trash-dialog');if(!dialog)return;
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
function closeDialog(){
 const dialog=$('trash-dialog');if(dialog?.open)dialog.close();else dialog?.removeAttribute('open');
}
async function archiveImported(id){
 if(busy)return;
 try{
  put('trash-status','Verificando boleto antes de mover para a lixeira...');
  const {data,error}=await db.from('fin_contas_pagar')
   .select('id,fornecedor_nome,descricao,vencimento,valor_referencia,situacao,arquivado_em')
   .eq('id',id).maybeSingle();
  if(error)throw error;
  if(!data||data.situacao!=='aberto'||data.arquivado_em)throw Error('Este boleto não está disponível para arquivamento.');
  pending={action:'archive',kind:'importado',id:data.id,name:data.fornecedor_nome,
   due:data.vencimento,value:data.valor_referencia};
  put('trash-dialog-title','Mover boleto para a lixeira?');
  put('trash-dialog-summary',data.fornecedor_nome+' · '+money(data.valor_referencia)+' · vencimento '+dateBR(data.vencimento)+
   (data.descricao?' · '+data.descricao:''));
  put('trash-dialog-note','O boleto sairá dos pendentes, do calendário e das projeções. A linha original da planilha ficará preservada. É possível restaurar depois.');
  put('trash-dialog-submit','Mover para lixeira');
  put('trash-dialog-feedback','');
  openDialog();
 }catch(e){
  put('trash-status','Não foi possível conferir o boleto: '+(e.message||e));
  window.frFinanceUI?.showToast?.('Falha ao abrir lixeira: '+(e.message||e),true);
 }
}
function restore(ref){
 if(busy)return;
 const at=ref.indexOf(':'),type=ref.slice(0,at),id=ref.slice(at+1);
 const record=archived.find(r=>r.id===id&&r.kind===type);
 if(!record)return;
 pending={action:'restore',kind:record.kind,id:record.id,
  name:record.name,due:record.due,value:record.value};
 put('trash-dialog-title','Restaurar boleto arquivado?');
 put('trash-dialog-summary',record.name+' · '+money(record.value)+' · vencimento '+dateBR(record.due));
 put('trash-dialog-note','O boleto voltará às contas a pagar e ao calendário, com o vencimento original. Nenhuma movimentação de caixa será criada.');
 put('trash-dialog-submit','Confirmar restauração');
 put('trash-dialog-feedback','');
 openDialog();
}
async function commit(event){
 event.preventDefault();
 if(busy||!pending)return;
 const r={...pending},button=$('trash-dialog-submit');
 busy=true;if(button)button.disabled=true;
 try{
  const fn=r.action==='archive'?'fin_conta_pagar_arquivar':
   r.kind==='importado'?'fin_conta_pagar_restaurar':'fin_boleto_avulso_restaurar';
  const arg=r.kind==='manual'?{p_boleto:r.id}:{p_conta:r.id};
  const {data,error}=await db.rpc(fn,arg);
  if(error)throw error;
  const expected=r.action==='archive'?'arquivado':'restaurado';
  if(!data||data.resultado!==expected)throw Error('O banco não confirmou a operação.');
  pending=null;closeDialog();
  const updates=await Promise.allSettled([
   refresh(),
   window.frOperationalPayablesUI?.refresh?.()||Promise.resolve(),
   window.frBoletoUI?.refresh?.()||Promise.resolve(),
   window.frOperationalUI?.refresh?.()||Promise.resolve(),
   window.frRealDashboard?.refresh?.()||Promise.resolve(),
   window.frDeadlinesUI?.refresh?.()||Promise.resolve(),
   window.frForecastUI?.refresh?.()||Promise.resolve(),
   window.frInvoicesAgendaUI?.refresh?.()||Promise.resolve()
  ]);
  const failed=updates.some(x=>x.status==='rejected');
  window.frFinanceUI?.showToast?.(
   expected==='arquivado'?'Boleto movido para a lixeira. Nenhum pagamento foi alterado.':
    'Boleto restaurado e devolvido à carteira de pendentes.'+
    (failed?' Atualize a página para sincronizar todas as listas.':''),failed);
 }catch(e){
  put('trash-dialog-feedback','Falha ao salvar: '+(e.message||e));
 }finally{busy=false;if(button)button.disabled=false}
}
function init(){
 if(!$('trash-rows'))return;
 $('trash-refresh')?.addEventListener('click',()=>refresh());
 $('trash-collapse')?.addEventListener('toggle',e=>{if(e.target.open)refresh()});
 $('trash-search')?.addEventListener('input',e=>{search=e.target.value.trim().toLocaleLowerCase('pt-BR');showAll=false;render()});
 $('trash-type')?.addEventListener('change',e=>{kind=e.target.value;showAll=false;render()});
 $('trash-more')?.addEventListener('click',()=>{showAll=!showAll;render()});
 $('trash-rows')?.addEventListener('click',e=>{const btn=e.target.closest('[data-trash-restore]');if(btn)restore(btn.dataset.trashRestore)});
 document.addEventListener('click',e=>{const btn=e.target.closest('[data-cp-archive]');if(btn)archiveImported(btn.dataset.cpArchive)});
 $('trash-dialog-form')?.addEventListener('submit',commit);
 $('trash-dialog-cancel')?.addEventListener('click',()=>{if(!busy){pending=null;closeDialog()}});
 $('trash-dialog-form')?.querySelector('[data-trash-cancel]')?.addEventListener('click',()=>{if(!busy){pending=null;closeDialog()}});
 document.querySelector('[data-trash-go]')?.addEventListener('click',()=>{
   const group=$('trash-collapse');if(group)group.open=true;
   (group||$('trash-panel'))?.scrollIntoView({behavior:'smooth',block:'start'});
   refresh();
 });
 $('trash-dialog')?.addEventListener('cancel',e=>{if(busy)e.preventDefault();else pending=null});
 $('trash-dialog')?.addEventListener('close',()=>{if(!busy)pending=null});
 if(!document.querySelector('[data-view-panel="payables"]')?.hidden)refresh();
}
window.frBoletoTrashUI={refresh,__test:{dateBR}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();