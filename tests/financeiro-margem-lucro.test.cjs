'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../financeiro-margem-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('financeiro.html');
const dashboard=read('financeiro-resumo-operacional.js');
const reports=read('financeiro-relatorios-gerenciais.js');
const css=read('financeiro-relatorios-gerenciais.css');
test('Margem sobre entradas tem fórmula consistente em centavos',()=>{
 const v=core.calculate(100000,70000);
 assert.equal(v.netCents,30000);
 assert.equal(v.percent,30);
 assert.equal(v.available,true);
 assert.equal(core.format(v.percent),'30,0%');
});
test('Margem negativa indica saída superior à entrada, sem truncar prejuízo',()=>{
 const v=core.calculate(100000,120000);
 assert.equal(v.netCents,-20000);
 assert.equal(v.percent,-20);
 assert.equal(core.format(v.percent),'-20,0%');
});
test('Não inventa margem quando entradas confirmadas são zero',()=>{
 const a=core.calculate(0,5000),b=core.calculate(0,0);
 assert.equal(a.percent,null);
 assert.equal(a.netCents,-5000);
 assert.equal(b.percent,null);
 assert.equal(core.format(a.percent),'—');
 assert.equal(a.reason,'no_receipts');
});
test('Entradas sem saídas têm margem percentual de 100',()=>{
 assert.equal(core.calculate(5000,0).percent,100);
});
test('Entradas incorretas são rejeitadas e não exibidas como lucro',()=>{
 for(const [income,expense] of [[-100,10],[100,-1],[NaN,30],[Infinity,10],[12.2,20],[0.1,2]])
  assert.equal(core.calculate(income,expense).available,false);
});
test('Visão Geral exibe KPI de margem com detalhamento e filtro mensal',()=>{
 assert.match(html,/id="real-cash-margin"/);
 assert.match(html,/id="real-cash-margin-status"/);
 assert.match(html,/id="real-cash-month"/);
 assert.match(html,/\* Entenda a margem estimada/);
 assert.match(html,/não o lucro contábil/);
 assert.match(dashboard,/const marginCore=window\.frProfitMarginCore/);
 assert.match(dashboard,/marginCore\?\.calculate\(ins,outs\)/);
 assert.match(dashboard,/addEventListener\('change',drawCash\)/);
 assert.match(dashboard,/marginCore\.format\(margin\.percent\)/);
});
test('Relatórios usam mesmo cálculo e respeitam filtros de ano e mês',()=>{
 assert.match(html,/id="rg-margin"/);
 assert.match(html,/id="rg-margin-info"/);
 assert.match(reports,/const cash=scoped\(moves,'data_movimento'\)/);
 assert.match(reports,/const margin=marginCore\?\.calculate\(t\.incoming,t\.outgoing\)/);
 assert.match(reports,/marginCore\.format\(margin\.percent\)/);
 assert.match(css,/\.rg-margin-readout/);
});
test('Ordem de carregamento preserva algoritmo antes de dashboards',()=>{
 const corePos=html.indexOf('financeiro-margem-core.js');
 const dashboardPos=html.indexOf('financeiro-resumo-operacional.js');
 const reportsPos=html.indexOf('financeiro-relatorios-gerenciais.js');
 assert.ok(corePos>=0&&corePos<dashboardPos&&corePos<reportsPos);
 assert.equal((html.match(/id="real-cash-margin"/g)||[]).length,1);
 assert.equal((html.match(/id="rg-margin"/g)||[]).length,1);
});
test('Indicador é apenas leitura, sem gravar preferências ou criar novos lançamentos',()=>{
 const coreSource=read('financeiro-margem-core.js');
 assert.doesNotMatch(coreSource,/\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
 assert.match(html,/Faturas e compras documentais não são somadas novamente/);
});
