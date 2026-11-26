'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('financeiro.html');
const wallet=read('financeiro-contas-operacionais.js');
const trash=read('financeiro-lixeira-boletos.js');
const css=read('financeiro-lixeira-boletos.css');
const navigation=read('financeiro-pro-ui.js');

function harness(){
 const fields=new Map();
 function el(id){
  if(!fields.has(id))fields.set(id,{
   value:id==='cp-status-filter'||id==='cp-year-filter'||id==='cp-month-filter'||id==='cp-source-filter'?'todos':'',
   innerHTML:'',textContent:'',disabled:false,listeners:{},
   replaceChildren(){},
   addEventListener(type,fn){this.listeners[type]=fn}
  });
  return fields.get(id);
 }
 const parcel=(id,n,value,due)=>({
  id,compra_id:'compra-1',numero:n,vencimento:due,valor_cheio:value,status:'aberto',
  fin_compras:{id:'compra-1',fornecedor_id:'vendor-1',descricao:'LOPES COMPRA NOVEMBRO',forma_pagamento:'boleto'}
 });
 const dataset={
  fin_contas_pagar:[{id:'original-1',registro_tipo:'planilha',fornecedor_nome:'Fornecedor importado',
   descricao:'Boleto Excel',categoria:'FORNECEDORES',valor_referencia:400,vencimento:'2026-12-11',
   situacao:'aberto',valor_cheio_informado:null,desconto_efetivo:null,juros_efetivos:null,
   ajuste_efetivo:0,justificativa_ajuste:null,linha_excel:42}],
  fin_boletos_avulsos:[{id:'manual-1',fornecedor_nome:'Fornecedor manual',descricao:'Boleto avulso',
   categoria:'FORNECEDORES',valor_referencia:200,vencimento:'2026-12-12'}],
  fin_parcelas:[parcel('p1',1,392.58,'2026-12-16'),parcel('p2',2,392.57,'2026-12-31'),
   parcel('p3',3,392.57,'2027-01-15')],
  fin_fornecedores:[{id:'vendor-1',nome:'LOPES',desconto_atual_pct:0,desconto_ate_vencimento:false}],
  fin_baixas_operacionais:[],fin_baixas_extrato_avulsos:[]
 };
 const queries=[];
 const db={
  rpc:async(name)=>({data:name==='fluxo_caixa_autorizado',error:null}),
  from(name){
   const query={table:name,conditions:[]};
   const chain={
    select(columns){query.columns=columns;return this;},
    eq(...args){query.conditions.push(['eq',...args]);return this;},
    in(...args){query.conditions.push(['in',...args]);return this;},
    is(){return this;},not(){return this;},order(){return this;},limit(){return this;},
    then(done,failed){queries.push(query);return Promise.resolve({
      data:dataset[name]||[],error:null
    }).then(done,failed)}
   };
   return chain;
  }
 };
 const context={db,window:{},document:{
  readyState:'complete',getElementById:el,
  addEventListener(){},
 },Option:function(label,value){this.label=label;this.value=value;},
  Intl,Date,Promise,Map,Set,Math,Number,String,Array};
 vm.runInNewContext(wallet,context);
 return {fields,el,dataset,queries,refresh:()=>context.window.frOperationalPayablesUI.refresh()};
}

