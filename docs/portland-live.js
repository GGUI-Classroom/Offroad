/* Offroader Portland-metro live-camera launcher.
 * TripCheck's public CCTV inventory publishes still-image URLs.
 * TripCheck separately offers 60-second TrafficLand-backed live sessions
 * on selected Portland-metro cameras. This layer keeps those cameras
 * separate and opens the official public viewer without an API key.
 */
(() => {
  'use strict';

  const ODOT_QUERY = 'https://gis.odot.state.or.us/arcgis1006/rest/services/trip_check/Trip_Check_Terrain/MapServer/1/query';
  const TRIPCHECK_CAMERAS = 'https://tripcheck.com/DynamicReports/Report/Cameras/1';
  const TRAFFICLAND = 'https://www.trafficland.com/';
  const layer = L.layerGroup();
  let loaded = false;
  let loading = false;
  let count = 0;

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function styles() {
    if (document.getElementById('orLiveStyles')) return;
    const s = document.createElement('style');
    s.id = 'orLiveStyles';
    s.textContent = `
      .or-live-fab{position:fixed;z-index:1610;right:14px;top:368px;width:52px;height:52px;border:0;border-radius:17px;background:#fff;color:#17202a;box-shadow:0 5px 20px #0002;font:800 10px/1 system-ui;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
      .or-live-fab .e{font-size:20px}.or-live-fab.on{background:#b91c1c;color:#fff}
      .or-live-dot{width:16px;height:16px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px #0005}
      .or-live-sheet{position:fixed;z-index:2250;left:50%;bottom:16px;transform:translateX(-50%);width:min(650px,calc(100% - 24px));max-height:68vh;overflow:auto;background:#fff;border-radius:24px;box-shadow:0 14px 55px #0005;padding:16px;color:#14202c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
      .or-live-sheet.hidden{display:none}.or-live-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.or-live-title{font-size:19px;font-weight:900}.or-live-sub{font-size:12px;color:#667483;margin-top:3px}.or-live-close{border:0;background:#edf1f5;border-radius:12px;padding:8px 11px;font-weight:800}
      .or-live-img{width:100%;max-height:360px;object-fit:contain;background:#05070a;border-radius:16px;margin-top:12px}.or-live-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.or-live-btn{border:0;border-radius:12px;padding:10px 13px;font-weight:850;background:#dc2626;color:white}.or-live-btn.gray{background:#edf1f5;color:#182431}
      .or-live-note{font-size:12px;line-height:1.45;background:#f3f6f9;border-radius:13px;padding:10px 11px;margin-top:10px;color:#566473}.or-live-badge{display:inline-block;margin-top:8px;border-radius:999px;padding:5px 8px;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:900}
      @media(max-width:600px){.or-live-fab{right:10px;top:349px;width:46px;height:46px;border-radius:15px}.or-live-fab .e{font-size:18px}.or-live-sheet{bottom:10px;max-height:62vh}}
    `;
    document.head.appendChild(s);
  }

  function panel(html) {
    let p = document.getElementById('orLiveSheet');
    if (!p) {
      p = document.createElement('div');
      p.id = 'orLiveSheet';
      p.className = 'or-live-sheet hidden';
      document.body.appendChild(p);
    }
    p.innerHTML = html;
    p.classList.remove('hidden');
    p.querySelector('[data-close]')?.addEventListener('click', () => p.classList.add('hidden'));
    return p;
  }

  function toast(text) {
    let x = document.getElementById('orLiveToast');
    if (!x) {
      x = document.createElement('div');
      x.id = 'orLiveToast';
      x.style.cssText = 'position:fixed;z-index:2400;left:50%;top:82px;transform:translateX(-50%);background:#14202c;color:#fff;border-radius:999px;padding:9px 13px;font:750 12px system-ui;box-shadow:0 5px 18px #0004';
      document.body.appendChild(x);
    }
    x.textContent = text;
    clearTimeout(x._timer);
    x._timer = setTimeout(() => x.remove(), 2800);
  }

  function httpsImage(value) {
    return value ? String(value).replace(/^http:\/\//i, 'https://') : '';
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    toast('Loading Portland-metro camera locations…');
    try {
      const q = new URLSearchParams({
        where: 'latitude > 45.35 AND latitude < 45.70 AND longitude > -122.90 AND longitude < -122.35',
        outFields: 'OBJECTID,device_id,device_name,organization_name,cctv_url,cctv_other,latitude,longitude',
        returnGeometry: 'false',
        resultRecordCount: '1000',
        f: 'json'
      });
      const r = await fetch(ODOT_QUERY + '?' + q, { cache: 'no-store' });
      if (!r.ok) throw Error('ODOT HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw Error(j.error.message || 'ODOT query failed');

      layer.clearLayers();
      count = 0;
      for (const f of j.features || []) {
        const a = f.attributes || {};
        const lat = Number(a.latitude);
        const lon = Number(a.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const name = String(a.cctv_other || a.device_name || 'Portland traffic camera');
        const provider = String(a.organization_name || 'ODOT / partner');
        const img = httpsImage(a.cctv_url || '');
        const icon = L.divIcon({ className: '', html: '<div class="or-live-dot"></div>', iconSize: [16,16], iconAnchor: [8,8] });
        L.marker([lat, lon], { icon, title: name })
          .on('click', () => openCam({ name, provider, img }))
          .addTo(layer);
        count++;
      }
      loaded = true;
      toast(`Loaded ${count} Portland-metro camera locations`);
    } catch (e) {
      console.error(e);
      toast('Portland camera layer failed: ' + e.message);
    } finally {
      loading = false;
    }
  }

  function openCam(c) {
    const src = c.img ? c.img + (c.img.includes('?') ? '&' : '?') + 't=' + Date.now() : '';
    const image = src ? `<img class="or-live-img" src="${esc(src)}" alt="Current TripCheck image">` : '';
    const p = panel(`
      <div class="or-live-head">
        <div><div class="or-live-title">${esc(c.name)}</div><div class="or-live-sub">${esc(c.provider)} · Portland metro</div><span class="or-live-badge">TRIPCHECK LIVE AREA</span></div>
        <button class="or-live-close" data-close>×</button>
      </div>
      ${image}
      <div class="or-live-actions">
        <button class="or-live-btn" data-trip>▶ Open TripCheck live viewer</button>
        <button class="or-live-btn gray" data-trafficland>TrafficLand live cameras</button>
        <button class="or-live-btn gray" data-refresh>Refresh picture</button>
      </div>
      <div class="or-live-note">TripCheck publishes direct still-image URLs in its public camera inventory. Selected Portland-metro cameras additionally have official 60-second live sessions powered by TrafficLand. Those live session URLs are not published in the ODOT inventory, so Offroader opens the official public viewer instead of pretending the still image is video.</div>
    `);
    p.querySelector('[data-trip]')?.addEventListener('click', () => window.open(TRIPCHECK_CAMERAS, '_blank', 'noopener'));
    p.querySelector('[data-trafficland]')?.addEventListener('click', () => window.open(TRAFFICLAND, '_blank', 'noopener'));
    p.querySelector('[data-refresh]')?.addEventListener('click', () => openCam(c));
  }

  function addButton() {
    if (document.getElementById('orLiveFab')) return;
    const b = document.createElement('button');
    b.id = 'orLiveFab';
    b.className = 'or-live-fab';
    b.title = 'Portland-metro TripCheck live cameras';
    b.innerHTML = '<span class="e">🔴</span><span>PDX LIVE</span>';
    document.body.appendChild(b);
    b.onclick = async () => {
      if (!loaded) await load();
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
        b.classList.remove('on');
      } else {
        layer.addTo(map);
        map.setView([45.52, -122.67], 10);
        b.classList.add('on');
      }
    };
  }

  styles();
  addButton();
  setTimeout(load, 2500);
})();
