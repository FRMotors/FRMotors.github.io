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
    .order('os',{ascending:true})
    .range(0,4999);

  if(error){
    console.error(error);
    if(status) status.textContent='Erro ao carregar indicadores.';
    return;
  }
  dashRows=data||[];
  if(status) status.textContent=dashRows.length?dashRows.length+' registros na base.':'Nenhuma base importada ainda.';
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
