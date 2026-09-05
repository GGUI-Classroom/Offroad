/* Offroader routing override: Valhalla primary, OSRM fallback.
 * No API key or payment method required for the public demo service.
 * The FOSSGIS Valhalla endpoint is for fair-use/demo traffic; OSRM remains fallback.
 */
(() => {
  'use strict';

  const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

  // Remove an old token from earlier Offroader builds so it cannot accidentally be used.
  try { localStorage.removeItem('offroader_mapbox_token'); } catch {}

  async function routeValhalla() {
    if (!trafficData) {
      try { await loadTraffic(); } catch {}
    }

    const request = {
      locations: [
        { lat: myLocation.lat, lon: myLocation.lon, type: 'break' },
        { lat: destination.lat, lon: destination.lon, type: 'break' }
      ],
      costing: 'auto',
      format: 'osrm',
      shape_format: 'geojson',
      directions_type: 'instructions',
      language: 'en-US',
      units: 'miles',
      alternates: 2,
      costing_options: {
        auto: {
          use_highways: 0.85,
          use_tolls: 0.5,
          use_ferry: 0.5,
          use_living_streets: 0.2,
          use_tracks: 0.0
        }
      }
    };

    const url = VALHALLA + '?json=' + encodeURIComponent(JSON.stringify(request));
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Valhalla routing HTTP ' + r.status);
    const j = await r.json();
    if (j.code !== 'Ok' || !Array.isArray(j.routes) || !j.routes.length) {
      throw new Error(j.message || j.error || 'Valhalla could not build a route');
    }

    return j.routes.map((route, i) => {
      const scored = scoreOsrmRoute(route);
      return {
        i,
        route,
        provider: 'valhalla',
        ...scored
      };
    }).sort((a, b) => a.score - b.score).map((x, i) => ({ ...x, i }));
  }

  const oldRouteOsrm = routeOsrm;
  async function routeOsrmFallback() {
    const choices = await oldRouteOsrm();
    return choices.map((x, i) => ({ ...x, i, provider: 'osrm' }));
  }

  makeRoute = async function makeRouteValhalla() {
    if (!myLocation || !destination) return;
    const req = ++routeReq;
    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Finding the best route…</div><div class="sheetSub">Valhalla is checking road rules and alternatives, then Offroader checks live WSDOT speeds where available.</div></div><button class="closeBtn" data-close>×</button></div>`);

    try {
      let choices;
      let engine = 'valhalla';
      try {
        choices = await routeValhalla();
      } catch (e) {
        console.warn('Valhalla unavailable, using OSRM fallback', e);
        choices = await routeOsrmFallback();
        engine = 'osrm';
      }
      if (req !== routeReq) return;
      currentChoices = choices;
      currentChoiceIndex = 0;
      drawRouteChoices();
      renderRouteSheet(engine);
    } catch (e) {
      console.error(e);
      setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Couldn’t build a route</div><div class="sheetSub">${esc(e.message)}</div></div><button class="closeBtn" data-close>×</button></div>`);
    }
  };

  renderRouteSheet = function renderRouteSheetValhalla(providerOverride) {
    const chosen = currentChoices[currentChoiceIndex];
    if (!chosen) return;
    const r = chosen.route;
    const l = routeLabel(chosen);
    const steps = r.legs?.flatMap(x => x.steps || []) || [];
    const provider = providerOverride || chosen.provider;
    const isValhalla = provider === 'valhalla';
    const isOsrm = provider === 'osrm';

    let trafficNotice;
    if (chosen.trafficOk) {
      trafficNotice = `${isValhalla ? 'Valhalla route' : 'OSRM fallback'} + ${chosen.live.sensorCount} nearby WSDOT live detectors (${Math.round(chosen.live.coverage * 100)}% sampled coverage).`;
    } else if (isValhalla) {
      trafficNotice = 'Valhalla selected this route from the OpenStreetMap road network. There is not enough nearby WSDOT detector coverage to apply a live-traffic adjustment here.';
    } else {
      trafficNotice = 'Valhalla was temporarily unavailable, so Offroader used OSRM. Live WSDOT coverage is limited on this route.';
    }

    const engineName = isValhalla ? 'Valhalla routing' : 'OSRM fallback';
    const engineClass = isValhalla ? '' : 'fallback';

    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">${esc(destination.title || destination.name)}</div><div class="sheetSub">${esc(destination.name)}</div></div><button class="closeBtn" data-close>×</button></div>
      <div class="routeHero"><div><div class="eta">${l.mins} min</div><div class="arrival">Arrive around ${arrivalText(chosen.eta)}</div></div><div class="routeMeta"><b>${l.miles} mi</b><div class="sheetSub">${currentChoiceIndex === 0 ? 'Recommended route' : 'Alternative route'}</div></div></div>
      <div class="provider ${engineClass}">${engineName}${chosen.trafficOk ? ' + live WSDOT traffic' : ''}</div>
      <div class="alts">${currentChoices.map((x, i) => { const q = routeLabel(x); return `<button class="altCard ${i === currentChoiceIndex ? 'on' : ''}" data-alt="${i}"><b>${q.mins} min · ${q.miles} mi</b><span>${i === 0 ? 'Recommended' : 'Alternative ' + (i + 1)}</span></button>`; }).join('')}</div>
      <div class="notice ${chosen.trafficOk ? 'good' : (isValhalla ? '' : 'warn')}">${esc(trafficNotice)}</div>
      <div class="steps">${steps.slice(0, 18).map(s => `<div class="step"><span class="stepIcon">${maneuverIcon(s)}</span><span class="stepText">${esc(stepInstruction(s))}</span><span class="stepDist">${fmtDist(s.distance || 0)}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:11px"><button id="reroute" class="primaryBtn">Refresh route</button><button id="routeSettings" class="secondaryBtn">Routing settings</button></div>`);

    document.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => chooseRoute(+b.dataset.alt));
    $('reroute').onclick = makeRoute;
    $('routeSettings').onclick = openSettings;
  };

  openSettings = function openSettingsNoKeys() {
    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Offroader settings</div><div class="sheetSub">No routing API key or payment method is required.</div></div><button class="closeBtn" data-close>×</button></div>
      <div class="settingsGrid">
        <div class="notice good"><b>Routing:</b> Valhalla is the primary routing engine. If its public demo is unavailable or rate-limited, Offroader automatically falls back to OSRM.</div>
        <div class="switchRow"><div><b>Show snapshot-only cameras</b><span>Live cameras stay green; snapshot cameras appear gray.</span></div><button id="photoToggle" class="toggle ${showPhotoCams ? 'on' : ''}"></button></div>
        <div class="switchRow"><div><b>Show WSDOT detector dots</b><span>Current measured speeds. These can adjust Washington route ranking and ETA.</span></div><button id="detToggle" class="toggle ${showDetectors ? 'on' : ''}"></button></div>
        <div class="notice">Valhalla and OSRM use OpenStreetMap road data. They are not Google Maps and do not have Google’s proprietary phone-location traffic dataset.</div>
      </div>`);

    $('photoToggle').onclick = () => {
      showPhotoCams = !showPhotoCams;
      $('photoToggle').classList.toggle('on', showPhotoCams);
      if (showPhotoCams) photoLayer.addTo(map);
      else if (map.hasLayer(photoLayer)) map.removeLayer(photoLayer);
      refreshDataPill();
    };
    $('detToggle').onclick = () => {
      showDetectors = !showDetectors;
      $('detToggle').classList.toggle('on', showDetectors);
      $('trafficBtn').classList.toggle('active', showDetectors);
      if (showDetectors) { drawDetectors(); detectorLayer.addTo(map); }
      else if (map.hasLayer(detectorLayer)) map.removeLayer(detectorLayer);
    };
  };

  // The original page attached the previous function object before this override loaded.
  $('settingsBtn').onclick = openSettings;
  $('brandBtn').onclick = () => showMessage('Routing uses Valhalla first and OSRM as an automatic fallback. No Mapbox token or payment method is needed. Live cameras are green; snapshot-only cameras are hidden by default.');

  console.info('Offroader: Valhalla routing enabled; Mapbox disabled.');
})();
