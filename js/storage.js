// ─── STORAGE — Portfolio Pro ──────────────────────────────────────────────────
// Persistance 100% localStorage. Pas de serveur, pas de réseau.
// Source de vérité : STATE (en mémoire). Chaque mutation appelle Storage.save().

const STORAGE_KEY = 'portfoliopro_data';

const Storage = {

  // ─── Lecture ──────────────────────────────────────────────────────────────

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  // ─── Écriture ─────────────────────────────────────────────────────────────

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Storage.save — quota dépassé ?', e);
    }
  },

  // ─── Export JSON ──────────────────────────────────────────────────────────

  exportJSON(state) {
    const payload = {
      _exported_at: new Date().toISOString(),
      _version: 1,
      ...state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portfoliopro_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // ─── Import JSON ──────────────────────────────────────────────────────────

  importJSON(onSuccess) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          // Nettoyer les méta-champs d'export
          delete data._exported_at;
          delete data._version;
          // Valider la structure minimale
          if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Format invalide');
          onSuccess(data);
        } catch (err) {
          alert('Erreur lors de l\'import : ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  // ─── Taille occupée ───────────────────────────────────────────────────────

  sizeKB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '';
      return Math.round(raw.length / 1024 * 10) / 10;
    } catch { return 0; }
  },
};
