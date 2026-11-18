/* FR Motors | Central de Atividades Financeiras
 * Leitura auditada: exibe somente eventos existentes, sem inferir ações não registradas.
 * Fontes protegidas por RLS + fluxo_caixa_autorizado. Não grava no banco.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>String(value??'').trim();
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const num=value=>{if(value===null||value===undefined||value==='')return null;const v=Number(value);return Number.isFinite(v)?v:null};
const put=(id,value)=>{const e=$(id);if(e)e.textContent=String(value)};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const val=(x,key)=>obj(x)[key]??null;
const label=x=>text(x)||'Não informado';
const cap=(x,n=95)=>text(x).slice(0,n);
const htmlDate=x=>{const raw=String(x||'').replace(' ','T').replace(/([+-]\d{2})$/,'$1:00');const d=new Date(raw);return Number.isFinite(+d)?d:null};
const dtFmt=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const isoDateParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
function localDate(x){const d=htmlDate(x);if(!d)return '';const p=isoDateParts.formatToParts(d);const f=k=>p.find(v=>v.type===k)?.value||'';return f('year')+'-'+f('month')+'-'+f('day')}
function atTime(x){const d=htmlDate(x);return d?dtFmt.format(d):'Data indisponível'}
function person(x){return x?'Usuário #'+text(x).slice(0,8):'Autor não identificado'}
function beforeAfter(a,b,key,labelText){
 const before=val(a,key),after=val(b,key);
 if(before===after||String(before??'')===String(after??''))return null;
 return labelText+': '+label(before)+' → '+label(after);
}
const SOURCES=[
 {key:'site',table:'fin_site_auditoria',date:'criado_em',cols:'id,registro_id,entidade,acao,antes,depois,usuario_id,criado_em'},
 {key:'receivables',table:'fin_receber_auditoria',date:'criado_em',cols:'id,registro_id,entidade,acao,antes,depois,usuario_id,criado_em'},
 {key:'payables',table:'fin_contas_pagar_auditoria',date:'alterado_em',cols:'id,compromisso_id,operador,antes,depois,alterado_em'},
 {key:'manualEdits',table:'fin_boletos_avulsos_edicoes',date:'alterado_em',cols:'id,boleto_avulso_id,antes,depois,alterado_por,alterado_em'},
 {key:'manualTrash',table:'fin_boletos_avulsos_exclusoes',date:'excluido_em',cols:'id,boleto_avulso_id,dados_antes,excluido_por,excluido_em'},
 {key:'invoicePayments',table:'fin_faturas_pagamentos_parciais',date:'confirmado_em',cols:'id,fatura_id,origem,valor_pago,data_pagamento,justificativa,conta_origem_externa,confirmado_por,confirmado_em'},
 {key:'operationalPayments',table:'fin_baixas_operacionais',date:'criado_em',cols:'id,conta_pagar_id,boleto_avulso_id,valor_pago,data_pagamento,operador,criado_em'},
 {key:'invoiceDue',table:'fin_faturas_agenda_auditoria',date:'alterado_em',cols:'id,agenda_id,antes,depois,alterado_por,alterado_em'},
 {key:'imports',table:'fin_teste_import_auditoria',date:'criado_em',cols:'id,tipo,registro_id,operacao,antes,depois,operador,criado_em'}
];
const TYPES={boletos:'Contas a pagar',receber:'Contas a receber',faturas:'Cartões e faturas',movimentos:'Movimentações',importacoes:'Importações'};
const VIEWS={boletos:'payables',receber:'receivables',faturas:'cardbills',movimentos:'movements',importacoes:'imports'};
let all=[],invoiceMap=new Map(),loading=null,ready=false,sourceStatus='',type='todos',query='',start='',end='',page=0;
const PAGE_SIZE=25;
async function getAll(builder,max=6000){
 const out=[],size=350;
 for(let i=0;i<max;i+=size){
  const {data,error}=await builder().range(i,i+size-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<size)return out;
 }
 throw Error('O histórico excedeu o limite seguro da consulta. Não serão apresentados resultados parciais.');
}
function makeEvent(id,time,kind,title,subject,details,amount,actor,source){
 return {id:String(id),time:String(time||''),day:localDate(time),kind,title,subject:cap(subject,150),
  details:cap(details,300),amount:num(amount),actor:person(actor),source};
}
function diff(a,b,fields){
 const lines=fields.map(([key,name])=>beforeAfter(a,b,key,name)).filter(Boolean);
 return lines.join(' · ');
}
function payableAction(a,b){
 if(!val(a,'arquivado_em')&&val(b,'arquivado_em'))return 'Boleto arquivado';
 if(val(a,'arquivado_em')&&!val(b,'arquivado_em'))return 'Boleto restaurado';
 if(val(a,'situacao')!==val(b,'situacao')&&val(b,'situacao')==='pago')return 'Boleto quitado';
 if(val(a,'vencimento')!==val(b,'vencimento'))return 'Vencimento alterado';
 return 'Conta a pagar atualizada';
}
function fromRow(source,r){
 const a=obj(r.antes),b=obj(r.depois),id=source.key+':'+r.id;
 switch(source.key){
 case 'site':{
  const kind=r.entidade==='movimento'?'movimentos':'boletos';
  const title=r.acao==='classificar_saida'?'Despesa classificada':
   r.acao==='cancelar'?'Movimentação cancelada':'Registro financeiro alterado';
  const detail=diff(a,b,[['categoria','Categoria'],['situacao','Situação'],['descricao','Descrição']])||
   ('Operação: '+label(r.acao));
  return makeEvent(id,r.criado_em,kind,title,val(b,'descricao')||val(a,'descricao')||r.entidade,
   detail,val(b,'valor')??val(a,'valor'),r.usuario_id,source.key);
 }
 case 'receivables':{
  const title=r.entidade==='cliente'?'Cadastro de cliente '+(r.acao==='criar'?'criado':'alterado'):
   r.acao==='criar'?'Conta a receber criada':r.acao==='cancelar'?'Recebível cancelado':'Conta a receber alterada';
  const d=diff(a,b,[['descricao','Descrição'],['situacao','Situação'],['vencimento','Vencimento']])||
   'Operação registrada: '+label(r.acao);
  return makeEvent(id,r.criado_em,'receber',title,
   val(b,'descricao')||val(b,'nome')||val(a,'descricao')||val(a,'nome')||r.entidade,
   d,val(b,'valor')??val(b,'valor_referencia')??val(a,'valor')??val(a,'valor_referencia'),r.usuario_id,source.key);
 }
 case 'payables':{
  const title=payableAction(a,b);
  const d=diff(a,b,[['vencimento','Vencimento'],['situacao','Situação'],['valor_referencia','Valor'],
   ['valor_pago','Valor pago'],['descricao','Descrição']])||
   (title==='Boleto arquivado'?'Saiu das contas ativas; registro original preservado':
    title==='Boleto restaurado'?'Retornou às contas ativas':'Alteração registrada no histórico');
  return makeEvent(id,r.alterado_em,'boletos',title,
   val(b,'fornecedor_nome')||val(a,'fornecedor_nome')||val(b,'descricao')||val(a,'descricao'),
   d,val(b,'valor_referencia')??val(a,'valor_referencia'),r.operador,source.key);
 }
 case 'manualEdits':{
  const d=diff(a,b,[['vencimento','Vencimento'],['descricao','Descrição'],['valor_referencia','Valor'],
   ['situacao','Situação']])||'Dados do boleto avulso revisados';
  const title=!val(a,'excluido_em')&&val(b,'excluido_em')?'Boleto avulso arquivado':
   val(a,'excluido_em')&&!val(b,'excluido_em')?'Boleto avulso restaurado':'Boleto avulso editado';
  return makeEvent(id,r.alterado_em,'boletos',title,
   val(b,'fornecedor_nome')||val(a,'fornecedor_nome')||val(b,'descricao')||val(a,'descricao'),
   d,val(b,'valor_referencia')??val(a,'valor_referencia'),r.alterado_por,source.key);
 }
 case 'manualTrash':{
  const doc=obj(r.dados_antes);
  return makeEvent(id,r.excluido_em,'boletos','Boleto avulso movido para a lixeira',
   val(doc,'fornecedor_nome')||val(doc,'descricao'),
   'Registro retirado das listas ativas; histórico mantido para restauração',
   val(doc,'valor_referencia'),r.excluido_por,source.key);
 }
 case 'invoicePayments':{
  const f=invoiceMap.get(r.fatura_id);
  const cardName=f?.cartao_nome||'Cartão não identificado';
  const card=window.frCardNames?.canonical?.(cardName)||cardName;
  const ext=r.origem==='externo',type=ext?'Pagamento externo informado':'Pagamento bancário vinculado';
  const origin=ext?'Outra conta · '+label(r.conta_origem_externa):
   r.origem==='fluxo'?'Fluxo de caixa':'Extrato bancário';
  const detail=origin+' · Pago em '+label(r.data_pagamento)+
    (ext?' · Informado sem comprovação bancária no sistema':'');
  const competence=f?.mes_fatura?String(f.mes_fatura).slice(0,7):'Competência não informada';
  return makeEvent(id,r.confirmado_em,'faturas',type,card+' · '+competence,
   detail,r.valor_pago,r.confirmado_por,source.key);
 }
 case 'operationalPayments':
  return makeEvent(id,r.criado_em,'boletos','Baixa de conta a pagar registrada',
   r.conta_pagar_id?'Compromisso da planilha':'Boleto avulso',
   'Pagamento registrado em '+label(r.data_pagamento),
   r.valor_pago,r.operador,source.key);
 case 'invoiceDue':{
  const title=val(a,'vencimento')!==val(b,'vencimento')?'Vencimento de fatura alterado':'Agenda de fatura editada';
  return makeEvent(id,r.alterado_em,'faturas',title,
   'Agenda de fatura',
   diff(a,b,[['vencimento','Vencimento'],['observacoes','Observação']])||'Agenda atualizada',
   null,r.alterado_por,source.key);
 }
 case 'imports':{
  const title='Importação: '+label(r.operacao);
  const detail='Origem '+label(r.tipo);
  return makeEvent(id,r.criado_em,'importacoes',title,
   val(b,'arquivo_nome')||val(a,'arquivo_nome')||'Histórico de importação',
   detail,null,r.operador,source.key);
 }
 default:return null;
 }
}
function uniqueEvents(list){
 const seen=new Set(),out=[];
 for(const e of list){
  // Alguns triggers gravam o mesmo antes/depois com o mesmo horário e compromisso.
  // O filtro evita repetição visual e não apaga qualquer linha da auditoria.
  const dedup=e.source==='payables'?
   [e.source,e.time,e.title,e.subject,e.details,e.amount].join('|'):e.id;
  if(seen.has(dedup))continue;
  seen.add(dedup);out.push(e);
 }
 return out.sort((a,b)=>(htmlDate(b.time)?.getTime()||0)-(htmlDate(a.time)?.getTime()||0)||
  a.id.localeCompare(b.id));
}
function rows(){
 return all.filter(e=>(type==='todos'||e.kind===type)&&
  (!start||e.day>=start)&&(!end||e.day<=end)&&
  (!query||[e.title,e.subject,e.details,e.actor,e.source,TYPES[e.kind]]
   .join(' ').toLocaleLowerCase('pt-BR').includes(query)));
}
function refreshSummary(){
 put('audit-events-total',all.length.toLocaleString('pt-BR'));
 put('audit-payment-count',all.filter(e=>e.title.includes('Pagamento')||e.title.includes('Baixa')).length);
 put('audit-change-count',all.filter(e=>e.title.includes('alterado')||e.title.includes('editad')||e.title.includes('classificada')||e.title.includes('atualizad')).length);
 put('audit-trash-count',all.filter(e=>/arquivado|restaurado|lixeira/.test(e.title.toLowerCase())).length);
 put('audit-invoice-count',all.filter(e=>e.kind==='faturas').length);
 put('audit-source-count',SOURCES.length+' fontes consultadas');
}
function render(){
 if(!ready)return;
 const filtered=rows();
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 page=Math.max(0,Math.min(page,pages-1));
 const entries=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 const root=$('audit-activity-list');
 if(root){
  root.innerHTML=entries.length?entries.map(e=>
   '<article class="audit-entry">'+
    '<div class="audit-entry-main"><span class="audit-entry-date">'+esc(atTime(e.time))+'</span>'+
     '<div class="audit-entry-content"><div class="audit-entry-heading"><strong>'+esc(e.title)+'</strong>'+
      '<span class="audit-tag audit-tag-'+esc(e.kind)+'">'+esc(TYPES[e.kind]||'Registro')+'</span></div>'+
      '<p class="audit-subject">'+esc(e.subject)+'</p>'+
      '<p class="audit-details">'+esc(e.details)+'</p>'+
      '<p class="audit-meta">'+esc(e.actor)+' · '+esc(e.source)+'</p></div>'+
    '</div>'+
    '<div class="audit-entry-side">'+(e.amount===null?'':'<strong class="audit-amount">'+money(e.amount)+'</strong>')+
      '<button type="button" class="btn audit-view" data-audit-view="'+esc(VIEWS[e.kind]||'overview')+'">Ver módulo</button>'+
    '</div>'+
   '</article>').join(''):
   '<div class="audit-empty">Nenhuma atividade encontrada. Ajuste o período, o tipo ou a busca.</div>';
 }
 put('audit-list-count',filtered.length+' evento(s) nos filtros · página '+(page+1)+' de '+pages);
 if($('audit-prev'))$('audit-prev').disabled=page===0;
 if($('audit-next'))$('audit-next').disabled=page>=pages-1;
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof db==='undefined'||!db)throw Error('Conexão com a base financeira indisponível.');
  put('audit-status','Consultando fontes protegidas de auditoria...');
  const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
  if(authError||allowed!==true)throw Error('Usuário sem autorização para consultar o financeiro.');
  const outputs=await Promise.all([...SOURCES.map(x=>
    getAll(()=>db.from(x.table).select(x.cols).order(x.date,{ascending:false})).then(list=>({source:x,rows:list}))
  ),getAll(()=>db.from('fin_faturas_historicas').select('id,cartao_nome,mes_fatura').order('id'))]);
  const cards=outputs.pop();
  invoiceMap=new Map(cards.map(x=>[x.id,x]));
  const list=outputs.flatMap(result=>result.rows.map(x=>fromRow(result.source,x)).filter(Boolean));
  all=uniqueEvents(list);ready=true;page=0;refreshSummary();render();
  const totalOriginal=outputs.reduce((count,x)=>count+x.rows.length,0);
  sourceStatus=totalOriginal===all.length?'':(totalOriginal-all.length)+' lançamento(s) repetido(s) agrupado(s) apenas na visualização.';
  put('audit-status','Consulta concluída às '+
   new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())+
   '. '+SOURCES.length+' fontes de registros disponíveis. '+sourceStatus);
 })().catch(err=>{
  ready=false;all=[];put('audit-status','Não foi possível concluir a consulta: '+(err.message||err));
  if($('audit-activity-list'))$('audit-activity-list').textContent='Histórico indisponível. Use Atualizar para tentar novamente.';
  ['audit-events-total','audit-payment-count','audit-change-count','audit-trash-count','audit-invoice-count'].forEach(id=>put(id,'—'));
 }).finally(()=>{loading=null});
 return loading;
}
function quoteCsv(v){
 const original=String(v??''),safe=/^\s*[=+\-@]/.test(original)?"'"+original:original;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function download(){
 if(!ready)return;
 const header=['Data e hora (SP)','Tipo','Atividade','Registro','Detalhes','Valor referenciado (R$)','Operador (ID abreviado)','Fonte'];
 const data=rows().map(e=>[atTime(e.time),TYPES[e.kind],e.title,e.subject,e.details,
  e.amount===null?'':e.amount.toFixed(2).replace('.',','),e.actor,e.source]);
 const blob=new Blob(['\ufeff'+[header,...data].map(x=>x.map(quoteCsv).join(';')).join('\r\n')],
  {type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='FR_Motors_Auditoria_Financeira.csv';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function init(){
 if(!$('audit-activity-list'))return;
 $('audit-refresh')?.addEventListener('click',()=>refresh());
 $('audit-type')?.addEventListener('change',e=>{type=e.target.value;page=0;render()});
 $('audit-search')?.addEventListener('input',e=>{query=text(e.target.value).toLocaleLowerCase('pt-BR');page=0;render()});
 $('audit-from')?.addEventListener('change',e=>{start=e.target.value;page=0;render()});
 $('audit-to')?.addEventListener('change',e=>{end=e.target.value;page=0;render()});
 $('audit-clear')?.addEventListener('click',()=>{
  type='todos';query='';start='';end='';page=0;
  for(const id of ['audit-search','audit-from','audit-to'])if($(id))$(id).value='';
  if($('audit-type'))$('audit-type').value='todos';
  render();
 });
 $('audit-prev')?.addEventListener('click',()=>{page--;render()});
 $('audit-next')?.addEventListener('click',()=>{page++;render()});
 $('audit-export')?.addEventListener('click',download);
 $('audit-activity-list')?.addEventListener('click',e=>{
  const link=e.target.closest('[data-audit-view]');
  if(link)window.frFinanceUI?.selectView?.(link.dataset.auditView);
 });
 if(!document.querySelector('[data-view-panel="audit"]')?.hidden)refresh();
}
window.frAuditUI={refresh,__test:{makeEvent,fromRow,uniqueEvents,localDate,quoteCsv,payableAction}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();