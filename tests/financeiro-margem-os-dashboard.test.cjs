'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../financeiro-margem-os-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const rows=[
 {ano:2026,os:10008,mes:'OUTUBRO',cliente:'Empresa A',empresa:'TOPLINE',bruto:571,gasto:122,mao_obra:350,liquido:403.32},
 {ano:2026,os:10009,mes:'OUTUBRO',cliente:'Empresa B',empresa:'ISOCAR',bruto:242,gasto:92.91,mao_obra:100,liquido:149.09},
 {ano:2026,os:10010,mes:'SETEMBRO',cliente:'Empresa A',empresa:'TOPLINE',bruto:100,gasto:20,mao_obra:60,liquido:80},
 {ano:2025,os:8750,mes:'DEZEMBRO',cliente:'Empresa A',empresa:'TOPLINE',bruto:500,gasto:200,mao_obra:150,liquido:300},
 {ano:2026,os:10011,mes:'OUTUBRO',cliente:'',empresa:'TOPLINE',bruto:9999,gasto:2,liquido:9997}
];

test('Margem acompanha líquido real da O.S. sem subtrair gastos novamente',()=>{
 const result=core.summarize(rows,{year:2026,month:'OUTUBRO',company:'TOPLINE'});
 assert.equal(result.count,1);
 assert.equal(result.bruto,571);
 assert.equal(result.gasto,122);
 assert.equal(result.liquido,403.32);
 assert.ok(Math.abs(result.margin-(403.32/571*100))<0.0001);
 assert.equal(core.formatPercent(result.margin),'70,6%');
});
test('Filtros de ano, mês e empresa isolam cada carteira do Dashboard',()=>{
 const current=core.summarize(rows,{year:2026});
 assert.equal(current.count,3);
 assert.equal(current.bruto,913);
 assert.equal(current.gasto,234.91);
 assert.equal(current.liquido,632.41);
 const prior=core.summarize(rows,{year:2025});
 assert.equal(prior.count,1);assert.equal(prior.margin,60);
 const oct=core.summarize(rows,{year:2026,month:'outubro'});
 assert.equal(oct.count,2);
 const isocar=core.summarize(rows,{year:2026,company:'ISOCAR'});
 assert.equal(isocar.count,1);assert.equal(isocar.liquido,149.09);
});
test('Mão de obra não é subtraída como custo adicional do líquido informado',()=>{
 const result=core.summarize(rows,{year:2026,company:'TOPLINE',month:'OUTUBRO'});
 assert.equal(result.maoObra,350);
 assert.equal(result.liquido,403.32);
});
test('Ausência de venda retorna margem indisponível, sem inventar zero',()=>{
 const empty=core.summarize(rows,{year:2026,month:'NOVEMBRO'});
 assert.equal(empty.count,0);
 assert.equal(empty.margin,null);
 assert.equal(empty.available,false);
 assert.equal(core.formatPercent(empty.margin),'—');
 const onlyZero=core.summarize([{ano:2026,mes:'JANEIRO',cliente:'X',empresa:'ISOCAR',bruto:0,gasto:10,liquido:-10}],{year:2026});
 assert.equal(onlyZero.margin,null);
});
test('Anos, empresas e meses podem ser identificados dinamicamente',()=>{
 assert.deepEqual(core.years(rows),[2026,2025]);
 assert.deepEqual(core.companies(rows,2026),['ISOCAR','TOPLINE']);
 assert.equal(core.months[9],'OUTUBRO');
});
test('Rejeita dados monetários inválidos para evitar margem incorreta',()=>{
 assert.throws(()=>core.summarize([{ano:2026,mes:'JANEIRO',cliente:'X',bruto:'incorreto',liquido:4}],{year:2026}),/inválidos/);
});
test('Dashboard passa a exibir a margem no próprio resumo anual por empresa',()=>{
 const html=read('dashboard.html'),js=read('dashboard-data-v4481.js');
 assert.match(html,/id="kpiMargem"/);
 assert.match(html,/id="dashboard-os-profit-note"/);
 assert.match(html,/financeiro-margem-os-core\.js\?v=/);
 assert.match(js,/const orderProfit=window\.frOrdersProfitCore\?\.summarize\(rows\)/);
 assert.match(js,/orderProfit\.margin/);
 assert.match(html,/id="empresaFilter"/);
 assert.match(html,/id="yearFilter"/);
});
test('Financeiro exibe margem das O.S. separada de caixa com período e empresa próprios',()=>{
 const html=read('financeiro.html'),module=read('financeiro-margem-os.js');
 const nav=read('financeiro-pro-ui.js');
 for(const id of ['real-cash-margin','real-os-gross','real-os-costs','real-os-net','real-os-margin',
  'real-os-year','real-os-month','real-os-company','rg-os-gross','rg-os-costs','rg-os-net','rg-os-margin']){
   assert.ok(html.includes('id="'+id+'"'),'Campo ausente: '+id);
 }
 assert.match(html,/Margem estimada do caixa/);
 assert.match(html,/Margem das ordens de serviço/);
 assert.match(module,/\.from\('indicadores_oficina'\)/);
 assert.match(module,/\.rpc\('fluxo_caixa_autorizado'\)/);
 assert.match(module,/\.range\(offset,offset\+step-1\)/);
 assert.match(nav,/if\(next==='overview'\)window\.frOrdersProfitUI\?\.refresh\?\.\(\)/);
 assert.match(nav,/if\(next==='reports'\)[^\n]*frOrdersProfitUI/);
});
test('Indicadores por O.S. são somente leitura e não duplicam saídas bancárias',()=>{
 const src=read('financeiro-margem-os.js');
 const coreSource=read('financeiro-margem-os-core.js');
 assert.doesNotMatch(src,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\('fin_movimento/);
 assert.doesNotMatch(coreSource,/\.from\(|\.rpc\(/);
 assert.match(read('financeiro-relatorios-gerenciais.js'),/frOrdersProfitUI\?\.renderReports/);
 assert.match(read('financeiro.html'),/Os totais da planilha não são somados ao Fluxo de Caixa/);
});
test('HTML segue com ids únicos e scripts na ordem de dependência',()=>{
 const html=read('financeiro.html');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 assert.ok(html.indexOf('financeiro-margem-os-core.js')<html.indexOf('financeiro-margem-os.js'));
 assert.ok(html.indexOf('financeiro-margem-os-core.js')<html.indexOf('financeiro-resumo-operacional.js'));
});
