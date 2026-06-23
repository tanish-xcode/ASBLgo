// GET OUT — frontend logic. Talks to the Express API in server.js.

const api = {
  home: () => fetch('/api/home').then((r) => r.json()),
  event: (id) =>
    fetch('/api/events/' + encodeURIComponent(id)).then((r) => {
      if (!r.ok) throw new Error('not found');
      return r.json();
    }),
  eventsByCategory: (id) =>
    fetch('/api/events?category=' + encodeURIComponent(id)).then((r) => {
      if (!r.ok) throw new Error('failed');
      return r.json();
    }),
  search: (q) => fetch('/api/search?q=' + encodeURIComponent(q)).then((r) => r.json()),
  toggleFav: (id) => fetch('/api/favorites/' + id, { method: 'POST' }).then((r) => r.json()),
  book: (payload) =>
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
};

const $ = (sel) => document.querySelector(sel);
let state = { featured: [], categories: [], events: [], offer: null, selectedCat: null };
let catSlideDir = 0; // -1/0/1 — direction the next category cover should slide in from

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- render ----------
function renderLocation(loc) {
  $('#locOrg').textContent = loc.org;
  $('#locAddr').textContent = loc.address;
}

function renderHero(items) {
  const track = $('#heroTrack');
  const dots = $('#heroDots');
  track.innerHTML = '';
  dots.innerHTML = '';
  items.forEach((it, i) => {
    const card = document.createElement('article');
    card.className = 'hero-card';
    card.dataset.index = i;
    card.innerHTML = `
      <img class="hero-img" src="${it.image}" alt="${it.title}" />
      <button class="hero-heart ${it.favorite ? 'on' : ''}" data-id="${it.id}" aria-label="Save">
        ${it.favorite ? '♥' : '♡'}
      </button>
      <div class="hero-meta">
        <div class="hero-title">${it.title}</div>
        <div class="hero-sub">${it.artist} | ${it.time}</div>
      </div>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.hero-heart')) return;
      openDetail(it.id);
    });
    track.appendChild(card);

    const dot = document.createElement('button');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => scrollHeroTo(i));
    dots.appendChild(dot);
  });

  track.querySelectorAll('.hero-heart').forEach((btn) =>
    btn.addEventListener('click', () => toggleFavorite(btn))
  );

  wireHeroScroll();
}

function renderCategories(cats) {
  const grid = $('#catGrid');
  grid.innerHTML = '';
  cats.forEach((c) => {
    const tile = document.createElement('div');
    tile.className = 'cat-tile';
    tile.dataset.id = c.id;
    tile.innerHTML = `<img src="${c.image}" alt="${c.name}" /><span class="cat-name">${c.name}</span>`;
    tile.addEventListener('click', () => openCategory(c.id));
    grid.appendChild(tile);
  });
}

function renderOffer(offer) {
  state.offer = offer;
  $('.offer-copy').innerHTML = `
    <h2 class="offer-title" id="offerTitle">${offer.title.replace(' ', '<br />')}</h2>
    ${offer.headline ? `<div class="offer-headline">${offer.headline}</div>` : ''}
    ${offer.sub ? `<div class="offer-sub">${offer.sub}</div>` : ''}`;
  $('#offerImg').src = offer.image;
}

// ---------- featured events carousel ----------
const FEAT = {
  small: { w: 112, h: 142 },
  big:   { w: 178, h: 225 },
  gap: 14,
  padL: 20,
  cards: [],
};
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function renderEvents(events) {
  const rail = $('#featureRail');
  rail.innerHTML = '';
  // drop duplicates (the featured + events lists can overlap by id)
  const seen = new Set();
  events = events.filter((ev) => (seen.has(ev.id) ? false : seen.add(ev.id)));
  FEAT.cards = events.map((ev) => {
    const [day, mon] = String(ev.date).split(' ');
    const el = document.createElement('article');
    el.className = 'feature-card';
    el.innerHTML = `
      <div class="fc-image"><img src="${ev.image}" alt="${ev.title}" /></div>
      <span class="fc-sep"></span>
      <div class="fc-meta">
        <div class="fc-date"><b>${day || ''}</b><small>${mon || ''}</small></div>
        <div class="fc-text"><b>${ev.title}</b><span>${ev.subtitle || ''}</span></div>
      </div>`;
    el.addEventListener('click', () => openDetail(ev.id));
    rail.appendChild(el);
    return el;
  });
  updateFeature();
}

// Reposition + scale every card from the horizontal scroll position. Cards keep
// a fixed (big) layout box and are driven purely with GPU transforms — no per-frame
// width/height/left writes — so the grow/shrink hand-off stays buttery smooth.
const SMALL_SCALE = FEAT.small.w / FEAT.big.w;   // shrink ratio for non-featured cards
const mqDesktop = window.matchMedia('(min-width: 760px)');
function updateFeature() {
  const track = $('#featureTrack');
  const rail = $('#featureRail');
  if (!FEAT.cards.length) return;

  // Desktop lays the featured cards out as a CSS grid — clear any inline
  // transforms/widths the mobile coverflow left behind and let CSS take over.
  if (mqDesktop.matches) {
    FEAT.cards.forEach((el) => {
      el.style.transform = '';
      el.style.zIndex = '';
      const m = el.querySelector('.fc-meta');
      if (m) m.style.opacity = '';
      const s = el.querySelector('.fc-sep');
      if (s) s.style.opacity = '';
    });
    rail.style.width = '';
    return;
  }

  const step = FEAT.small.w + FEAT.gap;
  const f = track.scrollLeft / step;        // fractional index sitting at the left anchor
  let cum = 0;                              // running x as each card's real footprint is added

  FEAT.cards.forEach((el, i) => {
    const d = Math.min(1, Math.abs(i - f));
    const p = 1 - smoothstep(d);            // 1 = featured (big), 0 = small
    const s = lerp(SMALL_SCALE, 1, p);      // uniform scale keeps aspect + scales the meta with it
    const x = FEAT.padL + cum;
    cum += FEAT.big.w * s + FEAT.gap;       // next card sits after this one's scaled width

    el.style.transform = `translateX(${x}px) scale(${s})`;
    el.style.zIndex = p > 0.5 ? 6 : 1;       // featured rides above the cream offer card (z5)

    // Only the focused (big) card wears its label — side cards stay clean so the
    // "MOZHI / Araku Cafe / date" of neighbours don't pile up and overlap on narrow screens.
    const passed = i >= f ? 1 : Math.max(0, 1 - (f - i));
    const vis = passed * Math.max(0, (p - 0.35) / 0.65);   // 1 at centre, fades to 0 toward the sides
    const meta = el.querySelector('.fc-meta');
    if (meta) meta.style.opacity = vis;
    const sep = el.querySelector('.fc-sep');
    if (sep) sep.style.opacity = (i === 0 ? 0 : (1 - p) * passed * 0.4);
  });

  // Stable rail width: must allow scrolling far enough to bring the LAST card to the
  // left anchor (scrollLeft = (n-1)*step), independent of the current per-frame scaling.
  const n = FEAT.cards.length;
  const railW = FEAT.padL + (n - 1) * step + track.clientWidth + 24;
  rail.style.width = railW + 'px';
}

function wireFeatureScroll() {
  const track = $('#featureTrack');
  const step = FEAT.small.w + FEAT.gap;
  let ticking = false;
  let snapTimer;

  track.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { updateFeature(); ticking = false; }); }
    // settle on the nearest card once scrolling pauses
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const target = Math.round(track.scrollLeft / step) * step;
      if (Math.abs(target - track.scrollLeft) > 1) {
        track.scrollTo({ left: target, behavior: 'smooth' });
      }
    }, 90);
  }, { passive: true });
  window.addEventListener('resize', updateFeature);
}

// ---------- hero carousel ----------
function scrollHeroTo(i) {
  const track = $('#heroTrack');
  const card = track.children[i];
  if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft - 22, behavior: 'smooth' });
}

function wireHeroScroll() {
  const track = $('#heroTrack');
  const update = () => {
    const cards = [...track.children];
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    cards.forEach((c, i) => {
      const cCenter = c.offsetLeft + c.offsetWidth / 2 - track.offsetLeft;
      const dist = Math.abs(cCenter - center);
      if (dist < bestDist) { bestDist = dist; best = i; }

      // 3D coverflow: center card pops forward, side cards tilt + recede
      const rel = Math.max(-1.4, Math.min(1.4, (cCenter - center) / track.clientWidth));
      const absRel = Math.abs(rel);
      const rotateY = rel * -34;            // tilt away from viewer
      const scale = 1 - absRel * 0.14;       // shrink as it leaves center
      const translateZ = -absRel * 140;      // push back into the scene
      const translateX = rel * 14;           // slight inward pull
      c.style.transform =
        `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      c.style.zIndex = String(100 - Math.round(absRel * 100));
      c.style.opacity = String(1 - absRel * 0.35);

      // subtle inner image parallax for extra depth
      const img = c.querySelector('.hero-img');
      if (img) img.style.transform = `translateX(${rel * -22}px) scale(1.08)`;
    });
    $('#heroDots').querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('active', i === best)
    );
  };
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  update();

  // auto-advance every 5s, pausing on interaction
  let auto = setInterval(next, 5000);
  const reset = () => { clearInterval(auto); auto = setInterval(next, 5000); };
  track.addEventListener('pointerdown', reset, { passive: true });
  function next() {
    const cards = [...track.children];
    const center = track.scrollLeft + track.clientWidth / 2;
    let cur = 0, bestDist = Infinity;
    cards.forEach((c, i) => {
      const cCenter = c.offsetLeft + c.offsetWidth / 2 - track.offsetLeft;
      const dist = Math.abs(cCenter - center);
      if (dist < bestDist) { bestDist = dist; cur = i; }
    });
    scrollHeroTo((cur + 1) % cards.length);
  }
}

