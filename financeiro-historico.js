/* FR Motors · Histórico homologado: Itaú isolado das outras fontes. Somente SELECT. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.frItauCore;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const count=n=>new Intl.NumberFormat('pt-BR').format(Number(n)||0);
const num=n=>Number(n)||0;
const sum=(rows,k)=>rows.reduce((a,r)=>a+Math.round(num(r[k])*100),0)/100;
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Sem data';
const monthBR=v=>v?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(String(v).slice(0,7)+'-01T12:00:00Z')).replace('.',''):'Sem data';
const state={lote:null,monthly:[],cards:[],parts:[],open:[],categories:[],banks:[],importedPending:[],approvedImported:[],officialCutoff:'',latestImportedDate:'',referenceCheck:null,weakMatchCount:0,approvedMatchCount:0};
let loading=null,ready=false,activeTab='cards',initialized=false,previousMaxMonth='';
function status(id,message,error=false){
 const el=$(id);if(!el)return;el.textContent=message;el.className='status'+(error?' bad':' ok');
}
function metric(label,value,note,kind=''){
 return '<article class="hist-kpi"><span class="hist-kpi-label">'+safe(label)+'</span>'+
 '<strong class="hist-kpi-value '+safe(kind)+'">'+safe(value)+'</strong>'+
 '<span class="hist-kpi-caption">'+safe(note)+'</span></article>';
}
function renderError(message){
 status('hist-itau-status',message,true);
 status('hist-other-status',message,true);
}
async function query(table,cols,lote){
 const {data,error}=await db.from(table).select(cols).eq('lote_id',lote);
 if(error)throw Error(table+': '+error.message);
 return data||[];
}
/* Atualização somente de leitura para o PDF bancário mais recente.
   Não soma PDFs sobrepostos ao Excel homologado nem grava movimentações. */
async function fetchImportLines(importId){
 const result=[],chunk=400,max=4000;
 for(let off=0;off<max;off+=chunk){
  const {data,error}=await db.from('fin_teste_import_linhas')
   .select('id,importacao_id,data_lancamento,descricao,natureza,valor')
   .eq('importacao_id',importId).order('data_lancamento',{ascending:false}).order('id',{ascending:true})
   .range(off,off+chunk-1);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<chunk)return result;
 }
 throw Error('O arquivo excedeu 4.000 lançamentos; não é possível mostrar um resumo parcial.');
}
function importTotals(rows){
 const entries=rows.filter(r=>r.natureza==='entrada');
 const exits=rows.filter(r=>r.natureza==='saida');
 return {count:rows.length,entries:sum(entries,'valor'),exits:sum(exits,'valor')};
}
/* Conciliação demonstrável: o saldo homologado é a base. Os PDFs são
 * janelas sobrepostas, por isso cada ocorrência física é contada uma vez.
 * A data do último movimento homologado define a janela de atualização. */
