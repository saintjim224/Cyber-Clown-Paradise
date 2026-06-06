# Third Party Notices

This project uses dependencies by package installation or interface integration. Do not copy large upstream repositories into this codebase without updating this notice.

| Project | Use | License posture | Source | Integration |
| --- | --- | --- | --- | --- |
| FastAPI full-stack template | Docker/Postgres organization reference | MIT | https://github.com/fastapi/full-stack-fastapi-template | Reference only |
| Three.js | Native 3D park renderer and parameterized clown avatar factory | MIT | https://github.com/mrdoob/three.js | npm dependency |
| @mediapipe/tasks-vision | Browser-side face feature extraction; raw photos/video stay local | Apache-2.0 | https://www.npmjs.com/package/@mediapipe/tasks-vision | npm dependency |
| MediaPipe Face Landmarker | Camera face landmarks and blendshapes reference | Apache-2.0 samples | https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js | Browser-side reference |
| @amap/amap-jsapi-loader | Loads AMap JSAPI v2.0 for real campus base map, zoom, controls, and POI search | MIT | https://www.npmjs.com/package/@amap/amap-jsapi-loader | npm dependency |
| AMap JSAPI / LBS service | Real campus base map, PlaceSearch POI lookup, and map controls | AMap platform terms apply | https://lbs.amap.com/api/javascript-api-v2/summary/ | External API service |
| OpenStreetMap data | Campus roads, buildings, water, sport areas, and POI source for rasterized pixel maps | ODbL attribution required | https://www.openstreetmap.org/copyright | Data source |
| Overpass API | Public OpenStreetMap data retrieval for `scripts/generate-osm-campus-maps.mjs` | Service usage policy applies | https://overpass-api.de/ | External API service |
| React Three Fiber | Future React renderer option if the native Three.js layer is replaced | MIT | https://github.com/pmndrs/react-three-fiber | Reference only |
| drei | Future helper option if R3F is adopted | MIT | https://github.com/pmndrs/drei | Reference only |
| react-three-rapier | Future physics layer | MIT | https://github.com/pmndrs/react-three-rapier | Optional reference |
| three-vrm | Future VRM avatar support | MIT | https://github.com/pixiv/three-vrm | Optional npm dependency |
| TalkingHead | GLB facial/lip-sync architecture reference | MIT | https://github.com/met4citizen/TalkingHead | Reference only |
| pgvector | PostgreSQL vector extension | PostgreSQL License | https://github.com/pgvector/pgvector | Database extension |
| TripoSR | Image-to-3D fallback candidate | MIT | https://github.com/VAST-AI-Research/TripoSR | External service slot |
| TRELLIS.2 | Image-to-3D enhanced candidate | MIT | https://github.com/microsoft/TRELLIS.2 | External service slot |
| Stable Fast 3D | Image-to-3D enhanced candidate | Stability AI Community License | https://github.com/Stability-AI/stable-fast-3d | Isolated service only |
| Hunyuan3D-2 | Image-to-3D enhanced candidate | Tencent Hunyuan license terms | https://github.com/Tencent-Hunyuan/Hunyuan3D-2 | Isolated service only |

Commercial or public deployment must re-check upstream licenses and asset rights before enabling generated 3D model services.
