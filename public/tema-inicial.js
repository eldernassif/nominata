// F0.8.5: carimba data-theme antes da primeira pintura (sem flash do tema
// errado). Vive em public/ porque a CSP (script-src 'self') bloqueia script
// inline; <script src> no <head> é render-blocking, então o carimbo continua
// anterior à primeira pintura. Antes da F0.8.5 isto era inline no index.html.
(function () {
  var chave = 'nominata:tema';
  var preferido = window.localStorage.getItem(chave);
  var tema;
  if (preferido === 'claro' || preferido === 'escuro') {
    tema = preferido;
  } else {
    tema = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'escuro'
      : 'claro';
  }
  document.documentElement.dataset.theme = tema;
})();
