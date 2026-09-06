#!/usr/bin/env python3
"""
Autonomous Real-World Geographic Data Ingestion Pipeline for Hazaribagh, Jharkhand.
Queries the public OpenStreetMap Overpass API for highway networks, waterbodies (Hazaribagh Jheel),
natural topography, and cultural landmarks (Canary Hill, Gandhi Maidan, NH 33).
"""

import sys
import os
import json
import urllib.request
import urllib.error

# Real-world coordinate bounding box for Hazaribagh urban core and peripheries
# Latitude: 23.975 N to 24.025 N (encompasses Gandhi Maidan up to Canary Hill & Barhi NH33 route)
# Longitude: 85.340 E to 85.395 E (encompasses Lake, Sadar Hospital, Matwari, Korrah, Canary Hill)
BBOX_SOUTH = 23.975
BBOX_WEST = 85.340
BBOX_NORTH = 24.025
BBOX_EAST = 85.395

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"

def build_overpass_query() -> str:
    bbox_str = f"{BBOX_SOUTH},{BBOX_WEST},{BBOX_NORTH},{BBOX_EAST}"
    query = f"""[out:json][timeout:90];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified"]({bbox_str});
  way["natural"="water"]({bbox_str});
  way["water"~"lake|pond|reservoir"]({bbox_str});
  way["waterway"~"river|stream|canal"]({bbox_str});
  way["landuse"~"forest|recreation_ground|commercial|retail|residential"]({bbox_str});
  node["place"~"town|suburb|neighbourhood"]({bbox_str});
  node["amenity"]({bbox_str});
  node["tourism"]({bbox_str});
  node["leisure"]({bbox_str});
  node["name"]({bbox_str});
);
out body;
>;
out skel qt;"""
    return query

def fetch_hazaribagh_osm(output_path: str) -> bool:
    print(f"[GIS Pipeline] Initiating Overpass API query for Hazaribagh [{BBOX_SOUTH},{BBOX_WEST}] to [{BBOX_NORTH},{BBOX_EAST}]...")
    query = build_overpass_query()
    req = urllib.request.Request(
        OVERPASS_ENDPOINT,
        data=query.encode("utf-8"),
        headers={"User-Agent": "HazaribaghGameEngine/1.0 (Autonomous Real Data Fetcher)"}
    )

    try:
        with urllib.request.urlopen(req, timeout=100) as response:
            if response.status != 200:
                print(f"[GIS Pipeline] Error: Overpass API responded with HTTP status {response.status}", file=sys.stderr)
                return False
            payload = response.read().decode("utf-8")
            data = json.loads(payload)
            elements = data.get("elements", [])
            print(f"[GIS Pipeline] Successfully received {len(elements)} real OSM spatial records!")

            # Filter and validate key structural elements
            nodes = [e for e in elements if e.get("type") == "node"]
            ways = [e for e in elements if e.get("type") == "way"]
            highways = [w for w in ways if "highway" in w.get("tags", {})]
            waterways = [w for w in ways if any(k in w.get("tags", {}) for k in ["water", "natural", "waterway"])]
            named_landmarks = [e for e in elements if "name" in e.get("tags", {})]

            print(f"[GIS Pipeline] Verification: {len(nodes)} spatial nodes, {len(highways)} road corridors, {len(waterways)} waterbodies, {len(named_landmarks)} identified landmarks.")

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)

            file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"[GIS Pipeline] Cache successfully written to {output_path} ({file_size_mb:.2f} MB)")
            return True

    except urllib.error.URLError as e:
        print(f"[GIS Pipeline] Network connection failed: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[GIS Pipeline] Unexpected parsing failure: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    target_cache = os.path.join(script_dir, "..", "public", "data", "hazaribagh_osm.json")
    success = fetch_hazaribagh_osm(target_cache)
    if not success:
        sys.exit(1)
