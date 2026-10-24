// ============================================================
// reproductor.js — Reproductor con progreso en IndexedDB
// Soporta películas y series/episodios
// ============================================================
import { DB } from './database.js';
import { TMDB } from './tmdb.js';

export const Reproductor = {
  _videoEl: null,
  _itemActual: null,
  _episodioActual: null,
  _progressKey: null,
  _saveInterval: null,

  async init() {
    await DB.init();
    await TMDB.init();
  },

  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  placeholder(title, w = 1280, h = 720) {
    let hash = 0;
    for (let i = 0; i < (title || '').length; i++) hash = ((hash << 5) - hash) + title.charCodeAt(i) | 0;
    const hue = Math.abs(hash) % 360;
    const initials = (title || '?').split(' ').slice(0,2).map(x => x[0] || '').join('').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="hsl(${hue},25%,22%)"/><stop offset="100%" stop-color="hsl(${hue},25%,10%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.floor(w/8)}" font-weight="900" fill="rgba(255,255,255,.15)">${initials}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  backdropUrl(item) {
    if (item?.backdrop_path) return TMDB.backdrop(item, 'w1280');
    if (item?.poster_path) return TMDB.backdrop(item, 'w780');
    return this.placeholder(item?.title || '');
  },

  formatearTiempo(seg) {
    if (!seg || isNaN(seg) || seg < 0) return '0:00';
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = Math.floor(seg % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s}` : `${m}:${s}`;
  },

  // ---------- REPRODUCTOR ----------
  async render(container, params) {
    container.innerHTML = `<div class="spinner"></div>`;

    try {
      const all = await DB.getAll();
      const key = params.key;
      const item = all.find(i => i.key === key);

      if (!item) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">❓</div>
            <h2 class="empty-title">Contenido no encontrado</h2>
            <p class="empty-text">Este título no existe en tu catálogo.</p>
            <a href="index.html" class="btn btn-accent">Volver al inicio</a>
          </div>
        `;
        return;
      }

      let urlVideo, tituloEpisodio = '', progressKey;
      let season = null, episode = null;

      if (item.type === 'tv') {
        const episodios = item.episodes || [];
        if (episodios.length === 0) {
          container.innerHTML = `
            <div class="empty">
              <div class="empty-icon">📺</div>
              <h2 class="empty-title">${this.escapeHtml(item.title)}</h2>
              <p class="empty-text">Esta serie no tiene episodios con URL.</p>
              <a href="detalle.html?type=tv&key=${encodeURIComponent(item.key)}" class="btn btn-accent">Volver al detalle</a>
            </div>
          `;
          return;
        }
        season = parseInt(params.season) || episodios[0].season;
        episode = parseInt(params.episode) || episodios[0].episode;

        const epActual = episodios.find(e => e.season === season && e.episode === episode)
                      || episodios[0];
        season = epActual.season;
        episode = epActual.episode;
        urlVideo = epActual.url;
        tituloEpisodio = `T${season} E${episode}`;
        progressKey = `${item.key}_s${season}e${episode}`;
      } else {
        urlVideo = item.videoUrl;
        progressKey = item.key;
      }

      if (!urlVideo) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">⚠️</div>
            <h2 class="empty-title">Sin URL de video</h2>
            <p class="empty-text">Este título no tiene una URL asignada.</p>
            <a href="admin.html" class="btn btn-accent">Editar en admin</a>
          </div>
        `;
        return;
      }

      this._itemActual = item;
      this._episodioActual = item.type === 'tv' ? { season, episode } : null;
      this._progressKey = progressKey;

      // Siguiente episodio si aplica
      let siguienteEp = null;
      let anteriorEp = null;
      if (item.type === 'tv') {
        const eps = item.episodes || [];
        const idx = eps.findIndex(e => e.season === season && e.episode === episode);
        if (idx > 0) anteriorEp = eps[idx - 1];
        if (idx < eps.length - 1) siguienteEp = eps[idx + 1];
      }

      container.innerHTML = `
        <div class="reproductor-wrap">
          <div class="reproductor-header">
            <div>
              <h1 class="reproductor-title">${this.escapeHtml(item.title)}</h1>
              ${tituloEpisodio ? `<p class="reproductor-ep">${tituloEpisodio}</p>` : ''}
            </div>
            <a href="detalle.html?type=${item.type}&key=${encodeURIComponent(item.key)}" class="btn btn-ghost">← Volver</a>
          </div>

          <div class="video-container">
            <video id="main-video" playsinline webkit-playsinline preload="metadata" poster="${this.backdropUrl(item)}">
              <source src="${urlVideo}" type="video/mp4">
              Tu navegador no soporta HTML5 video.
            </video>
            <button id="big-play" class="big-play-btn">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>

            <div id="controls" class="controls">
              <div class="controls-top">
                <span id="time-current">0:00</span>
                <input id="seek-bar" type="range" min="0" max="1000" value="0" step="1">
                <span id="time-total">0:00</span>
              </div>
              <div class="controls-bottom">
                <button id="btn-play" class="ctrl-btn">
                  <svg id="icon-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <svg id="icon-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                </button>
                <button id="btn-back10" class="ctrl-btn">-10s</button>
                <button id="btn-fwd10" class="ctrl-btn">+10s</button>
                <div style="flex:1"></div>
                <button id="btn-mute" class="ctrl-btn">
                  <svg id="icon-volume" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                </button>
                <input id="vol-bar" type="range" min="0" max="100" value="100" step="1" class="vol-bar">
                <button id="btn-fs" class="ctrl-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                </button>
              </div>
            </div>
          </div>

          ${item.type === 'tv' ? `
            <div class="reproductor-nav-ep">
              ${anteriorEp ? `
                <a class="btn btn-secondary" href="reproductor.html?type=tv&key=${encodeURIComponent(item.key)}&season=${anteriorEp.season}&episode=${anteriorEp.episode}">
                  ← T${anteriorEp.season} E${anteriorEp.episode}
                </a>
              ` : ''}
              ${siguienteEp ? `
                <a class="btn btn-accent" href="reproductor.html?type=tv&key=${encodeURIComponent(item.key)}&season=${siguienteEp.season}&episode=${siguienteEp.episode}">
                  T${siguienteEp.season} E${siguienteEp.episode} →
                </a>
              ` : ''}
              <a class="btn btn-ghost" href="episodios.html?key=${encodeURIComponent(item.key)}&season=${season}">
                Ver episodios
              </a>
            </div>
          ` : ''}

          ${item.overview ? `<p class="reproductor-overview">${this.escapeHtml(item.overview)}</p>` : ''}

          <div class="reproductor-nota">
            ⚠️ La reproducción depende de que la URL sea válida y el servidor permita acceso. Si no reproduce, prueba abrir en VLC o revisa la URL en el panel admin.
          </div>
        </div>
      `;

      this._bindPlayer();
    } catch (err) {
      console.error(err);
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⚠️</div>
          <h2 class="empty-title">Error</h2>
          <p class="empty-text">${this.escapeHtml(err.message)}</p>
          <button class="btn btn-accent" onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }
  },

  async _bindPlayer() {
    const video = document.getElementById('main-video');
    if (!video) return;
    this._videoEl = video;

    const bigPlay = document.getElementById('big-play');
    const btnPlay = document.getElementById('btn-play');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const btnBack = document.getElementById('btn-back10');
    const btnFwd = document.getElementById('btn-fwd10');
    const btnMute = document.getElementById('btn-mute');
    const btnFs = document.getElementById('btn-fs');
    const seek = document.getElementById('seek-bar');
    const vol = document.getElementById('vol-bar');
    const timeCur = document.getElementById('time-current');
    const timeTot = document.getElementById('time-total');

    // Cargar progreso previo
    try {
      const prog = await DB.getProgress(this._progressKey);
      if (prog && prog.seconds > 3) {
        video.addEventListener('loadedmetadata', () => {
          if (prog.seconds < video.duration - 5) {
            video.currentTime = prog.seconds;
          }
        }, { once: true });
      }
    } catch(e) { console.warn('progreso:', e.message); }

    const updateIcons = () => {
      iconPlay.style.display = video.paused ? '' : 'none';
      iconPause.style.display = video.paused ? 'none' : '';
      bigPlay.style.display = video.paused ? 'flex' : 'none';
    };
    const updateSeek = () => {
      if (!seek.dataset.dragging) {
        const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
        seek.value = pct * 10;
        seek.style.background = `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,.2) ${pct}%)`;
      }
      timeCur.textContent = this.formatearTiempo(video.currentTime);
    };

    video.addEventListener('play', updateIcons);
    video.addEventListener('pause', updateIcons);
    video.addEventListener('loadedmetadata', () => {
      timeTot.textContent = this.formatearTiempo(video.duration);
      updateSeek();
    });
    video.addEventListener('timeupdate', updateSeek);
    video.addEventListener('error', () => {
      window.toast?.('No se pudo reproducir. Verifica la URL.', 'error');
    });

    const togglePlay = () => video.paused ? video.play().catch(e => window.toast?.('Error: ' + e.message, 'error')) : video.pause();
    bigPlay.addEventListener('click', togglePlay);
    btnPlay.addEventListener('click', togglePlay);
    btnBack.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
    btnFwd.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });
    btnMute.addEventListener('click', () => { video.muted = !video.muted; });
    vol.addEventListener('input', (e) => {
      video.volume = e.target.value / 100;
      video.muted = e.target.value === '0';
    });
    seek.addEventListener('pointerdown', () => { seek.dataset.dragging = '1'; });
    seek.addEventListener('input', (e) => {
      const pct = e.target.value / 10;
      if (video.duration) video.currentTime = (pct / 100) * video.duration;
      updateSeek();
    });
    seek.addEventListener('pointerup', () => { delete seek.dataset.dragging; });
    seek.addEventListener('change', () => { delete seek.dataset.dragging; });
    btnFs.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else video.requestFullscreen?.().catch(() => {});
    });

    // Guardar progreso cada 5s y al salir
    this._saveInterval = setInterval(() => {
      if (!video.paused && video.duration > 0) {
        DB.setProgress(this._progressKey, video.currentTime, video.duration).catch(() => {});
      }
    }, 5000);
    window.addEventListener('beforeunload', () => {
      if (video.duration > 0) {
        DB.setProgress(this._progressKey, video.currentTime, video.duration).catch(() => {});
      }
    });
    // Guardar al pausar
    video.addEventListener('pause', () => {
      if (video.duration > 0) {
        DB.setProgress(this._progressKey, video.currentTime, video.duration).catch(() => {});
      }
    });
  },

  destruir() {
    if (this._saveInterval) clearInterval(this._saveInterval);
    this._videoEl = null;
  }
};