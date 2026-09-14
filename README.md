# Coal & Clay — full-stack setup

Real backend (Node/Express + PostgreSQL via Prisma + Socket.IO) wired up to the three
existing React dashboards: **customer**, **kitchen**, and **owner**.

```
coal-and-clay/
├── backend/                       Express API + Socket.IO + Prisma
├── frontend/coal-and-clay-frontend/   Single React codebase, run 3x (one per role)
└── docker-compose.yml
```

## 1. Prerequisites

- Docker + Docker Compose (easiest path), **or** Node.js 20+ and a local Postgres install
- Node.js 20+ if you want to run the frontends outside Docker (recommended for dev — faster hot reload)

## 2. Quick start (recommended): Docker for Postgres + API, npm for the frontends

```bash
# from the project root
docker compose up -d postgres backend
```

This starts Postgres and the API on `http://localhost:4000`. The backend container
automatically runs `prisma migrate deploy` and the seed script on first boot, so the
menu, ingredients, staff, and tables are populated immediately.

Then, in three separate terminals, run each dashboard on its own port:

```bash
cd frontend/coal-and-clay-frontend
npm install

npm run dev:customer   # http://localhost:5173
npm run dev:kitchen    # http://localhost:5174
npm run dev:owner      # http://localhost:5175
```

Open all three in separate browser tabs/windows — place an order on the customer
tab and watch it appear instantly on the kitchen and owner tabs via Socket.IO.

**Demo login:** `demo@coalandclay.test` / `demo1234` (or just sign up a new account).

## 3. Alternative: everything in Docker

```bash
docker compose --profile full up --build
```

This also builds and serves the three frontends as static builds on the same ports
(5173/5174/5175). Slower to iterate on since it's a full rebuild per change — use
this to sanity-check a fully containerized deployment, not for day-to-day dev.

## 4. Fully manual setup (no Docker at all)

```bash
# 1. Start your own local Postgres and create a database + user matching
#    backend/.env.example, e.g.:
createuser coalclay --pwprompt
createdb coalclay -O coalclay

# 2. Backend
cd backend
cp .env.example .env        # edit DATABASE_URL if yours differs
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev                 # http://localhost:4000

# 3. Frontend (in another terminal)
cd frontend/coal-and-clay-frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev:customer        # + dev:kitchen, dev:owner in more terminals
```

## 5. What's wired up

| Area | Details |
|---|---|
| **Database** | Postgres via Prisma. Tables: `users`, `staff`, `tables`, `menu_items`, `ingredients`, `orders`, plus a `menu_item_ingredients` join table that maps each dish to what it consumes per order. |
| **Auth** | `POST /api/auth/signup`, `/login` (bcrypt + JWT), `/otp/send`, `/otp/verify`. OTP is stubbed — the code is logged to the backend console instead of sent via SMS. Swap the `console.log` in `backend/src/routes/auth.js` for a Twilio/MSG91 call when you're ready to go live. |
| **Orders** | `POST /api/orders` creates an order, decrements the ingredient stock for every item, and auto-marks any dish "unavailable" the instant one of its ingredients hits zero — all in a single DB transaction. `GET /api/orders`, `PATCH /:id/status`, `PATCH /:id/priority`, `PATCH /:id/payment` round it out. |
| **Realtime** | Socket.IO events: `order:new`, `order:updated`, `menu:updated`, `ingredient:updated`, `table:updated`. All three dashboards subscribe and patch their local state live — no more `setInterval` mock data anywhere. |
| **Owner analytics** | `GET /api/analytics/sales?range=today|week|month`, `GET /api/analytics/peak-hours`, `GET /api/tables`, `GET /api/staff`. |

## 6. Notes on the existing frontend

While wiring things up, two pre-existing issues in the uploaded frontend were fixed
so the app actually builds:
- `recharts` was imported by `OwnerDashboard.jsx` but was never listed in `package.json` — added it.
- `main.jsx` imported `./App.jsx`, but the file on disk is `app.jsx`. Windows/macOS
  filesystems are case-insensitive so this never surfaced locally, but it fails the
  build on Linux/Docker (case-sensitive filesystem) — fixed the import casing.

The three dashboards are still one React codebase (matching what you uploaded) rather
than three separate projects — `npm run dev:customer|kitchen|owner` just runs the same
app on three ports, and `app.jsx` picks which dashboard to render based on the port
(or `VITE_APP_ROLE`, or a `?role=` query param for quick previewing). This means the
API/socket/UI code stays a single source of truth instead of being triplicated.

## 7. Environment variables

**`backend/.env`** (see `backend/.env.example`):
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — any long random string in production
- `PORT` — defaults to 4000
- `CORS_ORIGIN` — comma-separated list of allowed frontend origins

**`frontend/coal-and-clay-frontend/.env`** (see `.env.example`):
- `VITE_API_URL` — where the backend lives (defaults to `http://localhost:4000`)
- `VITE_APP_ROLE` — optionally force `customer` / `kitchen` / `owner` regardless of port

## 8. A note on testing

This was built and syntax/build-checked (`npm run build` on the frontend, module-load
checks on every backend route) in a sandboxed environment that couldn't reach
Prisma's binary CDN, so the Prisma engine itself wasn't exercised end-to-end here.
`docker compose up` pulls that binary fresh with normal internet access and should
just work — if `prisma migrate deploy` or the seed step throws anything on your
machine, that's the first place to look.
# restaurant-coal-and-clay
