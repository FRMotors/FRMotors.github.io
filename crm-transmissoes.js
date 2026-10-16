/* FR Motors · CRM · Listas de transmissão por VCF · 1.0 */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const statusNames={aguardando:'Aguardando confirmação',recebeu:'Recebeu',nao_recebeu:'Não recebeu',respondeu:'Respondeu',nao_contatar:'Não contatar'};
const statuses=Object.keys(statusNames);
let campaignContacts=[],campaignId='',allClients=null;
const cleanPhone=value=>{let n=String(value||'').replace(/\D/g,'');if(n.length===10||n.length===11)n='55'+n;return /^55\d{10,11}$/.test(n)?n:''};
function info(text){el('vcfMessage').textContent=text}
function unfoldedVCF(text){return text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'')}
function decodeVCF(v){return String(v||'').replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1').trim()}
function parseVCF(content){
 const input=unfoldedVCF(content),cards=input.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi)||[];
 const contacts=new Map();
 for(const card of cards){
  const lines=card.split('\n');let name='',numbers=[];
  for(const line of lines){
   const sep=line.indexOf(':');if(sep<0)continue;
   const key=line.slice(0,sep).split(';')[0].toUpperCase(),value=line.slice(sep+1);
   if(key==='FN')name=decodeVCF(value).replace(/^FRM\s*-\s*/i,'');
   if(key==='TEL')numbers.push(value);
  }
  for(const raw of numbers){const phone=cleanPhone(raw);if(!phone)continue;if(!contacts.has(phone))contacts.set(phone,{telefone:phone,nome:name||'Sem nome'});}
 }
 return [...contacts.values()];
}
async function knownClients(){
 if(allClients)return allClients;
 const arr=[];
 for(let from=0;from<10000;from+=1000){
  const {data,error}=await db.from('shoficina_clientes').select('source_client_id,nome,telefone,celular').order('source_client_id').range(from,from+999);
  if(error)throw error;arr.push(...(data||[]));if(!data||data.length<1000)break;
 }
 const map=new Map();
 for(const c of arr)for(const p of [c.telefone,c.celular]){const phone=cleanPhone(p);if(phone&&!map.has(phone))map.set(phone,c.source_client_id)}
 allClients=map;return map;
}
async function getLists(){
 if(!ready)return;
 const {data,error}=await db.from('crm_listas_transmissao').select('id,nome,criado_em').order('criado_em',{ascending:false});
 if(error){info('Não foi possível consultar as listas: '+error.message);return}
 const select=el('vcfList');select.innerHTML='<option value="">Selecionar lista salva</option>';
 for(const x of data||[]){const option=document.createElement('option');option.value=x.id;option.textContent=x.nome;select.appendChild(option)}
 if(campaignId&&data?.some(x=>x.id===campaignId))select.value=campaignId;
}
async function importVCF(){
 if(!ready){info('Aguarde a confirmação de acesso ao CRM.');return}
 const f=el('vcfFile').files?.[0],name=el('vcfName').value.trim();
 if(!name){info('Digite o nome da lista.');return}
 if(!f||!f.name.toLowerCase().endsWith('.vcf')){info('Selecione um arquivo .vcf.');return}
 if(f.size>3*1024*1024){info('Arquivo muito grande. Divida a lista em partes menores.');return}
 el('vcfImport').disabled=true;
 try{
  const contacts=parseVCF(await f.text());
  if(!contacts.length){info('Nenhum telefone brasileiro válido encontrado no VCF.');return}
  if(contacts.length>1000){info('O arquivo tem mais de 1000 contatos. Separe em listas menores.');return}
  info('Relacionando contatos e salvando lista...');
  const lookup=await knownClients();
  const {data:campaign,error:e1}=await db.from('crm_listas_transmissao').insert({nome:name}).select('id').single();
  if(e1)throw e1;
  campaignId=campaign.id;
  const rows=contacts.map(c=>({...c,lista_id:campaignId,cod_cliente:lookup.get(c.telefone)||null,situacao:'aguardando'}));
  for(let i=0;i<rows.length;i+=100){
   const {error}=await db.from('crm_listas_transmissao_contatos').insert(rows.slice(i,i+100));
   if(error)throw error;
  }
  await getLists();await loadCampaign();
  info('Lista criada: '+rows.length+' contatos únicos. '+rows.filter(x=>x.cod_cliente).length+' vinculados ao SHOficina. Confirme as entregas manualmente no WhatsApp.');
  el('vcfFile').value='';
 }catch(e){info('Não foi possível concluir a importação: '+(e.message||e));console.error(e)}
 finally{el('vcfImport').disabled=false}
}
async function loadCampaign(){
 campaignId=el('vcfList').value||campaignId;
 if(!campaignId){campaignContacts=[];draw();return}
 let rows=[];
 for(let i=0;i<10000;i+=1000){
  const {data,error}=await db.from('crm_listas_transmissao_contatos').select('telefone,nome,cod_cliente,situacao').eq('lista_id',campaignId).order('nome').range(i,i+999);
  if(error){info('Erro ao carregar lista: '+error.message);return}
  rows.push(...(data||[]));if(!data||data.length<1000)break;
 }
 campaignContacts=rows;draw();
}
function draw(){
 const filter=el('vcfStatusFilter').value;
 const visible=campaignContacts.filter(c=>filter==='all'||c.situacao===filter);
 el('vcfCount').textContent=campaignContacts.length+' contatos · '+campaignContacts.filter(x=>x.situacao==='recebeu').length+' receberam · '+campaignContacts.filter(x=>x.situacao==='nao_recebeu').length+' não receberam';
 el('vcfContacts').innerHTML=visible.map(c=>'<div class="vcf-contact"><div><strong>'+esc(c.nome)+'</strong><div class="sub">+'+esc(c.telefone)+(c.cod_cliente?' · Cliente SHOficina':' · Não vinculado')+'</div></div><select class="vcf-status" data-phone="'+esc(c.telefone)+'" aria-label="Situação de '+esc(c.nome)+'">'+statuses.map(s=>'<option value="'+s+'"'+(s===c.situacao?' selected':'')+'>'+statusNames[s]+'</option>').join('')+'</select></div>').join('')||'<p class="note">Nenhum contato nesta situação.</p>';
 el('vcfContacts').querySelectorAll('select.vcf-status').forEach(select=>select.onchange=async()=>{
  if(!ready)return;
  const phone=select.dataset.phone,status=select.value;
  select.disabled=true;
  const {error}=await db.from('crm_listas_transmissao_contatos').update({situacao:status,atualizado_em:new Date().toISOString()}).eq('lista_id',campaignId).eq('telefone',phone);
  select.disabled=false;
  if(error){info('Não foi possível salvar: '+error.message);await loadCampaign();return}
  const c=campaignContacts.find(x=>x.telefone===phone);if(c)c.situacao=status;
  draw();
 });
}
document.addEventListener('DOMContentLoaded',()=>{
 el('vcfImport').onclick=importVCF;
 el('vcfList').onchange=()=>{campaignId=el('vcfList').value;loadCampaign()};
 el('vcfStatusFilter').onchange=draw;
 const check=async()=>{if(typeof ready!=='undefined'&&ready){await getLists();return}setTimeout(check,1200)};
 check();
});
})();