test('Lixeira usa details nativo, inicia recolhida e mantém todos os controles',()=>{
 const match=html.match(/<details class="fin-trash-collapse" id="trash-collapse"([^>]*)>/);
 assert.ok(match,'Lixeira não está em details');
 assert.doesNotMatch(match[1],/\bopen\b/,'Lixeira precisa iniciar recolhida');
 assert.ok(html.indexOf('id="trash-collapse"')<html.indexOf('id="trash-panel"'));
 for(const id of ['trash-panel','trash-title','trash-refresh','trash-search','trash-rows','trash-dialog','trash-more'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(trash,/if\(group\)group\.open=true/);
 assert.match(trash,/trash-collapse'\)\?\.addEventListener\('toggle'/);
 assert.match(css,/\.fin-trash-collapse\[open\]/);
});

test('Parcelas deixam de ter tabela duplicada e são identificadas na carteira principal',()=>{
 assert.match(html,/id="cp-rows"/);
 assert.match(html,/id="cp-source-filter"/);
 assert.match(html,/value="parcela">Compra parcelada/);
 assert.doesNotMatch(html,/id="due"/);
 assert.doesNotMatch(html,/id="dues-count"/);
 assert.match(html,/id="modal-pay"/);
 assert.match(html,/id="pay-installment"/);
 assert.match(navigation,/data-pay-id/);
 assert.match(wallet,/data-pay-id/);
 assert.match(wallet,/data-edit-record="compra"/);
});

test('Carteira une Excel, avulso e três boletos parcelados, somados uma única vez',async()=>{
 const h=harness();await h.refresh();
 assert.equal(h.el('cp-count').textContent,'5');
 assert.match(h.el('cp-total').textContent,/1\.777,72/);
 const body=h.el('cp-rows').innerHTML;
 for(const id of ['p1','p2','p3'])assert.ok(body.includes('data-pay-id="'+id+'"'),id);
 assert.ok(body.includes('data-cp-reconcile="original-1"'));
 assert.ok(body.includes('data-cp-manual-pay="manual-1"'));
 assert.equal((body.match(/Compra parcelada · boleto nº/g)||[]).length,3);
 assert.equal((body.match(/<tr>/g)||[]).length,5);
 const parcelQuery=h.queries.find(q=>q.table==='fin_parcelas');
 assert.ok(parcelQuery);
 assert.ok(parcelQuery.columns.includes('fin_compras!inner'));
 assert.ok(parcelQuery.conditions.some(x=>x[1]==='fin_compras.forma_pagamento'&&x[2]==='boleto'));
 assert.ok(parcelQuery.conditions.some(x=>x[0]==='in'&&x[1]==='status'&&x[2].includes('aberto')&&x[2].includes('pago')));
});

test('Filtro por origem mostra apenas os boletos parcelados e preserva total geral',async()=>{
 const h=harness();await h.refresh();
 h.el('cp-source-filter').value='parcela';
 h.el('cp-source-filter').listeners.change();
 const body=h.el('cp-rows').innerHTML;
 assert.equal((body.match(/<tr>/g)||[]).length,3);
 assert.ok(body.includes('data-pay-id="p1"'));
 assert.ok(!body.includes('original-1'));
 assert.ok(!body.includes('manual-1'));
 assert.match(h.el('cp-shown').textContent,/3 de 5/);
});

test('Baixa efetivada preserva parcela paga no histórico e retira seu valor das pendências',async()=>{
 const h=harness();await h.refresh();
 Object.assign(h.dataset.fin_parcelas.find(r=>r.id==='p1'),{status:'pago',desconto_registrado:0,juros_registrados:7.42,
  fin_vinculos_pagamento:[{valor_aplicado:400,fin_movimentos:{estado:'confirmado',tipo:'saida',data_movimento:'2026-12-17'}}]});
 await h.refresh();
 assert.equal(h.el('cp-count').textContent,'4');
 assert.equal(h.el('cp-reconciled').textContent,'1');
 assert.match(h.el('cp-total').textContent,/1\.385,14/);
 assert.ok(!h.el('cp-rows').innerHTML.includes('data-pay-id="p1"'));
 h.el('cp-status-filter').value='conciliado';h.el('cp-status-filter').listeners.change();
 assert.equal((h.el('cp-rows').innerHTML.match(/<tr>/g)||[]).length,1);
 assert.match(h.el('cp-rows').innerHTML,/Pago \/ baixado/);
 assert.match(h.el('cp-rows').innerHTML,/400,00/);
 assert.match(h.el('cp-rows').innerHTML,/7,42/);
});

test('Salvar compra ou baixa atualiza carteira, sem alterar os procedimentos financeiros',()=>{
 assert.match(html,/await render\(\);await window\.frOperationalPayablesUI\?\.refresh\?\.\(\);window\.frFinanceUI\?\.afterSaved\('purchase'\)/);
 assert.match(html,/await render\(\);await window\.frOperationalPayablesUI\?\.refresh\?\.\(\);window\.frFinanceUI\?\.afterSaved\('pay'\)/);
 assert.match(html,/fin_site_baixar_boleto/);
 assert.match(html,/fin_criar_compra_parcelada/);
 assert.doesNotMatch(wallet,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('Nenhum id duplicado nem novo registro financeiro criado pela mudança',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 assert.ok(html.indexOf('id="cp-rows"')<html.indexOf('id="trash-collapse"'));
 assert.match(html,/data-view-panel="payables"/);
});