// ---------- favorites ----------
async function toggleFavorite(btn) {
  const id = btn.dataset.id;
  try {
    const res = await api.toggleFav(id);
    syncFavoriteUI(id, res.favorite);
    toast(res.favorite ? 'Saved to favorites ♥' : 'Removed from favorites');
  } catch {
    toast('Could not update favorite');
  }
}

// Keep every heart for an item (hero card + detail view) and the cached state in sync.
function syncFavoriteUI(id, fav) {
  document.querySelectorAll(`.hero-heart[data-id="${id}"], .detail-heart[data-id="${id}"]`)
    .forEach((b) => { b.classList.toggle('on', fav); b.textContent = fav ? '♥' : '♡'; });
  const item = [...state.featured, ...state.events].find((e) => e.id === id);
  if (item) item.favorite = fav;
}

// ---------- categories filter ----------
function selectCategory(cat, tile) {
  const grid = $('#catGrid');
  const already = tile.classList.contains('selected');
  grid.querySelectorAll('.cat-tile').forEach((t) => t.classList.remove('selected'));
  if (already) {
    state.selectedCat = null;
    renderEvents([...state.events]);
    toast('Showing all events');
    return;
  }
  tile.classList.add('selected');
  state.selectedCat = cat.id;
  const all = [...state.featured, ...state.events];
  const filtered = all.filter((e) => e.category === cat.id);
  renderEvents(filtered.length ? filtered : all);
  toast(filtered.length ? `${cat.name}: ${filtered.length} event(s)` : `No ${cat.name} events yet`);
  $('.events').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- search ----------
let searchTimer;
function wireSearch() {
  const input = $('#searchInput');
  const box = $('#searchResults');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
      const { events = [], categories = [] } = await api.search(q);
      const results = [
        ...events.map((e) => ({ img: e.image, title: e.title, sub: e.artist || e.subtitle || '', id: e.id })),
        ...categories.map((c) => ({ img: c.image, title: c.name, sub: 'Category', id: c.id })),
      ];
      box.hidden = false;
      box.innerHTML = results.length
        ? results.map((r) => `
            <li data-id="${r.id}">
              <img src="${r.img}" alt="" />
              <div><div class="sr-title">${r.title}</div><div class="sr-sub">${r.sub}</div></div>
            </li>`).join('')
        : '<li class="sr-empty">No matches found</li>';
      box.querySelectorAll('li[data-id]').forEach((li) =>
        li.addEventListener('click', () => {
          box.hidden = true;
          input.value = '';
          openDetail(li.dataset.id);
        })
      );
    }, 220);
  });
  $('#searchForm').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.locate')) { box.hidden = true; }
  });
}

