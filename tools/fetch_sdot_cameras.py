#!/usr/bin/env python3
import json, re, sys, urllib.request
from datetime import datetime, timezone

URL = "https://web.seattle.gov/Travelers/api/Map/Data?zoomId=18&type=2"
IMAGE_BASE = "https://www.seattle.gov/trafficcams/images/"
STREAM_BASE = "https://61e0c5d388c2e.streamlock.net:443/live/"
UA = "Offroader/0.4 camera-cache (+https://github.com/GGUI-Classroom/Offroad)"

def clean_name(value):
    return str(value or "").replace("\r", "").replace("\n", "").strip().lstrip("/")

def stream_url_for(image_name, camera_type):
    if str(camera_type or "sdot").lower() != "sdot" or not image_name:
        return ""
    stream_name = re.sub(r"\.jpe?g$", ".stream", image_name, flags=re.I)
    if stream_name == image_name:
        stream_name = image_name + ".stream"
    return STREAM_BASE + stream_name + "/playlist.m3u8"

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
            image = clean_name(c.get("ImageUrl"))
            camera_type = str(c.get("Type") or "sdot")
            cams.append({
                "id": str(c.get("Id") or ""),
                "description": str(c.get("Description") or "Traffic camera"),
                "lat": lat,
                "lon": lon,
                "image_url": IMAGE_BASE + image if image else "",
                "stream_name": re.sub(r"\.jpe?g$", ".stream", image, flags=re.I) if image else "",
                "stream_url": stream_url_for(image, camera_type),
                "camera_type": camera_type,
            })
    result = {
        "source": "Seattle SDOT Traveler camera inventory",
        "source_url": URL,
        "official_live_view": "https://web.seattle.gov/Travelers/",
        "stream_base": STREAM_BASE,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "camera_count": len(cams),
        "cameras": cams,
    }
    if len(cams) < 500:
        raise SystemExit(f"SDOT camera feed returned only {len(cams)} cameras; refusing to publish")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {len(cams)} Seattle SDOT cameras with live HLS URLs")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "seattle-cameras.json")
