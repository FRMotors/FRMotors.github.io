/* FR Motors | Regras editáveis de classificação de PIX enviados.
 * O nome bruto do banco permanece em fin_teste_import_linhas e na auditoria.
 * Sem criação de pagamento, alteração de valor ou inserção no caixa homologado. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mask=x=>String(x||'').replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,'[CPF oculto]');
const brl=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const write=(id,v)=>{const node=$(id);if(node)node.textContent=v};
let rules=[],historico=[],editing=null,loading=null,busy=false;
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   if(typeof db==='undefined'||!db)throw Error('Supabase não disponível.');
   write('pix-rules-status','Carregando regras de classificação...');
   const {data:authorized,error:authError}=await db.rpc('fluxo_caixa_autorizado');
   if(authError||authorized!==true)throw Error('Acesso financeiro não autorizado.');
   const [rr,hh]=await Promise.all([
    db.from('fin_extrato_regras_classificacao')
     .select('id,trecho_destinatario,descricao_padrao,categoria_padrao,ativa,atualizado_em')
     .order('trecho_destinatario',{ascending:true}).limit(250),
    db.from('fin_extrato_classificacoes_auditoria')
     .select('id,regra_id,descricao_bancaria,descricao_padrao,categoria_padrao,modo,criado_em')
     .order('criado_em',{ascending:false}).limit(300)
   ]);
   if(rr.error)throw rr.error;if(hh.error)throw hh.error;
   rules=rr.data||[];historico=hh.data||[];
   render();
   write('pix-rules-status',rules.filter(r=>r.ativa).length+' regra(s) ativa(s). '+
    historico.length+' classificação(ões) registrada(s) na consulta. Importações futuras são classificadas automaticamente.');
  }catch(err){
   write('pix-rules-status','Não foi possível carregar as regras: '+(err.message||err));
   if($('pix-rules-rows'))$('pix-rules-rows').innerHTML=
    '<tr><td colspan="5" class="empty">Erro de leitura. Atualize após entrar no Financeiro.</td></tr>';
  }
 })();
 try{await loading}finally{loading=null}
}
function render(){
 const counts=new Map();
 for(const h of historico)counts.set(h.regra_id,(counts.get(h.regra_id)||0)+1);
 if($('pix-rules-rows'))$('pix-rules-rows').innerHTML=rules.length?rules.map(r=>
  '<tr><td><strong>'+esc(r.trecho_destinatario)+'</strong><small>'+
  (r.ativa?'Ativa para novos extratos':'Desativada')+'</small></td>'+
  '<td>'+esc(r.descricao_padrao)+'</td>'+
  '<td>'+esc(r.categoria_padrao)+'</td>'+
  '<td>'+String(counts.get(r.id)||0)+'</td>'+
  '<td><div class="pix-rule-actions"><button type="button" class="btn" data-pix-rule-edit="'+esc(r.id)+'">Editar</button>'+
  '<button type="button" class="btn" data-pix-rule-toggle="'+esc(r.id)+'">'+
  (r.ativa?'Desativar':'Ativar')+'</button></div></td></tr>'
 ).join(''):'<tr><td colspan="5" class="empty">Nenhuma regra cadastrada. Adicione abaixo.</td></tr>';
 if($('pix-rules-audit'))$('pix-rules-audit').innerHTML=historico.length?historico.slice(0,12).map(h=>{
  const changed=h.criado_em?new Date(h.criado_em).toLocaleDateString('pt-BR'):'—';
  return '<tr><td>'+esc(changed)+'</td>'+
   '<td>'+esc(mask(h.descricao_bancaria))+'</td>'+
   '<td><strong>'+esc(h.descricao_padrao)+'</strong><small>'+esc(h.categoria_padrao)+'</small></td>'+
   '<td>'+esc(h.modo==='importacao'?'Automática':'Revisada por regra')+'</td></tr>';
 }).join(''):'<tr><td colspan="4" class="empty">Nenhuma classificação aplicada ainda.</td></tr>';
 write('pix-rules-count',rules.length+' regra(s) · '+rules.filter(r=>r.ativa).length+' ativa(s)');
}
function setEditing(id){
 const rule=rules.find(r=>r.id===id);
 if(!rule)return;
 editing=id;
 $('pix-rule-name').value=rule.trecho_destinatario;
 $('pix-rule-label').value=rule.descricao_padrao;
 $('pix-rule-category').value=rule.categoria_padrao;
 $('pix-rule-active').checked=rule.ativa;
 write('pix-rule-form-title','Editar regra · '+rule.trecho_destinatario);
 write('pix-rule-save','Salvar alterações');
 $('pix-rule-cancel').hidden=false;
 $('pix-rule-form')?.scrollIntoView({behavior:'smooth',block:'start'});
 $('pix-rule-label')?.focus();
}
function clearEdit(){
 editing=null;
 $('pix-rule-form').reset();
 $('pix-rule-active').checked=true;
 write('pix-rule-form-title','Nova regra de classificação');
 write('pix-rule-save','Adicionar regra');
 $('pix-rule-cancel').hidden=true;
}
async function save(event){
 event.preventDefault();
 if(busy)return;
 const payload={
  p_id:editing,
  p_trecho:$('pix-rule-name').value.trim(),
  p_descricao:$('pix-rule-label').value.trim(),
  p_categoria:$('pix-rule-category').value.trim(),
  p_ativa:$('pix-rule-active').checked
 };
 if(payload.p_trecho.length<6||payload.p_descricao.length<2||payload.p_categoria.length<2){
  write('pix-rule-form-message','Informe um nome específico (mínimo 6 caracteres), a descrição e a categoria.');return;
 }
 busy=true;$('pix-rule-save').disabled=true;
 try{
  const {data,error}=await db.rpc('fin_extrato_regra_salvar',payload);
  if(error)throw error;
  if(data?.resultado!=='salvo')throw Error('Regra não confirmada pelo servidor.');
  clearEdit();await load();
  write('pix-rule-form-message','Regra salva! Ela já vale para novas importações. Para os extratos antigos, clique em Aplicar aos extratos importados.');
 }catch(e){write('pix-rule-form-message','Não foi possível salvar: '+(e.message||e))}
 finally{busy=false;$('pix-rule-save').disabled=false}
}
async function toggle(id){
 if(busy)return;
 const r=rules.find(x=>x.id===id);if(!r)return;
 busy=true;write('pix-rule-form-message','Atualizando situação da regra...');
 try{
  const {error}=await db.rpc('fin_extrato_regra_salvar',{
   p_id:r.id,p_trecho:r.trecho_destinatario,p_descricao:r.descricao_padrao,
   p_categoria:r.categoria_padrao,p_ativa:!r.ativa
  });
  if(error)throw error;
  if(editing===id)clearEdit();
  await load();
  write('pix-rule-form-message','Situação atualizada. Desativar não apaga classificações anteriores.');
 }catch(e){write('pix-rule-form-message','Erro ao alterar regra: '+(e.message||e))}
 finally{busy=false}
}
async function reapply(){
 if(busy)return;
 busy=true;
 const btn=$('pix-rules-apply');btn.disabled=true;
 write('pix-rule-reapply-status','Conferindo extratos importados sem alterar pagamentos...');
 try{
  const {data,error}=await db.rpc('fin_extrato_regras_aplicar_existentes');
  if(error)throw error;
  await load();
  write('pix-rule-reapply-status',data.classificados+' lançamento(s) atualizado(s) em '+
   data.examinados+' saída(s) examinada(s). PIX recebidos, valores e conciliações não foram alterados.');
 }catch(e){write('pix-rule-reapply-status','Erro ao reaplicar regras: '+(e.message||e))}
 finally{busy=false;btn.disabled=false}
}
function init(){
 if(!$('pix-rule-form'))return;
 $('pix-rule-form')?.addEventListener('submit',save);
 $('pix-rule-cancel')?.addEventListener('click',clearEdit);
 $('pix-rules-refresh')?.addEventListener('click',()=>load().catch(()=>{}));
 $('pix-rules-apply')?.addEventListener('click',reapply);
 $('pix-rules-rows')?.addEventListener('click',event=>{
  const edit=event.target.closest('[data-pix-rule-edit]');
  const tog=event.target.closest('[data-pix-rule-toggle]');
  if(edit)setEditing(edit.dataset.pixRuleEdit);
  else if(tog)toggle(tog.dataset.pixRuleToggle);
 });
 if(!document.querySelector('[data-view-panel="imports"]')?.hidden)load().catch(()=>{});
}
window.frPixRulesUI={refresh:load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();