/* FR Motors · Clientes inativos e recuperação · V4.5.14 */
(function(){
  'use strict';

  let ready=false;
  let rows=[];
  const selected=new Map();
  let serviceLoaded=false;
  let serviceCatalog=[];
  const selectedServices=[];
  const defaultWhatsappTemplate='Olá! Tudo bem? Aqui é da FR Motors. Passando para lembrar que já faz um tempinho desde sua última visita à nossa oficina. Se quiser, podemos fazer uma avaliação e conferir como está a manutenção do seu veículo. Estamos à disposição! 🔧';
  let whatsappTemplate=defaultWhatsappTemplate;
  let previewClientId=null;

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
  const hasNumber=r=>Boolean(bestPhone(r));

  function ensure(){
    if(ready)return true;
    if(typeof db==='undefined')return false;
    const maint=$('#maintenanceHistoryBtn');
    if(!maint)return false;

    const style=document.createElement('style');
    style.textContent=`
      .inactive-btn{white-space:nowrap}
      body.inactive-modal-open{overflow:hidden!important}
      #inactiveClientsModal.modal-backdrop{
        display:none;
        position:fixed;
        inset:0;
        width:100vw;
        height:100dvh;
        max-height:none;
        box-sizing:border-box;
        padding:20px 20px 60px;
        overflow-y:scroll!important;
        overflow-x:hidden!important;
        overscroll-behavior:contain;
        touch-action:pan-y;
        align-items:initial!important;
        justify-content:initial!important;
        scrollbar-gutter:stable;
        -webkit-overflow-scrolling:touch;
      }
      #inactiveClientsModal.modal-backdrop.show{display:block!important}
      #inactiveClientsModal::-webkit-scrollbar{width:10px}
      #inactiveClientsModal::-webkit-scrollbar-thumb{background:#8f9da3;border-radius:999px}
      #inactiveClientsModal::-webkit-scrollbar-track{background:rgba(255,255,255,.12)}
      #inactiveClientsModal .inactive-modal-card{
        width:min(1120px,100%)!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        overflow:visible!important;
        display:block!important;
        margin:0 auto!important;
        box-sizing:border-box;
      }
      .inactive-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--line,#dfe5e8)}
      .inactive-head h3{margin:0 0 4px}.inactive-head p{margin:0;color:var(--muted,#68777f);font-size:12px}
      #inactiveClientsModal .btn{
        background:#fff!important;
        color:#172126!important;
        border:1px solid #d7e0e3!important;
        box-shadow:none!important;
      }
      #inactiveClientsModal .btn:hover,
      #inactiveClientsModal .btn:focus{
        background:#f4f7f8!important;
        border-color:#bcc9cd!important;
        color:#172126!important;
        outline:none;
      }
      #inactiveClientsModal .btn:active{
        background:#eaf0f2!important;
      }
      #inactiveClientsModal #inactiveSearchBtn{
        background:#172126!important;
        color:#fff!important;
        border-color:#172126!important;
      }
      #inactiveClientsModal #inactiveSearchBtn:hover,
      #inactiveClientsModal #inactiveSearchBtn:focus{
        background:#26363d!important;
        color:#fff!important;
        border-color:#26363d!important;
      }
      #inactiveClientsModal #inactiveSearchBtn:active{
        background:#0f171b!important;
        color:#fff!important;
      }
      .inactive-filters{padding:14px 20px;display:grid;grid-template-columns:1.05fr 1.05fr .75fr 1.25fr 1.25fr auto;gap:9px;align-items:end;border-bottom:1px solid #e8edef;background:#fafcfc;overflow:visible}
      .inactive-field{display:grid;gap:5px;min-width:0}.inactive-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:#68777f;letter-spacing:.04em}
      .inactive-field input{min-width:0;width:100%;min-height:42px;padding:8px 10px;border:1px solid #d8e0e3;border-radius:11px;background:#fff}
      .inactive-service-field{position:relative}
      .inactive-service-control{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:stretch;position:relative}
      .inactive-service-control input{border-radius:11px 0 0 11px!important;border-right:0!important}
      .inactive-service-toggle{border:1px solid #d8e0e3;border-left:0;background:#fff;border-radius:0 11px 11px 0;color:#53636a;font-size:16px;font-weight:900;cursor:pointer;min-height:42px}
      .inactive-service-toggle:hover,.inactive-service-toggle:focus{background:#f3f7f8;outline:none}
      .inactive-service-menu{display:none;position:absolute;z-index:30;left:0;right:0;top:calc(100% + 5px);max-height:360px;overflow-y:auto;background:#fff;border:1px solid #d7e0e3;border-radius:12px;box-shadow:0 10px 24px rgba(23,33,38,.18);padding:5px}
      .inactive-service-menu.show{display:block}
      .inactive-service-choice{width:100%;border:0;background:#fff;text-align:left;padding:10px;border-radius:9px;font-size:12px;font-weight:800;color:#172126;display:grid;gap:2px}
      .inactive-service-choice small{font-size:10px;font-weight:600;color:#7a898f}
      .inactive-service-choice:hover,.inactive-service-choice:focus{background:#f0f5f6;outline:none}
      .inactive-service-choice.is-selected{background:#e8f4f5;color:#126b74}
      .inactive-service-choice.is-selected::after{content:'✓';float:right;font-weight:950}
      .inactive-service-tags-row{
        grid-column:1/-1;
        display:none;
        align-items:center;
        gap:8px;
        min-width:0;
        padding-top:2px;
      }
      .inactive-service-tags-row.show{display:flex}
      .inactive-service-tags-label{
        flex:0 0 auto;
        font-size:9px;
        font-weight:900;
        text-transform:uppercase;
        color:#68777f;
        letter-spacing:.04em;
      }
      .inactive-service-tags{
        display:flex;
        gap:6px;
        flex-wrap:wrap;
        align-items:center;
        min-width:0;
        margin:0;
      }
      .inactive-service-tag{border:1px solid #cfe2e5;background:#fff;color:#1d6269;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:850;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .inactive-service-tag button{border:0;background:transparent;color:inherit;font-weight:950;padding:0;line-height:1;cursor:pointer}
      .inactive-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid #e8edef}
      .inactive-summary{margin-right:auto;color:#617078;font-size:12px;font-weight:750}
      .inactive-selected-count{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 10px;border-radius:10px;background:#eef4f5;border:1px solid #d7e2e5;color:#24464c;font-size:11px;font-weight:900;white-space:nowrap}
      .inactive-sort-wrap{display:inline-flex;align-items:center;gap:6px;width:fit-content;max-width:100%;flex:0 0 auto}
      .inactive-sort-wrap label{font-size:10px;font-weight:900;text-transform:uppercase;color:#68777f;white-space:nowrap}
      .inactive-sort-wrap select{width:max-content;max-width:100%;min-height:38px;border:1px solid #d8e0e3;border-radius:10px;background:#fff;padding:7px 30px 7px 9px;color:#26343a;font-weight:800;font-size:11px}
      .inactive-select-all-box{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 9px;border:1px solid #d8e0e3;border-radius:10px;background:#fff;color:#26343a;font-size:11px;font-weight:850;cursor:pointer;white-space:nowrap}
      .inactive-select-all-box input{width:18px;height:18px;margin:0;accent-color:#167b87}
      .inactive-pdf-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important}
      .inactive-select-group{display:inline-flex;align-items:center;gap:6px;flex-wrap:nowrap;width:fit-content;max-width:100%;flex:0 0 auto}
      .inactive-select-all-box{gap:7px;flex-wrap:nowrap}
      .inactive-select-scope{width:max-content;max-width:100%;min-height:38px;border:1px solid #d8e0e3;border-radius:10px;background:#fff;padding:7px 30px 7px 9px;color:#26343a;font-weight:800;font-size:11px}
      .inactive-alpha-letter{font-size:12px;font-weight:950;color:#53636a;padding:10px 4px 6px;letter-spacing:.05em;text-transform:uppercase}
      #inactiveClientsModal .inactive-head,
      #inactiveClientsModal .inactive-filters,
      #inactiveClientsModal .inactive-toolbar,
      #inactiveClientsModal .inactive-results,
      #inactiveClientsModal .inactive-wa-panel{
        position:static!important;
        height:auto!important;
        max-height:none!important;
        overflow:visible!important;
      }
      .inactive-results{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding:14px 20px 22px;background:#f6f8f9}
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
      .inactive-wa-panel{display:none;padding:14px 20px;border-top:1px solid #dfe5e8;border-bottom:1px solid #dfe5e8;background:#fff}.inactive-wa-panel.show{display:grid;gap:8px}
      .inactive-wa-panel textarea{width:100%;min-height:82px;border:1px solid #d8e0e3;border-radius:11px;padding:9px 10px;resize:vertical}
      .inactive-wa-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      @media(max-width:800px){
        #inactiveClientsModal.modal-backdrop{
          padding:9px 9px 44px!important;
          overflow-y:scroll!important;
          overflow-x:hidden!important;
        }
        #inactiveClientsModal .inactive-modal-card{
          width:min(100%,720px)!important;
          height:auto!important;
          max-height:none!important;
          overflow:visible!important;
        }
        .inactive-head{
          position:static;
          background:#fff;
        }
        .inactive-filters{
          grid-template-columns:1fr 1fr;
          max-height:none;
          overflow:visible;
        }
        .inactive-filters .inactive-field:nth-child(4),
        .inactive-filters .inactive-field:nth-child(5){grid-column:1/-1}
        .inactive-filters>button{grid-column:1/-1;width:100%}
        .inactive-toolbar{
          position:static;
          background:#fff;
        }
        .inactive-results{
          height:auto;
          min-height:0;
          max-height:none;
          overflow:visible;
          scrollbar-gutter:auto;
        }
        .inactive-card{
          grid-template-columns:auto minmax(0,1fr) auto;
          align-items:start;
          min-width:0;
        }
        .inactive-age{
          grid-column:auto;
          text-align:right;
          display:block;
        }
        .inactive-wa-panel,
        .inactive-wa-panel.show{
          max-height:none;
          overflow:visible;
        }
        .inactive-results,.inactive-filters,.inactive-toolbar{overflow:visible}
      }
      @media(max-width:520px){
        #inactiveClientsModal.modal-backdrop{
          padding:6px 6px 34px!important;
        }
        #inactiveClientsModal .inactive-modal-card{
          width:100%!important;
          height:auto!important;
          max-height:none!important;
          border-radius:16px;
          overflow:visible!important;
        }
        .inactive-head{
          align-items:center;
          padding-top:12px;
          padding-bottom:12px;
        }
        .inactive-head p{display:none}
        .inactive-filters{
          grid-template-columns:1fr;
          padding-top:10px;
          padding-bottom:10px;
        }
        .inactive-filters .inactive-field{grid-column:1!important}
        .inactive-service-tags-row{grid-column:1/-1;align-items:flex-start;flex-direction:column;gap:6px}
        .inactive-service-tags{width:100%;flex-wrap:wrap}
        .inactive-toolbar{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:7px;
        }
        .inactive-summary{
          grid-column:1/-1;
          margin-right:0;
        }
        .inactive-toolbar .btn{
          width:100%;
          min-width:0;
          padding-left:8px;
          padding-right:8px;
          font-size:11px;
        }
        .inactive-sort-wrap{grid-column:1/-1;width:fit-content;max-width:100%}
        .inactive-sort-wrap label{flex:0 0 auto}
        .inactive-sort-wrap select{width:max-content;max-width:calc(100vw - 120px);min-width:0}
        .inactive-select-group{grid-column:1/-1;width:fit-content;max-width:100%;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .inactive-selected-count{grid-column:1/-1;width:fit-content;max-width:100%;min-height:40px}
        .inactive-select-all-box{width:auto;justify-content:flex-start;min-height:42px}
        .inactive-select-scope{width:max-content;max-width:calc(100vw - 36px);min-width:0;min-height:42px}
        #inactiveExportVcf{grid-column:1/-1;width:100%;justify-content:center}
        .inactive-pdf-btn{grid-column:1/-1;width:100%;justify-content:center}
        #inactiveWhatsapp{grid-column:1/-1}
        .inactive-results{
          height:auto;
          min-height:0;
          max-height:none;
          overflow:visible;
          padding-top:10px;
          padding-bottom:14px;
          border-top:1px solid #e3e8ea;
          border-bottom:1px solid #e3e8ea;
        }
        .inactive-card{
          gap:9px;
          padding:11px 10px;
          margin-bottom:8px;
          border-radius:12px;
        }
        .inactive-check{
          width:20px;
          height:20px;
          margin-top:2px;
        }
        .inactive-title{font-size:13px}
        .inactive-sub{font-size:11px;line-height:1.4}
        .inactive-chips{gap:4px;margin-top:6px}
        .inactive-chip{font-size:9px;padding:3px 5px}
        .inactive-contact{font-size:11px;margin-top:7px}
        .inactive-services{margin-top:8px}
        .inactive-age strong{font-size:16px}
        .inactive-age span{font-size:8px}
        .inactive-results,
        .inactive-filters,
        .inactive-head,
        .inactive-toolbar,
        .inactive-wa-panel{padding-left:10px;padding-right:10px}
        .inactive-wa-panel{
          padding-top:14px;
          padding-bottom:22px;
        }
        .inactive-wa-panel textarea{
          min-height:150px;
          max-height:none;
        }
      }
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
    const crmLink=document.createElement('a');
    crmLink.href='./crm.html';
    crmLink.className='btn history-btn internal inactive-btn';
    crmLink.textContent='CRM · Recuperação';
    crmLink.title='Acompanhar contatos e recuperação de clientes';
    crmLink.style.cssText='display:inline-flex;align-items:center;justify-content:center;text-decoration:none';
    btn.insertAdjacentElement('afterend',crmLink);

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
          <div class="inactive-field"><label>Última visita até</label><input id="inactiveMinDate" type="date"></div>
          <div class="inactive-field"><label>Sem retornar há</label><input id="inactiveMonths" type="number" min="1" max="120" value="6" placeholder="Meses"></div>
          <div class="inactive-field inactive-service-field">
            <label for="inactiveService">Mão de obra / serviço</label>
            <div class="inactive-service-control">
              <input id="inactiveService" placeholder="Digite ou selecione várias opções" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inactiveServiceMenu">
              <button id="inactiveServiceToggle" class="inactive-service-toggle" type="button" aria-label="Abrir lista de serviços" aria-expanded="false">▾</button>
            </div>
            <div id="inactiveServiceMenu" class="inactive-service-menu" role="listbox" aria-multiselectable="true"></div>
          </div>
          <div class="inactive-field"><label>Cliente, placa ou O.S.</label><input id="inactiveSearch" placeholder="Pesquisa opcional"></div>
          <button class="btn primary" id="inactiveSearchBtn" type="button">Pesquisar</button>
          <div class="inactive-service-tags-row" id="inactiveServiceTagsRow">
            <span class="inactive-service-tags-label">Selecionados</span>
            <div id="inactiveServiceTags" class="inactive-service-tags"></div>
          </div>
        </div>
        <div class="inactive-toolbar">
          <div class="inactive-summary" id="inactiveSummary">Defina os filtros e pesquise.</div>
          <div class="inactive-sort-wrap">
            <label for="inactiveSort">Ordenar</label>
            <select id="inactiveSort">
              <option value="inactive">Mais tempo sem retornar</option>
              <option value="az">Nome A-Z</option>
              <option value="za">Nome Z-A</option>
            </select>
          </div>
          <div class="inactive-select-group">
            <label class="inactive-select-all-box" for="inactiveSelectAllCheck">
              <input id="inactiveSelectAllCheck" type="checkbox">
              <span>Selecionar grupo</span>
            </label>
            <select id="inactiveSelectScope" class="inactive-select-scope" aria-label="Grupo de clientes para selecionar">
              <option value="all">Todos os clientes</option>
              <option value="with-mobile">Apenas com número</option>
              <option value="without-mobile">Apenas sem número</option>
            </select>
          </div>
          <div class="inactive-selected-count" id="inactiveSelectedCount">0 selecionados</div>
          <button class="btn" id="inactiveSelectAll" type="button">Selecionar exibidos</button>
          <button class="btn" id="inactiveClear" type="button">Limpar seleção</button>
          <button class="btn" id="inactiveExportVcf" type="button">Exportar .VCF</button>
          <button class="btn primary inactive-pdf-btn" id="inactiveExportPdf" type="button">Exportar PDF</button>
          <button class="btn primary" id="inactiveWhatsapp" type="button">WhatsApp (0)</button>
        </div>
        <div class="inactive-wa-panel" id="inactiveWaPanel">
          <strong>Mensagem para os clientes selecionados</strong>
          <textarea id="inactiveWaText">${defaultWhatsappTemplate}</textarea>
          <div class="inactive-summary">Mensagem geral para os clientes selecionados. Você pode editar antes de abrir o WhatsApp.</div>
          <div class="inactive-wa-actions">
            <button class="btn" id="inactiveRestoreTemplate" type="button">Restaurar mensagem</button>
            <button class="btn" id="inactiveCopyPhones" type="button">Copiar contatos</button>
            <button class="btn primary" id="inactiveOpenNext" type="button">Abrir próximo no WhatsApp</button>
          </div>
          <div class="inactive-summary" id="inactiveWaStatus"></div>
        </div>
        <div class="inactive-results" id="inactiveResults"><div class="inactive-empty">Nenhuma pesquisa realizada.</div></div>
      </div>`;
    document.body.appendChild(modal);

    const today=new Date();
    $('#inactiveDate').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const savedMinDate=localStorage.getItem('frmotors-inactive-last-visit-until')||'';
    $('#inactiveMinDate').value=savedMinDate;
    $('#inactiveMinDate').addEventListener('change',()=>{
      const value=$('#inactiveMinDate').value||'';
      if(value)localStorage.setItem('frmotors-inactive-last-visit-until',value);
      else localStorage.removeItem('frmotors-inactive-last-visit-until');
    });
    const savedSort=localStorage.getItem('frmotors-inactive-sort')||'inactive';
    $('#inactiveSort').value=['inactive','az','za'].includes(savedSort)?savedSort:'inactive';
    $('#inactiveSort').addEventListener('change',()=>{
      localStorage.setItem('frmotors-inactive-sort',$('#inactiveSort').value);
      render();
    });

    btn.onclick=open;
    $('#inactiveClose').onclick=close;
    $('#inactiveSearchBtn').onclick=search;
    $('#inactiveSearch').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
    $('#inactiveService').addEventListener('focus',async()=>{
      await loadServices();
      showServiceMenu(false);
    });
    $('#inactiveService').addEventListener('input',()=>showServiceMenu(false));
    $('#inactiveServiceToggle').addEventListener('click',async e=>{
      e.preventDefault();
      e.stopPropagation();
      await loadServices();
      const menu=$('#inactiveServiceMenu');
      if(menu.classList.contains('show'))hideServiceMenu();
      else showServiceMenu(true);
    });
    $('#inactiveSelectAll').onclick=()=>{rows.forEach(r=>selected.set(String(r.cod_cliente),r));render();updateSelection()};
    $('#inactiveSelectAllCheck').addEventListener('change',e=>{
      const scope=$('#inactiveSelectScope')?.value||'all';
      const inScope=r=>scope==='with-mobile'
        ? hasNumber(r)
        : scope==='without-mobile'
          ? !hasNumber(r)
          : true;

      if(e.target.checked){
        // A seleção por grupo é exclusiva: evita misturar o grupo anterior no PDF.
        rows.forEach(r=>selected.delete(String(r.cod_cliente)));
        rows.filter(inScope).forEach(r=>selected.set(String(r.cod_cliente),r));
      }else{
        rows.filter(inScope).forEach(r=>selected.delete(String(r.cod_cliente)));
      }
      render();
      updateSelection();
    });
    $('#inactiveSelectScope').addEventListener('change',()=>{
      // Trocar o grupo limpa a seleção exibida para o próximo clique ser inequívoco.
      rows.forEach(r=>selected.delete(String(r.cod_cliente)));
      const check=$('#inactiveSelectAllCheck');
      if(check){check.checked=false;check.indeterminate=false;}
      render();
      updateSelection();
    });
    $('#inactiveClear').onclick=()=>{selected.clear();render();updateSelection()};
    $('#inactiveExportVcf').onclick=exportSelectedVcf;
    $('#inactiveExportPdf').onclick=exportSelectedPdf;
    $('#inactiveWhatsapp').onclick=()=>{
      if(!selected.size){
        $('#inactiveWaPanel').classList.remove('show');
        $('#inactiveSummary').textContent='Selecione pelo menos um cliente para preparar a mensagem do WhatsApp.';
        return;
      }
      $('#inactiveWaPanel').classList.toggle('show');
      updateSelection();
      refreshWhatsappPreview();
      // O modal usa um unico scroll; o usuario continua rolando naturalmente ate a mensagem.
    };
    $('#inactiveCopyPhones').onclick=copyPhones;
    $('#inactiveRestoreTemplate').onclick=()=>{
      whatsappTemplate=defaultWhatsappTemplate;
      refreshWhatsappPreview();
      $('#inactiveWaStatus').textContent='Mensagem padrão restaurada.';
    };
    $('#inactiveOpenNext').onclick=openNext;
    modal.addEventListener('click',e=>{
      if(e.target===modal)close();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('show'))close()});
    ready=true;
    return true;
  }

  function open(){
    if(!ensure())return;
    document.body.classList.add('inactive-modal-open');
    const modal=$('#inactiveClientsModal');
    modal.classList.add('show');
    modal.scrollTop=0;
    loadServices();
  }
  function close(){
    hideServiceMenu();
    $('#inactiveClientsModal')?.classList.remove('show');
    document.body.classList.remove('inactive-modal-open');
  }

  function hideServiceMenu(){
    $('#inactiveServiceMenu')?.classList.remove('show');
    $('#inactiveService')?.setAttribute('aria-expanded','false');
    $('#inactiveServiceToggle')?.setAttribute('aria-expanded','false');
  }

  function renderServiceTags(){
    const box=$('#inactiveServiceTags');
    const row=$('#inactiveServiceTagsRow');
    if(!box)return;
    if(row)row.classList.toggle('show',selectedServices.length>0);
    box.innerHTML=selectedServices.map((service,index)=>
      '<span class="inactive-service-tag">'+esc(service)+
      '<button type="button" data-remove-service="'+index+'" aria-label="Remover '+esc(service)+'">×</button></span>'
    ).join('');
    box.querySelectorAll('[data-remove-service]').forEach(btn=>btn.addEventListener('click',()=>{
      selectedServices.splice(Number(btn.dataset.removeService),1);
      renderServiceTags();
      if($('#inactiveServiceMenu')?.classList.contains('show'))showServiceMenu(false);
    }));
  }

  function toggleService(service){
    const value=String(service||'').trim();
    if(!value)return;
    const idx=selectedServices.findIndex(x=>x.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR'));
    if(idx>=0)selectedServices.splice(idx,1);
    else selectedServices.push(value);
    $('#inactiveService').value='';
    renderServiceTags();
  }

  function showServiceMenu(showAll=false){
    const box=$('#inactiveServiceMenu');
    const input=$('#inactiveService');
    if(!box||!input||!serviceCatalog.length)return;

    const q=showAll?'':input.value.trim().toLocaleLowerCase('pt-BR');
    const found=serviceCatalog
      .filter(x=>!q||String(x.descricao||'').toLocaleLowerCase('pt-BR').includes(q))
      .slice(0,60);

    box.innerHTML=found.map(x=>{
      const desc=String(x.descricao||'');
      const active=selectedServices.some(s=>s.toLocaleLowerCase('pt-BR')===desc.toLocaleLowerCase('pt-BR'));
      return '<button type="button" class="inactive-service-choice'+(active?' is-selected':'')+'" role="option" aria-selected="'+(active?'true':'false')+'">'+esc(desc)+'<small>'+esc(x.ocorrencias||0)+' ocorrências</small></button>';
    }).join('');

    box.querySelectorAll('.inactive-service-choice').forEach(b=>b.addEventListener('click',()=>{
      const service=b.firstChild?.textContent?.trim()||b.textContent?.trim()||'';
      toggleService(service);
      showServiceMenu(false);
      $('#inactiveService')?.focus();
    }));

    const open=found.length>0;
    box.classList.toggle('show',open);
    input.setAttribute('aria-expanded',open?'true':'false');
    $('#inactiveServiceToggle')?.setAttribute('aria-expanded',open?'true':'false');
  }

  async function loadServices(){
    if(serviceLoaded)return;
    try{
      const {data,error}=await db.rpc('shoficina_servicos_catalogo',{p_search:null,p_limit:200});
      if(error)throw error;
      serviceCatalog=data||[];
      serviceLoaded=true;
    }catch(e){console.warn('Catálogo de serviços',e)}
  }

  async function search(){
    const summary=$('#inactiveSummary'),box=$('#inactiveResults');
    const date=$('#inactiveDate').value;
    const months=Math.max(1,Number($('#inactiveMonths').value)||6);
    const minDate=$('#inactiveMinDate').value||null;
    const typedService=$('#inactiveService').value.trim();
    const services=[...selectedServices];
    if(typedService && !services.some(s=>s.toLocaleLowerCase('pt-BR')===typedService.toLocaleLowerCase('pt-BR')))services.push(typedService);
    const term=$('#inactiveSearch').value.trim()||null;
    summary.textContent='Pesquisando...';
    box.innerHTML='<div class="inactive-empty">Consultando histórico de O.S. e serviços...</div>';

    try{
      const {data,error}=await db.rpc('shoficina_clientes_inativos_v4',{
        p_reference_date:date,
        p_months:months,
        p_last_visit_until:minDate,
        p_services:services.length?services:null,
        p_search:term,
        p_limit:1500
      });
      if(error)throw error;
      // Cada nova pesquisa começa com uma seleção limpa.
      // Evita somar clientes de filtros/pesquisas anteriores ao contador atual.
      selected.clear();
      rows=data||[];
      summary.textContent=rows.length+' cliente'+(rows.length===1?'':'s')+' encontrado'+(rows.length===1?'':'s')+
        (minDate?' · última visita até '+new Date(minDate+'T00:00:00').toLocaleDateString('pt-BR'):'')+
        (services.length?' · serviços: '+services.join(' + '):'');
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

    const mode=$('#inactiveSort')?.value||'inactive';
    const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
    const displayRows=[...rows];

    if(mode==='az'){
      displayRows.sort((a,b)=>collator.compare(String(a.cliente||''),String(b.cliente||'')));
    }else if(mode==='za'){
      displayRows.sort((a,b)=>collator.compare(String(b.cliente||''),String(a.cliente||'')));
    }else{
      displayRows.sort((a,b)=>{
        const da=new Date(a.last_visit||0).getTime();
        const dbb=new Date(b.last_visit||0).getTime();
        return da-dbb || collator.compare(String(a.cliente||''),String(b.cliente||''));
      });
    }

    let lastLetter='';
    box.innerHTML=displayRows.map(r=>{
      const id=String(r.cod_cliente),checked=selected.has(id);
      const services=Array.isArray(r.recent_services)?r.recent_services:[];
      const serviceHtml=services.length?services.map(s=>'<div class="inactive-service"><strong>'+esc(s.descricao||'Serviço')+'</strong> · O.S. '+esc(s.os)+' · '+esc(dmy(s.data))+'</div>').join(''):'<div class="inactive-service">Nenhuma mão de obra encontrada no recorte.</div>';
      const name=String(r.cliente||'Cliente sem nome').trim();
      let letter='';
      if(mode==='az'||mode==='za'){
        const first=(name.charAt(0)||'#').toLocaleUpperCase('pt-BR');
        if(first!==lastLetter){
          lastLetter=first;
          letter='<div class="inactive-alpha-letter">'+esc(first)+'</div>';
        }
      }
      return letter+'<article class="inactive-card'+(checked?' selected':'')+'" data-client="'+esc(id)+'">'+
        '<input class="inactive-check" type="checkbox" '+(checked?'checked':'')+' aria-label="Selecionar cliente">'+
        '<div>'+
          '<div class="inactive-title">'+esc(name)+'</div>'+
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
    const selectedCount=$('#inactiveSelectedCount');
    if(selectedCount){
      selectedCount.textContent=selected.size+' selecionado'+(selected.size===1?'':'s');
    }
    $('#inactiveWaStatus').textContent=selected.size
      ? selected.size+' selecionado(s) · '+valid.length+' com telefone/celular utilizável.'
      : 'Nenhum cliente selecionado.';

    const allCheck=$('#inactiveSelectAllCheck');
    if(allCheck){
      const scope=$('#inactiveSelectScope')?.value||'all';
      const scopedRows=rows.filter(r=>scope==='with-mobile'
        ? hasNumber(r)
        : scope==='without-mobile'
          ? !hasNumber(r)
          : true);
      const selectedInScope=scopedRows.filter(r=>selected.has(String(r.cod_cliente))).length;
      allCheck.checked=scopedRows.length>0&&selectedInScope===scopedRows.length;
      allCheck.indeterminate=selectedInScope>0&&selectedInScope<scopedRows.length;
      allCheck.disabled=scopedRows.length===0;
    }

    if(!selected.size){
      $('#inactiveWaPanel')?.classList.remove('show');
    }
    refreshWhatsappPreview();
  }

  function vehicleName(r){
    const v=String(r?.veiculo||'').trim();
    return v || 'veículo';
  }

  function buildMessageFromTemplate(r,template=whatsappTemplate){
    return String(template||defaultWhatsappTemplate)
      .replaceAll('{nome}',r?.cliente||'')
      .replaceAll('{veiculo}',vehicleName(r))
      .replaceAll('{placa}',r?.placa||'')
      .replaceAll('{os}',String(r?.last_os_id||''))
      .replaceAll('{meses}',String(r?.months_inactive||''));
  }

  function refreshWhatsappPreview(){
    const area=$('#inactiveWaText');
    if(!area)return;
    const pending=[...selected.values()].filter(r=>bestPhone(r));
    const next=pending[0]||[...selected.values()][0]||null;

    if(!next){
      previewClientId=null;
      area.value=whatsappTemplate;
      return;
    }

    previewClientId=String(next.cod_cliente);
    area.value=buildMessageFromTemplate(next);
  }

  function buildMessage(r){
    // Se o campo exibido ainda corresponde ao cliente atual, respeita edições manuais
    // feitas especificamente para ele. Caso contrário, gera novamente pelo modelo.
    if(String(r?.cod_cliente)===String(previewClientId)){
      return $('#inactiveWaText').value;
    }
    return buildMessageFromTemplate(r);
  }

  function formatPhoneDisplay(value){
    let n=String(value??'').replace(/\D/g,'');
    if(n.startsWith('55')&&(n.length===12||n.length===13))n=n.slice(2);
    if(n.length===11)return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7);
    if(n.length===10)return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6);
    return String(value??'').trim()||'—';
  }

  function exportSelectedPdf(){
    const chosen=[...selected.values()];

    if(!chosen.length){
      const summary=$('#inactiveSummary');
      if(summary)summary.textContent='Selecione pelo menos um cliente para gerar o PDF.';
      return;
    }

    if(!window.jspdf?.jsPDF){
      const summary=$('#inactiveSummary');
      if(summary)summary.textContent='Não foi possível carregar o gerador de PDF neste navegador.';
      return;
    }

    const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
    const ordered=[...chosen].sort((a,b)=>collator.compare(String(a.cliente||''),String(b.cliente||'')));

    try{
      const {jsPDF}=window.jspdf;
      const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
      const now=new Date();
      const generated=now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const body=ordered.map((r,index)=>[
        String(index+1),
        'FRM - '+String(r.cliente||'Cliente sem nome').trim(),
        hasNumber(r)?formatPhoneDisplay(bestPhone(r)):'SEM NÚMERO',
        dmy(r.last_visit),
        String(r.last_os_id||'—'),
        String(r.veiculo||'—')
      ]);

      doc.setFont('helvetica','bold');
      doc.setFontSize(16);
      doc.text('FR Motors - Lista de clientes',14,16);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text('Clientes selecionados: '+ordered.length+' | Gerado em '+generated,14,22);

      if(typeof doc.autoTable!=='function'){
        throw new Error('Plugin AutoTable indisponível');
      }

      doc.autoTable({
        startY:27,
        head:[['#','Cliente','Contato','Última visita','O.S.','Veículo']],
        body,
        theme:'grid',
        styles:{font:'helvetica',fontSize:8,cellPadding:2.2,overflow:'linebreak',valign:'middle'},
        headStyles:{fontStyle:'bold',fillColor:[34,48,56],textColor:[255,255,255]},
        alternateRowStyles:{fillColor:[247,249,250]},
        columnStyles:{
          0:{cellWidth:8,halign:'center'},
          1:{cellWidth:60},
          2:{cellWidth:32},
          3:{cellWidth:25},
          4:{cellWidth:16,halign:'center'},
          5:{cellWidth:38}
        },
        margin:{left:10,right:10,bottom:14},
        didDrawPage:()=>{
          const page=doc.internal.getCurrentPageInfo().pageNumber;
          const total=doc.internal.getNumberOfPages();
          const h=doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text('FR Motors | Página '+page+' de '+total,14,h-6);
          doc.setTextColor(0);
        }
      });

      const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
      doc.save('FRM_clientes_selecionados_'+stamp+'.pdf');

      const summary=$('#inactiveSummary');
      if(summary)summary.textContent=ordered.length+' cliente'+(ordered.length===1?'':'s')+' exportado'+(ordered.length===1?'':'s')+' para PDF.';
    }catch(e){
      console.error('PDF clientes inativos',e);
      const summary=$('#inactiveSummary');
      if(summary)summary.textContent='Não foi possível gerar o PDF. Tente recarregar a página.';
    }
  }

  function vcfEscape(value){
    return String(value??'')
      .replace(/\\/g,'\\\\')
      .replace(/\r?\n/g,'\\n')
      .replace(/;/g,'\\;')
      .replace(/,/g,'\\,');
  }

  function exportSelectedVcf(){
    const byPhone=new Map();

    [...selected.values()].forEach(r=>{
      const phone=bestPhone(r);
      if(!phone)return;
      if(!byPhone.has(phone))byPhone.set(phone,r);
    });

    const contacts=[...byPhone.entries()];
    if(!contacts.length){
      const summary=$('#inactiveSummary');
      if(summary)summary.textContent='Selecione pelo menos um cliente com telefone ou celular para exportar.';
      return;
    }

    const cards=contacts.map(([phone,r])=>{
      const rawName=String(r.cliente||'Cliente').trim()||'Cliente';
      const displayName='FRM - '+rawName;
      const tel=phone.startsWith('+')?phone:'+'+phone;
      const lines=[
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:'+vcfEscape(displayName),
        'N:;'+vcfEscape(displayName)+';;;',
        'ORG:FR Motors',
        'TEL;TYPE=CELL:'+vcfEscape(tel)
      ];
      if(r.email)lines.push('EMAIL;TYPE=INTERNET:'+vcfEscape(r.email));
      lines.push('NOTE:'+vcfEscape('Cliente FR Motors · O.S. '+(r.last_os_id||'')));
      lines.push('END:VCARD');
      return lines.join('\r\n');
    }).join('\r\n');

    const blob=new Blob(['\ufeff'+cards+'\r\n'],{type:'text/vcard;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const now=new Date();
    const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    a.href=url;
    a.download='FRM_clientes_'+stamp+'.vcf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);

    const skipped=selected.size-contacts.length;
    const summary=$('#inactiveSummary');
    if(summary){
      summary.textContent=contacts.length+' contato'+(contacts.length===1?'':'s')+' exportado'+(contacts.length===1?'':'s')+' para .VCF'+
        (skipped>0?' · '+skipped+' ignorado'+(skipped===1?'':'s')+' por telefone ausente ou repetido':'')+'.';
    }
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
    render();
    $('#inactiveWaPanel').classList.add('show');
    refreshWhatsappPreview();
    const next=[...selected.values()].filter(x=>bestPhone(x))[0];
    $('#inactiveWaStatus').textContent='Conversa aberta para '+(r.cliente||phone)+
      (next?' · Próximo: '+(next.cliente||bestPhone(next))+'.':' · Fila concluída.');
  }

  function boot(){
    if(ensure())return;
    let tries=0;const t=setInterval(()=>{tries++;if(ensure()||tries>40)clearInterval(t)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();