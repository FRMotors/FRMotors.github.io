/* FR Motors | Carteira de Contas a Pagar operacional 2026.
   Origem: fin_contas_pagar. Pagamentos só via conciliação bancária já existente.
   Valor previsto e valor cheio confirmado são grandezas distintas. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateBR=date=>date?String(date).slice(0,10).split('-').reverse().join('/'):'Sem vencimento';
const today=()=>{
 const n=new Date();
 return [n.getFullYear(),String(n.getMonth()+1).padStart(2,'0'),String(n.getDate()).padStart(2,'0')].join('-');
};
const plusDays=(ymd,amount)=>{
 const d=new Date(ymd+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);
 return d.toISOString().slice(0,10);
};
const set=(id,text)=>{const e=$(id);if(e)e.textContent=text;};
const cents=x=>Math.round(Number(x)*100);
let all=[],suppliers=new Map(),cashLinks=new Map(),manualLinks=new Map(),page=0,busy=false,loading=null,editing=null;
const pageSize=25;
function stateOf(r,now){
 if(r.registro_tipo==='avulso'){
  const manual=manualLinks.get(r.id);
  if(manual)return manual.source==='extrato'?'conciliado':'conciliado_fluxo';
 }
 if(r.situacao==='conciliado_extrato')return 'conciliado';
 if(cashLinks.has(r.id))return 'conciliado_fluxo';
 if(!r.vencimento)return 'sem_data';
 if(r.vencimento<now)return 'vencido';
 if(r.vencimento===now)return 'hoje';
 return 'a_vencer';
}
function estimatedDiscount(r,now){
 if(r.registro_tipo==='avulso')return null;
 if(r.situacao!=='aberto'||cashLinks.has(r.id)||!r.vencimento||r.vencimento<now||!r.fornecedor_id)return null;
 const s=suppliers.get(r.fornecedor_id);
 if(!s||!s.desconto_ate_vencimento)return null;
 const pct=Number(s.desconto_atual_pct);
 if(!Number.isFinite(pct)||pct<=0||pct>=100)return null;
 const base=cents(r.valor_referencia),discount=Math.round(base*pct/100);
 return discount>0?{pct,discount,liquido:base-discount}:null;
}
function statusLabel(s){
 return {conciliado:'Conciliado no extrato',conciliado_fluxo:'Baixado no Fluxo',vencido:'Vencido',sem_data:'Sem vencimento',
  hoje:'Vence hoje',a_vencer:'A vencer'}[s]||s;
}
function filterRows(){
 const q=($('cp-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const filter=$('cp-status-filter')?.value||'todos';
 const month=$('cp-month-filter')?.value||'todos';
 const year=$('cp-year-filter')?.value||'todos';
 const now=today(),next7=plusDays(now,7);
 return all.filter(r=>{
  const s=stateOf(r,now);
  const accepted=filter==='todos'||(filter==='aberto'&&s!=='conciliado'&&s!=='conciliado_fluxo')||
    (filter==='proximos7'&&s!=='conciliado'&&s!=='conciliado_fluxo'&&r.vencimento&&r.vencimento>=now&&r.vencimento<=next7)||
    (filter==='conciliado'&&(s==='conciliado'||s==='conciliado_fluxo'))||filter===s;
  if(!accepted||(year!=='todos'&&r.vencimento?.slice(0,4)!==year)||
    (month!=='todos'&&r.vencimento?.slice(0,7)!==month))return false;
  const haystack=[r.fornecedor_nome,r.descricao,r.categoria,r.vencimento,r.linha_original,
   r.codigo_origem,r.observacoes].join(' ').toLocaleLowerCase('pt-BR');
  return haystack.includes(q);
 });
}
function updateYears(){
 const control=$('cp-year-filter');if(!control)return;
 const prev=control.value||'todos';
 const years=[...new Set(all.map(r=>r.vencimento?.slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
 control.replaceChildren(new Option('Todos os anos','todos'),...years.map(y=>new Option(y,y)));
 if(years.includes(prev))control.value=prev;
}
function updateMonths(){
 const control=$('cp-month-filter');
 if(!control)return;
 const existing=control.value||'todos';
 const year=$('cp-year-filter')?.value||'todos';
 const months=[...new Set(all.filter(r=>year==='todos'||r.vencimento?.slice(0,4)===year)
  .map(r=>r.vencimento?.slice(0,7)).filter(Boolean))].sort();
 control.replaceChildren(new Option('Todos os meses','todos'),...months.map(m=>{
  const [y,mm]=m.split('-');return new Option(mm+'/'+y,m);
 }));
 if(months.includes(existing))control.value=existing;
}
function draw(){
 const now=today(),next7=plusDays(now,7);
 const year=$('cp-year-filter')?.value||'todos';
 const scoped=all.filter(r=>year==='todos'||r.vencimento?.slice(0,4)===year);
 const open=scoped.filter(r=>!['conciliado','conciliado_fluxo'].includes(stateOf(r,now)));
 const reconciled=scoped.filter(r=>['conciliado','conciliado_fluxo'].includes(stateOf(r,now)));
 const overdue=open.filter(r=>r.vencimento&&r.vencimento<now);
 const next=open.filter(r=>r.vencimento&&r.vencimento>=now&&r.vencimento<=next7);
 const undated=open.filter(r=>!r.vencimento);
 set('cp-count',String(open.length));
 set('cp-total',money(open.reduce((a,r)=>a+cents(r.valor_referencia),0)/100));
 set('cp-overdue',money(overdue.reduce((a,r)=>a+cents(r.valor_referencia),0)/100));
 set('cp-soon',String(next.length));
 set('cp-undated',String(undated.length));
 set('cp-reconciled',String(reconciled.length));
 const rows=filterRows(),pageCount=Math.max(1,Math.ceil(rows.length/pageSize));
 page=Math.min(Math.max(0,page),pageCount-1);
 const visible=rows.slice(page*pageSize,(page+1)*pageSize);
 const tbody=$('cp-rows');
 if(tbody){
  tbody.innerHTML=visible.length?visible.map(r=>{
   const st=stateOf(r,now),possible=estimatedDiscount(r,now),cashLink=r.registro_tipo==='avulso'?manualLinks.get(r.id):cashLinks.get(r.id);
   const discount=cashLink?money(cashLink.desconto):r.desconto_efetivo!==null?money(r.desconto_efetivo):
    (possible?'<span class="cp-possible">'+money(possible.discount/100)+' <small>possível '+possible.pct+'%</small></span>':'—');
   const amount=cashLink?'<strong>'+money(cashLink.valor_pago)+'</strong><small>Pago em '+esc(dateBR(cashLink.data_pagamento))+'</small>':
    r.situacao==='conciliado_extrato'?
    '<strong>'+money(r.valor_pago)+'</strong><small>Pago em '+esc(dateBR(r.data_pagamento))+'</small>':
    (possible?'<span class="cp-possible">'+money(possible.liquido/100)+'<small>estimativa, não pago</small></span>':'—');
   const statusClass=['conciliado','conciliado_fluxo'].includes(st)?'paid':st==='vencido'?'overdue':'open';
   return '<tr>'+
    '<td><span class="row-main">'+esc(dateBR(r.vencimento))+'</span></td>'+
    '<td><span class="row-main">'+esc(r.fornecedor_nome)+'</span>'+
       (r.descricao!==r.fornecedor_nome?'<span class="row-sub">'+esc(r.descricao)+'</span>':'')+
       '<small class="cp-src">'+(r.registro_tipo==='avulso'?'Cadastrado no aplicativo':'Planilha · linha '+esc(r.linha_excel))+'</small></td>'+
    '<td>'+esc(r.categoria||'Não informada')+'</td>'+
    '<td class="money"><strong>'+money(r.valor_referencia)+'</strong></td>'+
    '<td class="money">'+(r.valor_cheio_informado===null?'—':money(r.valor_cheio_informado))+'</td>'+
    '<td class="money">'+discount+'</td>'+
    '<td class="money cp-value">'+amount+'</td>'+
    '<td><span class="state '+statusClass+'">'+esc(statusLabel(st))+'</span></td>'+
    '<td><div class="cp-actions">'+(r.registro_tipo==='avulso'?
      (cashLink?'—':'<button class="row-edit-button" type="button" data-cp-manual-edit="'+esc(r.id)+'">Editar</button>'+
       '<button class="row-edit-button" type="button" data-cp-manual-pay="'+esc(r.id)+'">Dar baixa</button>'):
      '<button class="row-edit-button" type="button" data-cp-edit="'+esc(r.id)+'">Editar</button>'+
      (r.situacao==='aberto'&&!cashLink?'<button class="row-edit-button" type="button" data-cp-reconcile="'+esc(r.id)+'">Dar baixa</button>':''))+
    '</div></td></tr>';
  }).join(''):
   '<tr><td colspan="9" class="empty">Nenhum compromisso corresponde aos filtros.</td></tr>';
 }
 set('cp-shown',rows.length+' de '+all.length+' compromisso(s) · página '+(page+1)+' de '+pageCount);
 if($('cp-prev'))$('cp-prev').disabled=page===0;
 if($('cp-next'))$('cp-next').disabled=page>=pageCount-1;
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  set('cp-load-status','Consultando a carteira operacional...');
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão indisponível.');
   const {data:autorizado,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||autorizado!==true)throw Error('Acesso financeiro não autorizado.');
   const [rows,manualRes,suppliersRes,linkedRes,manualFluxoRes,manualExtratoRes]=await Promise.all([
    db.from('fin_contas_pagar').select(
     'id,origem_chave,linha_origem_id,linha_excel,linha_original,codigo_origem,descricao,fornecedor_nome,fornecedor_id,categoria,vencimento,valor_referencia,valor_cheio_informado,desconto_efetivo,juros_efetivos,valor_pago,data_pagamento,situacao,observacoes'
    ).order('vencimento',{ascending:true,nullsFirst:false}).order('linha_excel',{ascending:true}).limit(500),
    db.from('fin_boletos_avulsos')
     .select('id,fornecedor_nome,descricao,categoria,vencimento,valor_referencia,criado_em')
     .is('excluido_em',null).order('criado_em',{ascending:false}).limit(500),
    db.from('fin_fornecedores').select('id,nome,desconto_atual_pct,desconto_ate_vencimento'),
    db.from('fin_baixas_operacionais').select('conta_pagar_id,valor_pago,desconto,juros,data_pagamento').not('conta_pagar_id','is',null),
    db.from('fin_baixas_operacionais').select('boleto_avulso_id,valor_pago,desconto,juros,data_pagamento')
     .not('boleto_avulso_id','is',null),
    db.from('fin_baixas_extrato_avulsos').select('boleto_avulso_id,valor_pago,desconto,juros,data_pagamento')
   ]);
   for(const result of [rows,manualRes,suppliersRes,linkedRes,manualFluxoRes,manualExtratoRes])if(result.error)throw result.error;
   if((rows.data||[]).length>=500||(manualRes.data||[]).length>=500)
    throw Error('Carteira maior que 500 contas por origem. Paginação do banco necessária.');
   const originals=(rows.data||[]).map(r=>({...r,registro_tipo:'planilha'}));
   const added=(manualRes.data||[]).map(r=>({...r,registro_tipo:'avulso',situacao:'aberto',
    valor_cheio_informado:null,desconto_efetivo:null,juros_efetivos:null,valor_pago:null,data_pagamento:null}));
   all=[...added,...originals];
   cashLinks=new Map((linkedRes.data||[]).map(x=>[x.conta_pagar_id,x]));
   manualLinks=new Map();
   (manualFluxoRes.data||[]).forEach(x=>manualLinks.set(x.boleto_avulso_id,{...x,source:'fluxo'}));
   (manualExtratoRes.data||[]).forEach(x=>manualLinks.set(x.boleto_avulso_id,{...x,source:'extrato'}));
   suppliers=new Map((suppliersRes.data||[]).map(x=>[x.id,x]));
   updateYears();updateMonths();draw();
   set('cp-load-status','Carteira operacional ativa: '+originals.length+' compromissos da planilha e '+
    added.length+' boletos cadastrados no aplicativo. Conciliações preservadas, sem criar saídas adicionais.');
  }catch(error){
   set('cp-load-status','Falha ao consultar contas a pagar: '+(error.message||error));
   if($('cp-rows'))$('cp-rows').innerHTML='<tr><td colspan="9" class="empty">Não foi possível consultar a carteira operacional.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function openEdit(id){
 const r=all.find(x=>x.id===id);if(!r)return;
 editing=id;
 set('cp-edit-title','Editar compromisso · '+r.fornecedor_nome);
 set('cp-edit-source','Origem: ABERTOS FLUXO, linha '+r.linha_excel+
  ' · valor da planilha '+money(r.valor_referencia)+
  (r.situacao==='conciliado_extrato'?' · conciliado no extrato por '+money(r.valor_pago):
   cashLinks.has(r.id)?' · baixado no Fluxo por '+money(cashLinks.get(r.id).valor_pago):''));
 $('cp-edit-date').value=r.vencimento||'';
 $('cp-edit-full').value=r.valor_cheio_informado===null?'':Number(r.valor_cheio_informado).toFixed(2);
 $('cp-edit-category').value=r.categoria||'';
 $('cp-edit-notes').value=r.observacoes||'';
 set('cp-edit-message','');
 const modal=$('cp-edit-dialog');
 if(modal?.showModal)modal.showModal();
 else modal?.setAttribute('open','');
}
async function saveEdit(event){
 event.preventDefault();
 if(busy||!editing)return;
 const id=editing,date=$('cp-edit-date').value||null;
 const fullRaw=$('cp-edit-full').value.trim(),full=fullRaw===''?null:Number(fullRaw);
 if(full!==null&&(!Number.isFinite(full)||full<=0||Math.abs(full*100-Math.round(full*100))>0.00001)){
  set('cp-edit-message','Informe um valor cheio válido, com no máximo duas casas decimais.');return;
 }
 busy=true;$('cp-save').disabled=true;
 try{
  const {error}=await db.rpc('fin_cp_editar',{
   p_id:id,p_vencimento:date,p_valor_cheio:full,
   p_categoria:$('cp-edit-category').value,p_observacoes:$('cp-edit-notes').value
  });
  if(error)throw error;
  $('cp-edit-dialog')?.close?.();editing=null;
  await refresh();
  set('cp-load-status','Alteração salva com auditoria, sem modificar a planilha original ou o caixa.');
 }catch(e){set('cp-edit-message','Não foi possível salvar: '+(e.message||e));}
 finally{busy=false;$('cp-save').disabled=false}
}
async function sync(){
 if(busy)return;
 busy=true;const btn=$('cp-sync');if(btn)btn.disabled=true;
 try{
  set('cp-load-status','Sincronizando conciliações validadas...');
  const {data,error}=await db.rpc('fin_cp_sincronizar_conciliacoes');
  if(error)throw error;
  await refresh();
  set('cp-load-status',(data?.novos_vinculos||0)+' nova(s) conciliação(ões) bancária(s) vinculada(s) à carteira. Nenhum pagamento duplicado.');
 }catch(e){set('cp-load-status','Falha na sincronização: '+(e.message||e));}
 finally{busy=false;if(btn)btn.disabled=false}
}
async function reconcile(id){
 const record=all.find(r=>r.id===id);
 if(record?.registro_tipo==='avulso'){
  if(manualLinks.has(id))return;
  if(!window.frBoletoUI?.openPay){set('cp-load-status','Atualize a página para abrir a baixa operacional.');return;}
  return window.frBoletoUI.openPay('avulso:'+id);
 }
 if(!record||record.situacao!=='aberto'||cashLinks.has(id))return;
 if(!window.frBoletoUI?.openPay){
  set('cp-load-status','Atualize a página para abrir a baixa operacional.');return;
 }
 try{await window.frBoletoUI.openPay('homologado:'+id)}
 catch(e){set('cp-load-status','Falha ao abrir baixa: '+(e.message||e))}
}

function init(){
 if(!$('cp-rows'))return;
 $('cp-search')?.addEventListener('input',()=>{page=0;draw()});
 $('cp-status-filter')?.addEventListener('change',()=>{page=0;if($('cp-status-filter').value==='sem_data'){$('cp-month-filter').value='todos';$('cp-year-filter').value='todos';}draw()});
 $('cp-year-filter')?.addEventListener('change',()=>{updateMonths();page=0;draw()});
 $('cp-month-filter')?.addEventListener('change',()=>{page=0;draw()});
 $('cp-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 $('cp-sync')?.addEventListener('click',()=>sync().catch(()=>{}));
 $('cp-prev')?.addEventListener('click',()=>{page--;draw()});
 $('cp-next')?.addEventListener('click',()=>{page++;draw()});
 $('cp-rows').addEventListener('click',ev=>{
  const e=ev.target.closest('[data-cp-edit]'),r=ev.target.closest('[data-cp-reconcile]');
  const m=ev.target.closest('[data-cp-manual-pay]');
  const editManual=ev.target.closest('[data-cp-manual-edit]');
  if(e)openEdit(e.dataset.cpEdit);
  else if(editManual)window.frBoletoUI?.openEdit?.(editManual.dataset.cpManualEdit);
  else if(r)reconcile(r.dataset.cpReconcile).catch(()=>{});
  else if(m)reconcile(m.dataset.cpManualPay).catch(()=>{});
 });
 $('cp-edit-form')?.addEventListener('submit',saveEdit);
 $('cp-edit-cancel')?.addEventListener('click',()=>$('cp-edit-dialog')?.close?.());
}
window.frOperationalPayablesUI={refresh,sync};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
