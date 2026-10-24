// ============================================================
// Simpsoteca — app.js (todo en uno)
// IndexedDB + TMDB + Router SPA + Importación TXT verificada
// ============================================================

// ---------- CONFIG ----------
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const ADMIN_USER = 'user';
const ADMIN_PASS = 'cypher';

// ---------- STATE ----------
const state = {
  db: null,
  items: [],
  favorites: [],
  apiKey: null,
  progress: {},
  route: 'home',
  params: {},
  isAdmin: sessionStorage.getItem('sp_admin') === '1'
};

// ---------- TOAST ----------
function toast(msg, type = 'info') {
  const c = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-20px)';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ---------- HELPERS ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

function placeholder(title, w = 342, h = 513) {
  const hue = hash(title || '?').slice(0, 3);
  const hueNum = parseInt(hue, 36) % 360;
  const initials = (title || '?').split(' ').slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="hsl(${hueNum},25%,22%)"/><stop offset="100%" stop-color="hsl(${hueNum},25%,10%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.floor(w/4)}" font-weight="900" fill="rgba(255,255,255,.15)">${initials}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function posterUrl(item) {
  if (item?.poster_path) return TMDB_IMG + 'w342' + item.poster_path;
  return placeholder(item?.title || '');
}

function backdropUrl(item) {
  if (item?.backdrop_path) return TMDB_IMG + 'w1280' + item.backdrop_path;
  if (item?.poster_path) return TMDB_IMG + 'w780' + item.poster_path;
  return placeholder(item?.title || '', 1280, 720);
}

// ============================================================
// INDEXEDDB
// ============================================================
const DB = {
  open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB no disponible'));
      const req = indexedDB.open('Simpsoteca', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('items')) {
          const s = db.createObjectStore('items', { keyPath: 'key' });
          s.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('favorites'))
          db.createObjectStore('favorites', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('config'))
          db.createObjectStore('config', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('progress'))
          db.createObjectStore('progress', { keyPath: 'key' });
      };
      req.onsuccess = () => { state.db = req.result; res(req.result); };
      req.onerror = () => rej(req.error);
    });
  },

  getAll(store) {
    return new Promise((res, rej) => {
      try {
        const r = state.db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },

  put(store, item) {
    return new Promise((res, rej) => {
      try {
        const tx = state.db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = () => res(item);
        tx.onerror = () => rej(tx.error);
      } catch (e) { rej(e); }
    });
  },

  del(store, key) {
    return new Promise((res, rej) => {
      try {
        const tx = state.db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      } catch (e) { rej(e); }
    });
  },

  clear(store) {
    return new Promise((res, rej) => {
      try {
        const tx = state.db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      } catch (e) { rej(e); }
    });
  },

  get(store, key) {
    return new Promise((res, rej) => {
      try {
        const r = state.db.transaction(store, 'readonly').objectStore(store).get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
};

// ============================================================
// CARGA INICIAL
// ============================================================
async function reload() {
  state.items = await DB.getAll('items');
  state.favorites = await DB.getAll('favorites');
  const apiConf = await DB.get('config', 'tmdbApiKey');
  state.apiKey = apiConf?.value || null;
  const allProg = await DB.getAll('progress');
  state.progress = {};
  allProg.forEach(p => { state.progress[p.key] = p; });
}

// ============================================================
// TMDB
// ============================================================
const TMDB = {
  async fetch(path, params = {}) {
    if (!state.apiKey) throw new Error('API key TMDB no configurada');
    const url = new URL('https://api.themoviedb.org/3' + path);
    url.searchParams.set('api_key', state.apiKey);
    url.searchParams.set('language', 'es-ES');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
    return res.json();
  },

  async search(query) {
    if (!query?.trim()) return [];
    const data = await this.fetch('/search/multi', { query, include_adult: 'false' });
    return (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
  },

  async findBest(title, tipo, year) {
    const results = await this.search(title);
    let filt = results.filter(r => r.media_type === tipo);
    if (!filt.length) filt = results;
    if (year) {
      const exact = filt.find(r => {
        const y = (r.release_date || r.first_air_date || '').slice(0, 4);
        return String(y) === String(year);
      });
      if (exact) return exact;
    }
    return filt[0] || null;
  },

  async enrich(item) {
    try {
      const hit = await this.findBest(item.title, item.type);
      if (!hit) return item;
      return {
        ...item,
        tmdbId: hit.id,
        poster_path: hit.poster_path || null,
        backdrop_path: hit.backdrop_path || null,
        overview: hit.overview || '',
        rating: hit.vote_average || 0,
        release_date: hit.release_date || hit.first_air_date || null
      };
    } catch (e) {
      console.warn('TMDB enrich:', e.message);
      return item;
    }
  }
};

// ============================================================
// IMPORTADOR TXT
// ============================================================
function parseTxt(texto) {
  const lineas = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const items = [];
  const errores = [];
  let cur = null;
  let lineaInicio = 0;

  const finalizar = (idx) => {
    if (!cur) return;
    const nombre = (cur.nombre || '').trim();
    const url = (cur.url || '').trim();
    if (!nombre) errores.push({ linea: lineaInicio, motivo: 'Falta Nombre' });
    else if (!url && cur.eps.length === 0) errores.push({ linea: lineaInicio, motivo: `"${nombre}" sin URL` });
    else {
      const esSerie = cur.eps.length > 0;
      items.push({
        nombre, url, genero: cur.genero.trim() || 'Otros',
        tipo: esSerie ? 'tv' : 'movie',
        episodios: esSerie ? cur.eps : null
      });
    }
    cur = null;
  };

  lineas.forEach((linea, idx) => {
    const l = linea.trim();
    if (!l) { finalizar(idx); return; }
    const mN = l.match(/^Nombre\s*:\s*(.+)$/i);
    const mU = l.match(/^Url\s*:\s*(.+)$/i);
    const mG = l.match(/^G[eé]nero\s*:\s*(.+)$/i);
    const mE = l.match(/^Episodio\s*(\d+)?\s*:\s*(.+)$/i);

    if (mN) { finalizar(idx); cur = { nombre: mN[1], url: '', genero: '', eps: [] }; lineaInicio = idx + 1; }
    else if (mU && cur) cur.url = mU[1];
    else if (mG && cur) cur.genero = mG[1];
    else if (mE && cur) {
      const num = mE[1] ? parseInt(mE[1]) : (cur.eps.length + 1);
      cur.eps.push({ season: 1, episode: num, url: mE[2].trim() });
    }
  });
  finalizar(lineas.length);
  return { items, errores };
}

function leerArchivo(file) {
  return new Promise((res, rej) => {
    if (!file) return rej(new Error('Sin archivo'));
    if (file.size === 0) return rej(new Error('Archivo vacío'));
    const reader = new FileReader();
    reader.onload = e => res(String(e.target.result || ''));
    reader.onerror = () => rej(new Error('Error leyendo archivo'));
    reader.readAsText(file, 'UTF-8');
  });
}

async function detectarDuplicados(items) {
  const urls = new Set(state.items.map(i => (i.videoUrl || '').trim()).filter(Boolean));
  const nombres = new Set(state.items.map(i => (i.title || '').toLowerCase().trim()));
  const urlsTxt = new Set(), nombresTxt = new Set();
  const nuevos = [], duplicados = [];

  items.forEach(it => {
    const nk = it.nombre.toLowerCase().trim();
    const uk = (it.url || '').trim();
    if ((uk && urls.has(uk)) || nombres.has(nk) || (uk && urlsTxt.has(uk)) || nombresTxt.has(nk)) {
      duplicados.push(it);
    } else {
      if (uk) urlsTxt.add(uk);
      nombresTxt.add(nk);
      nuevos.push(it);
    }
  });
  return { nuevos, duplicados };
}

async function guardarItems(items) {
  return new Promise((res, rej) => {
    const tx = state.db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    let ok = 0, fail = 0;
    items.forEach(it => {
      const key = it.tipo === 'tv'
        ? 'tv_' + hash(it.nombre + '_' + (it.episodios?.[0]?.season || 1))
        : 'url_' + hash(it.url);
      const reg = {
        key,
        title: it.nombre,
        videoUrl: it.url,
        genre: it.genero,
        type: it.tipo,
        episodes: it.episodios,
        addedAt: Date.now(),
        source: 'txt-import'
      };
      const r = store.put(reg);
      r.onsuccess = () => ok++;
      r.onerror = () => fail++;
    });
    tx.oncomplete = () => res({ ok, fail });
    tx.onerror = () => rej(new Error('Transacción IndexedDB falló'));
    tx.onabort = () => rej(new Error('Transacción abortada'));
  });
}

async function importarFlujo(file) {
  try {
    const texto = await leerArchivo(file);
    const { items, errores } = parseTxt(texto);
    if (!items.length) return { exito: false, motivo: 'Sin registros válidos', errores };

    const { nuevos, duplicados } = await detectarDuplicados(items);
    if (!nuevos.length) return { exito: false, motivo: 'Todos duplicados', duplicados: duplicados.length, errores };

    const res = await guardarItems(nuevos);

    // VERIFICAR releyendo
    await reload();
    const verificados = state.items.filter(x =>
      nuevos.some(n => (n.tipo === 'tv' && x.title === n.nombre) || (n.tipo === 'movie' && x.videoUrl === n.url))
    );

    if (!verificados.length) {
      return { exito: false, motivo: 'Los datos no aparecieron en IndexedDB' };
    }

    return {
      exito: true,
      encontrados: items.length,
      importados: res.ok,
      verificados: verificados.length,
      duplicados: duplicados.length,
      errores: errores.length,
      listaErrores: errores
    };
  } catch (e) {
    return { exito: false, motivo: e.message };
  }
}

// ============================================================
// VISTAS
// ============================================================
function cardHtml(item) {
  const poster = posterUrl(item);
  const rating = item.rating ? `<div class="card-rating">★ ${Number(item.rating).toFixed(1)}</div>` : '';
  const type = item.type === 'tv' ? `<div class="card-type">Serie</div>` : '';
  return `
    <a class="card" href="#detail/${encodeURIComponent(item.key)}">
      <div class="card-poster">
        <img src="${poster}" alt="${esc(item.title)}" loading="lazy" onerror="this.src='${placeholder(item.title)}'">
        ${rating}${type}
      </div>
      <h3 class="card-title">${esc(item.title)}</h3>
      <p class="card-sub">${esc(item.genre || '')}</p>
    </a>
  `;
}

function rowHtml(title, items, verTodoRuta) {
  if (!items.length) return '';
  return `
    <section class="row">
      <div class="row-head">
        <h2>${esc(title)}</h2>
        ${verTodoRuta ? `<a href="${verTodoRuta}">Ver todo →</a>` : ''}
      </div>
      <div class="row-scroll">${items.map(cardHtml).join('')}</div>
    </section>
  `;
}

function viewHome() {
  if (!state.items.length) {
    return `<div class="empty">
      <div class="empty-ico">🎬</div>
      <h2>Tu catálogo está vacío</h2>
      <p>Ve al panel de administración para configurar TMDB e importar tu TXT.</p>
      <a href="#admin" class="btn btn-accent">Ir al Admin</a>
    </div>`;
  }

  const movies = state.items.filter(i => i.type === 'movie');
  const series = state.items.filter(i => i.type === 'tv');
  const recientes = [...state.items].sort((a,b) => (b.addedAt||0) - (a.addedAt||0)).slice(0, 12);
  const conRating = state.items.filter(i => i.rating > 0).sort((a,b) => b.rating - a.rating).slice(0, 12);
  const hero = state.items.find(i => i.backdrop_path) || state.items[0];

  const heroHtml = hero ? `
    <section class="hero">
      <img src="${backdropUrl(hero)}" alt="">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-badge">Destacada</div>
        <h1 class="hero-title">${esc(hero.title)}</h1>
        <div class="hero-meta">
          ${hero.rating ? `<span>★ ${Number(hero.rating).toFixed(1)}</span>` : ''}
          ${hero.genre ? `<span>${esc(hero.genre)}</span>` : ''}
          <span>${hero.type === 'tv' ? 'Serie' : 'Película'}</span>
        </div>
        <div class="hero-actions">
          <a href="#watch/${encodeURIComponent(hero.key)}" class="btn btn-primary">▶ Reproducir</a>
          <a href="#detail/${encodeURIComponent(hero.key)}" class="btn btn-secondary">Más info</a>
        </div>
      </div>
    </section>
  ` : '';

  // Continuar viendo
  const continuar = state.items.filter(i => {
    const p = state.progress[i.key];
    return p && p.seconds > 5 && p.duration > 0 && p.seconds < p.duration - 10;
  });

  // Géneros
  const generos = {};
  state.items.forEach(i => {
    const g = i.genre || 'Otros';
    if (!generos[g]) generos[g] = [];
    generos[g].push(i);
  });
  const genValidos = Object.keys(generos).filter(g => generos[g].length >= 3).slice(0, 6);

  return `
    ${heroHtml}
    ${continuar.length ? rowHtml('Continuar viendo', continuar) : ''}
    ${recientes.length ? rowHtml('Recién añadidas', recientes, '#movies') : ''}
    ${conRating.length ? rowHtml('Mejor valoradas', conRating, '#movies') : ''}
    ${movies.length ? rowHtml('Películas', movies.slice(0, 12), '#movies') : ''}
    ${series.length ? rowHtml('Series', series.slice(0, 12), '#series') : ''}
    ${genValidos.map(g => rowHtml(g, generos[g].slice(0, 12), `#explore?genre=${encodeURIComponent(g)}`)).join('')}
  `;
}

function viewListado(tipo, titulo) {
  const items = tipo ? state.items.filter(i => i.type === tipo) : state.items;
  const generoParam = state.params.genre || '';
  const filtrados = generoParam ? items.filter(i => i.genre === generoParam) : items;
  const generos = [...new Set(items.map(i => i.genre).filter(Boolean))].sort();

  return `
    <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0 0 16px;">${esc(titulo)}</h1>
    <div class="filters">
      <input type="text" id="listado-buscar" class="input" placeholder="Buscar..." value="">
      <select id="listado-orden" class="input">
        <option value="reciente">Recientes</option>
        <option value="az">A-Z</option>
        <option value="za">Z-A</option>
        <option value="rating">Rating</option>
      </select>
    </div>
    <div class="chips">
      <button class="chip ${!generoParam ? 'active' : ''}" data-gen="">Todos</button>
      ${generos.map(g => `<button class="chip ${generoParam === g ? 'active' : ''}" data-gen="${esc(g)}">${esc(g)}</button>`).join('')}
    </div>
    <div id="listado-grid" class="grid">${filtrados.map(cardHtml).join('')}</div>
    ${filtrados.length === 0 ? `<div class="empty"><div class="empty-ico">📭</div><p>No hay resultados.</p></div>` : ''}
  `;
}

function bindListado(tipo) {
  const base = tipo ? state.items.filter(i => i.type === tipo) : state.items;
  const grid = document.getElementById('listado-grid');
  const busq = document.getElementById('listado-buscar');
  const ord = document.getElementById('listado-orden');
  let gen = state.params.genre || '';

  const pintar = () => {
    let res = base.slice();
    if (gen) res = res.filter(i => i.genre === gen);
    const q = (busq?.value || '').toLowerCase().trim();
    if (q) res = res.filter(i => (i.title || '').toLowerCase().includes(q));
    const o = ord?.value;
    if (o === 'az') res.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    else if (o === 'za') res.sort((a,b) => (b.title||'').localeCompare(a.title||''));
    else if (o === 'rating') res.sort((a,b) => (b.rating||0) - (a.rating||0));
    else res.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));

    grid.innerHTML = res.length
      ? res.map(cardHtml).join('')
      : `<div class="empty" style="grid-column:1/-1;"><div class="empty-ico">📭</div><p>Sin resultados.</p></div>`;
  };

  busq?.addEventListener('input', pintar);
  ord?.addEventListener('change', pintar);
  document.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      gen = c.dataset.gen;
      pintar();
    });
  });
}

function viewDetail(key) {
  const item = state.items.find(i => i.key === key);
  if (!item) return `<div class="empty"><h2>No encontrado</h2><a href="#home" class="btn btn-accent">Inicio</a></div>`;

  const esSerie = item.type === 'tv';
  const eps = item.episodes || [];
  const numTemps = esSerie ? new Set(eps.map(e => e.season)).size : 0;
  const esFav = state.favorites.some(f => f.key === item.key);
  const relacionado = state.items.filter(i => i.key !== item.key && i.type === item.type && i.genre === item.genre).slice(0, 12);
  const playHref = `#watch/${encodeURIComponent(item.key)}`;
  const temporadas = esSerie ? [...new Set(eps.map(e => e.season))].sort((a,b) => a-b) : [];

  return `
    <section class="detalle-bg">
      <img src="${backdropUrl(item)}" alt="">
      <div class="detalle-overlay"></div>
      <div class="detalle-content">
        <div class="detalle-poster">
          <img src="${posterUrl(item)}" alt="" onerror="this.src='${placeholder(item.title)}'">
        </div>
        <div class="detalle-info">
          <h1 class="detalle-title">${esc(item.title)}</h1>
          <div class="detalle-meta">
            ${item.rating ? `<span class="pill">★ ${Number(item.rating).toFixed(1)}</span>` : ''}
            ${item.release_date ? `<span class="pill">${item.release_date.slice(0,4)}</span>` : ''}
            ${item.genre ? `<span class="pill">${esc(item.genre)}</span>` : ''}
            <span class="pill">${esSerie ? 'Serie' : 'Película'}</span>
            ${esSerie ? `<span class="pill">${numTemps} temporada${numTemps !== 1 ? 's' : ''}</span>` : ''}
          </div>
          ${item.overview ? `<p class="detalle-overview">${esc(item.overview)}</p>` : ''}
          <div class="detalle-actions">
            <a href="${playHref}" class="btn btn-primary">▶ Reproducir</a>
            <button class="btn btn-secondary" id="btn-fav">${esFav ? '✓ En Mi Lista' : '+ Mi Lista'}</button>
            <button class="btn btn-ghost" id="btn-tmdb">Buscar en TMDB</button>
          </div>
        </div>
      </div>
    </section>

    ${esSerie && temporadas.length ? `
      <section style="margin-bottom:24px;">
        <h2 style="font-size:20px;font-weight:800;margin:0 0 12px;">Temporadas</h2>
        <div class="temps-list">
          ${temporadas.map(t => {
            const count = eps.filter(e => e.season === t).length;
            return `<a class="temp-card" href="#episodes/${encodeURIComponent(item.key)}/${t}">
              <div class="temp-num">T${t}</div>
              <div class="temp-count">${count} ep${count !== 1 ? 's' : ''}</div>
            </a>`;
          }).join('')}
        </div>
      </section>
    ` : ''}

    ${relacionado.length ? rowHtml('Similares', relacionado) : ''}
  `;
}

function bindDetail(key) {
  const item = state.items.find(i => i.key === key);
  if (!item) return;

  document.getElementById('btn-fav')?.addEventListener('click', async () => {
    const existing = state.favorites.find(f => f.key === item.key);
    if (existing) {
      await DB.del('favorites', item.key);
      toast('Eliminado de Mi Lista');
    } else {
      await DB.put('favorites', { key: item.key, item, addedAt: Date.now() });
      toast('Añadido a Mi Lista', 'success');
    }
    await reload();
    document.getElementById('btn-fav').textContent = state.favorites.some(f => f.key === item.key) ? '✓ En Mi Lista' : '+ Mi Lista';
  });

  document.getElementById('btn-tmdb')?.addEventListener('click', async (e) => {
    if (!state.apiKey) { toast('Configura la API key de TMDB en Admin', 'error'); return; }
    e.target.disabled = true;
    e.target.textContent = '...';
    const enriched = await TMDB.enrich(item);
    if (enriched.tmdbId) {
      await DB.put('items', enriched);
      await reload();
      toast('Datos actualizados desde TMDB', 'success');
      render();
    } else {
      toast('No encontrado en TMDB', 'warning');
      e.target.disabled = false;
      e.target.textContent = 'Buscar en TMDB';
    }
  });
}

function viewEpisodes(key, season) {
  const item = state.items.find(i => i.key === key);
  if (!item || item.type !== 'tv') return `<div class="empty"><h2>Serie no encontrada</h2></div>`;

  const eps = (item.episodes || []).filter(e => e.season === parseInt(season)).sort((a,b) => a.episode - b.episode);
  if (!eps.length) return `<div class="empty"><h2>Sin episodios</h2><a href="#detail/${encodeURIComponent(key)}" class="btn btn-accent">Volver</a></div>`;

  return `
    <h1 style="font-size:24px;font-weight:900;margin:0 0 4px;">${esc(item.title)}</h1>
    <p style="font-size:13px;color:var(--muted);margin:0 0 20px;">Temporada ${season}</p>
    <div class="eps-list">
      ${eps.map(ep => {
        const epKey = `${item.key}_s${ep.season}e${ep.episode}`;
        const prog = state.progress[epKey];
        const pct = prog && prog.duration ? Math.min(100, (prog.seconds / prog.duration) * 100) : 0;
        return `<a class="ep-item" href="#watch/${encodeURIComponent(item.key)}?s=${ep.season}&e=${ep.episode}">
          <div class="ep-num">${ep.episode}</div>
          <div class="ep-info">
            <h3>Episodio ${ep.episode}</h3>
            ${pct > 0 ? `<div style="height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;max-width:200px;"><div style="height:100%;width:${pct}%;background:var(--accent);"></div></div>` : ''}
          </div>
          <div class="ep-play">▶</div>
        </a>`;
      }).join('')}
    </div>
    <a href="#detail/${encodeURIComponent(key)}" class="btn btn-ghost">← Volver al detalle</a>
  `;
}

function viewWatch(key, params) {
  const item = state.items.find(i => i.key === key);
  if (!item) return `<div class="empty"><h2>No encontrado</h2></div>`;

  let url = item.videoUrl, epInfo = '', progressKey = item.key;
  if (item.type === 'tv') {
    const season = parseInt(params.s) || 1;
    const episode = parseInt(params.e) || 1;
    const ep = (item.episodes || []).find(e => e.season === season && e.episode === episode)
            || (item.episodes || [])[0];
    if (!ep) return `<div class="empty"><h2>Sin episodios</h2></div>`;
    url = ep.url;
    epInfo = `T${ep.season} E${ep.episode}`;
    progressKey = `${item.key}_s${ep.season}e${ep.episode}`;
  }

  if (!url) return `<div class="empty"><h2>Sin URL</h2><a href="#detail/${encodeURIComponent(key)}" class="btn btn-accent">Volver</a></div>`;

  return `
    <h1 class="repro-title">${esc(item.title)}</h1>
    ${epInfo ? `<p class="repro-ep">${epInfo}</p>` : ''}
    <div class="video-wrap">
      <video id="video" controls playsinline webkit-playsinline preload="metadata" poster="${backdropUrl(item)}" data-key="${esc(progressKey)}">
        <source src="${esc(url)}" type="video/mp4">
      </video>
    </div>
    <div class="repro-nav">
      <a href="#detail/${encodeURIComponent(key)}" class="btn btn-secondary">← Volver al detalle</a>
      ${item.type === 'tv' ? `<a href="#episodes/${encodeURIComponent(key)}/${parseInt(params.s)||1}" class="btn btn-ghost">Ver episodios</a>` : ''}
    </div>
    <div class="repro-nota">
      ⚠️ La reproducción depende de que la URL sea accesible y en formato compatible. Si no reproduce, verifica en Admin.
    </div>
  `;
}

function bindWatch() {
  const video = document.getElementById('video');
  if (!video) return;
  const key = video.dataset.key;
  const prog = state.progress[key];

  video.addEventListener('loadedmetadata', () => {
    if (prog && prog.seconds > 3 && prog.seconds < video.duration - 5) {
      video.currentTime = prog.seconds;
    }
  }, { once: true });

  video.addEventListener('timeupdate', () => {
    if (video.duration > 0) {
      state.progress[key] = { key, seconds: video.currentTime, duration: video.duration };
    }
  });

  video.addEventListener('pause', () => {
    if (video.duration > 0) {
      DB.put('progress', { key, seconds: video.currentTime, duration: video.duration, updatedAt: Date.now() }).catch(() => {});
    }
  });

  video.addEventListener('error', () => toast('No se pudo reproducir. Verifica la URL.', 'error'));
}

function viewMyList() {
  if (!state.favorites.length) {
    return `<div class="empty">
      <div class="empty-ico">🔖</div>
      <h2>Mi Lista vacía</h2>
      <p>Guarda títulos desde el detalle de cada uno.</p>
      <a href="#explore" class="btn btn-accent">Explorar</a>
    </div>`;
  }
  return `
    <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0 0 16px;">Mi Lista</h1>
    <div class="grid">${state.favorites.map(f => cardHtml(f.item)).join('')}</div>
  `;
}

function viewSearch() {
  return `
    <h1 style="font-size:28px;font-weight:900;letter-spacing:-1px;margin:0 0 16px;">Buscar</h1>
    <div class="filters">
      <input type="text" id="search-q" class="input" placeholder="Buscar..." autofocus>
      <select id="search-type" class="input">
        <option value="">Todo</option>
        <option value="movie">Películas</option>
        <option value="tv">Series</option>
      </select>
    </div>
    <div id="search-results"></div>
  `;
}

function bindSearch() {
  const q = document.getElementById('search-q');
  const type = document.getElementById('search-type');
  const res = document.getElementById('search-results');
  let timer;

  const pintar = () => {
    const query = q.value.toLowerCase().trim();
    if (!query) { res.innerHTML = `<div class="empty"><p>Escribe para buscar.</p></div>`; return; }
    let r = state.items.filter(i => (i.title||'').toLowerCase().includes(query));
    if (type.value) r = r.filter(i => i.type === type.value);
    if (!r.length) { res.innerHTML = `<div class="empty"><p>Sin resultados.</p></div>`; return; }
    res.innerHTML = `<p style="color:var(--muted);margin-bottom:12px;">${r.length} resultado${r.length!==1?'s':''}</p><div class="grid">${r.map(cardHtml).join('')}</div>`;
  };

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(pintar, 200); });
  type.addEventListener('change', pintar);
  pintar();
}

// ============================================================
// ADMIN
// ============================================================
function viewAdminLogin() {
  return `
    <div style="max-width:400px;margin:60px auto;">
      <div class="panel">
        <h3>🔒 Acceso Admin</h3>
        <p class="info-box" style="font-size:12px;">Esta contraseña solo controla la UI del panel. Cualquiera con acceso al código puede saltársela. No es seguridad real.</p>
        <div class="form-group">
          <label>Usuario</label>
          <input type="text" id="al-user" class="input" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input type="password" id="al-pass" class="input" autocomplete="off">
        </div>
        <button class="btn btn-accent" style="width:100%;" id="al-btn">Entrar</button>
      </div>
    </div>
  `;
}

function bindAdminLogin() {
  document.getElementById('al-btn').addEventListener('click', () => {
    const u = document.getElementById('al-user').value.trim();
    const p = document.getElementById('al-pass').value;
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      state.isAdmin = true;
      sessionStorage.setItem('sp_admin', '1');
      toast('Bienvenido', 'success');
      render();
    } else {
      toast('Credenciales incorrectas', 'error');
    }
  });
}

function viewAdmin(tab = 'dashboard') {
  if (!state.isAdmin) return viewAdminLogin();

  const items = state.items;
  const movies = items.filter(i => i.type === 'movie').length;
  const series = items.filter(i => i.type === 'tv').length;
  const eps = items.reduce((a, i) => a + (i.episodes?.length || 0), 0);

  let content = '';

  if (tab === 'dashboard') {
    content = `
      <div class="stats">
        <div class="stat"><div class="stat-label">Total</div><div class="stat-value">${items.length}</div></div>
        <div class="stat"><div class="stat-label">Películas</div><div class="stat-value">${movies}</div></div>
        <div class="stat"><div class="stat-label">Series</div><div class="stat-value">${series}</div></div>
        <div class="stat"><div class="stat-label">Episodios</div><div class="stat-value">${eps}</div></div>
        <div class="stat"><div class="stat-label">Favoritos</div><div class="stat-value">${state.favorites.length}</div></div>
        <div class="stat"><div class="stat-label">TMDB</div><div class="stat-value" style="font-size:16px;">${state.apiKey ? '✓ OK' : 'Sin configurar'}</div></div>
      </div>
      <div class="warn-box">⚠️ App estática. Los datos viven solo en este navegador. No se sincronizan entre dispositivos. Haz backups.</div>
    `;
  }
  else if (tab === 'import') {
    content = `
      <div class="panel">
        <h3>📥 Importar TXT</h3>
        <div class="info-box">
          <strong>Formato película:</strong>
          <pre>Nombre: Annabelle
Url: https://servidor.pro:8080/movie.mp4
Genero: Terror</pre>
          <strong>Formato serie:</strong>
          <pre>Nombre: Welcome To Derry
Url: http://servidor.pro:8080
Genero: Terror
Episodio 1: http://servidor.pro:8080/series/ep1.mp4
Episodio 2: http://servidor.pro:8080/series/ep2.mp4</pre>
        </div>

        <div class="form-group">
          <label>Archivo .txt</label>
          <input type="file" id="imp-file" accept=".txt,text/plain" class="input">
        </div>
        <p style="text-align:center;color:var(--muted);font-size:12px;margin:10px 0;">— o pega el texto —</p>
        <div class="form-group">
          <textarea id="imp-text" class="input" placeholder="Pega aquí el contenido..."></textarea>
          <button class="btn btn-secondary" id="imp-process" style="margin-top:8px;width:100%;">Procesar texto</button>
        </div>
      </div>
      <div id="imp-preview"></div>
    `;
  }
  else if (tab === 'catalogo') {
    content = `
      <div class="panel">
        <h3>🎬 Catálogo (${items.length} títulos)</h3>
        <div class="form-group">
          <input type="text" id="cat-buscar" class="input" placeholder="Filtrar...">
        </div>
        <div id="cat-tabla" style="overflow-x:auto;">
          ${renderCatalogoTabla(items)}
        </div>
      </div>
    `;
  }
  else if (tab === 'config') {
    content = `
      <div class="panel">
        <h3>🎬 API de TMDB</h3>
        <p class="info-box" style="font-size:12px;">Tu API key se guarda en IndexedDB (no en el código). Obtén una gratis en themoviedb.org.</p>
        <div class="form-group">
          <label>API key</label>
          <input type="password" id="cfg-key" class="input" placeholder="${state.apiKey ? '•••••••••• (configurada)' : 'Pega tu key aquí'}">
        </div>
        <div class="actions">
          <button class="btn btn-accent" id="cfg-save">Guardar</button>
          ${state.apiKey ? `<button class="btn btn-secondary" id="cfg-test">Probar</button><button class="btn btn-danger" id="cfg-del">Eliminar</button>` : ''}
        </div>
      </div>
      <div class="panel">
        <h3>🧹 Peligro</h3>
        <p style="color:var(--muted);font-size:13px;">Borra TODO: catálogo, favoritos, configuración.</p>
        <button class="btn btn-danger" id="cfg-clear">Borrar todos los datos</button>
      </div>
    `;
  }
  else if (tab === 'backup') {
    content = `
      <div class="panel">
        <h3>💾 Exportar backup</h3>
        <p style="color:var(--muted);font-size:13px;">Descarga un JSON con todo tu catálogo y favoritos.</p>
        <button class="btn btn-accent" id="bk-export">Descargar backup</button>
      </div>
      <div class="panel">
        <h3>📂 Restaurar backup</h3>
        <div class="form-group">
          <input type="file" id="bk-file" accept=".json,application/json" class="input">
        </div>
        <button class="btn btn-secondary" id="bk-import">Restaurar</button>
      </div>
    `;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <h1 style="font-size:26px;font-weight:900;margin:0;">Admin</h1>
      <button class="btn btn-ghost btn-sm" id="admin-logout">Cerrar sesión</button>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='dashboard'?'active':''}" data-tab="dashboard">📊 Resumen</button>
      <button class="tab ${tab==='import'?'active':''}" data-tab="import">📥 Importar</button>
      <button class="tab ${tab==='catalogo'?'active':''}" data-tab="catalogo">🎬 Catálogo</button>
      <button class="tab ${tab==='config'?'active':''}" data-tab="config">⚙️ Config</button>
      <button class="tab ${tab==='backup'?'active':''}" data-tab="backup">💾 Backup</button>
    </div>
    <div id="admin-content">${content}</div>
  `;
}

function renderCatalogoTabla(items) {
  if (!items.length) return `<p style="color:var(--muted);">Sin títulos.</p>`;
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;border-bottom:1px solid rgba(255,255,255,.1);">
        <th style="padding:8px 4px;">Tipo</th>
        <th style="padding:8px 4px;">Título</th>
        <th style="padding:8px 4px;">Género</th>
        <th style="padding:8px 4px;">Acciones</th>
      </tr></thead>
      <tbody>
        ${items.slice(0, 100).map(i => `
          <tr style="border-bottom:1px solid rgba(255,255,255,.04);">
            <td style="padding:8px 4px;"><span class="badge ${i.type==='tv'?'badge-blue':'badge-orange'}">${i.type==='tv'?'Serie':'Peli'}</span></td>
            <td style="padding:8px 4px;">${esc(i.title)}</td>
            <td style="padding:8px 4px;color:var(--muted);">${esc(i.genre||'-')}</td>
            <td style="padding:8px 4px;">
              <button class="btn btn-danger btn-sm" data-del="${esc(i.key)}">Eliminar</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${items.length > 100 ? `<p style="color:var(--muted);font-size:12px;margin-top:8px;">Mostrando 100 de ${items.length}.</p>` : ''}
  `;
}

function bindAdmin(tab) {
  if (!state.isAdmin) { bindAdminLogin(); return; }

  document.getElementById('admin-logout')?.addEventListener('click', () => {
    state.isAdmin = false;
    sessionStorage.removeItem('sp_admin');
    toast('Sesión cerrada');
    render();
  });

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      state.params.tab = t.dataset.tab;
      render();
    });
  });

  if (tab === 'import') bindImport();
  if (tab === 'catalogo') bindCatalogo();
  if (tab === 'config') bindConfig();
  if (tab === 'backup') bindBackup();
}

function bindImport() {
  const previewEl = document.getElementById('imp-preview');
  const fileInput = document.getElementById('imp-file');
  const textArea = document.getElementById('imp-text');

  fileInput?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    previewEl.innerHTML = '<div class="spinner"></div>';
    try {
      const texto = await leerArchivo(f);
      await mostrarPreview(texto, f.name);
    } catch (err) {
      previewEl.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  });

  document.getElementById('imp-process')?.addEventListener('click', async () => {
    const t = textArea.value;
    if (!t.trim()) { toast('Texto vacío', 'error'); return; }
    previewEl.innerHTML = '<div class="spinner"></div>';
    await mostrarPreview(t, 'pegado-manual');
  });
}

async function mostrarPreview(texto, nombreArchivo) {
  const el = document.getElementById('imp-preview');
  const { items, errores } = parseTxt(texto);
  if (!items.length) {
    el.innerHTML = `<div class="error-box">No se detectaron registros válidos.${errores.length ? `<ul class="errs-list">${errores.slice(0,10).map(e=>`<li>Línea ${e.linea}: ${esc(e.motivo)}</li>`).join('')}</ul>` : ''}</div>`;
    return;
  }

  const { nuevos, duplicados } = await detectarDuplicados(items);

  el.innerHTML = `
    <div class="panel">
      <h3>📋 Vista previa</h3>
      <div class="stats">
        <div class="stat"><div class="stat-label">Encontrados</div><div class="stat-value">${items.length}</div></div>
        <div class="stat"><div class="stat-label">Nuevos</div><div class="stat-value" style="color:var(--ok);">${nuevos.length}</div></div>
        <div class="stat"><div class="stat-label">Duplicados</div><div class="stat-value" style="color:var(--warn);">${duplicados.length}</div></div>
        <div class="stat"><div class="stat-label">Errores</div><div class="stat-value" style="color:var(--danger);">${errores.length}</div></div>
      </div>
      <div class="preview-list">
        ${items.slice(0, 10).map(i => `
          <div class="preview-row">
            <span class="badge ${i.tipo==='tv'?'badge-blue':'badge-orange'}">${i.tipo==='tv'?'Serie':'Peli'}</span>
            <strong>${esc(i.nombre)}</strong>
            <span style="color:var(--muted);font-size:11px;">${esc(i.genero)}</span>
          </div>
        `).join('')}
        ${items.length > 10 ? `<p style="text-align:center;color:var(--muted);font-size:12px;">... y ${items.length - 10} más</p>` : ''}
      </div>
      ${errores.length ? `<details><summary style="color:var(--warn);cursor:pointer;font-size:13px;">Ver ${errores.length} errores</summary><ul class="errs-list">${errores.slice(0,20).map(e=>`<li>Línea ${e.linea}: ${esc(e.motivo)}</li>`).join('')}</ul></details>` : ''}
      ${nuevos.length ? `
        <div class="actions">
          <button class="btn btn-accent" id="btn-confirmar">✓ Confirmar (${nuevos.length} nuevos)</button>
          <button class="btn btn-ghost" id="btn-cancelar">Cancelar</button>
        </div>
      ` : `<p style="color:var(--warn);font-size:13px;margin-top:12px;">Todos ya existen. Nada que importar.</p>`}
    </div>
  `;

  document.getElementById('btn-cancelar')?.addEventListener('click', () => {
    document.getElementById('imp-preview').innerHTML = '';
  });

  document.getElementById('btn-confirmar')?.addEventListener('click', async () => {
    el.innerHTML = `<div class="panel"><div class="spinner"></div><p style="text-align:center;">Guardando ${nuevos.length} registros...</p></div>`;
    try {
      const res = await guardarItems(nuevos);
      await reload();

      const verificados = state.items.filter(x =>
        nuevos.some(n => (n.tipo==='tv' && x.title===n.nombre) || (n.tipo==='movie' && x.videoUrl===n.url))
      );

      if (!verificados.length) {
        el.innerHTML = `<div class="error-box"><h3>❌ No se guardaron</h3><p>Los datos no aparecieron en IndexedDB. Posible modo incógnito o cuota llena.</p></div>`;
        return;
      }

      el.innerHTML = `
        <div class="success-box">
          <h3>✅ Importación completada</h3>
          <p><strong>${res.ok}</strong> guardados · <strong>${verificados.length}</strong> verificados · <strong>${duplicados.length}</strong> duplicados omitidos · <strong>${errores.length}</strong> errores</p>
        </div>
        <div class="actions">
          <a href="#home" class="btn btn-accent">Ver catálogo</a>
          <button class="btn btn-secondary" onclick="location.reload()">Importar otro</button>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="error-box">❌ ${esc(err.message)}</div>`;
    }
  });
}

function bindCatalogo() {
  document.getElementById('cat-buscar')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const fil = state.items.filter(i => (i.title||'').toLowerCase().includes(q));
    document.getElementById('cat-tabla').innerHTML = renderCatalogoTabla(fil);
    bindCatalogoDel();
  });

  bindCatalogoDel();
}

function bindCatalogoDel() {
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar?')) return;
      await DB.del('items', btn.dataset.del);
      await reload();
      toast('Eliminado', 'success');
      render();
    });
  });
}

function bindConfig() {
  document.getElementById('cfg-save')?.addEventListener('click', async () => {
    const k = document.getElementById('cfg-key').value.trim();
    if (!k) { toast('Ingresa key', 'error'); return; }
    await DB.put('config', { key: 'tmdbApiKey', value: k });
    state.apiKey = k;
    toast('Key guardada', 'success');
    render();
  });

  document.getElementById('cfg-test')?.addEventListener('click', async () => {
    try {
      const r = await TMDB.search('Inception');
      toast(`✓ OK: ${r.length} resultados`, 'success');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  });

  document.getElementById('cfg-del')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar API key?')) return;
    await DB.del('config', 'tmdbApiKey');
    state.apiKey = null;
    toast('Key eliminada');
    render();
  });

  document.getElementById('cfg-clear')?.addEventListener('click', async () => {
    if (!confirm('⚠️ BORRAR TODO. ¿Seguro?')) return;
    if (!confirm('🛑 Última confirmación.')) return;
    for (const s of ['items', 'favorites', 'progress', 'config']) {
      await DB.clear(s);
    }
    state.items = [];
    state.favorites = [];
    state.apiKey = null;
    toast('Todo borrado', 'success');
    setTimeout(() => location.reload(), 1000);
  });
}

function bindBackup() {
  document.getElementById('bk-export')?.addEventListener('click', async () => {
    const data = {
      exportado: new Date().toISOString(),
      items: state.items,
      favorites: state.favorites
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simpsoteca-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup descargado', 'success');
  });

  document.getElementById('bk-import')?.addEventListener('click', async () => {
    const f = document.getElementById('bk-file').files[0];
    if (!f) { toast('Selecciona archivo', 'error'); return; }
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      let count = 0;
      for (const item of data.items || []) { await DB.put('items', item); count++; }
      for (const fav of data.favorites || []) { await DB.put('favorites', fav); }
      await reload();
      toast(`✓ Restaurado: ${count} items`, 'success');
      render();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  });
}

// ============================================================
// ROUTER
// ============================================================
function parseHash() {
  const hash = location.hash.slice(1) || 'home';
  const [pathPart, queryPart] = hash.split('?');
  const parts = pathPart.split('/');
  const params = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => params[k] = v);
  }
  return { route: parts[0], args: parts.slice(1), params };
}

function render() {
  const app = document.getElementById('app');
  const { route, args, params } = parseHash();
  state.params = params;
  state.route = route;

  // Marcar nav activo
  document.querySelectorAll('[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  try {
    if (route === 'home') {
      app.innerHTML = viewHome();
    } else if (route === 'movies') {
      app.innerHTML = viewListado('movie', 'Películas');
      bindListado('movie');
    } else if (route === 'series') {
      app.innerHTML = viewListado('tv', 'Series');
      bindListado('tv');
    } else if (route === 'explore') {
      app.innerHTML = viewListado(null, 'Explorar');
      bindListado(null);
    } else if (route === 'detail') {
      const key = decodeURIComponent(args[0] || '');
      app.innerHTML = viewDetail(key);
      bindDetail(key);
    } else if (route === 'episodes') {
      const key = decodeURIComponent(args[0] || '');
      const season = args[1] || 1;
      app.innerHTML = viewEpisodes(key, season);
    } else if (route === 'watch') {
      const key = decodeURIComponent(args[0] || '');
      app.innerHTML = viewWatch(key, params);
      bindWatch();
    } else if (route === 'mylist') {
      app.innerHTML = viewMyList();
    } else if (route === 'search') {
      app.innerHTML = viewSearch();
      bindSearch();
    } else if (route === 'admin') {
      app.innerHTML = viewAdmin(params.tab || 'dashboard');
      bindAdmin(params.tab || 'dashboard');
    } else {
      app.innerHTML = `<div class="empty"><h2>404</h2><a href="#home" class="btn btn-accent">Inicio</a></div>`;
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty"><h2>Error</h2><p>${esc(e.message)}</p><a href="#home" class="btn btn-accent">Inicio</a></div>`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ARRANQUE
// ============================================================
window.addEventListener('hashchange', render);

(async function init() {
  document.getElementById('app').innerHTML = '<div class="spinner"></div>';
  try {
    await DB.open();
    await reload();
  } catch (e) {
    console.warn('IndexedDB:', e.message);
    state.items = [];
    state.favorites = [];
    state.apiKey = null;
  }
  render();
})();