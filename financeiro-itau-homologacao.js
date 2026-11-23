/* FR Motors | Autorização humana da homologação do extrato Itaú.
 * Todo lançamento inicia DESMARCADO. O servidor revalida as origens e faz uma
 * única transação auditada; a interface nunca escreve diretamente no caixa. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const dateBR=x=>String(x||'').slice(0,10).split('-').reverse().join('/');
const cents=x=>Math.round(Number(x)*100);
let pending=[],cutoff='',approved=0,weak=0,busy=false,selected=new Set(),initialised=false;
function put(id,v){if($(id))$(id).textContent=v}
function setState(message,failed=false){
 const el=$('hist-itau-approve-status');
 if(el){el.textContent=message;el.classList.toggle('is-error',failed);}
}
function confirmedSelection(){
 return pending.filter(x=>selected.has(x.id));
}
function summary(){
 const rows=confirmedSelection();
 const total=rows.reduce((s,x)=>s+(x.natureza==='entrada'?1:-1)*cents(x.valor),0);
 put('hist-itau-approve-selected',rows.length+' de '+pending.length+' selecionados · resultado '+money(total/100));
 $('hist-itau-approve-confirm').disabled=busy||rows.length===0||
  !$('hist-itau-approve-ack').checked||String($('hist-itau-approve-reason').value||'').trim().length<12;
}
function drawList(){
 const body=$('hist-itau-approve-rows');if(!body)return;
 body.innerHTML=pending.length?pending.map(x=>'<tr>'+
  '<td><label class="itau-approve-pick"><input type="checkbox" data-itau-approve-id="'+safe(x.id)+'"'+
   (selected.has(x.id)?' checked':'')+'> <span>Incluir</span></label></td>'+
  '<td>'+safe(dateBR(x.data_lancamento))+'</td>'+
  '<td>'+safe(x.descricao)+
  '<small class="hist-subline">'+safe(x.arquivo_nome||'PDF Itaú')+'</small></td>'+
  '<td>'+safe(x.natureza==='entrada'?'Entrada':'Saída')+'</td>'+
  '<td class="money">'+money(x.valor)+'</td></tr>').join(''):
  '<tr><td colspan="5">Nenhum lançamento novo aguardando homologação.</td></tr>';
 summary();
}
function render(args){
 if(!args||!Array.isArray(args.pending))return;
 pending=args.pending.filter(x=>x.id&&['entrada','saida'].includes(x.natureza))
  .slice().sort((a,b)=>String(a.data_lancamento).localeCompare(String(b.data_lancamento))||
   String(a.id).localeCompare(String(b.id)));
 cutoff=args.cutoff||'';
 approved=Number(args.approved||0);
 weak=Number(args.weak||0);
 selected.clear();
 put('hist-itau-approve-count',pending.length+' novo(s) em conferência');
 put('hist-itau-approved-count',approved+' homologado(s) manualmente');
 put('hist-itau-approve-warning',weak?
  weak+' possível(is) correspondência(s) com o Excel ainda exigem revisão. Elas não aparecem para homologar novamente.':
  'Movimentos já presentes no Excel não aparecem entre os novos lançamentos.');
 const button=$('hist-itau-approve-open');
 if(button)button.disabled=pending.length===0;
 $('hist-itau-approve-ack').checked=false;
 $('hist-itau-approve-reason').value='';
 setState(pending.length?
  'Os lançamentos estão apenas em conferência. Selecione e confira cada linha antes de autorizar.':
  'Não há novos lançamentos para homologar nesta conciliação.');
 drawList();
}
function openDialog(){
 if(busy||!pending.length)return;
 selected.clear();drawList();
 const d=$('hist-itau-approve-dialog');
 if(!d)return;
 if(typeof d.showModal==='function')d.showModal();
 else d.setAttribute('open','');
}
function closeDialog(){
 const d=$('hist-itau-approve-dialog');
 if(!d)return;
 if(d.open&&typeof d.close==='function')d.close();
 else d.removeAttribute('open');
}
async function approve(event){
 event.preventDefault();
 if(busy)return;
 const chosen=confirmedSelection();
 const reason=String($('hist-itau-approve-reason')?.value||'').trim();
 if(!chosen.length||reason.length<12||reason.length>500||!$('hist-itau-approve-ack').checked){
  setState('Escolha os lançamentos, descreva a conferência e marque a autorização.',true);
  return;
 }
 if(!cutoff){setState('Fechamento do Excel não disponível. Atualize o Itaú.',true);return;}
 busy=true;
 $('hist-itau-approve-confirm').disabled=true;
 setState('Registrando a autorização e conferindo novamente cada movimento...');
 try{
  if(typeof db==='undefined'||!db)throw Error('Conexão indisponível.');
  const {data,error}=await db.rpc('fin_itau_homologar_linhas',{
   p_linhas:chosen.map(x=>x.id),
   p_fechamento:cutoff,
   p_observacao:reason
  });
  if(error)throw error;
  if(data?.resultado!=='homologado'||data?.quantidade!==chosen.length)
   throw Error('O servidor não confirmou a homologação integral da seleção.');
  closeDialog();
  setState(data.quantidade+' movimentação(ões) homologada(s) por usuário autorizado. '+ 
   'Entradas: '+money(data.entradas)+' · saídas: '+money(data.saidas)+'.');
  selected.clear();
  // Toda recarga ocorre depois do COMMIT transacional. Falha na interface
  // não desfaz a homologação; nesse caso, usuário atualiza para ver o status.
  const updates=await Promise.allSettled([
   window.frHistoryUI?.refresh?.()||Promise.resolve(),
   window.frManagerReportsUI?.refresh?.()||Promise.resolve(),
   window.frRealDashboard?.refresh?.()||Promise.resolve(),
   window.frCashDetailsUI?.refresh?.()||Promise.resolve()
  ]);
  if(updates.some(x=>x.status==='rejected'))
   setState('Homologação salva com sucesso. Atualize a página para sincronizar todos os quadros.');
 }catch(e){
  setState('Nenhuma homologação foi confirmada nesta tentativa: '+(e.message||e)+
   ' Confira os registros; se o servidor já confirmou antes de uma interrupção, atualize antes de tentar novamente.',true);
 }finally{busy=false;summary();}
}
function init(){
 if(initialised||!$('hist-itau-approve-open'))return;
 initialised=true;
 $('hist-itau-approve-open').addEventListener('click',openDialog);
 $('hist-itau-approve-close').addEventListener('click',()=>{if(!busy)closeDialog()});
 $('hist-itau-approve-cancel').addEventListener('click',()=>{if(!busy)closeDialog()});
 $('hist-itau-approve-all').addEventListener('click',()=>{
  selected=new Set(pending.map(x=>x.id));drawList();
 });
 $('hist-itau-approve-none').addEventListener('click',()=>{
  selected.clear();drawList();
 });
 $('hist-itau-approve-rows').addEventListener('change',e=>{
  const input=e.target.closest('[data-itau-approve-id]');if(!input)return;
  if(input.checked)selected.add(input.dataset.itauApproveId);
  else selected.delete(input.dataset.itauApproveId);
  summary();
 });
 $('hist-itau-approve-reason').addEventListener('input',summary);
 $('hist-itau-approve-ack').addEventListener('change',summary);
 $('hist-itau-approve-form').addEventListener('submit',approve);
 $('hist-itau-approve-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
}
window.frItauApprovalUI={render,__test:{money,cents,dateBR}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