// ---------- booking ----------
async function openBooking({ eventId, offerId, label }) {
  try {
    const bk = await api.book({ eventId, offerId, seats: 1 });
    toast(`Booked: ${bk.title} ✓`);
  } catch {
    toast('Booking failed, try again');
  }
}

// ---------- event detail view (routed via #/event/:id) ----------
function openDetail(id) {
  location.hash = '#/event/' + id;
}

function goBackFromDetail() {
  if (history.length > 1) history.back();
  else location.hash = '';
}

function closeDetail() {
  const view = $('#detailView');
  if (view.hidden) return;
  view.hidden = true;
  view.setAttribute('aria-hidden', 'true');
  view.innerHTML = '';
  document.body.style.overflow = '';
}

// little inline icons for the detail facts
const DICON = {
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
};

function renderDetail(ev) {
  const view = $('#detailView');
  const catName =
    ev.categoryName ||
    (state.categories.find((c) => c.id === ev.category) || {}).name ||
    ev.category ||
    '';
  const price = ev.priceFrom ? '₹' + ev.priceFrom.toLocaleString('en-IN') : 'Free';
  const seatsLeft = ev.seatsLeft || (8 + (ev.id ? ev.id.charCodeAt(ev.id.length - 1) % 14 : 0));
  const venueShort = (ev.venue || '').split(',')[0] || 'TBA';

  view.innerHTML = `
    <div class="detail-sheet">
      <div class="detail-minibar" id="detailMini">
        <button class="mini-back" id="miniBack" aria-label="Back">‹</button>
        <span class="mini-title">${ev.title}</span>
        <button class="mini-book" id="miniBook">${price}</button>
      </div>

      <div class="detail-hero">
        <img src="${ev.image}" alt="${ev.title}" />
        <div class="detail-top">
          <button class="detail-back" id="detailBack" aria-label="Back">‹</button>
          <div class="detail-top-right">
            <button class="detail-icon" id="detailShare" aria-label="Share">${DICON.share}</button>
            <button class="detail-heart ${ev.favorite ? 'on' : ''}" data-id="${ev.id}" aria-label="Save">
              ${ev.favorite ? '♥' : '♡'}
            </button>
          </div>
        </div>
        <div class="detail-hero-foot">
          ${ev.tag ? `<span class="detail-tag">${ev.tag}</span>` : ''}
          <h1 class="detail-title">${ev.title}</h1>
          ${ev.artist ? `<div class="detail-artist">${ev.artist}</div>` : ''}
        </div>
      </div>

      <div class="detail-body">
        <div class="detail-chips">
          ${ev.date ? `<span class="chip">${DICON.calendar}${ev.date}</span>` : ''}
          ${ev.time ? `<span class="chip">${DICON.clock}${ev.time}</span>` : ''}
          ${catName ? `<span class="chip chip-cat">${DICON.tag}${catName}</span>` : ''}
        </div>

        <button class="detail-venue" id="detailVenue">
          <span class="venue-ico">${DICON.pin}</span>
          <span class="venue-txt">
            <small>Venue</small>
            <b>${ev.venue || 'TBA'}</b>
          </span>
          <span class="venue-go">${DICON.arrow}</span>
        </button>

        ${ev.description ? `
          <div class="detail-desc">
            <h3>About this event</h3>
            <p>${ev.description}</p>
          </div>` : ''}

        <div class="detail-seats">
          <span class="dot"></span>${seatsLeft} spots left — book soon
        </div>
      </div>

      <div class="detail-foot">
        <div class="detail-price">
          <small>From</small>
          <b>${price}</b>
          <em>per person</em>
        </div>
        <button class="detail-book" id="detailBook">BOOK NOW</button>
      </div>
    </div>`;

  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  view.scrollTop = 0;
  document.body.style.overflow = 'hidden';

  // compact header reveals as the hero scrolls out of view
  const mini = $('#detailMini');
  const onScroll = () => mini.classList.toggle('show', view.scrollTop > 280);
  view.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#detailBack').addEventListener('click', goBackFromDetail);
  $('#miniBack').addEventListener('click', goBackFromDetail);
  view.querySelector('.detail-heart').addEventListener('click', (e) =>
    toggleFavorite(e.currentTarget)
  );

  $('#detailShare').addEventListener('click', async () => {
    const shareData = { title: ev.title, text: `${ev.title}${ev.artist ? ' — ' + ev.artist : ''}`, url: location.href };
    if (navigator.share) { navigator.share(shareData).catch(() => {}); }
    else { navigator.clipboard?.writeText(location.href); toast('Link copied'); }
  });

  $('#detailVenue').addEventListener('click', () => {
    const q = encodeURIComponent(ev.venue || ev.title);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  });

  const book = async (btn) => {
    if (btn.classList.contains('booked')) return;
    const bk = await api.book({ eventId: ev.id, seats: 1 }).catch(() => null);
    if (bk) {
      $('#detailBook').classList.add('booked');
      $('#detailBook').textContent = 'BOOKED ✓';
      $('#miniBook').classList.add('booked');
      $('#miniBook').textContent = '✓';
      toast(`Booked: ${bk.title} ✓`);
    } else {
      toast('Booking failed, try again');
    }
  };
  $('#detailBook').addEventListener('click', (e) => book(e.currentTarget));
  $('#miniBook').addEventListener('click', () => book($('#detailBook')));
}

