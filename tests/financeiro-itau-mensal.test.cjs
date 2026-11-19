'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../financeiro-itau-mensal-core.js');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'financeiro-itau-mensal.js'),'utf8');
const html=fs.readFileSync(path.join(root,'financeiro.html'),'utf8');

const official=(id,date,type,amount)=>({id,data_movimento:date,tipo:type,
 descricao:'MOVIMENTO '+id,categoria:type==='entrada'?'VENDAS':'FORNECEDORES',
 meio_pagamento:'PIX',valor:amount,estado:'confirmado',origem:'fluxo_caixa_homologado'});
const pending=(id,date,type,amount)=>({id,importacao_id:'itau',data_lancamento:date,
 natureza:type,valor:amount,descricao:'BANCO '+id,arquivo_nome:'Itaú Novembro.pdf'});

function sandbox(data){
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,
   className:'',events:{},addEventListener(name,cb){this.events[name]=cb}});
  return elements.get(id);
 };
 const officialRows=data.official||[];
 const calls=[];
 const db={async rpc(name){assert.equal(name,'fluxo_caixa_autorizado');
  return {data:data.denied?false:true,error:null}},
  from(table){
   assert.equal(table,'fin_movimentos');
   const filters=[],orders=[];
   const q={select(){return q},
    eq(key,value){filters.push(x=>x[key]===value);return q},
    order(key,{ascending=true}={}){orders.push([key,ascending]);return q},
    async range(a,b){
     calls.push({a,b});
     const rows=officialRows.filter(x=>filters.every(fn=>fn(x))).slice();
     rows.sort((x,y)=>{for(const [key,ascending] of orders){
      const diff=String(x[key]||'').localeCompare(String(y[key]||''));
      if(diff)return ascending?diff:-diff;
     }return 0});
     return {data:rows.slice(a,b+1),error:null};
    }};
   return q;
  }
 };
 const document={readyState:'complete',getElementById:$,querySelector(){return null},
  addEventListener(){}};
 const window={frItauMonthlyCore:core,location:{search:''},
  frHistoryUI:{async refresh(){return true}}};
 vm.runInNewContext(source,{window,document,db,
  URLSearchParams,Intl,Date});
 return {ui:window.frItauMonthsUI,el:$,calls};
}

