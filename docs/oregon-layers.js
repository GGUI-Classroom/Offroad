/* Offroader Oregon layers
 * Official sources:
 * - ODOT TripCheck CCTV inventory ArcGIS layer
 * - City of Portland PBOT published speed/intersection safety-camera locations
 * Safety-camera locations are informational only and never affect routing.
 */
(() => {
  'use strict';

  const ODOT_QUERY = 'https://gis.odot.state.or.us/arcgis1006/rest/services/trip_check/Trip_Check_Terrain/MapServer/1/query';
  const TRIPCHECK = 'https://tripcheck.com/DynamicReports/Report/Cameras';
  const PBOT_SAFETY = 'https://www.portland.gov/transportation/vision-zero/safety-cameras';
  const PDX_GEOCODER = 'https://www.portlandmaps.com/arcgis/rest/services/Public/Geocoding_PDX/GeocodeServer/findAddressCandidates';

  const oregonLayer = L.layerGroup();
  const safetyLayer = L.layerGroup();
  let oregonLoaded = false;
  let oregonLoading = false;
  let safetyLoaded = false;
  let safetyLoading = false;
  let oregonCount = 0;

  const safetyCameras = [
    {type:'Speed',location:'SW Beaverton Hillsdale Highway near 35th Avenue',query:'SW Beaverton Hillsdale Hwy & SW 35th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'SW Beaverton Hillsdale Highway near 39th Drive',query:'SW Beaverton Hillsdale Hwy & SW 39th Dr, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'SE 122nd Avenue near Reedway Street',query:'SE 122nd Ave & SE Reedway St, Portland, OR',direction:'northbound',status:'Repair'},
    {type:'Speed',location:'SE 122nd Avenue near Steele Street',query:'SE 122nd Ave & SE Steele St, Portland, OR',direction:'southbound',status:'Repair'},
    {type:'Speed',location:'SE Division Street near 150th Avenue',query:'SE Division St & SE 150th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'SE Division Street near 150th Avenue',query:'SE Division St & SE 150th Ave, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'NE Marine Drive near 33rd Drive',query:'NE Marine Dr & NE 33rd Dr, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'NE Marine Drive near 138th Avenue',query:'NE Marine Dr & NE 138th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'NE Columbia Boulevard near 29th Avenue',query:'NE Columbia Blvd & NE 29th Ave, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'NE Columbia Boulevard near 33rd Drive',query:'NE Columbia Blvd & NE 33rd Dr, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'NE Sandy Boulevard near 75th Avenue',query:'NE Sandy Blvd & NE 75th Ave, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'NE Sandy Boulevard near 78th Avenue',query:'NE Sandy Blvd & NE 78th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'NE Martin Luther King Jr. Boulevard near Holman Street',query:'NE Martin Luther King Jr Blvd & NE Holman St, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Speed',location:'NE Martin Luther King Jr. Boulevard near Ashley Street',query:'NE Martin Luther King Jr Blvd & NE Ashley St, Portland, OR',direction:'southbound',status:'Enforcing'},
    {type:'Speed',location:'NE 82nd Avenue near Klickitat Street',query:'NE 82nd Ave & NE Klickitat St, Portland, OR',direction:'northbound',status:'Construction'},
    {type:'Speed',location:'NE 82nd Avenue near Klickitat Street',query:'NE 82nd Ave & NE Klickitat St, Portland, OR',direction:'southbound',status:'Enforcing'},
    {type:'Speed',location:'SE Powell Boulevard near 22nd Avenue',query:'SE Powell Blvd & SE 22nd Ave, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Speed',location:'SE Powell Boulevard near 34th Avenue',query:'SE Powell Blvd & SE 34th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Speed',location:'SE Powell Boulevard between 60th - 75th Avenue',query:'SE Powell Blvd & SE 67th Ave, Portland, OR',direction:'eastbound',status:'Design'},
    {type:'Speed',location:'SE Powell Boulevard between 77th - 60th Avenue',query:'SE Powell Blvd & SE 67th Ave, Portland, OR',direction:'westbound',status:'Design'},
    {type:'Speed',location:'SW Barbur Boulevard near 6100 block',query:'6100 SW Barbur Blvd, Portland, OR',direction:'northbound',status:'Design'},
    {type:'Speed',location:'SW Barbur Boulevard near 5900 block',query:'5900 SW Barbur Blvd, Portland, OR',direction:'southbound',status:'Design'},

    {type:'Intersection',location:'NE Martin Luther King Jr. at Lloyd boulevards',query:'NE Martin Luther King Jr Blvd & NE Lloyd Blvd, Portland, OR',direction:'southbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Foster Road at 96th Avenue',query:'SE Foster Rd & SE 96th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Stark Street at 99th Avenue',query:'SE Stark St & SE 99th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Stark Street at 102nd Avenue',query:'SE Stark St & SE 102nd Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Stark Street at 122nd Avenue',query:'SE Stark St & SE 122nd Ave, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Stark Street at 148th Avenue',query:'SE Stark St & SE 148th Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Washington Street at 103rd Drive',query:'SE Washington St & SE 103rd Dr, Portland, OR',direction:'eastbound',status:'Enforcing'},
    {type:'Intersection',location:'NE Grand Avenue at Couch Street',query:'NE Grand Ave & NE Couch St, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Intersection',location:'SE 82nd Avenue at Woodstock Boulevard',query:'SE 82nd Ave & SE Woodstock Blvd, Portland, OR',direction:'northbound',status:'Offline'},
    {type:'Intersection',location:'NE 122nd Avenue at Halsey',query:'NE 122nd Ave & NE Halsey St, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Intersection',location:'NE César E Chávez Boulevard at Sandy Boulevard',query:'NE Cesar E Chavez Blvd & NE Sandy Blvd, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Intersection',location:'NE Sandy Boulevard at César E Chávez Boulevard',query:'NE Sandy Blvd & NE Cesar E Chavez Blvd, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'SE Grand Avenue at Madison Street',query:'SE Grand Ave & SE Madison St, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Intersection',location:'NE 82nd Avenue at E Burnside Street',query:'NE 82nd Ave & E Burnside St, Portland, OR',direction:'southbound',status:'Enforcing'},
    {type:'Intersection',location:'NE 82nd Avenue at Glisan Street',query:'NE 82nd Ave & NE Glisan St, Portland, OR',direction:'northbound',status:'Enforcing'},
    {type:'Intersection',location:'NE Glisan Street at 82nd Avenue',query:'NE Glisan St & NE 82nd Ave, Portland, OR',direction:'westbound',status:'Enforcing'},
    {type:'Intersection',location:'NE Broadway and Grand Avenue',query:'NE Broadway & NE Grand Ave, Portland, OR',direction:'westbound',status:'Enforcing'}
  ];

  function esc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function goodUrl(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
  function chooseImage(a){
    const values=[a.cctv_url,a.cctv_image,a.cctv_other].map(goodUrl).filter(Boolean);
    return values.find(x=>/\.(jpe?g|png|gif)(\?|$)/i.test(x)) || values.find(x=>/camera|cctv|image/i.test(x)) || '';
  }
  function chooseOfficial(a){return [a.cctv_other,a.cctv_url].map(goodUrl).find(Boolean) || TRIPCHECK;}

  function addStyles(){
    if(document.getElementById('orLayerStyles'))return;
    const s=document.createElement('style');s.id='orLayerStyles';s.textContent=`
      .or-fabs{position:fixed;z-index:1600;right:14px;top:250px;display:flex;flex-direction:column;gap:9px;pointer-events:auto}
      .or-fab{width:52px;height:52px;border:0;border-radius:17px;background:#fff;color:#17202a;box-shadow:0 5px 20px #0002;font:800 11px/1 system-ui;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
      .or-fab .emoji{font-size:20px;line-height:1}.or-fab.on{background:#102a43;color:#fff}.or-fab.safety.on{background:#f4b400;color:#241a00}
      .or-sheet{position:fixed;z-index:2200;left:50%;bottom:16px;transform:translateX(-50%);width:min(650px,calc(100% - 24px));max-height:68vh;overflow:auto;background:#fff;border-radius:24px;box-shadow:0 14px 55px #0005;padding:16px;color:#14202c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
      .or-sheet.hidden{display:none}.or-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.or-title{font-size:19px;font-weight:850}.or-sub{font-size:12px;color:#667483;margin-top:3px}.or-close{border:0;background:#edf1f5;border-radius:12px;padding:8px 11px;font-weight:800;cursor:pointer}
      .or-camera-img{width:100%;max-height:390px;object-fit:contain;background:#0b0d10;border-radius:16px;margin-top:12px;display:block}.or-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.or-btn{border:0;border-radius:12px;padding:10px 13px;font-weight:800;cursor:pointer;background:#1769e0;color:#fff}.or-btn.gray{background:#edf1f5;color:#182431}.or-note{font-size:12px;line-height:1.45;background:#f3f6f9;border-radius:13px;padding:10px 11px;margin-top:10px;color:#566473}
      .or-badge{display:inline-block;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:800;margin-top:8px;background:#eaf2ff;color:#1554a1}.or-badge.enforcing{background:#e9f7ef;color:#12673c}.or-badge.offline,.or-badge.repair{background:#fff1e8;color:#9a4611}.or-badge.design,.or-badge.construction{background:#fff5d7;color:#795900}
      .or-toast{position:fixed;z-index:2300;left:50%;top:85px;transform:translateX(-50%);background:#14202c;color:#fff;border-radius:999px;padding:9px 13px;font:750 12px system-ui;box-shadow:0 5px 18px #0004;max-width:calc(100% - 28px);text-align:center}
      @media(max-width:600px){.or-fabs{top:245px;right:10px}.or-fab{width:46px;height:46px;border-radius:15px;font-size:10px}.or-fab .emoji{font-size:18px}.or-sheet{bottom:10px;max-height:62vh}}
    `;document.head.appendChild(s);
  }

  function toast(text,ms=2600){let t=document.getElementById('orToast');if(!t){t=document.createElement('div');t.id='orToast';t.className='or-toast';document.body.appendChild(t);}t.textContent=text;clearTimeout(t._timer);t._timer=setTimeout(()=>t.remove(),ms);}
  function sheet(html){let p=document.getElementById('orSheet');if(!p){p=document.createElement('div');p.id='orSheet';p.className='or-sheet hidden';document.body.appendChild(p);}p.innerHTML=html;p.classList.remove('hidden');p.querySelector('[data-close]')?.addEventListener('click',()=>p.classList.add('hidden'));return p;}

  async function fetchOregonPage(offset){
    const q=new URLSearchParams({where:'1=1',outFields:'OBJECTID,agencyName,organization_name,device_id,device_name,latitude,longitude,cctv_image,cctv_url,cctv_other,route_designator',returnGeometry:'false',resultOffset:String(offset),resultRecordCount:'1000',orderByFields:'OBJECTID',f:'json'});
    const r=await fetch(ODOT_QUERY+'?'+q,{cache:'no-store'});if(!r.ok)throw Error('ODOT HTTP '+r.status);const j=await r.json();if(j.error)throw Error(j.error.message||'ODOT query failed');return j.features||[];
  }
  async function loadOregonCameras(){
    if(oregonLoaded||oregonLoading)return;oregonLoading=true;toast('Loading Oregon TripCheck cameras…',5000);
    try{
      let offset=0,all=[];
      for(let page=0;page<5;page++){
        const f=await fetchOregonPage(offset);all.push(...f);if(f.length<1000)break;offset+=f.length;
      }
      oregonLayer.clearLayers();oregonCount=0;
      for(const f of all){const a=f.attributes||{};const lat=Number(a.latitude),lon=Number(a.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        // Keep Oregon and the immediate Portland border area, while filtering obvious non-Oregon partner records.
        const name=String(a.device_name||a.route_designator||'ODOT traffic camera');
        if(lat<41.9||lat>46.35||lon<-124.85||lon>-116.3)continue;
        if(/Washington\s*-|Idaho\s*-|California\s*-/i.test(name))continue;
        const img=chooseImage(a),official=chooseOfficial(a),provider=a.organization_name||a.agencyName||'ODOT / partner';
        const m=L.circleMarker([lat,lon],{radius:5,weight:2,color:'#fff',fillColor:'#4a35d1',fillOpacity:.95});
        m.bindTooltip(esc(name));m.on('click',()=>openOregonCamera({name,provider,img,official,route:a.route_designator||'',lat,lon}));m.addTo(oregonLayer);oregonCount++;
      }
      oregonLoaded=true;toast(`Loaded ${oregonCount} Oregon TripCheck cameras`);
      updateButtons();
    }catch(e){console.error(e);toast('Oregon cameras failed to load: '+e.message,5000);}finally{oregonLoading=false;}
  }
  function openOregonCamera(c){
    const img=c.img?`<img class="or-camera-img" src="${esc(c.img+(c.img.includes('?')?'&':'?')+'t='+Date.now())}" alt="Current traffic camera image" onerror="this.style.display='none';document.getElementById('orImgFail').style.display='block'">`:'';
    const p=sheet(`<div class="or-head"><div><div class="or-title">${esc(c.name)}</div><div class="or-sub">${esc(c.provider)}${c.route?' · '+esc(c.route):''}</div></div><button class="or-close" data-close>×</button></div>${img}<div id="orImgFail" class="or-note" style="display:${c.img?'none':'block'}">No direct current image URL was published in the TripCheck inventory for this camera.</div><div class="or-actions"><button class="or-btn" data-refresh>Refresh image</button><button class="or-btn gray" data-official>Open TripCheck</button></div><div class="or-note">ODOT’s statewide TripCheck inventory primarily publishes current still images. Selected Portland-metro cameras may offer a short live-stream session on TripCheck itself.</div>`);
    p.querySelector('[data-refresh]')?.addEventListener('click',()=>openOregonCamera(c));
    p.querySelector('[data-official]')?.addEventListener('click',()=>window.open(c.official||TRIPCHECK,'_blank','noopener'));
  }

  const coordCache=(()=>{try{return JSON.parse(localStorage.getItem('offroader.pdxSafetyCoords.v2')||'{}')}catch{return {}}})();
  function saveCoordCache(){try{localStorage.setItem('offroader.pdxSafetyCoords.v2',JSON.stringify(coordCache))}catch{}}
  async function geocodeSafety(cam){
    if(coordCache[cam.query])return coordCache[cam.query];
    const q=new URLSearchParams({SingleLine:cam.query,outFields:'Match_addr',maxLocations:'1',outSR:'4326',f:'json'});
    const r=await fetch(PDX_GEOCODER+'?'+q);if(!r.ok)throw Error('geocoder '+r.status);const j=await r.json();const c=j.candidates?.[0];if(!c?.location)return null;
    const pt={lat:Number(c.location.y),lon:Number(c.location.x),score:Number(c.score)||0};if(!Number.isFinite(pt.lat)||!Number.isFinite(pt.lon))return null;coordCache[cam.query]=pt;saveCoordCache();return pt;
  }
  async function loadSafetyCameras(){
    if(safetyLoaded||safetyLoading)return;safetyLoading=true;toast('Loading Portland safety-camera locations…',5000);
    try{
      safetyLayer.clearLayers();let loaded=0;
      const unique=[...new Map(safetyCameras.map(c=>[c.query,c])).values()];
      for(let i=0;i<unique.length;i+=5){await Promise.allSettled(unique.slice(i,i+5).map(geocodeSafety));}
      for(const c of safetyCameras){const pt=coordCache[c.query];if(!pt)continue;const color=c.type==='Speed'?'#f3a600':'#db3b48';
        const m=L.circleMarker([pt.lat,pt.lon],{radius:7,weight:2,color:'#fff',fillColor:color,fillOpacity:.97});m.bindTooltip(`${esc(c.type)} safety camera · ${esc(c.location)}`);m.on('click',()=>openSafety(c,pt));m.addTo(safetyLayer);loaded++;}
      safetyLoaded=true;toast(`Loaded ${loaded} Portland safety-camera entries`);updateButtons();
    }catch(e){console.error(e);toast('Safety-camera layer failed: '+e.message,5000);}finally{safetyLoading=false;}
  }
  function openSafety(c,pt){const cls=String(c.status||'').toLowerCase().replace(/\s+/g,'-');const p=sheet(`<div class="or-head"><div><div class="or-title">${esc(c.type)} safety camera</div><div class="or-sub">${esc(c.location)}</div></div><button class="or-close" data-close>×</button></div><span class="or-badge ${esc(cls)}">${esc(c.status)}</span><div class="or-note"><b>Direction:</b> ${esc(c.direction)}<br><b>Location:</b> approximate pin based on PBOT’s published location description.<br><br>This layer is a neutral road-safety reference. Offroader does not alter routes to avoid enforcement cameras.</div><div class="or-actions"><button class="or-btn gray" data-pbot>PBOT official page</button></div>`);p.querySelector('[data-pbot]')?.addEventListener('click',()=>window.open(PBOT_SAFETY,'_blank','noopener'));}

  function addControls(){
    if(document.getElementById('oregonFabs'))return;
    const wrap=document.createElement('div');wrap.id='oregonFabs';wrap.className='or-fabs';wrap.innerHTML=`<button class="or-fab" id="orCamFab" title="Oregon TripCheck cameras"><span class="emoji">🎥</span><span>OREGON</span></button><button class="or-fab safety" id="safetyFab" title="Portland speed and intersection safety cameras"><span class="emoji">⚠️</span><span>SAFETY</span></button>`;document.body.appendChild(wrap);
    document.getElementById('orCamFab').onclick=async()=>{if(!oregonLoaded)await loadOregonCameras();if(map.hasLayer(oregonLayer)){map.removeLayer(oregonLayer)}else{oregonLayer.addTo(map);map.setView([44.1,-120.6],7)}updateButtons();};
    document.getElementById('safetyFab').onclick=async()=>{if(!safetyLoaded)await loadSafetyCameras();if(map.hasLayer(safetyLayer)){map.removeLayer(safetyLayer)}else{safetyLayer.addTo(map);map.setView([45.52,-122.64],11)}updateButtons();};
    updateButtons();
  }
  function updateButtons(){document.getElementById('orCamFab')?.classList.toggle('on',map.hasLayer(oregonLayer));document.getElementById('safetyFab')?.classList.toggle('on',map.hasLayer(safetyLayer));}

  addStyles();addControls();
  // Preload the lightweight inventory after the main app settles, but do not force the layer on.
  setTimeout(loadOregonCameras,1800);
})();
