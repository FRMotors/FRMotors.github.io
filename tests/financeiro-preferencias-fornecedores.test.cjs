'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('financeiro.html');
const nav=read('financeiro-pro-ui.js');
const js=read('financeiro-documentos.js');
const sql=read('sql/migrations/20261120_preferencias_fornecedores_por_conta.sql');

test('Visão geral não mostra botões de importar arquivo ou projeção de caixa',()=>{
 const start=html.indexOf('data-view-panel="overview"');
 const end=html.indexOf('data-view-panel="movements"',start);
 assert.ok(start>=0&&end>start);
 const overview=html.slice(start,end);
 assert.doesNotMatch(overview,/> Importar arquivo<\/button>/);
 assert.doesNotMatch(overview,/> Projeção de caixa<\/button>/);
 assert.match(overview,/> Dar baixa<\/button>/);
 assert.match(overview,/> Novo boleto<\/button>/);
 assert.match(html,/data-view-panel="forecast"/);
});
test('Navegação chama Administração sem alterar a rota imports existente',()=>{
 assert.match(html,/data-view="imports"[^>]*>[\s\S]*?Administração<\/button>/);
 assert.match(html,/data-view-panel="imports" hidden aria-label="Administração financeira/);
 assert.match(html,/<h1 class="page-heading">Administração<\/h1>/);
 assert.match(nav,/imports:'Administração'/);
 assert.match(nav,/next==='imports'/);
});
test('Botão Salvar seleção e mensagens de estado estão presentes e cache do JS muda',()=>{
 assert.match(html,/id="doc-supplier-save" disabled>Salvar seleção<\/button>/);
 assert.match(html,/id="doc-supplier-choice-storage"[^>]*aria-live="polite"/);
 assert.match(html,/financeiro-documentos\.js\?v=\w+/);
 assert.match(js,/addEventListener\('click',\(\)=>persistSupplierSelection\(\)\)/);
});
test('Tabela de preferências tem RLS por identidade, sem alterar lançamentos',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/usuario_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/fluxo_caixa_autorizado/);
 assert.match(sql,/REVOKE ALL ON TABLE .* FROM PUBLIC, anon/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE)\b\s+(?:FROM|TABLE)/i);
});
function harness({initialLocal=null,cloud=null,failRead=false,failSave=false}={}){
 const scripts=js.slice(js.indexOf('const selectionSnapshot='),js.indexOf('function refreshSupplierYears(){'));
 assert.ok(scripts.startsWith('const selectionSnapshot=')&&scripts.includes('persistSupplierSelection'));
 const storage=new Map();
 if(initialLocal!==null)storage.set('fr-motors:fornecedores-analisados:v2:user-a',JSON.stringify(initialLocal));
 const saveCalls=[],messages=[],ui={disabled:true,textContent:''};
 let server=cloud===null?null:{selecionados:cloud};
 const ctx={
  selectionKey:null,selectionLoaded:false,selectionUserId:null,selectionSavedSnapshot:null,selectionSaving:false,
  selectedSuppliers:new Set(),supplierCatalogue:[{key:'autopecas|um'},{key:'cartoes|dois'}],
  statusCore:{defaultSupplierKeys:()=>new Set(['autopecas|um'])},
  choiceStorage:()=>({getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}),
  $:id=>id==='doc-supplier-save'?ui:null,write:(_id,message)=>messages.push(message),
  renderChoice:()=>{},renderSupplierYears:()=>{},window:{frFinanceUI:{showToast:()=>{}}},
  db:{from:name=>{
   assert.equal(name,'fin_preferencias_fornecedores');
   return {
    select:()=>({eq:()=>({maybeSingle:async()=>failRead?{data:null,error:{message:'sem rede'}}:{data:server,error:null}})}),
    upsert:(value,config)=>{
     saveCalls.push({value,config});
     return {select:()=>({single:async()=>{
      if(failSave)return {data:null,error:{message:'falha no salvamento'}};
      server={selecionados:[...value.selecionados]};
      return {data:server,error:null};
     }})};
    }
   };
  }}
 };
 vm.createContext(ctx);vm.runInContext(scripts,ctx);
 return {ctx,ui,messages,saveCalls,storage,server:()=>server,
  run:expr=>vm.runInContext(expr,ctx)};
}
test('Seleção antiga do navegador é recuperada e salva na conta',async()=>{
 const h=harness({initialLocal:['cartoes|dois'],cloud:null});
 await h.run("restoreSupplierSelection('user-a')");
 assert.deepEqual([...h.ctx.selectedSuppliers],['cartoes|dois']);
 assert.equal(h.ui.disabled,false);
 await h.run('persistSupplierSelection()');
 assert.deepEqual(h.server().selecionados,['cartoes|dois']);
 assert.equal(h.ui.disabled,true);
 assert.equal(h.saveCalls[0].config.onConflict,'usuario_id');
 assert.match(h.messages.at(-1),/salva na sua conta/i);
});
test('Preferência salva na conta é recuperada e alterações só sincronizam após Salvar',async()=>{
 const h=harness({initialLocal:['autopecas|um'],cloud:['cartoes|dois']});
 await h.run("restoreSupplierSelection('user-a')");
 assert.deepEqual([...h.ctx.selectedSuppliers],['cartoes|dois']);
 assert.equal(h.ui.disabled,true);
 h.run("selectedSuppliers.add('autopecas|um');saveSupplierSelection()");
 assert.equal(h.ui.disabled,false);
 assert.deepEqual(h.server().selecionados,['cartoes|dois']);
 await h.run('persistSupplierSelection()');
 assert.deepEqual(h.server().selecionados,['autopecas|um','cartoes|dois']);
 assert.equal(h.ui.disabled,true);
});
test('Falha de rede não anuncia salvamento nem descarta o rascunho',async()=>{
 const h=harness({initialLocal:['cartoes|dois'],failRead:true,failSave:true});
 await h.run("restoreSupplierSelection('user-a')");
 await h.run('persistSupplierSelection()');
 assert.equal(h.ui.disabled,false);
 assert.equal(h.server(),null);
 assert.deepEqual([...h.ctx.selectedSuppliers],['cartoes|dois']);
 assert.match(h.messages.at(-1),/Erro ao salvar na conta/);
});
