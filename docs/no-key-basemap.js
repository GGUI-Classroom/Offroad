/* Replace the legacy CARTO basemap with OpenStreetMap's standard no-key tiles. */
(() => {
  'use strict';
  if (typeof map === 'undefined' || typeof L === 'undefined') return;

  map.eachLayer(layer => {
    if (layer instanceof L.TileLayer) {
      const url = String(layer._url || '');
      if (/cartocdn\.com|basemaps\.cartocdn/i.test(url)) map.removeLayer(layer);
    }
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
})();