async function fetchPages(makeQuery,max=12000){
 const records=[],limit=400;
 for(let offset=0;offset<max;offset+=limit){
  const {data,error}=await makeQuery().range(offset,offset+limit-1);
  if(error)throw error;
  records.push(...(data||[]));
  if(!data||data.length<limit)return records;
 }
 throw Error('Dados acima do limite de consulta; cálculo bloqueado para evitar saldo parcial.');
}
async function renderItauReconciliation(){
 const label=$('hist-itau-reconcile-source'),root=$('hist-itau-reconcile-kpis'),
  headline=$('hist-itau-reconcile-headline'),difference=$('hist-itau-reconcile-diff'),
  note=$('hist-itau-reconcile-note'),table=$('hist-itau-reconcile-rows');
 if(!label||!root||!headline||!difference||!note||!table||!state.monthly.length)return;
 label.textContent='Comparando importações com o último movimento homologado...';
 try{
  const [imports,latestResponse,refResponse,audits,excelTailResponse,confirmations,approvedBank]=await Promise.all([
   fetchPages(()=>db.from('fin_teste_importacoes')
    .select('id,arquivo_nome,criado_em,conta_nome')
    .eq('tipo','banco').order('criado_em',{ascending:true}).order('id',{ascending:true})),
   db.from('fin_movimentos').select('data_movimento')
    .eq('origem','fluxo_caixa_homologado').eq('estado','confirmado')
    .order('data_movimento',{ascending:false}).limit(1).maybeSingle(),
   db.from('fin_saldos_bancarios_referencia')
    .select('data_referencia,saldo,origem').eq('conta','itau')
    .order('data_referencia',{ascending:false}).limit(1).maybeSingle(),
   db.from('fin_importacao_duplicidades_auditoria')
    .select('id',{count:'exact',head:true}),
   db.from('fin_teste_excel_linhas').select('data_evento')
    .eq('lote_id',state.lote.id).in('grupo',['entradas_fluxo','saidas_fluxo'])
    .order('data_evento',{ascending:false}).limit(1).maybeSingle(),
   fetchPages(()=>db.from('fin_conciliacao_confirmacoes')
    .select('linha_id,movimento_homologado_id,situacao,confirmado_em')
     .eq('situacao','conferido').order('linha_id',{ascending:true})),
   fetchPages(()=>db.from('fin_movimentos')
    .select('id,data_movimento,tipo,valor,descricao,dados_origem')
    .eq('origem','extrato_itau_homologado').eq('estado','confirmado')
    .order('data_movimento',{ascending:true}).order('id',{ascending:true}))
  ]);
  if(latestResponse.error)throw latestResponse.error;
  if(refResponse.error)throw refResponse.error;
  if(audits.error)throw audits.error;
  if(excelTailResponse.error)throw excelTailResponse.error;
  const cutoff=latestResponse.data?.data_movimento;
  if(!cutoff)throw Error('Sem data final do caixa homologado; não é seguro somar lançamentos.');
  core.ensureSnapshotMatches(excelTailResponse.data?.data_evento,cutoff);
  const bankFiles=imports.filter(x=>core.accountIsItau(x.conta_nome));
  if(!bankFiles.length)throw Error('Nenhum PDF do Itaú importado.');
  const lines=[];
  for(let i=0;i<bankFiles.length;i+=30){
   const ids=bankFiles.slice(i,i+30).map(x=>x.id);
   const part=await fetchPages(()=>db.from('fin_teste_import_linhas')
    .select('id,importacao_id,data_lancamento,descricao,natureza,valor')
    .in('importacao_id',ids).order('data_lancamento',{ascending:true}).order('id',{ascending:true}));
   lines.push(...part);
  }
  const official=await fetchPages(()=>db.from('fin_movimentos')
   .select('id,data_movimento,tipo,valor,descricao')
   .in('origem',['fluxo_caixa_homologado','extrato_itau_homologado'])
   .eq('estado','confirmado').gte('data_movimento',cutoff)
   .order('data_movimento',{ascending:true}).order('id',{ascending:true}));
  const {canonical,repeated}=core.canonicalBank(bankFiles,lines);
  const baseline=state.monthly[state.monthly.length-1];
  const rec=core.reconcile(baseline.saldo_teorico_acumulado,canonical,official,cutoff);
  const latestDate=canonical.map(r=>r.data_lancamento).sort().pop()||cutoff;
  // Movimentos aprovados têm origem própria e são contados uma única vez.
  // O Excel homologado nunca é sobrescrito pelos PDFs importados.
  const approvedIds=new Set(approvedBank.map(x=>String(x.dados_origem?.linha_importada_id||'')));
  const approvedImported=canonical.filter(x=>approvedIds.has(String(x.id)));
  if(approvedImported.length!==approvedBank.length)
   throw Error('Uma homologação bancária não corresponde a uma linha única de extrato.');
  const approvedNet=approvedBank.reduce((sum,x)=>
   sum+(x.tipo==='entrada'?1:-1)*core.cents(x.valor),0);
  const recWithApproved={...rec,baseCents:rec.baseCents+approvedNet,
   balanceCents:rec.balanceCents+approvedNet};
  state.importedPending=rec.pending.filter(row=>row.data_lancamento>=cutoff);
  state.approvedImported=approvedImported;
  state.officialCutoff=cutoff;
  state.latestImportedDate=latestDate>cutoff?latestDate:cutoff;
  const reference=refResponse.data;
  const validation=core.compareBankReference(recWithApproved,reference,cutoff,state.latestImportedDate);
  // O OK manual do consolidado vale também na conciliação do Itaú.
  // Só suprime alertas quando as DUAS IDs do par aprovado coincidem.
  const {waiting,approved}=core.reviewWeakMatches(rec.weakMatches,confirmations);
  const approvedSet=new Set(approved.map(match=>match.bank.id));
  const isApproved=match=>approvedSet.has(match.bank.id);
  state.referenceCheck=validation;
  state.weakMatchCount=waiting.length;
  state.approvedMatchCount=approved.length;
  const projected=recWithApproved.balanceCents/100;
  const opening=state.monthly.reduce((v,r)=>v+core.cents(r.saldo_abertura||0),0);
  const historicalNet=state.monthly.reduce((v,r)=>v+core.cents(r.resultado_operacional||0),0);
  const officialResult=historicalNet+approvedNet;
  const firstMonth=String(state.monthly[0]?.mes||'').slice(0,7);
  const lastApproved=approvedBank.map(x=>x.data_movimento).sort().pop()||cutoff;
  const summary=approvedBank.length+' lançamento(s) de extrato aprovado(s) e '+
    rec.pending.length+' em conferência. Saldo estimado não é saldo bancário confirmado.';
  for(const id of ['itau-balance-overview','itau-balance-reports']){
   const putField=(name,value)=>{const e=$(id+'-'+name);if(e)e.textContent=value;};
   putField('result',money(officialResult/100));
   putField('result-date','Desde '+firstMonth+' até '+dateBR(lastApproved)+
    ' · entradas − saídas homologadas, sem saldo inicial');
   putField('opening',money(opening/100));
   putField('opening-date','Saldo inicial da base de '+firstMonth);
   putField('balance',money(projected));
   putField('balance-date','Estimativa até '+dateBR(state.latestImportedDate)+
    ' · inclui extratos ainda em conferência');
   putField('info',summary+(reference?' Última referência bancária: '+dateBR(reference.data_referencia)+'.':''));
   $(id+'-result')?.classList.toggle('itau-balance-negative',officialResult<0);
   $(id+'-balance')?.classList.toggle('itau-balance-negative',projected<0);
  }
  window.frItauApprovalUI?.render({pending:state.importedPending,cutoff,
   approved:approvedBank.length,weak:waiting.length});
  label.textContent='Histórico Excel até '+dateBR(cutoff)+
   ' + PDFs homologados + extratos ainda em conferência até '+dateBR(latestDate);
  root.innerHTML=
   metric('Saldo histórico do Excel',money(baseline.saldo_teorico_acumulado),
    'Base homologada; sem lançar os boletos novamente')+
   metric('Entradas em conferência',money(rec.addedIn/100),
    count(rec.pending.filter(r=>r.natureza==='entrada').length)+' lançamento(s)','positive')+
   metric('Saídas em conferência',money(rec.addedOut/100),
    count(rec.pending.filter(r=>r.natureza==='saida').length)+' lançamento(s)')+
   metric('Saldo estimado até '+dateBR(state.latestImportedDate),money(projected),
    'Prévia estimada; '+approvedBank.length+' novo(s) movimento(s) homologado(s)',
    projected<0?'negative':'positive');
  const comparisonCents=validation.differenceCents;
  if(validation.status==='conferido'||validation.status==='divergente'){
   const delta=comparisonCents;
   const weak=waiting.length;
   const message=delta===0?'Conciliação aritmética confere com a referência bancária.':
    'Diferença de conciliação: '+money(delta/100)+'. Revise antes de considerar o saldo conferido.';
   difference.textContent=message+' Referência em '+dateBR(validation.referenceDate)+
    ': '+money(validation.bankCents/100)+'. '+count(rec.pending.length)+' novo(s), '+
    count(repeated.length)+' repetido(s) descartado(s). '+
    (weak?count(weak)+' vínculo(s) somente por data, tipo e valor, com descrição diferente; exige revisão.':'')+
    (approved.length?' '+count(approved.length)+' correspondência(s) conferida(s) manualmente.':'');
   difference.classList.toggle('hist-reconcile-mismatch',delta!==0||weak>0);
   difference.classList.toggle('hist-reconcile-ok',delta===0&&weak===0);
  }else{
   difference.textContent='Saldo estimado até '+dateBR(state.latestImportedDate)+
    '. '+(reference?'A referência de '+dateBR(reference.data_referencia)+' ('+money(reference.saldo)+
    ') está fora da janela comparável.':'Sem referência bancária independente.')+
    ' Não é possível confirmar o saldo sem referência contemporânea.';
   difference.classList.remove('hist-reconcile-ok');
   difference.classList.add('hist-reconcile-mismatch');
  }
  headline.innerHTML=
   metric('Saldo estimado (a conferir)',money(projected),
    'Calculado até '+dateBR(latestDate),projected<0?'negative':'positive')+
   metric('Diferença do banco',comparisonCents===null?'A conferir':money(comparisonCents/100),
    comparisonCents===null?'Sem referência comparável':'Comparado ao saldo informado em '+dateBR(reference.data_referencia),
    comparisonCents===0?'positive':comparisonCents===null?'':'negative')+
   metric('Lançamentos novos',count(rec.pending.length),
    count(repeated.length)+' repetição(ões) ignorada(s); '+count(waiting.length)+' vínculo(s) pendente(s), '+count(approved.length)+' conferido(s)');
  note.textContent='Verificação automática, desde '+dateBR(cutoff)+': '+count(lines.length)+' registros originais em '+
   count(bankFiles.length)+' arquivo(s); '+count(repeated.length)+
   ' repetição(ões) entre PDFs não contabilizada(s), '+count(rec.already.length)+
   ' movimento(s) já presente(s) no fluxo homologado a partir de '+dateBR(cutoff)+
   ', '+count(rec.pending.length)+' lançamento(s) adicional(is). '+
   count(audits.count||0)+' registro(s) antigo(s) marcado(s) como cancelado(s) com auditoria. '+
   'Registros anteriores ao fechamento ficam fora; os do próprio dia são adicionados somente se não houver correspondente no caixa homologado. Nenhum pagamento é criado, excluído ou duplicado. Cartões são conferidos separadamente.';
  const pendingRows=rec.pending.map(r=>({...r,
   decisao:'Somente no saldo estimado · ainda em conferência',badge:'new'}));
  const approvedRows=approvedImported.map(r=>({...r,
   decisao:'Homologado manualmente · entrou no caixa oficial',badge:'confirmed'}));
  const duplicateRows=repeated.map(r=>({...r,decisao:'Repetido · ignorado',badge:'duplicate'}));
  const weakRows=rec.weakMatches.map(r=>({
   ...r.bank,
   decisao:isApproved(r)?
    'Correspondência conferida manualmente · Excel: '+String(r.official.descricao||'sem descrição'):
    'Correspondência pendente por data/tipo/valor · Excel: '+String(r.official.descricao||'sem descrição'),
   badge:isApproved(r)?'confirmed':'review'
  }));
  const entries=[...pendingRows,...approvedRows,...duplicateRows,...weakRows]
   .sort((a,b)=>String(b.data_lancamento).localeCompare(String(a.data_lancamento))||
    String(a.descricao).localeCompare(String(b.descricao))).slice(0,100);
  table.innerHTML=entries.length?entries.map(r=>
   '<tr><td>'+dateBR(r.data_lancamento)+'</td>'+
   '<td><strong>'+safe(r.descricao)+'</strong><small class="hist-subline">'+safe(r.arquivo_nome)+'</small></td>'+
   '<td>'+(r.natureza==='entrada'?'Entrada':'Saída')+'</td>'+
   '<td class="money">'+money(r.valor)+'</td>'+
   '<td><span class="hist-reconcile-flag '+r.badge+'">'+safe(r.decisao)+'</span></td></tr>'
  ).join(''):'<tr><td colspan="5" class="hist-empty">Nenhum ajuste necessário neste período.</td></tr>';
 }catch(e){
  state.importedPending=[];state.approvedImported=[];state.officialCutoff='';state.latestImportedDate='';
  window.frItauApprovalUI?.render({pending:[],cutoff:'',approved:0,weak:0});
  state.referenceCheck=null;state.weakMatchCount=0;state.approvedMatchCount=0;
  label.textContent='Falha de conciliação. Saldo não calculado.';
  root.innerHTML='';headline.innerHTML='';
  difference.textContent='Conciliação indisponível: '+String(e.message||e);
  difference.classList.add('hist-reconcile-mismatch');
  note.textContent='Cálculo bloqueado para não mostrar números parciais ou possivelmente duplicados.';
  table.innerHTML='<tr><td colspan="5" class="hist-empty">Dados de conciliação indisponíveis.</td></tr>';
  throw e;
 }
}

