/**
 * Legacy shim for the static WebRTC test harness.
 * The modern adapter now lives in ../js/getUserMediaAdapter.js. To keep the
 * HTML fixtures working without rewriting every reference, we synchronously
 * inject the shared script when this file loads.
 */
(function loadSharedAdapter() {
  var relativePath = '../js/getUserMediaAdapter.js';
  if (typeof document !== 'undefined' && typeof document.write === 'function') {
    document.write('<script src="' + relativePath + '"><\\/script>');
    return;
  }
  if (typeof require === 'function') {
    try {
      require('../js/getUserMediaAdapter.js'); // eslint-disable-line global-require
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Failed to load getUserMedia adapter in legacy shim', err);
      }
    }
  }
})();
