#!/usr/bin/env python3
import bisect, json, math, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone

DEF_URL = "https://data.wsdot.wa.gov/traffic/nw/FlowData/1minute/MinuteDataDefnNW.xml"
DATA_URL = "https://data.wsdot.wa.gov/traffic/nw/FlowData/1minute/MinuteDataNW.xml"
MILEPOST_QUERY = "https://data.wsdot.wa.gov/arcgis/rest/services/Shared/MilepostValues/FeatureServer/3/query"
CACHE_URL = "https://raw.githubusercontent.com/GGUI-Classroom/Offroad/traffic-data/nw-station-locations.json"
UA = "Offroader/0.3 traffic-cache (+https://github.com/GGUI-Classroom/Offroad)"


def fetch_bytes(url, accept="*/*", timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_json(url, timeout=90):
    return json.loads(fetch_bytes(url, "application/json,*/*", timeout).decode("utf-8"))


def text(el, name, default=""):
    child = el.find(name)
    return (child.text or "").strip() if child is not None else default


def fnum(v):
    try:
        n = float(v)
        return n if math.isfinite(n) else None
    except Exception:
        return None


def inum(v):
    try:
        return int(float(v))
    except Exception:
        return None


def route3(v):
    v = str(v or "").strip()
    return v.zfill(3) if v.isdigit() else v


def station_base(station_id):
    return str(station_id or "").split(":", 1)[0].strip()


def parse_definition(raw):
    root = ET.fromstring(raw)
    version = text(root, "station_version", "")
    defs = {}
    for s in root.findall("station"):
        sid = (s.attrib.get("id") or "").strip()
        mp = fnum(text(s, "milepost"))
        route = route3(text(s, "route"))
        if not sid or mp is None or not route:
            continue
        defs[sid] = {
            "base": station_base(sid),
            "route": route,
            "direction": text(s, "direction").upper(),
            "milepost": mp,
            "location": text(s, "location"),
        }
    return root, version, defs


def parse_live(raw, defs):
    root = ET.fromstring(raw)
    rows = []
    for s in root.findall("station"):
        sid = (s.attrib.get("id") or "").strip()
        if sid not in defs or (s.attrib.get("stat") or "").lower() != "good":
            continue
        mph = fnum(text(s, "spd"))
        if mph is None or not (0 < mph <= 100):
            continue
        rows.append({
            "id": sid,
            "mph": mph,
            "volume": inum(text(s, "vol")),
            "occupancy": inum(text(s, "occ")),
        })
    return root, rows


def load_existing_location_cache(version):
    try:
        j = fetch_json(CACHE_URL, timeout=20)
        if str(j.get("station_version", "")) == str(version) and len(j.get("locations", {})) >= 100:
            print(f"Using cached WSDOT NW station geography: {len(j['locations'])} stations")
            return j
    except Exception as e:
        print("No reusable station-location cache:", e)
    return None


def fetch_route_mileposts(route):
    points = []
    offset = 0
    while True:
        params = {
            "where": f"StateRouteNumber='{route}'",
            "outFields": "StateRouteNumber,SRMP,Direction,Longitude,Latitude",
            "returnGeometry": "false",
            "orderByFields": "SRMP",
            "resultOffset": str(offset),
            "resultRecordCount": "1000",
            "f": "json",
        }
        url = MILEPOST_QUERY + "?" + urllib.parse.urlencode(params)
        j = fetch_json(url)
        if j.get("error"):
            raise RuntimeError(f"ArcGIS route {route}: {j['error']}")
        features = j.get("features", [])
        for feat in features:
            a = feat.get("attributes") or {}
            mp, lat, lon = fnum(a.get("SRMP")), fnum(a.get("Latitude")), fnum(a.get("Longitude"))
            if mp is None or lat is None or lon is None:
                continue
            points.append((mp, lat, lon, str(a.get("Direction") or "").upper()))
        if len(features) < 1000 and not j.get("exceededTransferLimit"):
            break
        offset += len(features)
        if not features or offset > 50000:
            break
    points.sort(key=lambda x: x[0])
    print(f"Milepost geography {route}: {len(points)} points")
    return points


def nearest_milepost(points, milepost):
    if not points:
        return None
    vals = [p[0] for p in points]
    i = bisect.bisect_left(vals, milepost)
    candidates = points[max(0, i - 3): min(len(points), i + 4)]
    if not candidates:
        return None
    p = min(candidates, key=lambda x: abs(x[0] - milepost))
    # 1/10-mile reference data should normally be within 0.06 mi. Allow a
    # little more for ahead/back milepost quirks, but reject obviously bad joins.
    return p if abs(p[0] - milepost) <= 0.20 else None


def build_location_cache(version, defs, active_ids):
    # One cabinet/base can contain many lane sensors; resolve geography once.
    bases = {}
    for sid in active_ids:
        d = defs.get(sid)
        if d and d["base"] not in bases:
            bases[d["base"]] = d
    routes = sorted({d["route"] for d in bases.values() if d["route"].isdigit()})
    by_route = {route: fetch_route_mileposts(route) for route in routes}

    locations = {}
    for base, d in bases.items():
        p = nearest_milepost(by_route.get(d["route"], []), d["milepost"])
        if not p:
            continue
        locations[base] = {
            "lat": round(p[1], 7), "lon": round(p[2], 7),
            "route": d["route"], "direction": d["direction"],
            "milepost": d["milepost"], "location": d["location"],
        }
    print(f"Built geography for {len(locations)} active WSDOT NW detector cabinets")
    return {
        "station_version": version,
        "built_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "WSDOT Northwest station definition + WSDOT 1/10-mile LRS points",
        "locations": locations,
    }


def median(values):
    values = sorted(values)
    n = len(values)
    if not n:
        return None
    return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2.0


def main(out_path, cache_out):
    def_raw = fetch_bytes(DEF_URL, "application/xml,text/xml,*/*")
    data_raw = fetch_bytes(DATA_URL, "application/xml,text/xml,*/*")
    def_root, version, defs = parse_definition(def_raw)
    data_root, live = parse_live(data_raw, defs)
    print(f"WSDOT NW definition version {version}: {len(defs)} definitions; {len(live)} good live speed rows")
    if len(live) < 100:
        raise SystemExit("Northwest live feed returned too few good speed rows; refusing to publish.")

    cache = load_existing_location_cache(version)
    if cache is None:
        cache = build_location_cache(version, defs, [x["id"] for x in live])
    locations = cache.get("locations", {})

    grouped = defaultdict(lambda: {"speeds": [], "volume": 0, "occ": [], "lanes": 0, "def": None})
    for row in live:
        d = defs[row["id"]]
        base = d["base"]
        if base not in locations:
            continue
        g = grouped[base]
        g["def"] = d
        g["speeds"].append(row["mph"])
        g["lanes"] += 1
        if row["volume"] is not None and row["volume"] >= 0:
            g["volume"] += row["volume"]
        if row["occupancy"] is not None and row["occupancy"] >= 0:
            g["occ"].append(row["occupancy"])

    sensors = []
    for base, g in grouped.items():
        loc = locations[base]
        mph = median(g["speeds"])
        if mph is None:
            continue
        occ = round(sum(g["occ"]) / len(g["occ"])) if g["occ"] else None
        sensors.append({
            "name": base,
            "lat": loc["lat"], "lon": loc["lon"],
            "roadway": loc["route"], "route": loc["route"],
            "direction": loc.get("direction", ""),
            "location": loc.get("location", ""),
            "milepost": loc.get("milepost"),
            "mph": round(mph, 1),
            "volume": g["volume"],
            "occupancy_percent": occ,
            "lane_count_used": g["lanes"],
        })

    payload = {
        "source": "WSDOT Northwest Region 1-minute detector feed",
        "source_urls": [DEF_URL, DATA_URL, MILEPOST_QUERY],
        "source_timestamp": data_root.attrib.get("time_stamp"),
        "definition_timestamp": def_root.attrib.get("time_stamp"),
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sensor_count": len(sensors),
        "sensors": sensors,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)
    with open(cache_out, "w", encoding="utf-8") as f:
        json.dump(cache, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {len(sensors)} geolocated Northwest current detector speeds")
    if len(sensors) < 100:
        raise SystemExit("Too few geolocated Northwest traffic detectors; refusing to publish.")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "wa-traffic.json"
    cache_out = sys.argv[2] if len(sys.argv) > 2 else "nw-station-locations.json"
    main(out, cache_out)
