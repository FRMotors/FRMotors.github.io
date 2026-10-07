/* FR Motors · Dashboard data/import */
const dashMoney=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dashMonths=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
let dashRows=[];

/* V4.4.54 · GRAFICO BRUTO X LIQUIDO */
function dEnsureRevenueChart(){
  if(document.getElementById('revenueChart')) return;

  const style=document.createElement('style');
  style.textContent=`
    .dash-chart-card{
      margin-top:16px;
      background:#fff;
      border:1px solid #dfe5e8;
      border-radius:16px;
      padding:16px;
      box-shadow:0 8px 22px rgba(23,33,38,.05);
    }
    .dash-chart-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      flex-wrap:wrap;
      margin-bottom:14px;
    }
    .dash-chart-title{
      font-size:15px;
      font-weight:900;
      color:#172126;
    }
    .dash-chart-subtitle{
      margin-top:3px;
      color:#68777f;
      font-size:12px;
    }
    .dash-chart-legend{
      display:flex;
      gap:14px;
      align-items:center;
      font-size:12px;
      font-weight:800;
      color:#415159;
    }
    .dash-chart-key{
      display:flex;
      align-items:center;
      gap:6px;
    }
    .dash-chart-dot{
      width:10px;
      height:10px;
      border-radius:3px;
      display:inline-block;
    }
    .dash-chart-dot.bruto{background:#172126;}
    .dash-chart-dot.liquido{background:#167b87;}
    .dash-chart-scroll{
      overflow-x:auto;
      padding-bottom:4px;
    }
    .dash-chart{
      min-width:760px;
      height:280px;
      display:grid;
      grid-template-columns:repeat(12,minmax(48px,1fr));
      gap:10px;
      align-items:end;
      padding:12px 4px 0;
      border-bottom:1px solid #dfe5e8;
      background:
        linear-gradient(to top, rgba(223,229,232,.55) 1px, transparent 1px);
      background-size:100% 25%;
    }
    .dash-chart-month{
      height:250px;
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:center;
      gap:6px;
    }
    .dash-chart-bars{
      width:100%;
      height:218px;
      display:flex;
      align-items:flex-end;
      justify-content:center;
      gap:4px;
    }
    .dash-chart-bar{
      width:min(19px,42%);
      min-height:0;
      border-radius:5px 5px 2px 2px;
      transition:height .25s ease;
      cursor:default;
    }
    .dash-chart-bar.bruto{background:#172126;}
    .dash-chart-bar.liquido{background:#167b87;}
    .dash-chart-label{
      font-size:10px;
      font-weight:800;
      color:#68777f;
      text-transform:uppercase;
      white-space:nowrap;
    }
    @media(max-width:700px){
      .dash-chart-card{padding:13px;}
      .dash-chart{min-width:720px;}
    }
  `;
  document.head.appendChild(style);

  const card=document.createElement('section');
  card.className='dash-chart-card';
  card.innerHTML=`
    <div class="dash-chart-head">
      <div>
        <div class="dash-chart-title">Bruto x Líquido por mês</div>
        <div class="dash-chart-subtitle">Comparação mensal conforme o filtro selecionado</div>
      </div>
      <div class="dash-chart-legend">
        <span class="dash-chart-key"><i class="dash-chart-dot bruto"></i>Bruto</span>
        <span class="dash-chart-key"><i class="dash-chart-dot liquido"></i>Líquido</span>
      </div>
    </div>
    <div class="dash-chart-scroll">
      <div id="revenueChart" class="dash-chart"></div>
    </div>
  `;

  const kpis=document.querySelector('.kpis');
  if(kpis) kpis.insertAdjacentElement('afterend',card);
}

