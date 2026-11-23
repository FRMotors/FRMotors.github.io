'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('financeiro.html');
const history=read('financeiro-historico.js');
const ui=read('financeiro-itau-homologacao.js');
const sql=read('sql/migrations/20261123_itau_homologacao_manual_auditada.sql');
const core=require('../financeiro-itau-core.js');
const monthCore=require('../financeiro-itau-mensal-core.js');
const catCore=require('../financeiro-categorias-core.js');
const combinedCore=require('../financeiro-categorias-consolidado.js');

const bank=(id,date,type,value,desc)=>({
 id,importacao_id:'pdf-a',data_lancamento:date,natureza:type,valor:value,descricao:desc
});
const legacy={id:'legacy-1',data_movimento:'2026-11-12',tipo:'saida',valor:100,descricao:'PAGAMENTO ANTIGO'};
const bankA=bank('pdf-line-1','2026-11-13','entrada',500,'PIX NOVO A');
const bankB=bank('pdf-line-2','2026-11-14','saida',350,'BOLETO NOVO B');
const files=[{id:'pdf-a',conta_nome:'ITAU',arquivo_nome:'Extrato.pdf',criado_em:'2026-11-23'}];

test('reconcile: homologar uma linha não altera o saldo previsto nem duplica sua contagem',()=>{
 const {canonical}=core.canonicalBank(files,[bankA,bankB]);
 const old=core.reconcile(-573.22,canonical,[legacy],'2026-11-12');
 assert.equal(old.pending.length,2);
 assert.equal(old.balanceCents,-42322);
 const newOfficial={id:'new-1',data_movimento:bankA.data_lancamento,tipo:bankA.natureza,
  valor:bankA.valor,descricao:bankA.descricao};
 const after=core.reconcile(-573.22,canonical,[legacy,newOfficial],'2026-11-12');
 assert.equal(after.pending.length,1);
 assert.equal(after.already.length,1);
 const newApprovedNet=core.cents(bankA.valor);
 assert.equal(after.balanceCents+newApprovedNet,old.balanceCents);
 assert.equal(after.pending[0].id,bankB.id);
});

test('referência bancária continua calculada corretamente após aprovação',()=>{
 const approved=core.cents(bankA.valor);
 const rec=core.reconcile(-573.22,[bankB],[legacy,newOfficial()],'2026-11-12');
 const validation=core.compareBankReference({
  ...rec,baseCents:rec.baseCents+approved, balanceCents:rec.balanceCents+approved
 },{data_referencia:'2026-11-14',saldo:-423.22},'2026-11-12','2026-11-14');
 assert.equal(validation.status,'conferido');
 function newOfficial(){return {id:'new-1',data_movimento:bankA.data_lancamento,tipo:bankA.natureza,valor:bankA.valor,descricao:bankA.descricao}}
});

test('visualização mensal aceita fonte PDF aprovada, mas rejeita fontes não homologadas',()=>{
 const rows=monthCore.officialRows([{id:'new-1',data_movimento:'2026-11-13',tipo:'entrada',
  estado:'confirmado',origem:'extrato_itau_homologado',descricao:'PIX NOVO A',valor:500}]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].origin,'homologado');
 assert.match(rows[0].source,/PDF Itaú homologado/);
 assert.throws(()=>monthCore.officialRows([{id:'bad',data_movimento:'2026-11-13',
  tipo:'entrada',estado:'confirmado',origem:'app',valor:500}]),/inválido/);
});

test('consolidação respeita fechamento original mesmo após homologação posterior',()=>{
 const legacyRows=[{id:'old',date:'2026-11-12',type:'saida',value:10000,
  description:'PAGAMENTO ANTIGO',source:'Caixa homologado'}];
 const approvedRows=[{id:'official-pdf',date:'2026-11-19',type:'entrada',value:50000,
  description:'PIX APROVADO',source:'PDF Itaú homologado'}];
 const pending=[{id:'pending',importId:'b',fileCreated:'2026-11-23',
  date:'2026-11-17',type:'saida',value:30000,description:'PIX NOVO',
  bankDescription:'PIX NOVO',account:'ITAU',manual:false}];
 const merged=combinedCore.combineSources([...legacyRows,...approvedRows],pending,{cutoff:'2026-11-12'});
 assert.equal(merged.addedCount,1);
 assert.equal(merged.rows.length,3);
 assert.ok(merged.rows.some(x=>x.id==='pending'));
});

test('categoria oficial aceita PDF homologado e mantém origem identificada',()=>{
 const official=catCore.sourceRowsOfficial([{id:'new',data_movimento:'2026-11-23',tipo:'entrada',
  valor:40.8,categoria:'RECEBIMENTOS',descricao:'Pix',estado:'confirmado',origem:'extrato_itau_homologado'}]);
 assert.equal(official.length,1);
 assert.match(official[0].source,/PDF Itaú homologado/);
});

test('UI exige seleção, revisão e confirmação explícita',()=>{
 assert.match(html,/id="hist-itau-approve-open" disabled/);
 assert.match(html,/id="hist-itau-approve-ack" type="checkbox" required/);
 assert.match(html,/id="hist-itau-approve-reason" minlength="12"/);
 assert.match(ui,/selected=new Set\(\)/);
 assert.match(ui,/selected\.clear\(\)/);
 assert.match(ui,/fin_itau_homologar_linhas/);
 assert.match(ui,/if\(data\?\.resultado!=='homologado'/);
 assert.doesNotMatch(ui,/db\.from\('fin_movimentos'\)\.insert/);
 assert.match(history,/window\.frItauApprovalUI\?\.render/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
});

test('histórico diferencia resultado, abertura, aprovado e prévia em memória',()=>{
 for(const id of ['itau-balance-overview','itau-balance-reports'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(history,/const approvedNet=approvedBank\.reduce/);
 assert.match(history,/balanceCents:rec\.balanceCents\+approvedNet/);
 assert.match(history,/approvedImported/);
 assert.match(history,/\[\.\.\.state\.approvedImported,\.\.\.state\.importedPending\]/);
});

test('autorização no servidor valida usuário, Itaú, cutoff, identidade e duplicidade',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/fluxo_caixa_autorizado\(\)/);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/);
 assert.match(sql,/v_linha\.data_lancamento<v_cutoff/);
 assert.match(sql,/v_banco\.referencia_cliente is distinct from/);
 assert.match(sql,/origem='fluxo_caixa_homologado'/);
 assert.match(sql,/extrato_itau_homologado/);
 assert.match(sql,/grant execute on function public\.fin_itau_homologar_linhas/);
 assert.match(sql,/revoke execute on function public\.fin_itau_homologar_linhas/);
 assert.match(sql,/enable row level security/);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.fin_movimentos/i);
 assert.doesNotMatch(sql,/update\s+public\.fin_movimentos/i);
});

test('relatórios usam dados confirmados e o consolidado exclui os PDFs já aprovados',()=>{
 for(const file of ['financeiro-relatorios-gerenciais.js','financeiro-resumo-operacional.js',
  'financeiro-detalhamento-caixa.js','financeiro-itau-mensal.js','financeiro-categorias-relatorio.js'])
   assert.match(read(file),/extrato_itau_homologado/,file);
 assert.match(read('financeiro-categorias-relatorio.js'),/b\.filter\(x=>!approvedIds\.has\(x\.id\)\)/);
 assert.match(read('financeiro-categorias-relatorio.js'),/historicalDates\.at\(-1\)/);
});
