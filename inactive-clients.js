/* FR Motors · Clientes inativos e recuperação · V4.4.79 */
(function(){
  'use strict';

  let ready=false;
  let rows=[];
  const selected=new Map();
  let serviceLoaded=false;

  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const dmy=v=>{
    if(!v)return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-BR');
  };
  const cleanPhone=v=>{
    let n=String(v??'').replace(/\D/g,'');
    if(!n)return '';
    if(n.startsWith('55')&&n.length>=12)return n;
    if(n.length===10||n.length===11)return '55'+n;
    return n;
  };
  const bestPhone=r=>cleanPhone(r.celular)||cleanPhone(r.telefone);

  function ensure(){
    if(ready)return true;
    if(typeof db==='undefined')return false;
    const maint=$('#maintenanceHistoryBtn');
    if(!maint)return false;

    const style=document.createElement('style');
    style.textContent=`
      .inactive-btn{white-space:nowrap}
      .inactive-modal-card{width:min(1120px,100%);max-height:min(91vh,900px);overflow:hidden;display:flex;flex-direction:column}
      .inactive-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--line,#dfe5e8)}
      .inactive-head h3{margin:0 0 4px}.inactive-head p{margin:0;color:var(--muted,#68777f);font-size:12px}
      .inactive-filters{padding:14px 20px;display:grid;grid-template-columns:1.05fr 1.05fr .75fr 1.25fr 1.25fr auto;gap:9px;align-items:end;border-bottom:1px solid #e8edef;background:#fafcfc}
      .inactive-field{display:grid;gap:5px;min-width:0}.inactive-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:#68777f;letter-spacing:.04em}
      .inactive-field input{min-width:0;width:100%;min-height:42px;padding:8px 10px;border:1px solid #d8e0e3;border-radius:11px;background:#fff}
      .inactive-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid #e8edef}
      .inactive-summary{margin-right:auto;color:#617078;font-size:12px;font-weight:750}
      .inactive-results{overflow:auto;padding:14px 20px 22px;background:#f6f8f9}
      .inactive-empty{padding:28px;text-align:center;color:#78868c;background:#fff;border:1px dashed #d7e0e3;border-radius:14px}
      .inactive-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;background:#fff;border:1px solid #dfe5e8;border-radius:15px;padding:13px;margin-bottom:10px;align-items:start}
      .inactive-card.selected{border-color:#167b87;box-shadow:0 0 0 2px rgba(22,123,135,.08)}
      .inactive-check{margin-top:5px;width:18px;height:18px}
      .inactive-title{font-weight:900;color:#172126}.inactive-sub{font-size:12px;color:#68777f;margin-top:2px}
      .inactive-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.inactive-chip{font-size:10px;font-weight:850;padding:4px 7px;border-radius:999px;background:#f0f4f5;color:#56666d;border:1px solid #e1e7e9}
      .inactive-contact{display:grid;gap:3px;margin-top:9px;font-size:12px;color:#4f6068}.inactive-contact strong{color:#172126}
      .inactive-services{margin-top:10px;border-top:1px solid #edf1f2;padding-top:8px}.inactive-services summary{cursor:pointer;font-size:11px;font-weight:900;color:#53636a}
      .inactive-services-list{display:grid;gap:5px;margin-top:7px}.inactive-service{font-size:11px;color:#56666d;padding:6px 8px;background:#f7f9fa;border-radius:8px}.inactive-service strong{color:#172126}
      .inactive-age{text-align:right;white-space:nowrap}.inactive-age strong{display:block;font-size:20px;color:#172126}.inactive-age span{font-size:10px;color:#68777f;font-weight:850;text-transform:uppercase}
      .inactive-wa-panel{display:none;padding:12px 20px;border-top:1px solid #dfe5e8;background:#fff}.inactive-wa-panel.show{display:grid;gap:8px}
      .inactive-wa-panel textarea{width:100%;min-height:82px;border:1px solid #d8e0e3;border-radius:11px;padding:9px 10px;resize:vertical}
      .inactive-wa-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      @media(max-width:800px){
        .inactive-filters{grid-template-columns:1fr 1fr}.inactive-filters .inactive-field:nth-child(4),.inactive-filters .inactive-field:nth-child(5){grid-column:1/-1}.inactive-filters>button{grid-column:1/-1;width:100%}
        .inactive-card{grid-template-columns:auto minmax(0,1fr)}.inactive-age{grid-column:2;text-align:left;display:flex;gap:5px;align-items:baseline}
      }
      @media(max-width:520px){.inactive-filters{grid-template-columns:1fr}.inactive-filters .inactive-field{grid-column:1!important}.inactive-toolbar .btn{flex:1}.inactive-results,.inactive-filters,.inactive-head,.inactive-toolbar,.inactive-wa-panel{padding-left:12px;padding-right:12px}}
      @media print{#inactiveClientsModal,.inactive-btn{display:none!important}}
    `;
    document.head.appendChild(style);

    const btn=document.createElement('button');
    btn.id='inactiveClientsBtn';
    btn.className='btn history-btn internal inactive-btn';
    btn.type='button';
    btn.textContent='Clientes inativos';
    btn.title='Encontrar clientes que não retornam há alguns meses';
    maint.insertAdjacentElement('afterend',btn);

    const modal=document.createElement('div');
    modal.className='modal-backdrop';
    modal.id='inactiveClientsModal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.innerHTML=`
      <div class="modal-card inactive-modal-card">
        <div class="inactive-head">
          <div><h3>Clientes inativos</h3><p>Encontre clientes sem retorno, filtre pela mão de obra e prepare contatos pelo WhatsApp.</p></div>
          <button class="btn" id="inactiveClose" type="button">Fechar</button>
        </div>
        <div class="inactive-filters">
          <div class="inactive-field"><label>Data-base</label><input id="inactiveDate" type="date"></div>
          <div class="inactive-field"><label>Considerar clientes desde</label><input id="inactiveMinDate" type="date"></div>
          <div class="inactive-field"><label>Sem retornar há</label><input id="inactiveMonths" type="number" min="1" max="120" value="6" placeholder="Meses"></div>
          <div class="inactive-field"><label>Mão de obra / serviço</label><input id="inactiveService" list="inactiveServiceList" placeholder="Ex.: troca de óleo"><datalist id="inactiveServiceList"></datalist></div>
          <div class="inactive-field"><label>Cliente, placa ou O.S.</label><input id="inactiveSearch" placeholder="Pesquisa opcional"></div>
          <button class="btn primary" id="inactiveSearchBtn" type="button">Pesquisar</button>
        </div>
        <div class="inactive-toolbar">
          <div class="inactive-summary" id="inactiveSummary">Defina os filtros e pesquise.</div>
          <button class="btn" id="inactiveSelectAll" type="button">Selecionar exibidos</button>
          <button class="btn" id="inactiveClear" type="button">Limpar seleção</button>
          <button class="btn primary" id="inactiveWhatsapp" type="button">WhatsApp (0)</button>
        </div>
        <div class="inactive-results" id="inactiveResults"><div class="inactive-empty">Nenhuma pesquisa realizada.</div></div>
        <div class="inactive-wa-panel" id="inactiveWaPanel">
          <strong>Mensagem para os selecionados</strong>
          <textarea id="inactiveWaText">Olá, {nome}! Tudo bem? Aqui é da FR Motors. Vimos que já faz um tempo desde a última manutenção do seu veículo {veiculo}. Se quiser, podemos verificar como estão os itens de manutenção e agendar uma avaliação.</textarea>
          <div class="inactive-wa-actions">
            <button class="btn" id="inactiveCopyPhones" type="button">Copiar contatos</button>
            <button class="btn primary" id="inactiveOpenNext" type="button">Abrir próximo no WhatsApp</button>
          </div>
          <div class="inactive-summary" id="inactiveWaStatus"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const today=new Date();
    $('#inactiveDate').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const savedMinDate=localStorage.getItem('frmotors-inactive-min-date')||'';
    $('#inactiveMinDate').value=savedMinDate;
    $('#inactiveMinDate').addEventListener('change',()=>{
      const value=$('#inactiveMinDate').value||'';
      if(value)localStorage.setItem('frmotors-inactive-min-date',value);
      else localStorage.removeItem('frmotors-inactive-min-date');
    });

    btn.onclick=open;
    $('#inactiveClose').onclick=close;
    $('#inactiveSearchBtn').onclick=search;
    $('#inactiveSearch').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
    $('#inactiveService').addEventListener('focus',loadServices,{once:false});
    $('#inactiveSelectAll').onclick=()=>{rows.forEach(r=>selected.set(String(r.cod_cliente),r));render();updateSelection()};
    $('#inactiveClear').onclick=()=>{selected.clear();render();updateSelection()};
    $('#inactiveWhatsapp').onclick=()=>{$('#inactiveWaPanel').classList.toggle('show');updateSelection()};
    $('#inactiveCopyPhones').onclick=copyPhones;
    $('#inactiveOpenNext').onclick=openNext;
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
    ready=true;
    return true;
  }

  function open(){
    if(!ensure())return;
    $('#inactiveClientsModal').classList.add('show');
    loadServices();
  }
  function close(){$('#inactiveClientsModal')?.classList.remove('show')}

  async function loadServices(){
    if(serviceLoaded)return;
    try{
      const {data,error}=await db.rpc('shoficina_servicos_catalogo',{p_search:null,p_limit:120});
      if(error)throw error;
      $('#inactiveServiceList').innerHTML=(data||[]).map(x=>'<option value="'+esc(x.descricao)+'">'+esc(x.ocorrencias)+' ocorrências</option>').join('');
      serviceLoaded=true;
    }catch(e){console.warn('Catálogo de serviços',e)}
  }

  async function search(){
    const summary=$('#inactiveSummary'),box=$('#inactiveResults');
    const date=$('#inactiveDate').value;
    const months=Math.max(1,Number($('#inactiveMonths').value)||6);
    const minDate=$('#inactiveMinDate').value||null;
    const service=$('#inactiveService').value.trim()||null;
    const term=$('#inactiveSearch').value.trim()||null;
    summary.textContent='Pesquisando...';
    box.innerHTML='<div class="inactive-empty">Consultando histórico de O.S. e serviços...</div>';

    try{
      const {data,error}=await db.rpc('shoficina_clientes_inativos_v2',{
        p_reference_date:date,
        p_months:months,
        p_min_last_visit:minDate,
        p_service:service,
        p_search:term,
        p_limit:400
      });
      if(error)throw error;
      rows=data||[];
      summary.textContent=rows.length+' cliente'+(rows.length===1?'':'s')+' encontrado'+(rows.length===1?'':'s')+
        (minDate?' · desde '+new Date(minDate+'T00:00:00').toLocaleDateString('pt-BR'):'')+
        (service?' · serviço: '+service:'');
      render();
    }catch(e){
      console.error(e);
      summary.textContent='Erro na consulta.';
      box.innerHTML='<div class="inactive-empty">Não foi possível consultar os clientes inativos.</div>';
    }
  }

  function render(){
    const box=$('#inactiveResults');
    if(!rows.length){box.innerHTML='<div class="inactive-empty">Nenhum cliente encontrado com esses filtros.</div>';return}
    box.innerHTML=rows.map(r=>{
      const id=String(r.cod_cliente),checked=selected.has(id);
      const phone=bestPhone(r);
      const services=Array.isArray(r.recent_services)?r.recent_services:[];
      const serviceHtml=services.length?services.map(s=>'<div class="inactive-service"><strong>'+esc(s.descricao||'Serviço')+'</strong> · O.S. '+esc(s.os)+' · '+esc(dmy(s.data))+'</div>').join(''):'<div class="inactive-service">Nenhuma mão de obra encontrada no recorte.</div>';
      return '<article class="inactive-card'+(checked?' selected':'')+'" data-client="'+esc(id)+'">'+
        '<input class="inactive-check" type="checkbox" '+(checked?'checked':'')+' aria-label="Selecionar cliente">'+
        '<div>'+
          '<div class="inactive-title">'+esc(r.cliente||'Cliente sem nome')+'</div>'+
          '<div class="inactive-sub">Última O.S. '+esc(r.last_os_id)+' · '+esc(dmy(r.last_visit))+' · '+esc(r.placa||'sem placa')+' · '+esc(r.veiculo||'veículo não informado')+'</div>'+
          '<div class="inactive-chips"><span class="inactive-chip">'+esc(r.os_count)+' O.S.</span><span class="inactive-chip">KM '+esc(r.km??'—')+'</span><span class="inactive-chip">'+esc(r.matching_service_count)+' serviço(s) no histórico</span></div>'+
          '<div class="inactive-contact"><div>Celular: <strong>'+esc(r.celular||'—')+'</strong> · Telefone: <strong>'+esc(r.telefone||'—')+'</strong></div><div>E-mail: <strong>'+esc(r.email||'—')+'</strong>'+(r.cidade?' · '+esc(r.cidade)+(r.uf?'/'+esc(r.uf):''):'')+'</div></div>'+
          '<details class="inactive-services"><summary>Ver serviços já efetuados</summary><div class="inactive-services-list">'+serviceHtml+'</div></details>'+
        '</div>'+
        '<div class="inactive-age"><strong>'+esc(r.months_inactive)+'</strong><span>meses sem retorno</span></div>'+
      '</article>'
    }).join('');

    box.querySelectorAll('.inactive-card').forEach(card=>{
      const id=card.dataset.client;
      const input=card.querySelector('.inactive-check');
      input.onchange=()=>{
        const r=rows.find(x=>String(x.cod_cliente)===id);
        if(input.checked&&r)selected.set(id,r);else selected.delete(id);
        card.classList.toggle('selected',input.checked);
        updateSelection();
      };
    });
    updateSelection();
  }

  function updateSelection(){
    const valid=[...selected.values()].filter(r=>bestPhone(r));
    $('#inactiveWhatsapp').textContent='WhatsApp ('+selected.size+')';
    $('#inactiveWaStatus').textContent=selected.size
      ? selected.size+' selecionado(s) · '+valid.length+' com telefone/celular utilizável.'
      : 'Nenhum cliente selecionado.';
  }

  function buildMessage(r){
    return $('#inactiveWaText').value
      .replaceAll('{nome}',r.cliente||'')
      .replaceAll('{veiculo}',[r.veiculo,r.placa].filter(Boolean).join(' · ')||'veículo')
      .replaceAll('{placa}',r.placa||'')
      .replaceAll('{os}',String(r.last_os_id||''))
      .replaceAll('{meses}',String(r.months_inactive||''));
  }

  async function copyPhones(){
    const lines=[...selected.values()].map(r=>{
      const p=bestPhone(r);
      return p?(r.cliente||'Cliente')+';+'+p:'';
    }).filter(Boolean);
    if(!lines.length){$('#inactiveWaStatus').textContent='Nenhum selecionado tem telefone/celular utilizável.';return}
    try{await navigator.clipboard.writeText(lines.join('\n'));$('#inactiveWaStatus').textContent='Contatos copiados.'}
    catch(_){$('#inactiveWaStatus').textContent='Não foi possível copiar automaticamente.'}
  }

  function openNext(){
    const pending=[...selected.values()].filter(r=>bestPhone(r));
    if(!pending.length){$('#inactiveWaStatus').textContent='Nenhum contato selecionado disponível.';return}
    const r=pending[0],phone=bestPhone(r),message=buildMessage(r);
    window.open('https://wa.me/'+encodeURIComponent(phone)+'?text='+encodeURIComponent(message),'_blank','noopener');
    selected.delete(String(r.cod_cliente));
    const current=rows.find(x=>String(x.cod_cliente)===String(r.cod_cliente));
    render();
    $('#inactiveWaPanel').classList.add('show');
    $('#inactiveWaStatus').textContent='Conversa aberta para '+(r.cliente||phone)+'. Clique novamente para o próximo.';
  }

  function boot(){
    if(ensure())return;
    let tries=0;const t=setInterval(()=>{tries++;if(ensure()||tries>40)clearInterval(t)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();