function dRenderRevenueChart(rows){
  dEnsureRevenueChart();
  const chart=document.getElementById('revenueChart');
  if(!chart) return;

  const monthly=dashMonths.map(m=>{
    const rs=rows.filter(r=>dNorm(r.mes)===dNorm(m));
    return {
      month:m,
      bruto:rs.reduce((a,r)=>a+dNum(r.bruto),0),
      liquido:rs.reduce((a,r)=>a+dNum(r.liquido),0)
    };
  });

  const max=Math.max(1,...monthly.flatMap(x=>[x.bruto,x.liquido]));
  chart.innerHTML=monthly.map(x=>{
    const hb=Math.max(0,(x.bruto/max)*100);
    const hl=Math.max(0,(x.liquido/max)*100);
    const label=x.month.slice(0,3);
    return `
      <div class="dash-chart-month">
        <div class="dash-chart-bars">
          <div class="dash-chart-bar bruto" style="height:${hb}%" title="${dEsc(x.month)} · Bruto: ${dEsc(dashMoney.format(x.bruto))}"></div>
          <div class="dash-chart-bar liquido" style="height:${hl}%" title="${dEsc(x.month)} · Líquido: ${dEsc(dashMoney.format(x.liquido))}"></div>
        </div>
        <div class="dash-chart-label">${dEsc(label)}</div>
      </div>
    `;
  }).join('');
}



/* V4.4.55 · MARGEM E COMPARATIVO MENSAL */
function dEnsurePerformanceBlocks(){
  if(document.getElementById('marginChart')) return;

  const style=document.createElement('style');
  style.textContent=`
    .dash-performance-grid{
      display:grid;
      grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);
      gap:16px;
      margin-top:16px;
    }
    .dash-performance-card{
      background:#fff;
      border:1px solid #dfe5e8;
      border-radius:16px;
      padding:16px;
      box-shadow:0 8px 22px rgba(23,33,38,.05);
      min-width:0;
    }
    .dash-margin-chart{
      height:245px;
      min-width:680px;
      display:grid;
      grid-template-columns:repeat(12,minmax(44px,1fr));
      gap:9px;
      align-items:end;
      padding:10px 4px 0;
      border-bottom:1px solid #dfe5e8;
      background:
        linear-gradient(to top,rgba(223,229,232,.55) 1px,transparent 1px);
      background-size:100% 25%;
    }
    .dash-margin-month{
      height:220px;
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:center;
      gap:6px;
    }
    .dash-margin-value{
      font-size:10px;
      font-weight:900;
      color:#0f646e;
      white-space:nowrap;
    }
    .dash-margin-bar-wrap{
      height:175px;
      width:100%;
      display:flex;
      align-items:flex-end;
      justify-content:center;
    }
    .dash-margin-bar{
      width:min(24px,55%);
      border-radius:6px 6px 2px 2px;
      background:#167b87;
      min-height:0;
      transition:height .25s ease;
    }
    .dash-margin-label{
      font-size:10px;
      font-weight:800;
      color:#68777f;
      text-transform:uppercase;
    }
    .dash-compare-title{
      font-size:15px;
      font-weight:900;
      color:#172126;
    }
    .dash-compare-period{
      margin-top:3px;
      color:#68777f;
      font-size:12px;
    }
    .dash-compare-head{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
    }
    .dash-compare-select{
      height:38px;
      min-width:130px;
      border:1px solid #dfe5e8;
      border-radius:10px;
      background:#fff;
      color:#172126;
      padding:0 10px;
      font:700 12px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
      outline:none;
    }
    .dash-compare-select:focus{
      border-color:#167b87;
      box-shadow:0 0 0 3px rgba(22,123,135,.10);
    }
    .dash-compare-list{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:14px;
    }
    .dash-compare-item{
      border:1px solid #e4eaec;
      border-radius:13px;
      padding:12px;
      background:#f8fafb;
      text-align:center;
    }
    .dash-compare-item span{
      display:block;
      color:#68777f;
      font-size:10px;
      font-weight:900;
      text-transform:uppercase;
    }
    .dash-compare-item strong{
      display:block;
      margin-top:5px;
      font-size:16px;
      color:#172126;
    }
    .dash-compare-old{
      margin-top:4px;
      font-size:11px;
      color:#7b898f;
    }
    .dash-change{
      display:inline-flex;
      margin-top:7px;
      padding:4px 7px;
      border-radius:999px;
      font-size:11px;
      font-weight:900;
    }
    .dash-change.up{background:#e8f4ed;color:#17613d}
    .dash-change.down{background:#fdecec;color:#9b2626}
    .dash-change.flat{background:#eef2f3;color:#68777f}
    @media(max-width:900px){
      .dash-performance-grid{grid-template-columns:1fr}
    }
    @media(max-width:700px){
      .dash-performance-card{padding:13px}
      .dash-compare-list{grid-template-columns:1fr 1fr}
      .dash-margin-chart{min-width:700px}
    }
  `;
  document.head.appendChild(style);

  const wrap=document.createElement('section');
  wrap.className='dash-performance-grid';
  wrap.innerHTML=`
    <div class="dash-performance-card">
      <div class="dash-chart-head">
        <div>
          <div class="dash-chart-title">Margem líquida por mês</div>
          <div class="dash-chart-subtitle">Percentual do líquido em relação ao bruto</div>
        </div>
      </div>
      <div class="dash-chart-scroll">
        <div id="marginChart" class="dash-margin-chart"></div>
      </div>
    </div>

    <div class="dash-performance-card">
      <div class="dash-compare-head">
        <div>
          <div class="dash-compare-title">Mês selecionado x anterior</div>
          <div id="comparePeriod" class="dash-compare-period">Aguardando dados...</div>
        </div>
        <select id="compareMonthSelect" class="dash-compare-select" aria-label="Mês de referência"></select>
      </div>
      <div id="monthlyCompare" class="dash-compare-list"></div>
    </div>
  `;

  const revenue=document.querySelector('.dash-chart-card');
  if(revenue) revenue.insertAdjacentElement('afterend',wrap);
}

