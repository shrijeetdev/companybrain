/* companybrain — apply the saved theme before first paint (no flash).
   Loaded synchronously from <head>, before the stylesheet. External on purpose: the CSP is
   script-src 'self' (no inline scripts). Keys and colors mirror src/lib/theme.ts. */
(function () {
  try {
    var d = document.documentElement;
    var ls = window.localStorage;
    var theme = ls.getItem('cb.theme') === 'classic' ? 'classic' : 'tactical';
    var pref = ls.getItem('cb.mode');
    var mode = pref === 'light' || pref === 'dark'
      ? pref
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    d.setAttribute('data-theme', theme);
    d.setAttribute('data-mode', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'tactical' ? (mode === 'dark' ? '#060a10' : '#e9edf1') : (mode === 'dark' ? '#07080f' : '#eef1f8'));
  } catch (e) {
    /* storage blocked: keep the defaults on <html> */
  }
})();
