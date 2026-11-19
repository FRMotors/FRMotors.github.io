'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../financeiro-itau-core.js');
const cutoff='2026-11-12';
const sample=(file,id,date,nature,valor,descricao)=>({
 id,importacao_id:file,data_lancamento:date,natureza:nature,valor,descricao
});
function realCase(){
 const files=[
  {id:'16',conta_nome:'itau',criado_em:'2026-11-16T10:00',arquivo_nome:'16.pdf'},
  {id:'17',conta_nome:'ITAÚ',criado_em:'2026-11-17T10:00',arquivo_nome:'17.pdf'},
  {id:'18',conta_nome:'ITAU',criado_em:'2026-11-18T10:00',arquivo_nome:'18.pdf'},
  {id:'19',conta_nome:'itaú',criado_em:'2026-11-19T10:00',arquivo_nome:'19.pdf'}
 ];
 const day12=[
  ['saida',5.60,'PAGAMENTOS MARLI ROMAN 113.624.818-82'],
  ['entrada',500,'PIX RECEBIDO FRED'],
  ['saida',785.40,'BOLETO PAGO 57.165.720/0001-24'],
  ['saida',1160.79,'BOLETO PAGO AUTOPECAS LTDA 57.165.720/0001-24']
 ];
 let n=0;
 const from=(file,date,nature,valor,desc)=>sample(file,String(++n),date,nature,valor,desc);
 const lines=[
  ...day12.map(([type,val,desc])=>from('16','2026-11-12',type,val,desc)),
  from('16','2026-11-13','saida',9.90,'PAGAMENTOS ARMAZEM STORE 38.299.917/0001-01'),
  ...day12.map(([type,val,desc])=>from('17','2026-11-12',type,val,type==='saida'&&val===1160.79?'BOLETO PAGO 57.165.720/0001-24':desc)),
  from('17','2026-11-13','saida',9.90,'PAGAMENTOS ARMAZEM STORE 38.299.917/0001-01'),
  from('17','2026-11-16','entrada',200,'PIX RECEBIDO 200'),
  from('17','2026-11-16','entrada',250,'PIX RECEBIDO 250'),
  from('17','2026-11-16','entrada',800,'PIX RECEBIDO 800'),
  from('17','2026-11-16','saida',1306.45,'BOLETO PAGO 57.165.720/0001-24'),
  from('17','2026-11-17','saida',5,'PAGAMENTO LOJA'),
  from('18','2026-11-18','saida',5.40,'PAGAMENTO LOJA'),
  from('19','2026-11-18','saida',953.94,'PIX ENVIADO 57.165.720/0009-81'),
  from('19','2026-11-18','entrada',960,'PIX RECEBIDO 960'),
  from('19','2026-11-19','saida',5.20,'PAGAMENTO LOJA')
 ];
 const official=[{data_movimento:cutoff,tipo:'saida',valor:5.60,descricao:'PÃO'}];
 return {files,lines,official};
}
const months=[{mes:'2026-10-01',entradas_operacionais:121835.30,saidas:99064.75,
 entradas_qtd:100,saidas_qtd:90,saldo_abertura:0,saldo_teorico_acumulado:21123.35},
 {mes:'2026-11-01',entradas_operacionais:32177.54,saidas:53874.11,
 entradas_qtd:277,saidas_qtd:637,saldo_abertura:0,saldo_teorico_acumulado:-573.22}];

