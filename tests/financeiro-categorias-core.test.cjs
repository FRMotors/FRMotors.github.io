'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../financeiro-categorias-core.js');
const files=[
 {id:'f1',tipo:'banco',conta_nome:'itau',arquivo_nome:'Itaú 19.pdf'},
 {id:'f2',tipo:'banco',conta_nome:'ITAÚ',arquivo_nome:'Itaú 18.pdf'},
 {id:'card',tipo:'cartao',conta_nome:'Bradesco',arquivo_nome:'Fatura.pdf'}
];
const makeLine=(id,file,movement,date,natureza,valor,descricao,categoria_personalizada)=>({
 id,importacao_id:file,movimento_id:movement,data_lancamento:date,natureza,valor,
 descricao,descricao_personalizada:null,categoria_personalizada,fingerprint:'fp-'+id});
const lines=[
 makeLine('a','f1','ma','2026-11-19','saida',200.10,'PIX ENVIADO JOÃO','PRÓ-LABORE'),
 makeLine('b','f1','mb','2026-11-19','saida',100.20,'PIX ENVIADO MARIA',null),
 makeLine('c','f2','mc','2026-11-18','entrada',150,'PIX RECEBIDO',null),
 makeLine('d','f2','md','2026-11-18','saida',30,'CANCELADA',null),
 makeLine('card1','card',null,'2026-11-19','compra',120,'COMPRAS',null)
];
const moves=[
 {id:'ma',referencia_cliente:'extrato:fp-a',data_movimento:'2026-11-19',tipo:'saida',valor:200.10,descricao:'Pró-labore',categoria:'PRÓ-LABORE',estado:'confirmado'},
 {id:'mb',referencia_cliente:'extrato:fp-b',data_movimento:'2026-11-19',tipo:'saida',valor:100.20,descricao:'FORNECEDOR',categoria:'EXTRATO BANCÁRIO',estado:'confirmado'},
 {id:'mc',referencia_cliente:'extrato:fp-c',data_movimento:'2026-11-18',tipo:'entrada',valor:150,descricao:'VENDA',categoria:'VENDAS',estado:'confirmado'},
 {id:'md',referencia_cliente:'extrato:fp-d',data_movimento:'2026-11-18',tipo:'saida',valor:30,descricao:'CANCELADA',categoria:'OUTROS',estado:'cancelado'}
];
const official=[
 {id:'off1',data_movimento:'2026-11-11',tipo:'saida',valor:500,descricao:'Fornecedor',categoria:'FORNECEDORES',estado:'confirmado',origem:'fluxo_caixa_homologado'},
 {id:'off2',data_movimento:'2026-10-01',tipo:'entrada',valor:300,descricao:'Venda',categoria:'VENDAS',estado:'confirmado',origem:'fluxo_caixa_homologado'},
 {id:'off3',data_movimento:'2026-11-18',tipo:'saida',valor:500,descricao:'Cancelado',categoria:'FORNECEDORES',estado:'cancelado',origem:'fluxo_caixa_homologado'},
 {id:'off4',data_movimento:'2026-11-18',tipo:'saida',valor:500,descricao:'Outro registro',categoria:'FORNECEDORES',estado:'confirmado',origem:'app'}
];
test('apenas extratos bancários confirmados são contabilizados',()=>{
 const out=core.sourceRowsImported(files,lines,moves);
 assert.equal(out.length,3);
 assert.deepEqual(out.map(r=>r.id).sort(),['a','b','c']);
 assert.ok(!out.some(x=>x.type==='compra'));
 const s=core.summarize(out,{year:2026,month:'11'});
 assert.equal(s.incoming,15000);
 assert.equal(s.outgoing,30030);
 assert.equal(s.net,-15030);
});
test('o caixa homologado não inclui movimentos importados, app nem cancelados',()=>{
 const a=core.sourceRowsOfficial(official);
 const b=core.sourceRowsImported(files,lines,moves);
 assert.equal(a.length,2);
 assert.equal(b.length,3);
 assert.equal(core.summarize(a,{year:2026,month:'11'}).outgoing,50000);
 assert.equal(core.summarize(b,{year:2026,month:'11'}).outgoing,30030);
});
test('Pró-labore personalizado aparece como categoria e não como descrição bancária',()=>{
 const x=core.sourceRowsImported(files,lines,moves)[0];
 assert.equal(x.category,'PRÓ-LABORE');
 assert.equal(x.description,'Pró-labore');
 assert.equal(x.bankDescription,'PIX ENVIADO JOÃO');
});
test('filtros de ano, mês e conta bancaria não misturam outras origens',()=>{
 const rows=core.sourceRowsImported(files,lines,moves);
 assert.equal(core.summarize(rows,{year:2026,month:'11',account:'Itaú'}).rows.length,3);
 assert.equal(core.summarize(rows,{year:2026,month:'10',account:'Itaú'}).rows.length,0);
 assert.equal(core.summarize(rows,{year:2025,month:'todos'}).rows.length,0);
 assert.equal(core.summarize(rows,{year:2026,month:'11',account:'bradesco'}).rows.length,0);
});
test('categoria genérica é destacada como a classificar',()=>{
 const result=core.summarize(core.sourceRowsImported(files,lines,moves),{year:2026,month:'11'});
 assert.equal(result.pendingClass,1);
 assert.equal(result.pendingClassAmount,10020);
});
test('mescla SALARIOS e SALÁRIOS sem perder acentos ou operações distintas',()=>{
 const rs=[
  {id:'1',date:'2026-11-12',type:'saida',category:'SALARIOS',value:3000,account:'itau'},
  {id:'2',date:'2026-11-12',type:'saida',category:'SALÁRIOS',value:1000,account:'itau'}];
 const out=core.summarize(rs,{year:2026,month:'11'});
 assert.equal(out.outGroups.length,1);
 assert.equal(out.outGroups[0].label,'SALÁRIOS');
 assert.equal(out.outGroups[0].value,4000);
});
test('valores monetários usam centavos inteiros',()=>{
 const rs=[{id:'1',date:'2026-11-01',type:'entrada',category:'VENDAS',value:10},
 {id:'2',date:'2026-11-01',type:'entrada',category:'VENDAS',value:20}];
 assert.equal(core.summarize(rs,{year:2026,month:'11'}).incoming,30);
 assert.equal(core.moneyCents(0.1)+core.moneyCents(0.2),30);
});
test('não calcula relatório quando movimento importado difere da origem',()=>{
 const edited=moves.map(x=>({...x}));
 edited[0].valor=200.11;
 assert.throws(()=>core.sourceRowsImported(files,lines,edited),/diferente do original/);
});
test('não calcula relatório quando vínculo com extrato foi trocado',()=>{
 const edited=moves.map(x=>({...x}));edited[0].referencia_cliente='extrato:errado';
 assert.throws(()=>core.sourceRowsImported(files,lines,edited),/vínculo inconsistente/);
});
test('não calcula quando movimento importado aparece duplicado na consulta',()=>{
 const duplicate=lines.concat({...lines[0],id:'duplicado'});
 assert.throws(()=>core.sourceRowsImported(files,duplicate,moves),/duplicado/);
});
test('datas inválidas e categorias sem nome não criam datas artificiais',()=>{
 assert.equal(core.validDate('2026-02-30'),false);
 assert.equal(core.categoryName(''),'SEM CATEGORIA');
 assert.throws(()=>core.summarize([],{year:2026,month:'15'}),/Mês do relatório inválido/);
});
