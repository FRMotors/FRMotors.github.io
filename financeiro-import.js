/* FR Motors · Importações financeiras na base de testes.
   O arquivo é lido no navegador; somente lançamentos confirmados são salvos. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const cash=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthNames={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
let current=null,preview=[],invalid=0,working=false,bankImported=[],linkedBank=new Set();
let cardRows=[],selectedCard=null;
const pdfModule='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const pdfWorker='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
function notice(id,message,bad=false){const el=$(id);if(!el)return;el.textContent=message;el.className='status '+(bad?'bad':'ok')}
function numMoney(value){
 let s=String(value??'').trim();
 if(!s)return null;
 const signCandidate=s.replace(/R\$/gi,'').trim();
 const negative=/^-|\(.*\)|\bD(?:R|EBITO)?\b/i.test(signCandidate)||/-\s*$/.test(signCandidate);
 s=s.replace(/R\$|\s|\u00a0|[A-Za-z()]/g,'').replace(/[+\-]/g,'');
 if(!/^[0-9.,]+$/.test(s))return null;
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(comma>=0){const decimals=s.length-comma-1;s=decimals===3?s.replace(/,/g,''):s.replace(',','.')}
 else if(dot>=0){const decimals=s.length-dot-1;if(decimals===3)s=s.replace(/\./g,'')}
 const n=Number(s);
 if(!Number.isFinite(n)||n===0)return n===0?0:null;
 const cents=Math.round(n*100);
 if(!Number.isSafeInteger(cents))return null;
 return (negative?-1:1)*cents/100;
}
function dateISO(value,format='dmy',yearHint=new Date().getFullYear()){
 if(value instanceof Date&&!Number.isNaN(value.valueOf()))return new Date(Date.UTC(value.getFullYear(),value.getMonth(),value.getDate())).toISOString().slice(0,10);
 let s=String(value??'').trim();
 if(!s)return null;
 let y,m,d;
 if(/^\d{4}-\d{2}-\d{2}/.test(s)){[y,m,d]=s.slice(0,10).split('-').map(Number)}
 else if(/^\d{8}(?:\d|$)/.test(s)&&Number(s.slice(0,4))>=1990&&Number(s.slice(0,4))<=2100){
  y=Number(s.slice(0,4));m=Number(s.slice(4,6));d=Number(s.slice(6,8));
 }else{
  const match=s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?:\s|$)/);
  if(match){
   const first=Number(match[1]),second=Number(match[2]);
   d=format==='mdy'?second:first;m=format==='mdy'?first:second;
   y=match[3]?Number(match[3]):yearHint;
   if(y<100)y+=y<70?2000:1900;
  }else{
   const named=s.toLowerCase().match(/^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*[.\s,]*(\d{2,4})?$/);
   if(!named)return null;
   d=Number(named[1]);m=monthNames[named[2]];y=named[3]?Number(named[3]):yearHint;
   if(y<100)y+=2000;
  }
 }
 if(!Number.isInteger(y)||y<1990||y>2100||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>31)return null;
 const utc=new Date(Date.UTC(y,m-1,d));
 if(utc.getUTCFullYear()!==y||utc.getUTCMonth()!==m-1||utc.getUTCDate()!==d)return null;
 return utc.toISOString().slice(0,10);
}
function delimiter(sample){
 const row=sample.split(/\r?\n/).find(x=>x.trim()&&!/^sep=/i.test(x))||sample.split(/\r?\n/)[0]||'';
 const choices=[';',',','\t','|'];
 return choices.sort((a,b)=>row.split(b).length-row.split(a).length)[0];
}
function parseCSV(text){
 text=text.replace(/^\ufeff/,'');
 const sepMatch=text.match(/^sep=(.)\s*\r?\n/i),sep=sepMatch?sepMatch[1]:delimiter(text);
 if(sepMatch)text=text.slice(sepMatch[0].length);
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
   else if(ch==='"')quoted=false;
   else cell+=ch;
  }else if(ch==='"'&&cell.trim()==='')quoted=true;
  else if(ch===sep){row.push(cell.trim());cell=''}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(cell.trim());if(row.some(v=>String(v).trim()))rows.push(row);
   row=[];cell='';
  }else cell+=ch;
 }
 row.push(cell.trim());if(row.some(v=>String(v).trim()))rows.push(row);
 return rows;
}
function decodeBuffer(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch(e){return new TextDecoder('windows-1252').decode(bytes)}
}
function parseOFX(text){
 const chunks=[...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi)];
 function tag(s,name){const m=s.match(new RegExp('<'+name+'>\\s*([^\\r\\n<]+)','i'));return (m?.[1]||'').trim()}
 const out=[['Data','Descrição','Valor']];
 const meta=[];
 for(const [,chunk] of chunks){
  const date=tag(chunk,'DTPOSTED').slice(0,8);
  const value=tag(chunk,'TRNAMT');
  const desc=[tag(chunk,'NAME'),tag(chunk,'MEMO')].filter(Boolean).join(' · ').slice(0,400)||tag(chunk,'TRNTYPE');
  if(!date||!value||!desc)continue;
  out.push([date,desc,value]);
  meta.push({externalId:tag(chunk,'FITID')||null});
 }
 return {rows:out,meta};
}
function pdfLineRows(lines){
 const out=[['Data','Descrição','Valor']],meta=[];
 for(const text of lines){
  const line=text.replace(/\s+/g,' ').trim();
  const match=line.match(/^(\d{2}[\/\-.]\d{2}(?:[\/\-.]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(.+)$/);
  if(!match)continue;
  const body=match[2].trim();
  const amountMatches=[...body.matchAll(/(?:\(?-?\s*R\$?\s*)?\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\)?|(?<!\d)\b\d+[.,]\d{2}\b/g)];
  if(!amountMatches.length)continue;
  // PDFs com coluna "saldo" precisam de conferência: a última quantia pode ser o saldo, não o valor.
  const amount=amountMatches[amountMatches.length-1],desc=body.slice(0,amount.index).trim();
  if(!desc||/^(SALDO|TOTAL|LIMITE)/i.test(desc))continue;
  out.push([match[1],desc,amount[0].trim()]);
  meta.push({pdf:true});
 }
 return {rows:out,meta};
}
async function parsePDF(buffer){
 const pdfjs=await import(pdfModule);
 pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;
 const pdf=await pdfjs.getDocument({
  data:new Uint8Array(buffer.slice(0)),
  isEvalSupported:false
 }).promise;
 if(pdf.numPages>50)throw Error('PDF com mais de 50 páginas. Use CSV ou exporte um período menor.');
 const lines=[];
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p),content=await page.getTextContent();
  const groups=new Map();
  for(const item of content.items){
   const str=(item.str||'').trim();if(!str)continue;
   const x=item.transform?.[4]||0,y=item.transform?.[5]||0,key=Math.round(y*2)/2;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push({x,str});
  }
  for(const [,items] of [...groups.entries()].sort((a,b)=>b[0]-a[0])){
   lines.push(items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' '));
  }
 }
 const result=pdfLineRows(lines);
 if(result.rows.length<2)throw Error('Não encontrei transações legíveis no PDF. Se for imagem, exporte em CSV ou OFX. PDFs de alguns bancos precisam de um modelo específico.');
 return result;
}
function hashHex(buffer){
 return crypto.subtle.digest('SHA-256',buffer).then(bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(''));
}
function guessYear(file){
 const year=file.name.match(/20(?:2\d|3\d)/);return year?Number(year[0]):new Date().getFullYear();
}
function setRows(rows,meta=[]){
 current.rows=rows;
 current.meta=meta;
 const headerOptions=$('import-header');
 headerOptions.replaceChildren();
 rows.slice(0,Math.min(30,rows.length)).forEach((row,index)=>{
  headerOptions.add(new Option('Linha '+(index+1)+' · '+row.slice(0,3).join(' | ').slice(0,120),index));
 });
 const keywords=/(data|descri|hist[oó]rico|lan[çc]amento|valor|d[eé]bito|cr[eé]dito|amount|date|memo|detalhes|estabelecimento|transa[çc][aã]o|dia)/i;
 const header=rows.findIndex(row=>Array.isArray(row)&&row.some(v=>keywords.test(String(v))));
 headerOptions.value=String(header<0?0:Math.min(header,29));
 mapColumns();
}
function mapColumns(){
 if(!current?.rows)return;
 const headerIndex=Number($('import-header').value||0);
 const head=current.rows[headerIndex]||[];
 const len=Math.max(head.length,...current.rows.slice(0,50).map(r=>r.length),0);
 const options=Array.from({length:len},(_,i)=>({i,label:String(head[i]||'Coluna '+(i+1)).slice(0,70)}));
 const mappings=[
  ['import-col-date',/(^data$|date|dt |data lan|lan[çc]amento)/i,0],
  ['import-col-desc',/(descri|hist[oó]rico|estabelecimento|nome|memo|detalhe|lan[çc]amento|comerciante|transa[çc][aã]o)/i,1],
  ['import-col-amount',/(^valor$|valor \(r\$\)|amount|total r\$|quantia|montante)/i,2],
  ['import-col-debit',/(^d[eé]bito|valor d[eé]bito|sa[ií]da)/i,-1],
  ['import-col-credit',/(^cr[eé]dito|valor cr[eé]dito|entrada)/i,-1]
 ];
 for(const [id,regex,fallback] of mappings){
  const el=$(id),oldValue=el.value;
  el.replaceChildren(new Option('Não selecionar',''));
  for(const {i,label} of options)el.add(new Option((i+1)+'. '+label,String(i)));
  let match=options.find(x=>regex.test(x.label));
  // Para CSV com coluna genérica "Valor", respeitar seu campo.
  if(!match&&fallback>=0)match=options[fallback];
  el.value=match?String(match.i):'';
 }
 $('import-map-empty').classList.add('hidden');$('import-map').classList.remove('hidden');
}
function selectedKind(){return document.querySelector('input[name="import-kind"]:checked')?.value||'banco'}
function updateKind(){
 const kind=selectedKind();
 $('import-sign-bank').classList.toggle('hidden',kind!=='banco');
 $('import-sign-card').classList.toggle('hidden',kind!=='cartao');
 $('import-preview-card').hidden=true;
 preview=[];
 notice('import-read-status','Confira os lançamentos antes de importar. Arquivos não são enviados integralmente ao banco.');
}
async function readFile(){
 const file=$('import-file').files?.[0];
 if(!file)return;
 if(working)return;
 working=true;
 try{
  if(file.size>25*1024*1024)throw Error('Limite de 25 MB por arquivo.');
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  const ext=file.name.toLowerCase().split('.').pop();
  if(!['csv','ofx','qfx','xlsx','xls','pdf'].includes(ext))throw Error('Use CSV, OFX, QFX, XLS, XLSX ou PDF.');
  const hash=await hashHex(buffer);
  current={file,buffer,hash,ext,year:guessYear(file),rows:[],meta:[],workbook:null,special:false};
  if($('import-year'))$('import-year').value=String(current.year);
  $('import-preview-card').hidden=true;preview=[];invalid=0;
  if(ext==='csv'){
   current.rows=parseCSV(decodeBuffer(bytes));
  }else if(ext==='ofx'||ext==='qfx'){
   const parsed=parseOFX(decodeBuffer(bytes));
   current.rows=parsed.rows;current.meta=parsed.meta;current.special=true;
  }else if(ext==='pdf'){
   notice('import-read-status','Extraindo as linhas de texto do PDF...');
   const parsed=await parsePDF(buffer);current.rows=parsed.rows;current.meta=parsed.meta;current.special=true;
  }else{
   if(!window.XLSX)throw Error('Leitor Excel indisponível. Verifique sua conexão ou exporte para CSV.');
   current.workbook=window.XLSX.read(buffer,{type:'array',cellDates:false});
   $('import-sheet').replaceChildren(...current.workbook.SheetNames.map(name=>new Option(name,name)));
   current.rows=window.XLSX.utils.sheet_to_json(current.workbook.Sheets[current.workbook.SheetNames[0]],{header:1,raw:false,defval:''});
  }
  if(current.rows.length<2)throw Error('O arquivo não contém transações reconhecíveis.');
  $('import-sheet-wrap').classList.toggle('hidden',!current.workbook);
  $('import-header-wrap').classList.toggle('hidden',current.special);
  setRows(current.rows,current.meta);
  notice('import-read-status',file.name+' lido: '+(current.rows.length-1)+' linha(s) candidatas. Configure as colunas e gere a prévia.');
  if(ext==='pdf')$('import-map-tip').textContent='PDF experimental: confira atentamente datas, ano e valores, principalmente quando o extrato mostrar uma coluna de saldo.';
  else $('import-map-tip').textContent='Confira o formato da data e as colunas. Valores individuais, não saldos ou totais de fatura.';
 }catch(e){
  current=null;$('import-map').classList.add('hidden');$('import-map-empty').classList.remove('hidden');
  $('import-preview-card').hidden=true;
  notice('import-read-status','Não foi possível ler: '+e.message,true);
 }finally{working=false}
}
function looksLikeSummary(desc,kind){
 const s=String(desc).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(/^(saldo|total|limite disponivel|limite total|encerramento|vencimento|valor total)\b/.test(s))return true;
 if(kind==='cartao' && /(^pagamento\b|pagamento.*fatura|creditos? de pagamento|total da fatura|saldo anterior|saldo credor|fatura anterior)/.test(s))return true;
 return false;
}
function formatChoice(row){
 const val=id=>{const idx=$(id).value;return idx===''?null:row[Number(idx)]};
 const date=dateISO(val('import-col-date'),$('import-date-format').value,Number($('import-year')?.value)||current.year);
 const desc=String(val('import-col-desc')??'').replace(/\s+/g,' ').trim().slice(0,400);
 const debit=numMoney(val('import-col-debit')),credit=numMoney(val('import-col-credit'));
 const hasSplit=($('import-col-debit').value!==''||$('import-col-credit').value!=='');
 let signed=numMoney(val('import-col-amount'));
 if(hasSplit){
  if(debit&&credit)return {error:'Débito e crédito simultâneos',desc};
  if(debit)signed=-Math.abs(debit);
  else if(credit)signed=Math.abs(credit);
  else signed=null;
 }
 if(!date||!desc||signed===null||signed===0)return {error:'Data, descrição ou valor indisponível',desc};
 const kind=selectedKind();
 let nature;
 if(kind==='banco'){
  const out=$('import-sign').value==='negative-out'?signed<0:signed>0;
  nature=out?'saida':'entrada';
 }else{
  const purchase=$('import-card-sign').value==='positive-purchase'?signed>0:signed<0;
  nature=purchase?'compra':'estorno';
 }
 return {date,desc,valor:Math.abs(signed),nature,defaultInclude:!looksLikeSummary(desc,kind)};
}
function validateSource(){
 if(!current||!current.rows?.length)throw Error('Selecione um arquivo primeiro.');
 const account=$('import-account').value.trim();
 if(account.length<2)throw Error('Informe um identificador para a conta ou cartão.');
 if(!$('import-col-date').value||!$('import-col-desc').value)throw Error('Selecione as colunas de data e descrição.');
 if($('import-col-amount').value===''&&$('import-col-debit').value===''&&$('import-col-credit').value==='')throw Error('Selecione a coluna de valor ou as colunas de débito/crédito.');
 return account;
}
function buildPreview(){
 try{
  validateSource();const rows=current.rows.slice(Number($('import-header').value)+1);
  if(rows.length>4000)throw Error('Arquivo com mais de 4.000 linhas. Faça uma exportação de período menor.');
  preview=[];invalid=0;let offset=Number($('import-header').value)+1;
  const seen=new Map();
  for(let i=0;i<rows.length;i++){
   const r=rows[i],result=formatChoice(r);
   if(result.error){invalid++;continue;}
   const sourceId=current.special?current.meta[i]?.externalId:null;
   const base=[selectedKind(),$('import-account').value.trim().toUpperCase(),
      sourceId?'id:'+sourceId:['row',result.date,result.desc.toUpperCase(),Math.round(result.valor*100),result.nature].join('|')].join('|');
   const n=seen.get(base)||0;seen.set(base,n+1);
   preview.push({...result,base,occurrence:n,selected:result.defaultInclude,index:i+offset});
  }
  if(!preview.length)throw Error('Nenhuma transação válida. Revise as colunas e o formato das datas.');
  if(preview.length>1500)throw Error('Foram identificadas mais de 1.500 transações; selecione um período menor.');
  $('import-preview-card').hidden=false;
  drawPreview();
  notice('import-read-status','Prévia pronta. Revise os tipos e desmarque linhas que não representem transações reais.');
 }catch(e){notice('import-read-status',e.message,true);$('import-preview-card').hidden=true}
}
function drawPreview(){
 const body=$('import-preview-body'),kind=selectedKind(),opts=kind==='banco'?
   [['entrada','Entrada'],['saida','Saída']]:[['compra','Compra'],['estorno','Estorno']];
 body.innerHTML=preview.map((r,i)=>'<tr data-pidx="'+i+'" data-excluded="'+(!r.selected)+'"><td>'+
  '<input type="checkbox" data-import-check="'+i+'" '+(r.selected?'checked':'')+' aria-label="Incluir linha '+r.index+'"></td>'+
  '<td>'+esc(r.date.split('-').reverse().join('/'))+'</td><td><span class="row-main">'+esc(r.desc)+'</span><span class="row-sub">Linha '+r.index+'</span></td>'+
  '<td><select data-import-nature="'+i+'" aria-label="Natureza linha '+r.index+'">'+opts.map(([value,label])=>
    '<option value="'+value+'"'+(r.nature===value?' selected':'')+'>'+label+'</option>').join('')+'</select></td>'+
  '<td class="money">'+cash(r.valor)+'</td></tr>').join('');
 updateCounts();
}
function updateCounts(){
 const rows=preview.filter(x=>x.selected);
 const net=rows.reduce((v,r)=>v+(['entrada','estorno'].includes(r.nature)?1:-1)*r.valor,0);
 $('import-preview-count').textContent=rows.length+' selecionados';
 $('import-count-all').textContent=String(preview.length);
 $('import-count-selected').textContent=String(rows.length);
 $('import-count-skipped').textContent=String(invalid+preview.length-rows.length);
 $('import-total-selected').textContent=cash(selectedKind()==='banco'?net:-net);
 $('import-confirm').disabled=working||rows.length===0||rows.length>1500;
 $('import-select-all').checked=preview.length>0&&rows.length===preview.length;
 $('import-preview-warning').textContent=rows.length?
  'Somente estas '+rows.length+' transações serão gravadas; repetir o arquivo não recria os mesmos lançamentos.':
  'Selecione ao menos uma transação para importar.';
}
async function saveImport(){
 if(working)return;
 try{
  const account=validateSource(),selected=preview.filter(x=>x.selected);
  if(!selected.length)throw Error('Selecione pelo menos uma transação.');
  working=true;$('import-confirm').disabled=true;
  notice('import-save-status','Calculando identificadores e conferindo duplicidades...');
  const payload=[];
  for(let i=0;i<selected.length;i++){
   const row=selected[i];
   const fingerprint=await hashHex(new TextEncoder().encode(row.base+'|'+row.occurrence));
   payload.push({fingerprint,data:row.date,descricao:row.desc,valor:row.valor,natureza:row.nature});
  }
  notice('import-save-status','Gravando '+payload.length+' movimentações verificadas no Supabase...');
  const {data,error}=await db.rpc('fin_teste_importar_extrato',{
   p_tipo:selectedKind(),p_conta:account,p_nome:current.file.name.slice(0,255),
   p_hash:current.hash,p_linhas:payload
  });
  if(error)throw error;
  notice('import-save-status','Importação concluída. Novos: '+data.importadas+' · Duplicados ignorados: '+data.duplicadas+'.');
  window.frFinanceUI?.showToast(data.importadas+' lançamento(s) importado(s). '+data.duplicadas+' repetidos ignorados.');
  await Promise.allSettled([refresh(),typeof render==='function'?render():Promise.resolve()]);
 }catch(e){notice('import-save-status','Importação não concluída: '+e.message,true)}
 finally{working=false;updateCounts()}
}
async function fetchAll(makeQuery,max=6000){
 const out=[],page=650;
 for(let off=0;off<max;off+=page){
  const {data,error}=await makeQuery().range(off,off+page-1);
  if(error)throw error;
  out.push(...(data||[]));
  if(!data||data.length<page)return out;
 }
 throw Error('Mais de '+max+' registros. Utilize intervalos menores.');
}
async function refreshHistory(){
 const {data,error}=await db.from('fin_teste_importacoes')
  .select('id,tipo,conta_nome,arquivo_nome,linhas_selecionadas,criado_em')
  .order('criado_em',{ascending:false}).limit(50);
 if(error)throw error;
 const rows=data||[];
 $('import-history-rows').innerHTML=rows.length?rows.map(r=>
  '<tr><td>'+esc(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(r.criado_em)))+'</td>'+
  '<td><span class="row-main">'+esc(r.arquivo_nome)+'</span></td>'+
  '<td>'+esc(r.tipo==='banco'?'Extrato bancário':'Fatura do cartão')+'</td>'+
  '<td>'+esc(r.conta_nome)+'</td>'+
  '<td class="money">'+esc(r.linhas_selecionadas)+'</td></tr>').join(''):
  '<tr><td colspan="5" class="empty">Ainda não há arquivos importados.</td></tr>';
 $('import-history-count').textContent=rows.length+' arquivo(s) recente(s) · A mesma conta e o mesmo arquivo não geram lotes adicionais.';
}
async function refreshCards(){
 const all=await fetchAll(()=>db.from('fin_teste_cartao_lancamentos')
 .select('id,cartao_nome,data_lancamento,descricao,natureza,valor')
 .order('data_lancamento',{ascending:false}).order('id',{ascending:false}));
 cardRows=all;
 const body=$('import-card-rows');
 body.innerHTML=all.length?all.slice(0,100).map(r=>'<tr><td>'+esc(r.data_lancamento.split('-').reverse().join('/'))+'</td>'+
  '<td><span class="row-main">'+esc(r.descricao)+'</span></td><td>'+esc(r.cartao_nome)+'</td>'+
  '<td><span class="state '+(r.nature==='estorno'?'in':'out')+'">'+(r.nature==='estorno'?'Estorno':'Compra')+'</span></td>'+
  '<td class="money">'+(r.nature==='estorno'?'− ':'')+cash(r.valor)+'</td>'+
  '<td class="edit-cell"><button type="button" class="row-edit-button" data-card-edit="'+esc(r.id)+'">Editar</button></td></tr>').join(''):
  '<tr><td colspan="6" class="empty">Nenhuma compra de cartão importada neste ambiente.</td></tr>';
 const purchases=all.filter(r=>r.nature==='compra').reduce((s,r)=>s+Number(r.valor),0);
 const refunds=all.filter(r=>r.nature==='estorno').reduce((s,r)=>s+Number(r.valor),0);
 $('import-card-count').textContent=all.length+' lançamento(s)';
 $('import-card-summary').textContent='Compras: '+cash(purchases)+' · Estornos: '+cash(refunds)+' · Líquido: '+cash(purchases-refunds)+' · Últimos 100 registros exibidos.';
}
function cardStatus(message,bad=false){notice('card-edit-status',message,bad)}
function toggleCardBusy(state){
 working=state;
 for(const id of ['card-edit-save','card-edit-delete','card-delete-confirm-button'])
  if($(id))$(id).disabled=state;
}
function closeCardEditor(){
 if(working)return;
 const dlg=$('modal-import-card');if(dlg?.open)dlg.close();
}
function editCard(id){
 if(working)return;
 const row=cardRows.find(x=>x.id===id);
 if(!row){window.frFinanceUI?.showToast('Lançamento não encontrado. Atualize a lista.',true);return}
 selectedCard=id;
 $('card-edit-date').value=row.data_lancamento;
 $('card-edit-value').value=Number(row.valor).toFixed(2);
 $('card-edit-description').value=row.descricao;
 $('card-edit-nature').value=row.natureza;
 $('card-delete-confirm').classList.add('hidden');
 $('card-edit-form').classList.remove('hidden');
 cardStatus('');
 $('modal-import-card').showModal();
}
async function saveCard(e){
 e.preventDefault();
 if(!selectedCard||working)return;
 const value=numMoney($('card-edit-value').value);
 if(value===null||value<=0)return cardStatus('Valor inválido.',true);
 if(!$('card-edit-date').value||!$('card-edit-description').value.trim())return cardStatus('Data e descrição são obrigatórias.',true);
 try{
  toggleCardBusy(true);
  const {error}=await db.rpc('fin_teste_ajustar_cartao',{
   p_id:selectedCard,p_acao:'editar',p_data:$('card-edit-date').value,
   p_descricao:$('card-edit-description').value.trim(),p_valor:value,
   p_natureza:$('card-edit-nature').value
  });
  if(error)throw error;
  $('modal-import-card').close();
  window.frFinanceUI?.showToast('Gasto importado atualizado.');
  await refreshCards();
 }catch(e){cardStatus('Erro ao editar cartão: '+e.message,true)}
 finally{toggleCardBusy(false)}
}
function startDeleteCard(){
 if(!selectedCard||working)return;
 $('card-delete-confirm').classList.remove('hidden');
 $('card-edit-form').classList.add('hidden');
 $('card-delete-confirm-button').focus();
}
async function deleteCard(){
 if(!selectedCard||working)return;
 try{
  toggleCardBusy(true);
  const {error}=await db.rpc('fin_teste_ajustar_cartao',{
   p_id:selectedCard,p_acao:'excluir'
  });
  if(error)throw error;
  $('modal-import-card').close();
  window.frFinanceUI?.showToast('Lançamento de cartão excluído dos testes, com auditoria.');
  await refreshCards();
 }catch(e){cardStatus('Erro ao excluir cartão: '+e.message,true)}
 finally{toggleCardBusy(false)}
}
async function refreshReconcile(){
 const [moves,links,dues]=await Promise.all([
  fetchAll(()=>db.from('fin_teste_movimentos')
   .select('id,descricao,valor,data_movimento,referencia_cliente')
   .eq('tipo','saida').like('referencia_cliente','extrato:%')
   .order('data_movimento',{ascending:false}).order('id',{ascending:false})),
  fetchAll(()=>db.from('fin_teste_vinculos').select('movimento_id').order('id',{ascending:true})),
  fetchAll(()=>db.from('fin_teste_parcelas')
   .select('id,vencimento,valor_cheio,status,fin_teste_compras(fornecedor_id,descricao)')
   .eq('status','aberto').order('vencimento',{ascending:true}).order('id',{ascending:true}))
 ]);
 linkedBank=new Set(links.map(x=>x.movimento_id));
 bankImported=moves.filter(x=>!linkedBank.has(x.id));
 const beforeMove=$('reconcile-move').value,beforePar=$('reconcile-parcel').value;
 $('reconcile-move').replaceChildren(new Option('Selecione uma saída do extrato',''),
  ...bankImported.map(r=>new Option(r.data_movimento.split('-').reverse().join('/')+' · '+r.descricao.slice(0,36)+' · '+cash(r.valor),r.id)));
 const suppliers=window.frFinanceUI?.getSnapshot()?.suppliers||[];
 $('reconcile-parcel').replaceChildren(new Option('Selecione uma parcela em aberto',''),
  ...dues.map(r=>{
   const name=suppliers.find(s=>s.id===r.fin_teste_compras?.fornecedor_id)?.nome||'Fornecedor';
   return new Option(name+' · '+r.vencimento.split('-').reverse().join('/')+' · '+cash(r.valor_cheio),r.id);
  }));
 if(bankImported.some(x=>x.id===beforeMove))$('reconcile-move').value=beforeMove;
 if(dues.some(x=>x.id===beforePar))$('reconcile-parcel').value=beforePar;
 $('reconcile-parcel').dataset.cached=JSON.stringify(dues.map(d=>({id:d.id,valor:Number(d.valor_cheio)})));
 checkReconcile();
}
function checkReconcile(){
 const move=bankImported.find(x=>x.id===$('reconcile-move').value);
 let dues=[];try{dues=JSON.parse($('reconcile-parcel').dataset.cached||'[]')}catch(e){}
 const part=dues.find(x=>x.id===$('reconcile-parcel').value);
 const discount=numMoney($('reconcile-discount').value),fees=numMoney($('reconcile-fees').value);
 const valid=Boolean(move&&part&&discount!==null&&discount>=0&&fees!==null&&fees>=0&&
   discount<=part.valor&&Math.round((part.valor-discount+fees)*100)===Math.round(Number(move.valor)*100));
 $('reconcile-submit').disabled=!valid||working;
 const message=!move||!part?'Escolha uma saída bancária e um boleto em aberto.':
  'Valor do boleto '+cash(part.valor)+' − desconto '+cash(discount||0)+' + juros '+cash(fees||0)+
  ' = '+cash(part.valor-(discount||0)+(fees||0))+'. Saída bancária: '+cash(move.valor)+'. '+
  (valid?'Valores conferem. Pode vincular.':'Os valores precisam ser iguais.');
 $('reconcile-check').textContent=message;
 $('reconcile-check').classList.toggle('reconcile-valid',valid);
 $('reconcile-check').classList.toggle('reconcile-invalid',Boolean(move&&part&&!valid));
}
async function reconcile(){
 if(working)return;
 const move=$('reconcile-move').value,parcel=$('reconcile-parcel').value;
 if(!move||!parcel||$('reconcile-submit').disabled)return;
 const discount=numMoney($('reconcile-discount').value),fees=numMoney($('reconcile-fees').value);
 if(discount===null||fees===null)return;
 working=true;$('reconcile-submit').disabled=true;
 try{
  const {data,error}=await db.rpc('fin_teste_vincular_pagamento_importado',{
   p_movimento:move,p_parcela:parcel,p_desconto:discount,p_juros:fees
  });
  if(error)throw error;
  notice('reconcile-status','Boleto baixado com a saída bancária já existente. Nenhuma movimentação extra foi criada.');
  window.frFinanceUI?.showToast('Boleto conciliado. Pagamento não duplicado.');
  await Promise.allSettled([typeof render==='function'?render():Promise.resolve(),refresh()]);
 }catch(e){notice('reconcile-status','Falha na conciliação: '+e.message,true)}
 finally{working=false;checkReconcile()}
}
let pendingRefresh=null;
async function refresh(){
 if(typeof db==='undefined'||!db)return;
 if(pendingRefresh)return pendingRefresh;
 pendingRefresh=Promise.allSettled([refreshCards(),refreshReconcile(),refreshHistory()])
  .then(results=>{
    const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason?.message||'Erro de conexão');
    if(errors.length)notice('reconcile-status','Atualização parcial: '+errors.join('; '),true);
  }).finally(()=>{pendingRefresh=null});
 return pendingRefresh;
}
function init(){
 const form=$('import-file');if(!form)return;
 form.addEventListener('change',()=>readFile());
 document.querySelectorAll('input[name="import-kind"]').forEach(el=>el.addEventListener('change',updateKind));
 $('import-sheet').addEventListener('change',()=>{
  if(!current?.workbook)return;
  current.rows=window.XLSX.utils.sheet_to_json(current.workbook.Sheets[$('import-sheet').value],{header:1,raw:false,defval:''});
  current.meta=[];setRows(current.rows);
  $('import-preview-card').hidden=true;
 });
 $('import-header').addEventListener('change',mapColumns);
 $('import-preview-button').addEventListener('click',buildPreview);
 $('import-confirm').addEventListener('click',saveImport);
 $('import-preview-body').addEventListener('change',event=>{
  const check=event.target.closest('[data-import-check]'),nature=event.target.closest('[data-import-nature]');
  if(check){const i=Number(check.dataset.importCheck);if(preview[i])preview[i].selected=check.checked;check.closest('tr').dataset.excluded=String(!check.checked)}
  if(nature){const i=Number(nature.dataset.importNature);if(preview[i])preview[i].nature=nature.value}
  updateCounts();
 });
 $('import-select-all').addEventListener('change',e=>{
  preview.forEach(r=>r.selected=e.target.checked);drawPreview();
 });
 $('import-toggle-all').addEventListener('click',()=>{
  const target=preview.some(x=>!x.selected);preview.forEach(r=>r.selected=target);drawPreview();
 });
 $('import-card-rows').addEventListener('click',event=>{
  const btn=event.target.closest('[data-card-edit]');
  if(btn)editCard(btn.dataset.cardEdit);
 });
 $('card-edit-form').addEventListener('submit',saveCard);
 $('card-edit-close').addEventListener('click',closeCardEditor);
 $('card-edit-cancel').addEventListener('click',closeCardEditor);
 $('card-edit-delete').addEventListener('click',startDeleteCard);
 $('card-delete-cancel').addEventListener('click',()=>{
  $('card-delete-confirm').classList.add('hidden');
  $('card-edit-form').classList.remove('hidden');
  $('card-edit-delete').focus();
 });
 $('card-delete-confirm-button').addEventListener('click',deleteCard);
 $('modal-import-card').addEventListener('close',()=>{
  selectedCard=null;
  $('card-delete-confirm').classList.add('hidden');
  $('card-edit-form').classList.remove('hidden');
 });
 $('import-reload').addEventListener('click',refresh);
 ['reconcile-move','reconcile-parcel','reconcile-discount','reconcile-fees'].forEach(id=>
  $(id).addEventListener(id.startsWith('reconcile-')&&id.includes('discount')||id.includes('fees')?'input':'change',checkReconcile));
 $('reconcile-submit').addEventListener('click',reconcile);
 updateKind();
}
window.frImportUI={refresh,parseCSV,parseOFX,numMoney,dateISO};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
