/* FR Motors | Preferência visual das listas de Importações.
 * Nunca apaga ou altera os registros. Não limita os arquivos que podem ser importados.
 * A preferência fica neste navegador. */
(function(){
'use strict';
const STORAGE_KEY='frmotors.importacoes.mostrarOutrosBancos.v1';
function normalize(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
}
function priority(name){
 const tokens=normalize(name).split(/\s+/).filter(Boolean);
 return tokens.some(t=>t==='brad'||t.startsWith('bradesco')||t.startsWith('sicoob'));
}
let others=false;
try{others=window.localStorage?.getItem(STORAGE_KEY)==='1'}catch(_){}
function isVisible(name){return others||priority(name)}
function update(){
 const checkbox=document.getElementById('import-show-other-banks');
 if(checkbox)checkbox.checked=others;
 const hint=document.getElementById('import-visibility-hint');
 if(hint)hint.textContent=others?
  'Exibindo todos os bancos e cartões importados, inclusive os antigos. Nenhum registro foi alterado.':
  'Mostrando apenas Bradesco e Sicoob, incluindo grafias históricas. Os demais continuam guardados e podem ser exibidos a qualquer momento.';
}
function setShowOthers(value){
 const next=Boolean(value);
 if(next===others){update();return}
 others=next;
 try{window.localStorage?.setItem(STORAGE_KEY,others?'1':'0')}catch(_){}
 update();
 window.frImportUI?.refresh?.().catch?.(()=>{});
}
function init(){
 const checkbox=document.getElementById('import-show-other-banks');
 if(!checkbox)return;
 checkbox.addEventListener('change',event=>setShowOthers(event.target.checked));
 update();
}
window.frImportVisibility={priority,isVisible,showOthers:()=>others,setShowOthers,normalize};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();