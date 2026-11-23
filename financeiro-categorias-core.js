/* FR Motors | Consolidação de receitas e despesas por categoria.
 * Motor puro. Caixa homologado e importações bancárias nunca são somados entre si.
 * Valores convertidos em centavos para prevenir diferenças de arredondamento. */
(function(root){
'use strict';
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/g,' ').trim();
const moneyCents=value=>{
 const v=Number(value);
 if(!Number.isFinite(v)||v<0)throw Error('Lançamento com valor inválido; relatório interrompido.');
 const cents=Math.round(v*100);
 if(!Number.isSafeInteger(cents))throw Error('Valor acima do limite seguro.');
 return cents;
};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(new Date(s+'T00:00:00Z').getTime())&&
 new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const categoryName=s=>String(s??'').replace(/\s+/g,' ').trim()||'SEM CATEGORIA';
const categoryKey=s=>fold(categoryName(s));
const isUnclassified=s=>['sem categoria','extrato bancario','a classificar','nao classificado'].includes(categoryKey(s));
function sourceRowsOfficial(records){
 if(!Array.isArray(records))throw Error('A base homologada não foi carregada.');
 return records.filter(r=>r.estado==='confirmado'&&['fluxo_caixa_homologado','extrato_itau_homologado'].includes(r.origem))
 .map(r=>{
  if(!validDate(r.data_movimento)||!['entrada','saida'].includes(r.tipo))throw Error('Movimento oficial com data ou tipo inválido.');
  return {id:r.id,date:r.data_movimento,type:r.tipo,value:moneyCents(r.valor),category:categoryName(r.categoria),
   description:r.descricao||'Sem descrição',account:'',source:r.origem==='extrato_itau_homologado'?'PDF Itaú homologado':'Caixa homologado'};
 });
}
function sourceRowsImported(files,lines,movements){
 if(!Array.isArray(files)||!Array.isArray(lines)||!Array.isArray(movements))
  throw Error('Fontes bancárias incompletas.');
 const byFile=new Map(files.filter(f=>f.tipo==='banco').map(f=>[f.id,f]));
 const byMovement=new Map(movements.map(r=>[r.id,r])),seen=new Set(),rows=[];
 for(const line of lines){
  const file=byFile.get(line.importacao_id);
  if(!file)continue;
  const m=byMovement.get(line.movimento_id);
  if(!m)throw Error('Extrato '+(file.arquivo_nome||'')+' contém movimento sem vínculo financeiro.');
  if(m.referencia_cliente!=='extrato:'+line.fingerprint)
   throw Error('Extrato bancário com vínculo inconsistente. Revise a importação.');
  if(m.data_movimento!==line.data_lancamento||m.tipo!==line.natureza||
   moneyCents(m.valor)!==moneyCents(line.valor))
   throw Error('Movimento importado diferente do original bancário. Relatório bloqueado.');
  if(m.estado==='cancelado')continue;
  if(m.estado!=='confirmado')throw Error('Extrato com situação financeira inesperada.');
  if(seen.has(m.id))throw Error('Movimento importado duplicado na consulta.');
  seen.add(m.id);
  if(!validDate(line.data_lancamento)||!['entrada','saida'].includes(line.natureza))
   throw Error('Extrato com data ou natureza inválida.');
  rows.push({id:line.id,date:line.data_lancamento,type:line.natureza,value:moneyCents(line.valor),
   category:categoryName(m.categoria||line.categoria_personalizada),
   description:line.descricao_personalizada||m.descricao||line.descricao,
   bankDescription:line.descricao,account:file.conta_nome||'Conta não informada',
   file:file.arquivo_nome,importId:line.importacao_id,fileCreated:file.criado_em||'',
   manual:Boolean(line.categoria_personalizada),source:'Extrato importado'});
 }
 return rows;
}
function summarize(rows,filters={}){
 const year=Number(filters.year),month=String(filters.month||'todos');
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Ano do relatório inválido.');
 if(month!=='todos'&&!/^(0[1-9]|1[0-2])$/.test(month))throw Error('Mês do relatório inválido.');
 const account=fold(filters.account||'');
 const scoped=rows.filter(r=>r.date.slice(0,4)===String(year)&&
  (month==='todos'||r.date.slice(5,7)===month)&&
  (!account||fold(r.account)===account));
 const output={entries:0,exits:0,incoming:0,outgoing:0,pendingClass:0,pendingClassAmount:0,
  rows:scoped,inGroups:[],outGroups:[],allGroups:[],net:0};
 const groups=new Map();
 for(const r of scoped){
  const isIn=r.type==='entrada',cat=categoryName(r.category),key=r.type+'|'+categoryKey(cat);
  if(!['entrada','saida'].includes(r.type))throw Error('Natureza financeira inválida.');
  if(isIn){output.entries++;output.incoming+=r.value}else{output.exits++;output.outgoing+=r.value}
  if(isUnclassified(cat)){output.pendingClass++;output.pendingClassAmount+=r.value}
  const item=groups.get(key)||{key,label:cat,type:r.type,value:0,count:0};
  item.value+=r.value;item.count++;
  // Preferir acentuação legível para variações como SALARIOS / SALÁRIOS.
  if(!/[ÁÀÂÃÉÊÍÓÔÕÚÇ]/i.test(item.label)&&/[ÁÀÂÃÉÊÍÓÔÕÚÇ]/i.test(cat))item.label=cat;
  groups.set(key,item);
 }
 const sorted=Array.from(groups.values()).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'pt-BR'));
 output.inGroups=sorted.filter(r=>r.type==='entrada');
 output.outGroups=sorted.filter(r=>r.type==='saida');
 output.allGroups=sorted;
 output.net=output.incoming-output.outgoing;
 return output;
}
const api=Object.freeze({fold,moneyCents,categoryName,categoryKey,isUnclassified,validDate,
 sourceRowsOfficial,sourceRowsImported,summarize});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frCategoryCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
