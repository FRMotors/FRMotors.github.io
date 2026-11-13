/* FR Motors Financeiro · enterprise UI controller. Somente dados fin_teste_*. */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateBR=v=>{if(!v)return '—';const p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'—'};
const iconPaths={
 dashboard:'<rect x="3" y="3" width="7" height="8" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="15" width="7" height="6" rx="1.2"/>',
 activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
 receipt:'<path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2V3z"/><path d="M9 8h6M9 12h6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 credit:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/>',
 settings:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19 13.3a7 7 0 0 0 0-2.6l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.3-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.3 1.3L5 5.8 3 9.2l2 1.5a7 7 0 0 0 0 2.6L3 14.8l2 3.4 2.3-.9a7 7 0 0 0 2.3 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.3-1.3l2.3.9 2-3.4-2-1.5Z"/>',
 bolt:'<path d="M13 2 4 13h7l-1 9 10-12h-7l0-8Z"/>',
 chart:'<path d="M3 3v18h18"/><rect x="7" y="13" width="3" height="5" rx=".5"/><rect x="12" y="9" width="3" height="9" rx=".5"/><rect x="17" y="5" width="3" height="13" rx=".5"/>',
 arrowup:'<path d="M12 19V5M5 12l7-7 7 7"/>',
 arrowdown:'<path d="M12 5v14M5 12l7 7 7-7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 search:'<circle cx="10.8" cy="10.8" r="7.8"/><path d="m17 17 4 4"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14-5L4 8M4 3v5h5M4 13a8 8 0 0 0 14 5l2-2M15 16h5v5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 shield:'<path d="M12 22s9-4 9-11V5l-9-3-9 3v6c0 7 9 11 9 11Z"/><path d="m9 12 2 2 4-4"/>',
 bank:'<path d="m3 9 9-6 9 6M4 10h16M6 11v8M10 11v8M14 11v8M18 11v8M3 21h18"/>',
 alert:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
 wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M4 10h17M7 3h12"/><path d="M16 15h2"/>',
 file:'<path d="M6 2h8l5 5v15H6V2Z"/><path d="M14 2v6h5M9 13h7M9 17h7"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 arrowright:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
};
function svg(name){return '<svg aria-hidden="true" viewBox="0 0 24 24">'+(iconPaths[name]||iconPaths.file)+'</svg>'}
function applyIcons(root=document){root.querySelectorAll('[data-icon]').forEach(n=>{const name=n.getAttribute('data-icon');if(name in iconPaths)n.innerHTML=svg(name)})}
const state={moves:[],dues:[],purchases:[],suppliers:[]};
let view='overview';
function selectView(next){
 if(!['overview','movements','payables','purchases','settings'].includes(next))next='overview';
 view=next;
 document.querySelectorAll('[data-view-panel]').forEach(n=>{n.hidden=n.getAttribute('data-view-panel')!==next});
 document.querySelectorAll('[data-view]').forEach(n=>{
  const active=n.getAttribute('data-view')===next;
  n.classList.toggle('active',active);
  if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');
 });
 const names={overview:'Visão geral',movements:'Movimentações',payables:'Contas a pagar',purchases:'Compras',settings:'Configurações'};
 if(byId('crumb-page'))byId('crumb-page').textContent=names[next];
 document.title=names[next]+' | Financeiro FR Motors';
 closeSidebar();
 window.scrollTo({top:0,behavior:'auto'});
}
function closeSidebar(){document.body.classList.remove('sidebar-open');byId('sidebar-overlay')?.setAttribute('hidden','');byId('menu-toggle')?.setAttribute('aria-expanded','false')}
function openSidebar(){document.body.classList.add('sidebar-open');byId('sidebar-overlay')?.removeAttribute('hidden');byId('menu-toggle')?.setAttribute('aria-expanded','true')}
function openModal(name){
 const dlg=byId('modal-'+name);
 if(dlg?.showModal){dlg.showModal();dlg.querySelector('input:not([readonly]),select,button')?.focus()}
 else showToast('O navegador não permite abrir esta janela.',true);
}
function closeModal(name){const dlg=byId('modal-'+name);if(dlg?.open)dlg.close()}
function showToast(message,error=false){
 const root=byId('toast-area');if(!root)return;
 const el=document.createElement('div');el.className='toast'+(error?' toast-error':'');
 el.setAttribute('role','status');el.textContent=message;root.append(el);
 setTimeout(()=>el.remove(),4300);
}
function supplierName(id){
 return state.suppliers.find(x=>x.id===id)?.nome||'Não informado';
}
function emptyMessage(title,sub,iconName='receipt'){
 return '<div class="empty-state"><span class="icon">'+svg(iconName)+'</span><strong>'+escapeHTML(title)+'</strong><p>'+escapeHTML(sub)+'</p></div>';
}
function statusChip(type,date,other){
 if(type==='entrada')return '<span class="state in">Entrada</span>';
 if(type==='saida')return '<span class="state out">Saída</span>';
 if(type==='pago')return '<span class="state paid">Pago</span>';
 if(type==='aberto'&&date&&date<todayLocal())return '<span class="state overdue">Vencido</span>';
 if(type==='aberto')return '<span class="state open">Em aberto</span>';
 return '<span class="state">'+escapeHTML(type||other||'Pendente')+'</span>';
}
function datesMonth(ym){const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m-1,1));}
function monthString(d){return d.toISOString().slice(0,7)}
function chartMonths(){
 const max=byId('to')?.value||todayLocal();const anchor=datesMonth(max.slice(0,7));
 return Array.from({length:6},(_,i)=>{const d=new Date(anchor);d.setUTCMonth(d.getUTCMonth()-(5-i));return {ym:monthString(d),label:new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(d).replace('.','')};});
}
function updateChart(){
 const months=chartMonths(),rows=state.moves.filter(x=>x.estado==='confirmado'),bucket=new Map(months.map(m=>[m.ym,{in:0,out:0}]));
 rows.forEach(r=>{const m=r.data_movimento?.slice(0,7);if(bucket.has(m))bucket.get(m)[r.tipo==='entrada'?'in':'out']+=Number(r.valor)});
 const vals=months.map(m=>bucket.get(m.ym)),max=Math.max(1,...vals.flatMap(v=>[v.in,v.out]));
 const el=byId('cash-chart');if(!el)return;
 if(!rows.length){el.innerHTML=emptyMessage('Gráfico aguardando dados','Os valores aparecerão quando forem criadas movimentações de teste.','chart');return}
 el.innerHTML='<div class="chart-plot">'+months.map((m,i)=>{
  const v=vals[i],a=v.in?Math.max(3,Math.round(v.in/max*100)):0,b=v.out?Math.max(3,Math.round(v.out/max*100)):0;
  return '<div class="chart-group"><div class="chart-bars"><div class="chart-bar" style="height:'+a+'%" title="'+escapeHTML(m.label+' • Entradas '+currency(v.in))+'"></div><div class="chart-bar out" style="height:'+b+'%" title="'+escapeHTML(m.label+' • Saídas '+currency(v.out))+'"></div></div><div class="chart-month">'+escapeHTML(m.label)+'</div></div>'
 }).join('')+'</div>';
}
function filteredMoves(){
 const query=(byId('search-moves')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const type=byId('type-filter')?.value||'all';
 return state.moves.filter(x=>{
  if(type!=='all'&&x.tipo!==type)return false;
  const text=[x.descricao,x.categoria,supplierName(x.fornecedor_id),x.data_movimento].join(' ').toLocaleLowerCase('pt-BR');
  return text.includes(query);
 });
}
function movementsHTML(rows,showAll=false){
 if(!rows.length)return '<tr><td colspan="6">'+emptyMessage('Nenhum lançamento encontrado','Experimente alterar os filtros ou cadastrar uma movimentação.','activity')+'</td></tr>';
 return rows.map(r=>'<tr>'+
  '<td><span class="row-main">'+escapeHTML(dateBR(r.data_movimento))+'</span><span class="row-sub">'+escapeHTML(r.meio_pagamento||r.categoria||'Lançamento')+'</span></td>'+
  '<td><span class="row-main">'+escapeHTML(r.descricao)+'</span><span class="row-sub">'+escapeHTML(r.categoria||'Sem categoria')+'</span></td>'+
  '<td>'+statusChip(r.tipo)+'</td>'+
  '<td>'+escapeHTML(supplierName(r.fornecedor_id))+'</td>'+
  '<td class="money" style="color:'+(r.tipo==='entrada'?'#188369':'#344c5b')+'">'+(r.tipo==='entrada'?'+ ':'− ')+currency(r.valor)+'</td>'+
 '<td class="edit-cell"><button type="button" class="row-edit-button" data-edit-record="movimento" data-edit-id="'+escapeHTML(r.id)+'">Editar</button></td>'+
 '</tr>').join('');
}
function updateMoves(){
 const rows=filteredMoves();
 if(byId('rows'))byId('rows').innerHTML=movementsHTML(rows);
 if(byId('recent-rows'))byId('recent-rows').innerHTML=movementsHTML(state.moves.slice(0,6));
 if(byId('moves-count'))byId('moves-count').textContent=rows.length+' lançamento(s) exibidos';
 if(byId('recent-count'))byId('recent-count').textContent=Math.min(6,state.moves.length)+' lançamento(s) recente(s)';
}
function updateDue(){
 const query=(byId('search-dues')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const filtered=state.dues.filter(x=>[supplierName(x.fin_teste_compras?.fornecedor_id),x.fin_teste_compras?.descricao,x.vencimento].join(' ').toLocaleLowerCase('pt-BR').includes(query));
 const today=todayLocal();
 if(byId('due'))byId('due').innerHTML=filtered.length?filtered.map(x=>{
  const supplier=supplierName(x.fin_teste_compras?.fornecedor_id);
  return '<tr><td><span class="row-main">'+escapeHTML(dateBR(x.vencimento))+'</span></td>'+
   '<td><span class="row-main">'+escapeHTML(supplier)+'</span><span class="row-sub">'+escapeHTML(x.fin_teste_compras?.descricao||'Compra de autopeças')+'</span></td>'+
   '<td>Parcela '+escapeHTML(x.numero)+'</td><td class="money">'+currency(x.valor_cheio)+'</td>'+
   '<td>'+statusChip(x.status,x.vencimento)+'</td>'+
   '<td style="text-align:right"><div class="table-actions"><button type="button" class="row-edit-button" data-edit-record="compra" data-edit-id="'+escapeHTML(x.fin_teste_compras?.id||'')+'">Editar</button><button type="button" class="muted-action" data-pay-id="'+escapeHTML(x.id)+'">Baixar</button></div></td></tr>';
 }).join(''):'<tr><td colspan="6">'+emptyMessage('Nenhuma parcela em aberto','Cadastre uma compra para criar os próximos compromissos.','calendar')+'</td></tr>';
 const upcoming=state.dues.slice(0,5);
 if(byId('upcoming-list'))byId('upcoming-list').innerHTML=upcoming.length?upcoming.map(x=>{
  const m=x.vencimento?.slice(5,7),day=x.vencimento?.slice(8,10);
  const label=new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(new Date(x.vencimento+'T12:00:00Z')).replace('.','');
  return '<div class="upcoming-row"><div class="upcoming-date"><strong>'+escapeHTML(day)+'</strong><small>'+escapeHTML(label||m)+'</small></div>'+
   '<div class="upcoming-info"><strong>'+escapeHTML(supplierName(x.fin_teste_compras?.fornecedor_id))+'</strong><span>'+escapeHTML(x.fin_teste_compras?.descricao||'Parcela '+x.numero)+'</span></div>'+
   '<div class="upcoming-amount">'+currency(x.valor_cheio)+'</div></div>';
 }).join(''):emptyMessage('Nenhum vencimento','As parcelas cadastradas aparecerão aqui.','calendar');
 if(byId('dues-count'))byId('dues-count').textContent=filtered.length+' parcela(s)';
 const overdue=state.dues.filter(x=>x.vencimento<today);
 const in7=new Date(today+'T12:00:00Z');in7.setUTCDate(in7.getUTCDate()+7);
 const seven=in7.toISOString().slice(0,10);
 const soon=state.dues.filter(x=>x.vencimento>=today&&x.vencimento<=seven);
 const total=state.dues.reduce((sum,x)=>sum+Number(x.valor_cheio),0);
 if(byId('pending-value'))byId('pending-value').textContent=currency(total);
 if(byId('overdue-value'))byId('overdue-value').textContent=currency(overdue.reduce((s,x)=>s+Number(x.valor_cheio),0));
 if(byId('soon-count'))byId('soon-count').textContent=String(soon.length);
 if(byId('due-kpi-foot'))byId('due-kpi-foot').textContent=overdue.length?overdue.length+' parcela(s) vencida(s)':'Nenhum atraso registrado';
}
function purchasesHTML(rows){
 if(!rows.length)return '<tr><td colspan="6">'+emptyMessage('Nenhuma compra cadastrada','Registre uma compra para acompanhar fornecedores e parcelas.','receipt')+'</td></tr>';
 return rows.map(x=>{
 const parts=x.fin_teste_parcelas||[];
 const allPaid=parts.length>0&&parts.every(p=>p.status==='pago');
 const anyPaid=parts.some(p=>p.status==='pago');
 const badge=allPaid?statusChip('pago'):anyPaid?'<span class="state open">Parcial</span>':statusChip('aberto');
 return '<tr><td><span class="row-main">'+escapeHTML(dateBR(x.data_compra))+'</span></td>'+
 '<td><span class="row-main">'+escapeHTML(x.descricao||'Compra sem descrição')+'</span><span class="row-sub">'+escapeHTML(x.forma_pagamento||'')+'</span></td>'+
 '<td>'+escapeHTML(supplierName(x.fornecedor_id))+'</td>'+
 '<td class="money">'+currency(x.valor_total)+'</td>'+
 '<td>'+badge+'</td><td class="edit-cell"><button type="button" class="row-edit-button" data-edit-record="compra" data-edit-id="'+escapeHTML(x.id)+'">Editar</button></td></tr>'; }).join('');
}
function updatePurchases(){
 const q=(byId('search-purchases')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const rows=state.purchases.filter(x=>[x.descricao,supplierName(x.fornecedor_id),x.data_compra].join(' ').toLocaleLowerCase('pt-BR').includes(q));
 if(byId('purchases-rows'))byId('purchases-rows').innerHTML=purchasesHTML(rows);
 if(byId('purchase-count'))byId('purchase-count').textContent=rows.length+' compra(s) exibida(s)';
}
function csvEscape(v){const s=String(v??'');return '"'+s.replace(/"/g,'""')+'"'}
function exportMovements(){
 const rows=filteredMoves();
 const cols=[['Data','Tipo','Descrição','Categoria','Fornecedor','Valor (R$)']].concat(rows.map(x=>[x.data_movimento,x.tipo,x.descricao,x.categoria||'',supplierName(x.fornecedor_id),Number(x.valor).toFixed(2).replace('.',',')]));
 const csv='\ufeff'+cols.map(row=>row.map(csvEscape).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download='fr-motors-financeiro-testes.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
 showToast('Exportação de testes preparada.');
}
function sync(payload){
 state.moves=payload.moves||[];state.dues=payload.dues||[];state.purchases=payload.purchases||[];state.suppliers=payload.suppliers||[];
 updateChart();updateMoves();updateDue();updatePurchases();
 const net=state.moves.reduce((v,x)=>v+(x.estado==='confirmado'?(x.tipo==='entrada'?Number(x.valor):-Number(x.valor)):0),0);
 if(byId('k-net'))byId('k-net').style.color=net<0?'var(--bad)':net>0?'var(--good)':'var(--ink)';
 if(byId('last-refresh'))byId('last-refresh').textContent='Atualizado '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
 const card=byId('last-record');if(card)card.textContent='Base isolada • '+(state.moves.length+state.purchases.length)+' registros recentes';
}
function afterSaved(kind){
 const dlg=kind==='purchase'?'purchase':kind==='pay'?'pay':'move';
 closeModal(dlg);
 showToast(kind==='purchase'?'Compra e parcelas salvas.':kind==='pay'?'Pagamento confirmado na base de testes.':'Movimentação salva na base de testes.');
}
function changePeriod(name){
 const end=todayLocal();let start;
 if(name==='month')start=end.slice(0,7)+'-01';
 else if(name==='quarter'){const d=new Date(end+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-2);start=d.toISOString().slice(0,7)+'-01'}
 else start=end.slice(0,4)+'-01-01';
 byId('from').value=start;byId('to').value=end;
 document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x.dataset.period===name));
 if(typeof render==='function')render().catch(e=>showToast(e.message,true));
}
function setup(){
 applyIcons();
 document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>selectView(btn.dataset.view)));
 document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openModal(btn.dataset.open)));
 document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.closeModal)));
 document.querySelectorAll('[data-period]').forEach(btn=>btn.addEventListener('click',()=>changePeriod(btn.dataset.period)));
 byId('menu-toggle')?.addEventListener('click',()=>{document.body.classList.contains('sidebar-open')?closeSidebar():openSidebar()});
 byId('sidebar-overlay')?.addEventListener('click',closeSidebar);
 document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
 byId('search-moves')?.addEventListener('input',updateMoves);
 byId('type-filter')?.addEventListener('change',updateMoves);
 byId('search-dues')?.addEventListener('input',updateDue);
 byId('search-purchases')?.addEventListener('input',updatePurchases);
 byId('export-moves')?.addEventListener('click',exportMovements);
 byId('refresh-data')?.addEventListener('click',()=>{if(typeof render==='function')render().then(()=>showToast('Dados atualizados.')).catch(e=>showToast('Erro ao atualizar: '+e.message,true))});
 document.addEventListener('click',e=>{
  const p=e.target.closest('[data-pay-id]');
  if(p){selectView('payables');openModal('pay');if(byId('pay-installment'))byId('pay-installment').value=p.dataset.payId;if(typeof refreshPaymentSuggestion==='function')refreshPaymentSuggestion()}
 });
 selectView('overview');
}
window.frFinanceUI={sync,afterSaved,showToast,selectView,openModal,closeModal,applyIcons,getSnapshot:()=>({moves:state.moves,purchases:state.purchases,dues:state.dues,suppliers:state.suppliers})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