// ---------- category page (routed via #/category/:id) ----------
function openCategory(id) {
  location.hash = '#/category/' + id;
}

function closeCategory() {
  const view = $('#categoryView');
  if (view.hidden) return;
  view.hidden = true;
  view.setAttribute('aria-hidden', 'true');
  view.innerHTML = '';
  document.body.style.overflow = '';
}

// little inline icons used on the cover
const ICON = {
  share: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.4" fill="#ff6600"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
};

function renderCategory(cat, events) {
  const view = $('#categoryView');
  const month = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const heroImg = cat.image;                                   // category's own photo — not repeated in the list below
  const thumbImg = (events[0] && events[0].image) || cat.image;
  const place = (state.location && (state.location.short || state.location.org)) || 'ASBL · Hyderabad';
  const others = state.categories.filter((c) => c.id !== cat.id).slice(0, 2);

  view.innerHTML = `
    <div class="catpage-sheet">
      <div class="cover-top">
        <button class="cover-icon" id="catBack" aria-label="Back">‹</button>
        <div class="cover-head">
          <h2>${cat.name}</h2>
          <span>(${place})</span>
        </div>
        <button class="cover-icon" id="catShare" aria-label="Share">${ICON.share}</button>
      </div>

      <div class="cover-stack">
        ${others[1] ? `<div class="stack-card s3" data-id="${others[1].id}" style="background-image:url('${others[1].image}')"></div>` : ''}
        ${others[0] ? `<div class="stack-card s2" data-id="${others[0].id}" style="background-image:url('${others[0].image}')"></div>` : ''}
        <div class="cover-main">
          <span class="cover-thumb"><img src="${thumbImg}" alt="" /></span>
          <button class="cover-pin" aria-label="Location">${ICON.pin}</button>
          <h1 class="cover-title">${cat.name}</h1>
          <div class="cover-month">${month}</div>
          <div class="cover-hero">
            <img src="${heroImg}" alt="${cat.name}" />
            <button class="ctl-btn left" id="coverPlay" aria-label="Open first event" ${events.length ? '' : 'disabled'}>${ICON.play}</button>
            <button class="ctl-btn right" id="coverNight" aria-label="Toggle mood">${ICON.moon}</button>
          </div>
        </div>
      </div>

      <div class="catpage-body">
        <h3 class="catpage-heading">${events.length ? `${events.length} ${events.length === 1 ? 'event' : 'events'}` : 'Events'}</h3>
        ${events.length
          ? `<div class="catpage-list">${events.map((ev) => `
              <article class="cp-card" data-id="${ev.id}">
                <div class="cp-thumb"><img src="${ev.image}" alt="${ev.title}" /></div>
                <div class="cp-info">
                  <b>${ev.title}</b>
                  <span class="cp-sub">${ev.artist || ev.subtitle || ''}</span>
                  <span class="cp-meta">${ev.date || 'TBA'}${ev.time ? ' · ' + ev.time : ''}</span>
                </div>
                <span class="cp-price">${ev.priceFrom ? '₹' + ev.priceFrom.toLocaleString('en-IN') : 'Free'}</span>
              </article>`).join('')}</div>`
          : `<p class="catpage-empty">No events in ${cat.name} yet — check back soon.</p>`}
      </div>
    </div>`;

  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  view.scrollTop = 0;
  document.body.style.overflow = 'hidden';

  // entrance: slide in horizontally when arriving via swipe, otherwise a soft rise
  const main = view.querySelector('.cover-main');
  const body = view.querySelector('.catpage-body');
  main.style.transition = 'none';
  main.style.transform =
    catSlideDir > 0 ? 'translateX(108%)' : catSlideDir < 0 ? 'translateX(-108%)' : 'translateY(20px)';
  main.style.opacity = '0';
  body.style.opacity = '0';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      main.style.transition = 'transform .42s cubic-bezier(.22,.68,0,1), opacity .32s ease';
      main.style.transform = 'none';
      main.style.opacity = '1';
      body.style.transition = 'opacity .35s ease .06s';
      body.style.opacity = '1';
    })
  );
  catSlideDir = 0;

  $('#catBack').addEventListener('click', goBackFromDetail);
  $('#catShare').addEventListener('click', async () => {
    const link = location.origin + '/#/category/' + cat.id;
    try {
      await navigator.clipboard.writeText(link);
      toast(`${cat.name} link copied`);
    } catch {
      toast(link);
    }
  });
  $('#coverNight').addEventListener('click', (e) =>
    e.currentTarget.closest('.cover-main').classList.toggle('night')
  );
  if (events.length) {
    $('#coverPlay').addEventListener('click', () => openDetail(events[0].id));
  }
  view.querySelectorAll('.cp-card').forEach((c) =>
    c.addEventListener('click', () => openDetail(c.dataset.id))
  );

  // tap a peeking card to jump to that category
  view.querySelectorAll('.stack-card[data-id]').forEach((el) =>
    el.addEventListener('click', () => openCategory(el.dataset.id))
  );

  // live drag: the cover follows the cursor, then commits to the next/prev category or springs back
  const cats = state.categories;
  const idx = cats.findIndex((c) => c.id === cat.id);
  let sliding = false;
  const go = (dir) => {
    if (sliding) return;
    sliding = true;
    catSlideDir = dir;
    main.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
    main.style.transform = dir > 0 ? 'translateX(-112%)' : 'translateX(112%)';
    main.style.opacity = '0';
    setTimeout(() => openCategory(cats[(idx + dir + cats.length) % cats.length].id), 170);
  };

  let sx = 0, sy = 0, dx = 0, dragging = false, horizontal = null;
  main.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;        // let the play/moon buttons work
    sx = e.clientX; sy = e.clientY; dx = 0; dragging = true; horizontal = null;
    main.style.transition = 'none';
  });
  main.addEventListener('pointermove', (e) => {
    if (!dragging || sliding) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (horizontal === null) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      horizontal = Math.abs(mx) > Math.abs(my);
      if (horizontal) main.setPointerCapture?.(e.pointerId);
      else { dragging = false; return; }           // vertical intent → let the page scroll
    }
    e.preventDefault();
    dx = mx;
    main.style.transform = `translateX(${mx}px) rotate(${mx * 0.012}deg)`;
    main.style.opacity = String(Math.max(0.45, 1 - Math.abs(mx) / 620));
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (sliding) return;
    const w = main.offsetWidth || 320;
    if (Math.abs(dx) > w * 0.3) {
      go(dx < 0 ? 1 : -1);                          // committed — finish sliding out + load neighbour
    } else {
      main.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), opacity .3s ease';
      main.style.transform = 'none';               // spring back
      main.style.opacity = '1';
    }
  };
  main.addEventListener('pointerup', endDrag);
  main.addEventListener('pointercancel', endDrag);
}