function dMonthlyTotals(rows){
  return dashMonths.map((month,index)=>{
    const rs=rows.filter(r=>dNorm(r.mes)===dNorm(month));
    const sum=k=>rs.reduce((a,r)=>a+dNum(r[k]),0);
    const bruto=sum('bruto');
    const liquido=sum('liquido');
    return {
      month,
      index,
      rows:rs,
      bruto,
      liquido,
      gasto:sum('gasto'),
      os:rs.length,
      margem:bruto!==0?(liquido/bruto)*100:0
    };
  });
}

function dRenderMarginChart(rows){
  dEnsurePerformanceBlocks();
  const chart=document.getElementById('marginChart');
  if(!chart) return;

  const monthly=dMonthlyTotals(rows);
  const positive=monthly.map(x=>Math.max(0,x.margem));
  const max=Math.max(100,...positive,1);

  chart.innerHTML=monthly.map(x=>{
    const h=Math.max(0,Math.min(100,(Math.max(0,x.margem)/max)*100));
    const label=x.month.slice(0,3);
    const pct=Number.isFinite(x.margem)?x.margem:0;
    return `
      <div class="dash-margin-month">
        <div class="dash-margin-value">${pct.toFixed(1).replace('.',',')}%</div>
        <div class="dash-margin-bar-wrap">
          <div class="dash-margin-bar" style="height:${h}%" title="${dEsc(x.month)} · Margem líquida: ${pct.toFixed(1).replace('.',',')}%"></div>
        </div>
        <div class="dash-margin-label">${dEsc(label)}</div>
      </div>
    `;
  }).join('');
}

function dMonthLabel(month){
  return month.charAt(0)+month.slice(1).toLocaleLowerCase('pt-BR');
}

function dPctChange(current,previous){
  if(previous===0){
    if(current===0) return {text:'0,0%',cls:'flat',arrow:'•'};
    return {text:'novo',cls:'up',arrow:'↑'};
  }
  const pct=((current-previous)/Math.abs(previous))*100;
  const cls=pct>0.05?'up':pct<-0.05?'down':'flat';
  const arrow=cls==='up'?'↑':cls==='down'?'↓':'•';
  return {text:Math.abs(pct).toFixed(1).replace('.',',')+'%',cls,arrow};
}

let dashCompareRows=[];

