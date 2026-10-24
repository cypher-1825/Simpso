// ============================================================
// tmdb.js — API key en IndexedDB, nunca en el código público
// ============================================================
import { DB } from './database.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

let _apiKey = null;
let _cache = new Map();

export const TMDB = {
  async init() {
    if (_apiKey) return _apiKey;
    _apiKey = await DB.getConfig('tmdbApiKey');
    return _apiKey;
  },

  async setApiKey(key) {
    if (!key || key.length < 20) throw new Error('API key inválida');
    await DB.setConfig('tmdbApiKey', key.trim());
    _apiKey = key.trim();
    _cache.clear();
  },

  async tieneKey() {
    await this.init();
    return !!_apiKey;
  },

  async _fetch(path, params = {}) {
    if (!_apiKey) throw new Error('TMDB API key no configurada. Ve al panel de administración.');
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set('api_key', _apiKey);
    url.searchParams.set('language', 'es-ES');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) throw new Error('API key de TMDB inválida (401)');
      if (res.status === 429) throw new Error('Límite de TMDB alcanzado. Espera un momento.');
      throw new Error(`TMDB error ${res.status}: ${res.statusText}`);
    }
    return res.json();
  },

  async buscarMulti(query) {
    if (!query?.trim()) return [];
    const cacheKey = 'search:' + query.toLowerCase();
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);
    const data = await this._fetch('/search/multi', { query, include_adult: 'false' });
    const resultados = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
    _cache.set(cacheKey, resultados);
    return resultados;
  },

  async buscarMejor(title, year, tipoEsperado) {
    const resultados = await this.buscarMulti(title);
    if (!resultados.length) return null;

    let filtrados = tipoEsperado
      ? resultados.filter(r => r.media_type === tipoEsperado)
      : resultados;
    if (!filtrados.length) filtrados = resultados;

    if (year) {
      const exact = filtrados.find(r => {
        const y = (r.release_date || r.first_air_date || '').slice(0, 4);
        return String(y) === String(year);
      });
      if (exact) return exact;
    }
    return filtrados[0];
  },

  async detalle(id, tipo) {
    const endpoint = tipo === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    return this._fetch(endpoint);
  },

  async temporada(idSerie, numTemporada) {
    return this._fetch(`/tv/${idSerie}/season/${numTemporada}`);
  },

  poster(item, size = 'w342') {
    if (item?.poster_path) return IMG_BASE + '/' + size + item.poster_path;
    return null;
  },

  backdrop(item, size = 'w1280') {
    if (item?.backdrop_path) return IMG_BASE + '/' + size + item.backdrop_path;
    if (item?.poster_path) return IMG_BASE + '/w780' + item.poster_path;
    return null;
  },

  // Enriquece un item del catálogo con datos de TMDB
  async enriquecer(item) {
    try {
      const year = null;
      const hit = await this.buscarMejor(item.title, year, item.type);
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
      console.warn('TMDB enriquecer falló:', e.message);
      return item;
    }
  }
};