// ---------- router (event detail + category page + deep links) ----------
async function router() {
  const evM = location.hash.match(/^#\/event\/(.+)$/);
  const catM = location.hash.match(/^#\/category\/(.+)$/);

  if (evM) {
    closeCategory();
    const id = decodeURIComponent(evM[1]);
    let ev = null;
    try {
      ev = await api.event(id);
    } catch {
      ev = [...state.featured, ...state.events].find((e) => e.id === id) || null;
    }
    if (!ev) { toast('Event not found'); location.hash = ''; return; }
    renderDetail(ev);
    return;
  }

  if (catM) {
    closeDetail();
    const id = decodeURIComponent(catM[1]);
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) { toast('Category not found'); location.hash = ''; return; }
    let events = [];
    try {
      events = await api.eventsByCategory(id);
    } catch {
      events = [...state.featured, ...state.events].filter((e) => e.category === id);
    }
    renderCategory(cat, events);
    return;
  }

  closeDetail();
  closeCategory();
}

// ---------- location picker ----------
const LOCATIONS = [
  { org: 'Gachibowli', address: 'Gachibowli, Hyderabad, Telangana' },
  { org: 'HITEC City', address: 'HITEC City, Madhapur, Hyderabad' },
  { org: 'Jubilee Hills', address: 'Jubilee Hills, Hyderabad' },
  { org: 'Banjara Hills', address: 'Banjara Hills, Hyderabad' },
  { org: 'Financial District', address: 'Nanakramguda, Hyderabad' },
  { org: 'Kondapur', address: 'Kondapur, Hyderabad' },
  { org: 'Secunderabad', address: 'Secunderabad, Hyderabad' },
];

function toggleLocationMenu() {
  const existing = document.getElementById('locMenu');
  if (existing) { existing.remove(); return; }
  const menu = document.createElement('div');
  menu.id = 'locMenu';
  menu.className = 'loc-menu';
  renderLocMenu(menu);
  ($('.loc-anchor') || $('.locate')).appendChild(menu);
}

function pickLocation(l, menu) {
  state.location = l;
  renderLocation(l);
  menu.remove();
  toast(`Location set to ${l.org}`);
}

function renderLocMenu(menu) {
  menu.innerHTML = `
    <div class="lm-search">
      <img class="lm-search-icon" src="/assets/search.png" alt="" />
      <input id="locSearch" type="search" placeholder="Search a place in Hyderabad…" aria-label="Search location" autocomplete="off" />
    </div>
    <ul class="lm-list">
      ${LOCATIONS.map((l, i) => `
        <li data-i="${i}" class="${state.location && state.location.org === l.org ? 'current' : ''}">
          <span class="lm-org">${l.org}</span>
          <span class="lm-addr">${l.address}</span>
        </li>`).join('')}
    </ul>`;

  menu.querySelectorAll('.lm-list li').forEach((li) =>
    li.addEventListener('click', () => pickLocation(LOCATIONS[+li.dataset.i], menu))
  );

  const input = menu.querySelector('#locSearch');
  const list = menu.querySelector('.lm-list');
  input.focus();
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { renderLocMenu(menu); return; }
    list.innerHTML = `<li class="lm-status">Searching Hyderabad…</li>`;
    timer = setTimeout(() => searchPlaces(q, menu, list), 350);
  });
}

