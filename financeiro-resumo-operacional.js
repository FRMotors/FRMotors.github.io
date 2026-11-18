/* FR Motors | Painel operacional consolidado (somente consulta)
 * Valores efetivamente movimentados: exclusivamente fin_movimentos homologados.
 * Contas e faturas são indicadores documentais INDEPENDENTES, nunca somados ao caixa.
 * A base de testes continua isolada nos widgets legados. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cents=n=>Math.round(Number(n||0)*100);
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const ymd=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const brDate=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Sem vencimento';
const brMonth=d=>d?String(d).slice(0,7).split('-').reverse().join('/'):'Mês não informado';
const put=(id,value)=>{const node=$(id);if(node)node.textContent=value};
const sourceMax=15000;
let moves=[],accounts=[],manualBills=[],accountLinks=[],manualCashLinks=[],manualBankLinks=[];
let invoices=[],declared=[],partials=[],integrals=[],agenda=[],fetching=null,hasData=false;
async function allRows(build,max=sourceMax){
 const result=[],size=450;
 for(let offset=0;offset<max;offset+=size){
  const {data,error}=await build().range(offset,offset+size-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<size)return result;
 }
 throw Error('A consulta excedeu '+max+' linhas. Não serão exibidos totais incompletos.');
}
function cashByMonth(){
 const groups=new Map();
 moves.forEach(m=>{
  const month=String(m.data_movimento||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))return;
  const r=groups.get(month)||{month,entradas:0,saidas:0,count:0};
  r[m.tipo==='entrada'?'entradas':'saidas']+=cents(m.valor);
  r.count++;
  groups.set(month,r);
 });
 return [...groups.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
function effectiveAccounts(){
 const linked=new Set(accountLinks.map(x=>x.conta_pagar_id).filter(Boolean));
 const paidManual=new Set([...accountLinks.map(x=>x.boleto_avulso_id),
  ...manualBankLinks.map(x=>x.boleto_avulso_id)].filter(Boolean));
 const active=accounts.filter(x=>x.situacao==='aberto'&&!linked.has(x.id))
  .map(x=>({...x,source:'planilha'}));
 const manual=manualBills.filter(x=>!x.excluido_em&&!paidManual.has(x.id))
  .map(x=>({...x,source:'avulso'}));
 return [...active,...manual];
}
function effectiveInvoices(){
 const declaration=new Set(declared.map(x=>x.fatura_id));
 const partMap=new Map();
 partials.forEach(p=>partMap.set(p.fatura_id,(partMap.get(p.fatura_id)||0)+cents(p.valor_pago)));
 const fullMap=new Map(integrals.filter(x=>x.fatura_id).map(x=>[x.fatura_id,cents(x.valor_conferido)]));
 const dueMap=new Map(agenda.map(x=>[x.fatura_id,x.vencimento]));
 return invoices.filter(x=>!declaration.has(x.id)).map(x=>{
  const total=cents(x.valor_documental),paid=fullMap.get(x.id)??partMap.get(x.id)??0;
  return {...x,total,paid,remaining:Math.max(0,total-paid),due:dueMap.get(x.id)||null};
 }).filter(x=>x.remaining>0).sort((a,b)=>
  a.mes_fatura.localeCompare(b.mes_fatura)||a.cartao_nome.localeCompare(b.cartao_nome,'pt-BR'));
}
function setupMonthOptions(){
 const el=$('real-cash-month');if(!el)return;
 const previous=el.value||'todos',available=cashByMonth();
 el.replaceChildren(new Option('Todo o histórico homologado','todos'),
  ...available.map(x=>new Option(brMonth(x.month),x.month)));
 if(available.some(x=>x.month===previous))el.value=previous;
}
function drawCash(){
 const selected=$('real-cash-month')?.value||'todos';
 const filtered=selected==='todos'?moves:moves.filter(m=>String(m.data_movimento||'').slice(0,7)===selected);
 const ins=filtered.filter(x=>x.tipo==='entrada').reduce((s,x)=>s+cents(x.valor),0);
 const outs=filtered.filter(x=>x.tipo==='saida').reduce((s,x)=>s+cents(x.valor),0);
 put('real-cash-in',brl(ins/100));
 put('real-cash-out',brl(outs/100));
 put('real-cash-net',brl((ins-outs)/100));
 put('real-cash-count',filtered.length+' movimentações homologadas neste período');
 const net=$('real-cash-net');if(net)net.classList.toggle('negative',ins<outs);
 const monthly=cashByMonth().slice(0,6);
 if($('real-month-rows'))$('real-month-rows').innerHTML=monthly.map(row=>
  '<tr><td>'+escape(brMonth(row.month))+'</td>'+
  '<td class="money">'+brl(row.entradas/100)+'</td>'+
  '<td class="money">'+brl(row.saidas/100)+'</td>'+
  '<td class="money">'+brl((row.entradas-row.saidas)/100)+'</td></tr>'
 ).join('')||'<tr><td colspan="4" class="empty">Nenhum movimento homologado.</td></tr>';
}
function drawBills(){
 const today=ymd();
 const active=effectiveAccounts(),overdue=active.filter(x=>x.vencimento&&x.vencimento<today);
 const soon=active.filter(x=>x.vencimento===today);
 const withoutDate=active.filter(x=>!x.vencimento);
 const total=active.reduce((s,x)=>s+cents(x.valor_referencia),0);
 put('real-bill-count',String(active.length));
 put('real-bill-value',brl(total/100));
 put('real-bill-overdue',String(overdue.length));
 put('real-bill-overdue-value',brl(overdue.reduce((s,x)=>s+cents(x.valor_referencia),0)/100));
 put('real-bill-soon',String(soon.length));
 put('real-bill-undated',String(withoutDate.length));
 const listed=active.filter(x=>x.vencimento).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)).slice(0,5);
 if($('real-bill-list'))$('real-bill-list').innerHTML=listed.length?listed.map(x=>{
  const status=x.vencimento<today?'Vencido':x.vencimento===today?'Vence hoje':'A vencer';
  return '<li><div><strong>'+escape(x.fornecedor_nome||x.descricao||'Fornecedor não informado')+
   '</strong><small>'+escape(brDate(x.vencimento))+' · '+status+'</small></div>'+
   '<b>'+brl(x.valor_referencia)+'</b></li>';
 }).join(''):'<li class="real-empty-line">Nenhuma conta com vencimento informado.</li>';
}
function drawCards(){
 const items=effectiveInvoices(),total=items.reduce((s,x)=>s+x.remaining,0);
 const noDate=items.filter(x=>!x.due),partial=items.filter(x=>x.paid>0);
 put('real-card-count',String(items.length));
 put('real-card-value',brl(total/100));
 put('real-card-declared',String(declared.length));
 put('real-card-undated',String(noDate.length));
 put('real-card-partial',String(partial.length));
 if($('real-card-list'))$('real-card-list').innerHTML=items.length?items.map(f=>
  '<li><div><strong>'+escape(f.cartao_nome)+' · '+escape(brMonth(f.mes_fatura))+'</strong>'+
  '<small>'+escape(f.paid>0?'Parcialmente paga':'Sem pagamento vinculado')+
  ' · '+escape(f.due?'Vencimento: '+brDate(f.due):'Vencimento não informado')+'</small></div>'+
  '<b>'+brl(f.remaining/100)+'</b></li>'
 ).join(''):'<li class="real-empty-line">Todas as faturas estão quitadas ou declaradas quitadas.</li>';
}
function draw(){
 if(!hasData)return;
 setupMonthOptions();
 drawCash();drawBills();drawCards();
 const first=moves.map(x=>x.data_movimento).filter(Boolean).sort()[0];
 const last=moves.map(x=>x.data_movimento).filter(Boolean).sort().at(-1);
 put('real-status','Base homologada: '+moves.length+' movimentos'+
   (first&&last?' de '+brDate(first)+' a '+brDate(last):'')+
   '. Contas e faturas são compromissos documentais separados. Valores não são somados ao caixa.');
}
async function refresh(){
 if(fetching)return fetching;
 fetching=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Supabase não disponível.');
   put('real-status','Consultando a base financeira homologada...');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   const [mv,cp,av,links,bLinks,fs,ds,pp,ip,agendaRows]=await Promise.all([
    allRows(()=>db.from('fin_movimentos').select('id,data_movimento,tipo,estado,origem,valor')
     .eq('origem','fluxo_caixa_homologado').eq('estado','confirmado')
     .order('data_movimento',{ascending:false}).order('id',{ascending:false})),
    allRows(()=>db.from('fin_contas_pagar').select('id,fornecedor_nome,descricao,situacao,vencimento,valor_referencia')
     .order('id',{ascending:true})),
    allRows(()=>db.from('fin_boletos_avulsos').select('id,fornecedor_nome,descricao,vencimento,valor_referencia,excluido_em')
     .is('excluido_em',null).order('criado_em',{ascending:false})),
    allRows(()=>db.from('fin_baixas_operacionais').select('conta_pagar_id,boleto_avulso_id')
     .order('criado_em',{ascending:false})),
    allRows(()=>db.from('fin_baixas_extrato_avulsos').select('boleto_avulso_id')
     .order('criado_em',{ascending:false})),
    allRows(()=>db.from('fin_faturas_historicas').select('id,cartao_nome,mes_fatura,valor_documental')
     .order('mes_fatura',{ascending:false})),
    allRows(()=>db.from('fin_faturas_quitacoes_declaradas').select('fatura_id')
     .order('registrado_em',{ascending:false})),
    allRows(()=>db.from('fin_faturas_pagamentos_parciais').select('fatura_id,valor_pago')
     .order('confirmado_em',{ascending:false})),
    allRows(()=>db.from('fin_comprovacoes_documentais').select('fatura_id,valor_conferido')
     .not('fatura_id','is',null).order('conferido_em',{ascending:false})),
    allRows(()=>db.from('fin_faturas_agenda').select('fatura_id,vencimento')
     .order('registrado_em',{ascending:false}))
   ]);
   moves=mv;accounts=cp;manualBills=av;accountLinks=links;manualBankLinks=bLinks;
   invoices=fs;declared=ds;partials=pp;integrals=ip;agenda=agendaRows;
   hasData=true;draw();
  }catch(e){
   put('real-status','Não foi possível carregar os dados homologados: '+(e.message||e)+
    '. Os indicadores antigos abaixo continuam pertencendo ao ambiente de testes.');
  }
 })();
 try{await fetching}finally{fetching=null}
}
function setup(){
 if(!$('real-dashboard'))return;
 $('real-cash-month')?.addEventListener('change',drawCash);
 $('real-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(!document.querySelector('[data-view-panel="overview"]')?.hidden)refresh().catch(()=>{});
}
window.frRealDashboard={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();