async function refreshImportedItau(){
 const source=$('hist-itau-import-source'),kpis=$('hist-itau-import-kpis'),compare=$('hist-itau-import-compare');
 if(!source||!kpis||!compare)return;
 source.textContent='Consultando a última importação do banco...';
 try{
  const imports=await fetchPages(()=>db.from('fin_teste_importacoes')
   .select('id,arquivo_nome,criado_em,conta_nome,linhas_selecionadas')
   .eq('tipo','banco').order('criado_em',{ascending:false}).order('id',{ascending:false}));
  const [latest,previous]=imports.filter(row=>core.accountIsItau(row.conta_nome)).slice(0,2);
  if(!latest){
   source.textContent='Nenhum extrato bancário do Itaú importado.';
   kpis.innerHTML='';compare.textContent='Faça a importação pela página Importações.';
   return;
  }
  const [current,prior]=await Promise.all([
   fetchImportLines(latest.id),
   previous?fetchImportLines(previous.id):Promise.resolve([])
  ]);
  const valid=current.filter(r=>r.natureza==='entrada'||r.natureza==='saida');
  const total=importTotals(valid);
  const dates=valid.map(r=>String(r.data_lancamento||'').slice(0,10)).filter(Boolean).sort();
  const stamp=latest.criado_em?new Date(latest.criado_em).toLocaleString('pt-BR',{
   day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'
  }):'data não informada';
  source.textContent='Arquivo: '+latest.arquivo_nome+' · importado em '+stamp+
   (dates.length?' · movimentos de '+dateBR(dates[0])+' a '+dateBR(dates[dates.length-1]):'');
  kpis.innerHTML=
   metric('Entradas no PDF',money(total.entries),count(valid.filter(r=>r.natureza==='entrada').length)+' lançamentos','positive')+
   metric('Saídas no PDF',money(total.exits),count(valid.filter(r=>r.natureza==='saida').length)+' lançamentos')+
   metric('Resultado deste PDF',money(Math.round((total.entries-total.exits)*100)/100),
    'Não é o saldo bancário',(total.entries-total.exits)<0?'negative':'positive')+
   metric('Registros importados',count(total.count),count(current.length)+' selecionados, sem somar ao Excel');
  if(!previous){
   compare.textContent='Este é o primeiro extrato Itaú importado. O saldo do histórico homologado permanece independente.';
  }else{
   const comp=core.canonicalBank([previous,latest],
    [...prior.filter(r=>r.natureza==='entrada'||r.natureza==='saida'),...valid]);
   const newRows=comp.canonical.filter(r=>r.importacao_id===latest.id);
   const duplicateRows=comp.repeated.filter(r=>r.importacao_id===latest.id);
   const novel=importTotals(newRows);
   compare.textContent='Comparação com o extrato anterior ('+previous.arquivo_nome+'): '+
    count(duplicateRows.length)+' repetição(ões) entre PDFs usando identificação e ocorrências; '+
    count(newRows.length)+' movimento(s) sem correspondência neste par de arquivos. '+
    'Valores sem correspondência: entradas '+money(novel.entries)+' e saídas '+money(novel.exits)+
    '. A conciliação total confere todos os arquivos com o fechamento oficial.';
  }
  if(current.length!==valid.length)compare.textContent+=' Há '+(current.length-valid.length)+' linha(s) com natureza não reconhecida.';
 }catch(e){
  source.textContent='Não foi possível consultar a última importação Itaú.';
  kpis.innerHTML='';
  compare.textContent='Falha na consulta: '+String(e.message||e);
 }
}

