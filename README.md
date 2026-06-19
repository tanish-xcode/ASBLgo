# GET OUT — ASBL Events App

An interactive events-discovery app built from the Figma **"Web Layout - Inspiration"** design,
with a real Node/Express backend + REST API and a vanilla-JS frontend.

## Run

```bash
npm install
npm start            # serves on http://localhost:3000
PORT=4173 npm start  # or pick another port if 3000 is taken
```

Open the printed URL in a browser.

## What works

**Frontend (in `public/`)**
- Header with logo + profile avatar
- Location bar + live **search** (debounced, hits `/api/search`)
- Swipeable **hero carousel** — scroll-snap, dot indicators, auto-advance, parallax on the images
- **Category grid** — tap a tile to filter the events row (tap again / "View all" to reset)
- **Scenes worthy** offer card with a working **BOOK NOW** button
- **Events** carousel — tap a card to book
- **Heart** toggle on hero cards (persists via the API)
- Scroll-reveal animations (IntersectionObserver) + toast notifications

**Backend (`server.js`, data in `data/db.json`)**

| Method | Route | Purpose |
|--------|-------|---------|
| GET  | `/api/home` | Everything the home screen needs in one call |
| GET  | `/api/location` `/api/featured` `/api/categories` `/api/offer` | Individual sections |
| GET  | `/api/events?category=&q=` | Events, filterable |
| GET  | `/api/search?q=` | Search events + categories |
| POST | `/api/favorites/:id` | Toggle a favorite (persisted) |
| GET  | `/api/favorites` | List favorites |
| POST | `/api/bookings` | Create a booking (persisted) |
| GET  | `/api/bookings` | List bookings |

State persists to `data/db.json` between requests.

## Assets

Images in `public/assets/` were exported from the Figma design.
