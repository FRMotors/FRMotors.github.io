(() => {
  let deferredPrompt = null;

  const buttons = () => [...document.querySelectorAll('[data-install-app]')];
  const standalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.MSStream;

  function syncButtons(){
    buttons().forEach(btn => {
      btn.hidden = standalone();
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    syncButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    syncButtons();
  });

  async function installApp(){
    if(standalone()) return;

    if(deferredPrompt){
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch(_){}
      deferredPrompt = null;
      syncButtons();
      return;
    }

    if(isIOS()){
      alert('No Safari, toque no botão Compartilhar e depois em “Adicionar à Tela de Início”.');
      return;
    }

    alert('Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    buttons().forEach(btn => btn.addEventListener('click', installApp));
    syncButtons();
  });
})();