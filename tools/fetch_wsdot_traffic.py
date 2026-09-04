#!/usr/bin/env python3
import json, math, re, sys, urllib.request, xml.etree.ElementTree as ET
from collections import defaultdict
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
    return re.sub(r"[^A-Z0-9]+", "", (v or "").upper())

def station_name(v):
    # Live RTDB names are lane-level, e.g. 005es00032:_MS___1,
    # while the location table stores the station as 005es00032.
    return (v or "").split(":", 1)[0].strip()

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

def valid_speed_tenths(*values):
    for v in values:
        n = to_int(v)
        if n is not None and 0 < n <= 1000:
            return n
    return None

def main(out_path):
    loc_root = ET.fromstring(fetch(LOC_URL))
    data_root = ET.fromstring(fetch(DATA_URL))

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
            "station": name or alias,
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
    grouped = defaultdict(lambda: {"speeds": [], "volume": 0, "occ": [], "location": None, "lane_rows": 0})

    for el in data_root.iter():
        d = childmap(el)
        if "Name" not in d or ("SpdTenths" not in d and "CalcSpdTenths" not in d):
            continue
        live_rows += 1
        lane_name = d.get("Name") or ""
        base = station_name(lane_name)
        l = locations.get(norm(base)) or locations.get(norm(lane_name))
        if l is None:
            if len(unmatched) < 8:
                unmatched.append(lane_name)
            continue
        matched_rows += 1

        raw = valid_speed_tenths(d.get("SpdTenths"), d.get("CalcSpdTenths"))
        if raw is None:
            continue
        mph = raw / 10.0
        key = norm(l.get("station") or base)
        g = grouped[key]
        g["location"] = l
        g["speeds"].append(mph)
        g["lane_rows"] += 1
        vol = to_int(d.get("Volume"))
        if vol is not None and vol >= 0:
            g["volume"] += vol
        occ = to_int(d.get("OccTenths"))
        if occ is not None and 0 <= occ <= 1000:
            g["occ"].append(occ)

    sensors = []
    for key, g in grouped.items():
        if not g["speeds"] or not g["location"]:
            continue
        l = g["location"]
        # Median is less sensitive than mean to one bad lane reading.
        speeds = sorted(g["speeds"])
        n = len(speeds)
        mph = speeds[n // 2] if n % 2 else (speeds[n // 2 - 1] + speeds[n // 2]) / 2
        occ = None
        if g["occ"]:
            occ = round(sum(g["occ"]) / len(g["occ"]))
        sensors.append({
            "name": l.get("station") or key,
            "lat": l["lat"], "lon": l["lon"],
            "roadway": l["roadway"], "location": l["location"],
            "side": l["side"], "milepost": l["milepost"],
            "mph": round(mph, 1),
            "volume": g["volume"],
            "occupancy_tenths": occ,
            "lane_count_used": g["lane_rows"],
        })

    print(f"Parsed {location_rows} WSDOT station locations, {live_rows} live lane rows, {matched_rows} matched lane rows")
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
    print(f"Wrote {len(sensors)} current station speeds to {out_path}")
    if len(sensors) < 10:
        raise SystemExit("Traffic feed returned too few usable stations; refusing to publish.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "wa-traffic.json")
