/*
 * HomeApp module SDK – for the HTML pages of external modules (protocol "homeapp-module/1").
 *
 * Include it in the module's page:   <script src="/module-sdk.js"></script>
 *
 * The page runs in a sandbox without access to the app, its storage or its API. Everything goes through
 * window.HomeApp:
 *
 *   HomeApp.onInit(fn)        fn(info) once the app has sent module info, settings, theme and values
 *                             (again after the admin changed the settings or the theme changed)
 *   HomeApp.onChange(fn)      fn(values, changedKeys) whenever mapped datapoints change
 *   HomeApp.get(key)          current value of a datapoint slot (setting key of type "datapoint")
 *   HomeApp.set(key, value)   writes a slot released with "write": true; returns a Promise
 *   HomeApp.settings          values of the other settings (text, number, boolean, select)
 *   HomeApp.info              the last init message (module, view, theme, colors, datapoints, …)
 *
 * The page receives the theme as data-theme on <html> and the colours as CSS variables
 * (--homeapp-bg, --homeapp-fg, --homeapp-muted, --homeapp-card, --homeapp-line, --homeapp-accent).
 * See docs/MODULES.md for the full description.
 */
(function () {
  'use strict';
  var PROTOCOL = 'homeapp-module/1';
  var TIMEOUT_MS = 15000;
  var initListeners = [];
  var changeListeners = [];
  var info = null;
  var values = {};
  var pending = {};
  var nextId = 1;

  function post(msg) {
    msg.protocol = PROTOCOL;
    window.parent.postMessage(msg, '*');
  }

  function call(list, args) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].apply(null, args);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function applyTheme(msg) {
    var root = document.documentElement;
    root.setAttribute('data-theme', msg.theme || 'dark');
    var colors = msg.colors || {};
    for (var name in colors) if (colors[name]) root.style.setProperty('--homeapp-' + name, colors[name]);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.protocol !== PROTOCOL) return;
    if (m.type === 'init') {
      info = m;
      values = m.values || {};
      applyTheme(m);
      call(initListeners, [info]);
      call(changeListeners, [values, Object.keys(values)]);
    } else if (m.type === 'values') {
      var keys = Object.keys(m.values || {});
      for (var i = 0; i < keys.length; i++) values[keys[i]] = m.values[keys[i]];
      call(changeListeners, [values, keys]);
    } else if (m.type === 'result') {
      var p = pending[m.requestId];
      if (!p) return;
      delete pending[m.requestId];
      clearTimeout(p.timer);
      if (m.ok) p.resolve();
      else p.reject(new Error(m.error || 'Schreiben fehlgeschlagen'));
    }
  });

  // pages grow with their content (widgets keep the size of their cell)
  var lastHeight = 0;
  function reportHeight() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h === lastHeight) return;
    lastHeight = h;
    post({ type: 'resize', height: h });
  }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(reportHeight).observe(document.documentElement);
  }
  window.addEventListener('load', reportHeight);

  window.HomeApp = {
    onInit: function (fn) {
      initListeners.push(fn);
      if (info) fn(info);
    },
    onChange: function (fn) {
      changeListeners.push(fn);
      if (info) fn(values, Object.keys(values));
    },
    get: function (key) {
      var v = values[key];
      return v ? v.val : undefined;
    },
    set: function (key, value) {
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        var timer = setTimeout(function () {
          delete pending[id];
          reject(new Error('Zeitüberschreitung'));
        }, TIMEOUT_MS);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        post({ type: 'set', requestId: id, key: key, value: value });
      });
    },
    get settings() {
      return info ? info.settings : {};
    },
    get info() {
      return info;
    },
  };

  post({ type: 'ready' });
})();