function dRenderMonthlyCompare(rows){
  dEnsurePerformanceBlocks();
  dashCompareRows=rows||[];

  const monthly=dMonthlyTotals(dashCompareRows);
  const select=document.getElementById('compareMonthSelect');
  const period=document.getElementById('comparePeriod');
  const box=document.getElementById('monthlyCompare');

  if(!select||!period||!box) return;

  if(!select.options.length){
    select.innerHTML=dashMonths.map((m,i)=>
      '<option value="'+i+'">'+dEsc(dMonthLabel(m))+'</option>'
    ).join('');

    select.addEventListener('change',()=>dRenderMonthlyCompare(dashCompareRows));
  }

  if(!select.dataset.initialized){
    const nowIndex=new Date().getMonth();
    let defaultIndex=nowIndex;

    if(!monthly[defaultIndex] || monthly[defaultIndex].rows.length===0){
      const active=monthly.filter(x=>x.rows.length>0);
      defaultIndex=active.length?active[active.length-1].index:nowIndex;
    }

    select.value=String(defaultIndex);
    select.dataset.initialized='1';
  }

  const selectedIndex=Math.max(0,Math.min(11,Number(select.value)||0));
  const current=monthly[selectedIndex];
  const previous=selectedIndex>0?monthly[selectedIndex-1]:null;

  if(!current){
    period.textContent='Sem dados para comparar.';
    box.innerHTML='';
    return;
  }

  if(!previous){
    period.textContent=dMonthLabel(current.month)+' · não há mês anterior em 2026';
    box.innerHTML='';
    return;
  }

  period.textContent=dMonthLabel(current.month)+' x '+dMonthLabel(previous.month);

  const metrics=[
    {label:'Bruto',cur:current.bruto,prev:previous.bruto,fmt:v=>dashMoney.format(v)},
    {label:'Líquido',cur:current.liquido,prev:previous.liquido,fmt:v=>dashMoney.format(v)},
    {label:'Gastos',cur:current.gasto,prev:previous.gasto,fmt:v=>dashMoney.format(v)},
    {label:'O.S.',cur:current.os,prev:previous.os,fmt:v=>String(v)}
  ];

  box.innerHTML=metrics.map(m=>{
    const ch=dPctChange(m.cur,m.prev);
    return `
      <div class="dash-compare-item">
        <span>${dEsc(m.label)}</span>
        <strong>${dEsc(m.fmt(m.cur))}</strong>
        <div class="dash-compare-old">Anterior: ${dEsc(m.fmt(m.prev))}</div>
        <div class="dash-change ${ch.cls}">${ch.arrow} ${ch.text}</div>
      </div>
    `;
  }).join('');
}