// Geocode a place within Hyderabad. Uses OpenStreetMap (keyless); swap for the
// Google Places API here if a key is available.
async function searchPlaces(q, menu, list) {
  // viewbox roughly bounds Greater Hyderabad to keep results local
  const url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1'
    + '&limit=6&countrycodes=in&viewbox=78.20,17.60,78.70,17.20&bounded=1'
    + '&q=' + encodeURIComponent(q + ', Hyderabad');
  let results = [];
  try {
    results = await fetch(url, { headers: { 'Accept-Language': 'en' } }).then((r) => r.json());
  } catch { results = []; }

  if (!results.length) {
    list.innerHTML = `<li class="lm-status">No places found in Hyderabad</li>`;
    return;
  }

  list.innerHTML = results.map((r, i) => {
    const name = (r.display_name || '').split(',')[0];
    return `<li class="lm-result" data-i="${i}">
      <span class="lm-org">${name}</span>
      <span class="lm-addr">${r.display_name}</span>
    </li>`;
  }).join('');

  list.querySelectorAll('.lm-result').forEach((li) => {
    li.addEventListener('click', () => {
      const r = results[+li.dataset.i];
      const org = (r.display_name || '').split(',')[0];
      const loc = { org, address: r.display_name, lat: r.lat, lon: r.lon };
      LOCATIONS.unshift(loc);
      pickLocation(loc, menu);
    });
  });
}

