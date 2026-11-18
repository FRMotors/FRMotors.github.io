/* FR Motors | Consolidação apenas visual de nomes históricos de cartão.
 * O valor/ID de origem não é alterado, nem os vínculos de pagamentos.
 * BRAD. FERNANDA é outro cartão e fica separado. */
(function(){
'use strict';
function normalized(text){
 return String(text??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
}
function canonical(text){
 const original=String(text??'').trim();
 const key=normalized(original);
 return /^(BRAD|BRADESCO) PRIME$/.test(key)?'BRADESCO PRIME':original;
}
function same(a,b){return normalized(canonical(a))===normalized(canonical(b))}
function searchText(text){return canonical(text)+' '+String(text??'')}
window.frCardNames={canonical,same,searchText,normalized};
})();