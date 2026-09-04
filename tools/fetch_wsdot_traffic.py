#!/usr/bin/env python3
import json, math, re, sys, urllib.request, xml.etree.ElementTree as ET
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

def norm(v):
    # WSDOT's location and live RTDB feeds occasionally differ in spacing,
    # punctuation and case. Normalize only for joining; preserve originals.
    return re.sub(r"[^A-Z0-9]+", "", (v or "").upper())

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

    # Index location records by both their RTDB name and alias. Do not rely on
    # a particular wrapper element; the HTTP and SOAP representations differ.
    locations = {}
    location_rows = 0
    for el in loc_root.iter():
        d = childmap(el)
        if "latitude" not in d or "longitude" not in d:
            continue
        name = d.get("name") or d.get("Name") or ""
        alias = d.get("alias") or d.get("Alias") or ""
        lat, lon = to_float(d.get("latitude")), to_float(d.get("longitude"))
        if lat is None or lon is None or (not name and not alias):
            continue
        row = {
            "lat": lat, "lon": lon,
            "roadway": d.get("roadwaydescription") or d.get("roadway") or "",
            "location": d.get("location") or alias or "",
            "side": d.get("sidedescription") or d.get("side") or "",
            "milepost": d.get("milepost") or "",
        }
        location_rows += 1
        for key in (name, alias):
            nk = norm(key)
            if nk:
                locations.setdefault(nk, row)

    live_rows = 0
    matched_rows = 0
    unmatched = []
    sensors = []
    seen = set()
    for el in data_root.iter():
        d = childmap(el)
        # Identify a live detector row by its fields instead of depending on
        # one exact XML parent tag name.
        if "Name" not in d or ("SpdTenths" not in d and "CalcSpdTenths" not in d):
            continue
        live_rows += 1
        name = d.get("Name") or ""
        l = locations.get(norm(name))
        if l is None:
            if len(unmatched) < 8:
                unmatched.append(name)
            continue
        matched_rows += 1

        speed_tenths = to_int(d.get("SpdTenths"))
        calc_tenths = to_int(d.get("CalcSpdTenths"))
        raw = speed_tenths if speed_tenths is not None and speed_tenths > 0 else calc_tenths
        if raw is None or raw <= 0:
            continue
        mph = raw / 10.0
        if not (0 < mph <= 100):
            continue

        # Avoid duplicates if WSDOT returns duplicate aggregate rows.
        sig = (norm(name), round(l["lat"], 6), round(l["lon"], 6))
        if sig in seen:
            continue
        seen.add(sig)
        sensors.append({
            "name": name,
            "lat": l["lat"], "lon": l["lon"],
            "roadway": l["roadway"], "location": l["location"],
            "side": l["side"], "milepost": l["milepost"],
            "mph": round(mph, 1),
            "volume": to_int(d.get("Volume")),
            "occupancy_tenths": to_int(d.get("OccTenths")),
        })

    print(f"Parsed {location_rows} WSDOT location rows, {live_rows} live RTDB rows, {matched_rows} matched rows")
    if unmatched:
        print("First unmatched RTDB names:", " | ".join(unmatched))

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
