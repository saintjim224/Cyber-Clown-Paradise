# CyberJoker Park

赛博小丑乐园是一个 Web/PWA 展台 MVP：用户生成自己的 Q 版小丑宠物，I 人寄存情绪气球，E 人或自主小丑完成治愈互动，用户扫码回访时看到 3D 乐园回放。

## Stack

- Frontend: Next.js, TypeScript, native Three.js, MediaPipe Face Landmarker, lucide-react.
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL/pgvector, Redis, MinIO/S3.
- AI: OpenAI Responses API through a replaceable adapter with deterministic fallback.
- 3D avatar jobs: asynchronous job records with a recipe-render fallback and optional TripoSR-compatible service slot.

## Local Start

```powershell
Copy-Item .env.example .env
npm install
python -m venv .venv
.\.venv\Scripts\python -m pip install -r apps/api/requirements.txt
docker compose -f infra/docker-compose.yml up postgres redis minio -d
.\.venv\Scripts\python -m alembic -c apps/api/alembic.ini upgrade head
npm run api
npm run dev:web
```

The web app runs on `http://localhost:3000`; the API runs on `http://localhost:8000`.

## AMap Campus Map

Fill these values in the root `.env` before starting the frontend:

```env
NEXT_PUBLIC_AMAP_JSAPI_KEY=your_amap_web_key
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=your_amap_security_js_code
```

AMap gives the project a real proportional base map, zoom controls, and POI lookup. The Stardew-style 1:1 pixel campus still needs an authorized data-to-tile pipeline: campus boundary, roads, buildings, water, and POI coordinates are projected into the pixel grid, then replaced with final art tiles.

## Full Docker

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

## Notes

- Raw face photos and video are not uploaded or persisted by default. The browser extracts a low-dimensional face descriptor and sends only confirmed text, avatar recipes, generated clown assets, and event logs.
- If `OPENAI_ENABLE_REMOTE=false` or `OPENAI_API_KEY` is empty, the API uses deterministic fallback generation so the demo still works offline.
- The frontend uses the same `avatar_recipe` on the identity card, 3D park, and replay page. GLB generation can enhance the result later, but the main flow never blocks on it.
