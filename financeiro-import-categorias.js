/* FR Motors | Edição individual de categorias em extratos bancários já importados.
 * Operações de metadados: nunca modifica valores, datas ou descrição original. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const dateBR=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Sem data';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const categoryName=value=>String(value||'').trim().toLocaleUpperCase('pt-BR');
const defaults=['PRÓ-LABORE','SALÁRIOS','FORNECEDORES','COMBUSTÍVEL','TARIFAS BANCÁRIAS',
 'TRIBUTOS E IMPOSTOS','ALUGUEL','SERVIÇOS','DESPESAS OPERACIONAIS','PAGAMENTO DE CARTÃO',
 'TRANSFERÊNCIAS','RECEBIMENTOS','VENDAS','REEMBOLSOS','EXTRATO BANCÁRIO',
 'OUTRAS DESPESAS','OUTRAS RECEITAS'];
const state={rows:[],files:[],loaded:false,loading:false,page:0,perPage:20,saving:null,version:0};
function status(message,failed=false){
 const element=$('import-categories-status');
 if(!element)return;
 element.textContent=message;
 element.className='status'+(failed?' bad':' ok');
}
async function fetchPages(makeQuery,limit=15000){
 const values=[],size=400;
 for(let offset=0;offset<limit;offset+=size){
  const {data,error}=await makeQuery().range(offset,offset+size-1);
  if(error)throw error;
  values.push(...(data||[]));
  if((data||[]).length<size)return values;
 }
 throw Error('Há mais de '+limit+' registros. A consulta foi interrompida para evitar uma lista parcial.');
}
function validateCategory(value){
 const text=categoryName(value);
 if(text.length<2||text.length>100)throw Error('A categoria deve ter de 2 a 100 caracteres.');
 return text;
}
function decorateLine(line,file,movement){
 return {
  id:line.id,importacao_id:line.importacao_id,arquivo:file?.arquivo_nome||'Arquivo desconhecido',
  conta:file?.conta_nome||'Conta desconhecida',
  date:line.data_lancamento,descricaoOriginal:line.descricao,
  descricaoExibida:line.descricao_personalizada||movement?.descricao||line.descricao,
  natureza:line.natureza,valor:line.valor,estado:movement?.estado||'sem_vinculo',
  currentCategory:movement?.categoria??null,
  manual:line.categoria_personalizada!=null,
  category:movement?.categoria||line.categoria_personalizada||'SEM CATEGORIA',
  draft:movement?.categoria||line.categoria_personalizada||''
 };
}
function filteredRows(){
 const account=normalize($('import-categories-account')?.value);
 const query=normalize($('import-categories-search')?.value);
 return state.rows.filter(row=>{
  if(account&&normalize(row.conta)!==account)return false;
  if(!query)return true;
  return normalize([row.date,dateBR(row.date),row.arquivo,row.conta,row.descricaoOriginal,
   row.descricaoExibida,row.category,row.natureza,row.estado].join(' ')).includes(query);
 });
}
function updateAccountOptions(){
 const select=$('import-categories-account');
 if(!select)return;
 const current=select.value;
 const unique=new Map();
 state.files.forEach(f=>{
  const key=normalize(f.conta_nome);
  if(key&&!unique.has(key))unique.set(key,f.conta_nome);
 });
 select.innerHTML='<option value="">Todas as contas</option>'+
  [...unique.entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'))
   .map(([key,name])=>'<option value="'+escapeText(key)+'">'+escapeText(name)+'</option>').join('');
 if(unique.has(current))select.value=current;
}
function updateCategoryOptions(){
 const list=$('import-existing-category-options');
 if(!list)return;
 const values=[...new Set([...defaults,...state.rows.map(r=>r.category)
  .filter(v=>v&&v!=='SEM CATEGORIA')])];
 list.innerHTML=values.sort((a,b)=>a.localeCompare(b,'pt-BR'))
  .map(name=>'<option value="'+escapeText(name)+'"></option>').join('');
}
function render(){
 const body=$('import-categories-rows'),pager=$('import-categories-pages');
 if(!body||!pager)return;
 const all=filteredRows();
 const pages=Math.max(1,Math.ceil(all.length/state.perPage));
 state.page=Math.min(state.page,pages-1);
 const visible=all.slice(state.page*state.perPage,(state.page+1)*state.perPage);
 body.innerHTML=visible.length?visible.map(r=>{
  const disabled=r.estado==='sem_vinculo'||state.saving===r.id||state.loading;
  const badge=r.estado==='confirmado'?'Confirmado':r.estado==='cancelado'?'Cancelado, fora do caixa':'Sem vínculo';
  return '<tr data-old-category-row="'+escapeText(r.id)+'">'+
   '<td>'+escapeText(dateBR(r.date))+'</td>'+
   '<td><strong>'+escapeText(r.conta)+'</strong><small class="import-oldcat-sub">'+escapeText(r.arquivo)+'</small></td>'+
   '<td><strong>'+escapeText(r.descricaoExibida)+'</strong>'+
    (r.descricaoExibida!==r.descricaoOriginal?'<small class="import-oldcat-sub">Banco: '+escapeText(r.descricaoOriginal)+'</small>':'')+
    '<small class="import-oldcat-sub">'+escapeText(r.natureza==='entrada'?'Entrada':'Saída')+'</small></td>'+
   '<td><label class="import-oldcat-label" for="oldcat-'+escapeText(r.id)+'">Categoria</label>'+
    '<input id="oldcat-'+escapeText(r.id)+'" type="text" list="import-existing-category-options" '+
    'data-old-category-input="'+escapeText(r.id)+'" maxlength="100" value="'+escapeText(r.draft)+'"'+(disabled?' disabled':'')+
    ' placeholder="Escolha ou digite" aria-label="Categoria do lançamento em '+escapeText(dateBR(r.date))+'">'+
    '<small class="import-oldcat-sub">Atual: '+escapeText(r.category)+(r.manual?' · manual':'')+'</small></td>'+
   '<td class="money">'+(r.natureza==='saida'?'− ':'+ ')+escapeText(money(r.valor))+'</td>'+
   '<td><span class="import-oldcat-state '+(r.estado==='confirmado'?'confirmed':'inactive')+'">'+escapeText(badge)+'</span></td>'+
   '<td><button type="button" class="btn btn-teal import-oldcat-save" data-old-category-save="'+escapeText(r.id)+'" '+
    (disabled?'disabled':'')+'>'+(state.saving===r.id?'Salvando...':'Salvar')+'</button></td></tr>';
 }).join(''):'<tr><td colspan="7" class="empty">Nenhuma movimentação encontrada. Ajuste os filtros ou atualize a lista.</td></tr>';
 const back=$('import-categories-prev'),next=$('import-categories-next');
 if(back)back.disabled=state.page===0||state.loading;
 if(next)next.disabled=state.page>=pages-1||state.loading;
 pager.textContent=all.length?((state.page+1)+' de '+pages+' página(s) · '+all.length+' lançamento(s) encontrados'):'Nenhuma movimentação encontrada';
 const counts=$('import-categories-count');
 if(counts){
  const active=state.rows.filter(r=>r.estado==='confirmado').length;
  const inactive=state.rows.filter(r=>r.estado==='cancelado').length;
  const manual=state.rows.filter(r=>r.manual).length;
  counts.textContent=state.rows.length+' movimentações importadas · '+active+' confirmadas · '+
   inactive+' canceladas (fora do caixa) · '+manual+' com categoria definida manualmente';
 }
}
async function loadAudit(){
 const root=$('import-categories-audit');
 if(!root)return;
 try{
  const {data,error}=await db.from('fin_extrato_categorias_auditoria')
   .select('id,criado_em,conta_nome,descricao_bancaria,categoria_anterior,categoria_nova')
   .order('criado_em',{ascending:false}).limit(12);
  if(error)throw error;
  const list=data||[];
  root.innerHTML=list.length?list.map(r=>'<tr>'+
   '<td>'+escapeText(new Date(r.criado_em).toLocaleString('pt-BR'))+'</td>'+
   '<td>'+escapeText(r.conta_nome)+'</td>'+
   '<td>'+escapeText(r.descricao_bancaria)+'</td>'+
   '<td>'+escapeText(r.categoria_anterior||'Não definida')+'</td>'+
   '<td><strong>'+escapeText(r.categoria_nova)+'</strong></td></tr>').join(''):
   '<tr><td colspan="5" class="empty">Nenhuma alteração manual registrada.</td></tr>';
 }catch(err){
  root.innerHTML='<tr><td colspan="5" class="empty">'+escapeText('Histórico indisponível: '+err.message)+'</td></tr>';
 }
}
async function refresh(){
 const details=$('imports-editar-categorias');
 if(!details?.open)return;
 const version=++state.version;
 state.loading=true;
 status('Consultando os extratos bancários já importados...');
 try{
  const files=await fetchPages(()=>db.from('fin_teste_importacoes')
   .select('id,tipo,conta_nome,arquivo_nome,criado_em').eq('tipo','banco')
   .order('criado_em',{ascending:false}).order('id',{ascending:false}));
  const lines=[];
  for(let i=0;i<files.length;i+=30){
   const ids=files.slice(i,i+30).map(file=>file.id);
   const part=await fetchPages(()=>db.from('fin_teste_import_linhas')
    .select('id,importacao_id,movimento_id,data_lancamento,descricao,descricao_personalizada,categoria_personalizada,natureza,valor')
    .in('importacao_id',ids).order('data_lancamento',{ascending:false}).order('id',{ascending:false}));
   lines.push(...part);
  }
  const movements=[],ids=[...new Set(lines.map(row=>row.movimento_id).filter(Boolean))];
  for(let i=0;i<ids.length;i+=30){
   const part=await fetchPages(()=>db.from('fin_teste_movimentos')
    .select('id,categoria,descricao,estado').in('id',ids.slice(i,i+30)).order('id',{ascending:true}));
   movements.push(...part);
  }
  if(version!==state.version)return;
  const byFile=new Map(files.map(f=>[f.id,f]));
  const byMovement=new Map(movements.map(m=>[m.id,m]));
  state.files=files;
  state.rows=lines.map(line=>decorateLine(line,byFile.get(line.importacao_id),byMovement.get(line.movimento_id)))
   .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.id).localeCompare(String(b.id)));
  state.loaded=true;state.loading=false;
  updateAccountOptions();updateCategoryOptions();render();
  status('Lista atualizada. Edite a categoria e clique em Salvar em cada linha; o texto do banco, valores e datas não são alterados.');
  await loadAudit();
 }catch(err){
  if(version!==state.version)return;
  state.loading=false;state.loaded=false;state.rows=[];state.files=[];
  render();
  status('Falha ao consultar extratos: '+String(err.message||err),true);
 }
}
async function saveCategory(id){
 if(state.saving||state.loading)return;
 const row=state.rows.find(x=>x.id===id);
 if(!row||row.estado==='sem_vinculo')return;
 let category;
 try{category=validateCategory(row.draft)}catch(err){status(err.message,true);return}
 state.saving=id;render();status('Salvando categoria de '+dateBR(row.date)+'...');
 try{
  const {data,error}=await db.rpc('fin_extrato_categoria_editar',{
   p_linha_id:id,p_categoria:category,p_categoria_esperada:row.currentCategory
  });
  if(error)throw error;
  if(!data||data.id!==id)throw Error('O servidor não confirmou a edição.');
  state.saving=null;
  await refresh();
  status(data.alterada?'Categoria '+data.categoria_nova+' salva e registrada na auditoria. Nenhum valor ou data foi alterado.':
   'Categoria já estava definida. Nenhum lançamento financeiro foi modificado.');
  window.frFinanceUI?.showToast?.(data.alterada?'Categoria do extrato atualizada.':'Categoria já estava atualizada.');
 }catch(err){
  state.saving=null;render();
  status('Não foi possível salvar: '+String(err.message||err)+'. Atualize a lista se o registro foi alterado em outra sessão.',true);
 }
}
function init(){
 const details=$('imports-editar-categorias');
 if(!details)return;
 details.addEventListener('toggle',()=>{if(details.open)refresh()});
 $('import-categories-refresh')?.addEventListener('click',refresh);
 $('import-categories-account')?.addEventListener('change',()=>{state.page=0;render()});
 $('import-categories-search')?.addEventListener('input',()=>{state.page=0;render()});
 $('import-categories-prev')?.addEventListener('click',()=>{if(state.page>0){state.page--;render()}});
 $('import-categories-next')?.addEventListener('click',()=>{
  if((state.page+1)*state.perPage<filteredRows().length){state.page++;render()}
 });
 $('import-categories-rows')?.addEventListener('input',event=>{
  const input=event.target.closest('[data-old-category-input]');
  if(!input)return;
  const row=state.rows.find(item=>item.id===input.dataset.oldCategoryInput);
  if(row)row.draft=input.value;
 });
 $('import-categories-rows')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-old-category-save]');
  if(button)saveCategory(button.dataset.oldCategorySave);
 });
 $('import-reload')?.addEventListener('click',()=>{if(details.open)refresh()});
 const requestedSection=new URLSearchParams(window.location.search).get('section');
 if(window.location.hash==='#imports-editar-categorias'||requestedSection==='editar-categorias')
  details.open=true;
 if(details.open)refresh();
}
window.frImportCategoriasUI={refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
