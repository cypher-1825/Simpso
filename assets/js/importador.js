// ============================================================
// importador.js — Importación TXT robusta para iPadOS/Android/Desktop
// Flujo: leer → parsear → detectar duplicados → guardar → verificar
// Solo devuelve exito:true si TODOS los pasos se completan
// ============================================================
import { DB } from './database.js';

export const Importador = {
  // Lee con FileReader (compatible Safari iPad), no con File.text()
  leerArchivo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No se seleccionó archivo'));
      if (file.size === 0) return reject(new Error('El archivo está vacío'));
      if (file.size > 50 * 1024 * 1024) return reject(new Error('El archivo supera 50 MB'));

      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = String(e.target.result || '');
        const clean = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        resolve(clean);
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo: ' + (reader.error?.message || 'desconocido')));
      reader.readAsText(file, 'UTF-8');
    });
  },

  parsear(texto) {
    const lineas = texto.split('\n');
    const items = [];
    const errores = [];
    let actual = null;
    let lineaInicio = 0;

    const finalizar = (idx) => {
      if (!actual) return;
      const nombre = (actual.nombre || '').trim();
      const url = (actual.url || '').trim();

      if (!nombre) {
        errores.push({ linea: lineaInicio, motivo: 'Falta campo Nombre' });
      } else if (!url && actual.episodios.length === 0) {
        errores.push({ linea: lineaInicio, motivo: `"${nombre}" no tiene URL ni episodios` });
      } else {
        const esSerie = actual.episodios.length > 0;
        items.push({
          nombre,
          url,
          genero: (actual.genero || '').trim() || 'Otros',
          tipo: esSerie ? 'tv' : 'movie',
          temporada: esSerie ? (parseInt(actual.temporada) || 1) : null,
          episodios: esSerie ? actual.episodios.map((ep, i) => ({
            numero: ep.numero || (i + 1),
            url: ep.url.trim()
          })) : null
        });
      }
      actual = null;
    };

    lineas.forEach((linea, idx) => {
      const l = linea.trim();
      if (!l) { finalizar(idx); return; }

      const mNombre = l.match(/^Nombre\s*:\s*(.+)$/i);
      const mUrl = l.match(/^Url\s*:\s*(.+)$/i);
      const mGenero = l.match(/^G[eé]nero\s*:\s*(.+)$/i);
      const mTemporada = l.match(/^Temporadas?\s*:\s*(.+)$/i);
      const mEpisodios = l.match(/^Episodios?\s*:\s*(.+)$/i);
      const mEpUrl = l.match(/^Episodio\s*(\d+)?\s*:\s*(.+)$/i);

      if (mNombre) {
        finalizar(idx);
        actual = { nombre: mNombre[1], url: '', genero: '', temporada: 1, episodios: [] };
        lineaInicio = idx + 1;
      } else if (mUrl && actual) {
        actual.url = mUrl[1];
      } else if (mGenero && actual) {
        actual.genero = mGenero[1];
      } else if (mTemporada && actual) {
        actual.temporada = parseInt(mTemporada[1]) || 1;
      } else if (mEpisodios && actual) {
        // referencia informativa, no se usa para validar
      } else if (mEpUrl && actual) {
        const num = mEpUrl[1] ? parseInt(mEpUrl[1]) : (actual.episodios.length + 1);
        actual.episodios.push({ numero: num, url: mEpUrl[2] });
      } else if (actual && /^https?:\/\//i.test(l)) {
        // URL suelta tras datos de serie = episodio sin numerar
        actual.episodios.push({ numero: actual.episodios.length + 1, url: l });
      } else if (actual) {
        errores.push({ linea: idx + 1, motivo: `Línea no reconocida: "${l.slice(0, 50)}"` });
      }
    });
    finalizar(lineas.length);

    return { items, errores };
  },

  async detectarDuplicados(items) {
    const existentes = await DB.getAll();
    const urlsExistentes = new Set(existentes.map(x => (x.videoUrl || '').trim()).filter(Boolean));
    const nombresExistentes = new Set(existentes.map(x => (x.title || '').toLowerCase().trim()).filter(Boolean));
    const urlsEnTxt = new Set();
    const nombresEnTxt = new Set();

    const nuevos = [];
    const duplicados = [];

    for (const item of items) {
      const nombreKey = item.nombre.toLowerCase().trim();
      const urlKey = (item.url || '').trim();

      const dup = (urlKey && urlsExistentes.has(urlKey))
               || nombresExistentes.has(nombreKey)
               || (urlKey && urlsEnTxt.has(urlKey))
               || nombresEnTxt.has(nombreKey);

      if (dup) {
        duplicados.push(item);
      } else {
        if (urlKey) urlsEnTxt.add(urlKey);
        nombresEnTxt.add(nombreKey);
        nuevos.push(item);
      }
    }
    return { nuevos, duplicados };
  },

  hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return Math.abs(h).toString(36);
  },

  async guardar(items) {
    if (!items.length) return { guardados: 0, fallidos: 0, errores: [] };
    return new Promise((resolve, reject) => {
      const tx = DB._db.transaction('items', 'readwrite');
      const store = tx.objectStore('items');
      let ok = 0, fail = 0;
      const errores = [];

      items.forEach(item => {
        const key = item.tipo === 'tv'
          ? 'tv_' + this.hash(item.nombre + '_' + (item.temporada || ''))
          : 'url_' + this.hash(item.url);

        const registro = {
          key,
          title: item.nombre,
          videoUrl: item.url,
          genre: item.genero,
          type: item.tipo,
          season: item.temporada,
          episodes: item.episodios,
          addedAt: Date.now(),
          source: 'txt-import'
        };

        const req = store.put(registro);
        req.onsuccess = () => ok++;
        req.onerror = () => { fail++; errores.push({ item: item.nombre, error: req.error?.message }); };
      });

      tx.oncomplete = () => resolve({ guardados: ok, fallidos: fail, errores });
      tx.onerror = () => reject(new Error('Transacción IndexedDB falló: ' + tx.error?.message));
      tx.onabort = () => reject(new Error('Transacción IndexedDB abortada'));
    });
  },

  // Flujo completo. Solo exito:true si el guardado fue verificado.
  async ejecutar(file, { onProgress = () => {} } = {}) {
    try {
      onProgress({ etapa: 'leyendo', mensaje: 'Leyendo archivo...' });
      const texto = await this.leerArchivo(file);

      onProgress({ etapa: 'parseando', mensaje: 'Analizando contenido...' });
      const { items, errores } = this.parsear(texto);

      if (items.length === 0) {
        return { exito: false, motivo: 'No se encontraron registros válidos', errores };
      }

      onProgress({ etapa: 'duplicados', mensaje: 'Detectando duplicados...' });
      const { nuevos, duplicados } = await this.detectarDuplicados(items);

      if (nuevos.length === 0) {
        return {
          exito: false,
          motivo: 'Todos los registros ya existen en el catálogo',
          encontrados: items.length,
          duplicados: duplicados.length,
          errores
        };
      }

      onProgress({ etapa: 'guardando', mensaje: `Guardando ${nuevos.length} registros...` });
      const resultado = await this.guardar(nuevos);

      // Verificación real: releer IndexedDB
      const verificacion = await DB.getAll();
      const recienGuardados = verificacion.filter(x =>
        nuevos.some(n =>
          (n.tipo === 'tv' && x.title === n.nombre) ||
          (n.tipo === 'movie' && x.videoUrl === n.url)
        )
      );

      if (recienGuardados.length === 0) {
        return {
          exito: false,
          motivo: 'Los datos no aparecieron en IndexedDB tras guardar. Posible modo incógnito o cuota llena.'
        };
      }

      // Log histórico
      await DB.logImport({
        archivo: file.name || 'pegado-manual',
        encontrados: items.length,
        importados: resultado.guardados,
        duplicados: duplicados.length,
        rechazados: errores.length
      });

      return {
        exito: true,
        encontrados: items.length,
        importados: resultado.guardados,
        verificados: recienGuardados.length,
        duplicados: duplicados.length,
        rechazados: errores.length,
        errores,
        duplicadosLista: duplicados.map(d => d.nombre)
      };
    } catch (err) {
      return { exito: false, motivo: err.message };
    }
  },

  // Variante para el textarea de pegado manual (evita FileReader)
  async ejecutarTexto(texto) {
    try {
      const { items, errores } = this.parsear(texto);
      if (items.length === 0) {
        return { exito: false, motivo: 'No hay registros válidos en el texto', errores };
      }
      const { nuevos, duplicados } = await this.detectarDuplicados(items);
      if (nuevos.length === 0) {
        return { exito: false, motivo: 'Todos los registros ya existen', duplicados: duplicados.length, errores };
      }
      const resultado = await this.guardar(nuevos);
      const verificacion = await DB.getAll();
      const recienGuardados = verificacion.filter(x =>
        nuevos.some(n =>
          (n.tipo === 'tv' && x.title === n.nombre) ||
          (n.tipo === 'movie' && x.videoUrl === n.url)
        )
      );
      if (recienGuardados.length === 0) {
        return { exito: false, motivo: 'Los datos no se guardaron en IndexedDB' };
      }
      await DB.logImport({
        archivo: 'pegado-manual',
        encontrados: items.length,
        importados: resultado.guardados,
        duplicados: duplicados.length,
        rechazados: errores.length
      });
      return {
        exito: true,
        encontrados: items.length,
        importados: resultado.guardados,
        verificados: recienGuardados.length,
        duplicados: duplicados.length,
        rechazados: errores.length,
        errores
      };
    } catch (err) {
      return { exito: false, motivo: err.message };
    }
  }
};