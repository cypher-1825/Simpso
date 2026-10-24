// ============================================================
// catalogo.js — Listados, filtros, detalle, temporadas, episodios
// ============================================================
import { DB } from './database.js';
import { TMDB } from './tmdb.js';

const GENRES_LIST = [
  'Acción','Animación','Aventura','Bélico','Ciencia Ficción','Comedia','Crimen',
  'Documental','Drama','Familia','Fantasía','Historia','Misterio','Música',
  'Romance','Suspenso','Terror','Western','Otros'
];

export const Catalogo = {
  async init() {
    await DB.init();
    await TMDB.init();
  },

  // ---------- HELPERS ----------
  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  placeholder(title, w = 342, h = 513) {
    let hash = 0;
    for (let i = 0; i < (title || '').length; i++) hash = ((hash << 5) - hash) + title.charCodeAt(i) | 0;
    const hue = Math.abs(hash) % 360;
    const initials = (title || '?').split(' ').slice(0,2).map(x => x[0] || '').join('').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="hsl(${hue},25%,22%)"/><stop offset="100%" stop-color="hsl(${hue},25%,10%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.floor(w/4)}" font-weight="900" fill="rgba(255,255,255,.15)">${initials}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  posterUrl(item) {
    if (item?.poster_path) return TMDB.poster(item, 'w342');
    return this.placeholder(item?.title || '');
  },

  backdropUrl(item) {
    if (item?.backdrop_path) return TMDB.backdrop(item, 'w1280');
    if (item?.poster_path) return TMDB.backdrop(item, 'w780');
    return this.placeholder(item?.title || '', 1280, 720);
  },

  // ---------- LISTADOS ----------
  async obtenerPorTipo(tipo) {
    return DB.getByType(tipo);
  },

  async obtenerTodos() {
    return DB.getAll();
  },

  filtrar(items, { genero, query, orden } = {}) {
    let r = [...items];
    if (genero) r = r.filter(i => i.genre === genero);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter(i => (i.title || '').toLowerCase().includes(q));
    }
    if (orden === 'az') r.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    else if (orden === 'za') r.sort((a,b) => (b.title||'').localeCompare(a.title||''));
    else if (orden === 'reciente') r.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));
    else if (orden === 'rating') r.sort((a,b) => (b.rating||0) - (a.rating||0));
    return r;
  },

  // ---------- CARD ----------
  cardHtml(item, { width = 160 } = {}) {
    const poster = this.posterUrl(item);
    const rating = item.rating ? `<div class="card-rating">★ ${Number(item.rating).toFixed(1)}</div>` : '';
    const type = item.type === 'tv' ? `<div class="card-type">Serie</div>` : '';
    return `
      <a class="card" style="width:${width}px" href="detalle.html?type=${item.type}&key=${encodeURIComponent(item.key)}">
        <div class="card-poster">
          <img src="${poster}" alt="${this.escapeHtml(item.title)}" loading="lazy" onerror="this.src='${this.placeholder(item.title)}'">
          ${rating}${type}
        </div>
        <h3 class="card-title">${this.escapeHtml(item.title)}</h3>
        <p class="card-sub">${this.escapeHtml(item.genre || '')}</p>
      </a>
    `;
  },

  // ---------- VISTA LISTADO (grid) ----------
  async renderListado(container, { tipo, titulo, generoInicial = null }) {
    container.innerHTML = `<div class="spinner"></div>`;

    try {
      const items = tipo ? await this.obtenerPorTipo(tipo) : await this.obtenerTodos();
      const params = new URLSearchParams(location.search);
      const generoURL = params.get('genre');
      let generoActivo = generoURL || generoInicial;
      let query = '';
      let orden = 'reciente';

      const render = () => {
        const filtrados = this.filtrar(items, { genero: generoActivo, query, orden });
        const grid = filtrados.length
          ? `<div class="grid">${filtrados.map(i => this.cardHtml(i)).join('')}</div>`
          : `<div class="empty">
               <div class="empty-icon">🔍</div>
               <h2 class="empty-title">Sin resultados</h2>
               <p class="empty-text">No hay títulos que coincidan con los filtros seleccionados.</p>
             </div>`;

        container.innerHTML = `
          <div class="listado-header">
            <h1 class="listado-title">${this.escapeHtml(titulo)}</h1>
            <span class="listado-count">${filtrados.length} ${filtrados.length === 1 ? 'título' : 'títulos'}</span>
          </div>

          <div class="listado-filtros">
            <input type="text" id="filtro-buscar" class="input-buscar" placeholder="Buscar por nombre..." value="${this.escapeHtml(query)}">
            <select id="filtro-orden" class="select-filtro">
              <option value="reciente" ${orden === 'reciente' ? 'selected' : ''}>Más recientes</option>
              <option value="az" ${orden === 'az' ? 'selected' : ''}>A - Z</option>
              <option value="za" ${orden === 'za' ? 'selected' : ''}>Z - A</option>
              <option value="rating" ${orden === 'rating' ? 'selected' : ''}>Mejor valoradas</option>
            </select>
          </div>

          <div class="generos-scroll">
            <button class="genero-chip ${!generoActivo ? 'active' : ''}" data-gen="">Todos</button>
            ${GENRES_LIST.map(g => `<button class="genero-chip ${generoActivo === g ? 'active' : ''}" data-gen="${g}">${g}</button>`).join('')}
          </div>

          ${grid}
        `;

        document.getElementById('filtro-buscar').addEventListener('input', (e) => {
          query = e.target.value;
          const cur = e.target.selectionStart;
          render();
          const nuevo = document.getElementById('filtro-buscar');
          nuevo.focus();
          nuevo.setSelectionRange(cur, cur);
        });

        document.getElementById('filtro-orden').addEventListener('change', (e) => {
          orden = e.target.value;
          render();
        });

        container.querySelectorAll('.genero-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            generoActivo = btn.dataset.gen || null;
            render();
          });
        });
      };

      render();
    } catch (err) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⚠️</div>
          <h2 class="empty-title">Error</h2>
          <p class="empty-text">${this.escapeHtml(err.message)}</p>
        </div>
      `;
    }
  },

  // ---------- DETALLE ----------
  async renderDetalle(container, { type, key }) {
    container.innerHTML = `<div class="spinner"></div>`;

    try {
      const items = await this.obtenerTodos();
      const item = items.find(i => i.key === key);
      if (!item) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">❓</div>
            <h2 class="empty-title">No encontrado</h2>
            <p class="empty-text">Este título no existe en tu catálogo.</p>
            <a href="index.html" class="btn btn-accent">Volver al inicio</a>
          </div>
        `;
        return;
      }

      // Intentar enriquecer con TMDB si faltan datos
      let itemFull = item;
      if (!item.overview && (await TMDB.tieneKey())) {
        try {
          itemFull = await TMDB.enriquecer(item);
          if (itemFull.tmdbId) await DB.put(itemFull);
        } catch(e) { console.warn('TMDB enriquecer:', e.message); }
      }

      const esSerie = itemFull.type === 'tv';
      const episodios = itemFull.episodes || [];
      const numTemporadas = esSerie ? new Set(episodios.map(e => e.season)).size : 0;
      const favs = await DB.getFavorites();
      const esFav = favs.some(f => f.key === itemFull.key);

      const relacionado = items.filter(i =>
        i.key !== itemFull.key &&
        i.type === itemFull.type &&
        i.genre === itemFull.genre
      ).slice(0, 12);

      const playHref = esSerie && episodios.length > 0
        ? `reproductor.html?type=tv&key=${encodeURIComponent(itemFull.key)}&season=${episodios[0].season}&episode=${episodios[0].episode}`
        : `reproductor.html?type=${itemFull.type}&key=${encodeURIComponent(itemFull.key)}`;

      container.innerHTML = `
        <section class="detalle-hero">
          <div class="detalle-backdrop">
            <img src="${this.backdropUrl(itemFull)}" alt="">
            <div class="detalle-overlay"></div>
          </div>
          <div class="detalle-info">
            <div class="detalle-poster">
              <img src="${this.posterUrl(itemFull)}" alt="${this.escapeHtml(itemFull.title)}" onerror="this.src='${this.placeholder(itemFull.title)}'">
            </div>
            <div class="detalle-text">
              <h1 class="detalle-title">${this.escapeHtml(itemFull.title)}</h1>
              <div class="detalle-meta">
                ${itemFull.rating ? `<span class="meta-pill">★ ${Number(itemFull.rating).toFixed(1)}</span>` : ''}
                ${itemFull.release_date ? `<span class="meta-pill">${itemFull.release_date.slice(0,4)}</span>` : ''}
                ${itemFull.genre ? `<span class="meta-pill">${this.escapeHtml(itemFull.genre)}</span>` : ''}
                <span class="meta-pill">${esSerie ? 'Serie' : 'Película'}</span>
                ${esSerie ? `<span class="meta-pill">${numTemporadas} temporada${numTemporadas !== 1 ? 's' : ''}</span>` : ''}
              </div>
              ${itemFull.overview ? `<p class="detalle-overview">${this.escapeHtml(itemFull.overview)}</p>` : ''}
              <div class="detalle-actions">
                <a href="${playHref}" class="btn btn-primary">▶ Reproducir</a>
                <button class="btn btn-secondary" id="btn-fav">${esFav ? '✓ En Mi Lista' : '+ Mi Lista'}</button>
                <a href="admin.html?edit=${encodeURIComponent(itemFull.key)}" class="btn btn-ghost">Editar</a>
              </div>
            </div>
          </div>
        </section>

        ${esSerie && episodios.length > 0 ? `
          <section class="detalle-temporadas">
            <h2 class="section-title">Temporadas</h2>
            <div class="temporadas-list">
              ${[...new Set(episodios.map(e => e.season))].sort((a,b) => a-b).map(season => `
                <a href="episodios.html?key=${encodeURIComponent(itemFull.key)}&season=${season}" class="temporada-card">
                  <div class="temporada-num">T${season}</div>
                  <div class="temporada-count">${episodios.filter(e => e.season === season).length} episodios</div>
                </a>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${relacionado.length > 0 ? `
          <section class="row">
            <div class="row-header"><h2 class="row-title">Similares</h2></div>
            <div class="row-scroll">${relacionado.map(i => this.cardHtml(i)).join('')}</div>
          </section>
        ` : ''}
      `;

      document.getElementById('btn-fav').addEventListener('click', async () => {
        const ahora = await DB.toggleFavorite(itemFull);
        document.getElementById('btn-fav').textContent = ahora ? '✓ En Mi Lista' : '+ Mi Lista';
        window.toast?.(ahora ? 'Añadida a Mi Lista' : 'Eliminada de Mi Lista', 'success');
      });
    } catch (err) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⚠️</div>
          <h2 class="empty-title">Error</h2>
          <p class="empty-text">${this.escapeHtml(err.message)}</p>
        </div>
      `;
    }
  },

  // ---------- TEMPORADAS ----------
  async renderTemporadas(container, { key }) {
    container.innerHTML = `<div class="spinner"></div>`;
    try {
      const items = await this.obtenerTodos();
      const item = items.find(i => i.key === key);
      if (!item || item.type !== 'tv') {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">❓</div>
            <h2 class="empty-title">Serie no encontrada</h2>
            <a href="series.html" class="btn btn-accent">Ver series</a>
          </div>
        `;
        return;
      }

      const episodios = item.episodes || [];
      const temporadas = [...new Set(episodios.map(e => e.season))].sort((a,b) => a-b);

      if (temporadas.length === 0) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📺</div>
            <h2 class="empty-title">${this.escapeHtml(item.title)}</h2>
            <p class="empty-text">Esta serie no tiene episodios registrados.</p>
            <a href="admin.html" class="btn btn-accent">Editar en admin</a>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="listado-header">
          <h1 class="listado-title">${this.escapeHtml(item.title)}</h1>
          <span class="listado-count">${temporadas.length} temporada${temporadas.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="grid-temporadas">
          ${temporadas.map(t => {
            const count = episodios.filter(e => e.season === t).length;
            return `
              <a class="temporada-card-grande" href="episodios.html?key=${encodeURIComponent(item.key)}&season=${t}">
                <div class="temporada-portada">
                  <img src="${this.posterUrl(item)}" alt="${this.escapeHtml(item.title)}">
                </div>
                <div class="temporada-info">
                  <h3>Temporada ${t}</h3>
                  <p>${count} episodio${count !== 1 ? 's' : ''}</p>
                </div>
              </a>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty"><p class="empty-text">${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ---------- EPISODIOS ----------
  async renderEpisodios(container, { key, season }) {
    container.innerHTML = `<div class="spinner"></div>`;
    try {
      const items = await this.obtenerTodos();
      const item = items.find(i => i.key === key);
      if (!item || item.type !== 'tv') {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">❓</div>
            <h2 class="empty-title">Serie no encontrada</h2>
            <a href="series.html" class="btn btn-accent">Ver series</a>
          </div>
        `;
        return;
      }

      const numSeason = parseInt(season) || 1;
      const episodios = (item.episodes || []).filter(e => e.season === numSeason).sort((a,b) => a.episode - b.episode);

      if (episodios.length === 0) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📺</div>
            <h2 class="empty-title">Sin episodios</h2>
            <p class="empty-text">La temporada ${numSeason} no tiene episodios.</p>
            <a href="temporadas.html?key=${encodeURIComponent(item.key)}" class="btn btn-accent">Volver a temporadas</a>
          </div>
        `;
        return;
      }

      const progreso = await DB.getAllProgress();
      const progMap = {};
      progreso.forEach(p => { progMap[p.key] = p; });

      container.innerHTML = `
        <div class="listado-header">
          <h1 class="listado-title">${this.escapeHtml(item.title)}</h1>
          <span class="listado-count">Temporada ${numSeason}</span>
        </div>
        <div class="episodios-lista">
          ${episodios.map(ep => {
            const epKey = `${item.key}_s${numSeason}e${ep.episode}`;
            const prog = progMap[epKey];
            const progPct = prog && prog.duration ? Math.min(100, (prog.seconds / prog.duration) * 100) : 0;
            return `
              <a class="episodio-card" href="reproductor.html?type=tv&key=${encodeURIComponent(item.key)}&season=${numSeason}&episode=${ep.episode}">
                <div class="episodio-num">${ep.episode}</div>
                <div class="episodio-info">
                  <h3>Episodio ${ep.episode}</h3>
                  ${progPct > 0 ? `<div class="progress-mini"><div class="progress-mini-fill" style="width:${progPct}%"></div></div>` : ''}
                </div>
                <div class="episodio-play">▶</div>
              </a>
            `;
          }).join('')}
        </div>
        <div class="episodios-nav">
          ${numSeason > 1 ? `<a href="episodios.html?key=${encodeURIComponent(item.key)}&season=${numSeason - 1}" class="btn btn-secondary">← T${numSeason - 1}</a>` : ''}
          <a href="temporadas.html?key=${encodeURIComponent(item.key)}" class="btn btn-ghost">Todas las temporadas</a>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty"><p class="empty-text">${this.escapeHtml(err.message)}</p></div>`;
    }
  }
};