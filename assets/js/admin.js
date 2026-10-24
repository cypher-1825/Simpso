// ============================================================
// admin.js — Panel de administración completo
// Configuración TMDB, importación TXT/JSON, edición, backup
// ============================================================
import { DB } from './database.js';
import { TMDB } from './tmdb.js';
import { Importador } from './importador.js';

export const Admin = {
  async init() {
    await DB.init();
    await TMDB.init();
  },

  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  toast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-20px)';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  },

  // ------------------------------------------------------------
  // RENDER PRINCIPAL
  // ------------------------------------------------------------
  async render(container) {
    container.innerHTML = `
      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="dashboard">📊 Resumen</button>
        <button class="admin-tab" data-tab="importar">📥 Importar</button>
        <button class="admin-tab" data-tab="catalogo">🎬 Catálogo</button>
        <button class="admin-tab" data-tab="config">⚙️ Configuración</button>
        <button class="admin-tab" data-tab="backup">💾 Backup</button>
      </div>
      <div id="admin-content"></div>
    `;

    container.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.renderTab(tab);
      });
    });

    this.renderTab('dashboard');
  },

  async renderTab(tab) {
    const el = document.getElementById('admin-content');
    el.innerHTML = '<div class="spinner"></div>';
    try {
      if (tab === 'dashboard') await this.renderDashboard(el);
      else if (tab === 'importar') this.renderImportar(el);
      else if (tab === 'catalogo') await this.renderCatalogo(el);
      else if (tab === 'config') await this.renderConfig(el);
      else if (tab === 'backup') await this.renderBackup(el);
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="admin-card"><p class="admin-error">${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------
  async renderDashboard(el) {
    const items = await DB.getAll();
    const count = items.length;
    const movies = items.filter(i => i.type === 'movie').length;
    const series = items.filter(i => i.type === 'tv').length;
    const episodios = items.reduce((acc, i) => acc + (i.episodes?.length || 0), 0);
    const favoritos = (await DB.getFavorites()).length;
    const historial = await DB.getImportHistory();
    const tieneTMDB = await TMDB.tieneKey();
    const dbEstado = DB._db ? 'OK' : 'No inicializada';

    // Espacio ocupado
    let bytes = 0;
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) bytes = est.usage || 0;
    } catch(e) {}

    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / (1024*1024)).toFixed(2);

    el.innerHTML = `
      <div class="admin-grid-stats">
        <div class="admin-stat">
          <div class="admin-stat-label">Total títulos</div>
          <div class="admin-stat-value">${count}</div>
        </div>
        <div class="admin-stat">
          <div class="admin-stat-label">Películas</div>
          <div class="admin-stat-value">${movies}</div>
        </div>
        <div class="admin-stat">
          <div class="admin-stat-label">Series</div>
          <div class="admin-stat-value">${series}</div>
        </div>
        <div class="admin-stat">
          <div class="admin-stat-label">Episodios</div>
          <div class="admin-stat-value">${episodios}</div>
        </div>
        <div class="admin-stat">
          <div class="admin-stat-label">Favoritos</div>
          <div class="admin-stat-value">${favoritos}</div>
        </div>
        <div class="admin-stat">
          <div class="admin-stat-label">Espacio usado</div>
          <div class="admin-stat-value" style="font-size:20px;">${mb} MB</div>
        </div>
      </div>

      <div class="admin-card">
        <h3 class="admin-card-title">Estado del sistema</h3>
        <div class="admin-status-list">
          <div class="admin-status-row">
            <span>IndexedDB</span>
            <span class="admin-status-badge ${DB._db ? 'ok' : 'bad'}">${dbEstado}</span>
          </div>
          <div class="admin-status-row">
            <span>API TMDB</span>
            <span class="admin-status-badge ${tieneTMDB ? 'ok' : 'warn'}">${tieneTMDB ? 'Configurada' : 'No configurada'}</span>
          </div>
          <div class="admin-status-row">
            <span>Entorno</span>
            <span class="admin-status-badge ${location.protocol === 'https:' ? 'ok' : 'warn'}">${location.protocol === 'https:' ? 'HTTPS' : 'HTTP'}</span>
          </div>
          <div class="admin-status-row">
            <span>Navegador</span>
            <span class="admin-status-badge ok">${navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Safari' : navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Otro'}</span>
          </div>
        </div>
      </div>

      ${historial.length > 0 ? `
        <div class="admin-card">
          <h3 class="admin-card-title">Historial de importaciones recientes</h3>
          <div class="admin-history">
            ${historial.slice(0, 8).map(h => `
              <div class="admin-history-item">
                <div>
                  <strong>${this.escapeHtml(h.archivo)}</strong>
                  <p>${new Date(h.fecha).toLocaleString('es-ES')}</p>
                </div>
                <div class="admin-history-stats">
                  <span class="ok">+${h.importados}</span>
                  ${h.duplicados ? `<span class="warn">${h.duplicados} duplicados</span>` : ''}
                  ${h.rechazados ? `<span class="bad">${h.rechazados} errores</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="admin-card admin-warning">
        <h3 class="admin-card-title">⚠️ Importante</h3>
        <p>Esta es una aplicación estática (GitHub Pages). Los datos se guardan <strong>solo en este navegador y dispositivo</strong>. No se sincronizan con tu iPhone o PC. Haz backups periódicos desde la pestaña "Backup".</p>
      </div>
    `;
  },

  // ------------------------------------------------------------
  // IMPORTAR
  // ------------------------------------------------------------
  renderImportar(el) {
    el.innerHTML = `
      <div class="admin-card">
        <h3 class="admin-card-title">📥 Importar archivo TXT</h3>
        <div class="admin-info-box">
          <p><strong>Formatos aceptados:</strong></p>
          <pre class="admin-code">Película:
Nombre: Annabelle
Url: https://servidor.pro:8080/movie.mp4
Genero: Terror

Serie:
Nombre: Welcome To Derry
Url: http://servidor.pro:8080
Genero: Terror
Temporadas: 1
Episodios: 2
Episodio 1: http://servidor.pro:8080/series/ep1.mp4
Episodio 2: http://servidor.pro:8080/series/ep2.mp4</pre>
        </div>

        <div class="admin-form-group">
          <label>Seleccionar archivo .txt</label>
          <input type="file" id="import-file" accept=".txt,text/plain" class="admin-input">
        </div>

        <p class="admin-divider">— o —</p>

        <div class="admin-form-group">
          <label>Pegar contenido manualmente</label>
          <textarea id="import-textarea" rows="8" class="admin-input admin-textarea" placeholder="Pega aquí el contenido del TXT..."></textarea>
          <button id="btn-process-text" class="admin-btn admin-btn-secondary" style="margin-top:8px;">Procesar texto pegado</button>
        </div>
      </div>

      <div id="import-preview"></div>
    `;

    const fileInput = document.getElementById('import-file');
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this.previsualizarArchivo(file);
    });

    document.getElementById('btn-process-text').addEventListener('click', async () => {
      const texto = document.getElementById('import-textarea').value;
      if (!texto.trim()) {
        this.toast('El área de texto está vacía', 'error');
        return;
      }
      await this.previsualizarTexto(texto);
    });
  },

  async previsualizarArchivo(file) {
    const previewEl = document.getElementById('import-preview');
    previewEl.innerHTML = '<div class="spinner"></div>';
    try {
      const texto = await Importador.leerArchivo(file);
      const { items, errores } = Importador.parsear(texto);
      await this.mostrarPreview(items, errores, { tipo: 'archivo', file });
    } catch (err) {
      previewEl.innerHTML = `<div class="admin-card admin-error">Error: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async previsualizarTexto(texto) {
    const previewEl = document.getElementById('import-preview');
    previewEl.innerHTML = '<div class="spinner"></div>';
    try {
      const { items, errores } = Importador.parsear(texto);
      await this.mostrarPreview(items, errores, { tipo: 'texto' });
    } catch (err) {
      previewEl.innerHTML = `<div class="admin-card admin-error">Error: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async mostrarPreview(items, errores, contexto) {
    const previewEl = document.getElementById('import-preview');
    if (!items.length) {
      previewEl.innerHTML = `
        <div class="admin-card admin-error">
          <h3 class="admin-card-title">No se detectaron registros válidos</h3>
          ${errores.length ? `
            <p>${errores.length} línea(s) con problemas:</p>
            <ul class="admin-list-errors">
              ${errores.slice(0, 20).map(e => `<li>Línea ${e.linea}: ${this.escapeHtml(e.motivo)}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      `;
      return;
    }

    // Detectar duplicados SIN guardar
    const { nuevos, duplicados } = await Importador.detectarDuplicados(items);

    previewEl.innerHTML = `
      <div class="admin-card">
        <h3 class="admin-card-title">📋 Vista previa</h3>
        <div class="admin-preview-stats">
          <div class="admin-stat small">
            <div class="admin-stat-label">Detectados</div>
            <div class="admin-stat-value">${items.length}</div>
          </div>
          <div class="admin-stat small">
            <div class="admin-stat-label">Nuevos</div>
            <div class="admin-stat-value" style="color:var(--success);">${nuevos.length}</div>
          </div>
          <div class="admin-stat small">
            <div class="admin-stat-label">Duplicados</div>
            <div class="admin-stat-value" style="color:var(--warning);">${duplicados.length}</div>
          </div>
          <div class="admin-stat small">
            <div class="admin-stat-label">Con errores</div>
            <div class="admin-stat-value" style="color:var(--danger);">${errores.length}</div>
          </div>
        </div>

        <div class="admin-preview-list">
          ${items.slice(0, 10).map(i => `
            <div class="admin-preview-row">
              <span class="admin-badge ${i.tipo === 'tv' ? 'blue' : 'orange'}">${i.tipo === 'tv' ? 'Serie' : 'Peli'}</span>
              <strong>${this.escapeHtml(i.nombre)}</strong>
              <span class="admin-preview-genre">${this.escapeHtml(i.genero)}</span>
              ${i.tipo === 'tv' ? `<span class="admin-preview-meta">${i.episodios?.length || 0} eps</span>` : ''}
            </div>
          `).join('')}
          ${items.length > 10 ? `<p class="admin-preview-more">... y ${items.length - 10} más</p>` : ''}
        </div>

        ${errores.length ? `
          <details class="admin-details">
            <summary>Ver ${errores.length} línea(s) con errores</summary>
            <ul class="admin-list-errors">
              ${errores.slice(0, 30).map(e => `<li>Línea ${e.linea}: ${this.escapeHtml(e.motivo)}</li>`).join('')}
            </ul>
          </details>
        ` : ''}

        ${nuevos.length > 0 ? `
          <div class="admin-actions">
            <button id="btn-confirmar-import" class="admin-btn admin-btn-primary">
              ✓ Confirmar importación (${nuevos.length} nuevos)
            </button>
            <button id="btn-cancelar-import" class="admin-btn admin-btn-ghost">
              Cancelar
            </button>
          </div>
        ` : `
          <p class="admin-warning-text">Todos los registros ya existen. Nada que importar.</p>
        `}
      </div>
    `;

    if (nuevos.length > 0) {
      document.getElementById('btn-confirmar-import').addEventListener('click', async () => {
        await this.ejecutarImportacion(nuevos, duplicados, errores, contexto);
      });
      document.getElementById('btn-cancelar-import').addEventListener('click', () => {
        document.getElementById('import-preview').innerHTML = '';
      });
    }
  },

  async ejecutarImportacion(nuevos, duplicados, errores, contexto) {
    const previewEl = document.getElementById('import-preview');
    previewEl.innerHTML = `
      <div class="admin-card">
        <div class="spinner"></div>
        <p style="text-align:center;">Guardando ${nuevos.length} registros en IndexedDB...</p>
      </div>
    `;

    try {
      const resultado = await Importador.guardar(nuevos);

      // Verificación REAL: releer desde IndexedDB
      const verificacion = await DB.getAll();
      const recienGuardados = verificacion.filter(x =>
        nuevos.some(n =>
          (n.tipo === 'tv' && x.title === n.nombre) ||
          (n.tipo === 'movie' && x.videoUrl === n.url)
        )
      );

      if (recienGuardados.length === 0 && resultado.guardados === 0) {
        previewEl.innerHTML = `
          <div class="admin-card admin-error">
            <h3 class="admin-card-title">❌ No se guardó nada</h3>
            <p>Los registros no aparecieron en IndexedDB tras guardar. Posibles causas:</p>
            <ul>
              <li>Modo incógnito/privado del navegador</li>
              <li>Cuota de almacenamiento llena</li>
              <li>IndexedDB bloqueada por otra pestaña</li>
            </ul>
            <button class="admin-btn admin-btn-primary" onclick="location.reload()">Reintentar</button>
          </div>
        `;
        return;
      }

      // Log histórico
      await DB.logImport({
        archivo: contexto.tipo === 'archivo' ? (contexto.file?.name || 'archivo') : 'pegado-manual',
        encontrados: nuevos.length + duplicados.length + errores.length,
        importados: resultado.guardados,
        duplicados: duplicados.length,
        rechazados: errores.length + resultado.fallidos
      });

      previewEl.innerHTML = `
        <div class="admin-card admin-success">
          <h3 class="admin-card-title">✅ Importación completada</h3>
          <div class="admin-resultado">
            <div><strong>${resultado.guardados}</strong> registros guardados</div>
            <div><strong>${recienGuardados.length}</strong> verificados en IndexedDB</div>
            ${duplicados.length ? `<div><strong>${duplicados.length}</strong> duplicados omitidos</div>` : ''}
            ${errores.length ? `<div><strong>${errores.length}</strong> líneas rechazadas</div>` : ''}
          </div>
          <div class="admin-actions">
            <button class="admin-btn admin-btn-primary" onclick="location.hash='#dashboard';location.reload();">
              Ver catálogo
            </button>
            <button class="admin-btn admin-btn-secondary" onclick="location.reload();">
              Importar otro
            </button>
          </div>
        </div>
      `;

      this.toast(`✅ ${resultado.guardados} registros importados y verificados`, 'success');
    } catch (err) {
      previewEl.innerHTML = `
        <div class="admin-card admin-error">
          <h3 class="admin-card-title">❌ Error al importar</h3>
          <p>${this.escapeHtml(err.message)}</p>
          <button class="admin-btn admin-btn-primary" onclick="location.reload()">Reintentar</button>
        </div>
      `;
    }
  },

  // ------------------------------------------------------------
  // CATÁLOGO
  // ------------------------------------------------------------
  async renderCatalogo(el) {
    const items = await DB.getAll();
    if (!items.length) {
      el.innerHTML = `
        <div class="admin-card">
          <p class="admin-warning-text">No hay títulos en el catálogo. Importa un TXT primero.</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="admin-card">
        <div class="admin-form-group">
          <input type="text" id="cat-buscar" class="admin-input" placeholder="Filtrar por título...">
        </div>
        <div id="cat-tabla"></div>
      </div>
    `;

    const renderTabla = (filtro = '') => {
      const filtrados = filtro
        ? items.filter(i => (i.title || '').toLowerCase().includes(filtro.toLowerCase()))
        : items;

      const tabla = document.getElementById('cat-tabla');
      if (!filtrados.length) {
        tabla.innerHTML = `<p class="admin-warning-text">Sin resultados.</p>`;
        return;
      }
      tabla.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Título</th>
              <th>Género</th>
              <th>Eps</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${filtrados.slice(0, 100).map(i => `
              <tr>
                <td><span class="admin-badge ${i.type === 'tv' ? 'blue' : 'orange'}">${i.type === 'tv' ? 'Serie' : 'Peli'}</span></td>
                <td>${this.escapeHtml(i.title)}</td>
                <td>${this.escapeHtml(i.genre || '-')}</td>
                <td>${i.episodes?.length || '-'}</td>
                <td>
                  <button class="admin-btn-small admin-btn-danger" data-del="${i.key}">Eliminar</button>
                  <button class="admin-btn-small admin-btn-warn" data-tmdb="${i.key}">TMDB</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${filtrados.length > 100 ? `<p class="admin-preview-more">Mostrando 100 de ${filtrados.length}</p>` : ''}
      `;

      tabla.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.del;
          if (!confirm('¿Eliminar este título?')) return;
          await DB.delete(key);
          this.toast('Eliminado', 'success');
          this.renderTab('catalogo');
        });
      });

      tabla.querySelectorAll('[data-tmdb]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.tmdb;
          const item = items.find(i => i.key === key);
          if (!item) return;
          if (!(await TMDB.tieneKey())) {
            this.toast('Configura la API key de TMDB primero', 'error');
            return;
          }
          btn.textContent = '...';
          btn.disabled = true;
          try {
            const enriched = await TMDB.enriquecer(item);
            if (enriched.tmdbId) {
              await DB.put(enriched);
              this.toast(`Datos actualizados desde TMDB`, 'success');
              this.renderTab('catalogo');
            } else {
              this.toast('No encontrado en TMDB', 'warning');
              btn.textContent = 'TMDB';
              btn.disabled = false;
            }
          } catch (e) {
            this.toast('Error TMDB: ' + e.message, 'error');
            btn.textContent = 'TMDB';
            btn.disabled = false;
          }
        });
      });
    };

    renderTabla();

    document.getElementById('cat-buscar').addEventListener('input', (e) => {
      renderTabla(e.target.value);
    });
  },

  // ------------------------------------------------------------
  // CONFIGURACIÓN
  // ------------------------------------------------------------
  async renderConfig(el) {
    const apiKeyActual = await DB.getConfig('tmdbApiKey');
    const tieneKey = !!apiKeyActual;

    el.innerHTML = `
      <div class="admin-card">
        <h3 class="admin-card-title">🎬 API de TMDB</h3>
        <p class="admin-warning-text">
          ⚠️ Cualquier API key en el navegador es visible para quien inspeccione el código.
          No compartas tu clave pública. Si publicas el proyecto, otros usuarios podrán verla.
        </p>
        <div class="admin-form-group">
          <label>API key de TMDB</label>
          <input type="password" id="tmdb-key" class="admin-input" placeholder="${tieneKey ? '•••••••••••• (configurada)' : 'Pega tu API key aquí'}" autocomplete="off">
        </div>
        <div class="admin-actions">
          <button id="btn-save-key" class="admin-btn admin-btn-primary">Guardar clave</button>
          ${tieneKey ? `<button id="btn-test-key" class="admin-btn admin-btn-secondary">Probar conexión</button>` : ''}
          ${tieneKey ? `<button id="btn-remove-key" class="admin-btn admin-btn-danger">Eliminar clave</button>` : ''}
        </div>
        <p class="admin-hint">
          Obtén tu API key gratuita en
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a>
        </p>
      </div>

      <div class="admin-card admin-warning">
        <h3 class="admin-card-title">🔒 Sobre la seguridad del panel</h3>
        <p>Este panel no tiene contraseña porque es estático. Cualquiera con acceso a la URL podría abrirlo. No lo compartas si no quieres que otros vean o modifiquen tu catálogo local. Para acceso privado real necesitarías un backend con autenticación.</p>
      </div>

      <div class="admin-card">
        <h3 class="admin-card-title">🧹 Datos del navegador</h3>
        <p>Puedes borrar todos los datos locales. Esto elimina el catálogo, favoritos y configuración de este dispositivo.</p>
        <button id="btn-clear-all" class="admin-btn admin-btn-danger">Borrar todos los datos</button>
      </div>
    `;

    document.getElementById('btn-save-key').addEventListener('click', async () => {
      const key = document.getElementById('tmdb-key').value.trim();
      if (!key) {
        this.toast('Ingresa una clave', 'error');
        return;
      }
      try {
        await TMDB.setApiKey(key);
        this.toast('Clave guardada', 'success');
        this.renderTab('config');
      } catch (err) {
        this.toast('Error: ' + err.message, 'error');
      }
    });

    if (tieneKey) {
      document.getElementById('btn-test-key').addEventListener('click', async () => {
        try {
          const res = await TMDB.buscarMulti('Inception');
          this.toast(`✓ Conexión OK. ${res.length} resultados de prueba.`, 'success');
        } catch (err) {
          this.toast('Error: ' + err.message, 'error');
        }
      });
      document.getElementById('btn-remove-key').addEventListener('click', async () => {
        if (!confirm('¿Eliminar la API key de TMDB?')) return;
        await DB.setConfig('tmdbApiKey', null);
        await TMDB.init();
        this.toast('Clave eliminada', 'success');
        this.renderTab('config');
      });
    }

    document.getElementById('btn-clear-all').addEventListener('click', async () => {
      if (!confirm('⚠️ Esto borrará TODO el catálogo, favoritos y configuración de este navegador. ¿Continuar?')) return;
      if (!confirm('🛑 Segunda confirmación. ¿Estás seguro?')) return;
      try {
        const stores = ['items', 'favorites', 'progress', 'config', 'imports'];
        for (const s of stores) {
          await new Promise((res, rej) => {
            const tx = DB._db.transaction(s, 'readwrite');
            tx.objectStore(s).clear();
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
          });
        }
        this.toast('Datos eliminados', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        this.toast('Error: ' + err.message, 'error');
      }
    });
  },

  // ------------------------------------------------------------
  // BACKUP
  // ------------------------------------------------------------
  async renderBackup(el) {
    el.innerHTML = `
      <div class="admin-card">
        <h3 class="admin-card-title">💾 Exportar copia de seguridad</h3>
        <p>Descarga un archivo JSON con todo tu catálogo, favoritos y progreso. La API key de TMDB <strong>no</strong> se incluye por seguridad.</p>
        <button id="btn-export" class="admin-btn admin-btn-primary">Descargar backup JSON</button>
      </div>

      <div class="admin-card">
        <h3 class="admin-card-title">📂 Restaurar desde backup</h3>
        <p>Sube un archivo JSON previamente exportado. Los registros se fusionan con los existentes.</p>
        <div class="admin-form-group">
          <input type="file" id="backup-file" accept=".json,application/json" class="admin-input">
        </div>
        <button id="btn-import" class="admin-btn admin-btn-secondary">Restaurar backup</button>
      </div>

      <div class="admin-card">
        <h3 class="admin-card-title">📄 Exportar catálogo a TXT</h3>
        <p>Descarga el catálogo actual como TXT en el mismo formato que acepta el importador.</p>
        <button id="btn-export-txt" class="admin-btn admin-btn-secondary">Descargar TXT</button>
      </div>
    `;

    document.getElementById('btn-export').addEventListener('click', async () => {
      const backup = await DB.exportarBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      this.descargarBlob(blob, `simpsoteca-backup-${new Date().toISOString().slice(0,10)}.json`);
      this.toast('Backup descargado', 'success');
    });

    document.getElementById('btn-import').addEventListener('click', async () => {
      const file = document.getElementById('backup-file').files[0];
      if (!file) {
        this.toast('Selecciona un archivo', 'error');
        return;
      }
      try {
        const texto = await file.text();
        const data = JSON.parse(texto);
        const res = await DB.importarBackup(data);
        this.toast(`Restaurado: ${res.items} items, ${res.favorites} favoritos`, 'success');
      } catch (err) {
        this.toast('Error: ' + err.message, 'error');
      }
    });

    document.getElementById('btn-export-txt').addEventListener('click', async () => {
      const items = await DB.getAll();
      const lineas = [];
      items.forEach(i => {
        lineas.push(`Nombre: ${i.title}`);
        lineas.push(`Url: ${i.videoUrl || ''}`);
        lineas.push(`Genero: ${i.genre || 'Otros'}`);
        if (i.type === 'tv' && i.episodes?.length) {
          const temporadas = [...new Set(i.episodes.map(e => e.season))];
          lineas.push(`Temporadas: ${temporadas.length}`);
          lineas.push(`Episodios: ${i.episodes.length}`);
          i.episodes.forEach(ep => {
            lineas.push(`Episodio ${ep.episode}: ${ep.url}`);
          });
        }
        lineas.push('');
      });
      const blob = new Blob([lineas.join('\n')], { type: 'text/plain' });
      this.descargarBlob(blob, `simpsoteca-catalogo-${new Date().toISOString().slice(0,10)}.txt`);
      this.toast('TXT exportado', 'success');
    });
  },

  descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};