#!/usr/bin/env python3
import json, math, sys, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone

LOC_URL = "https://www.wsdot.com/Traffic/WebServices/SWRegion/Service.asmx/GetRTDBLocationData"
DATA_URL = "https://www.wsdot.com/Traffic/WebServices/SWRegion/Service.asmx/GetCurrentRTDBData1Mins"

def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Offroader/0.2 traffic-cache (+https://github.com/GGUI-Classroom/Offroad)",
        "Accept": "application/xml,text/xml,*/*",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def local(tag):
    return tag.split("}", 1)[-1]

def childmap(el):
    return {local(c.tag): (c.text or "").strip() for c in el}

def to_float(v):
    try:
        f=float(v)
        return f if math.isfinite(f) else None
    except Exception:
        return None

def to_int(v):
    try:
        return int(float(v))
    except Exception:
        return None

def main(out_path):
    loc_root = ET.fromstring(fetch(LOC_URL))
    data_root = ET.fromstring(fetch(DATA_URL))

    locations = {}
    for el in loc_root.iter():
        if local(el.tag) != "RTDBLocation":
            continue
        d = childmap(el)
        name = d.get("name") or d.get("Name")
        lat, lon = to_float(d.get("latitude")), to_float(d.get("longitude"))
        if not name or lat is None or lon is None:
            continue
        locations[name] = {
            "lat": lat, "lon": lon,
            "roadway": d.get("roadwaydescription") or d.get("roadway") or "",
            "location": d.get("location") or d.get("alias") or "",
            "side": d.get("sidedescription") or d.get("side") or "",
            "milepost": d.get("milepost") or "",
        }

    sensors = []
    for el in data_root.iter():
        if local(el.tag) != "RTDBElementData":
            continue
        d = childmap(el)
        name = d.get("Name") or d.get("name")
        if not name or name not in locations:
            continue
        speed_tenths = to_int(d.get("SpdTenths"))
        calc_tenths = to_int(d.get("CalcSpdTenths"))
        raw = speed_tenths if speed_tenths and speed_tenths > 0 else calc_tenths
        if raw is None or raw <= 0:
            continue
        mph = raw / 10.0
        if mph > 100:
            continue
        l = locations[name]
        sensors.append({
            "name": name,
            "lat": l["lat"], "lon": l["lon"],
            "roadway": l["roadway"], "location": l["location"],
            "side": l["side"], "milepost": l["milepost"],
            "mph": round(mph, 1),
            "volume": to_int(d.get("Volume")),
            "occupancy_tenths": to_int(d.get("OccTenths")),
        })

    payload = {
        "source": "WSDOT Southwest Region RTDB 1-minute feed",
        "source_urls": [LOC_URL, DATA_URL],
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "sensor_count": len(sensors),
        "sensors": sensors,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {len(sensors)} live sensors to {out_path}")
    if len(sensors) < 10:
        raise SystemExit("Traffic feed returned too few usable sensors; refusing to publish.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "wa-traffic.json")
