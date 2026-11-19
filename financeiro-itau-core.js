/* FR Motors Financeiro | motor puro e auditável da conciliação Itaú.
 * Sem conexão com banco, sem gravações. Valores somados exclusivamente em centavos.
 * Executável no navegador e em testes Node sem dependências externas. */
(function(root){
'use strict';
function cents(v){
 const n=Number(v);
 if(!Number.isFinite(n))throw Error('Valor financeiro ausente ou inválido.');
 const c=Math.round(n*100);
 if(!Number.isSafeInteger(c))throw Error('Valor fora do intervalo financeiro seguro.');
 return c;
}
function validDate(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const t=new Date(v+'T00:00:00Z');
 return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===v;
}
function fold(v){
 return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function accountIsItau(v){return fold(v)==='itau'}
function descriptionIdentity(v){
 const d=String(v??'');
 const doc=d.match(/[0-9]{2}[.][0-9]{3}[.][0-9]{3}\/[0-9]{4}-[0-9]{2}|[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}/);
 return doc?'doc:'+doc[0].replace(/[^0-9]/g,''):'texto:'+fold(d).replace(/[^a-z0-9]+/g,'');
}
function plainDescription(v){return fold(v).replace(/[^a-z0-9]+/g,'')}
function amountRow(r){
 const v=cents(r.valor);
 if(v<=0)throw Error('Extrato contém valor zerado ou negativo; revise a importação.');
 return v;
}
function bankKey(r){
 return [r.data_lancamento,r.natureza,amountRow(r),descriptionIdentity(r.descricao)].join('|');
}
function officialKey(r){
 return [r.data_movimento||r.data_lancamento,r.tipo||r.natureza,cents(r.valor)].join('|');
}
function canonicalBank(files,lines){
 if(!Array.isArray(files)||!Array.isArray(lines))throw Error('Lista de arquivos ou movimentos indisponível.');
 const bankFiles=files.filter(f=>accountIsItau(f.conta_nome)).slice()
  .sort((a,b)=>String(a.criado_em||'').localeCompare(String(b.criado_em||''))||String(a.id).localeCompare(String(b.id)));
 const byFile=new Map(bankFiles.map(f=>[f.id,[]]));
 for(const r of lines){if(byFile.has(r.importacao_id))byFile.get(r.importacao_id).push(r)}
 const canonical=[],repeated=[],maxPerKey=new Map();
 for(const file of bankFiles){
  const localCounts=new Map();
  const rows=(byFile.get(file.id)||[]).slice().sort((a,b)=>
   String(a.data_lancamento).localeCompare(String(b.data_lancamento))||
   String(a.descricao).localeCompare(String(b.descricao))||String(a.id).localeCompare(String(b.id)));
  for(const r of rows){
   if(!validDate(r.data_lancamento)||!['entrada','saida'].includes(r.natureza))
    throw Error('Linha inválida no extrato '+String(file.arquivo_nome||'Itaú')+'; cálculo interrompido.');
   const key=bankKey(r),n=(localCounts.get(key)||0)+1;
   localCounts.set(key,n);
   const entry={...r,arquivo_nome:file.arquivo_nome};
   if(n>(maxPerKey.get(key)||0))canonical.push(entry);
   else repeated.push(entry);
  }
  for(const [key,n] of localCounts)maxPerKey.set(key,Math.max(n,maxPerKey.get(key)||0));
 }
 return {files:bankFiles,canonical,repeated};
}
function officialDescriptionMatches(bank,official){
 // Uma descrição completamente diferente não confirma identidade financeira.
 const a=plainDescription(bank.descricao),b=plainDescription(official.descricao);
 if(!a||!b)return false;
 if(a===b)return true;
 const bankDoc=descriptionIdentity(bank.descricao),officialDoc=descriptionIdentity(official.descricao);
 return bankDoc.startsWith('doc:')&&bankDoc===officialDoc;
}
function reconcile(base,canonical,official,cutoff){
 if(!validDate(cutoff))throw Error('Data de fechamento do caixa inválida.');
 const baseCents=cents(base),byKey=new Map();
 for(const r of official||[]){
  if(!validDate(r.data_movimento))throw Error('Movimento homologado com data inválida.');
  const key=officialKey(r);
  if(!byKey.has(key))byKey.set(key,[]);
  byKey.get(key).push(r);
 }
 const pending=[],already=[],weakMatches=[];
 for(const r of canonical||[]){
  if(!validDate(r.data_lancamento))throw Error('Extrato com data inválida.');
  if(r.data_lancamento<cutoff)continue;
  const key=officialKey(r),matches=byKey.get(key)||[];
  if(matches.length){
   const exact=matches.findIndex(other=>officialDescriptionMatches(r,other));
   const officialMatch=matches.splice(exact>=0?exact:0,1)[0];
   const match={bank:r,official:officialMatch,confianca:exact>=0?'descricao':'somente_data_tipo_valor'};
   already.push(match);
   if(exact<0)weakMatches.push(match);
  }else pending.push(r);
 }
 const addedIn=pending.filter(r=>r.natureza==='entrada').reduce((v,r)=>v+amountRow(r),0);
 const addedOut=pending.filter(r=>r.natureza==='saida').reduce((v,r)=>v+amountRow(r),0);
 return {baseCents,addedIn,addedOut,pending,already,weakMatches,
  balanceCents:baseCents+addedIn-addedOut};
}
function signedCents(r){return (r.natureza==='entrada'?1:-1)*amountRow(r)}
function projectionOnDate(baseCents,pending,day){
 if(!validDate(day))throw Error('Data da referência bancária inválida.');
 return baseCents+(pending||[]).filter(r=>r.data_lancamento<=day)
  .reduce((v,r)=>v+signedCents(r),0);
}
function compareBankReference(rec,reference,cutoff,latestDate){
 if(!reference)return {status:'sem_referencia',differenceCents:null};
 if(!validDate(reference.data_referencia))throw Error('Referência bancária com data inválida.');
 const day=reference.data_referencia;
 if(day<cutoff||day>latestDate)return {status:'fora_do_periodo',differenceCents:null};
 const calculated=projectionOnDate(rec.baseCents,rec.pending,day);
 const bankCents=cents(reference.saldo),differenceCents=calculated-bankCents;
 return {status:differenceCents===0?'conferido':'divergente',differenceCents,
  referenceDate:day,bankCents,calculatedCents:calculated};
}
function ensureSnapshotMatches(excelDate,officialDate){
 if(!validDate(excelDate)||!validDate(officialDate))
  throw Error('Data de fechamento ausente; não é possível conciliar automaticamente.');
 if(excelDate!==officialDate)
  throw Error('Datas de fechamento divergentes entre Excel ('+excelDate+') e caixa oficial ('+officialDate+'). Atualização bloqueada para evitar contagem duplicada.');
 return true;
}
function buildMonthly(monthly,pending,cutoff){
 if(!Array.isArray(monthly)||!monthly.length)throw Error('Sem resumo mensal homologado.');
 if(!validDate(cutoff))throw Error('Data de fechamento inválida.');
 const originals=monthly.slice().sort((a,b)=>String(a.mes).localeCompare(String(b.mes)));
 const lastMonth=String(originals[originals.length-1].mes).slice(0,7);
 if(lastMonth!==cutoff.slice(0,7))
  throw Error('O último mês homologado difere do mês de fechamento. Verifique a versão do Excel.');
 const official=new Map(originals.map(r=>[String(r.mes).slice(0,7),r]));
 const delta=new Map();
 for(const r of pending||[]){
  if(r.data_lancamento<cutoff)throw Error('Tentativa de incluir lançamento anterior ao fechamento.');
  const key=r.data_lancamento.slice(0,7),add=delta.get(key)||{inc:0,out:0,nIn:0,nOut:0};
  if(r.natureza==='entrada'){add.inc+=amountRow(r);add.nIn++}
  else if(r.natureza==='saida'){add.out+=amountRow(r);add.nOut++}
  else throw Error('Tipo de movimento não reconhecido.');
  delta.set(key,add);
 }
 const keys=[...new Set([...official.keys(),...delta.keys()])].sort();
 const lastBalance=cents(originals[originals.length-1].saldo_teorico_acumulado);
 let accumulated=0;
 return keys.map(key=>{
  const row=official.get(key),add=delta.get(key)||{inc:0,out:0,nIn:0,nOut:0};
  accumulated+=add.inc-add.out;
  const inc=cents(row?.entradas_operacionais||0)+add.inc;
  const out=cents(row?.saidas||0)+add.out;
  const baseBalance=row?cents(row.saldo_teorico_acumulado):lastBalance;
  return {...(row||{mes:key+'-01',saldo_abertura:0}),
   entradas_operacionais:inc/100,saidas:out/100,
   entradas_qtd:Number(row?.entradas_qtd||0)+add.nIn,
   saidas_qtd:Number(row?.saidas_qtd||0)+add.nOut,
   resultado_operacional:(inc-out)/100,
   saldo_teorico_acumulado:(baseBalance+accumulated)/100,
   extrato_entradas:add.inc/100,extrato_saidas:add.out/100};
 });
}
const api=Object.freeze({cents,validDate,accountIsItau,descriptionIdentity,canonicalBank,
 reconcile,projectionOnDate,compareBankReference,ensureSnapshotMatches,buildMonthly});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frItauCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
