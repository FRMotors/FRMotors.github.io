'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('financeiro.html');
const js=read('financeiro-baixas-operacionais.js');
const wallet=read('financeiro-contas-operacionais.js');
const sql=read('sql/migrations/20261123_baixa_boletos_importados_valor_real_ajustado.sql');

function harness({docValue=500,paidValue=450,due='2026-11-15',paidDate='2026-11-20',tipo='homologado'}={}){
 const fields=new Map(),messages=new Map();
 const el=id=>{
  if(!fields.has(id))fields.set(id,{value:'',checked:false,hidden:false,disabled:false});
  return fields.get(id);
 };
 for(const [name,value] of Object.entries({
   'op-pay-movement':'fluxo:bank1','op-pay-discount':'0.00','op-pay-fees':'0.00',
   'op-pay-adjust':'0.00','op-pay-reason':'','op-pay-search':''}))el(name).value=value;
 el('op-pay-ack').checked=true;
 const context={
  $:el,write:(id,value)=>messages.set(id,value),
  brl:value=>'R$ '+Number(value).toFixed(2),
  cents:value=>Math.round(Number(value)*100),
  validAmount:value=>{
   const x=Number(value),c=Math.round(x*100);
   return Number.isFinite(x)&&x>=0&&Number.isSafeInteger(c)&&Math.abs(x*100-c)<0.00001?c:null;
  },
  supplierDiscount:()=>null,
  movements:[{id:'fluxo:bank1',ref:'bank1',source:'fluxo',valor:paidValue,data_movimento:paidDate,descricao:'Fornecedor'}],
  activeDoc:{tipo,valor:docValue,vencimento:due,fornecedor:'Fornecedor',id:'boleto1'},
  chosen:()=>context.activeDoc,paidLinks:()=>({movement:new Set()}),
  otherUsed:new Set(),testUsed:new Set(),busy:false
 };
 vm.createContext(context);
 const i=js.indexOf('function dayGap('),j=js.indexOf('function updateDeleteButton()',i);
 const k=js.indexOf('function signedAmount('),l=js.indexOf('function updateManualList()',k);
 assert.ok(i>=0&&j>i&&k>=0&&l>k);
 vm.runInContext(js.slice(i,j)+'\n'+js.slice(k,l),context);
 return {context,el,messages,recalc:()=>vm.runInContext('recalc()',context),
  available:()=>vm.runInContext('availableBank(activeDoc)',context)};
}
test('Valor original e valor real podem diferir com ajuste assinado e justificativa',()=>{
 const h=harness();
 h.el('op-pay-adjust').value='-50.00';
 h.el('op-pay-reason').value='Valor original corrigido pelo fornecedor, comprovante conferido.';
 assert.equal(h.recalc(),true);
 assert.equal(h.el('op-pay-confirm').disabled,false);
 assert.match(h.messages.get('op-pay-info'),/R\$ -50\.00/);
 assert.match(h.messages.get('op-pay-info'),/R\$ 450\.00/);
});
test('Ajuste positivo para pagamento real maior que a planilha',()=>{
 const h=harness({docValue:305.70,paidValue:307.42,paidDate:'2026-11-15'});
 h.el('op-pay-adjust').value='1.72';
 h.el('op-pay-reason').value='Fornecedor alterou o valor do boleto antes da liquidação.';
 assert.equal(h.recalc(),true);
});
test('Valor diferente sem justificativa não permite registrar baixa',()=>{
 const h=harness();
 h.el('op-pay-adjust').value='-50.00';
 assert.equal(h.recalc(),false);
 assert.equal(h.el('op-pay-confirm').disabled,true);
 assert.match(h.messages.get('op-pay-info'),/Justificativa obrigatória/);
});
test('Pagamento bancário fora de três dias exige motivo, mas é localizável',()=>{
 const h=harness({docValue:500,paidValue:500});
 assert.equal(h.available().length,1);
 assert.equal(h.recalc(),false);
 h.el('op-pay-reason').value='Pagamento realizado após vencimento, comprovante confirmado.';
 assert.equal(h.recalc(),true);
});
test('Boleto avulso conserva a janela rígida e não aceita ajuste da planilha',()=>{
 const h=harness({tipo:'avulso',paidValue:450});
 assert.equal(h.available().length,0);
 h.el('op-pay-adjust').value='-50.00';
 assert.equal(h.recalc(),false);
});
test('Desconto real com data próxima permanece no fluxo original sem ajuste',()=>{
 const h=harness({paidDate:'2026-11-16'});
 h.el('op-pay-discount').value='50.00';
 assert.equal(h.recalc(),true);
});
test('Desconto e juros podem ser combinados com ajuste sem arredondar incorretamente',()=>{
 const h=harness({docValue:305.70,paidValue:307.42,paidDate:'2026-11-15'});
 h.el('op-pay-discount').value='5.00';
 h.el('op-pay-fees').value='3.00';
 h.el('op-pay-adjust').value='3.72';
 h.el('op-pay-reason').value='Nota corrigida por diferença identificada no fornecedor.';
 assert.equal(h.recalc(),true);
});
test('Interface possui busca, valor real, ajuste, justificativa e ação guiada',()=>{
 for(const id of ['op-pay-search','op-pay-movement-count','op-pay-real',
  'op-pay-adjust','op-pay-reason','op-pay-use-adjust','op-pay-confirm'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Ajuste do valor original da planilha/);
 assert.match(html,/Nenhum novo pagamento é criado|A baixa nunca inventa pagamentos/);
 assert.match(js,/fin_baixa_operacional_ajustada/);
 assert.match(js,/fin_teste_conciliar_aberto_excel_ajustado/);
 assert.match(js,/if\(!response\.data\|\|!response\.data\.vinculo_id\)/);
});
test('Schema preserva referência original e guarda apenas ajuste justificado',()=>{
 assert.match(sql,/add column if not exists ajuste_valor/);
 assert.match(sql,/add column if not exists justificativa_ajuste/);
 assert.match(sql,/valor_base-desconto\+juros\+ajuste_valor=valor_pago/);
 assert.match(sql,/valor_previsto-desconto\+juros\+ajuste_valor=valor_pago/);
 assert.match(sql,/valor_referencia-desconto_efetivo\+juros_efetivos\+ajuste_efetivo=valor_pago/);
 assert.match(sql,/vinculado_por|operador/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/fluxo_caixa_autorizado/);
 assert.match(sql,/revoke execute on function public\.fin_baixa_operacional_ajustada/);
 assert.doesNotMatch(sql,/\btruncate\b/i);
});
test('Carteira operacional mostra ajuste e justificativa junto ao valor pago real',()=>{
 assert.match(wallet,/ajuste_efetivo,justificativa_ajuste/);
 assert.match(wallet,/ajuste_valor,justificativa_ajuste/);
 assert.match(wallet,/Ajuste da planilha/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
});
