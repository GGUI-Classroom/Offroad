/* Offroader no-key routing override.
 * Primary: public OSRM demo endpoint already used by the base app.
 * Washington traffic ranking/ETA: existing WSDOT detector scoring.
 * No Mapbox, no Valhalla, no API key UI.
 */
(() => {
  'use strict';

  try { localStorage.removeItem('offroader_mapbox_token'); } catch {}

  makeRoute = async function makeRouteNoKey() {
    if (!myLocation || !destination) return;
    const req = ++routeReq;
    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Finding the best route…</div><div class="sheetSub">Checking road alternatives and live WSDOT speeds where available.</div></div><button class="closeBtn" data-close>×</button></div>`);
    try {
      const choices = await routeOsrm();
      if (req !== routeReq) return;
      currentChoices = choices.map((x, i) => ({ ...x, i, provider: 'osrm' }));
      currentChoiceIndex = 0;
      drawRouteChoices();
      renderRouteSheet('osrm');
    } catch (e) {
      console.error(e);
      setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Couldn’t build a route</div><div class="sheetSub">${esc(e.message)}</div></div><button class="closeBtn" data-close>×</button></div>`);
    }
  };

  renderRouteSheet = function renderRouteSheetNoKey() {
    const chosen = currentChoices[currentChoiceIndex];
    if (!chosen) return;
    const r = chosen.route;
    const l = routeLabel(chosen);
    const steps = r.legs?.flatMap(x => x.steps || []) || [];
    const trafficNotice = chosen.trafficOk
      ? `Route ranked with ${chosen.live.sensorCount} nearby WSDOT live detectors (${Math.round(chosen.live.coverage * 100)}% sampled coverage).`
      : 'This route uses OpenStreetMap road-network travel times. Live WSDOT detector coverage is limited here.';

    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">${esc(destination.title || destination.name)}</div><div class="sheetSub">${esc(destination.name)}</div></div><button class="closeBtn" data-close>×</button></div>
      <div class="routeHero"><div><div class="eta">${l.mins} min</div><div class="arrival">Arrive around ${arrivalText(chosen.eta)}</div></div><div class="routeMeta"><b>${l.miles} mi</b><div class="sheetSub">${currentChoiceIndex === 0 ? 'Recommended route' : 'Alternative route'}</div></div></div>
      <div class="provider fallback">No-key routing${chosen.trafficOk ? ' + live WSDOT traffic' : ''}</div>
      <div class="alts">${currentChoices.map((x, i) => { const q = routeLabel(x); return `<button class="altCard ${i === currentChoiceIndex ? 'on' : ''}" data-alt="${i}"><b>${q.mins} min · ${q.miles} mi</b><span>${i === 0 ? 'Recommended' : 'Alternative ' + (i + 1)}</span></button>`; }).join('')}</div>
      <div class="notice ${chosen.trafficOk ? 'good' : ''}">${esc(trafficNotice)}</div>
      <div class="steps">${steps.slice(0, 18).map(s => `<div class="step"><span class="stepIcon">${maneuverIcon(s)}</span><span class="stepText">${esc(stepInstruction(s))}</span><span class="stepDist">${fmtDist(s.distance || 0)}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:11px"><button id="reroute" class="primaryBtn">Refresh route</button><button id="routeSettings" class="secondaryBtn">Settings</button></div>`);

    document.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => chooseRoute(+b.dataset.alt));
    $('reroute').onclick = makeRoute;
    $('routeSettings').onclick = openSettings;
  };

  openSettings = function openSettingsNoKey() {
    setSheet(`<div class="sheetHead"><div><div class="sheetTitle">Offroader settings</div><div class="sheetSub">No routing key, token, account, or payment method is required.</div></div><button class="closeBtn" data-close>×</button></div>
      <div class="settingsGrid">
        <div class="notice good"><b>Routing:</b> Offroader uses the public OSRM road router and then applies WSDOT detector traffic scoring where there is enough live coverage.</div>
        <div class="switchRow"><div><b>Show snapshot-only Seattle cameras</b><span>Live Seattle cameras stay green; snapshots appear gray.</span></div><button id="photoToggle" class="toggle ${showPhotoCams ? 'on' : ''}"></button></div>
        <div class="switchRow"><div><b>Show WSDOT detector dots</b><span>Colored by current measured speed.</span></div><button id="detToggle" class="toggle ${showDetectors ? 'on' : ''}"></button></div>
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

  $('settingsBtn').onclick = openSettings;
  $('brandBtn').onclick = () => showMessage('No API key is used. Routing uses OSRM plus WSDOT live traffic scoring where available.');
  console.info('Offroader: no-key routing enabled.');
})();
