'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../financeiro-documentos-finalidade-core.js');
const html=fs.readFileSync(path.resolve(__dirname,'../financeiro.html'),'utf8');
const ui=fs.readFileSync(path.resolve(__dirname,'../financeiro-documentos.js'),'utf8');
const sql=fs.readFileSync(path.resolve(__dirname,'../sql/migrations/20261123_cartoes_finalidade_compra_auditada.sql'),'utf8');
const sqlOptional=fs.readFileSync(path.resolve(__dirname,'../sql/migrations/20261123_cartoes_finalidade_categoria_opcional.sql'),'utf8');
const card=(id,m,val,cartao='BRADESCO PRIME',extra={})=>({
 id,grupo:'cartoes',incluir:true,cartao_nome:cartao,
 mes_fatura:m+'-01',data_evento:m+'-04',valor_registrado:val,...extra
});
const auto=(id,m,val)=>({
 id,grupo:'autopecas',incluir:true,vencimento:m+'-10',valor_registrado:val
});
test('despesas por finalidade não confundem oficina, pessoal, indefinido nem PIX',()=>{
 const rows=[
  auto('auto-j','2026-01',300),
  card('oficina','2026-01',120),
  card('pessoal','2026-01',55.30),
  card('sem','2026-01',80.50),
  card('pix','2026-01',40,'PIX'),
  card('debito','2026-01',20,'DÉBITO'),
  card('ignored','2026-01',999,'BRADESCO PRIME',{incluir:false}),
  auto('auto-f','2026-02',150),
  card('outra','2026-02',200)
 ];
 const mapa=new Map([['oficina','oficina'],['pessoal','outras'],['outra','outras']]);
 const result=core.summarizeMonths(rows,mapa);
 const jan=result.get('2026-01');
 assert.equal(jan.auto,30000);
 assert.equal(jan.oficina,12000);
 assert.equal(jan.outras,5530);
 assert.equal(jan.pendentes,8050);
 assert.equal(jan.meios,6000);
 assert.equal(jan.card,31600);
 assert.equal(jan.cardCount,5);
 assert.equal(jan.card,jan.oficina+jan.outras+jan.pendentes+jan.meios);
 assert.equal(result.get('2026-02').auto,15000);
 assert.equal(result.get('2026-02').outras,20000);
 assert.equal(result.get('2026-02').oficina,0);
});
test('categoria ou fornecedor nunca inferem finalidade; ajuste negativo permanece líquido',()=>{
 const docs=[
  card('peca','2026-11',99,'BRADESCO PRIME',{categoria:'AUTOPEÇAS',descricao:'Peças'}),
  card('combustivel','2026-11',60,'SICOOB',{categoria:'COMBUSTÍVEL'}),
  card('estorno','2026-11',-9,'SICOOB',{categoria:'ESTORNO'}),
  card('antigo','2025-01',20,'BRADESCO PRIME',{categoria:'USO PESSOAL'})
 ];
 const d=core.summarizeMonths(docs,new Map([['combustivel','outras'],['estorno','outras']]));
 assert.equal(d.get('2026-11').oficina,0);
 assert.equal(d.get('2026-11').pendentes,9900);
 assert.equal(d.get('2026-11').outras,5100);
 assert.equal(d.get('2025-01').pendentes,2000);
 assert.equal(d.get('2026-11').card,15000);
});
test('a interface elimina tabela duplicada e expõe comparativo transparente',()=>{
 assert.doesNotMatch(html,/id="doc-supplier-rows"/);
 assert.doesNotMatch(html,/Gastos por fornecedor de autopeças/);
 assert.match(html,/Valores por cartão \/ meio/);
 assert.match(html,/Comparativo mensal por finalidade/);
 assert.match(html,/Cartões · uso na oficina/);
 assert.match(html,/Cartões · outras finalidades/);
 assert.match(html,/Cartões · a classificar/);
 assert.match(html,/Outros meios · PIX \/ débito/);
 assert.match(html,/Não some as colunas/);
 assert.match(html,/id="doc-month-classification-note"/);
 assert.match(html,/financeiro-documentos-finalidade-core\.js\?v=/);
 assert.ok(html.indexOf('financeiro-documentos-finalidade-core.js')<html.indexOf('financeiro-documentos.js'));
 assert.match(ui,/purposeCore\.summarizeMonths\(included,cardPurposes\)/);
 assert.match(ui,/\.eq\('origem','planilha'\)/);
});
test('finalidade é editável explicitamente e independente de categoria',()=>{
 assert.match(html,/id="cbcat-edit-finalidade"/);
 assert.match(html,/id="cbcat-purpose-filter"/);
 assert.match(html,/id="cbcat-purpose-pending"/);
 assert.match(sql,/fin_cartoes_finalidades_eventos/);
 assert.match(sql,/public\.fluxo_caixa_autorizado\(\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/fin_cartao_categoria_definir/);
 assert.match(sqlOptional,/coalesce\(btrim\(p_categoria\),''\)=''/);
 assert.match(sqlOptional,/p_categoria_esperada/);
 assert.doesNotMatch(sqlOptional,/insert\s+into\s+public\.fin_movimentos/i);
});
