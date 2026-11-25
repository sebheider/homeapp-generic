/* Wallbox example: charging power as a gauge, start / stop and the charging current – all through window.HomeApp. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ARC = 157; // length of the half circle (radius 50)
  var maxPower = 11000;

  function showError(err) {
    $('status').textContent = err.message;
  }

  HomeApp.onInit(function (info) {
    document.body.dataset.view = info.view; // "page" or "widget"
    $('title').textContent = info.settings.title || info.module.name;
    maxPower = Number(info.settings.maxPower) || 11000;
    $('currentRow').hidden = !info.datapoints.current || !info.datapoints.current.mapped;
    $('status').textContent = info.datapoints.power.mapped ? '' : 'Ladeleistung ist noch keinem Datenpunkt zugeordnet.';
  });

  HomeApp.onChange(function () {
    var raw = HomeApp.get('power');
    var power = Number(raw);
    var known = raw !== null && raw !== undefined && isFinite(power);
    var charging = HomeApp.get('charging') === true;
    $('power').textContent = known ? (power / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–';
    $('arc').style.strokeDasharray = (known ? Math.max(0, Math.min(1, power / maxPower)) * ARC : 0) + ' ' + ARC;
    $('toggle').textContent = charging ? 'Laden stoppen' : 'Laden starten';
    $('toggle').classList.toggle('on', charging);
    var current = HomeApp.get('current');
    if (typeof current === 'number') {
      $('current').value = String(current);
      $('currentOut').textContent = current + ' A';
    }
  });

  $('toggle').addEventListener('click', function () {
    $('status').textContent = '';
    HomeApp.set('charging', HomeApp.get('charging') !== true).catch(showError);
  });
  $('current').addEventListener('input', function (e) {
    $('currentOut').textContent = e.target.value + ' A';
  });
  $('current').addEventListener('change', function (e) {
    HomeApp.set('current', Number(e.target.value)).catch(showError);
  });
})();
