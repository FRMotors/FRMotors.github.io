/* FR Motors | Histórico documental e situação atual, sem editar originais.
 * A correspondência entre carteiras distintas só é aceita quando fornecedor,
 * vencimento e valor são iguais E únicos em ambas as origens. */
(function(root){
'use strict';
const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/\s+/g,' ').trim();
function cents(v){
 const n=Number(v);
 if(!Number.isFinite(n)||n<0)throw Error('Documento com valor inválido.');
 const c=Math.round(n*100);
 if(!Number.isSafeInteger(c))throw Error('Documento excede o valor seguro.');
 return c;
}
function matchKey(row,valueField='valor_registrado'){
 if(!row?.vencimento||!row?.fornecedor_nome||row[valueField]===null)return '';
 const day=String(row.vencimento).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
 return [fold(row.fornecedor_nome),day,cents(row[valueField])].join('|');
}
function matchLiveDocs(documents,accounts){
 if(!Array.isArray(documents)||!Array.isArray(accounts))
  throw Error('Fontes documentais indisponíveis.');
 const unique=new Map();
 for(const a of accounts){
  const key=matchKey(a,'valor_referencia');
  if(!key)continue;
  if(!unique.has(key))unique.set(key,[]);
  unique.get(key).push(a);
 }
 const documentCounts=new Map();
 for(const d of documents){
  if(d.grupo!=='autopecas'||d.incluir!==true)continue;
  const key=matchKey(d);
  if(key)documentCounts.set(key,(documentCounts.get(key)||0)+1);
 }
 const results=new Map();
 for(const d of documents){
  if(d.grupo!=='autopecas'||d.incluir!==true)continue;
  const key=matchKey(d),links=unique.get(key)||[];
  // Um par com mais de um candidato exige conferência humana e não prova pagamento.
  if(!key||documentCounts.get(key)!==1||links.length!==1)continue;
  const a=links[0];
  const paid=['pago','conciliado_extrato','conciliado'].includes(a.situacao);
  const open=a.situacao==='aberto';
  if(!paid&&!open)continue;
  results.set(d.id,{status:paid?'pago':'aberto',accountId:a.id,
   valuePaid:paid&&a.valor_pago!==null?cents(a.valor_pago):null,
   paidDate:paid?a.data_pagamento||null:null,source:'Compromisso operacional vinculado por correspondência única'});
 }
 return results;
}
function annualDocuments(parts,bills,year){
 const yy=String(year),previous=String(Number(year)-1);
 const sum=(rows,field,kind)=>rows.reduce((n,r)=>{
  const date=kind(r);
  return date?.slice(0,4)===field?n+cents(r.valor_registrado??r.valor_documental):n;
 },0);
 const partsFor=val=>parts.filter(r=>r.incluir===true&&r.grupo==='autopecas'&&String(r.data_evento||'').slice(0,4)===val);
 const billsFor=val=>bills.filter(r=>String(r.mes_fatura||'').slice(0,4)===val);
 const docParts=val=>partsFor(val).reduce((n,r)=>n+cents(r.valor_registrado),0);
 const docBills=val=>billsFor(val).reduce((n,r)=>n+cents(r.valor_documental),0);
 return {year:Number(year),
  parts:{current:docParts(yy),prior:docParts(previous),currentCount:partsFor(yy).length,priorCount:partsFor(previous).length},
  bills:{current:docBills(yy),prior:docBills(previous),currentCount:billsFor(yy).length,priorCount:billsFor(previous).length}
 };
}
// As duas carteiras são independentes. O identificador inclui a origem para
// evitar que PARQUE Autopeças seja confundido com PARQUE Cartões.
function supplierIdentity(row){
 if(!row||!['autopecas','cartoes'].includes(row.grupo))return null;
 const base=String(row.fornecedor_nome||row.descricao||'Não identificado').trim()||'Não identificado';
 const normalized=fold(base);
 // Compras no marketplace podem vir no extrato do cartão como
 // "MERCADO LIVRE*VENDEDOR". A etiqueta identifica o canal, não o vendedor real.
 const name=row.grupo==='cartoes'&&/^MERCADO\s*LIVRE(?:[^A-Z0-9]|$)/.test(normalized)?
  'MERCADO LIVRE':base;
 return {group:row.grupo,name,key:row.grupo+'|'+fold(name)};
}
function supplierCatalogue(documents,registered=[]){
 if(!Array.isArray(documents)||!Array.isArray(registered))
  throw Error('Catálogos de fornecedores indisponíveis.');
 const map=new Map();
 for(const d of documents){
  const supplier=supplierIdentity(d);
  if(!supplier)continue;
  const old=map.get(supplier.key)||{...supplier,count:0,included:0,years:new Set(),master:false};
  old.count++;
  if(d.incluir===true)old.included++;
  const month=String(d.grupo==='cartoes'?(d.mes_fatura||d.data_evento):
   (d.vencimento||d.data_evento)||'');
  if(/^\d{4}-/.test(month))old.years.add(month.slice(0,4));
  map.set(supplier.key,old);
 }
 for(const row of registered){
  const name=String(row.nome||'').trim();
  if(!name)continue;
  const known=[...map.values()].some(s=>fold(s.name)===fold(name));
  if(!known){
   const key='cadastro|'+fold(name);
   map.set(key,{group:'cadastro',name,key,count:0,included:0,years:new Set(),master:true});
  }
 }
 const groupOrder={autopecas:0,cartoes:1,cadastro:2};
 return [...map.values()].map(({years,...r})=>({...r,years:[...years].sort()}))
  .sort((a,b)=>groupOrder[a.group]-groupOrder[b.group]||
   a.name.localeCompare(b.name,'pt-BR'));
}
function defaultSupplierKeys(catalogue){
 return new Set(catalogue.filter(s=>s.group==='autopecas'||
  (s.group==='cartoes'&&(/RETIF|MERCADO LIVRE/.test(fold(s.name)))))
  .map(s=>s.key));
}
function signedCents(v){
 const number=Number(v),value=Math.round(number*100);
 if(!Number.isFinite(number)||!Number.isSafeInteger(value))
  throw Error('Valor documental inválido.');
 return value;
}
function monthlySuppliers(docs,year,selectedKeys=null){
 const yr=String(year),bySupplier=new Map();
 for(const r of docs){
  if(r.incluir!==true)continue;
  const supplier=supplierIdentity(r);
  if(!supplier)continue;
  if(selectedKeys!==null){
   if(!selectedKeys.has(supplier.key))continue;
  }else if(r.grupo!=='autopecas')continue; // Retrocompatibilidade.
  const period=String(r.grupo==='cartoes'?(r.mes_fatura||r.data_evento):
   (r.vencimento||r.data_evento)||'').slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period.slice(0,4)!==yr)continue;
  const idx=Number(period.slice(5,7))-1;
  const item=bySupplier.get(supplier.key)||{...supplier,months:Array(12).fill(0),total:0,count:0};
  const c=signedCents(r.valor_registrado);
  item.months[idx]+=c;item.total+=c;item.count++;
  bySupplier.set(supplier.key,item);
 }
 return [...bySupplier.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
}
const api=Object.freeze({fold,cents,matchKey,matchLiveDocs,annualDocuments,supplierIdentity,supplierCatalogue,defaultSupplierKeys,monthlySuppliers,signedCents});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frDocumentsStatusCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
