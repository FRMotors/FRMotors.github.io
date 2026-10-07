/* FR Motors · Dashboard data/import */
const dashMoney=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dashMonths=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
let dashRows=[];

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
