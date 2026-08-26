// Runs before first paint so a stored theme choice applies immediately, instead of flashing the
// system-default theme and then swapping once React mounts and useTheme runs. Kept as an external
// file (rather than inline in index.html) so the server can send a script-src CSP without
// 'unsafe-inline'.
(function () {
  try {
    var stored = localStorage.getItem('cleep-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