// ---------- profile sheet (bookings + saved) ----------
async function openProfile() {
  const view = $('#profileView');
  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  view.innerHTML = `<div class="sheet-card"><p class="sheet-empty">Loading…</p></div>`;
  let data = { favorites: [], bookings: [] };
  try { data = await fetch('/api/me').then((r) => r.json()); } catch {}
  renderProfile(data);
}

function closeProfile() {
  const view = $('#profileView');
  view.hidden = true;
  view.setAttribute('aria-hidden', 'true');
  view.innerHTML = '';
  document.body.style.overflow = '';
}

function renderProfile(data) {
  const view = $('#profileView');
  const fav = data.favorites || [];
  const bk = data.bookings || [];
  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  view.innerHTML = `
    <div class="sheet-card">
      <div class="sheet-head">
        <div class="sheet-id">
          <img src="/assets/user.png" alt="" />
          <div><b>Your GET OUT</b><span>${bk.length} booking${bk.length !== 1 ? 's' : ''} · ${fav.length} saved</span></div>
        </div>
        <button class="sheet-close" id="profClose" aria-label="Close">×</button>
      </div>
      <div class="sheet-body">
        <h3 class="sheet-sec">Bookings</h3>
        ${bk.length ? `<ul class="sheet-list">${bk.map((b) => `
          <li>
            <div class="sl-main"><b>${b.title}</b><span>${fmt(b.createdAt)} · ${b.seats} seat${b.seats !== 1 ? 's' : ''}</span></div>
            <button class="sl-action" data-cancel="${b.id}">Cancel</button>
          </li>`).join('')}</ul>` : `<p class="sheet-empty">No bookings yet — tap BOOK NOW on an event.</p>`}

        <h3 class="sheet-sec">Saved</h3>
        ${fav.length ? `<ul class="sheet-list">${fav.map((f) => `
          <li>
            <img class="sl-thumb" src="${f.image}" alt="" />
            <div class="sl-main"><b>${f.title}</b><span>${f.subtitle || f.artist || ''}</span></div>
            <button class="sl-action" data-open="${f.id}">View</button>
            <button class="sl-action ghost" data-unfav="${f.id}">Remove</button>
          </li>`).join('')}</ul>` : `<p class="sheet-empty">Nothing saved yet — tap the ♡ on an event.</p>`}
      </div>
    </div>`;

  $('#profClose').addEventListener('click', closeProfile);
  view.querySelectorAll('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      await fetch('/api/bookings/' + b.dataset.cancel, { method: 'DELETE' }).catch(() => {});
      toast('Booking cancelled');
      openProfile();
    })
  );
  view.querySelectorAll('[data-unfav]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api.toggleFav(b.dataset.unfav).catch(() => {});
      syncFavoriteUI(b.dataset.unfav, false);
      openProfile();
    })
  );
  view.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => { closeProfile(); openDetail(b.dataset.open); })
  );
}

