/* Financeiro Unificado · Importação segura de homologação.
   O arquivo fica no navegador. Apenas dados explicitamente confirmados são enviados.
   Nenhuma linha é inserida nas tabelas operacionais de caixa, cartões ou boletos. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const dateBR=s=>s?s.split('-').reverse().join('/'):'—';
const cfg=[
 {sheet:'AUTOPEÇAS',grupo:'autopecas',head:6,first:7,desc:1,value:9,date:6,keys:[0,1],checks:[[0,/^ID$/i],[9,/^VALOR CHEIO$/i]]},
 {sheet:'CARTÕES',grupo:'cartoes',head:6,first:7,desc:2,value:7,date:3,keys:[0,2],checks:[[1,/^CARTÃO$/i],[7,/^VALOR$/i]]},
 {sheet:'SAÍDAS FLUXO',grupo:'saidas_fluxo',head:3,first:4,desc:5,value:7,date:2,keys:[1,5],checks:[[7,/VALOR PAGO/i]]},
 {sheet:'ENTRADAS FLUXO',grupo:'entradas_fluxo',head:3,first:4,desc:3,value:5,date:1,keys:[0,3],checks:[[5,/VALOR RECEBIDO/i]]},
 {sheet:'ABERTOS FLUXO',grupo:'abertos_fluxo',head:3,first:4,desc:4,value:5,date:1,keys:[0,4],checks:[[5,/VALOR PREVISTO/i]]},
 {sheet:'BAIXAS CONCILIADAS',grupo:'baixas_conciliadas',head:3,first:4,desc:0,value:8,date:6,keys:[2,3],checks:[[8,/PAGO REAL/i]]}
];
let staged=null,busy=false;
const text=(id,message,bad=false)=>{
 const el=$(id);if(!el)return;el.textContent=message;el.className='status '+(bad?'bad':'ok');
};
function numeric(v){
 if(typeof v==='number')return Number.isFinite(v)?Math.round(v*100)/100:null;
 const raw=String(v??'').trim();if(!raw)return null;
 const negative=/^[-−(]/.test(raw);
 let s=raw.replace(/R\$/gi,'').replace(/\s/g,'').replace(/[()−-]/g,'');
 if(!/^\d[\d.,]*$/.test(s))return null;
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(comma>=0)s=s.replace(',','.');
 else if(dot>=0&&s.length-dot-1===3)s=s.replace(/\./g,'');
 const n=Number(s);
 return Number.isFinite(n)?Math.round((negative?-n:n)*100)/100:null;
}
function dateISO(v){
 if(v===null||v===undefined||v==='')return null;
 if(v instanceof Date&&!Number.isNaN(v.getTime()))
   return new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())).toISOString().slice(0,10);
 if(typeof v==='number'&&v>=20000&&v<=90000){
   return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
 }
 let s=String(v).trim();
 const mm=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
 if(mm){const y=Number(mm[3])+(mm[3].length===2?2000:0),m=Number(mm[2]),d=Number(mm[1]);const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt.toISOString().slice(0,10):null}
 const iso=s.match(/^\d{4}-\d{2}-\d{2}/);
 if(iso){const d=new Date(iso[0]+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso[0]?iso[0]:null}
 return null;
}
function extraFor(conf,row){
 switch(conf.grupo){
  case 'autopecas':return {fornecedor:String(row[1]||''),ano_compra:row[2]||null,data_compra:dateISO(row[3]),grupo_compra:String(row[4]||''),parcela:String(row[5]||''),vencimento:dateISO(row[6]),valor_cheio:numeric(row[9]),com_desconto:numeric(row[10]),previsto:numeric(row[12]),situacao:String(row[13]||''),pago_em:dateISO(row[14]),pago_real:numeric(row[15]),meio:String(row[16]||''),incluir:String(row[17]||''),revisao:String(row[18]||'')};
  case 'cartoes':return {cartao:String(row[1]||''),parcela:String(row[4]||''),mes_fatura:dateISO(row[5]),situacao:String(row[8]||''),pago_em:dateISO(row[9]),pago_real:numeric(row[10]),incluir:String(row[11]||''),revisao:String(row[12]||''),fornecedor:String(row[15]||'')};
  case 'saidas_fluxo':return {linha_original:String(row[1]||''),vencimento:dateISO(row[3]),categoria:String(row[4]||''),meio:String(row[6]||''),id_boleto:String(row[8]||''),classificacao:String(row[9]||''),validado:String(row[10]||'')};
  case 'entradas_fluxo':return {linha_original:String(row[0]||''),categoria:String(row[2]||''),meio:String(row[4]||''),situacao:String(row[6]||''),saldo_inicial:/SALDO/i.test(String(row[2]||''))};
  case 'abertos_fluxo':return {linha_original:String(row[0]||''),fornecedor:String(row[2]||''),categoria:String(row[3]||''),situacao:String(row[6]||''),previsao:dateISO(row[7])};
  case 'baixas_conciliadas':return {linha_original:String(row[2]||''),id_boleto:String(row[3]||''),fornecedor:String(row[0]||''),valor_cheio:numeric(row[7]),desconto:numeric(row[9]),juros:numeric(row[10]),vinculacao:String(row[11]||''),meio:String(row[13]||'')};
  default:return {};
 }
}
function expectedFromWorkbook(book){
 const sheet=book.Sheets['RESUMO INTEGRADO'];if(!sheet)return {};
 const get=cell=>numeric(sheet[cell]?.v);
 return {
  saidas_fluxo:{quantidade:get('B5'),soma:get('B6')},
  entradas_fluxo:{quantidade:get('B7'),soma:get('B8')},
  abertos_fluxo:{quantidade:get('B9'),soma:get('B10')},
  baixas_conciliadas:{quantidade:get('B11'),soma:get('B14')}
 };
}
function parseFile(buffer){
 if(!window.XLSX)throw Error('O leitor Excel não foi carregado. Atualize a página e tente novamente.');
 const book=window.XLSX.read(buffer,{type:'array',cellDates:false,cellFormula:false});
 const missing=cfg.filter(c=>!book.SheetNames.includes(c.sheet)).map(c=>c.sheet);
 if(missing.length)throw Error('Não encontrei as abas obrigatórias: '+missing.join(', ')+'. Selecione o Financeiro Unificado, não uma fatura comum.');
 const items=[],groups={},samples=[],alerts=[],expected=expectedFromWorkbook(book);
 for(const def of cfg){
  const raw=window.XLSX.utils.sheet_to_json(book.Sheets[def.sheet],{header:1,range:0,raw:true,defval:'',blankrows:true});
  const head=raw[def.head]||[];
  for(const [col,pattern] of def.checks){
   if(!pattern.test(String(head[col]||'').trim()))throw Error('A estrutura da aba '+def.sheet+' não corresponde ao modelo esperado. Verifique o cabeçalho na linha '+(def.head+1)+'.');
  }
  let totalCents=0,count=0,excluded=0;
  for(let ri=def.first;ri<raw.length;ri++){
   const row=raw[ri]||[],hasKey=def.keys.some(k=>String(row[k]??'').trim());
   if(!hasKey)continue;
   const value=numeric(row[def.value]);
   if(value===null)throw Error('Valor inválido em '+def.sheet+', linha '+(ri+1)+'. Confira a planilha antes de importar.');
   const memo=String(row[def.desc]??'').trim()||('Registro '+(ri+1));
   const data={
    grupo:def.grupo,linha_excel:ri+1,
    codigo_origem:String(row[def.grupo==='autopecas'||def.grupo==='cartoes'?0:(def.grupo==='baixas_conciliadas'?3:1)]??'').slice(0,140),
    data_evento:dateISO(row[def.date]),descricao:memo.slice(0,500),
    valor:value,dados:extraFor(def,row)
   };
   const include=def.grupo==='autopecas'?String(row[17]||'').trim().toUpperCase()!=='NÃO':
     def.grupo==='cartoes'?String(row[11]||'').trim().toUpperCase()!=='NÃO':true;
   if(!include)excluded++;
   items.push(data);count++;totalCents+=Math.round(value*100);
   if(samples.filter(x=>x.grupo===def.sheet).length<2)samples.push({grupo:def.sheet,linha:ri+1,descricao:memo.slice(0,90),data:data.data_evento,valor:value});
  }
  const sum=totalCents/100;
  const baseline=expected[def.grupo];
  const mismatch=Boolean(baseline&&(
     Number(baseline.quantidade)!==count ||
     Math.abs(Math.round(Number(baseline.soma||0)*100)-totalCents)>1
  ));
  if(mismatch)alerts.push('Aba '+def.sheet+': o total extraído difere do RESUMO INTEGRADO.');
  groups[def.grupo]={nome:def.sheet,quantidade:count,soma:sum,excluidos:excluded,esperado:baseline||null,confere:!mismatch};
 }
 if(!items.length||items.length>12000)throw Error('Quantidade de registros inválida: '+items.length+'.');
 return {items,groups,expected,samples,alerts,bookSheets:book.SheetNames.length};
}
async function hashFile(buffer){
 const digest=await crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function draw(){
 const state=staged,groups=Object.values(state.data.groups),count=state.data.items.length;
 const metric=(label,value)=>'<div class="fin-unificado-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
 $('fin-unificado-metrics').innerHTML=metric('Registros identificados',String(count))+
  metric('Abas de dados',String(groups.length))+
  metric('Diferenças no resumo',String(state.data.alerts.length));
 $('fin-unificado-resumo').innerHTML=groups.map(g=>'<tr><td><strong>'+esc(g.nome)+'</strong>'+
 (g.excluidos?' <small class="info-note">('+g.excluidos+' marcados para não incluir)</small>':'')+
 '</td><td class="money">'+g.quantidade+'</td><td class="money">'+currency(g.soma)+'</td>'+
 '<td><span class="fin-unificado-tag '+(g.confere?'':'error')+'">'+
 (g.esperado?(g.confere?'Confere com resumo':'Divergência com resumo'):'Conferir individualmente')+
 '</span></td></tr>').join('');
 $('fin-unificado-amostras').innerHTML=state.data.samples.map(r=>
  '<tr><td>'+esc(r.grupo)+' · '+r.linha+'</td><td>'+esc(r.descricao)+'</td><td>'+esc(dateBR(r.data))+
  '</td><td class="money">'+currency(r.valor)+'</td></tr>').join('');
 $('fin-unificado-count').textContent=count+' registros, '+groups.length+' abas. '+
  (state.data.alerts.length?'Verifique as diferenças sinalizadas.':'Conferência estrutural concluída.');
 $('fin-unificado-previa').classList.remove('hidden');
 $('fin-unificado-confirmar').disabled=busy||state.data.alerts.length>0;
 if(state.data.alerts.length)text('fin-unificado-mensagem',state.data.alerts.join('\n')+' Corrija a planilha antes de importar.',true);
 else text('fin-unificado-mensagem','Prévia pronta. Nenhum dado foi enviado ainda ao Supabase. Confira os totais antes de confirmar.');
}
async function analyze(){
 if(busy)return;
 const file=$('fin-unificado-file').files?.[0];if(!file)return;
 if(!/\.xlsx$/i.test(file.name))return text('fin-unificado-mensagem','Selecione a cópia do Financeiro Unificado em formato .xlsx.',true);
 if(file.size>20*1024*1024)return text('fin-unificado-mensagem','Arquivo acima de 20 MB. Exporte somente o Financeiro Unificado.',true);
 busy=true;$('fin-unificado-analisar').disabled=true;$('fin-unificado-confirmar').disabled=true;
 $('fin-unificado-previa').classList.add('hidden');
 try{
  text('fin-unificado-mensagem','Lendo as abas e conferindo os registros...');
  const buffer=await file.arrayBuffer();
  const [data,hash]=await Promise.all([Promise.resolve().then(()=>parseFile(buffer)),hashFile(buffer)]);
  staged={file,hash,data};
  draw();
 }catch(e){staged=null;text('fin-unificado-mensagem','Não foi possível analisar: '+e.message,true);}
 finally{busy=false;$('fin-unificado-analisar').disabled=!$('fin-unificado-file').files?.length;if(staged)draw();}
}
async function history(){
 if(typeof db==='undefined'||!db)return;
 const {data,error}=await db.from('fin_teste_excel_lotes')
  .select('id,arquivo_nome,esperado_linhas,status,criado_em')
  .order('criado_em',{ascending:false}).limit(10);
 if(error){$('fin-unificado-historico').textContent='Histórico indisponível: '+error.message;return;}
 $('fin-unificado-historico').innerHTML=(data||[]).length?(data||[]).map(r=>
  '<div class="fin-unificado-history-row"><div><strong>'+esc(r.arquivo_nome)+'</strong>'+
  '<small>'+Number(r.esperado_linhas)+' registros · '+esc(new Date(r.criado_em).toLocaleDateString('pt-BR'))+'</small></div>'+
  '<span class="fin-unificado-tag '+(r.status==='conferido'?'':'warn')+'">'+
  (r.status==='conferido'?'Conferido e ativo':r.status==='substituido'?'Arquivado · substituído':'Importação em andamento')+'</span></div>').join(''):
  'Nenhuma cópia importada para homologação.';
 const target=$('fin-unificado-validacoes-resumo');
 if(!target)return;
 if(!data?.length){target.textContent='Nenhuma homologação disponível.';return;}
 const {data:review,error:reviewError}=await db.from('fin_teste_excel_validacoes_resumo')
  .select('pix,debito,valor_a_vista,variacoes,acrescimos,reducoes,sem_data,sem_data_cartao,sem_data_abertos,registros_revisados')
  .eq('lote_id',data[0].id).maybeSingle();
 if(reviewError){target.textContent='Não foi possível carregar as confirmações: '+reviewError.message;return;}
 if(!review){target.textContent='Ainda não há confirmações registradas para este arquivo.';return;}
 const k=(label,number,description)=>'<div class="fin-unificado-metric">'+
   '<small>'+esc(label)+'</small><strong>'+esc(number)+'</strong>'+
   '<span class="fin-unificado-review-detail">'+esc(description)+'</span></div>';
 target.className='fin-unificado-metrics fin-unificado-review-metrics';
 target.innerHTML=k('PIX / Débito',(Number(review.pix)+Number(review.debito)).toLocaleString('pt-BR'),
  review.pix+' PIX e '+review.debito+' Débito · '+currency(review.valor_a_vista))+
  k('Variações de valores conferidas',Number(review.variacoes).toLocaleString('pt-BR'),
    review.acrescimos+' acréscimos e '+review.reducoes+' reduções')+
  k('Datas originais desconhecidas',Number(review.sem_data).toLocaleString('pt-BR'),
    review.sem_data_cartao+' de Cartões e '+review.sem_data_abertos+' de Contas em Aberto');
 await carregarConferenciaItau(data[0].id);
}
async function carregarConferenciaItau(loteId){
 const summary=$('fin-unificado-itau-resumo');
 const tbody=$('fin-unificado-itau-linhas');
 if(!summary||!tbody||!loteId)return;
 const {data,error}=await db.from('fin_teste_excel_pix_debito_itau')
   .select('linha_excel,descricao,data_evento,mes_referencia,valor,meio_pagamento,situacao_analise,quantidade_candidatos,linha_fluxo_candidata,data_fluxo_candidata,diferenca_dias,linha_fluxo_conciliada,data_fluxo_conciliada,criterio_conciliacao')
   .eq('lote_id',loteId).order('linha_excel',{ascending:true});
 if(error){
   summary.textContent='Não foi possível consultar o recorte do Itaú: '+error.message;
   tbody.innerHTML='<tr><td colspan="5">Conferência indisponível.</td></tr>';
   return;
 }
 const rows=data||[];

 const inScope=rows.filter(r=>r.data_evento&&r.data_evento>='2026-06-01');
 const outside=rows.filter(r=>r.situacao_analise==='fora_recorte');
 const undated=rows.filter(r=>r.situacao_analise==='sem_data_exata');
 const reconciled=inScope.filter(r=>r.situacao_analise==='conciliado_itau');
 const otherBank=inScope.filter(r=>r.situacao_analise==='outro_banco');
 const candidates=inScope.filter(r=>r.situacao_analise==='candidato_nao_confirmado');
 const notFound=inScope.filter(r=>r.situacao_analise==='sem_correspondencia');
 const total=arr=>arr.reduce((sum,r)=>sum+Math.round(Number(r.valor)*100),0)/100;
 const metric=(title,number,description)=>
  '<div class="fin-unificado-metric"><small>'+esc(title)+'</small><strong>'+esc(number)+'</strong>'+
  '<span class="fin-unificado-review-detail">'+esc(description)+'</span></div>';
 summary.className='fin-unificado-metrics fin-unificado-itau-metrics';
 summary.innerHTML=
   metric('Conciliados com o Itaú',String(reconciled.length),currency(total(reconciled))+' · saídas existentes, sem duplicação')+
   metric('Pagos em outro banco',String(otherBank.length),currency(total(otherBank))+' · não entram no caixa Itaú')+
   metric('Anteriores a junho',String(outside.length),currency(total(outside))+' · fora desta conciliação')+
   metric('Sem data exata',String(undated.length),currency(total(undated))+' · pendentes');
 const mayReview=undated.filter(r=>r.mes_referencia&&r.mes_referencia>='2026-06-01');
 const toShow=[...inScope,...mayReview].sort((a,b)=>
  (a.data_evento||a.mes_referencia||'').localeCompare(b.data_evento||b.mes_referencia||'')||a.linha_excel-b.linha_excel);
 tbody.innerHTML=toShow.length?toShow.map(r=>{
  const matched=r.situacao_analise==='conciliado_itau';
  const another=r.situacao_analise==='outro_banco';
  const candidate=r.situacao_analise==='candidato_nao_confirmado';
  const pending=r.situacao_analise==='sem_data_exata';
  const status=matched?
   'Vinculado à saída já registrada no Fluxo Itaú: '+dateBR(r.data_fluxo_conciliada)+
   ' (linha '+r.linha_fluxo_conciliada+'). Valor igual; confirmado pelo usuário. Nenhum pagamento duplicado.':
   another?'Classificado pelo usuário como pagamento em outro banco. Banco específico não identificado. Sem lançamento no Fluxo Itaú.':
   candidate?'Possível saída no fluxo: '+dateBR(r.data_fluxo_candidata)+
    ' (linha '+r.linha_fluxo_candidata+'). Ainda não confirmada.':
   pending?'Data exata desconhecida. O valor foi preservado e nenhum banco foi atribuído.':
   'Não foi encontrada saída de mesmo valor e meio em até três dias. Verificação pendente.';
  const label=matched?'Conciliado Itaú':
   another?'Outro banco':
   candidate?'Candidato':
   pending?'Sem data':'Sem correspondência';
  const color=matched?'success':another?'muted':'warn';
  return '<tr><td><strong>'+esc(r.descricao)+'</strong><small class="fin-unificado-itau-id">Excel: linha '+
    esc(r.linha_excel)+'</small></td><td>'+
    (r.data_evento?esc(dateBR(r.data_evento)):'Sem data (mês '+esc(r.mes_referencia?.slice(0,7)||'desconhecido')+')')+
    '</td><td>'+esc(r.meio_pagamento)+'</td><td class="money">'+currency(r.valor)+
    '</td><td><span class="fin-unificado-tag '+color+'">'+esc(label)+'</span>'+
    '<small class="fin-unificado-itau-status">'+esc(status)+'</small></td></tr>';
 }).join(''):
 '<tr><td colspan="5">Nenhum PIX ou débito com data desde 01/06/2026.</td></tr>';
 if(candidates.length||notFound.length){
  const note='Existem '+candidates.length+' possíveis correspondências e '+
   notFound.length+' saídas não localizadas que ainda exigem revisão.';
  const notice=$('fin-unificado-itau-aviso');
  if(notice)notice.textContent=note;
 }else{
  const notice=$('fin-unificado-itau-aviso');
  if(notice)notice.textContent='Vínculos aprovados pelo usuário em homologação, por valor e data com tolerância de até três dias. O Fluxo de Caixa permanece como única fonte de pagamentos efetivos, sem lançamentos duplicados.';
 }
}
function cmpServer(r){
 for(const [grupo,local] of Object.entries(staged.data.groups)){
  const server=r.grupos?.[grupo];
  if(!server||Number(server.quantidade)!==local.quantidade||
   Math.abs(Math.round(Number(server.soma)*100)-Math.round(local.soma*100))>1){
   return 'Conferência divergente no grupo '+local.nome+'. Não use estes dados até revisar.';
  }
 }
 return '';
}
async function importNow(){
 if(!staged||busy||staged.data.alerts.length)return;
 if(!window.confirm('Confirmar importação de '+staged.data.items.length+' registros para HOMOLOGAÇÃO? O caixa real e o Dashboard não serão alterados.'))return;
 busy=true;$('fin-unificado-confirmar').disabled=true;$('fin-unificado-analisar').disabled=true;
 try{
  if(typeof db==='undefined'||!db)throw Error('Não foi possível acessar o Supabase.');
  text('fin-unificado-mensagem','Iniciando importação segura dos registros...');
  const summary={grupos:staged.data.groups,referencia:staged.data.expected,
    abas_analisadas:staged.data.bookSheets,modo:'somente_homologacao'};
  const {data:init,error:initError}=await db.rpc('fin_teste_excel_iniciar',{
    p_nome:staged.file.name.slice(0,255),p_hash:staged.hash,
    p_total:staged.data.items.length,p_resumo:summary
  });
  if(initError)throw initError;
  if(init.status==='substituido'){
   throw new Error('Esta planilha já foi substituída por uma versão corrigida. Utilize o arquivo CORRIGIDO_TOPLINE em vez do antigo.');
  }
  const lote=init.lote_id;
  if(init.status!=='conferido'){
   const chunks=staged.data.items;
   for(let i=0;i<chunks.length;i+=180){
    const {error,data}=await db.rpc('fin_teste_excel_importar_linhas',{
      p_lote:lote,p_linhas:chunks.slice(i,i+180)
    });
    if(error)throw error;
    text('fin-unificado-mensagem','Enviados '+Math.min(i+180,chunks.length)+' de '+chunks.length+
      ' registros. Ainda não foram incluídos nos indicadores financeiros.');
   }
  }
  const {data:report,error:finishError}=await db.rpc('fin_teste_excel_finalizar',{p_lote:lote});
  if(finishError)throw finishError;
  const different=cmpServer(report);
  if(different)throw Error(different);
  const isToplineCorrection=/^FR_Motors_Financeiro_Unificado_CORRIGIDO_TOPLINE_.*\.xlsx$/i.test(staged.file.name);
  if(isToplineCorrection){
   if(staged.data.items.length!==3234 || staged.data.groups?.entradas_fluxo?.quantidade!==278 ||
      Math.abs(Math.round(staged.data.groups?.entradas_fluxo?.soma*100)-58053489)>1){
    throw new Error('A cópia TOPLINE corrigida não tem os 3.234 registros e R$ 580.534,89 de entradas esperados; a versão anterior permanece preservada.');
   }
   text('fin-unificado-mensagem','Dados importados. Transferindo 69 validações e 6 conciliações PIX/Débito, e arquivando o lote anterior com segurança...');
   const {data:promotion,error:promotionError}=await db.rpc('fin_teste_excel_ativar_correcao_topline',{p_lote:lote});
   if(promotionError)throw new Error('Os dados chegaram, mas a ativação da versão corrigida não foi concluída: '+promotionError.message);
   if(Number(promotion.validacoes_preservadas)!==69||Number(promotion.conciliacoes_preservadas)!==6){
    throw new Error('A ativação não confirmou todas as validações e conciliações anteriores. Revise antes de continuar.');
   }
   text('fin-unificado-mensagem','Versão TOPLINE corrigida ativada com sucesso. '+report.linhas+
    ' registros, 11 novos recebimentos (R$ 11.345,70), 69 validações e 6 conciliações preservadas. '+
    'A versão antiga ficou arquivada para auditoria. Nenhum lançamento foi duplicado no caixa Itaú.');
  }else{
   text('fin-unificado-mensagem',
    'Homologação concluída! '+report.linhas+' registros conferidos com o Supabase, sem diferenças nas somas das seis abas. '+
    'Nenhum pagamento ou compra operacional foi duplicado.');
  }
  window.frFinanceUI?.showToast('Financeiro Unificado conferido na base de homologação.');
  await history();
  if(window.frHistoryUI?.refresh)await window.frHistoryUI.refresh().catch(()=>{});
 }catch(e){text('fin-unificado-mensagem','Importação não concluída: '+e.message+
  '. Se parte dos registros tiver sido enviada, você pode selecionar a mesma cópia e tentar novamente sem repetir as linhas.',true);}
 finally{busy=false;$('fin-unificado-analisar').disabled=!$('fin-unificado-file').files?.length;
  $('fin-unificado-confirmar').disabled=!staged||Boolean(staged?.data.alerts.length);
 }
}
function init(){
 if(!$('fin-unificado-file'))return;
 $('fin-unificado-file').addEventListener('change',()=>{
   staged=null;$('fin-unificado-analisar').disabled=!$('fin-unificado-file').files?.length;
   $('fin-unificado-confirmar').disabled=true;$('fin-unificado-previa').classList.add('hidden');
   text('fin-unificado-mensagem','Arquivo escolhido. Clique em Analisar planilha para conferir as abas.');
 });
 $('fin-unificado-analisar').addEventListener('click',analyze);
 $('fin-unificado-confirmar').addEventListener('click',importNow);
 document.addEventListener('click',event=>{
   if(event.target.closest('[data-view="imports"]')||event.target.closest('#import-reload')){
     history().catch(e=>text('fin-unificado-mensagem','Não foi possível atualizar o histórico: '+e.message,true));
   }
 });
 if(!document.querySelector('[data-view-panel="imports"]')?.hidden){
   history().catch(()=>{});
 }
}
window.finUnificadoUI={history,parseFile,dateISO,numeric};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();