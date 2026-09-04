#!/usr/bin/env python3
import json, sys, urllib.request
from datetime import datetime, timezone

URL = "https://web.seattle.gov/Travelers/api/Map/Data?zoomId=18&type=2"
IMAGE_BASE = "https://www.seattle.gov/trafficcams/images/"
UA = "Offroader/0.3 camera-cache (+https://github.com/GGUI-Classroom/Offroad)"

def main(out_path):
    req = urllib.request.Request(URL, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read().decode("utf-8"))
    cams = []
    for feature in payload.get("Features", []):
        coord = feature.get("PointCoordinate") or []
        if len(coord) != 2:
            continue
        try:
            lat, lon = float(coord[0]), float(coord[1])
        except Exception:
            continue
        for c in feature.get("Cameras", []) or []:
            image = str(c.get("ImageUrl") or "").strip()
            cams.append({
                "id": str(c.get("Id") or ""),
                "description": str(c.get("Description") or "Traffic camera"),
                "lat": lat,
                "lon": lon,
                "image_url": IMAGE_BASE + image.lstrip("/") if image else "",
                "camera_type": str(c.get("Type") or "sdot"),
            })
    result = {
        "source": "Seattle SDOT Traveler camera inventory",
        "source_url": URL,
        "official_live_view": "https://web.seattle.gov/Travelers/",
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "camera_count": len(cams),
        "cameras": cams,
    }
    if len(cams) < 500:
        raise SystemExit(f"SDOT camera feed returned only {len(cams)} cameras; refusing to publish")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {len(cams)} Seattle SDOT cameras")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "seattle-cameras.json")
