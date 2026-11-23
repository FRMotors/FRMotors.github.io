/* FR Motors | Documentos históricos de autopeças e cartões.
 * Somente leitura. Valores documentais nunca geram movimentos de caixa.
 * A inclusão (SIM/NÃO) e a classificação de pagamento vêm da planilha homologada. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const statusCore=window.frDocumentsStatusCore;
const purposeCore=window.frDocumentPurposeCore;
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'Não informado');
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const cents=v=>Math.round(Number(v)*100);
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const write=(id,text)=>{const node=$(id);if(node)node.textContent=text};
const groupName=g=>g==='autopecas'?'Autopeças':'Cartões / outros meios';
const monthOf=r=>(r.grupo==='cartoes'?r.mes_fatura:r.vencimento)?.slice(0,7)||'sem-mes';
const inYear=r=>{const y=$('doc-year')?.value||'todos';return y==='todos'||monthOf(r).slice(0,4)===y;};
let documents=[],cardPurposes=new Map(),liveMatches=new Map(),supplierCatalogue=[],selectedSuppliers=new Set(),selectionKey=null,selectionLoaded=false,selectionUserId=null,selectionSavedSnapshot=null,selectionSaving=false,page=0,monthPage=0,loading=null;
const PAGE_SIZE=35;
const MONTH_PAGE_SIZE=12;
const fields='id,grupo,codigo_origem,linha_excel,data_evento,vencimento,data_compra,mes_fatura,descricao,fornecedor_nome,cartao_nome,parcela,meio,valor_registrado,valor_cheio_documento,valor_com_desconto_informado,valor_pago_informado,data_pagamento_informada,situacao_origem,incluir,revisao_origem';
async function fetchAll(){
 const all=[],size=500;
 for(let from=0;from<10000;from+=size){
  const {data,error}=await db.from('fin_documentos_despesas')
   .select(fields).order('grupo',{ascending:true}).order('linha_excel',{ascending:true})
   .range(from,from+size-1);
  if(error)throw error;
  all.push(...(data||[]));
  if(!data||data.length<size)return all;
 }
 throw Error('Limite de 10.000 documentos excedido. A consulta foi interrompida para evitar totais incompletos.');
}
function filters(){
 const group=$('doc-type')?.value||'todos';
 const include=$('doc-include')?.value||'incluidos';
 const month=$('doc-month')?.value||'todos';
 const search=($('doc-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 return documents.filter(r=>{
  if(!inYear(r))return false;
  if(group!=='todos'&&r.grupo!==group)return false;
  if(include==='incluidos'&&!r.incluir)return false;
  if(include==='excluidos'&&r.incluir)return false;
  if(month!=='todos'&&monthOf(r)!==month)return false;
  return [r.codigo_origem,r.descricao,r.fornecedor_nome,r.cartao_nome,cardName(r.cartao_nome),r.parcela,r.situacao_origem,
   r.vencimento,r.mes_fatura,r.meio].join(' ').toLocaleLowerCase('pt-BR').includes(search);
 });
}
function summaryRows(rows,keySelector){
 const groups=new Map();
 rows.forEach(r=>{
  const key=keySelector(r)||'Não informado';
  let group=groups.get(key);
  if(!group){
   group={name:key,count:0,total:0,full:0,fullCount:0,discountQuote:0,discountCount:0,
    paid:0,paidCount:0,credits:0};
   groups.set(key,group);
  }
  group.count++;
  group.total+=cents(r.valor_registrado);
  if(r.valor_registrado<0)group.credits++;
  if(r.valor_cheio_documento!==null){group.full+=cents(r.valor_cheio_documento);group.fullCount++}
  if(r.valor_com_desconto_informado!==null){group.discountQuote+=cents(r.valor_com_desconto_informado);group.discountCount++}
  if(r.valor_pago_informado!==null){group.paid+=cents(r.valor_pago_informado);group.paidCount++}
 });
 return [...groups.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
}
function drawSummary(){
 const chosenMonth=$('doc-month')?.value||'todos';
 const inPeriod=r=>inYear(r)&&(chosenMonth==='todos'||monthOf(r)===chosenMonth);
 const included=documents.filter(r=>r.incluir&&inPeriod(r));
 const auto=included.filter(r=>r.grupo==='autopecas');
 const cards=included.filter(r=>r.grupo==='cartoes');
 const ignored=documents.filter(r=>!r.incluir&&inPeriod(r));
 write('doc-auto-count',String(auto.length));
 write('doc-auto-total',brl(auto.reduce((sum,r)=>sum+cents(r.valor_registrado),0)/100));
 write('doc-card-count',String(cards.length));
 write('doc-card-total',brl(cards.reduce((sum,r)=>sum+cents(r.valor_registrado),0)/100));
 write('doc-ignored-count',String(ignored.length));
 write('doc-paid-origin',String(auto.filter(r=>r.situacao_origem==='Pago').length));
 write('doc-credits-count',String(cards.filter(r=>r.valor_registrado<0).length));
 const summaries=summaryRows(cards,r=>cardName(r.cartao_nome));
 const cardBody=$('doc-card-rows');
 if(cardBody)cardBody.innerHTML=summaries.length?summaries.map(r=>
  '<tr><td>'+escapeHTML(r.name)+'</td><td class="money">'+r.count+'</td>'+
  '<td class="money">'+brl(r.total/100)+'</td>'+
  '<td class="money">'+r.credits+'</td></tr>'
 ).join(''):'<tr><td colspan="4" class="empty">Sem lançamentos de cartões incluídos.</td></tr>';
 // Uma compra só integra a coluna Oficina quando marcada manualmente com esta finalidade.
 // Categorias (combustível, Mercado Livre etc.) não determinam por si mesmas o uso.
 const byMonth=purposeCore.summarizeMonths(included,cardPurposes);
 const classified=[...byMonth.values()].reduce((a,v)=>{
  a.oficina+=v.oficinaCount;a.outras+=v.outrasCount;
  a.pendentes+=v.pendentesCount;a.meios+=v.meiosCount;
  a.pendentesCentavos+=v.pendentes;return a;
 },{oficina:0,outras:0,pendentes:0,meios:0,pendentesCentavos:0});
 write('doc-month-classification-note',
  classified.oficina+' compra(s) de cartão confirmadas para a oficina; '+
  classified.outras+' de outras finalidades; '+
  classified.pendentes+' sem finalidade definida ('+brl(classified.pendentesCentavos/100)+
  ' líquidos). Outros meios (PIX/débito): '+classified.meios+
  '. Compras não identificadas não entram na coluna Oficina. Use Cartões para classificar.');
 const currentMonth=$('doc-month')?.value||'todos';
 const months=[...byMonth].filter(([key])=>currentMonth==='todos'||currentMonth===key)
  .sort(([a],[b])=>(b==='sem-mes'?'0000-00':b).localeCompare(a==='sem-mes'?'0000-00':a));
 const monthPages=Math.max(1,Math.ceil(months.length/MONTH_PAGE_SIZE));
 monthPage=Math.min(Math.max(monthPage,0),monthPages-1);
 const visibleMonths=months.slice(monthPage*MONTH_PAGE_SIZE,(monthPage+1)*MONTH_PAGE_SIZE);
 const monthly=$('doc-month-rows');
 if(monthly)monthly.innerHTML=visibleMonths.length?visibleMonths.map(([m,v])=>
  '<tr><td>'+escapeHTML(m==='sem-mes'?'Sem mês':m.slice(5,7)+'/'+m.slice(0,4))+'</td>'+
  '<td class="money">'+brl(v.auto/100)+' <small>'+v.autoCount+' registros</small></td>'+
  '<td class="money">'+brl(v.oficina/100)+' <small>'+v.oficinaCount+' compras</small></td>'+
  '<td class="money">'+brl(v.outras/100)+' <small>'+v.outrasCount+' compras</small></td>'+
  '<td class="money">'+brl(v.pendentes/100)+' <small>'+v.pendentesCount+' compras</small></td>'+
  '<td class="money">'+brl(v.meios/100)+' <small>'+v.meiosCount+' lançamentos</small></td>'+
  '<td class="money">'+brl(v.card/100)+' <small>'+v.cardCount+' registros</small></td></tr>'
 ).join(''):'<tr><td colspan="7" class="empty">Nenhum mês corresponde ao filtro.</td></tr>';
 write('doc-month-paging',months.length+' mês(es) · página '+(monthPage+1)+' de '+monthPages);
 if($('doc-month-prev'))$('doc-month-prev').disabled=monthPage===0;
 if($('doc-month-next'))$('doc-month-next').disabled=monthPage>=monthPages-1;
}
async function fetchCardPurposes(){
 const rows=[],size=450;
 for(let off=0;off<10000;off+=size){
  const {data,error}=await db.from('fin_cartoes_finalidades')
   .select('lancamento_id,finalidade').eq('origem','planilha')
   .order('lancamento_id').range(off,off+size-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if((data||[]).length<size)return new Map(rows.map(r=>[r.lancamento_id,r.finalidade]));
 }
 throw Error('Quantidade de classificações ultrapassou o limite de segurança.');
}
async function fetchAccounts(){
 const out=[],size=400;
 for(let off=0;off<12000;off+=size){
  const {data,error}=await db.from('fin_contas_pagar')
   .select('id,fornecedor_nome,vencimento,valor_referencia,situacao,valor_pago,data_pagamento')
   .is('arquivado_em',null).order('id').range(off,off+size-1);
  if(error)throw error;
  out.push(...(data||[]));
  if((data||[]).length<size)return out;
 }
 throw Error('Lista de contas a pagar incompleta. Não é possível validar os estados.');
}
async function fetchSupplierRegistry(){
 const {data,error}=await db.from('fin_fornecedores').select('id,nome').order('nome',{ascending:true});
 if(error)throw error;
 return data||[];
}
function supplierYear(){return $('doc-by-supplier-year')?.value||''}
function choiceStorage(){
 if(!selectionKey||typeof window==='undefined')return null;
 try{return window.localStorage||null}catch{return null}
}
// Preferências de análise: rascunho local e salvamento confirmado por conta no Supabase.
const selectionSnapshot=values=>JSON.stringify([...values].sort());
const selectionValid=values=>Array.isArray(values)&&values.every(v=>typeof v==='string');
function selectionStatus(message){
 const button=$('doc-supplier-save');
 const dirty=selectionSavedSnapshot===null||selectionSnapshot(selectedSuppliers)!==selectionSavedSnapshot;
 if(button){button.disabled=selectionSaving||!selectionUserId||!dirty;button.textContent=selectionSaving?'Salvando...':'Salvar seleção';}
 write('doc-supplier-choice-storage',message||(!selectionUserId?'Faça login para salvar as opções.':
  dirty?'Seleção modificada. Clique em "Salvar seleção" para manter as escolhas na sua conta.':
  'Seleção salva na sua conta. Ela voltará automaticamente ao entrar novamente.'));
}
async function restoreSupplierSelection(userId){
 const nextKey=userId?'fr-motors:fornecedores-analisados:v2:'+String(userId):null;
 if(selectionLoaded&&selectionKey===nextKey)return;
 selectionLoaded=true;selectionKey=nextKey;selectionUserId=userId;selectionSavedSnapshot=null;
 selectedSuppliers=statusCore.defaultSupplierKeys(supplierCatalogue);
 const validKeys=new Set(supplierCatalogue.map(x=>x.key));
 let localFound=false;
 try{
  const raw=choiceStorage()?.getItem(selectionKey);
  if(raw!==null&&raw!==undefined){
   const saved=JSON.parse(raw);
   if(selectionValid(saved)){selectedSuppliers=new Set(saved.filter(x=>validKeys.has(x)));localFound=true;}
  }
 }catch{}
 if(!userId){selectionStatus('Conta não identificada. As escolhas ficam apenas nesta sessão.');return;}
 try{
  const {data,error}=await db.from('fin_preferencias_fornecedores')
   .select('selecionados').eq('usuario_id',userId).maybeSingle();
  if(error)throw error;
  if(data){
   if(!selectionValid(data.selecionados))throw Error('Formato salvo inválido.');
   selectedSuppliers=new Set(data.selecionados.filter(x=>validKeys.has(x)));
   selectionSavedSnapshot=selectionSnapshot(selectedSuppliers);
   selectionStatus('Preferências recuperadas da sua conta. Os fornecedores marcados estão salvos.');
  }else selectionStatus(localFound?
   'Seleção anterior deste navegador recuperada. Clique em "Salvar seleção" para gravá-la na conta.':
   'Seleção padrão carregada. Clique em "Salvar seleção" para gravá-la na conta.');
 }catch(e){
  selectionStatus('Não foi possível consultar as preferências no servidor. '+
   (localFound?'Seu rascunho local foi recuperado. ':'')+
   'Salve novamente para sincronizar. '+(e.message||''));
 }
}
function saveSupplierSelection(){
 try{choiceStorage()?.setItem(selectionKey,JSON.stringify([...selectedSuppliers]));}catch{}
 selectionStatus('Alterações aplicadas ao resumo. Clique em "Salvar seleção" para protegê-las na sua conta.');
 renderChoice();renderSupplierYears();
}
async function persistSupplierSelection(){
 if(selectionSaving)return;
 if(!selectionUserId||typeof db==='undefined'||!db){
  selectionStatus('Entre com uma conta autorizada antes de salvar.');return;
 }
 const userId=selectionUserId,keys=[...selectedSuppliers].sort(),snapshot=selectionSnapshot(keys);
 selectionSaving=true;selectionStatus('Salvando seleção...');
 let message='';
 try{
  const {data,error}=await db.from('fin_preferencias_fornecedores')
   .upsert({usuario_id:userId,selecionados:keys,atualizado_em:new Date().toISOString()},
    {onConflict:'usuario_id'}).select('selecionados').single();
  if(error)throw error;
  if(!selectionValid(data?.selecionados)||selectionSnapshot(data.selecionados)!==snapshot)
   throw Error('O servidor não confirmou as opções salvas.');
  if(userId!==selectionUserId)throw Error('A conta conectada mudou.');
  selectionSavedSnapshot=snapshot;
  message='Seleção salva na sua conta. Os fornecedores serão restaurados ao entrar novamente.';
  window.frFinanceUI?.showToast?.('Seleção de fornecedores salva.');
 }catch(e){message='Erro ao salvar na conta: '+(e.message||e)+'. O rascunho local foi preservado.';}
 finally{
  selectionSaving=false;
  selectionStatus(selectionSavedSnapshot!==null&&selectionSnapshot(selectedSuppliers)!==selectionSavedSnapshot?
   'Novas alterações ainda não foram salvas. Clique em "Salvar seleção" novamente.':message);
 }
}
function refreshSupplierYears(){
 const control=$('doc-by-supplier-year');if(!control||!statusCore)return;
 const before=control.value;
 const years=[...new Set(documents.filter(r=>r.incluir===true)
  .map(r=>String(r.grupo==='cartoes'?(r.mes_fatura||r.data_evento):(r.vencimento||r.data_evento)||'').slice(0,4))
  .filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
 control.innerHTML=years.map(y=>'<option value="'+escapeHTML(y)+'">'+escapeHTML(y)+'</option>').join('');
 const current=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date());
 control.value=years.includes(before)?before:years.includes(current)?current:years[0]||'';
}
function supplierRows(){
 const year=supplierYear();if(!statusCore||!year)return [];
 const search=statusCore.fold($('doc-by-supplier-search')?.value||'');
 return statusCore.monthlySuppliers(documents,year,selectedSuppliers).filter(r=>
  !search||statusCore.fold(r.name).includes(search));
}
const supplierSource=group=>group==='autopecas'?'Autopeças · boletos':
 group==='cartoes'?'Cartões · compras':'Cadastro · sem documentos';
function choiceRows(){
 const search=statusCore.fold($('doc-supplier-choice-search')?.value||'');
 const category=$('doc-supplier-choice-filter')?.value||'todos';
 return supplierCatalogue.filter(s=>{
  if(search&&!statusCore.fold([s.name,supplierSource(s.group)].join(' ')).includes(search))return false;
  if(category==='selecionados'&&!selectedSuppliers.has(s.key))return false;
  if(category==='fora'&&selectedSuppliers.has(s.key))return false;
  if(['autopecas','cartoes','cadastro'].includes(category)&&s.group!==category)return false;
  return true;
 });
}
function renderChoice(){
 const list=$('doc-supplier-choice-list');if(!list||!statusCore)return;
 const shown=choiceRows();
 const chosen=supplierCatalogue.filter(s=>selectedSuppliers.has(s.key));
 write('doc-supplier-selected-count',chosen.length+' de '+supplierCatalogue.length+' marcados');
 write('doc-supplier-choice-count','Catálogo completo: '+supplierCatalogue.length+' nomes por origem · '+
  chosen.length+' selecionados · '+(supplierCatalogue.length-chosen.length)+
  ' não selecionados. Exibindo '+shown.length+' conforme os filtros. Nomes da carteira Cartões devem ser revisados antes de incluir.');
 list.innerHTML=shown.length?shown.map(s=>
  '<label class="fin-doc-supplier-choice">'+
   '<input type="checkbox" data-supplier-key="'+escapeHTML(s.key)+'"'+
    (selectedSuppliers.has(s.key)?' checked':'')+'>'+
   '<span><strong>'+escapeHTML(s.name)+'</strong><small>'+escapeHTML(supplierSource(s.group))+
   ' · '+s.included+' incluídos / '+s.count+' registros'+
   (s.master?' · sem documentos associados':'')+'</small></span></label>'
 ).join(''):'<div class="empty">Nenhum fornecedor corresponde ao filtro. Limpe a pesquisa para ver todos.</div>';
}
function applySupplierMode(mode){
 if(mode==='none')selectedSuppliers=new Set();
 else if(mode==='all')selectedSuppliers=new Set(supplierCatalogue.map(s=>s.key));
 else if(mode==='auto')selectedSuppliers=new Set(supplierCatalogue.filter(s=>s.group==='autopecas').map(s=>s.key));
 else selectedSuppliers=statusCore.defaultSupplierKeys(supplierCatalogue);
 saveSupplierSelection();
}
function renderSupplierYears(){
 const tbody=$('doc-by-supplier-rows'),tfoot=$('doc-by-supplier-foot');
 if(!tbody||!tfoot)return;
 const rows=supplierRows(),auto=Array(12).fill(0),cards=Array(12).fill(0);
 let autoSum=0,cardSum=0,autoCount=0,cardCount=0;
 for(const r of rows){
  const target=r.group==='cartoes'?cards:auto;
  r.months.forEach((v,i)=>target[i]+=v);
  if(r.group==='cartoes'){cardSum+=r.total;cardCount+=r.count}
  else {autoSum+=r.total;autoCount+=r.count}
 }
 tbody.innerHTML=rows.length?rows.map(r=>
  '<tr><th scope="row">'+escapeHTML(r.name)+'</th>'+
  '<td>'+escapeHTML(supplierSource(r.group))+'</td>'+
  r.months.map(v=>'<td class="money">'+(v?brl(v/100):'—')+'</td>').join('')+
  '<td class="money"><strong>'+brl(r.total/100)+'</strong></td><td class="money">'+r.count+'</td></tr>'
 ).join(''):'<tr><td colspan="16" class="empty">Nenhum lançamento encontrado para os fornecedores selecionados neste ano.</td></tr>';
 function summaryRow(title,arr,total,qty){
  return '<tr><th scope="row">'+title+'</th><td>Fonte documental separada</td>'+
   arr.map(v=>'<td class="money">'+brl(v/100)+'</td>').join('')+
   '<td class="money"><strong>'+brl(total/100)+'</strong></td><td class="money">'+qty+'</td></tr>';
 }
 tfoot.innerHTML=summaryRow('Subtotal Autopeças',auto,autoSum,autoCount)+
  summaryRow('Subtotal Cartões',cards,cardSum,cardCount);
 write('doc-by-supplier-note',rows.length+' fornecedor(es) com lançamentos em '+supplierYear()+
  ' · '+selectedSuppliers.size+' selecionados no catálogo. Autopeças: '+brl(autoSum/100)+
  ' ('+autoCount+' registros); Cartões: '+brl(cardSum/100)+' ('+cardCount+
  ' registros). Não some origens sem conferir possíveis compras repetidas. Cartões usam competência da fatura; Autopeças usam vencimento.');
}
function exportSupplierYears(){
 if(!statusCore||!supplierYear())return;
 const header=['Fornecedor','Origem','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Total (R$)','Registros'];
 const body=supplierRows().map(r=>[r.name,supplierSource(r.group),...r.months.map(v=>
  (v/100).toFixed(2).replace('.',',')),(r.total/100).toFixed(2).replace('.',','),r.count]);
 const csv='\ufeff'+[header,...body].map(row=>row.map(csvQuoted).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;
 anchor.download='FR_Motors_Fornecedor_Origem_Mensal_'+supplierYear()+'.csv';
 document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1600);
}
function draw(){
 const list=filters(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
 page=Math.min(Math.max(page,0),pages-1);
 const slice=list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 const body=$('doc-rows');
 if(body)body.innerHTML=slice.length?slice.map(r=>{
  const card=r.grupo==='cartoes';
  const mainDate=card?r.data_evento:r.vencimento;
  const referenceDate=card?r.mes_fatura:r.vencimento;
  const match=liveMatches.get(r.id);
  const payment=match?.status==='pago'?
   '<span class="state paid">Pago · conciliado no financeiro</span>'+
   '<small>'+escapeHTML(dateBR(match.paidDate))+
   (match.valuePaid!==null?' · '+brl(match.valuePaid/100):'')+'</small>':
   match?.status==='aberto'?'<span class="state open">Em aberto no financeiro</span>':
   card?'<span class="state">Situação da fatura: consultar Cartões</span>':
   r.situacao_origem==='Pago'?'<span class="state paid">Pago informado na planilha</span>':
    '<span class="state open">Sem baixa comprovada nesta carteira</span>';
  const inclusion=r.incluir?'<span class="state">Incluído no controle</span>':'<span class="state">Excluído do controle</span>';
  const more=r.parcela?' <small>Parcela '+escapeHTML(r.parcela)+'</small>':'';
  return '<tr>'+
   '<td><strong>'+escapeHTML(r.codigo_origem)+'</strong> <small>linha '+escapeHTML(r.linha_excel)+'</small></td>'+
   '<td>'+escapeHTML(groupName(r.grupo))+'</td>'+
   '<td>'+escapeHTML(r.fornecedor_nome||r.descricao||'Não informado')+
   '<small>'+escapeHTML(r.descricao||'')+'</small>'+more+'</td>'+
   '<td>'+escapeHTML(card?cardName(r.cartao_nome):(r.cartao_nome||r.meio||'Boleto'))+'</td>'+
   '<td>'+escapeHTML(dateBR(mainDate))+'<small>'+escapeHTML(card?'Mês fatura: ':'Vencimento: ')+escapeHTML(dateBR(referenceDate))+'</small></td>'+
   '<td class="money">'+brl(r.valor_registrado)+'</td>'+
   '<td class="money">'+(r.valor_cheio_documento===null?'—':brl(r.valor_cheio_documento))+'</td>'+
   '<td class="money">'+(r.valor_com_desconto_informado===null?'—':brl(r.valor_com_desconto_informado))+'</td>'+
   '<td class="money">'+(r.valor_pago_informado===null?'—':brl(r.valor_pago_informado)+
     '<small>'+escapeHTML(dateBR(r.data_pagamento_informada))+'</small>')+'</td>'+
   '<td>'+payment+'<small>'+inclusion+'</small><small class="fin-doc-original">Original da planilha: '+escapeHTML(r.situacao_origem||'A confirmar')+'</small></td></tr>';
 }).join(''):'<tr><td colspan="10" class="empty">Nenhum documento corresponde aos filtros.</td></tr>';
 const sum=list.reduce((v,r)=>v+cents(r.valor_registrado),0);
 write('doc-found',list.length+' de '+documents.length+' documentos · página '+(page+1)+' de '+pages);
 write('doc-selected-total',brl(sum/100)+' (total documental filtrado, não caixa)');
 if($('doc-prev'))$('doc-prev').disabled=page===0;
 if($('doc-next'))$('doc-next').disabled=page>=pages-1;
 drawSummary();
}
function updateYears(){
 const sel=$('doc-year');if(!sel)return;
 const prior=sel.value||'todos';
 const years=[...new Set(documents.map(monthOf).filter(m=>/^\d{4}-\d{2}$/.test(m)).map(m=>m.slice(0,4)))].sort().reverse();
 sel.replaceChildren(new Option('Todos os anos','todos'),...years.map(y=>new Option(y,y)));
 if(years.includes(prior))sel.value=prior;
}
function updateMonths(){
 const sel=$('doc-month');if(!sel)return;
 const value=sel.value||'todos';
 const months=[...new Set(documents.filter(inYear).map(monthOf))]
  .sort((a,b)=>(b==='sem-mes'?'0000-00':b).localeCompare(a==='sem-mes'?'0000-00':a));
 sel.replaceChildren(new Option('Todos os meses','todos'),
   ...months.map(m=>new Option(m==='sem-mes'?'Sem mês':m.slice(5,7)+'/'+m.slice(0,4),m)));
 if(months.includes(value))sel.value=value;
}
function csvQuoted(s){
 let value=String(s??'');
 // Texto de origem não deve executar fórmulas quando o CSV for aberto em planilhas.
 if(/^[\s\x00-\x1f]*[=+@]/.test(value)||
   (/^[\s\x00-\x1f]*-/.test(value)&&!/^\s*-\d+(?:[,.]\d+)?\s*$/.test(value))){
  value="'"+value;
 }
 return '"'+value.replace(/"/g,'""')+'"';
}
function exportCsv(){
 const rows=filters();
 const cols=[['Origem','Código','Linha Excel','Incluir','Descrição','Fornecedor','Cartão','Parcela','Data evento','Vencimento','Mês fatura',
 'Valor registrado','Valor cheio documento','Valor com desconto informado','Valor pago informado','Data pagamento informada','Situação na planilha']];
 for(const r of rows)cols.push([
  r.grupo,r.codigo_origem,r.linha_excel,r.incluir?'SIM':'NÃO',r.descricao,r.fornecedor_nome||'',r.cartao_nome||'',r.parcela||'',
  r.data_evento||'',r.vencimento||'',r.mes_fatura||'',
  Number(r.valor_registrado).toFixed(2).replace('.',','),
  r.valor_cheio_documento===null?'':Number(r.valor_cheio_documento).toFixed(2).replace('.',','),
  r.valor_com_desconto_informado===null?'':Number(r.valor_com_desconto_informado).toFixed(2).replace('.',','),
  r.valor_pago_informado===null?'':Number(r.valor_pago_informado).toFixed(2).replace('.',','),
  r.data_pagamento_informada||'',r.situacao_origem||''
 ]);
 const csv='\ufeff'+cols.map(row=>row.map(csvQuoted).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='FR_Motors_Autopecas_Cartoes_Historico_Filtrado.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
 write('doc-status','Exportação CSV gerada com '+rows.length+' documentos filtrados. Nenhum lançamento financeiro foi criado.');
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  write('doc-status','Consultando autopeças e cartões homologados...');
  try{
   if(typeof db==='undefined'||!db)throw Error('Conexão indisponível.');
   const {data:allowed,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||allowed!==true)throw Error('Acesso financeiro não autorizado.');
   if(!statusCore||!purposeCore)throw Error('Módulo de conciliação ou finalidades indisponível. Recarregue.');
   const [rows,accounts,registered,purposes]=await Promise.all([fetchAll(),fetchAccounts(),fetchSupplierRegistry(),fetchCardPurposes()]);
   cardPurposes=purposes;
   supplierCatalogue=statusCore.supplierCatalogue(rows,registered);
   const user=await db.auth?.getUser?.();
   await restoreSupplierSelection(user?.data?.user?.id||null);
   liveMatches=statusCore.matchLiveDocs(rows,accounts);
   documents=rows.sort((a,b)=>{
    const m1=monthOf(a)==='sem-mes'?'0000-00':monthOf(a);
    const m2=monthOf(b)==='sem-mes'?'0000-00':monthOf(b);
    return m2.localeCompare(m1)||
      String(b.data_evento||b.vencimento||'').localeCompare(String(a.data_evento||a.vencimento||''))||
      b.linha_excel-a.linha_excel;
   });
   updateYears();updateMonths();refreshSupplierYears();draw();renderChoice();renderSupplierYears();
   const included=documents.filter(r=>r.incluir).length,ignored=documents.length-included;
   write('doc-status','Histórico conferido: '+documents.length+' documentos, '+included+
    ' incluídos e '+ignored+' excluídos. '+liveMatches.size+' documento(s) associados ao operacional, sem alterar os lançamentos financeiros.');
  }catch(e){
   write('doc-status','Falha ao carregar documentos históricos: '+(e.message||e));
   if($('doc-rows'))$('doc-rows').innerHTML='<tr><td colspan="10" class="empty">Não foi possível consultar os documentos.</td></tr>';
   liveMatches=new Map();
   if($('doc-by-supplier-rows'))$('doc-by-supplier-rows').textContent='Dados indisponíveis';
  }
 })();
 try{await loading}finally{loading=null;}
}
function setup(){
 if(!$('doc-rows'))return;
 $('doc-year')?.addEventListener('change',()=>{updateMonths();page=0;monthPage=0;draw()});
 for(const id of ['doc-type','doc-include','doc-month'])
  $(id)?.addEventListener('change',()=>{page=0;if(id==='doc-month')monthPage=0;draw()});
 $('doc-search')?.addEventListener('input',()=>{page=0;draw()});
 $('doc-prev')?.addEventListener('click',()=>{page--;draw()});
 $('doc-next')?.addEventListener('click',()=>{page++;draw()});
 $('doc-month-prev')?.addEventListener('click',()=>{monthPage--;drawSummary()});
 $('doc-month-next')?.addEventListener('click',()=>{monthPage++;drawSummary()});
 $('doc-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 $('doc-by-supplier-year')?.addEventListener('change',renderSupplierYears);
 $('doc-by-supplier-search')?.addEventListener('input',renderSupplierYears);
 $('doc-by-supplier-export')?.addEventListener('click',exportSupplierYears);
 $('doc-supplier-choice-search')?.addEventListener('input',renderChoice);
 $('doc-supplier-choice-filter')?.addEventListener('change',renderChoice);
 $('doc-supplier-choice-list')?.addEventListener('change',event=>{
  const input=event.target.closest?.('input[data-supplier-key]');
  if(!input)return;
  if(input.checked)selectedSuppliers.add(input.dataset.supplierKey);
  else selectedSuppliers.delete(input.dataset.supplierKey);
  saveSupplierSelection();
 });
 $('doc-supplier-pick-default')?.addEventListener('click',()=>applySupplierMode('default'));
 $('doc-supplier-pick-auto')?.addEventListener('click',()=>applySupplierMode('auto'));
 $('doc-supplier-pick-all')?.addEventListener('click',()=>applySupplierMode('all'));
 $('doc-supplier-pick-none')?.addEventListener('click',()=>applySupplierMode('none'));
  $('doc-supplier-save')?.addEventListener('click',()=>persistSupplierSelection());

 $('doc-export')?.addEventListener('click',exportCsv);
}
window.frDocumentsUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
