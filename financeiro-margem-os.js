/* FR Motors | Margem das ordens de serviço do Dashboard (somente leitura).
 * Não mistura documentos de O.S. com fluxo de caixa bancário.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const core=window.frOrdersProfitCore;
let rows=[],loaded=false,loading=null;
const put=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
const hasOverview=()=>Boolean($('real-os-profit'));
const hasReports=()=>Boolean($('rg-os-profit'));
const visible=panel=>!document.querySelector('[data-view-panel="'+panel+'"]')?.hidden;
function monetary(id,value){put(id,core.formatMoney(value));}
function percent(id,value){
 put(id,core.formatPercent(value));
 $(id)?.classList.toggle('negative',value!==null&&value<0);
}
function fillSelect(id,items,initialLabel,initialValue,previous){
 const el=$(id);if(!el)return '';
 el.replaceChildren(new Option(initialLabel,initialValue),
  ...items.map(x=>new Option(x.label,x.value)));
 const values=new Set([initialValue,...items.map(x=>x.value)]);
 el.value=values.has(previous)?previous:initialValue;
 return el.value;
}
function yearOptions(){
 if(!core||!hasOverview())return;
 const options=core.years(rows),current=$('real-os-year')?.value||'';
 const def=options.includes(Number(current))?String(current):String(options[0]||'');
 fillSelect('real-os-year',options.map(y=>({value:String(y),label:String(y)})),
  options.length?'Selecione um ano':'Sem anos disponíveis',
  '',def);
 if(options.length)$('real-os-year').value=def;
}
function companyOptions(){
 const y=$('real-os-year')?.value||'';
 const companies=core.companies(rows,y);
 fillSelect('real-os-company',companies.map(x=>({value:x,label:x})),
  'Todas as empresas','TODAS',$('real-os-company')?.value||'TODAS');
}
function monthOptions(){
 const y=$('real-os-year')?.value||'';
 const company=$('real-os-company')?.value||'TODAS';
 const source=rows.filter(r=>String(r.ano)===y&&
  (company==='TODAS'||core.norm(r.empresa)===company));
 const available=new Set(source.map(r=>core.norm(r.mes)));
 const months=core.months.filter(m=>available.has(core.norm(m)));
 fillSelect('real-os-month',months.map(m=>({value:m,label:m[0]+m.slice(1).toLowerCase()})),
  'Todos os meses','todos',$('real-os-month')?.value||'todos');
}
function drawOverview(){
 if(!hasOverview()||!core||!loaded)return;
 const year=$('real-os-year')?.value||'todos',
  month=$('real-os-month')?.value||'todos',
  company=$('real-os-company')?.value||'TODAS';
 const result=core.summarize(rows,{year,month,company});
 for(const [id,k] of [['real-os-gross','bruto'],['real-os-costs','gasto'],['real-os-net','liquido']])
  monetary(id,result[k]);
 percent('real-os-margin',result.margin);
 put('real-os-count',result.count+' ordem(ns) de serviço no filtro · '+
  (result.available?'Líquido registrado ÷ bruto registrado.':
   'Sem receita bruta válida para calcular a margem.')+
  ' Origem: BASE do Dashboard, não o extrato bancário.');
}
function reportCompanyOptions(){
 if(!hasReports()||!core||!loaded)return;
 const year=$('rg-year')?.value||'';
 const companySel=$('rg-os-company');
 if(!companySel)return;
 fillSelect('rg-os-company',core.companies(rows,year).map(x=>({value:x,label:x})),
  'Todas as empresas','TODAS',companySel.value||'TODAS');
}
function drawReports(){
 if(!hasReports()||!core||!loaded)return;
 const year=$('rg-year')?.value||'todos';
 const index=Number($('rg-month')?.value);
 const month=Number.isInteger(index)&&index>=1&&index<=12?
  core.months[index-1]:'todos';
 const company=$('rg-os-company')?.value||'TODAS';
 const r=core.summarize(rows,{year,month,company});
 for(const [id,k] of [['rg-os-gross','bruto'],['rg-os-costs','gasto'],['rg-os-net','liquido']])
  monetary(id,r[k]);
 percent('rg-os-margin',r.margin);
 put('rg-os-note',r.count+' ordem(ns) de serviço da planilha no período · '+
  (r.available?'Margem = líquido ÷ bruto × 100.':'Margem indisponível sem receita bruta no período.')+
  ' Esta base é independente das entradas e saídas bancárias.');
}
function render(){
 if(!loaded)return;
 yearOptions();companyOptions();monthOptions();
 drawOverview();reportCompanyOptions();drawReports();
}
function unavailable(message){
 for(const id of ['real-os-gross','real-os-costs','real-os-net','real-os-margin',
  'rg-os-gross','rg-os-costs','rg-os-net','rg-os-margin'])put(id,'—');
 put('real-os-count',message);put('rg-os-note',message);
}
async function fetchAll(){
 const all=[],step=600,maxRows=24000;
 for(let offset=0;offset<maxRows;offset+=step){
  const {data,error}=await db.from('indicadores_oficina')
   .select('ano,mes,os,cliente,empresa,bruto,gasto,mao_obra,liquido')
   .order('ano',{ascending:false}).order('os',{ascending:true})
   .range(offset,offset+step-1);
  if(error)throw error;
  all.push(...(data||[]));
  if(!data||data.length<step)return all;
 }
 throw Error('Base de O.S. acima do limite de consulta. Não exibir totais incompletos.');
}
async function refresh(){
 if(loading)return loading;
 if(typeof db==='undefined'||!db||!core){unavailable('Conexão ou cálculo da margem indisponível.');return;}
 loading=(async()=>{
  try{
   put('real-os-count','Consultando as O.S. da planilha do Dashboard...');
   put('rg-os-note','Consultando as O.S. da planilha do Dashboard...');
   const {data:access,error:accessError}=await db.rpc('fluxo_caixa_autorizado');
   if(accessError||access!==true)throw Error('Acesso financeiro não autorizado.');
   const result=await fetchAll();
   rows=result;loaded=true;render();
  }catch(error){
   loaded=false;rows=[];
   unavailable('Não foi possível consultar a margem das O.S.: '+(error.message||error));
  }
 })();
 try{await loading}finally{loading=null}
}
function setup(){
 if(!hasOverview()&&!hasReports())return;
 $('real-os-year')?.addEventListener('change',()=>{companyOptions();monthOptions();drawOverview()});
 $('real-os-company')?.addEventListener('change',()=>{monthOptions();drawOverview()});
 $('real-os-month')?.addEventListener('change',drawOverview);
 $('rg-os-company')?.addEventListener('change',drawReports);
 $('rg-year')?.addEventListener('change',()=>{reportCompanyOptions();drawReports()});
 $('rg-month')?.addEventListener('change',drawReports);
 $('real-refresh')?.addEventListener('click',()=>refresh().catch(()=>{}));
 if(visible('overview')||visible('reports'))refresh().catch(()=>{});
}
window.frOrdersProfitUI={refresh,renderReports:()=>{reportCompanyOptions();drawReports();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