function dText(v){return String(v??'').trim()}
function dNum(v){
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let s=dText(v).replace(/R\$\s*/gi,'').replace(/\s/g,'');
  if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s=s.replace(',','.');
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}
function dNorm(v){
  return dText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
}
function dEmpresa(cliente){
  const s=dNorm(cliente);
  if(s.includes('ISOCAR'))return 'ISOCAR';
  if(s.includes('EASYCAR'))return 'EASYCAR';
  if(s.includes('TOPLINE'))return 'TOPLINE';
  return 'OUTROS';
}
function dEsc(v){
  return dText(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function dSame(a,b){
  const textFields=['mes','cliente','empresa','tecnico','pagamento','status'];
  const numFields=['bruto','gasto','mao_obra','liquido','percentual_desconto'];
  return textFields.every(k=>dText(a?.[k])===dText(b?.[k])) &&
    numFields.every(k=>Math.abs(dNum(a?.[k])-dNum(b?.[k]))<0.005);
}

function dParseWorkbook(workbook){
  const sheetName=workbook.SheetNames.find(n=>dNorm(n)==='BASE 2026');
  if(!sheetName) throw new Error('A planilha não possui a aba "BASE 2026".');

  const matrix=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});
  if(matrix.length<2) throw new Error('A aba BASE 2026 está vazia.');

  const h=(matrix[0]||[]).map(dNorm);
  const find=(...names)=>h.findIndex(x=>names.map(dNorm).includes(x));
  const ix={
    mes:find('MÊS','MES'),
    os:find('O.S.','O.S','OS'),
    cliente:find('CLIENTE'),
    bruto:find('BRUTO'),
    gasto:find('GASTO','GASTOS'),
    mo:find('M.O.','M.O','MO'),
    liquido:find('LÍQUIDO','LIQUIDO'),
    desc:find('% DESC','% DESCONTO'),
    tecnico:find('TÉCNICO','TECNICO'),
    pagamento:find('PAGAMENTO'),
    status:find('STATUS','LIQ / BRUTO','LIQ >= BRUTO')
  };
  if(ix.mes<0||ix.os<0||ix.cliente<0) throw new Error('A BASE 2026 não está no formato esperado.');

  const byOs=new Map();
  for(const r of matrix.slice(1)){
    const os=Math.trunc(dNum(r[ix.os]));
    if(!os) continue;

    const cliente=dText(r[ix.cliente]);
    if(!cliente) continue;

    const row={
      ano:2026,
      mes:dText(r[ix.mes]).toLocaleUpperCase('pt-BR'),
      os,
      cliente,
      empresa:dEmpresa(cliente),
      bruto:dNum(r[ix.bruto]),
      gasto:dNum(r[ix.gasto]),
      mao_obra:dNum(r[ix.mo]),
      liquido:dNum(r[ix.liquido]),
      percentual_desconto:dNum(r[ix.desc]),
      tecnico:dText(r[ix.tecnico]).toLocaleUpperCase('pt-BR'),
      pagamento:dText(r[ix.pagamento]).toLocaleUpperCase('pt-BR'),
      status:dText(r[ix.status]).toLocaleUpperCase('pt-BR'),
      updated_at:new Date().toISOString()
    };
    byOs.set(os,row);
  }
  const rows=[...byOs.values()];
  if(!rows.length) throw new Error('Nenhuma O.S. válida foi encontrada em BASE 2026.');
  return rows;
}

async function dLoad(){
  if(!currentUser) return;
  const status=document.getElementById('importStatus');
  if(status) status.textContent='Carregando indicadores...';

  const {data,error}=await db
    .from('indicadores_oficina')
    .select('*')
    .eq('ano',2026)
    .neq('cliente','')
    .order('os',{ascending:true})
    .range(0,4999);

  if(error){
    console.error(error);
    if(status) status.textContent='Erro ao carregar indicadores.';
    return;
  }
  dashRows=(data||[]).filter(r=>dText(r.cliente));
  if(status) status.textContent=dashRows.length?dashRows.length+' registros válidos na base.':'Nenhuma base importada ainda.';
  const empty=document.getElementById('dashboardEmpty');
  if(empty) empty.style.display=dashRows.length?'none':'block';
  dRender();
}

