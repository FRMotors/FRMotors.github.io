/* FR Motors | Posição atual auditada de boletos.
 * Consulta transacional em leitura, separada do histórico de eventos.
 * Sem inferir pagamento pelo nome do fornecedor, data ou valor aproximado. */
(function(root){
'use strict';
const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const paidState=new Set(['pago','conciliado','conciliado_extrato']);
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||'').slice(0,10));
function classifyPayable(row){
 const paid=paidState.has(row.situacao),hasEvidence=row.valor_pago!==null&&row.valor_pago!==undefined||
  Boolean(row.data_pagamento)||Boolean(row.movimento_teste_id)||Boolean(row.vinculo_teste_id);
 if(paid)return 'pago';
 if(row.situacao==='aberto'&&!hasEvidence)return 'aberto';
 return 'revisar';
}
function currentBills(accounts,manual,payments,extracts){
 if(![accounts,manual,payments,extracts].every(Array.isArray))throw Error('Histórico de boletos incompleto.');
 const all=[],idSet=new Set(),byManual=new Map();
 for(const payment of [...payments,...extracts]){
  if(!payment.boleto_avulso_id)continue;
  if(!byManual.has(payment.boleto_avulso_id))byManual.set(payment.boleto_avulso_id,[]);
  byManual.get(payment.boleto_avulso_id).push(payment);
 }
 for(const a of accounts){
  if(a.arquivado_em)continue;
  if(!a.id||idSet.has('conta:'+a.id))throw Error('Compromisso sem identidade única.');
  idSet.add('conta:'+a.id);
  const state=classifyPayable(a);
  all.push({
   key:'conta:'+a.id,id:a.id,kind:'conta',name:a.fornecedor_nome||a.descricao||'Sem fornecedor',
   description:a.descricao||'',due:a.vencimento||'',reference:Number(a.valor_referencia),
   state,paidValue:state==='pago'&&a.valor_pago!=null?Number(a.valor_pago):null,
   paidDate:state==='pago'?a.data_pagamento||'':null,
   evidence:state==='pago'?'Status do compromisso: '+a.situacao:
    state==='aberto'?'Sem baixa vinculada no cadastro operacional':'Registro com situação e evidência divergentes'
  });
 }
 for(const a of manual){
  if(a.excluido_em)continue;
  if(!a.id||idSet.has('avulso:'+a.id))throw Error('Boleto avulso sem identidade única.');
  idSet.add('avulso:'+a.id);
  const links=byManual.get(a.id)||[];
  const state=links.length===0?'aberto':links.length===1?'pago':'revisar';
  all.push({
   key:'avulso:'+a.id,id:a.id,kind:'avulso',name:a.fornecedor_nome||a.descricao||'Sem fornecedor',
   description:a.descricao||'',due:a.vencimento||'',reference:Number(a.valor_referencia),
   state,paidValue:state==='pago'?Number(links[0].valor_pago):null,
   paidDate:state==='pago'?links[0].data_pagamento||'':null,
   evidence:links.length===0?'Nenhuma baixa vinculada a este boleto avulso':
    links.length===1?'Baixa vinculada: '+('movimento_teste_id'in links[0]?'extrato':'fluxo operacional'):
    'Mais de um vínculo para o mesmo boleto: exige conferência'
  });
 }
 return all.sort((a,b)=>{
  const order={revisar:0,pago:1,aberto:2};
  return order[a.state]-order[b.state]||
   String(b.paidDate||b.due).localeCompare(String(a.paidDate||a.due))||
   fold(a.name).localeCompare(fold(b.name))||a.key.localeCompare(b.key);
 });
}
function counts(rows){
 return rows.reduce((r,x)=>{r[x.state]++;return r},{pago:0,aberto:0,revisar:0});
}
function viewStatus(state){
 return state==='pago'?'Pago / conciliado':state==='aberto'?'Em aberto no cadastro':'Exige revisão';
}
function historyStatus(v){
 return v==='aberto'?'Em aberto':paidState.has(v)?'Conciliado / pago':String(v||'Não informado');
}
const api=Object.freeze({fold,classifyPayable,currentBills,counts,viewStatus,historyStatus});
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.frAuditCurrentCore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
