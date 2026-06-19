// GET OUT — ASBL events app backend
// Express REST API serving events, categories, offers + bookings/favorites,
// backed by a small JSON store. Pairs with the interactive frontend in /public.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- tiny JSON "database" helpers ---------------------------------------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Look up an item by id across the featured + events collections.
function findItem(db, id) {
  return (
    db.featured.find((x) => x.id === id) ||
    db.events.find((x) => x.id === id) ||
    null
  );
}

// --- API ----------------------------------------------------------------

// Everything the home screen needs in a single call.
app.get('/api/home', (req, res) => {
  const db = readDB();
  res.json({
    location: db.location,
    featured: db.featured,
    categories: db.categories,
    offer: db.offer,
    events: db.events,
  });
});

app.get('/api/location', (req, res) => res.json(readDB().location));
app.get('/api/featured', (req, res) => res.json(readDB().featured));
app.get('/api/categories', (req, res) => res.json(readDB().categories));
app.get('/api/offer', (req, res) => res.json(readDB().offer));

// Events list, optionally filtered by ?category= and/or ?q= (search).
app.get('/api/events', (req, res) => {
  const db = readDB();
  const { category, q } = req.query;
  let items = [...db.featured, ...db.events];

  if (category) {
    items = items.filter((e) => e.category === category);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((e) =>
      [e.title, e.subtitle, e.artist, e.tag, e.category]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle))
    );
  }
  res.json(items);
});

// Single event (featured or regular) by id — powers the detail page.
app.get('/api/events/:id', (req, res) => {
  const db = readDB();
  const item = findItem(db, req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const cat = db.categories.find((c) => c.id === item.category);
  res.json({ ...item, categoryName: cat ? cat.name : item.category });
});

// Full-text search across featured + events + categories.
app.get('/api/search', (req, res) => {
  const db = readDB();
  const needle = String(req.query.q || '').toLowerCase().trim();
  if (!needle) return res.json({ events: [], categories: [] });

  const match = (e) =>
    [e.title, e.subtitle, e.artist, e.tag, e.name, e.category]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(needle));

  res.json({
    events: [...db.featured, ...db.events].filter(match),
    categories: db.categories.filter(match),
  });
});

// Toggle favorite (heart) on a featured item or event.
app.post('/api/favorites/:id', (req, res) => {
  const db = readDB();
  const item = findItem(db, req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  item.favorite = !item.favorite;
  db.favorites = [...db.featured, ...db.events]
    .filter((x) => x.favorite)
    .map((x) => x.id);
  writeDB(db);
  res.json({ id: item.id, favorite: item.favorite });
});

app.get('/api/favorites', (req, res) => {
  const db = readDB();
  res.json([...db.featured, ...db.events].filter((x) => x.favorite));
});

// Create a booking (BOOK NOW / event tap).
app.post('/api/bookings', (req, res) => {
  const db = readDB();
  const { eventId, offerId, seats = 1 } = req.body || {};

  let title = 'Scenes worthy offer';
  if (eventId) {
    const item = findItem(db, eventId);
    if (!item) return res.status(404).json({ error: 'Event not found' });
    title = `${item.title}${item.subtitle ? ' · ' + item.subtitle : ''}`;
  }

  const booking = {
    id: 'bk_' + Date.now().toString(36),
    eventId: eventId || null,
    offerId: offerId || null,
    title,
    seats,
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDB(db);
  res.status(201).json(booking);
});

app.get('/api/bookings', (req, res) => res.json(readDB().bookings));

// Cancel a booking.
app.delete('/api/bookings/:id', (req, res) => {
  const db = readDB();
  const before = db.bookings.length;
  db.bookings = db.bookings.filter((b) => b.id !== req.params.id);
  if (db.bookings.length === before) return res.status(404).json({ error: 'Not found' });
  writeDB(db);
  res.json({ ok: true, id: req.params.id });
});

// Profile summary: everything the profile sheet needs in one call.
app.get('/api/me', (req, res) => {
  const db = readDB();
  res.json({
    favorites: [...db.featured, ...db.events].filter((x) => x.favorite),
    bookings: [...db.bookings].reverse(),
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GET OUT app running → http://localhost:${PORT}`);
});
