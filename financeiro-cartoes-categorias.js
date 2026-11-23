/* FR Motors | Classificação individual de despesas nos cartões.
 * Planilha documental e PDFs importados permanecem fontes independentes.
 * Categoria não modifica valores, pagamentos, faturas nem caixa bancário. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateBR=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Não informado';
const cardName=name=>window.frCardNames?.canonical?.(name)||String(name||'Cartão');
const generic=s=>!s||['COMPRAS NO CARTÃO','COMPRAS NO CARTAO','SEM CATEGORIA','A CLASSIFICAR'].includes(String(s).toUpperCase().trim());
const purposeLabel=p=>p==='oficina'?'Uso na oficina':p==='outras'?'Outra finalidade':'A definir';
const defaults=['AUTOPEÇAS','COMBUSTÍVEL','DESPESAS DA OFICINA','FERRAMENTAS','FORNECEDORES','INSUMOS','MANUTENÇÃO','MATERIAL DE ESCRITÓRIO','MERCADO LIVRE','SERVIÇOS','TARIFAS E ENCARGOS','TRIBUTOS E IMPOSTOS','USO PESSOAL','VIAGENS'];
const state={planilha:[],importado:[],items:[],loading:null,ready:false,page:0,pageSize:20,edit:null,saving:false};
let initialized=false;
function msg(text,error=false){const el=$('cbcat-status');if(el){el.textContent=text;el.classList.toggle('cbcat-error',error)}}
async function all(makeQuery,max=6000){
 const output=[],step=400;
 for(let offset=0;offset<max;offset+=step){
  const {data,error}=await makeQuery().range(offset,offset+step-1);
  if(error)throw error;
  output.push(...(data||[]));
  if((data||[]).length<step)return output;
 }
 throw Error('Mais de '+max+' compras: análise bloqueada para não mostrar totais parciais.');
}
// A pesquisa aceita moeda brasileira, ponto decimal e separadores de milhar.
function priceCents(input){
 const raw=String(input??'').trim().replace(/^R\$\s*/i,'').replace(/[\s\u00a0]/g,'').replace(/[\u2212\u2013\u2014]/g,'-');
 if(!/^-?\d[\d.,]*$/.test(raw))return null;
 let value=raw;
 const comma=value.lastIndexOf(','),dot=value.lastIndexOf('.');
 if(comma>=0&&dot>=0)value=comma>dot?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');
 else if(comma>=0)value=value.replace(/\./g,'').replace(',','.');
 else if(dot>=0){
  const decimals=value.length-dot-1;
  if(decimals===3&&/^\-?\d{1,3}(\.\d{3})+$/.test(value))value=value.replace(/\./g,'');
  else if(decimals>2)return null;
 }
 const parsed=Number(value);
 return Number.isFinite(parsed)&&Number.isSafeInteger(Math.round(parsed*100))?Math.round(parsed*100):null;
}
function values(id){return $(id)?.value||'todos'}
function setOptions(id,items,empty,initial){
 const el=$(id);if(!el)return;
 el.innerHTML='<option value="todos">'+safe(empty)+'</option>'+
  items.map(x=>'<option value="'+safe(x.value)+'">'+safe(x.label)+'</option>').join('');
 if(items.some(x=>x.value===initial))el.value=initial;
}
function rebuildFilters(){
 const base=state.items.filter(x=>x.origem===values('cbcat-source'));
 const years=[...new Set(base.map(x=>x.mes.slice(0,4)).filter(Boolean))].sort().reverse();
 const yearsOld=values('cbcat-year');
 setOptions('cbcat-year',years.map(x=>({value:x,label:x})),'Todos os anos',yearsOld);
 const months=[...new Set(base.filter(x=>values('cbcat-year')==='todos'||x.mes.slice(0,4)===values('cbcat-year'))
  .map(x=>x.mes).filter(Boolean))].sort().reverse();
 const monthsOld=values('cbcat-month');
 setOptions('cbcat-month',months.map(x=>({value:x,label:x.slice(5,7)+'/'+x.slice(0,4)})),'Todos os meses',monthsOld);
 const cards=[...new Set(base.map(x=>x.cartao))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const cardOld=values('cbcat-card');
 setOptions('cbcat-card',cards.map(x=>({value:x,label:x})),'Todos os cartões',cardOld);
 const categories=[...new Set(base.map(x=>x.categoria).filter(x=>x&&!generic(x)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const catOld=values('cbcat-category');
 setOptions('cbcat-category',categories.map(x=>({value:x,label:x})),'Todas as categorias',catOld);
}
function filtered(){
 const source=values('cbcat-source'),year=values('cbcat-year'),month=values('cbcat-month'),
  card=values('cbcat-card'),cat=values('cbcat-category'),status=values('cbcat-status-filter'),purpose=values('cbcat-purpose-filter');
 const search=String($('cbcat-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const searchedAmount=priceCents(search);
 return state.items.filter(x=>{
  if(x.origem!==source)return false;
  if(year!=='todos'&&x.mes.slice(0,4)!==year)return false;
  if(month!=='todos'&&x.mes!==month)return false;
  if(card!=='todos'&&x.cartao!==card)return false;
  if(cat!=='todos'&&x.categoria!==cat)return false;
  if(status==='sem'&&!generic(x.categoria))return false;
  if(status==='definida'&&generic(x.categoria))return false;
  if(purpose!=='todos'&&x.finalidade!==purpose)return false;
  if(!search)return true;
  // Número sozinho ou em formato monetário corresponde ao valor exato.
  if(searchedAmount!==null&&Math.round(x.valor*100)===searchedAmount)return true;
  // Também encontra fragmentos do valor formatado: 250,50; 1.250,50; R$ 1.250,50.
  return [x.descricao,x.cartao,x.parcela,x.mes,x.data,x.categoria,
   String(x.valor),money(x.valor),Number(x.valor).toFixed(2).replace('.',',')]
   .join(' ').toLocaleLowerCase('pt-BR').includes(search);
 }).sort((a,b)=>b.mes.localeCompare(a.mes)||b.data.localeCompare(a.data)||
   a.descricao.localeCompare(b.descricao,'pt-BR'));
}
function breakdown(rows){
 const grouped=new Map();
 for(const row of rows){
  const key=generic(row.categoria)?'A CLASSIFICAR':row.categoria;
  const acc=grouped.get(key)||{count:0,cents:0};
  acc.count++;acc.cents+=Math.round(row.valor*100);grouped.set(key,acc);
 }
 const ordered=[...grouped].sort((a,b)=>Math.abs(b[1].cents)-Math.abs(a[1].cents));
 $('cbcat-breakdown').innerHTML=ordered.length?ordered.map(([cat,v])=>
  '<div class="cbcat-breakdown-row"><span>'+safe(cat)+' <small>'+v.count+' item(ns)</small></span>'+
  '<strong>'+money(v.cents/100)+'</strong></div>').join(''):
  '<p class="info-note">Nenhuma compra corresponde à seleção.</p>';
}
function render(){
 const allRows=filtered();
 const total=allRows.reduce((s,x)=>s+Math.round(x.valor*100),0)/100;
 const unclassified=allRows.filter(x=>generic(x.categoria));
 const totalUnclassified=unclassified.reduce((s,x)=>s+Math.round(x.valor*100),0)/100;
 const source=values('cbcat-source');
 $('cbcat-purpose-pending').textContent=String(allRows.filter(x=>x.finalidade==='a_classificar').length);
 $('cbcat-count').textContent=String(allRows.length);
 $('cbcat-total').textContent=money(total);
 $('cbcat-unclassified').textContent=String(unclassified.length);
 $('cbcat-unclassified-total').textContent=money(totalUnclassified);
 $('cbcat-source-note').textContent=source==='planilha'?
  'Origem: lançamentos documentais da planilha, sem alterar documentos nem gerar nova despesa no banco.':
  'Origem: compras importadas de PDFs de cartão. Classificação independente dos pagamentos e do caixa.';
 breakdown(allRows);
 const pages=Math.max(1,Math.ceil(allRows.length/state.pageSize));
 state.page=Math.min(Math.max(state.page,0),pages-1);
 const rows=allRows.slice(state.page*state.pageSize,(state.page+1)*state.pageSize);
 $('cbcat-rows').innerHTML=rows.length?rows.map(x=>
  '<tr><td><strong>'+safe(x.descricao)+'</strong><small>'+safe(x.parcela?'Parcela '+x.parcela+' · ':'')+safe(x.origem==='planilha'?'Planilha homologada':'Extrato do cartão')+'</small></td>'+
  '<td>'+safe(x.cartao)+'</td><td>'+safe(x.mes.slice(5,7)+'/'+x.mes.slice(0,4))+'</td>'+
  '<td>'+safe(dateBR(x.data))+'</td>'+
  '<td>'+ (generic(x.categoria)?'<span class="cbcat-pending">A classificar</span>':safe(x.categoria))+'</td>'+
  '<td>'+safe(purposeLabel(x.finalidade))+'</td>'+
  '<td class="money">'+money(x.valor)+'</td>'+
  '<td><button type="button" class="btn cbcat-action" data-cbcat-id="'+safe(x.id)+'" data-cbcat-origin="'+safe(x.origem)+'">'+
   (generic(x.categoria)?'Categorizar':'Alterar')+'</button></td></tr>').join(''):
  '<tr><td colspan="8">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>';
 $('cbcat-pages').textContent=allRows.length+' lançamento(s) · página '+(state.page+1)+' de '+pages;
 $('cbcat-prev').disabled=state.page===0;
 $('cbcat-next').disabled=state.page>=pages-1;
}
function openEditor(id,source){
 try{
  if(state.saving)return;
  const row=state.items.find(x=>x.id===id&&x.origem===source);
  if(!row)throw Error('Compra não encontrada nesta seleção. Clique em Atualizar compras e tente novamente.');
  const dialog=$('cbcat-dialog');
  if(!dialog||typeof dialog.showModal!=='function')
   throw Error('O navegador não conseguiu abrir a janela de edição. Recarregue o site ou use um navegador atualizado.');
  state.edit=row;
  $('cbcat-edit-summary').textContent=row.descricao+' · '+row.cartao+' · '+dateBR(row.data)+' · '+money(row.valor);
  $('cbcat-edit-current').textContent=generic(row.categoria)?
   'Ainda não classificada'+(row.categoria?' (categoria genérica: '+row.categoria+')':''):
   'Categoria atual: '+row.categoria;
  $('cbcat-edit-value').value=generic(row.categoria)?'':row.categoria;
  $('cbcat-edit-finalidade').value=row.finalidade||'a_classificar';
  $('cbcat-edit-error').textContent='Categoria opcional. Confirme a finalidade da compra; valores, datas, fatura e histórico são preservados.';
  const current=[...new Set([...defaults,...state.items.map(x=>x.categoria).filter(x=>x&&!generic(x))])]
   .sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('cbcat-category-options').innerHTML=current.map(x=>'<option value="'+safe(x)+'"></option>').join('');
  if(!dialog.open)dialog.showModal();
  $('cbcat-edit-value').focus();
 }catch(err){
  state.edit=null;
  msg('Não foi possível abrir a classificação: '+String(err.message||err),true);
  window.frFinanceUI?.showToast?.('Erro ao abrir categoria: '+String(err.message||err),true);
 }
}
async function save(event){
 event.preventDefault();
 if(state.saving||!state.edit)return;
 const text=String($('cbcat-edit-value').value||'').trim().toLocaleUpperCase('pt-BR');
 if((text.length>0&&text.length<2)||text.length>100){
  $('cbcat-edit-error').textContent='Informe uma categoria entre 2 e 100 caracteres.';
  return;
 }
 const finalidade=$('cbcat-edit-finalidade').value;
 if(!['oficina','outras','a_classificar'].includes(finalidade)){
  $('cbcat-edit-error').textContent='Selecione a finalidade da compra.';return;
 }
 const row=state.edit;
 state.saving=true;
 $('cbcat-edit-save').disabled=true;
 $('cbcat-edit-error').textContent='Salvando a classificação com auditoria...';
 try{
  if(typeof db==='undefined'||!db)throw Error('Conexão financeira indisponível.');
  const {data,error}=await db.rpc('fin_cartao_classificacao_salvar',{
   p_origem:row.origem,p_lancamento_id:row.id,p_categoria:text,
   p_categoria_esperada:row.categoria,
   p_finalidade:finalidade,p_finalidade_esperada:row.finalidade
  });
  if(error)throw error;
  if(!data||data.finalidade_nova!==finalidade||(text&&data.categoria_nova!==text))
   throw Error('A alteração não foi confirmada pelo servidor.');
  $('cbcat-dialog').close();state.edit=null;
  await refresh();
  if(window.frDocumentsUI?.refresh){
   // Mantém o comparativo mensal sincronizado, sem registrar qualquer lançamento.
   window.frDocumentsUI.refresh().catch(()=>{});
  }
  msg((data.alterada?'Classificação salva com auditoria.':'Classificação já estava atualizada.')+
   ' Valor da fatura e caixa preservados.');
 }catch(err){
  $('cbcat-edit-error').textContent='Não foi possível salvar: '+(err.message||err)+
   '. Atualize a lista se outra pessoa já alterou a categoria.';
 }finally{
  state.saving=false;$('cbcat-edit-save').disabled=false;
 }
}
async function refresh(){
 if(state.loading)return state.loading;
 state.loading=(async()=>{
  msg('Consultando as compras dos cartões e suas classificações...');
  if(typeof db==='undefined'||!db)throw Error('Sem conexão com o banco financeiro.');
  const auth=await db.rpc('fluxo_caixa_autorizado');
  if(auth.error||auth.data!==true)throw Error('Acesso financeiro não autorizado.');
  const [docs,classes,imports,finalidades]=await Promise.all([
   all(()=>db.from('fin_documentos_despesas')
    .select('id,grupo,incluir,cartao_nome,mes_fatura,data_evento,descricao,parcela,valor_registrado')
    .eq('grupo','cartoes').eq('incluir',true).order('id')),
   all(()=>db.from('fin_cartoes_categorias_documentais')
    .select('documento_id,categoria').order('documento_id')),
   all(()=>db.from('fin_teste_cartao_lancamentos')
    .select('id,cartao_nome,data_lancamento,descricao,valor,natureza,categoria')
    .order('id')),
   all(()=>db.from('fin_cartoes_finalidades')
    .select('origem,lancamento_id,finalidade').order('lancamento_id'))
  ]);
  const byId=new Map(classes.map(x=>[x.documento_id,x.categoria]));
  const purposeById=new Map(finalidades.map(x=>[x.origem+'|'+x.lancamento_id,x.finalidade]));
  const planilha=docs.filter(x=>!['PIX','DÉBITO','DEBITO']
   .includes(String(x.cartao_nome||'').trim().toLocaleUpperCase('pt-BR')))
   .filter(x=>/\d{4}-\d{2}-\d{2}/.test(String(x.mes_fatura||x.data_evento||'')))
   .map(x=>({
    id:x.id,origem:'planilha',cartao:cardName(x.cartao_nome),
    mes:String(x.mes_fatura||x.data_evento).slice(0,7),
    data:String(x.data_evento||x.mes_fatura).slice(0,10),
    descricao:x.descricao||'Compra sem descrição',
    parcela:x.parcela||'',valor:Number(x.valor_registrado),
    categoria:byId.get(x.id)||null,
    finalidade:purposeById.get('planilha|'+x.id)||'a_classificar'
   }));
  const importado=imports.filter(x=>['compra','estorno'].includes(x.natureza))
   .map(x=>({
    id:x.id,origem:'importado',cartao:cardName(x.cartao_nome),
    mes:String(x.data_lancamento).slice(0,7),
    data:x.data_lancamento,descricao:x.descricao||'Compra sem descrição',
    parcela:'',valor:Number(x.valor)*(x.natureza==='estorno'?-1:1),
    categoria:x.categoria||null,
    finalidade:purposeById.get('importado|'+x.id)||'a_classificar'
   }));
  if([...planilha,...importado].some(x=>!Number.isFinite(x.valor)))
   throw Error('Compra de cartão com valor inválido; o total não será exibido.');
  state.planilha=planilha;state.importado=importado;state.items=[...planilha,...importado];
  state.ready=true;
  rebuildFilters();render();
  msg('Categorias carregadas. Filtre por mês ou cartão e clique em Categorizar/Alterar na compra desejada.');
 })().catch(err=>{
  state.ready=false;state.items=[];state.planilha=[];state.importado=[];
  $('cbcat-rows').innerHTML='<tr><td colspan="8">A lista não pôde ser carregada com segurança.</td></tr>';
  msg('Não foi possível carregar as compras: '+(err.message||err),true);
 }).finally(()=>{state.loading=null});
 return state.loading;
}
function init(){
 if(initialized||!$('cbcat-panel'))return;
 initialized=true;
 $('cbcat-source').addEventListener('change',()=>{state.page=0;rebuildFilters();render()});
 $('cbcat-year').addEventListener('change',()=>{state.page=0;rebuildFilters();render()});
 for(const id of ['cbcat-month','cbcat-card','cbcat-category','cbcat-status-filter','cbcat-purpose-filter'])
  $(id).addEventListener('change',()=>{state.page=0;render()});
 $('cbcat-search').addEventListener('input',()=>{state.page=0;render()});
 $('cbcat-refresh').addEventListener('click',()=>refresh());
 $('cbcat-clear').addEventListener('click',()=>{
  $('cbcat-year').value='todos';$('cbcat-search').value='';$('cbcat-status-filter').value='todos';
  $('cbcat-purpose-filter').value='todos';
  rebuildFilters();$('cbcat-month').value='todos';$('cbcat-card').value='todos';
  $('cbcat-category').value='todos';state.page=0;render();
 });
 $('cbcat-prev').addEventListener('click',()=>{state.page--;render()});
 $('cbcat-next').addEventListener('click',()=>{state.page++;render()});
 // Captura o toque antes dos listeners gerais da tabela e da navegação.
 // A lista pode ser redesenhada sem perder o evento do botão.
 document.addEventListener('click',e=>{
  const button=e.target?.closest?.('[data-cbcat-id]');
  if(!button||!$('cbcat-rows')?.contains(button))return;
  e.preventDefault();
  e.stopPropagation();
  openEditor(button.dataset.cbcatId,button.dataset.cbcatOrigin);
 },true);
 $('cbcat-form').addEventListener('submit',save);
 for(const id of ['cbcat-cancel','cbcat-close'])$(id).addEventListener('click',()=>{
  if(!state.saving)$('cbcat-dialog').close();
 });
 $('cbcat-dialog').addEventListener('cancel',e=>{if(state.saving)e.preventDefault()});
 $('cbcat-jump')?.addEventListener('click',()=>{
  $('cbcat-panel').scrollIntoView({behavior:'smooth',block:'start'});
 });
 if(!document.querySelector('[data-view-panel="cardbills"]')?.hidden)refresh();
}
window.frCardCategoriesUI={refresh,__test:{generic,priceCents}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
