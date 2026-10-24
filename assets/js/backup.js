// ============================================================
// backup.js — Exportar/Importar backup desde consola
// Uso desde DevTools:
//   const { Backup } = await import('./assets/js/backup.js');
//   await Backup.exportar();                    // descarga JSON
//   await Backup.importar(file);                // restaura
//   await Backup.diagnostico();                 // info de IndexedDB
// ============================================================
import { DB } from './database.js';

export const Backup = {
  async exportar() {
    await DB.init();
    const data = await DB.exportarBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simpsoteca-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {
      items: data.items.length,
      favoritos: data.favorites.length,
      progreso: data.progress.length
    };
  },

  async importar(file) {
    if (!file) throw new Error('Sin archivo');
    await DB.init();
    const texto = await file.text();
    const data = JSON.parse(texto);
    if (!Array.isArray(data.items)) throw new Error('JSON inválido: falta items[]');
    const res = await DB.importarBackup(data);
    return res;
  },

  async diagnostico() {
    await DB.init();
    const items = await DB.getAll();
    const favs = await DB.getFavorites();
    const prog = await DB.getAllProgress();
    const hist = await DB.getImportHistory();

    let storage = null;
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) storage = { uso: (est.usage/1024/1024).toFixed(2) + ' MB', cuota: (est.quota/1024/1024).toFixed(0) + ' MB' };
    } catch(e) {}

    return {
      itemsTotal: items.length,
      peliculas: items.filter(i => i.type === 'movie').length,
      series: items.filter(i => i.type === 'tv').length,
      episodios: items.reduce((acc, i) => acc + (i.episodes?.length || 0), 0),
      favoritos: favs.length,
      conProgreso: prog.length,
      importaciones: hist.length,
      almacenamiento: storage,
      indexedDB: !!DB._db,
      protocolo: location.protocol
    };
  },

  async borrarTodo() {
    await DB.init();
    const stores = ['items', 'favorites', 'progress', 'config', 'imports'];
    for (const s of stores) {
      await new Promise((res, rej) => {
        const tx = DB._db.transaction(s, 'readwrite');
        tx.objectStore(s).clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
    return 'Todo borrado. Recarga la página.';
  }
};

// Exponer al window para uso rápido desde consola
if (typeof window !== 'undefined') {
  window.Backup = Backup;
}