test('Corte inclui transações do próprio dia, sem duplicar correspondentes oficiais',()=>{
 const {files,lines,official}=realCase();
 const unique=core.canonicalBank(files,lines);
 const r=core.reconcile(-573.22,unique.canonical,official,cutoff);
 assert.equal(r.pending.filter(x=>x.data_lancamento===cutoff).length,3);
 assert.equal(r.already.length,1);
 assert.equal(r.weakMatches.length,1); // PÃO vs MARLI: valor/data coincidem, descrição diverge.
 assert.equal(r.balanceCents,-209530);
 assert.equal(r.addedIn,271000);
 assert.equal(r.addedOut,423208);
});
test('PDFs sobrepostos são ignorados na contagem, mesmo se a descrição abreviar o CNPJ',()=>{
 const {files,lines}=realCase();
 const {canonical,repeated}=core.canonicalBank(files,lines);
 assert.equal(canonical.length,14);
 assert.equal(repeated.length,5);
 assert.equal(canonical.filter(x=>x.data_lancamento==='2026-11-12').length,4);
});
test('Saldo de referência do dia 17 confere com diferença zero',()=>{
 const {files,lines,official}=realCase();
 const u=core.canonicalBank(files,lines);
 const rec=core.reconcile(-573.22,u.canonical,official,cutoff);
 const check=core.compareBankReference(rec,{data_referencia:'2026-11-17',saldo:-2090.76},cutoff,'2026-11-19');
 assert.deepEqual({status:check.status,diff:check.differenceCents},{status:'conferido',diff:0});
 assert.equal(core.projectionOnDate(rec.baseCents,rec.pending,'2026-11-19'),-209530);
});
test('Referência divergente nunca recebe selo de conferida',()=>{
 const {files,lines,official}=realCase();
 const rec=core.reconcile(-573.22,core.canonicalBank(files,lines).canonical,official,cutoff);
 const check=core.compareBankReference(rec,{data_referencia:'2026-11-17',saldo:-2100},cutoff,'2026-11-19');
 assert.equal(check.status,'divergente');
 assert.equal(check.differenceCents,924);
});
test('Referência ausente ou fora do período não valida o saldo',()=>{
 const rec={baseCents:0,pending:[]};
 assert.equal(core.compareBankReference(rec,null,cutoff,'2026-11-19').status,'sem_referencia');
 assert.equal(core.compareBankReference(rec,{data_referencia:'2026-11-20',saldo:0},cutoff,'2026-11-19').status,'fora_do_periodo');
});
test('Fechamento de Excel diferente da carteira oficial bloqueia cálculo',()=>{
 assert.equal(core.ensureSnapshotMatches('2026-11-12','2026-11-12'),true);
 assert.throws(()=>core.ensureSnapshotMatches('2026-11-13','2026-11-12'),/Datas de fechamento divergentes/);
 assert.throws(()=>core.ensureSnapshotMatches(null,'2026-11-12'),/Data de fechamento ausente/);
});
test('Resumo mensal usa centavos e preserva meses antigos',()=>{
 const {files,lines,official}=realCase();
 const rec=core.reconcile(-573.22,core.canonicalBank(files,lines).canonical,official,cutoff);
 const r=core.buildMonthly(months,rec.pending,cutoff);
 assert.equal(r[0].saldo_teorico_acumulado,21123.35);
 assert.equal(r[1].entradas_operacionais,34887.54);
 assert.equal(r[1].saidas,58106.19);
 assert.equal(r[1].saldo_teorico_acumulado,-2095.30);
 assert.equal(r[1].extrato_entradas,2710);
 assert.equal(r[1].extrato_saidas,4232.08);
});
test('Novo mês acumula saldos corretamente sem zerar histórico',()=>{
 const r=core.buildMonthly(months,[{data_lancamento:'2026-12-02',natureza:'entrada',valor:400,descricao:'Cliente'}],cutoff);
 assert.equal(r.length,3);
 assert.equal(r[2].mes,'2026-12-01');
 assert.equal(r[2].saldo_teorico_acumulado,-173.22);
});
test('Múltiplas compras idênticas no MESMO extrato continuam distintas',()=>{
 const files=[{id:'f1',conta_nome:'itau',criado_em:'2026-11-18',arquivo_nome:'a.pdf'},
 {id:'f2',conta_nome:'itau',criado_em:'2026-11-19',arquivo_nome:'b.pdf'}];
 const rows=[sample('f1','a','2026-11-18','saida',25,'Compra repetível'),
 sample('f1','b','2026-11-18','saida',25,'Compra repetível'),
 sample('f2','c','2026-11-18','saida',25,'Compra repetível')];
 const {canonical,repeated}=core.canonicalBank(files,rows);
 assert.equal(canonical.length,2);
 assert.equal(repeated.length,1);
});
test('PDF duplicado inteiro não altera saldo',()=>{
 const {files,lines,official}=realCase();
 const first=core.canonicalBank(files,lines);
 const extraFile={...files[3],id:'new-copy',criado_em:'2026-11-20',arquivo_nome:'copy.pdf'};
 const extraRows=lines.filter(x=>x.importacao_id==='19')
  .map((x,i)=>({...x,id:'copy'+i,importacao_id:'new-copy'}));
 const second=core.canonicalBank([...files,extraFile],[...lines,...extraRows]);
 assert.equal(second.canonical.length,first.canonical.length);
 assert.equal(core.reconcile(-573.22,second.canonical,official,cutoff).balanceCents,-209530);
});
test('Linhas inválidas e valores negativos bloqueiam o cálculo',()=>{
 const f=[{id:'f',conta_nome:'itau',criado_em:'2026-11-19',arquivo_nome:'erro.pdf'}];
 assert.throws(()=>core.canonicalBank(f,[sample('f','1','2026-11-32','saida',12,'Inválido')]),/Linha inválida/);
 assert.throws(()=>core.canonicalBank(f,[sample('f','2','2026-11-19','saida',-12,'Inválido')]),/valor zerado ou negativo/);
});

test('Reconhece conta Itaú com apelidos, sem confundir cartão Itaucard',()=>{
 assert.equal(core.accountIsItau('Itaú Conta Corrente 5834'),true);
 assert.equal(core.accountIsItau('BANCO ITAU - 996323'),true);
 assert.equal(core.accountIsItau('Itaucard'),false);
 assert.equal(core.accountIsItau('Bradesco Prime'),false);
});

test('Correspondência aprovada no consolidado não gera alerta de revisão no Itaú',()=>{
 const match={bank:{id:'linha-banco',data_lancamento:'2026-11-12'},
  official:{id:'movimento-oficial',descricao:'PÃO'}};
 const ok=[{linha_id:'linha-banco',movimento_homologado_id:'movimento-oficial',situacao:'conferido'}];
 const result=core.reviewWeakMatches([match],ok);
 assert.equal(result.waiting.length,0);
 assert.equal(result.approved.length,1);
});
test('Reabrir a aprovação restaura o alerta de revisão sem mudar movimentações',()=>{
 const match={bank:{id:'linha-banco'},official:{id:'movimento-oficial'}};
 const approved=core.reviewWeakMatches([match],[{
  linha_id:'linha-banco',movimento_homologado_id:'movimento-oficial',situacao:'reaberto'
 }]);
 assert.equal(approved.waiting.length,1);
 assert.equal(approved.approved.length,0);
});
test('Aprovação de outro par não esconde correspondência pendente',()=>{
 const match={bank:{id:'linha-banco'},official:{id:'movimento-oficial'}};
 const mismatched=core.reviewWeakMatches([match],[{
  linha_id:'linha-banco',movimento_homologado_id:'outro-movimento',situacao:'conferido'
 }]);
 assert.equal(mismatched.waiting.length,1);
 assert.throws(()=>core.reviewWeakMatches([{bank:{},official:{id:'a'}}],[]),/IDs/);
});
