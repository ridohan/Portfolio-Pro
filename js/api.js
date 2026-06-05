const CACHE_KEY         = 'portfoliopro_cache';
const CACHE_TTL_KEY     = 'portfoliopro_cache_ttl';
const CACHE_TTL_DEFAULT = 5 * 60 * 1000; // 5 minutes

const API = {
  get url()   { return localStorage.getItem('pro_appscript_url'); },
  get token() { return localStorage.getItem('pro_appscript_token'); },

  get cacheTTL() {
    const v = localStorage.getItem(CACHE_TTL_KEY);
    return v ? Number(v) : CACHE_TTL_DEFAULT;
  },
  getCacheTTLMinutes() { return Math.round(this.cacheTTL / 60000); },
  setCacheTTL(minutes) {
    localStorage.setItem(CACHE_TTL_KEY, Math.max(1, Number(minutes)) * 60000);
  },

  isConfigured() { return !!(this.url && this.token); },

  save(url, token) {
    localStorage.setItem('pro_appscript_url',   url.trim());
    localStorage.setItem('pro_appscript_token', token.trim());
  },

  // ─── CACHE ──────────────────────────────────────────────────────────────────

  _getCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > this.cacheTTL) return null;
      return data;
    } catch { return null; }
  },

  _setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  },

  clearCache() { localStorage.removeItem(CACHE_KEY); },

  cacheAge() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { timestamp } = JSON.parse(raw);
      return Math.floor((Date.now() - timestamp) / 1000);
    } catch { return null; }
  },

  // ─── REQUÊTES ───────────────────────────────────────────────────────────────

  async getData(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this._getCache();
      if (cached) return cached;
    }
    const res  = await fetch(`${this.url}?token=${encodeURIComponent(this.token)}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    this._setCache(json.data);
    return json.data;
  },

  async post(action, payload = {}) {
    const res  = await fetch(this.url, {
      method: 'POST',
      body: JSON.stringify({ action, token: this.token, ...payload }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    this.clearCache();
    return json.result;
  },

  async postSilent(action, payload = {}) {
    const res  = await fetch(this.url, {
      method: 'POST',
      body: JSON.stringify({ action, token: this.token, ...payload }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.result;
  },

  // ─── SOCIÉTÉS ──────────────────────────────────────────────────────────────
  saveSociete(data)          { return this.post('saveSociete', { data }); },
  deleteSociete(id)          { return this.post('deleteSociete', { id }); },

  // ─── SIMULATIONS IR ─────────────────────────────────────────────────────────
  saveSimulationIR(data)     { return this.post('saveSimulationIR', { data }); },
  deleteSimulationIR(id)     { return this.post('deleteSimulationIR', { id }); },

  // ─── PRÉFÉRENCES UI ─────────────────────────────────────────────────────────
  saveUiPref(key, value)     { return this.postSilent('saveUiPref', { key, value }); },
};
