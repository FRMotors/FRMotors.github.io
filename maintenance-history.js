/* FR Motors · Histórico de manutenção por O.S./placa/cliente · V4.4.76 */
(function(){
  'use strict';

  const MAX_OS = 120;
  let initialized = false;

  const qs = (sel, root=document) => root.querySelector(sel);
  const escHtml = value => String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

  function money(value){
    const n = Number(value) || 0;
    try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n)}
    catch(_){return 'R$ '+n.toFixed(2).replace('.',',')}
  }

  function dateLabel(value){
    if(!value) return 'Data não informada';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
  }

  function normalizeSearch(value){
    return String(value ?? '').trim().replace(/[,()]/g,' ');
  }

  function ensureUi(){
    if(initialized) return true;
    const historyBtn = qs('#historyBtn');
    if(!historyBtn || typeof db === 'undefined') return false;

    const style = document.createElement('style');
    style.id = 'maintenanceHistoryStyles';
    style.textContent = `
      .maintenance-history-btn{white-space:nowrap}
      .maintenance-modal-card{width:min(980px,100%);max-height:min(86vh,820px);overflow:hidden;display:flex;flex-direction:column}
      .maintenance-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line,#dfe5e8)}
      .maintenance-modal-head h3{margin:0 0 4px}.maintenance-modal-head p{margin:0;color:var(--muted,#68777f);font-size:12px}
      .maintenance-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:14px 20px;border-bottom:1px solid #edf1f2}
      .maintenance-search input{width:100%;min-height:42px;border:1px solid var(--line,#dfe5e8);border-radius:11px;padding:9px 11px;background:#fff;color:var(--ink,#172126)}
      .maintenance-summary{padding:10px 20px;color:var(--muted,#68777f);font-size:12px;border-bottom:1px solid #edf1f2}
      .maintenance-body{padding:14px 20px 20px;overflow:auto;background:#f7f9fa}
      .maintenance-empty{padding:28px 12px;text-align:center;color:var(--muted,#68777f);background:#fff;border:1px dashed var(--line,#dfe5e8);border-radius:14px}
      .maintenance-os{background:#fff;border:1px solid var(--line,#dfe5e8);border-radius:15px;padding:14px;margin-bottom:12px;box-shadow:0 5px 16px rgba(23,33,38,.04)}
      .maintenance-os:last-child{margin-bottom:0}
      .maintenance-os-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .maintenance-os-title{font-weight:900;color:var(--ink,#172126)}
      .maintenance-os-sub{margin-top:3px;color:var(--muted,#68777f);font-size:12px}
      .maintenance-os-date{font-size:11px;font-weight:800;color:#53636a;background:#eef2f3;border-radius:999px;padding:5px 8px;white-space:nowrap}
      .maintenance-meta{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:11px}
      .maintenance-chip{display:inline-flex;align-items:center;min-height:27px;padding:4px 8px;border:1px solid #e1e7e9;border-radius:999px;background:#f8fafb;color:#53636a;font-size:11px;font-weight:800}
      .maintenance-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .maintenance-group{border:1px solid #e5eaec;border-radius:12px;overflow:hidden}
      .maintenance-group-title{padding:8px 10px;background:#f3f6f7;color:#53636a;font-size:10px;font-weight:900;text-transform:uppercase}
      .maintenance-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 10px;border-top:1px solid #edf1f2;font-size:12px;align-items:start}
      .maintenance-item:first-of-type{border-top:0}
      .maintenance-item strong{font-size:12px;color:#172126}.maintenance-item span{color:#68777f;font-size:11px}
      .maintenance-item-value{font-weight:900;color:#172126;white-space:nowrap;text-align:right}
      .maintenance-group-empty{padding:12px 10px;color:#88959b;font-size:12px}
      .maintenance-totals{display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #edf1f2;color:#53636a;font-size:11px;font-weight:800}
      .maintenance-totals strong{color:#172126}
      @media(max-width:700px){
        .maintenance-modal-card{max-height:90vh;border-radius:14px}
        .maintenance-modal-head,.maintenance-search,.maintenance-summary,.maintenance-body{padding-left:13px;padding-right:13px}
        .maintenance-search{grid-template-columns:1fr}
        .maintenance-search .btn{width:100%}
        .maintenance-groups{grid-template-columns:1fr}
        .maintenance-os-head{display:block}
        .maintenance-os-date{display:inline-flex;margin-top:7px}
      }
      @media print{#maintenanceHistoryModal,.maintenance-history-btn{display:none!important}}
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.className = 'btn history-btn internal maintenance-history-btn';
    btn.id = 'maintenanceHistoryBtn';
    btn.type = 'button';
    btn.textContent = 'Manutenções';
    btn.title = 'Consultar histórico de manutenção por placa ou cliente';
    historyBtn.insertAdjacentElement('afterend', btn);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'maintenanceHistoryModal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','maintenanceHistoryTitle');
    modal.innerHTML = `
      <div class="modal-card maintenance-modal-card">
        <div class="maintenance-modal-head">
          <div>
            <h3 id="maintenanceHistoryTitle">Histórico de manutenção</h3>
            <p>Pesquise pela placa, pelo nome do cliente ou pelo número da O.S. para ver peças e serviços já registrados.</p>
          </div>
          <button class="btn" id="maintenanceHistoryCloseBtn" type="button">Fechar</button>
        </div>
        <div class="maintenance-search">
          <input id="maintenanceHistorySearch" placeholder="Ex.: 9953, EUU4F32 ou EASYCAR VEÍCULOS" autocomplete="off">
          <button class="btn primary" id="maintenanceHistorySearchBtn" type="button">Buscar</button>
        </div>
        <div id="maintenanceHistorySummary" class="maintenance-summary">Digite uma O.S., placa ou cliente.</div>
        <div id="maintenanceHistoryBody" class="maintenance-body">
          <div class="maintenance-empty">Nenhuma consulta realizada ainda.</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    btn.addEventListener('click', openHistory);
    qs('#maintenanceHistoryCloseBtn').addEventListener('click', closeHistory);
    qs('#maintenanceHistorySearchBtn').addEventListener('click', searchHistory);
    qs('#maintenanceHistorySearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchHistory()});
    modal.addEventListener('click',e=>{if(e.target===modal)closeHistory()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('show'))closeHistory()});

    initialized = true;
    return true;
  }

  function currentSuggestion(){
    return qs('#plate')?.value?.trim() || qs('#client')?.value?.trim() || '';
  }

  function openHistory(){
    if(!ensureUi()) return;
    const modal = qs('#maintenanceHistoryModal');
    const input = qs('#maintenanceHistorySearch');
    const suggestion = currentSuggestion();
    modal.classList.add('show');
    if(suggestion && !input.value.trim()) input.value = suggestion;
    setTimeout(()=>input.focus(),50);
    if(suggestion) searchHistory();
  }

  function closeHistory(){qs('#maintenanceHistoryModal')?.classList.remove('show')}

  async function fetchItemsChunked(table,ids,columns){
    const all=[];
    for(let i=0;i<ids.length;i+=60){
      const chunk=ids.slice(i,i+60);
      const {data,error}=await db.from(table).select(columns).in('source_os_id',chunk).order('source_line_id',{ascending:true});
      if(error) throw error;
      if(data?.length) all.push(...data);
    }
    return all;
  }

  async function searchHistory(){
    if(!ensureUi()) return;
    const input=qs('#maintenanceHistorySearch');
    const summary=qs('#maintenanceHistorySummary');
    const body=qs('#maintenanceHistoryBody');
    const q=normalizeSearch(input.value);

    if(q.length<2){
      summary.textContent='Digite pelo menos 2 caracteres.';
      body.innerHTML='<div class="maintenance-empty">Informe o número da O.S., uma placa ou o nome do cliente para pesquisar.</div>';
      return;
    }

    summary.textContent='Buscando histórico...';
    body.innerHTML='<div class="maintenance-empty">Consultando O.S., peças e serviços...</div>';

    try{
      let query=db.from('shoficina_os')
        .select('source_os_id,cliente,entrada,marca,modelo,kilomet,placa,serie,patrimonio,aparelho')
        .order('source_os_id',{ascending:false}).limit(MAX_OS);

      const compact=q.replace(/[-\s]/g,'').toUpperCase();
      const isOs=/^\d+$/.test(q);
      const plateLike=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(compact)||/^[A-Z]{3}[0-9]{4}$/.test(compact);
      if(isOs) query=query.eq('source_os_id',Number(q));
      else if(plateLike) query=query.ilike('placa','%'+compact+'%');
      else query=query.or('cliente.ilike.%'+q+'%,placa.ilike.%'+q+'%');

      const {data:osRows,error:osError}=await query;
      if(osError) throw osError;
      const rows=osRows||[];

      if(!rows.length){
        summary.textContent='Nenhuma O.S. encontrada para “'+q+'”.';
        body.innerHTML='<div class="maintenance-empty">Não encontrei histórico com essa placa ou cliente.</div>';
        return;
      }

      const ids=rows.map(r=>r.source_os_id);
      const [parts,services]=await Promise.all([
        fetchItemsChunked('shoficina_pecas',ids,'source_line_id,source_os_id,descricao,qtd,custo,valor,dia'),
        fetchItemsChunked('shoficina_servicos',ids,'source_line_id,source_os_id,descricao,qtd,total,custo,inicio,fim')
      ]);

      const partsByOs=new Map(),servicesByOs=new Map();
      parts.forEach(item=>{const k=String(item.source_os_id);if(!partsByOs.has(k))partsByOs.set(k,[]);partsByOs.get(k).push(item)});
      services.forEach(item=>{const k=String(item.source_os_id);if(!servicesByOs.has(k))servicesByOs.set(k,[]);servicesByOs.get(k).push(item)});

      const clients=new Set(rows.map(r=>r.cliente).filter(Boolean));
      const plates=new Set(rows.map(r=>r.placa).filter(Boolean));
      summary.textContent=rows.length+' O.S. encontrada'+(rows.length===1?'':'s')+
        (rows.length>=MAX_OS?' · exibindo as '+MAX_OS+' mais recentes':'')+
        ' · '+clients.size+' cliente'+(clients.size===1?'':'s')+
        ' · '+plates.size+' placa'+(plates.size===1?'':'s');

      body.innerHTML=rows.map(row=>renderOs(row,partsByOs.get(String(row.source_os_id))||[],servicesByOs.get(String(row.source_os_id))||[])).join('');
    }catch(error){
      console.error('Histórico de manutenção:',error);
      summary.textContent='Erro ao consultar histórico.';
      body.innerHTML='<div class="maintenance-empty">Não foi possível carregar o histórico de manutenção. Tente novamente.</div>';
    }
  }

  function renderOs(row,parts,services){
    const vehicle=[row.marca,row.aparelho].filter(Boolean).join(' ')||'Veículo não informado';
    const plate=row.placa||'sem placa';
    const client=row.cliente||'Cliente não informado';
    const partsTotal=parts.reduce((sum,p)=>sum+(Number(p.qtd)||1)*(Number(p.valor)||0),0);
    const servicesTotal=services.reduce((sum,s)=>sum+(Number(s.total)||0),0);
    const total=partsTotal+servicesTotal;

    const partsHtml=parts.length?parts.map(p=>{
      const qty=Number(p.qtd)||1,unit=Number(p.valor)||0;
      return `<div class="maintenance-item"><div><strong>${escHtml(p.descricao||'Peça')}</strong><br><span>${escHtml(qty)}x${p.dia?' · '+escHtml(dateLabel(p.dia)):''}</span></div><div class="maintenance-item-value">${escHtml(money(qty*unit))}</div></div>`
    }).join(''):'<div class="maintenance-group-empty">Nenhuma peça registrada.</div>';

    const servicesHtml=services.length?services.map(s=>{
      const qty=Number(s.qtd)||1,totalValue=Number(s.total)||0;
      return `<div class="maintenance-item"><div><strong>${escHtml(s.descricao||'Serviço')}</strong><br><span>${escHtml(qty)}x${s.inicio?' · '+escHtml(dateLabel(s.inicio)):''}</span></div><div class="maintenance-item-value">${escHtml(money(totalValue))}</div></div>`
    }).join(''):'<div class="maintenance-group-empty">Nenhum serviço registrado.</div>';

    return `
      <article class="maintenance-os">
        <div class="maintenance-os-head">
          <div><div class="maintenance-os-title">O.S. ${escHtml(row.source_os_id)} · ${escHtml(plate)}</div><div class="maintenance-os-sub">${escHtml(client)} · ${escHtml(vehicle)}</div></div>
          <div class="maintenance-os-date">${escHtml(dateLabel(row.entrada))}</div>
        </div>
        <div class="maintenance-meta">
          <span class="maintenance-chip">KM: ${escHtml(row.kilomet??'—')}</span>
          <span class="maintenance-chip">${parts.length} peça${parts.length===1?'':'s'}</span>
          <span class="maintenance-chip">${services.length} serviço${services.length===1?'':'s'}</span>
        </div>
        <div class="maintenance-groups">
          <div class="maintenance-group"><div class="maintenance-group-title">Peças / materiais</div>${partsHtml}</div>
          <div class="maintenance-group"><div class="maintenance-group-title">Serviços / mão de obra</div>${servicesHtml}</div>
        </div>
        <div class="maintenance-totals">
          <span>Peças: <strong>${escHtml(money(partsTotal))}</strong></span>
          <span>Serviços: <strong>${escHtml(money(servicesTotal))}</strong></span>
          <span>Total registrado: <strong>${escHtml(money(total))}</strong></span>
        </div>
      </article>`
  }

  function boot(){
    if(ensureUi()) return;
    let attempts=0;
    const timer=setInterval(()=>{attempts++;if(ensureUi()||attempts>30)clearInterval(timer)},100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();