async function refresh(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   state.importedPending=[];state.officialCutoff='';state.latestImportedDate='';
   status('hist-itau-status','Consultando o histórico homologado e os extratos posteriores...');
   status('hist-other-status','Consultando as fontes financeiras...');
   if(!core)throw Error('Motor de conciliação Itaú não carregado. Atualize a página.');
   if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
   await refreshImportedItau();
   const {data:lote,error}=await db.from('fin_teste_excel_lotes')
    .select('id,arquivo_nome,esperado_linhas,status,concluido_em')
    .eq('status','conferido').order('concluido_em',{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;
   if(!lote)throw Error('Nenhum arquivo Financeiro Unificado homologado. Importe e confira a planilha na aba Importações.');
   const [monthly,cards,parts,open,categories,banks]=await Promise.all([
    query('fin_teste_excel_itau_mensal','mes,entradas_operacionais,saldo_abertura,saidas,entradas_qtd,saidas_qtd,resultado_operacional,saldo_teorico_acumulado',lote.id),
    query('fin_teste_excel_cartoes_resumo','fonte,modalidade,qtd,total_historico,total_incluido,total_excluido,qtd_excluida,sem_data',lote.id),
    query('fin_teste_excel_fornecedores_resumo','fornecedor,qtd,valor_cheio,valor_incluido,valor_excluido,qtd_excluida,previsto_incluido,pago_real,qtd_paga,qtd_confirmar',lote.id),
    query('fin_teste_excel_abertos_mensal','mes,qtd,total',lote.id),
    query('fin_teste_excel_itau_categorias','grupo,categoria,qtd,total',lote.id),
    query('fin_teste_excel_pix_debito_itau','linha_excel,descricao,data_evento,mes_referencia,valor,meio_pagamento,situacao_analise',lote.id)
   ]);
   Object.assign(state,{lote,
    monthly:monthly.sort((a,b)=>a.mes.localeCompare(b.mes)),
    cards:cards.sort((a,b)=>num(b.total_incluido)-num(a.total_incluido)),
    parts:parts.sort((a,b)=>num(b.valor_incluido)-num(a.valor_incluido)),
    open:open.sort((a,b)=>(a.mes||'9999').localeCompare(b.mes||'9999')),
    categories:categories.sort((a,b)=>num(b.total)-num(a.total)),
    banks});
   ready=true;
   renderOther();
   await renderItauReconciliation();
   // A navegação mensal consome a mesma lista de PDFs já conciliados, sem criar outra baixa.
   // Um erro na listagem não modifica o cálculo principal do Itaú.
   await window.frItauMonthsUI?.refresh?.({
    pending:state.importedPending,
    cutoff:state.officialCutoff
   });
   renderItau();
   const check=state.referenceCheck;
   const hasRisk=check?.status!=='conferido'||state.weakMatchCount>0;
   const message=state.importedPending.length?
    'Prévia Itaú até '+dateBR(state.latestImportedDate)+' · '+count(state.importedPending.length)+
    ' movimento(s) não homologado(s), caixa oficial preservado. '+
    (check?.status==='conferido'?'Saldo comparado com referência bancária.':'Saldo sem confirmação bancária.'):
    'Histórico Itaú carregado, sem extratos adicionais. Fonte: '+lote.arquivo_nome+'.';
   status('hist-itau-status',message+(state.weakMatchCount?' Revise '+count(state.weakMatchCount)+' vínculo(s) por valor/data.':''),hasRisk);
   status('hist-other-status','Fontes homologadas atualizadas. Nenhum lançamento operacional foi modificado.');
  }catch(e){
   ready=false;
   window.frPendingUI?.publish('itau',null);
   renderError('Não foi possível atualizar o Itaú: '+e.message);
   for(const id of ['hist-itau-kpis','hist-itau-monthly','hist-itau-chart']){
    const element=$(id);if(element)element.innerHTML='';
   }
   throw e;
  }
  finally{loading=null}
 })();
 return loading;
}
function open(view){
 // Recarregar tudo ao entrar no Itaú, inclusive PDFs importados após a última consulta.
 if(view==='itau'||!ready){refresh().catch(()=>{});return}
 renderOther();
}
/* O relatório mistura, apenas em memória, o lote homologado com PDFs não conciliados desde
   ao fechamento. A fonte original e os pagamentos confirmados não são alterados. */
