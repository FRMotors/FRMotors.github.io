/* V4.4.48a */
let shoficinaPendingImport=null;
function shPart(p,o=null){return{id:o?.id||uuid(),name:p.descricao||'',qty:Number(p.qtd)||1,supplier:o?.supplier||'',cost:Number(p.custo)>0?Number(p.custo):(Number(o?.cost)||0),price:Number(p.valor)||0,origin:'SHOFICINA',sourceLineId:Number(p.source_line_id)}}
function shService(s,o=null){return{id:o?.id||uuid(),description:s.descricao||'',qty:1,value:Number(s.total)||0,origin:'SHOFICINA',sourceLineId:Number(s.source_line_id)}}
function shStats(cur,inc,type){
  const old=(cur||[]).filter(x=>x.origin==='SHOFICINA'),om=new Map(old.map(x=>[String(x.sourceLineId),x])),im=new Map((inc||[]).map(x=>[String(x.source_line_id),x]));
  let added=0,changed=0,removed=0; const changes=[];
  (inc||[]).forEach(r=>{const o=om.get(String(r.source_line_id)); if(!o){added++;changes.push('+ '+(r.descricao||'Item'));return}
    const d=type==='part'?(String(o.name||'')!==String(r.descricao||'')||Number(o.qty||1)!==(Number(r.qtd)||1)||Number(o.price||0)!==Number(r.valor||0)||(Number(r.custo)>0&&Number(o.cost||0)!==Number(r.custo))):(String(o.description||'')!==String(r.descricao||'')||Number(o.value||0)!==Number(r.total||0));
    if(d){changed++;changes.push('~ '+(r.descricao||(type==='part'?o.name:o.description)||'Item'))}
  });
  old.forEach(o=>{if(!im.has(String(o.sourceLineId))){removed++;changes.push('- '+(type==='part'?(o.name||'Peça'):(o.description||'Serviço')))}});
  return{added,changed,removed,changes};
}
function shDataDiff(f,r){
  if(!f)return['Nova O.S.'];
  const n={os:String(r.source_os_id||''),client:r.cliente||'',entryDate:shoficinaDateOnly(r.entrada),car:r.aparelho||'',brand:r.marca||'',km:r.kilomet==null?'':String(r.kilomet),plate:(r.placa||r.modelo||'').toUpperCase(),engine:r.patrimonio||''};
  const l={os:'O.S.',client:'Cliente',entryDate:'Data',car:'Veículo',brand:'Marca',km:'KM',plate:'Placa',engine:'Motor'};
  return Object.keys(n).filter(k=>String(f[k]??'')!==String(n[k]??'')).map(k=>l[k]);
}