test('o motor normaliza todos os meses com valores em centavos inteiros',()=>{
 const original=[official('a','2026-05-07','entrada',100.11),
  official('b','2026-06-30','saida',99.91),official('c','2026-11-12','entrada',1)];
 const rows=core.officialRows(original);
 assert.deepEqual(core.months(rows),['2026-11','2026-06','2026-05']);
 assert.equal(core.totals(rows).officialIn,10111);
 assert.equal(core.totals(rows).officialOut,9991);
});
test('extratos pendentes permanecem separados dos registros homologados',()=>{
 const officialRows=core.officialRows([official('a','2026-11-12','saida',5.60)]);
 const previewRows=core.pendingRows([pending('b','2026-11-13','entrada',15)],'2026-11-12');
 const rows=core.combine(officialRows,previewRows);
 assert.equal(rows.length,2);
 assert.equal(core.totals(rows).pendingIn,1500);
 assert.equal(core.totals(rows).officialOut,560);
 assert.equal(core.selectRows(rows,{month:'2026-11',origin:'previa'}).length,1);
 assert.equal(core.selectRows(rows,{month:'2026-11',origin:'homologado'}).length,1);
});
test('não aceita prévia anterior ao fechamento para evitar contagem duplicada',()=>{
 assert.throws(()=>core.pendingRows([pending('old','2026-11-11','saida',5)],'2026-11-12'),/fechamento/);
 assert.throws(()=>core.pendingRows([pending('new','2026-11-18','saida',5)],''),/fechamento válido/);
});
test('filtra por mês, tipo e busca sem truncar a fonte',()=>{
 const items=core.officialRows([
  official('1','2026-05-03','entrada',2),official('2','2026-05-04','saida',3),
  official('3','2026-06-04','saida',4)]);
 assert.equal(core.selectRows(items,{month:'2026-05'}).length,2);
 assert.equal(core.selectRows(items,{month:'2026-05',type:'saida'}).length,1);
 assert.equal(core.selectRows(items,{month:'2026-05',search:'MOVIMENTO 1'}).length,1);
 assert.equal(core.selectRows(items,{month:'2026-05',search:'fornecedores'}).length,1);
});
test('a interface oferece seletores, paginação e exportação por mês',()=>{
 for(const id of ['hist-itau-mensal','hist-itau-mes-select','hist-itau-mes-type','hist-itau-mes-origin',
 'hist-itau-mes-search','hist-itau-mes-rows','hist-itau-mes-page-prev','hist-itau-mes-page-next',
 'hist-itau-mes-export','hist-itau-mes-page-size'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('financeiro-itau-mensal.js?v=20261119month1'));
});
test('carrega mais de 40 registros e exibe todas as páginas',async()=>{
 const records=Array.from({length:165},(_,i)=>official(String(i+1),'2026-10-'+
   String(i%28+1).padStart(2,'0'),i%3?'saida':'entrada',i+1));
 const old=[official('may1','2026-05-05','entrada',120)];
 const h=sandbox({official:[...records,...old]});
 await h.ui.refresh({pending:[],cutoff:''});
 assert.equal(h.ui.__test.state.rows.length,166);
 assert.equal(h.ui.__test.state.months.length,2);
 assert.equal(h.ui.__test.state.selected,'2026-10');
 assert.equal((h.el('hist-itau-mes-rows').innerHTML.match(/<tr>/g)||[]).length,25);
 assert.match(h.el('hist-itau-mes-pages').textContent,/165 de 165/);
 assert.match(h.el('hist-itau-mes-pages').textContent,/página 1 de 7/);
 assert.equal(h.el('hist-itau-mes-page-next').disabled,false);
 h.ui.__test.state.page=6;h.ui.__test.renderRows();
 assert.match(h.el('hist-itau-mes-pages').textContent,/página 7 de 7/);
 assert.equal((h.el('hist-itau-mes-rows').innerHTML.match(/<tr>/g)||[]).length,15);
});
test('navegação para meses antigos mantém os respectivos valores',async()=>{
 const h=sandbox({official:[official('a','2026-11-12','entrada',100),
  official('b','2026-05-02','saida',70)]});
 await h.ui.refresh({pending:[],cutoff:''});
 assert.equal(h.ui.__test.state.selected,'2026-11');
 h.ui.__test.changeMonthBy(1);
 assert.equal(h.ui.__test.state.selected,'2026-05');
 assert.ok(h.el('hist-itau-mes-totals').innerHTML.includes('70,00'));
 assert.match(h.el('hist-itau-mes-rows').innerHTML,/MOVIMENTO b/);
 assert.doesNotMatch(h.el('hist-itau-mes-rows').innerHTML,/MOVIMENTO a/);
});
test('busca e mudança de tipo não modificam totais mensais',async()=>{
 const h=sandbox({official:[official('sale','2026-11-11','entrada',100),
  official('rent','2026-11-12','saida',55)]});
 await h.ui.refresh({pending:[],cutoff:''});
 const totals=h.el('hist-itau-mes-totals').innerHTML;
 h.el('hist-itau-mes-search').value='MOVIMENTO rent';
 h.el('hist-itau-mes-search').events.input();
 assert.match(h.el('hist-itau-mes-pages').textContent,/1 de 2/);
 assert.equal(h.el('hist-itau-mes-totals').innerHTML,totals);
 h.el('hist-itau-mes-search').value='';
 h.el('hist-itau-mes-type').value='entrada';
 h.el('hist-itau-mes-type').events.change();
 assert.match(h.el('hist-itau-mes-rows').innerHTML,/MOVIMENTO sale/);
 assert.doesNotMatch(h.el('hist-itau-mes-rows').innerHTML,/MOVIMENTO rent/);
});
test('histórico mensal reaplica recorte em uma atualização e não perde mês selecionado',async()=>{
 const h=sandbox({official:[official('a','2026-11-12','entrada',100),
  official('b','2026-05-02','saida',70)]});
 await h.ui.refresh({pending:[],cutoff:''});
 h.ui.__test.changeMonth('2026-05');
 await h.ui.refresh({pending:[],cutoff:''});
 assert.equal(h.ui.__test.state.selected,'2026-05');
});
test('rejeita base sem autorização e não deixa exibir totais antigos',async()=>{
 const h=sandbox({official:[official('a','2026-11-12','saida',100)],denied:true});
 await h.ui.refresh({pending:[],cutoff:''});
 assert.equal(h.ui.__test.state.loaded,false);
 assert.match(h.el('hist-itau-mes-status').textContent,/Acesso financeiro não autorizado/);
 assert.equal(h.el('hist-itau-mes-totals').innerHTML,'');
});
test('não esconde erro de dados incompletos ou repetidos',()=>{
 const item=official('a','2026-11-12','entrada',100);
 assert.throws(()=>core.officialRows([item,item]),/repetido/);
 assert.throws(()=>core.officialRows([{...item,data_movimento:'2026-02-30'}]),/inválido/);
});