function reportMonths(){
 return core.buildMonthly(state.monthly,
  [...state.approvedImported,...state.importedPending],state.officialCutoff);
}
function period(){
 const months=reportMonths();
 const a=$('hist-itau-from'),b=$('hist-itau-to');
 if(!months.length)return [];
 const min=months[0].mes.slice(0,7),max=months[months.length-1].mes.slice(0,7);
 if(!a.value)a.value=min;
 if(!b.value||b.value===previousMaxMonth)b.value=max;
 previousMaxMonth=max;
 a.min=b.min=min;a.max=b.max=max;
 if(a.value>b.value){status('hist-itau-status','O mês inicial deve ser anterior ou igual ao mês final.',true);return null}
 return months.filter(r=>r.mes.slice(0,7)>=a.value&&r.mes.slice(0,7)<=b.value);
}
function renderItau(){
 if(!ready)return;
 const selected=period();
 if(selected===null)return;
 const start=$('hist-itau-from').value,end=$('hist-itau-to').value;
 const income=sum(selected,'entradas_operacionais');
 const expenses=sum(selected,'saidas');
 const opening=sum(selected,'saldo_abertura');
 const result=income-expenses;
 const last=selected.length?num(selected[selected.length-1].saldo_teorico_acumulado):0;
 $('hist-itau-period-note').textContent=selected.length?
  selected.length+' mês(es) · '+(state.importedPending.length?'prévia de extratos até '+dateBR(state.latestImportedDate)+'; sem baixa no caixa oficial':'saldo histórico, não confirmado pelo banco'):
  'Nenhum movimento registrado nesse intervalo.';
 const sourceLabel=$('hist-itau-data-sources');
 if(sourceLabel)sourceLabel.textContent=state.importedPending.length?
  'Histórico homologado até '+dateBR(state.officialCutoff)+' + '+count(state.importedPending.length)+' movimento(s) importado(s) até '+dateBR(state.latestImportedDate)+'. Prévia somente para consulta.':
  'Histórico homologado do Excel, sem novos extratos incorporados.';
 $('hist-itau-kpis').innerHTML=
 metric('Entradas (histórico + prévia)',money(income),count(selected.reduce((s,r)=>s+num(r.entradas_qtd),0))+' lançamentos · sem saldo inicial','positive')+
 metric('Saídas (histórico + prévia)',money(expenses),count(selected.reduce((s,r)=>s+num(r.saidas_qtd),0))+' pagamentos registrados no Itaú')+
 metric('Resultado operacional',money(result),'Entradas operacionais menos saídas; não é lucro contábil',result<0?'negative':'positive')+
 metric('Saldo estimado (a conferir)',money(last),'Histórico mais extratos não homologados até '+(selected.length?monthBR(selected[selected.length-1].mes):'o período')+(opening?' · saldo inicial no recorte: '+money(opening):''),last<0?'negative':'positive');
 drawChart(selected);
 const categories=state.categories.filter(r=>r.grupo==='saidas_fluxo');
 const max=Math.max(1,...categories.map(r=>num(r.total)));
 $('hist-itau-categories').innerHTML=categories.slice(0,8).map(r=>
  '<div class="hist-category-item"><div class="hist-category-top"><span>'+safe(r.categoria)+'</span><strong>'+money(r.total)+
  '</strong></div><div class="hist-category-track"><div class="hist-category-fill" style="width:'+Math.max(1,Math.min(100,num(r.total)/max*100))+'%"></div></div>'+
  '<span class="hist-category-hint">'+count(r.qtd)+' lançamento(s) · total do histórico completo</span></div>'
 ).join('')||'<p class="hist-empty">Nenhuma categoria identificada.</p>';
 $('hist-itau-monthly').innerHTML=selected.length?selected.map(r=>{
  const result=num(r.resultado_operacional),saldo=num(r.saldo_teorico_acumulado);
  return '<tr><td><strong>'+safe(monthBR(r.mes))+'</strong>'+
   (num(r.saldo_abertura)?'<small class="hist-subline">Saldo inicial: '+money(r.saldo_abertura)+'</small>':'')+'</td>'+
   '<td class="money hist-money-positive">'+money(r.entradas_operacionais)+'</td>'+
   '<td class="money">'+money(r.saidas)+'</td><td class="money '+(result<0?'hist-money-negative':'hist-money-positive')+'">'+
   money(result)+'</td><td class="money '+(saldo<0?'hist-money-negative':'hist-money-positive')+'">'+money(saldo)+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="hist-empty">Nenhum mês no intervalo selecionado.</td></tr>';
 // A nova tabela mensal paginada substitui a lista limitada de 40.
}
function drawChart(rows){
 const root=$('hist-itau-chart');if(!root)return;
 if(!rows.length){root.innerHTML='<p class="hist-empty">Sem valores para os meses selecionados.</p>';return}
 const maximum=Math.max(1,...rows.flatMap(r=>[num(r.entradas_operacionais),num(r.saidas)]));
 const pct=v=>Math.max(0,Math.min(100,num(v)/maximum*100));
 root.innerHTML='<div class="hist-chart-plot">'+rows.map(r=>{
  const label=monthBR(r.mes),a=pct(r.entradas_operacionais),b=pct(r.saidas);
  return '<div class="hist-chart-month"><div class="hist-chart-bars">'+
   '<div class="hist-bar" style="height:'+a+'%" title="'+safe(label+' · Entradas '+money(r.entradas_operacionais))+'"></div>'+
   '<div class="hist-bar out" style="height:'+b+'%" title="'+safe(label+' · Saídas '+money(r.saidas))+'"></div>'+
   '</div><div class="hist-chart-label">'+safe(label.split(' ')[0])+'</div></div>';
 }).join('')+'</div>';
}
function renderOther(){
 if(!ready)return;
 renderCards();renderParts();renderBanks();renderOpen();
 selectTab(activeTab);
}
function consolidatedCardRows(items){
 const groups=new Map();
 for(const r of items){
  const name=window.frCardNames?.canonical?.(r.fonte)||String(r.fonte||'');
  const key=name+'|'+String(r.modalidade||'');
  if(!groups.has(key))groups.set(key,{
   ...r,fonte:name,qtd:0,total_incluido:0,total_excluido:0,qtd_excluida:0,sem_data:0
  });
  const target=groups.get(key);
  for(const field of ['qtd','total_incluido','total_excluido','qtd_excluida','sem_data']){
   target[field]+=num(r[field]);
  }
 }
 return [...groups.values()].sort((a,b)=>num(b.total_incluido)-num(a.total_incluido));
}
function renderCards(){
 const credits=state.cards.filter(x=>x.modalidade==='cartao_credito');
 const cash=state.cards.filter(x=>x.modalidade==='pagamento_avista');
 $('hist-cards-kpis').innerHTML=
 metric('Compras de crédito incluídas',money(sum(credits,'total_incluido')),
  count(credits.reduce((s,r)=>s+num(r.qtd),0))+' registros de cartão · não são saídas do caixa')+
 metric('Pagamentos à vista',money(sum(cash,'total_incluido')),'PIX e Débito, contabilizados separadamente')+
 metric('Valor marcado NÃO incluir',money(sum(state.cards,'total_excluido')),
  count(state.cards.reduce((s,r)=>s+num(r.qtd_excluida),0))+' registros preservados fora dos indicadores elegíveis')+
 metric('Datas ausentes',count(state.cards.reduce((s,r)=>s+num(r.sem_data),0)),
  'Valores preservados; datas não foram inventadas');
 const consolidated=consolidatedCardRows(state.cards);
 $('hist-cards-rows').innerHTML=consolidated.length?consolidated.map(r=>
  '<tr><td><strong>'+safe(r.fonte)+'</strong>'+
   '<small class="hist-subline">'+(r.modalidade==='pagamento_avista'?'Pagamento à vista':'Crédito')+'</small></td>'+
  '<td class="money">'+count(r.qtd)+'</td><td class="money">'+money(r.total_incluido)+'</td>'+
  '<td class="money">'+money(r.total_excluido)+'</td><td>'+
  (num(r.sem_data)?count(r.sem_data)+' sem data exata':'Datas preservadas')+
  (num(r.qtd_excluida)?'<small class="hist-subline">'+count(r.qtd_excluida)+' excluídos dos indicadores</small>':'')+
  '</td></tr>').join(''):'<tr><td colspan="5" class="hist-empty">Nenhum cartão importado.</td></tr>';
}
function renderParts(){
 const r=state.parts;
 $('hist-parts-kpis').innerHTML=
 metric('Compras incluídas',money(sum(r,'valor_incluido')),'Valor cheio dos registros marcados SIM')+
 metric('Não incluir',money(sum(r,'valor_excluido')),
 count(r.reduce((s,x)=>s+num(x.qtd_excluida),0))+' registros excluídos dos indicadores')+
 metric('Pagamentos identificados',money(sum(r,'pago_real')),
 count(r.reduce((s,x)=>s+num(x.qtd_paga),0))+' baixas existentes no Fluxo, sem duplicação')+
 metric('Registros a confirmar',count(r.reduce((s,x)=>s+num(x.qtd_confirmar),0)),
 'Status herdado do Excel; não significa que todos estão em aberto');
 $('hist-parts-rows').innerHTML=r.length?r.map(x=>
  '<tr><td><strong>'+safe(x.fornecedor)+'</strong></td>'+
  '<td class="money">'+count(x.qtd)+'</td>'+
  '<td class="money">'+money(x.valor_incluido)+'</td>'+
  '<td class="money">'+money(x.valor_excluido)+'</td>'+
  '<td class="money">'+money(x.pago_real)+'<small class="hist-subline">'+count(x.qtd_paga)+' pago(s) identificado(s)</small></td></tr>'
 ).join(''):'<tr><td colspan="5" class="hist-empty">Nenhuma compra de autopeças.</td></tr>';
}
function renderBanks(){
 const all=state.banks;
 const others=all.filter(x=>x.situacao_analise==='outro_banco');
 const earlier=all.filter(x=>x.situacao_analise==='fora_recorte');
 const undated=all.filter(x=>x.situacao_analise==='sem_data_exata');
 const itau=all.filter(x=>x.situacao_analise==='conciliado_itau');
 $('hist-banks-kpis').innerHTML=
 metric('Outros bancos desde junho',money(sum(others,'valor')),count(others.length)+' pagamentos classificados pelo usuário')+
 metric('Antes de junho',money(sum(earlier,'valor')),count(earlier.length)+' registros fora do fluxo Itaú')+
 metric('Sem data exata',money(sum(undated,'valor')),count(undated.length)+' registros sem banco atribuído')+
 metric('Já conciliado no Itaú',money(sum(itau,'valor')),count(itau.length)+' saídas já presentes no caixa; não adicionar');
 const show=[...others,...earlier,...undated].sort((a,b)=>{
  if(!a.data_evento)return 1;if(!b.data_evento)return -1;
  return b.data_evento.localeCompare(a.data_evento);
 });
 $('hist-banks-rows').innerHTML=show.length?show.map(r=>{
  const label=r.situacao_analise==='outro_banco'?'Outro banco':
   r.situacao_analise==='fora_recorte'?'Outro período / banco':'Pendente sem data';
  return '<tr><td>'+dateBR(r.data_evento)+'</td><td><strong>'+safe(r.descricao)+'</strong>'+
  '<small class="hist-subline">Excel · linha '+count(r.linha_excel)+'</small></td>'+
  '<td>'+safe(r.meio_pagamento)+'</td><td><span class="hist-kind">'+safe(label)+'</span></td>'+
  '<td class="money">'+money(r.valor)+'</td></tr>';
 }).join(''):'<tr><td colspan="5" class="hist-empty">Sem pagamentos de outras fontes.</td></tr>';
}
function renderOpen(){
 const data=state.open;
 const noDate=data.filter(r=>!r.mes);
 $('hist-open-kpis').innerHTML=
 metric('Contas em aberto',money(sum(data,'total')),
  count(data.reduce((s,r)=>s+num(r.qtd),0))+' compromissos importados do Excel')+
 metric('Sem vencimento exato',money(sum(noDate,'total')),
  count(noDate.reduce((s,r)=>s+num(r.qtd),0))+' pendentes de identificação')+
 metric('Com data',money(sum(data.filter(r=>r.mes),'total')),
  'Somatório dos meses identificados')+
 metric('Meses com compromissos',count(data.filter(r=>r.mes).length),
  'Agrupados por mês de vencimento');
 $('hist-open-rows').innerHTML=data.length?data.map(r=>
  '<tr><td><strong>'+safe(monthBR(r.mes))+'</strong></td>'+
  '<td class="money">'+count(r.qtd)+'</td>'+
  '<td class="money">'+money(r.total)+'</td></tr>'
 ).join(''):'<tr><td colspan="3" class="hist-empty">Sem contas em aberto no histórico.</td></tr>';
}
function selectTab(next){
 if(!['cards','parts','banks','open'].includes(next))return;
 activeTab=next;
 document.querySelectorAll('[data-hist-pane]').forEach(n=>{n.hidden=n.dataset.histPane!==next});
 document.querySelectorAll('[data-hist-tab]').forEach(n=>{
  const on=n.dataset.histTab===next;
  n.classList.toggle('active',on);
  n.setAttribute('aria-selected',String(on));
 });
}
function exportCsv(){
 if(!ready)return;
 const rows=period();if(!rows?.length)return;
 const fields=['Mes','Entradas operacionais','Saidas','Resultado operacional','Saldo de abertura','Saldo teorico acumulado','Entradas importadas em conferencia','Saidas importadas em conferencia'];
 const lines=rows.map(r=>[r.mes.slice(0,7),num(r.entradas_operacionais),num(r.saidas),
   num(r.resultado_operacional),num(r.saldo_abertura),num(r.saldo_teorico_acumulado),num(r.extrato_entradas),num(r.extrato_saidas)]);
 const csv='\uFEFF'+[fields,...lines].map(row=>row.map(cell=>'"'+String(cell).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='FR_Motors_Itau_Historico_'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function initialize(){
 if(initialized||!$('hist-itau-kpis'))return;
 initialized=true;
 $('hist-itau-from').addEventListener('change',renderItau);
 $('hist-itau-to').addEventListener('change',renderItau);
 $('hist-itau-reload').addEventListener('click',()=>refresh().catch(()=>{}));
 $('hist-other-reload').addEventListener('click',()=>refresh().catch(()=>{}));
 $('hist-itau-export').addEventListener('click',exportCsv);
 document.querySelectorAll('[data-hist-tab]').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.histTab)));
}
window.frHistoryUI={open,refresh,selectTab};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
else initialize();
})();