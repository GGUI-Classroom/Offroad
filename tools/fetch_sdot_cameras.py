#!/usr/bin/env python3
import json, re, sys, urllib.request
from datetime import datetime, timezone

CAMERAS_URL = "https://web.seattle.gov/Travelers/api/Map/Data?zoomId=18&type=2"
WOWSA_URL = "https://web.seattle.gov/Travelers/api/Map/WowsaUrl"
IMAGE_BASE = "https://www.seattle.gov/trafficcams/images/"
FALLBACK_STREAM_TEMPLATE = "https://61e0c5d388c2e.streamlock.net:443/live/{stream}/playlist.m3u8"
UA = "Offroader/0.5 camera-cache (+https://github.com/GGUI-Classroom/Offroad)"

def fetch(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")

def clean_name(value):
    return str(value or "").replace("\r", "").replace("\n", "").strip().lstrip("/")

def stream_name_for(image_name):
    if not image_name:
        return ""
    stream_name = re.sub(r"\.jpe?g$", ".stream", image_name, flags=re.I)
    if stream_name == image_name:
        stream_name = image_name + ".stream"
    return stream_name

def get_stream_template():
    try:
        value = json.loads(fetch(WOWSA_URL))
        if isinstance(value, str) and value.startswith("https://") and "{stream}" in value:
            return value
        print("Unexpected SDOT WowsaUrl response; using fallback template:", repr(value))
    except Exception as e:
        print("Could not read SDOT WowsaUrl; using fallback template:", e)
    return FALLBACK_STREAM_TEMPLATE

def stream_url_for(image_name, camera_type, template):
    if str(camera_type or "sdot").lower() != "sdot" or not image_name:
        return ""
    return template.replace("{stream}", stream_name_for(image_name))

def main(out_path):
    payload = json.loads(fetch(CAMERAS_URL))
    stream_template = get_stream_template()
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
                "stream_name": stream_name_for(image),
                "stream_url": stream_url_for(image, camera_type, stream_template),
                "camera_type": camera_type,
            })
    result = {
        "source": "Seattle SDOT Traveler camera inventory",
        "source_url": CAMERAS_URL,
        "wowsa_url_source": WOWSA_URL,
        "official_live_view": "https://web.seattle.gov/Travelers/",
        "stream_template": stream_template,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "camera_count": len(cams),
        "cameras": cams,
    }
    if len(cams) < 500:
        raise SystemExit(f"SDOT camera feed returned only {len(cams)} cameras; refusing to publish")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {len(cams)} Seattle SDOT cameras using current WowsaUrl template")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "seattle-cameras.json")
