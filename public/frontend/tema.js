/* TechCampus: tema claro, escuro e preferência do sistema. */
(() => {
  'use strict';
  const STORAGE_KEY = 'techcampus_tema';
  const VALID = new Set(['claro', 'escuro', 'sistema']);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const read = () => {
    try { const value = localStorage.getItem(STORAGE_KEY); return VALID.has(value) ? value : 'escuro'; }
    catch { return 'escuro'; }
  };
  let preference = read();
  function apply() {
    const actual = preference === 'sistema' ? (media.matches ? 'dark' : 'light') : (preference === 'claro' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-bs-theme', actual);
    document.documentElement.dataset.tcTheme = preference;
    const select = document.getElementById('tema');
    if (select && select.value !== preference) select.value = preference;
  }
  function setTheme(value) {
    if (!VALID.has(value)) return;
    preference = value;
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    apply();
  }
  // O script pode estar no head (defer) ou no fim do body.
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    const select = document.getElementById('tema');
    if (select) select.addEventListener('change', () => setTheme(select.value));
    // Não intercepta o submit de configurações: o script existente pode salvá-las.
  });
  if (media.addEventListener) media.addEventListener('change', () => { if (preference === 'sistema') apply(); });
  else if (media.addListener) media.addListener(() => { if (preference === 'sistema') apply(); });
  window.TechCampusTema = { set: setTheme, get: () => preference, apply };
})();