function wireStatic() {
  $('#viewAll').addEventListener('click', () => {
    state.selectedCat = null;
    $('#catGrid').querySelectorAll('.cat-tile').forEach((t) => t.classList.remove('selected'));
    renderEvents([...state.featured, ...state.events]);
    toast('Showing all events');
  });
  $('#avatarBtn').addEventListener('click', openProfile);
  $('#locationBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleLocationMenu(); });

  // close the detail view by tapping the dark backdrop or pressing Escape
  $('#detailView').addEventListener('click', (e) => {
    if (e.target.id === 'detailView') goBackFromDetail();
  });
  // close the category page by tapping its backdrop
  $('#categoryView').addEventListener('click', (e) => {
    if (e.target.id === 'categoryView') goBackFromDetail();
  });
  // close the profile sheet by tapping its backdrop
  $('#profileView').addEventListener('click', (e) => {
    if (e.target.id === 'profileView') closeProfile();
  });
  // dismiss the location menu when tapping elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#locMenu') && !e.target.closest('#locationBtn')) {
      const m = document.getElementById('locMenu');
      if (m) m.remove();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#detailView').hidden) goBackFromDetail();
    else if (!$('#categoryView').hidden) goBackFromDetail();
    else if (!$('#profileView').hidden) closeProfile();
    else { const m = document.getElementById('locMenu'); if (m) m.remove(); }
  });
}

// ---------- scroll reveal ----------
function wireReveal() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// ---------- boot ----------
async function boot() {
  wireStatic();
  wireSearch();
  try {
    const data = await api.home();
    state.featured = data.featured;
    state.categories = data.categories;
    state.events = data.events;
    renderLocation(data.location);
    renderHero(data.featured);
    renderCategories(data.categories);
    renderOffer(data.offer);
    renderEvents([...data.events, ...data.featured]);
    wireFeatureScroll();
  } catch (err) {
    toast('Could not load. Is the server running?');
    console.error(err);
  }
  wireReveal();

  // client-side routing for the event detail view (also handles deep links)
  window.addEventListener('hashchange', router);
  router();
}

boot();
