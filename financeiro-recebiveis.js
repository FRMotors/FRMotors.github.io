/* FR Motors · Contas a Receber. Somente usuários financeiros autorizados. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const state={accounts:[],clients:[],receipts:[],cash:[],loading:null,returnFromClient:false};
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmt=x=>money.format(Number(x)||0);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localToday=()=>{const d=new Date();return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const showDate=x=>x?String(x).slice(0,10).split('-').reverse().join('/'): 'Sem data';
function cents(value){
 const n=Number(value),c=Math.round(n*100);
 return Number.isFinite(n)&&Number.isSafeInteger(c)&&c>0&&Math.abs(n*100-c)<0.000001?c:null;
}
function report(id,message,error=false){
 const el=$(id);if(!el)return;el.textContent=message;el.style.color=error?'#b42318':'';
}
function dialog(id){const d=$(id);if(!d?.open)d?.showModal()}
function close(id){const d=$(id);if(d?.open)d.close()}
function toast(message,error=false){window.frFinanceUI?.showToast?.(message,error)}
function isAllowed(){return typeof db!=='undefined'&&!!db}
async function fetchAll(create,limit=9000){
 const out=[],page=600;
 for(let from=0;from<limit;from+=page){
  const {data,error}=await create().range(from,from+page-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<page)return out;
 }
 throw Error('Consulta atingiu o limite de registros. Nenhum total parcial foi apresentado.');
}
function clientsSelect(preserve){
 const el=$('ar-invoice-client');if(!el)return;
 const chosen=preserve??el.value;
 el.replaceChildren(new Option('Selecione um cliente',''));
 for(const c of state.clients.filter(x=>x.ativo))el.add(new Option(c.nome,c.id));
 el.value=chosen||'';
}
function populate(){
 const filter=$('ar-filter').value;
 const search=$('ar-search').value.trim().toLocaleLowerCase('pt-BR');
 const today=localToday();
 const list=state.accounts.filter(x=>{
  const due=x.situacao!=='cancelado'&&x.situacao!=='recebido'&&x.vencimento<today;
  if(filter!=='todos' && (filter==='vencido'?!due:x.situacao!==filter))return false;
  const full=[x.fin_receber_clientes?.nome,x.numero_documento,x.descricao,x.vencimento].join(' ').toLocaleLowerCase('pt-BR');
  return full.includes(search);
 });
 const pending=state.accounts.filter(x=>x.situacao==='aberto'||x.situacao==='parcial');
 const pendingTotal=pending.reduce((a,x)=>a+Math.round((Number(x.valor)-Number(x.valor_recebido))*100),0);
 const overdueTotal=pending.filter(x=>x.vencimento<today).reduce((a,x)=>a+Math.round((Number(x.valor)-Number(x.valor_recebido))*100),0);
 const receivedTotal=state.accounts.filter(x=>x.situacao!=='cancelado').reduce((a,x)=>a+Math.round(Number(x.valor_recebido)*100),0);
 $('ar-open-total').textContent=fmt(pendingTotal/100);
 $('ar-overdue-total').textContent=fmt(overdueTotal/100);
 $('ar-paid-total').textContent=fmt(receivedTotal/100);
 $('ar-open-count').textContent=String(pending.length);
 $('ar-count').textContent=list.length+' de '+state.accounts.length+' boleto(s)';
 $('ar-rows').innerHTML=list.length?list.map(x=>{
  const outstanding=Math.max(0,Number(x.valor)-Number(x.valor_recebido));
  const overdue=x.vencimento<today&&outstanding>0&&x.situacao!=='cancelado';
  const status=x.situacao==='recebido'?'Recebido':x.situacao==='cancelado'?'Cancelado':overdue?'Vencido':x.situacao==='parcial'?'Parcial':'Em aberto';
  const canReceive=x.situacao==='aberto'||x.situacao==='parcial';
  const canChange=x.situacao==='aberto'&&Number(x.valor_recebido)===0;
  const hasReceipts=state.receipts.some(r=>r.conta_receber_id===x.id);
  return '<tr>'+
  '<td>'+esc(showDate(x.vencimento))+'</td>'+
  '<td><span class="row-main">'+esc(x.fin_receber_clientes?.nome||'Cliente')+'</span><span class="row-sub">'+esc(x.numero_documento||'Sem número')+'</span></td>'+
  '<td>'+esc(x.descricao)+'</td><td class="money">'+fmt(x.valor)+'</td>'+
  '<td class="money">'+fmt(x.valor_recebido)+'</td><td class="money">'+fmt(outstanding)+'</td>'+
  '<td><span class="state '+(x.situacao==='recebido'?'paid':overdue?'overdue':'open')+'">'+esc(status)+'</span></td>'+
  '<td><div class="table-actions">'+
   (canReceive?'<button type="button" class="btn" data-ar-pay="'+esc(x.id)+'">Receber</button>':'')+
   (canChange?'<button type="button" class="btn" data-ar-edit="'+esc(x.id)+'">Editar</button><button type="button" class="btn" data-ar-cancel="'+esc(x.id)+'">Cancelar</button>':'')+
   (hasReceipts?'<button type="button" class="btn" data-ar-history="'+esc(x.id)+'">Histórico</button>':'')+
   '</div></td></tr>';
 }).join(''):'<tr><td colspan="8" class="empty">Nenhum boleto encontrado com os filtros selecionados.</td></tr>';
 report('ar-status','Valores exibidos a partir dos registros oficiais do Supabase. A receber não é receita recebida.');
}
async function refresh(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  if(!isAllowed())throw Error('Conexão Supabase indisponível.');
  const {data:auth,error:e}=await db.rpc('fluxo_caixa_autorizado');
  if(e||auth!==true)throw Error('Sua conta não está autorizada a consultar o Financeiro.');
  report('ar-status','Atualizando dados financeiros...');
  const [clients,accounts,receipts,cash]=await Promise.all([
   fetchAll(()=>db.from('fin_receber_clientes').select('id,nome,documento,email,telefone,ativo').order('nome')),
   fetchAll(()=>db.from('fin_contas_receber').select('id,cliente_id,numero_documento,descricao,emissao,vencimento,valor,valor_recebido,situacao,observacoes,criado_em,fin_receber_clientes(nome)').order('vencimento',{ascending:true}).order('id')),
   fetchAll(()=>db.from('fin_recebimentos').select('id,conta_receber_id,movimento_id,recebido_em,valor,meio,criado_em').order('recebido_em',{ascending:false})),
   fetchAll(()=>db.from('fin_movimentos').select('id,data_movimento,tipo,estado,descricao,valor,meio_pagamento,origem').eq('tipo','entrada').eq('estado','confirmado').order('data_movimento',{ascending:false}))
  ]);
  Object.assign(state,{clients,accounts,receipts,cash});
  clientsSelect();
  populate();
 })().catch(err=>{
  report('ar-status','Não foi possível carregar Contas a Receber: '+err.message,true);
  toast('Erro nas contas a receber: '+err.message,true);
 }).finally(()=>{state.loading=null});
 return state.loading;
}
function invoiceOpen(id){
 const f=$('ar-invoice-form');
 f.reset();delete f.dataset.chave;delete f.dataset.id;
 $('ar-invoice-feedback').textContent='';
 const record=id?state.accounts.find(x=>x.id===id):null;
 $('ar-invoice-title').textContent=record?'Editar boleto a receber':'Novo boleto a receber';
 $('ar-invoice-submit').textContent=record?'Salvar alterações':'Salvar boleto';
 clientsSelect(record?.cliente_id);
 f.elements.emissao.value=record?.emissao||localToday();
 f.elements.vencimento.value=record?.vencimento||'';
 if(record){
  f.dataset.id=record.id;
  f.elements.numero_documento.value=record.numero_documento||'';
  f.elements.descricao.value=record.descricao||'';
  f.elements.valor.value=Number(record.valor).toFixed(2);
  f.elements.observacoes.value=record.observacoes||'';
 }
 dialog('ar-invoice-dialog');
}
function clientOpen(fromInvoice){
 state.returnFromClient=!!fromInvoice;
 $('ar-client-form').reset();
 $('ar-client-feedback').textContent='';
 if(fromInvoice)close('ar-invoice-dialog');
 dialog('ar-client-dialog');
}
async function saveClient(e){
 e.preventDefault();const f=e.target,b=$('ar-client-submit');b.disabled=true;
 try{
  const x=Object.fromEntries(new FormData(f));
  const {data,error}=await db.rpc('fin_receber_criar_cliente',{
   p_nome:String(x.nome).trim(),p_documento:String(x.documento||'').trim()||null,
   p_email:String(x.email||'').trim()||null,p_telefone:String(x.telefone||'').trim()||null,
   p_observacoes:String(x.observacoes||'').trim()||null
  });
  if(error)throw error;if(!data)throw Error('O banco não confirmou o cliente.');
  await refresh();
  close('ar-client-dialog');
  if(state.returnFromClient){
   clientsSelect(data);dialog('ar-invoice-dialog');
   state.returnFromClient=false;
  }
  toast('Cliente cadastrado no Supabase.');
 }catch(err){report('ar-client-feedback',err.message,true)}finally{b.disabled=false}
}
async function saveInvoice(e){
 e.preventDefault();const f=e.target,b=$('ar-invoice-submit');b.disabled=true;
 try{
  const x=Object.fromEntries(new FormData(f));
  const value=cents(x.valor);
  if(value===null)throw Error('Informe um valor válido com duas casas decimais.');
  if(!x.cliente_id)throw Error('Selecione um cliente.');
  if(!x.emissao||!x.vencimento)throw Error('Informe emissão e vencimento.');
  const payload={cliente_id:x.cliente_id,numero_documento:x.numero_documento||null,
   descricao:String(x.descricao||'').trim(),emissao:x.emissao,vencimento:x.vencimento,
   valor:value/100,observacoes:x.observacoes||null};
  let error;
  if(f.dataset.id){
   ({error}=await db.rpc('fin_receber_alterar',{p_id:f.dataset.id,p_acao:'editar',p_dados:payload}));
  }else{
   const key=f.dataset.chave||(f.dataset.chave='fr-receber-conta-'+crypto.randomUUID());
   ({error}=await db.rpc('fin_receber_criar',{
    p_cliente:payload.cliente_id,p_numero:payload.numero_documento,p_descricao:payload.descricao,
    p_emissao:payload.emissao,p_vencimento:payload.vencimento,p_valor:payload.valor,
    p_observacoes:payload.observacoes,p_chave:key
   }));
  }
  if(error)throw error;
  delete f.dataset.chave;close('ar-invoice-dialog');
  await refresh();
  toast(f.dataset.id?'Boleto atualizado.':'Boleto registrado como valor a receber, sem entrada no caixa.');
 }catch(err){report('ar-invoice-feedback','Não foi possível salvar: '+err.message,true)}finally{b.disabled=false}
}
function payOpen(id){
 const x=state.accounts.find(v=>v.id===id);
 if(!x)return;
 const f=$('ar-pay-form');f.reset();delete f.dataset.chave;f.dataset.id=id;
 $('ar-pay-feedback').textContent='';
 f.elements.data.value=localToday();
 f.elements.valor.value=(Number(x.valor)-Number(x.valor_recebido)).toFixed(2);
 $('ar-pay-subtitle').textContent=(x.fin_receber_clientes?.nome||'Cliente')+' · saldo '+fmt(Number(x.valor)-Number(x.valor_recebido));
 changePayOrigin();
 dialog('ar-pay-dialog');
}
function movementChoices(){
 const f=$('ar-pay-form'),list=$('ar-pay-existing');
 if(!f||!list)return;
 const value=cents(f.elements.valor.value),date=f.elements.data.value;
 const used=new Set(state.receipts.map(x=>x.movimento_id));
 const available=state.cash.filter(m=>!used.has(m.id)&&m.data_movimento===date&&cents(m.valor)===value
   &&(!m.meio_pagamento||['boleto','pix','debito','dinheiro','transferencia','outro'].includes(m.meio_pagamento)));
 const current=list.value;
 list.replaceChildren(new Option(available.length?'Selecione a entrada correspondente':'Nenhuma entrada encontrada para esta data e valor',''));
 for(const m of available)list.add(new Option(showDate(m.data_movimento)+' · '+fmt(m.valor)+' · '+String(m.descricao||'').slice(0,65),m.id));
 if(available.some(m=>m.id===current))list.value=current;
 if(f.elements.origem.value==='existente')report('ar-pay-feedback',
  available.length?'Selecione a entrada que já consta no banco. Ela não será contabilizada outra vez.':'Não existe entrada para essa data e valor. Confira o extrato antes de lançar uma nova entrada.',!available.length);
}
function changePayOrigin(){
 const f=$('ar-pay-form'),existing=f.elements.origem.value==='existente';
 $('ar-existing-label').hidden=!existing;
 $('ar-pay-existing').required=existing;
 if(existing)movementChoices();else report('ar-pay-feedback','O recebimento criará uma nova entrada efetiva no caixa.');
}
async function savePay(e){
 e.preventDefault();const f=e.target,b=$('ar-pay-submit');b.disabled=true;
 try{
  const x=Object.fromEntries(new FormData(f)),amount=cents(x.valor);
  if(amount===null)throw Error('Informe um valor recebido válido.');
  const account=state.accounts.find(a=>a.id===f.dataset.id);
  if(!account)throw Error('Boleto não encontrado. Atualize a página.');
  const remaining=Math.round((Number(account.valor)-Number(account.valor_recebido))*100);
  if(amount>remaining)throw Error('O recebimento não pode superar o saldo restante.');
  if(!x.data)throw Error('Informe a data do recebimento.');
  if(x.origem==='existente'&&!x.movimento)throw Error('Selecione uma entrada bancária existente.');
  if(x.origem==='novo'&&!window.confirm('Confirma que o dinheiro já foi recebido e ainda NÃO consta no extrato importado? Isso adicionará uma entrada ao caixa.'))return;
  const key=f.dataset.chave||(f.dataset.chave='fr-receber-pago-'+crypto.randomUUID());
  const {data,error}=await db.rpc('fin_receber_registrar',{
   p_conta:account.id,p_data:x.data,p_valor:amount/100,p_meio:x.meio||null,
   p_chave:key,p_movimento_existente:x.origem==='existente'?x.movimento:null
  });
  if(error)throw error;if(!data)throw Error('O banco não confirmou o recebimento.');
  delete f.dataset.chave;close('ar-pay-dialog');
  await refresh();
  window.frRealDashboard?.refresh?.();
  toast(x.origem==='existente'?'Boleto vinculado à entrada bancária existente.':'Recebimento registrado como entrada de caixa.');
 }catch(err){report('ar-pay-feedback',err.message,true)}finally{b.disabled=false}
}
async function cancelAccount(id){
 const x=state.accounts.find(a=>a.id===id);
 if(!x||x.situacao!=='aberto'||Number(x.valor_recebido)!==0)return;
 if(!window.confirm('Cancelar o boleto '+(x.numero_documento||x.descricao)+'? O registro continuará na auditoria.'))return;
 const {error}=await db.rpc('fin_receber_alterar',{p_id:id,p_acao:'cancelar',p_dados:{}});
 if(error){toast('Não foi possível cancelar: '+error.message,true);return}
 await refresh();toast('Boleto cancelado. Nenhuma entrada foi removida do caixa.');
}
function historyOpen(id){
 const x=state.accounts.find(a=>a.id===id);
 if(!x)return;
 const receipts=state.receipts.filter(v=>v.conta_receber_id===id);
 $('ar-history-content').innerHTML=receipts.length?'<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Valor</th><th>Meio</th><th>Movimentação</th></tr></thead><tbody>'+
  receipts.map(r=>'<tr><td>'+esc(showDate(r.recebido_em))+'</td><td>'+fmt(r.valor)+'</td><td>'+esc(r.meio||'Não informado')+'</td><td><code>'+esc(r.movimento_id)+'</code></td></tr>').join('')+
 '</tbody></table></div>':'<p>Nenhum recebimento confirmado.</p>';
 $('ar-history-title').textContent='Recebimentos · '+(x.numero_documento||x.descricao);
 dialog('ar-history-dialog');
}
function init(){
 const anchor=document.querySelector('[data-view-panel="payables"]');
 if(!anchor||!$('app'))return;
 const holder=document.createElement('div');
 holder.innerHTML="\n<section class=\"view\" data-view-panel=\"receivables\" hidden aria-label=\"Contas a receber\">\n <div class=\"section-header\">\n  <div><p class=\"eyebrow\">Financeiro · operações</p>\n   <h1 class=\"page-heading\">Contas a receber</h1>\n   <p class=\"page-description\">Boletos emitidos para empresas e clientes. O valor só entra no caixa quando há recebimento efetivo.</p>\n  </div>\n  <div class=\"header-buttons\">\n   <button class=\"btn\" id=\"ar-client-new\" type=\"button\">Novo cliente</button>\n   <button class=\"btn btn-primary\" id=\"ar-invoice-new\" type=\"button\">Novo boleto a receber</button>\n  </div>\n </div>\n <div class=\"section-card-list\">\n  <article class=\"insight-card\"><span>Saldo a receber</span><strong id=\"ar-open-total\">R$ 0,00</strong><small>Ainda não entrou no caixa</small></article>\n  <article class=\"insight-card\"><span>Vencido</span><strong id=\"ar-overdue-total\">R$ 0,00</strong><small>Saldo de boletos com prazo vencido</small></article>\n  <article class=\"insight-card\"><span>Recebido</span><strong id=\"ar-paid-total\">R$ 0,00</strong><small>Entradas vinculadas, sem duplicar</small></article>\n  <article class=\"insight-card\"><span>Boletos pendentes</span><strong id=\"ar-open-count\">0</strong><small>Abertos e parcialmente recebidos</small></article>\n </div>\n <section class=\"card\" style=\"margin-top:18px\">\n  <div class=\"card-head\"><div><h2>Boletos emitidos</h2><p>Vencimentos, pagamentos parciais e valores recebidos.</p></div>\n   <button id=\"ar-refresh\" class=\"btn\" type=\"button\">Atualizar</button>\n  </div>\n  <div class=\"data-toolbar\">\n   <label class=\"search-box\"><input id=\"ar-search\" type=\"search\" placeholder=\"Buscar empresa, descrição ou boleto\" aria-label=\"Pesquisar contas a receber\"></label>\n   <select id=\"ar-filter\" class=\"filter-select\" aria-label=\"Situação das contas a receber\">\n    <option value=\"todos\">Todos</option><option value=\"aberto\">Em aberto</option>\n    <option value=\"vencido\">Vencidos</option><option value=\"parcial\">Parcialmente recebidos</option>\n    <option value=\"recebido\">Recebidos</option><option value=\"cancelado\">Cancelados</option>\n   </select>\n  </div>\n  <p id=\"ar-status\" class=\"info-note\" role=\"status\">Carregando contas a receber...</p>\n  <div class=\"table-wrap\"><table class=\"data-table\"><thead><tr>\n   <th>Vencimento</th><th>Empresa / boleto</th><th>Descrição</th><th class=\"money\">Valor</th>\n   <th class=\"money\">Recebido</th><th class=\"money\">Saldo</th><th>Situação</th><th>Ações</th>\n  </tr></thead><tbody id=\"ar-rows\"><tr><td colspan=\"8\">Carregando...</td></tr></tbody></table></div>\n  <div class=\"table-footer\"><span id=\"ar-count\">0 boletos</span></div>\n  <p class=\"info-note\">Esta tela registra boletos que você já emitiu. Não gera um boleto bancário. Se o pagamento já está no extrato, vincule a entrada existente em vez de lançar outra.</p>\n </section>\n</section>";
 anchor.parentNode.insertBefore(holder.firstElementChild,anchor);
 $('main-content').insertAdjacentHTML('beforeend',"\n<dialog id=\"ar-client-dialog\" class=\"fin-dialog\" aria-labelledby=\"ar-client-title\">\n <div class=\"dialog-head\"><div><h2 id=\"ar-client-title\">Novo cliente ou empresa</h2><p>Quem deve pagar o boleto?</p></div><button type=\"button\" class=\"dialog-close\" data-ar-close=\"ar-client-dialog\" aria-label=\"Fechar\">×</button></div>\n <div class=\"dialog-body\"><form id=\"ar-client-form\" class=\"fields\">\n  <label style=\"grid-column:1/-1\">Empresa / nome<input name=\"nome\" minlength=\"2\" maxlength=\"160\" required placeholder=\"Razão social ou nome\"></label>\n  <label>CPF / CNPJ (opcional)<input name=\"documento\" maxlength=\"32\"></label>\n  <label>Telefone (opcional)<input name=\"telefone\" maxlength=\"40\"></label>\n  <label>E-mail (opcional)<input name=\"email\" type=\"email\" maxlength=\"254\"></label>\n  <label style=\"grid-column:1/-1\">Observações<input name=\"observacoes\" maxlength=\"500\"></label>\n  <div style=\"grid-column:1/-1\"><p id=\"ar-client-feedback\" class=\"status\" role=\"status\"></p>\n   <div class=\"form-actions\"><button type=\"button\" class=\"btn\" data-ar-close=\"ar-client-dialog\">Cancelar</button>\n   <button id=\"ar-client-submit\" class=\"btn btn-primary\" type=\"submit\">Salvar cliente</button></div>\n  </div>\n </form></div>\n</dialog>\n<dialog id=\"ar-invoice-dialog\" class=\"fin-dialog\" aria-labelledby=\"ar-invoice-title\">\n <div class=\"dialog-head\"><div><h2 id=\"ar-invoice-title\">Novo boleto a receber</h2><p>Não registra dinheiro em caixa antes do pagamento.</p></div><button type=\"button\" class=\"dialog-close\" data-ar-close=\"ar-invoice-dialog\" aria-label=\"Fechar\">×</button></div>\n <div class=\"dialog-body\"><form id=\"ar-invoice-form\" class=\"fields\">\n  <label style=\"grid-column:1/-1\">Empresa ou cliente<select name=\"cliente_id\" id=\"ar-invoice-client\" required><option value=\"\">Selecione</option></select></label>\n  <button id=\"ar-inline-client\" type=\"button\" class=\"btn\">Cadastrar novo cliente</button>\n  <label>Número do boleto / documento<input name=\"numero_documento\" maxlength=\"120\" placeholder=\"Ex.: BOLETO-001\"></label>\n  <label>Data de emissão<input name=\"emissao\" type=\"date\" required></label>\n  <label>Vencimento<input name=\"vencimento\" type=\"date\" required></label>\n  <label>Valor (R$)<input name=\"valor\" type=\"number\" min=\"0.01\" step=\"0.01\" required></label>\n  <label style=\"grid-column:1/-1\">Descrição<input name=\"descricao\" minlength=\"2\" maxlength=\"250\" required placeholder=\"Ex.: Serviço de manutenção\"></label>\n  <label style=\"grid-column:1/-1\">Observações<textarea name=\"observacoes\" maxlength=\"2000\" rows=\"2\"></textarea></label>\n  <div style=\"grid-column:1/-1\"><p id=\"ar-invoice-feedback\" class=\"status\" role=\"status\"></p>\n   <div class=\"form-actions\"><button type=\"button\" class=\"btn\" data-ar-close=\"ar-invoice-dialog\">Cancelar</button>\n    <button id=\"ar-invoice-submit\" type=\"submit\" class=\"btn btn-primary\">Salvar boleto</button></div>\n  </div>\n </form></div>\n</dialog>\n<dialog id=\"ar-pay-dialog\" class=\"fin-dialog\" aria-labelledby=\"ar-pay-title\">\n <div class=\"dialog-head\"><div><h2 id=\"ar-pay-title\">Dar baixa no recebimento</h2><p id=\"ar-pay-subtitle\"></p></div><button type=\"button\" class=\"dialog-close\" data-ar-close=\"ar-pay-dialog\" aria-label=\"Fechar\">×</button></div>\n <div class=\"dialog-body\"><form id=\"ar-pay-form\" class=\"fields\">\n  <label>Data do recebimento<input name=\"data\" type=\"date\" required></label>\n  <label>Valor recebido (R$)<input name=\"valor\" type=\"number\" min=\"0.01\" step=\"0.01\" required></label>\n  <label>Meio<select name=\"meio\"><option value=\"boleto\">Boleto</option><option value=\"pix\">PIX</option><option value=\"transferencia\">Transferência</option><option value=\"dinheiro\">Dinheiro</option><option value=\"debito\">Débito</option><option value=\"outro\">Outro</option></select></label>\n  <label>Origem do dinheiro<select name=\"origem\" id=\"ar-pay-origin\">\n    <option value=\"novo\">Registrar nova entrada de caixa</option>\n    <option value=\"existente\">Vincular entrada já registrada no extrato</option>\n   </select></label>\n  <label id=\"ar-existing-label\" style=\"grid-column:1/-1\" hidden>Entrada bancária existente<select name=\"movimento\" id=\"ar-pay-existing\"><option value=\"\">Selecione uma entrada da mesma data e valor</option></select></label>\n  <div style=\"grid-column:1/-1\"><p class=\"info-note\">Caso o dinheiro já apareça no extrato bancário importado, escolha <strong>Vincular entrada já registrada</strong>. Não crie um segundo lançamento para o mesmo recebimento.</p>\n   <p id=\"ar-pay-feedback\" class=\"status\" role=\"status\"></p>\n   <div class=\"form-actions\"><button type=\"button\" class=\"btn\" data-ar-close=\"ar-pay-dialog\">Cancelar</button>\n    <button id=\"ar-pay-submit\" class=\"btn btn-primary\" type=\"submit\">Confirmar recebimento</button></div>\n  </div>\n </form></div>\n</dialog>\n<dialog id=\"ar-history-dialog\" class=\"fin-dialog\" aria-labelledby=\"ar-history-title\">\n <div class=\"dialog-head\"><div><h2 id=\"ar-history-title\">Histórico de recebimentos</h2><p>Pagamentos já vinculados ao caixa.</p></div><button type=\"button\" class=\"dialog-close\" data-ar-close=\"ar-history-dialog\" aria-label=\"Fechar\">×</button></div>\n <div class=\"dialog-body\"><div id=\"ar-history-content\"></div><div class=\"form-actions\"><button type=\"button\" class=\"btn\" data-ar-close=\"ar-history-dialog\">Fechar</button></div></div>\n</dialog>");
 $('ar-refresh').addEventListener('click',()=>refresh());
 $('ar-invoice-new').addEventListener('click',()=>invoiceOpen());
 $('ar-client-new').addEventListener('click',()=>clientOpen(false));
 $('ar-inline-client').addEventListener('click',()=>clientOpen(true));
 $('ar-search').addEventListener('input',populate);
 $('ar-filter').addEventListener('change',populate);
 $('ar-client-form').addEventListener('submit',saveClient);
 $('ar-invoice-form').addEventListener('submit',saveInvoice);
 $('ar-pay-form').addEventListener('submit',savePay);
 $('ar-pay-origin').addEventListener('change',changePayOrigin);
 $('ar-pay-form').elements.valor.addEventListener('input',movementChoices);
 $('ar-pay-form').elements.data.addEventListener('change',movementChoices);
 $('ar-pay-existing').addEventListener('change',()=>{
  const v=state.cash.find(m=>m.id===$('ar-pay-existing').value);
  if(v?.meio_pagamento && ['boleto','pix','debito','dinheiro','transferencia','outro'].includes(v.meio_pagamento))
   $('ar-pay-form').elements.meio.value=v.meio_pagamento;
 });
 document.querySelectorAll('[data-ar-close]').forEach(b=>b.addEventListener('click',()=>{
  const id=b.dataset.arClose;close(id);
  if(id==='ar-client-dialog'&&state.returnFromClient){dialog('ar-invoice-dialog');state.returnFromClient=false}
 }));
 document.addEventListener('click',e=>{
  const button=e.target.closest('[data-ar-pay],[data-ar-edit],[data-ar-cancel],[data-ar-history]');
  if(!button)return;
  const d=button.dataset;
  if(d.arPay)payOpen(d.arPay);
  else if(d.arEdit)invoiceOpen(d.arEdit);
  else if(d.arCancel)cancelAccount(d.arCancel);
  else if(d.arHistory)historyOpen(d.arHistory);
 });
 const current=new URLSearchParams(location.search).get('view');
 if(current==='receivables')$('main-content').querySelector('[data-view-panel="receivables"]').hidden=false;
 window.frReceberUI={refresh};
 if(current==='receivables')refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