function dRender(){
  const empresa=document.getElementById('empresaFilter')?.value||'TODAS';
  const rows=empresa==='TODAS'?dashRows:dashRows.filter(r=>r.empresa===empresa);
  const sum=k=>rows.reduce((a,r)=>a+dNum(r[k]),0);

  document.getElementById('kpiBruto').textContent=dashMoney.format(sum('bruto'));
  document.getElementById('kpiLiquido').textContent=dashMoney.format(sum('liquido'));
  document.getElementById('kpiGasto').textContent=dashMoney.format(sum('gasto'));
  document.getElementById('kpiOs').textContent=String(rows.length);
  document.getElementById('kpiOk').textContent=String(rows.filter(r=>dNorm(r.status)==='OK').length);
  document.getElementById('kpiAbaixo').textContent=String(rows.filter(r=>dNorm(r.status)==='ABAIXO').length);

  dRenderRevenueChart(rows);
  dRenderMarginChart(rows);
  dRenderMonthlyCompare(rows);

  const monthly=document.getElementById('monthlyBody');
  monthly.innerHTML=dashMonths.map(m=>{
    const rs=rows.filter(r=>dNorm(r.mes)===dNorm(m));
    const sm=k=>rs.reduce((a,r)=>a+dNum(r[k]),0);
    const ok=rs.filter(r=>dNorm(r.status)==='OK').length;
    const below=rs.filter(r=>dNorm(r.status)==='ABAIXO').length;
    const label=m.charAt(0)+m.slice(1).toLocaleLowerCase('pt-BR');
    return '<tr><td>'+dEsc(label)+'</td>'+
      '<td class="num">'+dashMoney.format(sm('bruto'))+'</td>'+
      '<td class="num">'+dashMoney.format(sm('gasto'))+'</td>'+
      '<td class="num">'+dashMoney.format(sm('mao_obra'))+'</td>'+
      '<td class="num">'+dashMoney.format(sm('liquido'))+'</td>'+
      '<td class="num">'+rs.length+'</td>'+
      '<td class="num">'+ok+'</td>'+
      '<td class="num">'+below+'</td></tr>';
  }).join('');

  const techMap=new Map();
  rows.forEach(r=>{
    const tech=dText(r.tecnico)||'NÃO INFORMADO';
    if(!techMap.has(tech)) techMap.set(tech,{cars:0,bruto:0,liquido:0,abaixo:0});
    const x=techMap.get(tech);
    x.cars++;x.bruto+=dNum(r.bruto);x.liquido+=dNum(r.liquido);
    if(dNorm(r.status)==='ABAIXO')x.abaixo++;
  });
  const tech=document.getElementById('technicianBody');
  tech.innerHTML=[...techMap.entries()]
    .sort((a,b)=>b[1].cars-a[1].cars)
    .map(([name,x])=>'<tr><td>'+dEsc(name)+'</td><td class="num">'+x.cars+'</td><td class="num">'+dashMoney.format(x.bruto)+'</td><td class="num">'+dashMoney.format(x.liquido)+'</td><td class="num">'+x.abaixo+'</td></tr>')
    .join('');
}

async function dImport(file){
  const status=document.getElementById('importStatus');
  try{
    status.textContent='Lendo BASE 2026...';
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const rows=dParseWorkbook(wb);

    status.textContent='Comparando com a nuvem...';
    const {data:existing,error}=await db.from('indicadores_oficina').select('*').eq('ano',2026).range(0,4999);
    if(error) throw error;

    const oldMap=new Map((existing||[]).map(r=>[Number(r.os),r]));
    let novos=0,alterados=0,iguais=0;
    rows.forEach(r=>{
      const old=oldMap.get(r.os);
      if(!old) novos++;
      else if(dSame(old,r)) iguais++;
      else alterados++;
    });

    const ok=confirm(
      'Importação da BASE 2026\n\n'+
      rows.length+' O.S. encontradas\n'+
      novos+' novas\n'+
      alterados+' alteradas\n'+
      iguais+' sem mudanças\n\n'+
      'Somente a aba BASE 2026 será lida. Detalhes1, Detalhes2 e as abas mensais serão ignoradas.\n\nContinuar?'
    );
    if(!ok){status.textContent='Importação cancelada.';return;}

    const changed=rows.filter(r=>!oldMap.has(r.os)||!dSame(oldMap.get(r.os),r));
    for(let i=0;i<changed.length;i+=200){
      status.textContent='Enviando '+Math.min(i+200,changed.length)+' de '+changed.length+' alterações...';
      const {error:upErr}=await db
        .from('indicadores_oficina')
        .upsert(changed.slice(i,i+200),{onConflict:'ano,os'});
      if(upErr) throw upErr;
    }

    status.textContent='Concluído: '+novos+' novas e '+alterados+' atualizadas.';
    await dLoad();
  }catch(err){
    console.error(err);
    alert('Não foi possível importar a planilha.\n\n'+(err?.message||err));
    status.textContent='Erro na importação.';
  }
}

document.getElementById('importExcelBtn')?.addEventListener('click',()=>document.getElementById('excelInput')?.click());
document.getElementById('excelInput')?.addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(file) await dImport(file);
  e.target.value='';
});
document.getElementById('empresaFilter')?.addEventListener('change',dRender);

db.auth.onAuthStateChange((_event,session)=>{
  if(session?.user) setTimeout(dLoad,0);
});
db.auth.getSession().then(({data})=>{
  if(data.session?.user) dLoad();
});
