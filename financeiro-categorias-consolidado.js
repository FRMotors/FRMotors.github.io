/* FR Motors | Consolidação de fontes sem dupla contagem.
 * Um relatório único: caixa homologado até a data do fechamento e
 * somente movimentos bancários novos após conferência de repetições.
 * Não grava nem altera qualquer registro financeiro. */
(function(root){
'use strict';
function fold(v){
 return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function identity(value){
 const raw=String(value??'');
 const doc=raw.match(new RegExp('[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2}|[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}'));
 return doc?'doc:'+doc[0].replace(/[^0-9]/g,''):'texto:'+fold(raw).replace(/[^a-z0-9]+/g,'');
}
function matchOfficial(bank,official){
 const a=String(bank.bankDescription||'').trim(),b=String(official.description||'').trim();
 if(!a||!b)return false;
 const clean=v=>fold(v).replace(/[^a-z0-9]+/g,'');
 if(clean(a)===clean(b))return true;
 return identity(a).startsWith('doc:')&&identity(a)===identity(b);
}
function uniqueImported(rows){
 if(!Array.isArray(rows))throw Error('Extratos indisponíveis.');
 const files=new Map();
 for(const row of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||
   !['entrada','saida'].includes(row.type)||!Number.isSafeInteger(row.value)||
   row.value<=0||!row.importId||!String(row.bankDescription||'').trim())
   throw Error('Extrato sem dados para verificar repetições.');
  const id=String(row.importId);
  if(!files.has(id))files.set(id,{date:String(row.fileCreated||''),rows:[]});
  files.get(id).rows.push(row);
 }
 const ordered=[...files].sort((a,b)=>a[1].date.localeCompare(b[1].date)||a[0].localeCompare(b[0]));
 const previous=new Map(),positions=new Map(),kept=[];
 let repeated=0;
 for(const [,file] of ordered){
  const current=new Map();
  const sorted=file.rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||
   String(a.bankDescription).localeCompare(String(b.bankDescription))||
   String(a.id).localeCompare(String(b.id)));
  for(const row of sorted){
   const key=[fold(row.account),row.date,row.type,row.value,identity(row.bankDescription)].join('|');
   const number=(current.get(key)||0)+1;current.set(key,number);
   let hits=positions.get(key);
   if(!hits){hits=[];positions.set(key,hits)}
   if(number>(previous.get(key)||0)){
    hits.push(kept.length);kept.push(row);
   }else{
    repeated++;
    const index=hits[number-1];
    if(index===undefined)throw Error('Inconsistência na contagem de extratos.');
    if(row.manual&&!kept[index].manual)kept[index]=row;
   }
  }
  for(const [key,count] of current)
   previous.set(key,Math.max(previous.get(key)||0,count));
 }
 return {rows:kept,repeated};
}
function combineSources(official,imported){
 if(!Array.isArray(official)||!Array.isArray(imported))
  throw Error('Fontes financeiras incompletas.');
 const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 for(const row of official)if(!validDate(row.date)||!Number.isSafeInteger(row.value)||
  !['entrada','saida'].includes(row.type))throw Error('Caixa homologado contém data, tipo ou valor inválido.');
 const cutoff=official.length?official.map(r=>r.date).sort().at(-1):null;
 const dedup=uniqueImported(imported),older=[],cutoffRows=[],later=[];
 for(const row of dedup.rows){
  if(!validDate(row.date))throw Error('Data de extrato inválida.');
  if(cutoff&&row.date<cutoff)older.push(row);
  else if(cutoff&&row.date===cutoff)cutoffRows.push(row);
  else later.push(row);
 }
 const officialDay=new Map();
 if(cutoff)for(const row of official.filter(r=>r.date===cutoff)){
  const key=[row.date,row.type,row.value].join('|');
  const list=officialDay.get(key)||[];
  list.push(row);officialDay.set(key,list);
 }
 let matches=0;
 const weakMatches=[],missingOnCutoff=[];
 for(const row of cutoffRows){
  const key=[row.date,row.type,row.value].join('|');
  const choices=officialDay.get(key)||[];
  if(!choices.length){missingOnCutoff.push(row);continue}
  let idx=choices.findIndex(other=>matchOfficial(row,other));
  const exact=idx>=0;
  if(!exact)idx=0;
  const target=choices.splice(idx,1)[0];
  matches++;
  if(!exact)weakMatches.push({bank:row,official:target});
 }
 const newRows=[...missingOnCutoff,...later].map(row=>({
  ...row,source:'Extrato importado · não homologado'
 }));
 return {
  rows:[...official,...newRows],
  cutoff,
  officialCount:official.length,
  importedCount:imported.length,
  importedUnique:dedup.rows.length,
  repeatedInPDFs:dedup.repeated,
  ignoredBeforeCutoff:older.length,
  matchedOnCutoff:matches,
  weakMatches,
  addedCount:newRows.length,
  addedIncoming:newRows.filter(row=>row.type==='entrada').reduce((n,row)=>n+row.value,0),
  addedOutgoing:newRows.filter(row=>row.type==='saida').reduce((n,row)=>n+row.value,0)
 };
}
const api=Object.freeze({identity,matchOfficial,uniqueImported,combineSources});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frCategoryCombinedCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
