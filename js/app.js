// ─── STATE ───────────────────────────────────────────────────────────────────

const STATE_DEFAULTS = {
  societes: [],
  missions: [],
  cra_entries: [],
  depenses: [],
  paiements: [],
  fiscal_configs: [],
  simulations_ir: [],
  exercices_fiscaux: [],
};

let STATE = { ...STATE_DEFAULTS };

// Persiste STATE dans localStorage après chaque mutation
function saveState() {
  Storage.save(STATE);
  autoSaveToFile();
}

// ─── AUTO-SAVE FILE SYSTEM ACCESS API ────────────────────────────────────────

let _fsHandle = null; // FileSystemFileHandle en mémoire pour la session

// IndexedDB : stocker / récupérer le handle entre sessions
const _fsDB = (() => {
  const DB_NAME = 'portfoliopro_fs', STORE = 'handles', KEY = 'autosave';
  function open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }
  return {
    async save(handle) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(handle, KEY);
        tx.oncomplete = res; tx.onerror = rej;
      });
    },
    async load() {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = e => res(e.target.result || null);
        req.onerror   = e => rej(e.target.error);
      });
    },
    async clear() {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = res; tx.onerror = rej;
      });
    },
  };
})();

// Écriture silencieuse dans le fichier
async function autoSaveToFile() {
  if (!_fsHandle) return;
  try {
    const perm = await _fsHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return; // ne pas demander de permission en arrière-plan
    const payload = { _exported_at: new Date().toISOString(), _version: 1, ...STATE };
    const writable = await _fsHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    _updateAutoSaveIndicator('ok');
  } catch (e) {
    console.warn('Auto-save échoué :', e);
    _updateAutoSaveIndicator('error');
  }
}

// Choisir le fichier de sauvegarde (appelé par l'utilisateur)
async function pickAutoSaveFile() {
  if (!window.showSaveFilePicker) {
    alert('Votre navigateur ne supporte pas cette fonctionnalité.\nUtilisez Chrome ou Edge.');
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'portfoliopro_autosave.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    _fsHandle = handle;
    await _fsDB.save(handle);
    await autoSaveToFile(); // première écriture immédiate
    _updateAutoSaveIndicator('ok');
    _refreshAutoSaveSettings();
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

// Désactiver l'auto-save
async function disableAutoSave() {
  _fsHandle = null;
  await _fsDB.clear();
  _updateAutoSaveIndicator('off');
  _refreshAutoSaveSettings();
}

// Restaurer le handle depuis IndexedDB au chargement
async function restoreAutoSaveHandle() {
  try {
    const handle = await _fsDB.load();
    if (!handle) return;
    // Vérifier si la permission est encore accordée (sans la demander)
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      _fsHandle = handle;
      _updateAutoSaveIndicator('ok');
    } else {
      // Permission expirée — on garde le handle pour pouvoir re-demander au clic
      _fsHandle = handle;
      _updateAutoSaveIndicator('pending');
    }
  } catch (e) {
    console.warn('Impossible de restaurer le handle auto-save :', e);
  }
}

// Ré-autoriser si la permission a expiré (appelé au clic utilisateur)
async function reauthorizeAutoSave() {
  if (!_fsHandle) return;
  try {
    const perm = await _fsHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      await autoSaveToFile();
      _updateAutoSaveIndicator('ok');
      _refreshAutoSaveSettings();
    }
  } catch (e) { console.error(e); }
}

// Indicateur dans la navbar
function _updateAutoSaveIndicator(status) {
  const el = document.getElementById('autosave-indicator');
  if (!el) return;
  const cfg = {
    ok:      { dot: 'bg-emerald-400', text: 'Auto-save actif', title: 'Sauvegarde automatique active' },
    pending: { dot: 'bg-amber-400 animate-pulse', text: 'Cliquer pour ré-autoriser', title: 'Permission expirée — cliquer pour réactiver' },
    error:   { dot: 'bg-red-400', text: 'Erreur auto-save', title: 'Échec de la sauvegarde automatique' },
    off:     { dot: 'hidden', text: '', title: '' },
  }[status] || { dot: 'hidden', text: '', title: '' };
  el.innerHTML = status === 'off' ? '' : `
    <button onclick="${status === 'pending' ? 'reauthorizeAutoSave()' : 'openSettings()'}"
      class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      title="${cfg.title}">
      <span class="w-1.5 h-1.5 rounded-full ${cfg.dot}"></span>
      <span>${cfg.text}</span>
    </button>`;
}

function _refreshAutoSaveSettings() {
  const el = document.getElementById('autosave-settings-block');
  if (el) el.innerHTML = _renderAutoSaveBlock();
}

function _renderAutoSaveBlock() {
  const supported = !!window.showSaveFilePicker;
  if (!supported) return `<p class="text-slate-500 text-xs">⚠️ Non supporté sur ce navigateur — utilisez Chrome ou Edge.</p>`;
  if (_fsHandle) {
    return `
      <div class="flex items-center gap-2 p-2 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
        <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
        <div class="flex-1 min-w-0">
          <p class="text-emerald-300 text-xs font-medium">Auto-save actif</p>
          <p class="text-slate-500 text-xs truncate">${_fsHandle.name}</p>
        </div>
        <button onclick="disableAutoSave()" class="text-xs text-slate-500 hover:text-red-400 transition-colors shrink-0">Désactiver</button>
      </div>`;
  }
  return `
    <button class="btn-secondary text-sm w-full" onclick="pickAutoSaveFile()">
      📁 Choisir un fichier de sauvegarde automatique
    </button>
    <p class="text-slate-500 text-xs">Choisissez un fichier .json (ex: dans Google Drive) — l'app y écrira automatiquement à chaque modification.</p>`;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

function navigate(hash) { location.hash = hash; }

window.addEventListener('hashchange', render);
window.addEventListener('load', () => { render(); restoreAutoSaveHandle(); });

// ─── RENDER ──────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');

  // Charger depuis localStorage au premier appel
  const saved = Storage.load();
  if (saved) {
    STATE = { ...STATE_DEFAULTS, ...saved };
  }

  // Migration one-shot : simulations IR stockées dans l'ancienne clé séparée
  const _legacySimuls = (() => { try { return JSON.parse(localStorage.getItem('portfoliopro_simulations_ir')) || []; } catch { return []; } })();
  if (_legacySimuls.length > 0 && (STATE.simulations_ir || []).length === 0) {
    STATE.simulations_ir = _legacySimuls;
    saveState();
    localStorage.removeItem('portfoliopro_simulations_ir');
  }

  const hash = location.hash || '#dashboard';
  const [route, id] = hash.slice(1).split('/');

  if      (route === 'dashboard')        renderDashboard(app);
  else if (route === 'ir')               renderSimulateurIR(app, id);
  else if (route === 'societes' && !id)  renderSocietes(app);
  else if (route === 'societes' &&  id)  renderSocieteDetail(app, id);
  else renderDashboard(app);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtE(n, decimals = 0) { return fmt(n, decimals) + ' €'; }
function fmtPct(n, decimals = 2) { return fmt(n, decimals) + ' %'; }

function uid() { return '_' + Math.random().toString(36).slice(2, 9); }

function errorBanner(msg) {
  return `<div class="m-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">${msg}</div>`;
}

function badge(label, color = 'slate') {
  const c = {
    blue:   'bg-blue-900/40 text-blue-300',
    green:  'bg-emerald-900/40 text-emerald-300',
    orange: 'bg-orange-900/40 text-orange-300',
    red:    'bg-red-900/40 text-red-300',
    slate:  'bg-slate-700 text-slate-300',
    purple: 'bg-purple-900/40 text-purple-300',
  }[color] || 'bg-slate-700 text-slate-300';
  return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${c}">${label}</span>`;
}

// ─── NAV ─────────────────────────────────────────────────────────────────────

function navBar(activeRoute) {
  const links = [
    { hash: '#dashboard', label: 'Dashboard',  icon: '⊞' },
    { hash: '#ir',        label: 'Simulateur IR', icon: '📊' },
    { hash: '#societes',  label: 'Sociétés',    icon: '🏢' },
  ];
  const items = links.map(l => {
    const active = activeRoute === l.hash.slice(1).split('/')[0];
    return `<a href="${l.hash}" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}">${l.icon} ${l.label}</a>`;
  }).join('');

  return `
  <nav class="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 py-2">
    <div class="page-container flex items-center gap-2">
      <span class="text-white font-bold mr-4 text-sm">Portfolio Pro</span>
      ${items}
      <div class="ml-auto flex gap-2">
        <span id="autosave-indicator"></span>
        <button onclick="openSettings()" class="btn-secondary text-xs px-2 py-1">⚙ Paramètres</button>
      </div>
    </div>
  </nav>`;
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

function openSettings() {
  const size = Storage.sizeKB();
  document.body.insertAdjacentHTML('beforeend', `
  <div id="settings-modal" class="modal-backdrop" onclick="if(event.target===this)closeSettings()">
    <div class="modal-box">
      <h3 class="text-base font-semibold text-white mb-4">Paramètres</h3>
      <div class="space-y-3">
        <p class="text-slate-400 text-sm">Données stockées localement dans votre navigateur.</p>
        <p class="text-slate-500 text-xs">Taille actuelle : <span class="text-slate-300">${size} Ko</span></p>
        <hr class="border-slate-700" />
        <div class="flex flex-col gap-2">
          <button class="btn-secondary text-sm" onclick="exportData()">⬇ Exporter backup JSON</button>
          <button class="btn-secondary text-sm" onclick="importData()">⬆ Importer backup JSON</button>
        </div>
        <hr class="border-slate-700" />
        <div>
          <p class="text-slate-400 text-xs font-medium mb-2">💾 Sauvegarde automatique</p>
          <div id="autosave-settings-block" class="flex flex-col gap-2">${_renderAutoSaveBlock()}</div>
        </div>
        <hr class="border-slate-700" />
        <button class="btn-danger text-sm w-full" onclick="resetData()">🗑 Réinitialiser toutes les données</button>
      </div>
      <div class="flex justify-end mt-5">
        <button class="btn-secondary" onclick="closeSettings()">Fermer</button>
      </div>
    </div>
  </div>`);
}

function closeSettings() { document.getElementById('settings-modal')?.remove(); }

function exportData() {
  Storage.exportJSON(STATE);
}

function importData() {
  Storage.importJSON((data) => {
    if (!confirm('Remplacer toutes les données actuelles par celles du fichier ?')) return;
    STATE = { ...STATE_DEFAULTS, ...data };
    saveState();
    closeSettings();
    render();
  });
}

function resetData() {
  if (!confirm('Supprimer définitivement toutes les données ? Cette action est irréversible.')) return;
  STATE = { ...STATE_DEFAULTS };
  saveState();
  closeSettings();
  render();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function renderDashboard(app) {
  const societes = STATE.societes || [];
  const simuls   = STATE.simulations_ir || [];
  const annee    = new Date().getFullYear();
  const now      = new Date();
  const moisCur  = now.getMonth() + 1;

  // ── Calcul agrégé par société ──────────────────────────────────────────────
  const socData = societes.map(s => {
    const totDepsHT   = calcDepensesAnnee(s.id, annee).totalHT;
    const caFin       = calcEncaissementsAnnee(s.id, annee).caHT;
    const caCour      = calcAssietteCourante(s.id);
    const caInter     = calcAssietteIntermediaire(s.id);
    const resultatFin = Math.max(0, caFin    - totDepsHT);
    const resultatCour= Math.max(0, caCour   - totDepsHT);

    // CA du mois courant
    const encMois     = calcEncaissementsMois(s.id, annee, moisCur);

    // Rémunérations
    const salDeps     = getDepenses(s.id).filter(d => d.categorie === 'salaire');
    const netAnnuel   = salDeps.reduce((sum, dep) => {
      let t = 0; for (let m = 1; m <= 12; m++) t += calcSalaireNetMois(dep, annee, m); return sum + t;
    }, 0);

    // Fiscalité estimée + net final (selon régime)
    let fiscEstim = null, netFinal = null;
    if (s.regime_fiscal === 'is' && resultatFin > 0) {
      const cfg  = getISConfig(s.id);
      const is   = calcIS(resultatFin, cfg);
      fiscEstim  = is.isTotal;
      netFinal   = resultatFin - is.isTotal;
    } else if (s.regime_fiscal === 'ir' && resultatFin > 0) {
      const cfg  = getBilanIRConfig(s.id);
      const scen = calcScenariosIR(resultatFin, cfg);
      const s97  = scen[1]; // scénario 9,7% CSG
      fiscEstim  = s97.ir.impotFinal + s97.csgMontant;
      netFinal   = s97.netImpot;
    }

    const missions = getMissionsActives(s.id);
    return { s, caFin, caCour, caInter, resultatFin, resultatCour, encMois, netAnnuel, fiscEstim, netFinal, totDepsHT, missions };
  });

  // ── KPIs globaux ─────────────────────────────────────────────────────────
  const totalCAFin    = socData.reduce((sum, d) => sum + d.caFin,      0);
  const totalCACour   = socData.reduce((sum, d) => sum + d.caCour,     0);
  const totalDeps     = socData.reduce((sum, d) => sum + d.totDepsHT,  0);
  const totalFisc     = socData.reduce((sum, d) => sum + (d.fiscEstim || 0), 0);

  // Nets IR et IS séparés
  const socsIR     = socData.filter(d => d.s.regime_fiscal === 'ir' && d.netFinal !== null);
  const socsIS     = socData.filter(d => d.s.regime_fiscal === 'is' && d.netFinal !== null);
  const totalNetIR = socsIR.reduce((sum, d) => sum + d.netFinal, 0);
  const totalNetIS = socsIS.reduce((sum, d) => sum + d.netFinal, 0);
  const hasIR      = socsIR.length > 0;
  const hasIS      = socsIS.length > 0;

  const pctEncaisse = totalCAFin > 0 ? Math.round(totalCACour / totalCAFin * 100) : 0;

  const kpiBar = (label, val, sub, color = 'text-white', border = 'border-slate-700', extra = '') => `
    <div class="bg-slate-800 rounded-xl border ${border} p-4 ${extra}">
      <div class="text-slate-500 text-xs mb-1">${label}</div>
      <div class="${color} font-bold text-2xl">${fmtE(val)}</div>
      <div class="text-slate-600 text-xs mt-1">${sub}</div>
    </div>`;

  // Cartes net IR et net IS
  const netIRCard = hasIR ? kpiBar(
    '💰 Net d\'impôt IR',
    totalNetIR,
    `${socsIR.length} sté IR · scén. 9,7% CSG · assiette fin d'année`,
    totalNetIR >= 0 ? 'text-emerald-400' : 'text-red-400',
    'border-emerald-700/50',
    'bg-emerald-950/10'
  ) : '';

  const netISCard = hasIS ? kpiBar(
    '🏢 Résultat net après IS',
    totalNetIS,
    `${socsIS.length} sté IS · résultat fiscal − IS`,
    totalNetIS >= 0 ? 'text-emerald-400' : 'text-red-400',
    'border-blue-700/40',
    'bg-blue-950/10'
  ) : '';

  // Nombre de colonnes dynamique selon les cartes actives
  const netCards   = [netIRCard, netISCard].filter(Boolean).join('');
  const nbNetCards = (hasIR ? 1 : 0) + (hasIS ? 1 : 0);
  const gridCols   = 2 + nbNetCards; // 2 fixes + 1 ou 2 cartes net

  const globalKpis = societes.length === 0 ? '' : `
  <div class="grid grid-cols-2 lg:grid-cols-${gridCols} gap-3 mb-6">
    ${kpiBar('CA prévisionnel ' + annee, totalCAFin, 'toutes sociétés confondues', 'text-white')}
    ${kpiBar('CA encaissé ✅', totalCACour, `${pctEncaisse}% du prévisionnel`, 'text-emerald-400', 'border-emerald-800/40')}
    ${netCards}
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-6">
    ${kpiBar('Dépenses totales', totalDeps, 'charges toutes sociétés', 'text-red-300', 'border-red-900/30')}
    ${kpiBar('Fiscalité estimée', totalFisc, 'IS + IR scénario 9,7% CSG', 'text-amber-400', 'border-amber-900/30')}
  </div>`;

  // ── Carte par société ──────────────────────────────────────────────────────
  const socCards = societes.length === 0
    ? `<div class="col-span-full text-center py-12 text-slate-500">
        <p class="text-lg mb-2">Aucune société configurée</p>
        <a href="#societes" class="btn-primary text-sm">Ajouter une société</a>
       </div>`
    : socData.map(({ s, caFin, caCour, resultatFin, resultatCour, encMois, netAnnuel, fiscEstim, netFinal, totDepsHT, missions }) => {
        const forme  = { ei: 'EI', eurl: 'EURL', sarl: 'SARL', sas: 'SAS', sasu: 'SASU', snc: 'SNC', sci: 'SCI' }[s.forme] || s.forme;
        const reg    = s.regime_fiscal === 'ir' ? badge('IR', 'orange') : badge('IS', 'blue');
        const pct    = caFin > 0 ? Math.round(caCour / caFin * 100) : 0;
        const barW   = Math.min(100, pct);

        // Ligne missions actives
        const missionsList = missions.length > 0
          ? missions.map(m => `<span class="inline-flex items-center gap-1 text-xs bg-slate-700/60 rounded px-1.5 py-0.5 text-slate-400">${m.client} <span class="text-slate-600">${fmtE(m.tjm)}/j</span></span>`).join(' ')
          : `<span class="text-slate-700 text-xs italic">Aucune mission active</span>`;

        const fiscLine = fiscEstim !== null ? `
          <div class="flex justify-between items-center text-xs">
            <span class="text-slate-500">Fiscalité estimée (${s.regime_fiscal === 'is' ? 'IS' : 'IR ~9,7% CSG'})</span>
            <span class="text-amber-400 font-medium">− ${fmtE(fiscEstim)}</span>
          </div>` : '';

        const netFinalLine = netFinal !== null ? `
          <div class="flex justify-between items-center text-sm border-t border-slate-600 pt-2 mt-1">
            <span class="text-slate-300 font-semibold">${s.regime_fiscal === 'is' ? 'Résultat net après IS' : 'Net d\'impôt (scén. 9,7%)'}</span>
            <span class="${netFinal >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold text-base">${fmtE(netFinal)}</span>
          </div>` : '';

        const netSalLine = netAnnuel > 0 ? `
          <div class="flex justify-between items-center text-xs">
            <span class="text-slate-500">Net perçu (rémunérations)</span>
            <span class="text-emerald-400 font-medium">${fmtE(netAnnuel)}</span>
          </div>` : '';

        const encMoisLine = encMois.totalHT > 0 ? `
          <div class="flex justify-between items-center text-xs border-t border-slate-700/50 pt-2 mt-2">
            <span class="text-slate-500">CA encaissé ce mois</span>
            <span class="text-slate-300 font-medium">${fmtE(encMois.totalHT)}</span>
          </div>` : '';

        return `
        <a href="#societes/${s.id}" class="block bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors overflow-hidden">
          <!-- Header -->
          <div class="px-4 pt-4 pb-3 flex items-start justify-between">
            <div>
              <div class="font-semibold text-white text-base">${s.nom}</div>
              <div class="text-slate-500 text-xs mt-0.5">${forme} · ${missions.length} mission${missions.length > 1 ? 's' : ''} active${missions.length > 1 ? 's' : ''}</div>
            </div>
            ${reg}
          </div>

          <!-- Barre de progression CA -->
          <div class="px-4 pb-3">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-500">CA encaissé <span class="text-emerald-400 font-medium">${fmtE(caCour)}</span></span>
              <span class="text-slate-600">/ prév. <span class="text-slate-400">${fmtE(caFin)}</span> · <span class="${pct >= 75 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-slate-500'}">${pct}%</span></span>
            </div>
            <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full ${pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-500'} transition-all" style="width:${barW}%"></div>
            </div>
          </div>

          <!-- Métriques -->
          <div class="px-4 pb-3 space-y-1.5 border-t border-slate-700/50 pt-3">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500">Résultat avant impôt (fin d'année)</span>
              <span class="${resultatFin > 0 ? 'text-white' : 'text-red-400'} font-semibold">${fmtE(resultatFin)}</span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500">Dépenses</span>
              <span class="text-red-300">${fmtE(totDepsHT)}</span>
            </div>
            ${fiscLine}
            ${netFinalLine}
            ${netSalLine}
            ${encMoisLine}
          </div>

          <!-- Missions -->
          <div class="px-4 pb-4 pt-1 border-t border-slate-700/40 flex flex-wrap gap-1">
            ${missionsList}
          </div>
        </a>`;
      }).join('');

  // ── Récap mensuel (revenus mois par mois toutes sociétés) ─────────────────
  const moisLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const mensuelRows = societes.length > 0 ? societes.map(s => {
    const cells = moisLabels.map((lbl, i) => {
      const m   = i + 1;
      const enc = calcEncaissementsMois(s.id, annee, m);
      const cur = m === moisCur;
      const cls = cur ? 'bg-blue-950/30 font-semibold' : '';
      const col = enc.totalRecuHT > 0 ? 'text-emerald-400' : enc.totalHT > 0 ? 'text-slate-400' : 'text-slate-800';
      return `<td class="px-2 py-2 text-center text-xs border-r border-slate-700 ${cls}"><span class="${col}">${enc.totalHT > 0 ? fmtE(enc.totalHT) : '—'}</span></td>`;
    }).join('');
    const totAnnuel = calcEncaissementsAnnee(s.id, annee).caHT;
    return `<tr class="border-b border-slate-700/30">
      <td class="px-3 py-2 text-xs text-slate-300 sticky left-0 bg-slate-800 border-r border-slate-700 min-w-[140px]">${s.nom}</td>
      ${cells}
      <td class="px-3 py-2 text-center text-xs font-bold text-white bg-slate-700/50 border-r border-slate-600">${fmtE(totAnnuel)}</td>
    </tr>`;
  }).join('') : '';

  const mensuelTable = societes.length > 0 ? `
  <div class="mb-6">
    <h2 class="text-base font-semibold text-white mb-3">📅 CA mensuel ${annee} — toutes sociétés</h2>
    <div class="overflow-x-auto rounded-xl border border-slate-600">
      <table class="w-full text-sm border-collapse" style="min-width:${140 + 12*90 + 100}px">
        <thead>
          <tr class="border-b-2 border-slate-500">
            <th class="px-3 py-2 text-left text-xs text-slate-400 bg-slate-700 sticky left-0 border-r border-slate-600">Société</th>
            ${moisLabels.map((l, i) => `<th class="px-2 py-2 text-center text-xs font-semibold border-r border-slate-700 ${i + 1 === moisCur ? 'bg-blue-900/40 text-blue-200' : 'bg-slate-700 text-slate-300'}">${l}</th>`).join('')}
            <th class="px-3 py-2 text-center text-xs font-bold bg-slate-600 text-white border-r border-slate-500">Total</th>
          </tr>
        </thead>
        <tbody>${mensuelRows}</tbody>
      </table>
    </div>
    <p class="text-slate-700 text-xs mt-1.5">Vert = encaissé ✅ · gris = prévu · — = pas de CA ce mois</p>
  </div>` : '';

  // ── Dernières simulations IR ───────────────────────────────────────────────
  const lastSimHtml = simuls.length > 0 ? `
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-white">Dernières simulations IR</h3>
      <a href="#ir" class="btn-secondary text-xs">Nouvelle</a>
    </div>
    <div class="space-y-1">
      ${simuls.slice(-5).reverse().map(s => `
        <a href="#ir/${s.id}" class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-700/50 transition-colors">
          <span class="text-sm text-slate-300">${s.nom || 'Simulation sans titre'}</span>
          <div class="flex items-center gap-3">
            <span class="text-emerald-400 text-xs font-medium">${fmtE(s.summary?.impotFinal || 0)}</span>
            <span class="text-slate-600 text-xs">${s.summary?.annee || ''}</span>
          </div>
        </a>`).join('')}
    </div>
  </div>` : '';

  app.innerHTML = `
  ${navBar('dashboard')}
  <div class="page-container px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-bold text-white">Dashboard</h1>
        <p class="text-slate-500 text-sm mt-0.5">Année ${annee} · ${societes.length} société${societes.length > 1 ? 's' : ''}</p>
      </div>
      <a href="#societes" class="btn-primary text-sm">+ Société</a>
    </div>

    ${globalKpis}
    ${mensuelTable}

    <h2 class="text-base font-semibold text-white mb-3">🏢 Mes sociétés</h2>
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
      ${socCards}
    </div>

    ${lastSimHtml}
  </div>`;
}

// ─── SOCIÉTÉS ────────────────────────────────────────────────────────────────

function renderSocietes(app) {
  const societes = STATE.societes || [];

  const rows = societes.length === 0
    ? `<div class="text-center py-12 text-slate-500">Aucune société. Cliquez sur "+ Ajouter".</div>`
    : `<div class="space-y-3">${societes.map(s => {
        const forme = { ei: 'EI', eurl: 'EURL', sarl: 'SARL', sas: 'SAS', sasu: 'SASU', snc: 'SNC', sci: 'SCI' }[s.forme] || s.forme;
        return `
        <div onclick="navigate('#societes/${s.id}')"
          class="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center justify-between cursor-pointer hover:bg-slate-750 hover:border-slate-600 transition-colors">
          <div>
            <span class="font-semibold text-white">${s.nom}</span>
            <span class="ml-2 text-slate-500 text-sm">${forme}</span>
            <span class="ml-2">${s.regime_fiscal === 'ir' ? badge('IR', 'orange') : badge('IS', 'blue')}</span>
            ${s.capital ? `<span class="ml-2 text-slate-400 text-xs">Capital ${fmtE(s.capital)}</span>` : ''}
          </div>
          <div class="flex gap-2" onclick="event.stopPropagation()">
            <button onclick="openSocieteModal('${s.id}')" class="btn-secondary text-xs">Modifier</button>
            <button onclick="deleteSociete('${s.id}')" class="btn-danger text-xs">Suppr.</button>
          </div>
        </div>`;
      }).join('')}</div>`;

  app.innerHTML = `
  ${navBar('societes')}
  <div class="page-container px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">Mes sociétés</h1>
      <button onclick="openSocieteModal()" class="btn-primary text-sm">+ Ajouter</button>
    </div>
    ${rows}
  </div>`;
}

// (renderSocieteDetail déplacé plus bas avec les fonctions CRA)

function openSocieteModal(id) {
  const soc = id ? (STATE.societes || []).find(s => s.id === id) : null;
  const v = soc || { id: uid(), nom: '', forme: 'sas', regime_fiscal: 'is', capital: '', date_creation: '', note: '' };

  document.body.insertAdjacentHTML('beforeend', `
  <div id="soc-modal" class="modal-backdrop" onclick="if(event.target===this)closeSocieteModal()">
    <div class="modal-box">
      <h3 class="text-base font-semibold text-white mb-4">${soc ? 'Modifier' : 'Ajouter'} une société</h3>
      <div class="space-y-3">
        <div>
          <label class="label">Raison sociale *</label>
          <input id="sm-nom" class="input" value="${v.nom}" placeholder="Ma Société SAS" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Forme juridique</label>
            <select id="sm-forme" class="input">
              ${['ei','eurl','sarl','sas','sasu','snc','sci'].map(f =>
                `<option value="${f}" ${v.forme===f?'selected':''}>${f.toUpperCase()}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="label">Régime fiscal</label>
            <select id="sm-regime" class="input">
              <option value="is" ${v.regime_fiscal==='is'?'selected':''}>IS</option>
              <option value="ir" ${v.regime_fiscal==='ir'?'selected':''}>IR</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Capital (€)</label>
            <input id="sm-capital" class="input" type="number" value="${v.capital || ''}" placeholder="10000" />
          </div>
          <div>
            <label class="label">Date création</label>
            <input id="sm-date" class="input" type="date" value="${v.date_creation || ''}" />
          </div>
        </div>
        <div>
          <label class="label">Note</label>
          <textarea id="sm-note" class="input" rows="2" placeholder="Informations complémentaires…">${v.note || ''}</textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-5">
        <button class="btn-primary flex-1" onclick="saveSociete('${v.id}')">Enregistrer</button>
        <button class="btn-secondary" onclick="closeSocieteModal()">Annuler</button>
      </div>
    </div>
  </div>`);
}

function closeSocieteModal() { document.getElementById('soc-modal')?.remove(); }

function saveSociete(id) {
  const data = {
    id,
    nom:            document.getElementById('sm-nom').value.trim(),
    forme:          document.getElementById('sm-forme').value,
    regime_fiscal:  document.getElementById('sm-regime').value,
    capital:        parseFloat(document.getElementById('sm-capital').value) || null,
    date_creation:  document.getElementById('sm-date').value || null,
    note:           document.getElementById('sm-note').value.trim() || null,
  };
  if (!data.nom) return alert('Le nom est obligatoire.');

  if (!STATE.societes) STATE.societes = [];
  const idx = STATE.societes.findIndex(s => s.id === id);
  if (idx !== -1) STATE.societes[idx] = data;
  else STATE.societes.push(data);

  saveState();
  closeSocieteModal();
  renderSocietes(document.getElementById('app'));
}

function deleteSociete(id) {
  if (!confirm('Supprimer cette société ?')) return;
  STATE.societes = (STATE.societes || []).filter(s => s.id !== id);
  saveState();
  renderSocietes(document.getElementById('app'));
}

// ─── CRA — CALCULS ───────────────────────────────────────────────────────────

function getJoursFeriesFR(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const moisP = Math.floor((h + l - 7*m + 114) / 31);
  const jourP = ((h + l - 7*m + 114) % 31) + 1;
  const paques = new Date(annee, moisP - 1, jourP);
  const j = (n) => new Date(paques.getTime() + n * 86400000);
  return [
    new Date(annee, 0,  1),   // 1er janvier
    j(1),                     // Lundi de Pâques
    new Date(annee, 4,  1),   // 1er mai
    new Date(annee, 4,  8),   // 8 mai
    j(39),                    // Ascension
    j(50),                    // Lundi de Pentecôte
    new Date(annee, 6,  14),  // 14 juillet
    new Date(annee, 7,  15),  // 15 août
    new Date(annee, 10, 1),   // 1er novembre
    new Date(annee, 10, 11),  // 11 novembre
    new Date(annee, 11, 25),  // 25 décembre
  ];
}

function calcJoursOuvres(annee, mois) {
  let count = 0;
  const date = new Date(annee, mois - 1, 1);
  while (date.getMonth() === mois - 1) {
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) count++;
    date.setDate(date.getDate() + 1);
  }
  const feries = getJoursFeriesFR(annee);
  for (const f of feries) {
    if (f.getMonth() === mois - 1 && f.getDay() >= 1 && f.getDay() <= 5) count--;
  }
  return count;
}

function getMissionsActives(societeId) {
  return (STATE.missions || []).filter(m => m.societe_id === societeId && m.actif !== false);
}

function getCRAEntry(missionId, annee, mois) {
  return (STATE.cra_entries || []).find(
    e => e.mission_id === missionId && e.annee == annee && e.mois == mois
  ) || { jours_absence: 0, jours_dispo_override: null };
}

function calcCRACell(mission, annee, mois) {
  const entry    = getCRAEntry(mission.id, annee, mois);
  const jousDispo = entry.jours_dispo_override ?? calcJoursOuvres(annee, mois);
  const jFact    = Math.max(0, jousDispo - (entry.jours_absence || 0));
  const caHT     = jFact * mission.tjm;
  const caTTC    = mission.tva ? Math.round(caHT * 1.20) : caHT;
  return { jFact, jousDispo, joursAbsence: entry.jours_absence || 0,
           joursOverride: entry.jours_dispo_override, caHT, caTTC };
}

function calcCRATotauxMois(societeId, annee, mois) {
  return getMissionsActives(societeId).reduce((acc, m) => {
    // ignorer les mois hors de la période de la mission
    const debut = m.date_debut ? new Date(m.date_debut) : null;
    const fin   = m.date_fin   ? new Date(m.date_fin)   : null;
    const moisDate = new Date(annee, mois - 1, 28);
    if (debut && moisDate < new Date(debut.getFullYear(), debut.getMonth(), 1)) return acc;
    if (fin   && moisDate > new Date(fin.getFullYear(),   fin.getMonth() + 1, 0)) return acc;
    const c = calcCRACell(m, annee, mois);
    acc.jours += c.jFact; acc.caHT += c.caHT; acc.caTTC += c.caTTC;
    return acc;
  }, { jours: 0, caHT: 0, caTTC: 0 });
}

function calcCRATotauxMission(mission, annee) {
  let caHT = 0, caTTC = 0, jours = 0;
  for (let mois = 1; mois <= 12; mois++) {
    if (isMoisHorsMission(mission, annee, mois)) continue;
    const c = calcCRACell(mission, annee, mois);
    caHT += c.caHT; caTTC += c.caTTC; jours += c.jFact;
  }
  return { caHT, caTTC, jours };
}

// Vérifie si un mois/année est hors de la période de la mission
function isMoisHorsMission(mission, annee, mois) {
  if (mission.date_debut) {
    const d = new Date(mission.date_debut);
    if (new Date(annee, mois - 1, 28) < new Date(d.getFullYear(), d.getMonth(), 1)) return true;
  }
  if (mission.date_fin) {
    const f = new Date(mission.date_fin);
    if (new Date(annee, mois - 1, 1) > new Date(f.getFullYear(), f.getMonth(), 28)) return true;
  }
  return false;
}

// ─── CRA — ÉTAT LOCAL ─────────────────────────────────────────────────────────

let _socTab    = 'bilan';
let _craAnnee  = new Date().getFullYear();

function switchSocTab(tab, socId) {
  _socTab = tab;
  renderSocieteDetail(document.getElementById('app'), socId);
}

function setCRAYear(delta, socId) {
  _craAnnee += delta;
  renderSocieteDetail(document.getElementById('app'), socId);
}

// ─── SOCIETE DETAIL — REFACTORISÉ AVEC ONGLETS ───────────────────────────────

function renderSocieteDetail(app, id) {
  const soc = (STATE.societes || []).find(s => s.id === id);
  if (!soc) return app.innerHTML = navBar('societes') + errorBanner('Société introuvable.');

  const tabs = [
    { key: 'bilan',    label: 'Bilan comptable' },
    { key: 'missions', label: `Missions (${getMissionsActives(id).length})` },
    { key: 'cra',      label: 'CRA Prévisionnel' },
    { key: 'fiche',    label: 'Fiche' },
  ];
  const tabsHtml = tabs.map(t => `
    <button onclick="switchSocTab('${t.key}','${id}')"
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors ${_socTab === t.key
        ? 'border-blue-500 text-white'
        : 'border-transparent text-slate-400 hover:text-white'}">
      ${t.label}
    </button>`).join('');

  let content = '';
  if      (_socTab === 'fiche')    content = renderSocFiche(soc);
  else if (_socTab === 'missions') content = renderSocMissions(soc);
  else if (_socTab === 'cra')      content = renderSocCRA(soc);
  else if (_socTab === 'bilan')    content = renderSocBilan(soc);

  app.innerHTML = `
  ${navBar('societes')}
  <div class="page-container px-4 py-6">
    <div class="flex items-center gap-3 mb-4">
      <a href="#societes" class="text-slate-400 hover:text-white text-sm">← Sociétés</a>
      <h1 class="text-xl font-bold text-white">${soc.nom}</h1>
      ${soc.regime_fiscal === 'ir' ? badge('IR', 'orange') : badge('IS', 'blue')}
    </div>
    <div class="flex border-b border-slate-700 mb-6">${tabsHtml}</div>
    <div id="soc-content">${content}</div>
  </div>`;
}

function renderSocFiche(soc) {
  return `
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
      <h3 class="font-semibold text-white">Informations</h3>
      <div class="flex justify-between text-sm"><span class="text-slate-400">Forme juridique</span><span class="text-white">${soc.forme?.toUpperCase()}</span></div>
      <div class="flex justify-between text-sm"><span class="text-slate-400">Régime fiscal</span><span class="text-white">${soc.regime_fiscal?.toUpperCase()}</span></div>
      ${soc.capital ? `<div class="flex justify-between text-sm"><span class="text-slate-400">Capital</span><span class="text-white">${fmtE(soc.capital)}</span></div>` : ''}
      ${soc.date_creation ? `<div class="flex justify-between text-sm"><span class="text-slate-400">Création</span><span class="text-white">${soc.date_creation}</span></div>` : ''}
      ${soc.note ? `<div class="text-sm text-slate-400 pt-2 border-t border-slate-700">${soc.note}</div>` : ''}
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2">
      <h3 class="font-semibold text-white mb-3">Actions</h3>
      <button onclick="openSocieteModal('${soc.id}')" class="btn-secondary w-full text-sm">Modifier la société</button>
      ${soc.regime_fiscal === 'ir' ? `<a href="#ir" class="btn-primary block text-center w-full text-sm">Simuler IR</a>` : ''}
    </div>
  </div>`;
}

function renderSocMissions(soc) {
  const missions = getMissionsActives(soc.id);
  const archived = (STATE.missions || []).filter(m => m.societe_id === soc.id && m.actif === false);

  const cardsHtml = missions.length === 0
    ? `<p class="text-slate-500 text-sm text-center py-8">Aucune mission active. Ajoutez votre première mission.</p>`
    : missions.map(m => {
        const fin = m.date_fin ? ` → ${m.date_fin}` : ' → en cours';
        return `
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-white">${m.client}</span>
              ${!m.tva ? badge('sans TVA', 'slate') : ''}
            </div>
            <p class="text-slate-400 text-sm">TJM ${fmtE(m.tjm)}/j · Délai ${m.delai_paiement || 30} j</p>
            <p class="text-slate-500 text-xs mt-0.5">${m.date_debut}${fin}</p>
            ${m.note ? `<p class="text-slate-500 text-xs mt-1 italic">${m.note}</p>` : ''}
          </div>
          <div class="flex gap-2 shrink-0">
            <button onclick="openMissionModal('${soc.id}','${m.id}')" class="btn-secondary text-xs px-2 py-1">Modifier</button>
            <button onclick="archiveMission('${m.id}','${soc.id}')" class="btn-danger text-xs px-2 py-1">Archiver</button>
            <button onclick="deleteMission('${m.id}','${soc.id}')" class="text-xs px-2 py-1 rounded-lg bg-transparent text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors" title="Supprimer définitivement">🗑</button>
          </div>
        </div>`;
      }).join('');

  const archivedHtml = archived.length > 0 ? `
    <details class="mt-4">
      <summary class="text-slate-500 text-xs cursor-pointer hover:text-slate-300 list-none">
        ▾ ${archived.length} mission${archived.length > 1 ? 's' : ''} archivée${archived.length > 1 ? 's' : ''}
      </summary>
      <div class="space-y-2 mt-2 opacity-50">
        ${archived.map(m => `
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-3 flex items-center justify-between">
          <div>
            <span class="text-slate-300 text-sm">${m.client}</span>
            <span class="text-slate-500 text-xs ml-2">TJM ${fmtE(m.tjm)}/j</span>
          </div>
          <div class="flex gap-2">
            <button onclick="unarchiveMission('${m.id}','${soc.id}')" class="btn-secondary text-xs px-2 py-1">Restaurer</button>
            <button onclick="deleteMission('${m.id}','${soc.id}')" class="text-xs px-2 py-1 rounded-lg bg-transparent text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors" title="Supprimer définitivement">🗑</button>
          </div>
        </div>`).join('')}
      </div>
    </details>` : '';

  return `
  <div class="flex justify-between items-center mb-4">
    <h2 class="font-semibold text-white">Missions actives</h2>
    <button onclick="openMissionModal('${soc.id}',null)" class="btn-primary text-sm">+ Nouvelle mission</button>
  </div>
  <div class="space-y-3">${cardsHtml}</div>
  ${archivedHtml}`;
}

function renderSocCRA(soc) {
  const missions      = getMissionsActives(soc.id);
  const annee         = _craAnnee;
  const moisLabels    = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const now           = new Date();
  const moisCourant   = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();

  if (missions.length === 0) return `
    <div class="text-center py-12 text-slate-500">
      <p class="mb-3">Aucune mission active.</p>
      <button onclick="switchSocTab('missions','${soc.id}')" class="btn-secondary text-sm">Ajouter une mission</button>
    </div>`;

  // Pré-calcul de toutes les données (mission × mois)
  const data = missions.map(m => ({
    mission: m,
    totaux:  calcCRATotauxMission(m, annee),
    mois:    moisLabels.map((_, i) => {
      const mois = i + 1;
      const hors = isMoisHorsMission(m, annee, mois);
      if (hors) return null;
      const entry = getCRAEntry(m.id, annee, mois);
      const c     = calcCRACell(m, annee, mois);
      return { entry, c, mois };
    }),
  }));

  // Totaux globaux par mois
  const totMois = moisLabels.map((_, i) => {
    const mois = i + 1;
    let caHT = 0, caTTC = 0, jours = 0;
    missions.forEach(m => {
      if (isMoisHorsMission(m, annee, mois)) return;
      const c = calcCRACell(m, annee, mois);
      caHT += c.caHT; caTTC += c.caTTC; jours += c.jFact;
    });
    return { caHT, caTTC, jours, tva: caTTC - caHT };
  });
  const totAnnee = missions.reduce((acc, m) => {
    const t = calcCRATotauxMission(m, annee);
    acc.caHT += t.caHT; acc.caTTC += t.caTTC; acc.jours += t.jours;
    return acc;
  }, { caHT: 0, caTTC: 0, jours: 0 });
  const tvaTotAnnee = totAnnee.caTTC - totAnnee.caHT;

  // CSS partagés
  const TH  = `px-3 py-2 text-center text-xs font-semibold border-r border-slate-700 whitespace-nowrap`;
  const THL = `px-3 py-2 text-left   text-xs font-semibold border-r border-slate-700 sticky left-0 z-10`;
  const TD  = (cur) => `px-3 py-2 text-center text-sm border-r border-slate-600 ${cur ? 'bg-blue-950/60' : ''}`;
  const TDL = `px-3 py-2 text-left text-xs border-r border-slate-700 sticky left-0 z-10`;

  // ── En-tête ──────────────────────────────────────────────────────────────────
  const thead = `
  <thead>
    <tr class="bg-slate-700 border-b-2 border-slate-500">
      <th class="${THL} bg-slate-700 min-w-[200px]">Mois</th>
      ${moisLabels.map((label, i) => {
        const mois  = i + 1;
        const isCur = annee === anneeCourante && mois === moisCourant;
        return `<th class="${TH} min-w-[110px] ${isCur ? 'bg-blue-900/60 text-blue-200' : 'bg-slate-700 text-slate-200'}">${label}</th>`;
      }).join('')}
      <th class="${TH} bg-slate-600 text-white min-w-[110px]">Total ${annee}</th>
    </tr>
  </thead>`;

  // ── Corps : une section par mission ──────────────────────────────────────────
  const buildRow = (label, labelCls, values, valueFn, rowCls = '') => `
  <tr class="border-b border-slate-700/60 ${rowCls}">
    <td class="${TDL} ${labelCls} font-medium">${label}</td>
    ${values.map((v, i) => {
      const isCur = annee === anneeCourante && (i + 1) === moisCourant;
      const base  = `${TD(isCur)} align-middle`;
      return `<td class="${base}">${v === null ? '<span class="text-slate-700">—</span>' : valueFn(v, i)}</td>`;
    }).join('')}
  </tr>`;

  const tbody = data.map(({ mission: m, totaux, mois: moisData }) => {
    const tvaDue = m.tva ? totaux.caTTC - totaux.caHT : 0;

    // Ligne titre mission
    const titleRow = `
    <tr class="border-b border-slate-600 bg-slate-700/60">
      <td colspan="${moisLabels.length + 2}"
        class="px-3 py-2 text-sm font-bold text-white sticky left-0 bg-slate-700/60">
        ${m.client}
        <span class="ml-2 font-normal text-slate-400 text-xs">${fmtE(m.tjm)}/j${!m.tva ? ' · sans TVA' : ' · TVA 20%'}</span>
      </td>
    </tr>`;

    // Ligne : Nombre de jours (auto ou override)
    const rowJoursDispo = `
    <tr class="border-b border-slate-700/40">
      <td class="${TDL} bg-slate-800/60 text-slate-400">Nombre de jours</td>
      ${moisData.map((d, i) => {
        const isCur = annee === anneeCourante && (i + 1) === moisCourant;
        if (d === null) return `<td class="${TD(isCur)} text-slate-700 bg-slate-900/20">—</td>`;
        const hasOverride = d.c.joursOverride != null;
        return `<td class="${TD(isCur)} bg-slate-800/40">
          <span class="${hasOverride ? 'text-blue-300 cursor-pointer underline decoration-dotted' : 'text-slate-300 cursor-pointer hover:text-slate-100'}"
            onclick="overrideCRADispo('${m.id}',${annee},${i+1},'${soc.id}')"
            title="${hasOverride ? 'Surcharge active — cliquer pour modifier' : 'Cliquer pour personnaliser'}">
            ${d.c.jousDispo}
          </span>
        </td>`;
      }).join('')}
      <td class="${TD(false)} bg-slate-800/40 font-semibold text-slate-300">${totaux.jours + moisData.filter(d=>d===null).reduce((a,_)=>a,0)}</td>
    </tr>`;

    // Ligne : Absences prévues
    const rowAbsences = `
    <tr class="border-b border-slate-700/40">
      <td class="${TDL} bg-slate-800/60 text-slate-400">Absences prévues</td>
      ${moisData.map((d, i) => {
        const isCur = annee === anneeCourante && (i + 1) === moisCourant;
        if (d === null) return `<td class="${TD(isCur)} bg-slate-900/20 text-slate-700">—</td>`;
        const abs = d.entry.jours_absence || 0;
        return `<td class="${TD(isCur)} bg-slate-800/40 ${abs > 0 ? 'bg-amber-900/20' : ''}">
          <input type="number" min="0" max="${d.c.jousDispo}"
            class="w-12 text-center bg-transparent border-b border-slate-600 text-sm
                   ${abs > 0 ? 'text-amber-300 border-amber-600' : 'text-slate-400 hover:border-slate-400'}
                   focus:outline-none focus:border-blue-400 py-0"
            value="${abs || ''}" placeholder="0"
            onchange="saveCRAEntry('${m.id}',${annee},${i+1},'jours_absence',parseFloat(this.value)||0,'${soc.id}')" />
        </td>`;
      }).join('')}
      <td class="${TD(false)} bg-slate-800/40 text-slate-400">
        ${moisData.reduce((s, d) => s + (d ? (d.entry.jours_absence || 0) : 0), 0) || '—'}
      </td>
    </tr>`;

    // Ligne : Jours travaillés
    const rowJoursTrav = `
    <tr class="border-b border-slate-600">
      <td class="${TDL} bg-slate-800 text-white font-semibold">Jours travaillés</td>
      ${moisData.map((d, i) => {
        const isCur = annee === anneeCourante && (i + 1) === moisCourant;
        if (d === null) return `<td class="${TD(isCur)} bg-slate-900/30 text-slate-700">—</td>`;
        return `<td class="${TD(isCur)} bg-slate-800 font-bold text-white">${d.c.jFact}</td>`;
      }).join('')}
      <td class="${TD(false)} bg-slate-800 font-bold text-white">${totaux.jours}</td>
    </tr>`;

    // Ligne : CA HT
    const rowCaHT = `
    <tr class="border-b border-slate-700/40">
      <td class="${TDL} bg-slate-800/80 text-slate-300">CA HT</td>
      ${moisData.map((d, i) => {
        const isCur = annee === anneeCourante && (i + 1) === moisCourant;
        if (d === null) return `<td class="${TD(isCur)} bg-slate-900/20 text-slate-700">—</td>`;
        return `<td class="${TD(isCur)} bg-slate-800/60 text-slate-100">${fmtE(d.c.caHT)}</td>`;
      }).join('')}
      <td class="${TD(false)} bg-slate-800/60 font-semibold text-green-400">${fmtE(totaux.caHT)}</td>
    </tr>`;

    // Ligne : CA TTC (si TVA)
    const rowCaTTC = !m.tva ? '' : `
    <tr class="border-b border-slate-600">
      <td class="${TDL} bg-slate-800/80 text-slate-300">CA TTC</td>
      ${moisData.map((d, i) => {
        const isCur = annee === anneeCourante && (i + 1) === moisCourant;
        if (d === null) return `<td class="${TD(isCur)} bg-slate-900/20 text-slate-700">—</td>`;
        return `<td class="${TD(isCur)} bg-slate-800/60 text-slate-300">${fmtE(d.c.caTTC)}</td>`;
      }).join('')}
      <td class="${TD(false)} bg-slate-800/60 font-semibold text-slate-300">${fmtE(totaux.caTTC)}</td>
    </tr>`;

    return titleRow + rowJoursDispo + rowAbsences + rowJoursTrav + rowCaHT + rowCaTTC;
  }).join('');

  // ── Ligne totaux globaux ──────────────────────────────────────────────────────
  const tfootJours = totMois.map((t, i) => {
    const isCur = annee === anneeCourante && (i + 1) === moisCourant;
    return `<td class="${TD(isCur)} bg-slate-700 font-bold text-white">${t.jours}</td>`;
  }).join('');
  const tfootHT = totMois.map((t, i) => {
    const isCur = annee === anneeCourante && (i + 1) === moisCourant;
    return `<td class="${TD(isCur)} bg-slate-700 font-bold text-green-400">${fmtE(t.caHT)}</td>`;
  }).join('');
  const tfootTVA = totMois.map((t, i) => {
    const isCur = annee === anneeCourante && (i + 1) === moisCourant;
    return `<td class="${TD(isCur)} bg-slate-700 text-slate-400">${t.tva > 0 ? fmtE(t.tva) : '—'}</td>`;
  }).join('');
  const tfootTTC = totMois.map((t, i) => {
    const isCur = annee === anneeCourante && (i + 1) === moisCourant;
    return `<td class="${TD(isCur)} bg-slate-700 text-slate-200">${t.caTTC !== t.caHT ? fmtE(t.caTTC) : '—'}</td>`;
  }).join('');

  const tfoot = `
  <tfoot>
    <tr class="border-t-2 border-slate-400 bg-slate-700">
      <td class="${TDL} bg-slate-700 font-bold text-white text-sm" colspan="1">Total — Jours</td>
      ${tfootJours}
      <td class="${TD(false)} bg-slate-600 font-bold text-white">${totAnnee.jours}</td>
    </tr>
    <tr class="bg-slate-700 border-b border-slate-600">
      <td class="${TDL} bg-slate-700 font-bold text-white text-sm">Total — CA HT</td>
      ${tfootHT}
      <td class="${TD(false)} bg-slate-600 font-bold text-green-400">${fmtE(totAnnee.caHT)}</td>
    </tr>
    ${tvaTotAnnee > 0 ? `
    <tr class="bg-slate-700 border-b border-slate-600">
      <td class="${TDL} bg-slate-700 text-slate-300 text-sm">Total — TVA collectée</td>
      ${tfootTVA}
      <td class="${TD(false)} bg-slate-600 text-slate-300">${fmtE(tvaTotAnnee)}</td>
    </tr>
    <tr class="bg-slate-700">
      <td class="${TDL} bg-slate-700 text-slate-200 font-semibold text-sm">Total — CA TTC</td>
      ${tfootTTC}
      <td class="${TD(false)} bg-slate-600 font-semibold text-slate-200">${fmtE(totAnnee.caTTC)}</td>
    </tr>` : ''}
  </tfoot>`;

  return `
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <button onclick="setCRAYear(-1,'${soc.id}')" class="btn-secondary text-sm px-3 py-1">←</button>
      <span class="text-white font-bold text-xl">${annee}</span>
      <button onclick="setCRAYear(1,'${soc.id}')" class="btn-secondary text-sm px-3 py-1">→</button>
    </div>
    <div class="text-right">
      <div class="text-slate-500 text-xs uppercase tracking-wide mb-1">CA prévisionnel ${annee}</div>
      <div class="text-green-400 font-bold text-2xl">${fmtE(totAnnee.caHT)} <span class="text-sm font-normal text-slate-400">HT</span></div>
      ${tvaTotAnnee > 0 ? `<div class="text-slate-400 text-xs mt-0.5">${fmtE(tvaTotAnnee)} TVA &nbsp;·&nbsp; ${fmtE(totAnnee.caTTC)} TTC</div>` : ''}
    </div>
  </div>
  <div class="overflow-x-auto rounded-xl border border-slate-600 shadow-xl">
    <table class="w-full text-sm border-collapse" style="min-width:${200 + moisLabels.length * 110 + 110}px">
      ${thead}
      <tbody>${tbody}</tbody>
      ${tfoot}
    </table>
  </div>
  <p class="text-slate-600 text-xs mt-2">Mois courant surligné en bleu · nombre de jours cliquable pour personnaliser · absences saisies en orange</p>`;
}

// ─── MISSIONS — CRUD ─────────────────────────────────────────────────────────

function openMissionModal(societeId, missionId) {
  const m = missionId ? (STATE.missions || []).find(x => x.id === missionId) : null;
  const v = m || { id: uid(), societe_id: societeId, client: '', tjm: '', tva: true,
                   delai_paiement: 30, date_debut: '', date_fin: '', note: '', actif: true };

  document.body.insertAdjacentHTML('beforeend', `
  <div id="mis-modal" class="modal-backdrop" onclick="if(event.target===this)closeMissionModal()">
    <div class="modal-box">
      <h3 class="text-base font-semibold text-white mb-4">${m ? 'Modifier' : 'Nouvelle'} mission</h3>
      <div class="space-y-3">
        <div>
          <label class="label">Client *</label>
          <input id="mis-client" class="input" value="${v.client}" placeholder="Nom du client" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">TJM (€/j HT) *</label>
            <input id="mis-tjm" class="input" type="number" min="0" value="${v.tjm || ''}" placeholder="600" />
          </div>
          <div>
            <label class="label">Délai paiement (jours)</label>
            <input id="mis-delai" class="input" type="number" min="0" value="${v.delai_paiement || 30}" />
          </div>
        </div>
        <div>
          <label class="label">TVA applicable</label>
          <div class="flex gap-2 mt-1">
            <button id="mis-tva-oui" onclick="document.getElementById('mis-tva-val').value='true'; document.getElementById('mis-tva-oui').className='flex-1 text-sm py-1.5 rounded transition-colors bg-blue-600 text-white'; document.getElementById('mis-tva-non').className='flex-1 text-sm py-1.5 rounded transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600';"
              class="flex-1 text-sm py-1.5 rounded transition-colors ${v.tva ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">
              Oui (20%)
            </button>
            <button id="mis-tva-non" onclick="document.getElementById('mis-tva-val').value='false'; document.getElementById('mis-tva-non').className='flex-1 text-sm py-1.5 rounded transition-colors bg-blue-600 text-white'; document.getElementById('mis-tva-oui').className='flex-1 text-sm py-1.5 rounded transition-colors bg-slate-700 text-slate-400 hover:bg-slate-600';"
              class="flex-1 text-sm py-1.5 rounded transition-colors ${!v.tva ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">
              Non
            </button>
          </div>
          <input type="hidden" id="mis-tva-val" value="${v.tva}" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Date début *</label>
            <input id="mis-debut" class="input" type="date" value="${v.date_debut || ''}" />
          </div>
          <div>
            <label class="label">Date fin (optionnel)</label>
            <input id="mis-fin" class="input" type="date" value="${v.date_fin || ''}" />
          </div>
        </div>
        <div>
          <label class="label">Note</label>
          <textarea id="mis-note" class="input" rows="2" placeholder="Informations complémentaires…">${v.note || ''}</textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-5">
        <button class="btn-primary flex-1" onclick="saveMission('${v.id}','${societeId}')">Enregistrer</button>
        <button class="btn-secondary" onclick="closeMissionModal()">Annuler</button>
      </div>
    </div>
  </div>`);
}

function closeMissionModal() { document.getElementById('mis-modal')?.remove(); }

function saveMission(id, societeId) {
  const client = document.getElementById('mis-client').value.trim();
  const tjm    = parseFloat(document.getElementById('mis-tjm').value);
  if (!client) return alert('Le nom du client est obligatoire.');
  if (!tjm || tjm <= 0) return alert('Le TJM doit être supérieur à 0.');

  const data = {
    id,
    societe_id:      societeId,
    client,
    tjm,
    tva:             document.getElementById('mis-tva-val').value === 'true',
    delai_paiement:  parseInt(document.getElementById('mis-delai').value) || 30,
    date_debut:      document.getElementById('mis-debut').value || null,
    date_fin:        document.getElementById('mis-fin').value || null,
    note:            document.getElementById('mis-note').value.trim() || null,
    actif:           true,
  };
  if (!data.date_debut) return alert('La date de début est obligatoire.');

  if (!STATE.missions) STATE.missions = [];
  const idx = STATE.missions.findIndex(m => m.id === id);
  if (idx !== -1) STATE.missions[idx] = data;
  else STATE.missions.push(data);

  saveState();
  closeMissionModal();
  _socTab = 'missions';
  renderSocieteDetail(document.getElementById('app'), societeId);
}

function archiveMission(missionId, societeId) {
  if (!confirm('Archiver cette mission ?')) return;
  const m = (STATE.missions || []).find(x => x.id === missionId);
  if (m) { m.actif = false; saveState(); }
  renderSocieteDetail(document.getElementById('app'), societeId);
}

function unarchiveMission(missionId, societeId) {
  const m = (STATE.missions || []).find(x => x.id === missionId);
  if (m) { m.actif = true; saveState(); }
  renderSocieteDetail(document.getElementById('app'), societeId);
}

function deleteMission(missionId, societeId) {
  const m = (STATE.missions || []).find(x => x.id === missionId);
  if (!m) return;
  const label = m.client ? `la mission "${m.client}"` : 'cette mission';
  if (!confirm(`Supprimer définitivement ${label} ?\n\nToutes les données associées (CRA, paiements) seront effacées. Cette action est irréversible.`)) return;
  STATE.missions    = (STATE.missions    || []).filter(x => x.id !== missionId);
  STATE.cra_entries = (STATE.cra_entries || []).filter(x => x.mission_id !== missionId);
  STATE.paiements   = (STATE.paiements   || []).filter(x => x.mission_id !== missionId);
  saveState();
  renderSocieteDetail(document.getElementById('app'), societeId);
}

// ─── CRA — PERSISTANCE ───────────────────────────────────────────────────────

function saveCRAEntry(missionId, annee, mois, field, value, societeId) {
  if (!STATE.cra_entries) STATE.cra_entries = [];
  let entry = STATE.cra_entries.find(
    e => e.mission_id === missionId && e.annee == annee && e.mois == mois
  );
  if (!entry) {
    entry = { id: uid(), mission_id: missionId, societe_id: societeId, annee, mois,
              jours_absence: 0, jours_dispo_override: null };
    STATE.cra_entries.push(entry);
  }
  entry[field] = value;
  // Nettoyer les entrées vides (valeurs par défaut)
  if (entry.jours_absence === 0 && entry.jours_dispo_override == null) {
    STATE.cra_entries = STATE.cra_entries.filter(e => e !== entry);
  }
  saveState();
  // Re-render la section CRA (contenu sous les onglets)
  const contentDiv = document.getElementById('soc-content');
  if (contentDiv) {
    const soc = (STATE.societes || []).find(s => s.id === societeId);
    if (soc) contentDiv.innerHTML = renderSocCRA(soc);
  }
}

function overrideCRADispo(missionId, annee, mois, societeId) {
  const entry = getCRAEntry(missionId, annee, mois);
  const auto  = calcJoursOuvres(annee, mois);
  const current = entry.jours_dispo_override ?? '';
  const val = prompt(
    `Jours disponibles pour ce mois (calcul auto : ${auto} j)\nLaisser vide pour revenir au calcul automatique :`,
    current
  );
  if (val === null) return; // annulé
  const override = val.trim() === '' ? null : (parseInt(val) || null);
  saveCRAEntry(missionId, annee, mois, 'jours_dispo_override', override, societeId);
  renderSocieteDetail(document.getElementById('app'), societeId);
}

// ─── PAIEMENTS — HELPERS ─────────────────────────────────────────────────────

function getPaiement(missionId, anneeFact, moisFact) {
  return (STATE.paiements || []).find(
    p => p.mission_id === missionId && p.annee_fact == anneeFact && p.mois_fact == moisFact
  ) || null;
}

function togglePaiement(missionId, anneeFact, moisFact, societeId) {
  if (!STATE.paiements) STATE.paiements = [];
  const existing = getPaiement(missionId, anneeFact, moisFact);
  if (existing) {
    // Si déjà reçu → repasser en attente; si en attente → supprimer
    if (existing.recu) {
      existing.recu = false;
    } else {
      STATE.paiements = STATE.paiements.filter(p => p !== existing);
    }
  } else {
    STATE.paiements.push({
      id: uid(), mission_id: missionId, societe_id: societeId,
      annee_fact: anneeFact, mois_fact: moisFact,
      recu: true, date_reception: new Date().toISOString().slice(0, 10),
    });
  }
  saveState();
  const contentDiv = document.getElementById('soc-content');
  if (contentDiv) {
    const soc = (STATE.societes || []).find(s => s.id === societeId);
    if (soc) contentDiv.innerHTML = renderSocBilan(soc);
  }
}

// ─── BILAN COMPTABLE — CALCULS ───────────────────────────────────────────────

let _bilanAnnee = new Date().getFullYear();

function setBilanYear(delta, socId) {
  _bilanAnnee += delta;
  renderSocieteDetail(document.getElementById('app'), socId);
}

function getDepenses(societeId) {
  return (STATE.depenses || []).filter(d => d.societe_id === societeId && d.actif !== false);
}

// Retourne le montant HT de la dépense pour un mois/année donné (0 si hors période ou hors cycle)
function calcDepenseMois(dep, annee, mois) {
  // Vérifier période active
  if (dep.mois_debut) {
    if (annee < dep.mois_debut.annee) return 0;
    if (annee === dep.mois_debut.annee && mois < dep.mois_debut.mois) return 0;
  }
  if (dep.mois_fin) {
    if (annee > dep.mois_fin.annee) return 0;
    if (annee === dep.mois_fin.annee && mois > dep.mois_fin.mois) return 0;
  }
  const startMois = dep.mois_debut?.mois || 1;
  // Pour les salaires : coût société = rémunération + cotisations (TNS ou patronales)
  const montant = dep.categorie === 'salaire' ? _salaireCoutSociete(dep) : dep.montant_ht;
  switch (dep.periodicite) {
    case 'mensuelle':      return montant;
    case 'trimestrielle':  return ((mois - startMois + 12) % 3  === 0) ? montant : 0;
    case 'semestrielle':   return ((mois - startMois + 12) % 6  === 0) ? montant : 0;
    case 'annuelle':       return mois === startMois             ? montant : 0;
    case 'ponctuelle':
      return (dep.mois_debut && dep.mois_debut.annee === annee && dep.mois_debut.mois === mois)
        ? montant : 0;
    default: return 0;
  }
}

// Retourne le salaire net perçu pour un mois donné
function calcSalaireNetMois(dep, annee, mois) {
  if (dep.categorie !== 'salaire') return 0;
  const net = _salaireNetMensuel(dep);
  // Réutilise la même logique de périodicité mais sur le net
  if (dep.mois_debut) {
    if (annee < dep.mois_debut.annee) return 0;
    if (annee === dep.mois_debut.annee && mois < dep.mois_debut.mois) return 0;
  }
  if (dep.mois_fin) {
    if (annee > dep.mois_fin.annee) return 0;
    if (annee === dep.mois_fin.annee && mois > dep.mois_fin.mois) return 0;
  }
  const startMois = dep.mois_debut?.mois || 1;
  switch (dep.periodicite) {
    case 'mensuelle':     return net;
    case 'trimestrielle': return ((mois - startMois + 12) % 3 === 0) ? net : 0;
    case 'semestrielle':  return ((mois - startMois + 12) % 6 === 0) ? net : 0;
    case 'annuelle':      return mois === startMois ? net : 0;
    case 'ponctuelle':
      return (dep.mois_debut && dep.mois_debut.annee === annee && dep.mois_debut.mois === mois) ? net : 0;
    default: return 0;
  }
}

// Encaissements prévisionnels pour un mois/année (CA facturé décalé du délai de paiement)
// Chaque entrée est annotée avec recu: true/false/null
// recu: true = paiement confirmé, false = en attente explicite, null = pas encore de statut
function calcEncaissementsMois(societeId, annee, mois) {
  const missions = getMissionsActives(societeId);
  let totalHT = 0, totalTTC = 0, totalRecuHT = 0;
  const detail = [];
  missions.forEach(m => {
    const decalage = Math.round((m.delai_paiement || 30) / 30);
    let mFact = mois - decalage;
    let aFact = annee;
    while (mFact <= 0) { mFact += 12; aFact--; }
    if (isMoisHorsMission(m, aFact, mFact)) return;
    const c = calcCRACell(m, aFact, mFact);
    if (c.caHT > 0) {
      const p = getPaiement(m.id, aFact, mFact);
      const recu = p ? p.recu : null; // null = pas encore statué
      totalHT  += c.caHT;
      totalTTC += c.caTTC;
      if (recu === true) totalRecuHT += c.caHT;
      detail.push({ missionId: m.id, client: m.client, caHT: c.caHT, caTTC: c.caTTC,
                    moisFact: mFact, anneeFact: aFact, tva: m.tva, recu });
    }
  });
  return { totalHT, totalTTC, totalRecuHT, detail };
}

// Totaux annuels revenus (prévisionnel complet + confirmé)
function calcEncaissementsAnnee(societeId, annee) {
  let caHT = 0, caTTC = 0, recuHT = 0;
  for (let m = 1; m <= 12; m++) {
    const e = calcEncaissementsMois(societeId, annee, m);
    caHT += e.totalHT; caTTC += e.totalTTC; recuHT += e.totalRecuHT;
  }
  return { caHT, caTTC, recuHT };
}

// Assiette courante = CA confirmé reçu (recu: true) — toutes années
function calcAssietteCourante(societeId) {
  const missions = getMissionsActives(societeId);
  let total = 0;
  (STATE.paiements || [])
    .filter(p => p.societe_id === societeId && p.recu === true)
    .forEach(p => {
      const m = missions.find(x => x.id === p.mission_id);
      if (!m) return;
      total += calcCRACell(m, p.annee_fact, p.mois_fact).caHT;
    });
  return total;
}

// Assiette intermédiaire = confirmé (recu: true) + prévu prochainement (recu: false)
function calcAssietteIntermediaire(societeId) {
  const missions = getMissionsActives(societeId);
  let total = 0;
  (STATE.paiements || [])
    .filter(p => p.societe_id === societeId && p.recu !== null && p.recu !== undefined)
    .forEach(p => {
      const m = missions.find(x => x.id === p.mission_id);
      if (!m) return;
      total += calcCRACell(m, p.annee_fact, p.mois_fact).caHT;
    });
  return total;
}

// Totaux annuels dépenses
function calcDepensesAnnee(societeId, annee) {
  const deps = getDepenses(societeId);
  let totalHT = 0, totalTTC = 0;
  deps.forEach(d => {
    for (let m = 1; m <= 12; m++) {
      const ht = calcDepenseMois(d, annee, m);
      totalHT  += ht;
      totalTTC += ht * (1 + (d.tva_taux || 0));
    }
  });
  return { totalHT, totalTTC };
}

// ─── BILAN — RENDU ───────────────────────────────────────────────────────────

const CATS_DEPENSE = [
  { value: 'salaire',    label: '👤 Salaire dirigeant / salarié' },
  { value: 'loyer',      label: 'Loyer & charges locatives' },
  { value: 'logiciel',   label: 'Logiciels & abonnements' },
  { value: 'materiel',   label: 'Matériel & équipement' },
  { value: 'deplacement',label: 'Déplacements & frais' },
  { value: 'compta',     label: 'Comptabilité & juridique' },
  { value: 'social',     label: 'Charges sociales TNS' },
  { value: 'soustraitance', label: 'Sous-traitance' },
  { value: 'autre',      label: 'Autre' },
];

// Taux par défaut selon régime social (2024-2025)
const SALAIRE_DEFAULTS = {
  // TNS — gérant majoritaire EURL/SARL (cotisations URSSAF sur rémunération nette)
  tns: {
    taux_cotis: 0.45,  // ~45 % de la rémunération nette (maladie, retraite, AF, CSG/CRDS, formation)
  },
  // Assimilé-salarié — dirigeant SASU/SAS (régime général)
  assimile_salarie: {
    taux_patronal: 0.45,  // ~45 % du brut
    taux_salarial: 0.22,  // ~22 % du brut → net ≈ brut × 0.78
  },
};

// Helpers calcul salaire
function _salaireNetMensuel(dep) {
  if (!dep.regime_social || dep.regime_social === 'tns') {
    return dep.montant_ht; // TNS : montant_ht = rémunération nette
  }
  // Assimilé-salarié : montant_ht = brut, net = brut × (1 - taux_salarial)
  return Math.round(dep.montant_ht * (1 - (dep.taux_salarial ?? SALAIRE_DEFAULTS.assimile_salarie.taux_salarial)));
}
function _salaireCoutSociete(dep) {
  if (!dep.regime_social || dep.regime_social === 'tns') {
    return Math.round(dep.montant_ht * (1 + (dep.taux_cotis ?? SALAIRE_DEFAULTS.tns.taux_cotis)));
  }
  return Math.round(dep.montant_ht * (1 + (dep.taux_patronal ?? SALAIRE_DEFAULTS.assimile_salarie.taux_patronal)));
}
const CAT_LABEL = Object.fromEntries(CATS_DEPENSE.map(c => [c.value, c.label]));

function renderSocBilan(soc) {
  const annee    = _bilanAnnee;
  const missions = getMissionsActives(soc.id);
  const depenses = getDepenses(soc.id);
  const moisLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const now = new Date();
  const moisCourant   = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();

  // ── Pré-calcul par mois ──────────────────────────────────────────────────
  const moisData = Array.from({ length: 12 }, (_, i) => {
    const mois = i + 1;
    const enc  = calcEncaissementsMois(soc.id, annee, mois);
    const totDepsHT = depenses.reduce((s, d) => s + calcDepenseMois(d, annee, mois), 0);
    return { mois, enc, totDepsHT, resultatHT: enc.totalHT - totDepsHT };
  });

  // ── Assiettes & totaux ───────────────────────────────────────────────────
  const totEnc              = calcEncaissementsAnnee(soc.id, annee);
  const totDeps             = calcDepensesAnnee(soc.id, annee);
  const assietteCourante    = calcAssietteCourante(soc.id);
  const assietteInter       = calcAssietteIntermediaire(soc.id);
  const assietteFin         = totEnc.caHT;
  const resultatCourant     = assietteCourante - totDeps.totalHT;
  const resultatInter       = assietteInter - totDeps.totalHT;
  const resultatFin         = assietteFin - totDeps.totalHT;

  // ── CSS helpers ──────────────────────────────────────────────────────────
  const TH  = (cur) => `px-2 py-2 text-center text-xs font-semibold border-r border-slate-700 min-w-[100px] ${cur ? 'bg-blue-900/40 text-blue-200' : 'bg-slate-700 text-slate-200'}`;
  const TD  = (cur, extra = '') => `px-2 py-1.5 text-center text-xs border-r border-slate-600 ${cur ? 'bg-blue-950/30' : ''} ${extra}`;
  const TDL = `px-3 py-2 text-left text-xs border-r border-slate-700 sticky left-0 z-10 min-w-[200px]`;
  const COL_TOTAL = `px-3 py-2 text-center text-xs font-bold border-r border-slate-500`;

  const thead = `
  <thead>
    <tr class="border-b-2 border-slate-500">
      <th class="${TDL} bg-slate-700 text-slate-400 font-medium"></th>
      ${moisLabels.map((l, i) => `<th class="${TH(annee === anneeCourante && i+1 === moisCourant)}">${l}</th>`).join('')}
      <th class="${COL_TOTAL} bg-slate-600 text-white min-w-[105px]">Total ${annee}</th>
    </tr>
  </thead>`;

  // ── Section REVENUS ──────────────────────────────────────────────────────
  const missionEncRows = missions.map(m => {
    const decalage = Math.round((m.delai_paiement || 30) / 30);
    let totRecu = 0, totAttendu = 0;

    const cells = moisData.map(md => {
      const isCur = annee === anneeCourante && md.mois === moisCourant;
      const enc = md.enc.detail.find(d => d.missionId === m.id);
      if (!enc) return `<td class="${TD(isCur, 'bg-slate-800/20')}"><span class="text-slate-800">—</span></td>`;

      if (enc.recu === true)  totRecu    += enc.caHT;
      if (enc.recu !== true)  totAttendu += enc.caHT;

      // État du paiement : true=confirmé, false=en attente explicit, null=non statué
      const btnCls  = enc.recu === true
        ? 'bg-emerald-700 text-white hover:bg-emerald-600'
        : enc.recu === false
          ? 'bg-blue-900/60 text-blue-400 hover:bg-blue-800/60'
          : 'bg-slate-700 text-slate-500 hover:bg-slate-600 hover:text-slate-300';
      const btnIcon = enc.recu === true ? '✓' : enc.recu === false ? '⏳' : '○';
      const btnTitle = enc.recu === true
        ? 'Paiement confirmé ✓ — cliquer pour passer en "prévu prochainement"'
        : enc.recu === false
          ? 'Prévu prochainement ⏳ — cliquer pour retirer le statut'
          : 'Cliquer pour confirmer la réception du paiement';

      const cellBg = enc.recu === true ? 'bg-emerald-950/30' : enc.recu === false ? 'bg-blue-950/20' : 'bg-slate-800/20';

      return `<td class="${TD(isCur, cellBg)}">
        <div class="flex flex-col items-center gap-0.5">
          <span class="${enc.recu === true ? 'text-emerald-300' : enc.recu === false ? 'text-amber-400/70' : 'text-slate-400'} font-medium">${fmtE(enc.caHT)}</span>
          <button onclick="togglePaiement('${m.id}',${enc.anneeFact},${enc.moisFact},'${soc.id}')"
            class="text-xs px-1.5 py-0 rounded ${btnCls} transition-colors leading-4"
            title="${btnTitle}">${btnIcon}</button>
          <div class="text-slate-500 text-xs mt-0.5 leading-3">Fact. ${moisLabels[enc.moisFact-1]}${enc.anneeFact !== annee ? ' '+enc.anneeFact : ''}</div>
        </div>
      </td>`;
    }).join('');

    const totM = totRecu + totAttendu;
    return `<tr class="border-b border-slate-700/40">
      <td class="${TDL} bg-slate-800/20">
        <span class="text-slate-300">${m.client}</span>
        ${decalage > 0 ? `<span class="ml-1 text-slate-600">+${decalage}m</span>` : ''}
      </td>
      ${cells}
      <td class="${COL_TOTAL} bg-slate-700/30">
        ${totRecu > 0 ? `<div class="text-emerald-400">✓ ${fmtE(totRecu)}</div>` : ''}
        ${totAttendu > 0 ? `<div class="text-slate-400">${fmtE(totAttendu)}</div>` : ''}
        ${totM === 0 ? '<span class="text-slate-700">—</span>' : ''}
      </td>
    </tr>`;
  }).join('');

  // Ligne total revenus (confirmés en vert, attendus en gris)
  const revenusRow = `
  <tr class="border-b border-slate-500">
    <td class="${TDL} bg-emerald-950/50 text-emerald-300 font-bold">Total revenus HT</td>
    ${moisData.map(md => {
      const isCur = annee === anneeCourante && md.mois === moisCourant;
      const recu  = md.enc.totalRecuHT;
      const att   = md.enc.totalHT - recu;
      return `<td class="${TD(isCur, 'bg-emerald-950/20 font-medium')}">
        ${recu  > 0 ? `<div class="text-emerald-400 leading-4">✓ ${fmtE(recu)}</div>` : ''}
        ${att   > 0 ? `<div class="text-slate-400 leading-4">${fmtE(att)}</div>` : ''}
        ${md.enc.totalHT === 0 ? '<span class="text-slate-800">—</span>' : ''}
      </td>`;
    }).join('')}
    <td class="${COL_TOTAL} bg-emerald-900/40">
      <div class="text-emerald-300 font-bold">${fmtE(totEnc.caHT)}</div>
      ${totEnc.recuHT > 0 ? `<div class="text-emerald-500 text-xs">dont ✓ ${fmtE(totEnc.recuHT)}</div>` : ''}
    </td>
  </tr>`;

  // ── Section DÉPENSES ─────────────────────────────────────────────────────
  const depRows = depenses.length === 0
    ? `<tr><td colspan="14" class="px-3 py-4 text-center text-slate-600 text-xs italic">Aucune dépense — cliquez sur "+ Ajouter une dépense"</td></tr>`
    : depenses.map(dep => {
        const isSal = dep.categorie === 'salaire';
        const cells = moisData.map(md => {
          const isCur = annee === anneeCourante && md.mois === moisCourant;
          const ht  = calcDepenseMois(dep, annee, md.mois);
          const net = isSal ? calcSalaireNetMois(dep, annee, md.mois) : 0;
          if (!ht) return `<td class="${TD(isCur, 'bg-slate-800/20')}"><span class="text-slate-800">—</span></td>`;
          return `<td class="${TD(isCur, 'bg-slate-800/20')}">
            <div class="flex flex-col items-center gap-0">
              <span class="text-red-300">${fmtE(ht)}</span>
              ${isSal ? `<span class="text-emerald-700 text-xs">net ${fmtE(net)}</span>` : ''}
            </div>
          </td>`;
        }).join('');
        let totD = 0, totNet = 0;
        for (let m = 1; m <= 12; m++) {
          totD   += calcDepenseMois(dep, annee, m);
          totNet += isSal ? calcSalaireNetMois(dep, annee, m) : 0;
        }
        const labelSuffix = isSal
          ? ` <span class="text-slate-600 text-xs">(brut + charges pat.)</span>`
          : '';
        return `<tr class="border-b border-slate-700/30 group">
          <td class="${TDL} bg-slate-800/20">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">${dep.label}${labelSuffix} <span class="text-slate-700">${_perioLabel(dep.periodicite)}</span></span>
              <div class="hidden group-hover:flex gap-1 ml-2 shrink-0">
                <button onclick="openDepenseModal('${soc.id}','${dep.id}')" class="text-slate-500 hover:text-white text-xs">✏</button>
                <button onclick="deleteDepense('${dep.id}','${soc.id}')" class="text-red-800 hover:text-red-400 text-xs ml-1">✕</button>
              </div>
            </div>
          </td>
          ${cells}
          <td class="${COL_TOTAL} bg-slate-700/30">
            <div class="flex flex-col items-center gap-0">
              <span class="text-red-300">${totD > 0 ? fmtE(totD) : '—'}</span>
              ${isSal && totNet > 0 ? `<span class="text-emerald-700 text-xs">net ${fmtE(totNet)}</span>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');

  const depTotRow = `
  <tr class="border-b border-slate-500">
    <td class="${TDL} bg-red-950/50 text-red-300 font-bold">Total dépenses HT</td>
    ${moisData.map(md => {
      const isCur = annee === anneeCourante && md.mois === moisCourant;
      return `<td class="${TD(isCur, 'bg-red-950/20 font-medium')}">
        ${md.totDepsHT > 0 ? `<span class="text-red-400">${fmtE(md.totDepsHT)}</span>` : '<span class="text-slate-800">—</span>'}
      </td>`;
    }).join('')}
    <td class="${COL_TOTAL} bg-red-900/40 text-red-300 font-bold">${totDeps.totalHT > 0 ? fmtE(totDeps.totalHT) : '—'}</td>
  </tr>`;

  // ── Section RÉSULTAT ─────────────────────────────────────────────────────
  const resultatRow = `
  <tr>
    <td class="${TDL} bg-slate-700 text-white font-bold">Résultat brut HT</td>
    ${moisData.map(md => {
      const isCur = annee === anneeCourante && md.mois === moisCourant;
      const r = md.resultatHT;
      const col = r > 0 ? 'text-emerald-400' : r < 0 ? 'text-red-400' : 'text-slate-600';
      return `<td class="${TD(isCur, 'bg-slate-700 font-bold')}">
        <span class="${col}">${r !== 0 ? fmtE(r) : '—'}</span>
      </td>`;
    }).join('')}
    <td class="${COL_TOTAL} bg-slate-600">
      <span class="${resultatFin > 0 ? 'text-emerald-400' : 'text-red-400'} font-bold text-sm">${fmtE(resultatFin)}</span>
    </td>
  </tr>`;

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpiCard = (icon, titre, sousTitre, assiette, resultat, borderCls, extra = '') => `
  <div class="bg-slate-800 border ${borderCls} rounded-xl p-4">
    <div class="text-slate-400 text-xs uppercase tracking-wide font-medium mb-3">${icon} ${titre}</div>
    <div class="flex items-end justify-between mb-3">
      <div>
        <div class="text-white font-bold text-2xl">${fmtE(assiette)}</div>
        <div class="text-slate-500 text-xs mt-0.5">${sousTitre}</div>
      </div>
      <div class="text-right">
        <div class="text-red-400 text-sm font-medium">− ${fmtE(totDeps.totalHT)}</div>
        <div class="text-slate-500 text-xs">dépenses</div>
      </div>
    </div>
    <div class="pt-3 border-t border-slate-700 flex items-center justify-between">
      <span class="text-slate-400 text-xs">Résultat estimé</span>
      <span class="${resultat >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${fmtE(resultat)}</span>
    </div>
    ${extra}
  </div>`;

  const kpis = `
  <div class="grid grid-cols-3 gap-3 mb-5">
    ${kpiCard('✅', 'Assiette courante', 'Paiements ✓ confirmés', assietteCourante, resultatCourant, 'border-emerald-800/50')}
    ${kpiCard('⏳', 'Assiette à court terme', 'Confirmés + ⏳ prévus prochainement', assietteInter, resultatInter, 'border-blue-700/40',
      assietteInter > assietteCourante
        ? `<div class="mt-2 text-blue-600 text-xs">+ ${fmtE(assietteInter - assietteCourante)} prévu prochainement</div>`
        : ''
    )}
    ${kpiCard('📅', `Fin ${annee}`, 'Prévisionnel complet', assietteFin, resultatFin, 'border-slate-600',
      '<div class="mt-2 text-slate-600 text-xs">avant charges sociales & impôts</div>'
    )}
  </div>`;

  // ── Légende statuts ──────────────────────────────────────────────────────
  const legende = `
  <div class="flex items-center gap-4 mb-3 text-xs text-slate-500">
    <span class="flex items-center gap-1"><span class="bg-emerald-700 text-white px-1 rounded text-xs">✓</span> Confirmé reçu → assiette courante</span>
    <span class="flex items-center gap-1"><span class="bg-blue-900/60 text-blue-400 px-1 rounded text-xs">⏳</span> Prévu prochainement → assiette court terme</span>
    <span class="flex items-center gap-1"><span class="bg-slate-700 text-slate-500 px-1 rounded text-xs">○</span> Non statué → fin d'année seulement</span>
    <span class="text-slate-600 ml-2">Cliquer sur le bouton dans chaque cellule pour changer le statut</span>
  </div>`;

  return `
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <button onclick="setBilanYear(-1,'${soc.id}')" class="btn-secondary text-sm px-3 py-1">←</button>
      <span class="text-white font-bold text-xl">${annee}</span>
      <button onclick="setBilanYear(1,'${soc.id}')" class="btn-secondary text-sm px-3 py-1">→</button>
    </div>
    <button onclick="openDepenseModal('${soc.id}',null)" class="btn-primary text-sm">+ Ajouter une dépense</button>
  </div>
  ${kpis}
  ${legende}
  <div class="overflow-x-auto rounded-xl border border-slate-600 shadow-xl mb-6">
    <table class="w-full text-sm border-collapse" style="min-width:${200 + 12*100 + 105}px">
      ${thead}
      <tbody>
        <tr class="bg-slate-700/60 border-b border-slate-500">
          <td colspan="14" class="px-3 py-1 text-xs font-bold text-emerald-400 uppercase tracking-wider sticky left-0 bg-slate-700/60">Revenus</td>
        </tr>
        ${missions.length > 0 ? missionEncRows : `<tr><td colspan="14" class="px-6 py-3 text-slate-600 text-xs italic">Aucune mission active</td></tr>`}
        ${revenusRow}
        <tr class="bg-slate-700/60 border-b border-slate-500">
          <td colspan="14" class="px-3 py-1 text-xs font-bold text-red-400 uppercase tracking-wider sticky left-0 bg-slate-700/60">Dépenses</td>
        </tr>
        ${depRows}
        ${depTotRow}
        <tr class="bg-slate-700/60 border-b border-slate-500">
          <td colspan="14" class="px-3 py-1 text-xs font-bold text-slate-300 uppercase tracking-wider sticky left-0 bg-slate-700/60">Résultat</td>
        </tr>
        ${resultatRow}
      </tbody>
    </table>
  </div>
  ${renderRemunerations(soc, annee)}
  ${renderSimuFiscale(soc)}
  ${renderSimuFiscaleIS(soc)}`;
}

function renderRemunerations(soc, annee) {
  const salDeps = getDepenses(soc.id).filter(d => d.categorie === 'salaire');
  if (salDeps.length === 0) return '';

  const moisLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const now = new Date();
  const moisCourant   = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();

  // Totaux annuels par ligne — utilise les helpers qui gèrent TNS vs assimilé-salarié
  const lignes = salDeps.map(dep => {
    const isTNS = !dep.regime_social || dep.regime_social === 'tns';
    let totNet = 0, totCout = 0, totCotis = 0;
    for (let m = 1; m <= 12; m++) {
      const net  = calcSalaireNetMois(dep, annee, m);
      const cout = (() => {
        // Récupère le coût brut pour ce mois (même logique périodicité que calcDepenseMois)
        if (dep.mois_debut) {
          if (annee < dep.mois_debut.annee || (annee === dep.mois_debut.annee && m < dep.mois_debut.mois)) return 0;
        }
        if (dep.mois_fin) {
          if (annee > dep.mois_fin.annee || (annee === dep.mois_fin.annee && m > dep.mois_fin.mois)) return 0;
        }
        return net > 0 ? _salaireCoutSociete(dep) : 0;
      })();
      totNet  += net;
      totCout += cout;
      totCotis += Math.max(0, cout - net);
    }
    // Pour assimilé-salarié : brut = montant_ht × nb mois actifs
    const totBrut = isTNS ? totNet : (() => {
      let b = 0;
      for (let m = 1; m <= 12; m++) {
        if (dep.mois_debut) { if (annee < dep.mois_debut.annee || (annee === dep.mois_debut.annee && m < dep.mois_debut.mois)) continue; }
        if (dep.mois_fin)   { if (annee > dep.mois_fin.annee   || (annee === dep.mois_fin.annee   && m > dep.mois_fin.mois))   continue; }
        const sm = dep.mois_debut?.mois || 1;
        let ok = false;
        switch (dep.periodicite) {
          case 'mensuelle':     ok = true; break;
          case 'trimestrielle': ok = ((m - sm + 12) % 3 === 0); break;
          case 'semestrielle':  ok = ((m - sm + 12) % 6 === 0); break;
          case 'annuelle':      ok = (m === sm); break;
          case 'ponctuelle':    ok = (dep.mois_debut?.annee === annee && dep.mois_debut?.mois === m); break;
        }
        if (ok) b += dep.montant_ht;
      }
      return b;
    })();
    return { dep, isTNS, totNet, totCout, totCotis, totBrut };
  });

  const grandTotNet   = lignes.reduce((s, l) => s + l.totNet,   0);
  const grandTotCout  = lignes.reduce((s, l) => s + l.totCout,  0);
  const grandTotCotis = lignes.reduce((s, l) => s + l.totCotis, 0);

  // Détermine si on a un mix de régimes
  const hasTNS = lignes.some(l => l.isTNS);
  const hasAS  = lignes.some(l => !l.isTNS);
  const mixte  = hasTNS && hasAS;

  const TH2  = (cur) => `px-2 py-2 text-center text-xs font-semibold border-r border-slate-700 ${cur ? 'bg-blue-900/40 text-blue-200' : 'bg-slate-700 text-slate-200'}`;
  const TD2  = (cur) => `px-2 py-1.5 text-center text-xs border-r border-slate-600 ${cur ? 'bg-blue-950/30' : ''}`;
  const TDL2 = `px-3 py-2 text-left text-xs border-r border-slate-700 sticky left-0 z-10 min-w-[200px]`;

  const salRows = lignes.map(({ dep, isTNS, totNet }) => {
    const cells = Array.from({ length: 12 }, (_, i) => {
      const m   = i + 1;
      const net = calcSalaireNetMois(dep, annee, m);
      const cur = annee === anneeCourante && m === moisCourant;
      return `<td class="${TD2(cur)} bg-emerald-950/10">${net > 0 ? `<span class="text-emerald-400">${fmtE(net)}</span>` : '<span class="text-slate-800">—</span>'}</td>`;
    }).join('');
    const badge = isTNS
      ? `<span class="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 ml-1">TNS</span>`
      : `<span class="text-xs px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400 ml-1">Sal.</span>`;
    const taux = isTNS
      ? `${((dep.taux_cotis ?? SALAIRE_DEFAULTS.tns.taux_cotis) * 100).toFixed(0)}% cotis.`
      : `${((dep.taux_salarial ?? SALAIRE_DEFAULTS.assimile_salarie.taux_salarial) * 100).toFixed(0)}% ch.sal.`;
    return `<tr class="border-b border-slate-700/30">
      <td class="${TDL2} bg-emerald-950/10">
        <span class="text-slate-300">${dep.label}</span>${badge}
        <span class="text-slate-600 text-xs ml-1">(${taux})</span>
      </td>
      ${cells}
      <td class="px-3 py-2 text-center text-xs font-bold border-r border-slate-500 bg-emerald-900/30 text-emerald-300">${totNet > 0 ? fmtE(totNet) : '—'}</td>
    </tr>`;
  }).join('');

  // Labels KPIs adaptés selon le régime
  const kpi2label = hasTNS && !hasAS ? 'Rémunération nette annuelle' : 'Salaire brut annuel';
  const kpi2sub   = hasTNS && !hasAS ? 'versée par la société' : 'avant charges salariales';
  const kpi3label = hasTNS && !hasAS ? 'Cotisations TNS (URSSAF)' : 'Charges patronales / cotisations';
  const kpi3sub   = hasTNS && !hasAS ? 'payées à l\'URSSAF' : 'à la charge de la société';
  const kpi4sub   = hasTNS && !hasAS ? 'ce que vous encaissez' : 'après charges salariales';
  const grandTotBrut = lignes.reduce((s, l) => s + l.totBrut, 0);

  return `
  <div class="mt-6 pt-6 border-t border-slate-700">
    <h3 class="text-white font-semibold mb-1">👤 Rémunérations</h3>
    <p class="text-slate-500 text-xs mb-4">Synthèse des rémunérations saisies en dépenses · le coût total inclut les cotisations${mixte ? ' · mix TNS + assimilé-salarié' : ''}</p>

    <!-- KPIs rémunération -->
    <div class="grid grid-cols-4 gap-3 mb-5">
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-3">
        <div class="text-slate-500 text-xs mb-1">Coût total société</div>
        <div class="text-red-300 font-bold text-lg">${fmtE(grandTotCout)}</div>
        <div class="text-slate-600 text-xs mt-0.5">rémunération + cotisations / an</div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-3">
        <div class="text-slate-500 text-xs mb-1">${kpi2label}</div>
        <div class="text-slate-300 font-bold text-lg">${fmtE(grandTotBrut)}</div>
        <div class="text-slate-600 text-xs mt-0.5">${kpi2sub}</div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-3">
        <div class="text-slate-500 text-xs mb-1">${kpi3label}</div>
        <div class="text-red-400 font-bold text-lg">${fmtE(grandTotCotis)}</div>
        <div class="text-slate-600 text-xs mt-0.5">${kpi3sub}</div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-emerald-800/40 p-3 bg-emerald-950/20">
        <div class="text-slate-500 text-xs mb-1">Net perçu annuel</div>
        <div class="text-emerald-400 font-bold text-lg">${fmtE(grandTotNet)}</div>
        <div class="text-slate-600 text-xs mt-0.5">${kpi4sub}</div>
      </div>
    </div>

    <!-- Tableau mensuel net perçu -->
    <div class="overflow-x-auto rounded-xl border border-slate-600 mb-4">
      <table class="w-full text-sm border-collapse" style="min-width:${200 + 12*100 + 105}px">
        <thead>
          <tr class="border-b-2 border-slate-500">
            <th class="${TDL2} bg-slate-700 text-slate-400 font-medium text-xs">Net mensuel perçu</th>
            ${moisLabels.map((l, i) => `<th class="${TH2(annee === anneeCourante && i+1 === moisCourant)}">${l}</th>`).join('')}
            <th class="px-3 py-2 text-center text-xs font-bold border-r border-slate-500 bg-slate-600 text-white min-w-[105px]">Total ${annee}</th>
          </tr>
        </thead>
        <tbody>${salRows}</tbody>
      </table>
    </div>

    <!-- Détail par ligne de salaire -->
    ${lignes.length > 1 ? `
    <div class="space-y-2">
      ${lignes.map(l => {
        const netM  = _salaireNetMensuel(l.dep);
        const coutM = _salaireCoutSociete(l.dep);
        const cotisM = coutM - netM;
        if (l.isTNS) {
          const tauxCotis = ((l.dep.taux_cotis ?? SALAIRE_DEFAULTS.tns.taux_cotis) * 100).toFixed(0);
          return `
          <div class="flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-lg px-4 py-2 text-xs">
            <span class="text-slate-300 font-medium">${l.dep.label} <span class="text-blue-400 ml-1">TNS</span></span>
            <div class="flex gap-6">
              <span class="text-slate-500">Rémunération nette <span class="text-emerald-400 font-semibold">${fmtE(netM)}/mois</span></span>
              <span class="text-slate-500">Cotisations URSSAF (${tauxCotis}%) <span class="text-red-400">${fmtE(cotisM)}/mois</span></span>
              <span class="text-slate-500">Coût total <span class="text-red-300">${fmtE(coutM)}/mois</span></span>
            </div>
          </div>`;
        }
        const tauxPat = ((l.dep.taux_patronal ?? SALAIRE_DEFAULTS.assimile_salarie.taux_patronal) * 100).toFixed(0);
        return `
        <div class="flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-lg px-4 py-2 text-xs">
          <span class="text-slate-300 font-medium">${l.dep.label} <span class="text-purple-400 ml-1">Sal.</span></span>
          <div class="flex gap-6">
            <span class="text-slate-500">Brut/mois <span class="text-slate-300">${fmtE(l.dep.montant_ht)}</span></span>
            <span class="text-slate-500">Ch. pat. (${tauxPat}%) <span class="text-red-400">${fmtE(cotisM)}</span></span>
            <span class="text-slate-500">Net/mois <span class="text-emerald-400 font-semibold">${fmtE(netM)}</span></span>
            <span class="text-slate-500">Coût soc. <span class="text-red-300">${fmtE(coutM)}</span></span>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
  </div>`;
}

function _perioLabel(p) {
  return { mensuelle: '/mois', trimestrielle: '/trim.', semestrielle: '/sem.', annuelle: '/an', ponctuelle: '1×' }[p] || '';
}

// ─── SIMULATION FISCALE SASU IR ──────────────────────────────────────────────

const SCENARIOS_CSG = [
  { id: 's0',   label: '0 % — Exonération',        taux: 0,     note: 'Cas rarissime (exonération explicite)' },
  { id: 's97',  label: '9,7 % — Taux activité',    taux: 0.097, note: '6,8 % CSG déductible de l\'IR N+1 · 2,9 % CRDS non déductible' },
  { id: 's172', label: '17,2 % — Revenus capital', taux: 0.172, note: 'Taux prélèvements sociaux — aucune déduction IR' },
];

function getBilanIRConfig(societeId) {
  const c = (STATE.fiscal_configs || []).find(x => x.societe_id === societeId);
  return c || {
    situation: 'celibataire', nbEnfants: 0, salaires_mode: 'brut',
    salaires_vous: 0, salaires_conjoint: 0,
    foncier: 0, micro_foncier: 0, per: 0,
    pas_vous: 0, pas_conjoint: 0,
  };
}

function saveBilanIRConfig(societeId) {
  const sit = document.getElementById('fi-sit')?.value || 'celibataire';
  const isMarie = sit === 'marie' || sit === 'pacse';
  // Afficher/masquer champ conjoint
  const wrapC = document.getElementById('fi-sal-c-wrap');
  if (wrapC) wrapC.style.display = isMarie ? '' : 'none';
  const cfg = {
    societe_id:   societeId,
    situation:    sit,
    nbEnfants:    parseInt(document.getElementById('fi-enf')?.value)   || 0,
    salaires_mode: document.getElementById('fi-mode')?.value || 'brut',
    salaires_vous: parseFloat(document.getElementById('fi-sal-v')?.value) || 0,
    salaires_conjoint: isMarie ? (parseFloat(document.getElementById('fi-sal-c')?.value) || 0) : 0,
    foncier:      parseFloat(document.getElementById('fi-fonc')?.value)  || 0,
    micro_foncier: parseFloat(document.getElementById('fi-mfonc')?.value) || 0,
    per:          parseFloat(document.getElementById('fi-per')?.value)   || 0,
    pas_vous:     parseFloat(document.getElementById('fi-pas')?.value)    || 0,
    pas_conjoint: parseFloat(document.getElementById('fi-pas-c')?.value)  || 0,
  };
  if (!STATE.fiscal_configs) STATE.fiscal_configs = [];
  const idx = STATE.fiscal_configs.findIndex(x => x.societe_id === societeId);
  if (idx !== -1) STATE.fiscal_configs[idx] = cfg; else STATE.fiscal_configs.push(cfg);
  saveState();
  // Re-render la section résultats uniquement
  const div = document.getElementById('fi-resultats');
  if (div) {
    const soc = (STATE.societes || []).find(s => s.id === societeId);
    if (soc) div.innerHTML = renderFiscalResultats(soc);
  }
}

function _buildIRParams(cfg, bnc) {
  return {
    annee: new Date().getFullYear() - 1,
    situation: cfg.situation || 'celibataire',
    nbEnfants: cfg.nbEnfants || 0,
    salaires_mode: cfg.salaires_mode || 'brut',
    salaires_vous: cfg.salaires_vous || 0,
    salaires_conjoint: cfg.salaires_conjoint || 0,
    bic_bnc: bnc,
    foncier: cfg.foncier || 0, micro_foncier: cfg.micro_foncier || 0,
    dividendes_bareme: 0, dividendes_pfu: 0, pv_bareme: 0, pv_pfu: 0, autres: 0,
    per: cfg.per || 0,
    dons: 0, scol_college: 0, scol_lycee: 0, scol_superieur: 0,
    garde_enfants: 0, emploi_domicile: 0, formation: 0, autres_credits: 0,
    pas_vous: cfg.pas_vous || 0, pas_conjoint: cfg.pas_conjoint || 0,
    pas_preleve: (cfg.pas_vous || 0) + (cfg.pas_conjoint || 0),
  };
}

function calcScenariosIR(assiette, cfg) {
  return SCENARIOS_CSG.map(s => {
    const csgMontant = Math.round(assiette * s.taux);
    // IR calculé sur l'assiette PLEINE — la CSG déductible (6,8%) s'applique l'année N+1, pas N
    const ir         = calcIR(_buildIRParams(cfg, assiette));
    const totalTaxes = csgMontant + ir.impotFinal;
    const netImpot   = assiette - totalTaxes;
    const tauxEff    = assiette > 0 ? (totalTaxes / assiette * 100).toFixed(1) : '—';
    const pctNet     = assiette > 0 ? (netImpot   / assiette * 100).toFixed(1) : '—';
    return { ...s, csgMontant, ir, totalTaxes, netImpot, tauxEff, pctNet };
  });
}

function renderFiscalResultats(soc) {
  const cfg          = getBilanIRConfig(soc.id);
  const totDepsHT    = calcDepensesAnnee(soc.id, _bilanAnnee).totalHT;
  const assietteCour = Math.max(0, calcAssietteCourante(soc.id)      - totDepsHT);
  const assietteInter= Math.max(0, calcAssietteIntermediaire(soc.id) - totDepsHT);
  const assietteFin  = Math.max(0, calcEncaissementsAnnee(soc.id, _bilanAnnee).caHT - totDepsHT);

  // Pré-calculer les 3 sets pour pouvoir faire les deltas
  const scenCour  = assietteCour  > 0 ? calcScenariosIR(assietteCour,  cfg) : null;
  const scenInter = assietteInter > 0 ? calcScenariosIR(assietteInter, cfg) : null;
  const scenFin   = assietteFin   > 0 ? calcScenariosIR(assietteFin,   cfg) : null;

  // Bloc delta : comparaison scénario par scénario vs une base
  const renderDelta = (scenComp, scenBase, assietteComp, assietteBase, label = 'Gain vs assiette courante') => {
    if (!scenComp || !scenBase) return '';
    const dBNC = assietteComp - assietteBase;
    return `
    <div class="mt-4 pt-4 border-t border-slate-600">
      <div class="flex items-baseline gap-3 mb-3">
        <span class="text-xs text-slate-500 uppercase tracking-wide">${label}</span>
        <span class="text-xs text-slate-400">Δ BNC brut : <span class="${dBNC >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</span></span>
      </div>
      <div class="grid grid-cols-3 gap-4">
        ${scenComp.map((s, i) => {
          const base = scenBase[i];
          // Delta IR seul (resteAPayer plafonné à 0 si remboursement)
          const dIR  = Math.max(0, s.ir.resteAPayer)    - Math.max(0, base.ir.resteAPayer);
          // Delta CSG/CRDS séparé
          const dCSG = s.csgMontant - base.csgMontant;
          const dNet = s.netImpot   - base.netImpot;
          const highlight = i === 1;
          return `
          <div class="rounded-lg border ${highlight ? 'border-blue-700/40 bg-blue-950/10' : 'border-slate-700/60 bg-slate-800/40'} px-3 py-2 text-xs">
            <div class="text-slate-500 mb-2 font-medium">${s.label}</div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-500">Δ BNC brut</span>
              <span class="${dBNC >= 0 ? 'text-slate-300' : 'text-red-400'} font-medium">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</span>
            </div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-500">Δ IR (solde)</span>
              <span class="${dIR >= 0 ? 'text-red-400' : 'text-emerald-400'} font-medium">${dIR >= 0 ? '+' : ''}${fmtE(dIR)}</span>
            </div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-500">Δ CSG/CRDS</span>
              <span class="${dCSG > 0 ? 'text-red-400' : 'text-slate-600'} font-medium">${dCSG > 0 ? '+' + fmtE(dCSG) : '—'}</span>
            </div>
            <div class="flex justify-between border-t border-slate-700/60 pt-1.5 mt-1">
              <span class="text-slate-300 font-semibold">Δ Net d'impôt</span>
              <span class="${dNet >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold text-sm">${dNet >= 0 ? '+' : ''}${fmtE(dNet)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  const renderBloc = (assiette, titreAssiette, scenarios, deltaHtml = '') => {
    if (assiette <= 0 || !scenarios) return `
    <div class="mb-6">
      <h4 class="text-xs text-slate-500 uppercase tracking-wide mb-2">${titreAssiette}</h4>
      <p class="text-slate-600 text-sm">Assiette nulle ou négative — pas de simulation.</p>
    </div>`;

    return `
    <div class="mb-8">
      <div class="flex items-baseline gap-3 mb-4">
        <h4 class="text-xs text-slate-400 uppercase tracking-wide">${titreAssiette}</h4>
        <span class="text-white font-bold text-lg">${fmtE(assiette)}</span>
      </div>
      <div class="grid grid-cols-3 gap-4">
        ${scenarios.map((s, i) => {
          const highlight = i === 1;
          const pas = (cfg.pas_vous || 0) + (cfg.pas_conjoint || 0);
          const irAPayer           = s.ir.resteAPayer;
          const totalAProvisionner = s.csgMontant + Math.max(0, irAPayer);

          return `
          <div class="rounded-xl border p-4 ${highlight ? 'border-blue-600/60 bg-blue-950/20' : 'border-slate-700 bg-slate-800/60'}">
            <div class="font-semibold text-sm mb-0.5 ${highlight ? 'text-blue-300' : 'text-white'}">${s.label}</div>
            <div class="text-slate-600 text-xs mb-4">${s.note}</div>

            <!-- Décomposition -->
            <div class="space-y-1.5 text-xs">

              <!-- CSG/CRDS SASU -->
              <div class="flex justify-between">
                <span class="text-slate-500">CSG / CRDS (SASU)</span>
                <span class="${s.csgMontant > 0 ? 'text-red-400' : 'text-slate-600'}">${s.csgMontant > 0 ? '− ' + fmtE(s.csgMontant) : '—'}</span>
              </div>
              <div class="pl-3 text-xs leading-4 mb-1 ${s.id === 's97' ? 'text-slate-600' : 'invisible'}">
                6,8 % CSG déductible de votre IR <em>N+1</em> (non pris en compte ici)
              </div>

              <!-- Base IR -->
              <div class="flex justify-between border-t border-slate-700/60 pt-1.5 mt-1">
                <span class="text-slate-500">BNC déclaré</span>
                <span class="text-slate-300">${fmtE(assiette)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Revenu net global du foyer</span>
                <span class="text-slate-300">${fmtE(s.ir.revenuImposable)}</span>
              </div>

              <!-- IR brut → net -->
              <div class="flex justify-between border-t border-slate-700/60 pt-1.5 mt-1">
                <span class="text-slate-500">IR brut (barème progressif)</span>
                <span class="text-slate-300">${fmtE(s.ir.impotBrut)}</span>
              </div>
              ${s.ir.decote > 0 ? `<div class="flex justify-between pl-3">
                <span class="text-slate-600">Décote</span>
                <span class="text-emerald-700">− ${fmtE(s.ir.decote)}</span>
              </div>` : ''}
              ${s.ir.totalReductions + s.ir.totalCredits > 0 ? `<div class="flex justify-between pl-3">
                <span class="text-slate-600">Réductions & crédits</span>
                <span class="text-emerald-700">− ${fmtE(s.ir.totalReductions + s.ir.totalCredits)}</span>
              </div>` : ''}
              ${s.ir.totalPS > 0 ? `<div class="flex justify-between">
                <span class="text-slate-500">CSG/PS sur revenus fonciers</span>
                <span class="text-red-400">− ${fmtE(s.ir.totalPS)}</span>
              </div>` : ''}

              <!-- PAS déjà versé -->
              ${pas > 0 ? `<div class="flex justify-between border-t border-slate-700/60 pt-1.5 mt-1">
                <span class="text-slate-500">PAS & acomptes déjà versés</span>
                <span class="text-emerald-600">− ${fmtE(pas)}</span>
              </div>` : ''}

              <!-- IR à régler -->
              <div class="flex justify-between ${pas > 0 ? '' : 'border-t border-slate-700/60 pt-1.5 mt-1'}">
                <span class="${irAPayer >= 0 ? 'text-orange-400' : 'text-emerald-400'} font-semibold">
                  ${irAPayer >= 0 ? '⚠ IR à régler (solde déclaration)' : '✓ Remboursement attendu'}
                </span>
                <span class="${irAPayer >= 0 ? 'text-orange-400' : 'text-emerald-400'} font-semibold">${fmtE(Math.abs(irAPayer))}</span>
              </div>

              <!-- Info taux -->
              <div class="flex justify-between pt-0.5 text-slate-600">
                <span>TMI / Taux moyen IR</span>
                <span>${s.ir.txMarginal}% / ${s.ir.txMoyen}%</span>
              </div>
            </div>

            <!-- Provision à constituer -->
            <div class="mt-3 bg-slate-700/40 rounded-lg px-3 py-2 space-y-1 text-xs">
              <div class="text-slate-400 font-medium mb-1">💰 À provisionner</div>
              <div class="flex justify-between">
                <span class="text-slate-500">CSG/CRDS SASU</span>
                <span class="${s.csgMontant > 0 ? 'text-red-400' : 'text-slate-600'}">${s.csgMontant > 0 ? fmtE(s.csgMontant) : '—'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Solde IR déclaration</span>
                <span class="${irAPayer >= 0 ? 'text-red-400' : 'text-emerald-500'}">${irAPayer >= 0 ? fmtE(irAPayer) : '− ' + fmtE(Math.abs(irAPayer))}</span>
              </div>
              <div class="flex justify-between font-semibold border-t border-slate-600 pt-1 mt-1">
                <span class="text-white">Total à sortir</span>
                <span class="text-red-300">${fmtE(totalAProvisionner)}</span>
              </div>
            </div>

            <!-- Net -->
            <div class="mt-3 pt-3 border-t-2 ${highlight ? 'border-blue-700' : 'border-slate-600'}">
              <div class="flex justify-between items-end">
                <div>
                  <div class="text-xs text-slate-500 mb-0.5">Net d'impôt</div>
                  <div class="${s.netImpot >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold text-xl">${fmtE(s.netImpot)}</div>
                </div>
                <div class="text-right">
                  <div class="text-slate-600 text-xs">Prélèvements / assiette</div>
                  <div class="text-slate-400 text-sm font-medium">${s.tauxEff}%</div>
                  <div class="text-slate-600 text-xs">Net conservé</div>
                  <div class="${s.netImpot >= 0 ? 'text-emerald-600' : 'text-red-600'} text-sm font-medium">${s.pctNet}%</div>
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="mt-4 flex justify-end">
        <button onclick="openIRFromBilan('${soc.id}', ${assiette})"
          class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
          📊 Voir le détail du calcul IR
        </button>
      </div>
      ${deltaHtml}
    </div>`;
  };

  return `
  ${renderBloc(assietteCour,  '✅ Assiette courante (paiements confirmés)',                     scenCour)}
  <div class="border-t border-slate-700 my-6"></div>
  ${renderBloc(assietteInter, '⏳ Assiette à court terme (confirmés + prévus prochainement)',   scenInter, renderDelta(scenInter, scenCour, assietteInter, assietteCour))}
  <div class="border-t border-slate-700 my-6"></div>
  ${renderBloc(assietteFin,   `📅 Assiette prévisionnelle fin ${_bilanAnnee}`,                  scenFin,
    renderDelta(scenFin, scenCour,  assietteFin, assietteCour,  'Gain vs assiette courante') +
    renderDelta(scenFin, scenInter, assietteFin, assietteInter, 'Gain vs assiette court terme')
  )}`;
}

// ─── SIMULATION FISCALE IS ───────────────────────────────────────────────────

const IS_CONFIG_DEFAULTS = {
  taux_reduit:    0.15,   // 15 % sur la tranche basse
  taux_normal:    0.25,   // 25 % au-delà
  seuil_reduit:   42500,  // seuil en vigueur 2024-2025 (PME CA < 10M€, capital libéré détenu par personnes physiques)
};

function getISConfig(societeId) {
  const saved = (STATE.fiscal_configs || []).find(x => x.societe_id === societeId && x.type === 'is');
  return Object.assign({}, IS_CONFIG_DEFAULTS, saved || {});
}

function saveISConfig(societeId) {
  const cfg = {
    societe_id:   societeId,
    type:         'is',
    taux_reduit:  parseFloat(document.getElementById('is-taux-reduit')?.value) / 100 || IS_CONFIG_DEFAULTS.taux_reduit,
    taux_normal:  parseFloat(document.getElementById('is-taux-normal')?.value) / 100 || IS_CONFIG_DEFAULTS.taux_normal,
    seuil_reduit: parseFloat(document.getElementById('is-seuil')?.value) || IS_CONFIG_DEFAULTS.seuil_reduit,
  };
  if (!STATE.fiscal_configs) STATE.fiscal_configs = [];
  const idx = STATE.fiscal_configs.findIndex(x => x.societe_id === societeId && x.type === 'is');
  if (idx !== -1) STATE.fiscal_configs[idx] = cfg; else STATE.fiscal_configs.push(cfg);
  saveState();
  const el = document.getElementById('is-resultats');
  const soc = (STATE.societes || []).find(s => s.id === societeId);
  if (el && soc) el.innerHTML = renderISResultats(soc);
}

function calcIS(assiette, cfg) {
  if (assiette <= 0) return { isReduit: 0, isNormal: 0, isTotal: 0, baseReduite: 0, baseNormale: 0 };
  const baseReduite  = Math.min(assiette, cfg.seuil_reduit);
  const baseNormale  = Math.max(0, assiette - cfg.seuil_reduit);
  const isReduit     = Math.round(baseReduite * cfg.taux_reduit);
  const isNormal     = Math.round(baseNormale * cfg.taux_normal);
  const isTotal      = isReduit + isNormal;
  return { isReduit, isNormal, isTotal, baseReduite, baseNormale };
}

function renderISResultats(soc) {
  const cfg        = getISConfig(soc.id);
  const totDepsHT  = calcDepensesAnnee(soc.id, _bilanAnnee).totalHT;
  const assietteCour  = Math.max(0, calcAssietteCourante(soc.id)       - totDepsHT);
  const assietteInter = Math.max(0, calcAssietteIntermediaire(soc.id)  - totDepsHT);
  const assietteFin   = Math.max(0, calcEncaissementsAnnee(soc.id, _bilanAnnee).caHT - totDepsHT);

  // Dépenses de type salaire (label contenant "salaire" ou catégorie 'salaire') — pour info
  const depsSalaires = (getDepenses(soc.id) || [])
    .filter(d => (d.label || '').toLowerCase().includes('salaire') || (d.categorie || '').toLowerCase().includes('salaire'));

  const renderBlocIS = (assiette, titre, compareAssiette = null, compareTitre = null) => {
    const is = calcIS(assiette, cfg);
    const resultatNet = assiette - is.isTotal;
    const txEff = assiette > 0 ? (is.isTotal / assiette * 100).toFixed(1) : '—';

    let deltaHtml = '';
    if (compareAssiette !== null && compareAssiette > 0 && assiette > compareAssiette) {
      const isBase = calcIS(compareAssiette, cfg);
      const dBNC  = assiette - compareAssiette;
      const dIS   = is.isTotal - isBase.isTotal;
      const dNet  = resultatNet - (compareAssiette - isBase.isTotal);
      deltaHtml = `
      <div class="mt-4 pt-4 border-t border-slate-600">
        <div class="flex items-baseline gap-3 mb-3">
          <span class="text-xs text-slate-500 uppercase tracking-wide">Gain vs ${compareTitre}</span>
          <span class="text-xs text-slate-400">Δ Résultat brut : <span class="${dBNC >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</span></span>
        </div>
        <div class="grid grid-cols-3 gap-3 text-xs">
          <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
            <div class="text-slate-500 mb-1.5">Δ Résultat brut</div>
            <div class="text-slate-300 font-medium">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</div>
          </div>
          <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
            <div class="text-slate-500 mb-1.5">Δ IS supplémentaire</div>
            <div class="${dIS >= 0 ? 'text-red-400' : 'text-emerald-400'} font-medium">${dIS >= 0 ? '+' : ''}${fmtE(dIS)}</div>
          </div>
          <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
            <div class="text-slate-500 mb-1.5">Δ Résultat net</div>
            <div class="${dNet >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${dNet >= 0 ? '+' : ''}${fmtE(dNet)}</div>
          </div>
        </div>
      </div>`;
    }

    if (assiette <= 0) return `
    <div class="mb-6">
      <h4 class="text-xs text-slate-500 uppercase tracking-wide mb-2">${titre}</h4>
      <p class="text-slate-600 text-sm">Résultat nul ou négatif — pas d'IS à payer.</p>
    </div>`;

    return `
    <div class="mb-8">
      <div class="flex items-baseline gap-3 mb-4">
        <h4 class="text-xs text-slate-400 uppercase tracking-wide">${titre}</h4>
        <span class="text-white font-bold text-lg">${fmtE(assiette)}</span>
        <span class="text-slate-600 text-xs">résultat fiscal avant IS</span>
      </div>
      <div class="grid grid-cols-2 gap-6">

        <!-- Calcul IS -->
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div class="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">📋 Calcul de l'IS</div>
          <div class="space-y-1.5 text-xs">
            ${is.baseReduite > 0 ? `
            <div class="flex justify-between">
              <span class="text-slate-500">Tranche ${(cfg.taux_reduit * 100).toFixed(0)} % (≤ ${fmtE(cfg.seuil_reduit)})</span>
              <span class="text-slate-300">${fmtE(is.baseReduite)}</span>
            </div>
            <div class="flex justify-between pl-3">
              <span class="text-slate-600">IS taux réduit</span>
              <span class="text-red-400">− ${fmtE(is.isReduit)}</span>
            </div>` : ''}
            ${is.baseNormale > 0 ? `
            <div class="flex justify-between ${is.baseReduite > 0 ? 'border-t border-slate-700/60 pt-1.5 mt-1' : ''}">
              <span class="text-slate-500">Tranche ${(cfg.taux_normal * 100).toFixed(0)} % (> ${fmtE(cfg.seuil_reduit)})</span>
              <span class="text-slate-300">${fmtE(is.baseNormale)}</span>
            </div>
            <div class="flex justify-between pl-3">
              <span class="text-slate-600">IS taux normal</span>
              <span class="text-red-400">− ${fmtE(is.isNormal)}</span>
            </div>` : ''}
            <div class="flex justify-between border-t border-slate-600 pt-2 mt-2 font-semibold">
              <span class="text-white">IS total</span>
              <span class="text-red-300">− ${fmtE(is.isTotal)}</span>
            </div>
            <div class="flex justify-between text-slate-500">
              <span>Taux effectif IS</span>
              <span>${txEff} %</span>
            </div>
          </div>
        </div>

        <!-- Résultat après IS -->
        <div class="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
          <div class="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">💰 Résultat après IS</div>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-500">Résultat fiscal (avant IS)</span>
              <span class="text-slate-300">${fmtE(assiette)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">IS à payer</span>
              <span class="text-red-400">− ${fmtE(is.isTotal)}</span>
            </div>
            <div class="flex justify-between border-t border-emerald-800/40 pt-2 mt-2">
              <span class="text-slate-300 font-semibold">Résultat net société</span>
              <span class="text-emerald-400 font-bold text-lg">${fmtE(resultatNet)}</span>
            </div>
            <div class="mt-3 pt-2 border-t border-slate-700/40 space-y-1">
              <div class="text-slate-600 text-xs mb-1">Affectation du résultat</div>
              <div class="flex justify-between">
                <span class="text-slate-500">Résultat mis en réserve / report</span>
                <span class="text-slate-400">${fmtE(resultatNet)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Salaires versés (charges incluses)</span>
                <span class="text-slate-400">${fmtE(depsSalaires.reduce((s, d) => s + calcDepensesAnnee_single(d, soc.id), 0))}</span>
              </div>
            </div>
            <p class="text-slate-700 text-xs mt-2 italic">Les dividendes seront disponibles après approbation des comptes (N+1). La distribution est à ajouter séparément.</p>
          </div>
        </div>

      </div>
      ${deltaHtml}
    </div>`;
  };

  const deltaIS = (assietteComp, assietteBase, labelBase) => {
    if (!assietteBase || assietteBase <= 0 || assietteComp <= assietteBase) return '';
    const isComp = calcIS(assietteComp, cfg);
    const isBase = calcIS(assietteBase, cfg);
    const dBNC = assietteComp - assietteBase;
    const dIS  = isComp.isTotal - isBase.isTotal;
    const dNet = (assietteComp - isComp.isTotal) - (assietteBase - isBase.isTotal);
    return `
    <div class="mt-4 pt-4 border-t border-slate-600">
      <div class="flex items-baseline gap-3 mb-3">
        <span class="text-xs text-slate-500 uppercase tracking-wide">Gain vs ${labelBase}</span>
        <span class="text-xs text-slate-400">Δ Résultat brut : <span class="${dBNC >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</span></span>
      </div>
      <div class="grid grid-cols-3 gap-3 text-xs">
        <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
          <div class="text-slate-500 mb-1.5">Δ Résultat brut</div>
          <div class="text-slate-300 font-medium">${dBNC >= 0 ? '+' : ''}${fmtE(dBNC)}</div>
        </div>
        <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
          <div class="text-slate-500 mb-1.5">Δ IS supplémentaire</div>
          <div class="${dIS >= 0 ? 'text-red-400' : 'text-emerald-400'} font-medium">${dIS >= 0 ? '+' : ''}${fmtE(dIS)}</div>
        </div>
        <div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2">
          <div class="text-slate-500 mb-1.5">Δ Résultat net</div>
          <div class="${dNet >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${dNet >= 0 ? '+' : ''}${fmtE(dNet)}</div>
        </div>
      </div>
    </div>`;
  };

  return `
  ${renderBlocIS(assietteCour,  '✅ Résultat courant (paiements confirmés)')}
  <div class="border-t border-slate-700 my-6"></div>
  ${renderBlocIS(assietteInter, '⏳ Résultat court terme (confirmés + prévus)', assietteCour, 'assiette courante')}
  <div class="border-t border-slate-700 my-6"></div>
  ${renderBlocIS(assietteFin,   `📅 Résultat prévisionnel fin ${_bilanAnnee}`,  assietteCour, 'assiette courante')}
  ${deltaIS(assietteFin, assietteInter, 'assiette court terme')}`;
}

function calcDepensesAnnee_single(dep, societeId) {
  // Calcule le total annuel d'une seule dépense pour l'année bilan
  return calcDepensesAnnee_dep(dep, _bilanAnnee);
}

function calcDepensesAnnee_dep(dep, annee) {
  let total = 0;
  for (let m = 1; m <= 12; m++) total += calcDepenseMois(dep, annee, m);
  return total;
}

function renderSimuFiscaleIS(soc) {
  if (soc.regime_fiscal !== 'is') return '';
  const cfg = getISConfig(soc.id);

  return `
  <div class="mt-8 pt-6 border-t-2 border-slate-600">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h3 class="text-white font-semibold text-lg">Simulation fiscale — IS</h3>
        <p class="text-slate-500 text-sm mt-0.5">Impôt sur les Sociétés · résultats par assiette</p>
      </div>
      <span class="text-xs px-2 py-1 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">IS</span>
    </div>

    <!-- Paramètres IS -->
    <details class="mb-6 bg-slate-800/40 border border-slate-700 rounded-xl">
      <summary class="px-4 py-3 flex items-center justify-between cursor-pointer">
        <span class="text-sm text-slate-300 font-medium">⚙️ Paramètres IS <span class="text-slate-600 font-normal">(taux et seuil personnalisables)</span></span>
        <span class="chevron text-slate-500 text-xs">▼</span>
      </summary>
      <div class="px-4 pb-4 pt-2 grid grid-cols-3 gap-4">
        <div>
          <label class="label">Taux réduit (%)</label>
          <input id="is-taux-reduit" class="input" type="number" min="0" max="100" step="0.1"
            value="${(cfg.taux_reduit * 100).toFixed(1)}"
            onchange="saveISConfig('${soc.id}')" />
          <p class="text-slate-600 text-xs mt-1">Défaut : 15 %</p>
        </div>
        <div>
          <label class="label">Seuil taux réduit (€)</label>
          <input id="is-seuil" class="input" type="number" min="0" step="500"
            value="${cfg.seuil_reduit}"
            onchange="saveISConfig('${soc.id}')" />
          <p class="text-slate-600 text-xs mt-1">Défaut : 42 500 €</p>
        </div>
        <div>
          <label class="label">Taux normal (%)</label>
          <input id="is-taux-normal" class="input" type="number" min="0" max="100" step="0.1"
            value="${(cfg.taux_normal * 100).toFixed(1)}"
            onchange="saveISConfig('${soc.id}')" />
          <p class="text-slate-600 text-xs mt-1">Défaut : 25 %</p>
        </div>
      </div>
      <div class="px-4 pb-3">
        <p class="text-slate-600 text-xs">⚠️ Le taux réduit 15 % s'applique aux PME dont le CA est inférieur à 10 M€ et dont le capital est intégralement libéré et détenu à 75 % par des personnes physiques.</p>
      </div>
    </details>

    <div id="is-resultats">${renderISResultats(soc)}</div>
  </div>`;
}

function renderSimuFiscale(soc) {
  if (soc.regime_fiscal !== 'ir') return '';
  const cfg = getBilanIRConfig(soc.id);
  const isMarie = cfg.situation === 'marie' || cfg.situation === 'pacse';

  return `
  <div class="mt-8 pt-6 border-t-2 border-slate-600">
    <h3 class="text-white font-bold text-base mb-5">🧮 Simulation fiscale — SASU à l'IR</h3>

    <!-- Paramètres IR -->
    <details class="bg-slate-800/60 border border-slate-700 rounded-xl mb-6" open>
      <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
        <span class="text-slate-300 text-sm font-medium">Paramètres IR personnels <span class="text-slate-600 font-normal">(votre foyer fiscal, hors BNC de la SASU)</span></span>
        <span class="chevron text-slate-500 text-xs">▾</span>
      </summary>
      <div class="px-4 pb-4 pt-3 border-t border-slate-700">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="label">Situation</label>
            <select id="fi-sit" class="input" onchange="saveBilanIRConfig('${soc.id}')">
              ${[['celibataire','Célibataire'],['marie','Marié(e)'],['pacse','Pacsé(e)'],['divorce','Divorcé(e)'],['veuf','Veuf/Veuve']]
                .map(([v,l]) => `<option value="${v}" ${cfg.situation===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">Enfants à charge</label>
            <input id="fi-enf" class="input" type="number" min="0" value="${cfg.nbEnfants}" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">Salaires : mode</label>
            <select id="fi-mode" class="input" onchange="saveBilanIRConfig('${soc.id}')">
              <option value="brut" ${cfg.salaires_mode==='brut'?'selected':''}>Brut</option>
              <option value="net" ${cfg.salaires_mode==='net'?'selected':''}>Net fiscal</option>
            </select>
          </div>
          <div>
            <label class="label">Salaires vous (€)</label>
            <input id="fi-sal-v" class="input" type="number" min="0" value="${cfg.salaires_vous || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div id="fi-sal-c-wrap" ${!isMarie ? 'style="display:none"' : ''}>
            <label class="label">Salaires conjoint (€)</label>
            <input id="fi-sal-c" class="input" type="number" min="0" value="${cfg.salaires_conjoint || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">Revenus fonciers nets (€)</label>
            <input id="fi-fonc" class="input" type="number" min="0" value="${cfg.foncier || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">Micro-foncier brut (€)</label>
            <input id="fi-mfonc" class="input" type="number" min="0" value="${cfg.micro_foncier || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">PER déductible (€)</label>
            <input id="fi-per" class="input" type="number" min="0" value="${cfg.per || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">PAS / acomptes vous (€)</label>
            <input id="fi-pas" class="input" type="number" min="0" value="${cfg.pas_vous || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
          <div>
            <label class="label">PAS / acomptes conjoint (€)</label>
            <input id="fi-pas-c" class="input" type="number" min="0" value="${cfg.pas_conjoint || ''}" placeholder="0" onchange="saveBilanIRConfig('${soc.id}')" />
          </div>
        </div>
        <p class="text-slate-600 text-xs mt-3">Sauvegarde automatique · Le BNC de la SASU est injecté automatiquement depuis votre résultat prévisionnel.</p>
      </div>
    </details>

    <!-- Résultats -->
    <div id="fi-resultats">${renderFiscalResultats(soc)}</div>
  </div>`;
}

function openIRFromBilan(societeId, assiette) {
  const cfg = getBilanIRConfig(societeId);
  // Injecter les paramètres dans _irState
  Object.assign(_irState, {
    annee:            new Date().getFullYear() - 1,
    situation:        cfg.situation        || 'celibataire',
    nbEnfants:        cfg.nbEnfants        || 0,
    salaires_mode:    cfg.salaires_mode    || 'brut',
    salaires_vous:    cfg.salaires_vous    || 0,
    salaires_conjoint:cfg.salaires_conjoint|| 0,
    bic_bnc:          Math.round(assiette),
    foncier:          cfg.foncier          || 0,
    micro_foncier:    cfg.micro_foncier    || 0,
    per:              cfg.per              || 0,
    pas_vous:         cfg.pas_vous         || 0,
    pas_conjoint:     cfg.pas_conjoint     || 0,
    // Réinitialiser les champs non configurés dans le bilan
    dividendes_bareme: 0, dividendes_pfu: 0, pv_bareme: 0, pv_pfu: 0, autres: 0,
    dons: 0, scol_college: 0, scol_lycee: 0, scol_superieur: 0,
    garde_enfants: 0, emploi_domicile: 0, formation: 0, autres_credits: 0,
  });
  _currentSimId = null; // nouvelle simulation non sauvegardée
  navigate('#ir');
}

// ─── DÉPENSES — CRUD ─────────────────────────────────────────────────────────

function openDepenseModal(societeId, depenseId) {
  const dep = depenseId ? (STATE.depenses || []).find(d => d.id === depenseId) : null;
  const now = new Date();
  const v = dep || {
    id: uid(), societe_id: societeId, label: '', montant_ht: '', tva_taux: 0.20,
    categorie: 'logiciel', periodicite: 'mensuelle', actif: true,
    mois_debut: { annee: now.getFullYear(), mois: now.getMonth() + 1 }, mois_fin: null,
  };

  const catsOptions = CATS_DEPENSE.map(c =>
    `<option value="${c.value}" ${v.categorie === c.value ? 'selected' : ''}>${c.label}</option>`
  ).join('');

  const periodOptions = [
    ['mensuelle','Mensuelle'],['trimestrielle','Trimestrielle'],
    ['semestrielle','Semestrielle'],['annuelle','Annuelle'],['ponctuelle','Ponctuelle (1 fois)'],
  ].map(([val, lbl]) => `<option value="${val}" ${v.periodicite === val ? 'selected' : ''}>${lbl}</option>`).join('');

  const isSalaire  = v.categorie === 'salaire';
  const regime     = v.regime_social || 'tns';
  const isTNS      = regime === 'tns';
  const montantVal = v.montant_ht || '';

  document.body.insertAdjacentHTML('beforeend', `
  <div id="dep-modal" class="modal-backdrop" onclick="if(event.target===this)closeDepenseModal()">
    <div class="modal-box">
      <h3 class="text-base font-semibold text-white mb-4">${dep ? 'Modifier' : 'Nouvelle'} dépense</h3>
      <div class="space-y-3">
        <div>
          <label class="label">Catégorie</label>
          <select id="dep-cat" class="input" onchange="_onDepCatChange()">${catsOptions}</select>
        </div>
        <div>
          <label class="label">Libellé *</label>
          <input id="dep-label" class="input" value="${v.label}" placeholder="Ex : Loyer bureau, Abonnement Notion…" />
        </div>

        <!-- Champs standard (masqués si salaire) -->
        <div id="dep-std-fields" class="${isSalaire ? 'hidden' : ''}">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Montant HT (€) *</label>
              <input id="dep-montant" class="input" type="number" min="0" step="0.01" value="${!isSalaire ? montantVal : ''}" placeholder="0" />
            </div>
            <div>
              <label class="label">TVA applicable</label>
              <div class="flex gap-2 mt-1">
                <button id="dep-tva-oui" onclick="document.getElementById('dep-tva-val').value='0.20';document.getElementById('dep-tva-oui').className='flex-1 text-xs py-1.5 rounded bg-blue-600 text-white';document.getElementById('dep-tva-non').className='flex-1 text-xs py-1.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600';"
                  class="flex-1 text-xs py-1.5 rounded ${v.tva_taux > 0 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">20%</button>
                <button id="dep-tva-non" onclick="document.getElementById('dep-tva-val').value='0';document.getElementById('dep-tva-non').className='flex-1 text-xs py-1.5 rounded bg-blue-600 text-white';document.getElementById('dep-tva-oui').className='flex-1 text-xs py-1.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600';"
                  class="flex-1 text-xs py-1.5 rounded ${v.tva_taux === 0 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">Non</button>
              </div>
              <input type="hidden" id="dep-tva-val" value="${v.tva_taux}" />
            </div>
          </div>
        </div>

        <!-- Champs salaire -->
        <div id="dep-salaire-fields" class="${isSalaire ? '' : 'hidden'}">

          <!-- Régime social -->
          <div class="mb-2">
            <label class="label">Régime social</label>
            <div class="flex gap-2">
              <button id="sal-btn-tns" onclick="_setSalaireRegime('tns')"
                class="flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${isTNS ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'}">
                <div class="font-medium">TNS</div>
                <div class="opacity-70 mt-0.5">EURL / SARL gérant maj.</div>
              </button>
              <button id="sal-btn-as" onclick="_setSalaireRegime('assimile_salarie')"
                class="flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${!isTNS ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'}">
                <div class="font-medium">Assimilé-salarié</div>
                <div class="opacity-70 mt-0.5">SASU / SAS dirigeant</div>
              </button>
            </div>
            <input type="hidden" id="sal-regime" value="${regime}" />
          </div>

          <!-- Saisie montant + mode -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" id="sal-montant-label">${isTNS ? 'Rémunération nette mensuelle (€)' : 'Salaire brut mensuel (€)'} *</label>
              <input id="dep-salaire-montant" class="input" type="number" min="0" step="10"
                value="${isSalaire ? montantVal : ''}" placeholder="0"
                oninput="_updateSalairePreview()" />
            </div>
            <div id="sal-mode-wrap" class="${isTNS ? 'hidden' : ''}">
              <label class="label">Je saisis en</label>
              <div class="flex gap-2 mt-1">
                <button id="sal-mode-brut" onclick="_setSalaireMode('brut')"
                  class="flex-1 text-xs py-1.5 rounded ${(v.salaire_mode || 'brut') === 'brut' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">Brut</button>
                <button id="sal-mode-net" onclick="_setSalaireMode('net')"
                  class="flex-1 text-xs py-1.5 rounded ${v.salaire_mode === 'net' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">Net</button>
              </div>
              <input type="hidden" id="sal-mode" value="${v.salaire_mode || 'brut'}" />
            </div>
          </div>

          <!-- Taux -->
          <div id="sal-taux-tns" class="mt-2 ${isTNS ? '' : 'hidden'}">
            <label class="label">Taux cotisations TNS (%)</label>
            <input id="dep-taux-cotis" class="input" type="number" min="0" max="100" step="1"
              value="${((v.taux_cotis ?? SALAIRE_DEFAULTS.tns.taux_cotis) * 100).toFixed(0)}"
              oninput="_updateSalairePreview()" />
            <p class="text-slate-600 text-xs mt-1">Taux appliqué sur la rémunération nette · défaut URSSAF ~45 % (maladie, retraite, AF, CSG/CRDS, formation)</p>
          </div>
          <div id="sal-taux-as" class="grid grid-cols-2 gap-3 mt-2 ${isTNS ? 'hidden' : ''}">
            <div>
              <label class="label">Charges patronales (%)</label>
              <input id="dep-taux-pat" class="input" type="number" min="0" max="100" step="1"
                value="${((v.taux_patronal ?? SALAIRE_DEFAULTS.assimile_salarie.taux_patronal) * 100).toFixed(0)}"
                oninput="_updateSalairePreview()" />
              <p class="text-slate-600 text-xs mt-1">Défaut SASU ~45 % du brut</p>
            </div>
            <div>
              <label class="label">Charges salariales (%)</label>
              <input id="dep-taux-sal" class="input" type="number" min="0" max="100" step="1"
                value="${((v.taux_salarial ?? SALAIRE_DEFAULTS.assimile_salarie.taux_salarial) * 100).toFixed(0)}"
                oninput="_updateSalairePreview()" />
              <p class="text-slate-600 text-xs mt-1">Défaut SASU ~22 % du brut</p>
            </div>
          </div>

          <!-- Preview -->
          <div id="dep-salaire-preview" class="mt-3 p-3 bg-slate-700/40 rounded-lg text-xs space-y-1.5"></div>
          <input type="hidden" id="dep-montant" value="${isSalaire ? montantVal : ''}" />
          <input type="hidden" id="dep-tva-val" value="0" />
        </div>

        <div>
          <label class="label">Périodicité</label>
          <select id="dep-perio" class="input">${periodOptions}</select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Mois de début *</label>
            <input id="dep-debut" class="input" type="month" value="${v.mois_debut ? v.mois_debut.annee+'-'+String(v.mois_debut.mois).padStart(2,'0') : ''}" />
          </div>
          <div>
            <label class="label">Mois de fin (optionnel)</label>
            <input id="dep-fin" class="input" type="month" value="${v.mois_fin ? v.mois_fin.annee+'-'+String(v.mois_fin.mois).padStart(2,'0') : ''}" />
          </div>
        </div>
      </div>
      <div class="flex gap-3 mt-5">
        <button class="btn-primary flex-1" onclick="saveDepense('${v.id}','${societeId}')">Enregistrer</button>
        <button class="btn-secondary" onclick="closeDepenseModal()">Annuler</button>
      </div>
    </div>
  </div>`);
  if (isSalaire) _updateSalairePreview();
}

function _onDepCatChange() {
  const isSal = document.getElementById('dep-cat').value === 'salaire';
  document.getElementById('dep-std-fields').classList.toggle('hidden', isSal);
  document.getElementById('dep-salaire-fields').classList.toggle('hidden', !isSal);
  if (isSal) { _setSalaireRegime(document.getElementById('sal-regime')?.value || 'tns'); _updateSalairePreview(); }
}

function _setSalaireRegime(regime) {
  document.getElementById('sal-regime').value = regime;
  const isTNS = regime === 'tns';
  document.getElementById('sal-btn-tns').className = `flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${isTNS ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'}`;
  document.getElementById('sal-btn-as').className  = `flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${!isTNS ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'}`;
  document.getElementById('sal-taux-tns').classList.toggle('hidden', !isTNS);
  document.getElementById('sal-taux-as').classList.toggle('hidden', isTNS);
  document.getElementById('sal-mode-wrap').classList.toggle('hidden', isTNS);
  document.getElementById('sal-montant-label').textContent = (isTNS ? 'Rémunération nette mensuelle (€)' : 'Salaire mensuel (€)') + ' *';
  _updateSalairePreview();
}

function _setSalaireMode(mode) {
  document.getElementById('sal-mode').value = mode;
  document.getElementById('sal-mode-brut').className = `flex-1 text-xs py-1.5 rounded ${mode === 'brut' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`;
  document.getElementById('sal-mode-net').className  = `flex-1 text-xs py-1.5 rounded ${mode === 'net'  ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`;
  _updateSalairePreview();
}

function _updateSalairePreview() {
  const regime = document.getElementById('sal-regime')?.value || 'tns';
  const isTNS  = regime === 'tns';
  const saisi  = parseFloat(document.getElementById('dep-salaire-montant')?.value) || 0;
  const mode   = document.getElementById('sal-mode')?.value || 'brut';

  let brut, net, cout, cotisLabel, cotisVal;

  if (isTNS) {
    const taux = (parseFloat(document.getElementById('dep-taux-cotis')?.value) || 45) / 100;
    net  = saisi;  // TNS : on saisit toujours le net (rémunération)
    brut = net;    // pas de notion de brut/net différents pour TNS
    cout = Math.round(net * (1 + taux));
    cotisLabel = 'Cotisations TNS (URSSAF)';
    cotisVal   = cout - net;
    document.getElementById('dep-montant').value = net;
  } else {
    const pat = (parseFloat(document.getElementById('dep-taux-pat')?.value) || 45) / 100;
    const sal = (parseFloat(document.getElementById('dep-taux-sal')?.value) || 22) / 100;
    if (mode === 'net') {
      net  = saisi;
      brut = sal > 0 ? Math.round(net / (1 - sal)) : net; // back-calcul brut depuis net
    } else {
      brut = saisi;
      net  = Math.round(brut * (1 - sal));
    }
    cout = Math.round(brut * (1 + pat));
    cotisLabel = 'Charges patronales';
    cotisVal   = cout - brut;
    document.getElementById('dep-montant').value = brut; // on stocke toujours le brut
  }

  const prev = document.getElementById('dep-salaire-preview');
  if (!prev) return;
  prev.innerHTML = isTNS ? `
    <div class="flex justify-between"><span class="text-slate-500">Rémunération nette</span><span class="text-emerald-400 font-semibold">${net > 0 ? fmtE(net) : '—'}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">${cotisLabel}</span><span class="text-red-400">${cotisVal > 0 ? '+ ' + fmtE(cotisVal) : '—'}</span></div>
    <div class="flex justify-between font-semibold border-t border-slate-600 pt-1.5 mt-1"><span class="text-white">Coût total EURL/mois</span><span class="text-red-300">${cout > 0 ? fmtE(cout) : '—'}</span></div>
  ` : `
    <div class="flex justify-between"><span class="text-slate-500">Salaire brut</span><span class="text-slate-300">${brut > 0 ? fmtE(brut) : '—'}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">${cotisLabel}</span><span class="text-red-400">${cotisVal > 0 ? '+ ' + fmtE(cotisVal) : '—'}</span></div>
    <div class="flex justify-between font-semibold border-t border-slate-600 pt-1.5 mt-1"><span class="text-white">Coût total société/mois</span><span class="text-red-300">${cout > 0 ? fmtE(cout) : '—'}</span></div>
    <div class="flex justify-between border-t border-slate-700 pt-1.5 mt-1"><span class="text-slate-500">Net perçu</span><span class="text-emerald-400 font-semibold">${net > 0 ? fmtE(net) : '—'}</span></div>
  `;
}

function closeDepenseModal() { document.getElementById('dep-modal')?.remove(); }

function _parseMonth(val) {
  if (!val) return null;
  const [a, m] = val.split('-');
  return { annee: parseInt(a), mois: parseInt(m) };
}

function saveDepense(id, societeId) {
  const label   = document.getElementById('dep-label').value.trim();
  const montant = parseFloat(document.getElementById('dep-montant').value);
  if (!label) return alert('Le libellé est obligatoire.');
  if (!montant || montant <= 0) return alert('Le montant doit être supérieur à 0.');
  const debut = _parseMonth(document.getElementById('dep-debut').value);
  if (!debut) return alert('Le mois de début est obligatoire.');

  const categorie = document.getElementById('dep-cat').value;
  const data = {
    id, societe_id: societeId,
    label, montant_ht: montant,
    tva_taux:    parseFloat(document.getElementById('dep-tva-val').value) || 0,
    categorie,
    periodicite: document.getElementById('dep-perio').value,
    mois_debut:  debut,
    mois_fin:    _parseMonth(document.getElementById('dep-fin').value),
    actif: true,
    // Champs spécifiques salaire
    ...(categorie === 'salaire' ? (() => {
      const regime = document.getElementById('sal-regime')?.value || 'tns';
      if (regime === 'tns') return {
        regime_social: 'tns',
        taux_cotis: (parseFloat(document.getElementById('dep-taux-cotis')?.value) || 45) / 100,
      };
      return {
        regime_social: 'assimile_salarie',
        salaire_mode:  document.getElementById('sal-mode')?.value || 'brut',
        taux_patronal: (parseFloat(document.getElementById('dep-taux-pat')?.value) || 45) / 100,
        taux_salarial: (parseFloat(document.getElementById('dep-taux-sal')?.value) || 22) / 100,
      };
    })() : {}),
  };

  if (!STATE.depenses) STATE.depenses = [];
  const idx = STATE.depenses.findIndex(d => d.id === id);
  if (idx !== -1) STATE.depenses[idx] = data;
  else STATE.depenses.push(data);

  saveState();
  closeDepenseModal();
  _socTab = 'bilan';
  renderSocieteDetail(document.getElementById('app'), societeId);
}

function deleteDepense(id, societeId) {
  if (!confirm('Supprimer cette dépense ?')) return;
  STATE.depenses = (STATE.depenses || []).filter(d => d.id !== id);
  saveState();
  renderSocieteDetail(document.getElementById('app'), societeId);
}

// ─── BARÈMES PAR ANNÉE DE REVENUS ────────────────────────────────────────────
// Chaque entrée correspond à une année de revenus (ex: 2024 = revenus déclarés en 2025).
// Ajouter une entrée ici suffit pour supporter une nouvelle année.

const BAREMES = {
  2024: {
    label: 'Revenus 2024 — déclaration 2025',
    tranches: [
      { min: 0,      max: 11497,   taux: 0    },
      { min: 11497,  max: 29315,   taux: 0.11 },
      { min: 29315,  max: 83823,   taux: 0.30 },
      { min: 83823,  max: 180294,  taux: 0.41 },
      { min: 180294, max: Infinity, taux: 0.45 },
    ],
    plafond_demi_part:  1791,
    abatt_sal_min:      495,
    abatt_sal_max:      14171,
    decote_cel_seuil:   1929,  decote_cel_base:  873,
    decote_cpl_seuil:   3191,  decote_cpl_base:  1444,
    decote_taux:        0.4525,
    cehr_cel_s1: 250000, cehr_cel_s2: 500000,
    cehr_cpl_s1: 500000, cehr_cpl_s2: 1000000,
  },
  2025: {
    label: 'Revenus 2025 — déclaration 2026',
    tranches: [
      { min: 0,      max: 11600,   taux: 0    },
      { min: 11600,  max: 29579,   taux: 0.11 },
      { min: 29579,  max: 84577,   taux: 0.30 },
      { min: 84577,  max: 181917,  taux: 0.41 },
      { min: 181917, max: Infinity, taux: 0.45 },
    ],
    // Plafond avantage QF : 1 807€/demi-part (source service-public.fr 2025)
    plafond_demi_part:  1807,
    // Abattement 10% salaires : min 504€, max 14 555€ (confirmé sur simulateur officiel)
    abatt_sal_min:      504,
    abatt_sal_max:      14555,
    decote_cel_seuil:   1982,  decote_cel_base:  897,
    decote_cpl_seuil:   3275,  decote_cpl_base:  1483,
    decote_taux:        0.4525,
    cehr_cel_s1: 250000, cehr_cel_s2: 500000,
    cehr_cpl_s1: 500000, cehr_cpl_s2: 1000000,
  },
};

function calcParts(situation, nbEnfants) {
  let parts = situation === 'marie' ? 2 : 1;
  const enfants = Math.max(0, Math.floor(nbEnfants));
  if (enfants >= 1) parts += 0.5;
  if (enfants >= 2) parts += 0.5;
  if (enfants >= 3) parts += (enfants - 2) * 1;
  return parts;
}

function calcImpotBareme(revenuImposable, tranches) {
  let impot = 0;
  const detail = [];
  for (const t of tranches) {
    if (revenuImposable <= t.min) break;
    const base = Math.min(revenuImposable, t.max) - t.min;
    const montant = base * t.taux;
    detail.push({ taux: t.taux, base: Math.round(base), montant: Math.round(montant) });
    impot += montant;
  }
  return { impot: Math.round(impot), detail };
}

function calcIR(params) {
  const {
    annee             = 2025,
    situation         = 'celibataire',
    nbEnfants         = 0,
    salaires_mode     = 'brut',
    salaires_vous     = 0,
    salaires_conjoint = 0,
    bic_bnc           = 0,
    foncier           = 0,
    micro_foncier     = 0,
    dividendes_bareme = 0,
    dividendes_pfu    = 0,
    pv_bareme         = 0,
    pv_pfu            = 0,
    autres            = 0,
    // Déductions
    per               = 0,
    // Réductions
    dons              = 0,
    scol_college      = 0,
    scol_lycee        = 0,
    scol_superieur    = 0,
    // Crédits
    garde_enfants     = 0,
    emploi_domicile   = 0,
    formation         = 0,
    autres_credits    = 0,
    // PAS
    pas_preleve       = 0,
  } = params;

  const b = BAREMES[annee] || BAREMES[2025];

  const salaires = salaires_vous + salaires_conjoint;

  // 1. Abattement 10% — appliqué PAR PERSONNE (le minimum 504€ est individuel)
  function _abatt10(sal) {
    if (salaires_mode === 'net' || !sal || sal <= 0) return 0;
    return Math.min(Math.max(sal * 0.10, b.abatt_sal_min), b.abatt_sal_max);
  }
  const abatt10_vous     = _abatt10(salaires_vous);
  const abatt10_conjoint = _abatt10(salaires_conjoint);
  const abatt10          = abatt10_vous + abatt10_conjoint;
  const salairesNet      = Math.max(0, salaires - abatt10);

  // 2. Abattement 40% sur dividendes option barème
  const abatt40 = dividendes_bareme * 0.40;
  const dividendesBaremeNet = dividendes_bareme * 0.60;

  // 2b. Micro-foncier : abattement 30% sur recettes brutes (régime si total brut ≤ 15 000€)
  const abattMicroFoncier = Math.round(micro_foncier * 0.30);
  const microFoncierNet   = micro_foncier - abattMicroFoncier;

  // 3. Revenu net global (avant déductions spécifiques)
  const revenuNetGlobal = salairesNet + bic_bnc + foncier + microFoncierNet + dividendesBaremeNet + pv_bareme + autres;

  // 3b. Déduction PER (réduit le revenu imposable, dans la limite du revenu global)
  const deductionPER   = Math.min(Math.max(0, per), revenuNetGlobal);
  const revenuImposable = Math.max(0, revenuNetGlobal - deductionPER);

  // 4. Quotient familial
  const nbParts   = calcParts(situation, nbEnfants);
  const baseParts = situation === 'marie' ? 2 : 1;

  // 5. Impôt base (sans enfants) — sur revenu après déduction PER
  const impotBase_raw = calcImpotBareme(revenuImposable / baseParts, b.tranches);
  const impotBase     = impotBase_raw.impot * baseParts;

  // 6. Impôt avec QF complet (avec enfants)
  const impotAvecQF_raw = calcImpotBareme(revenuImposable / nbParts, b.tranches);
  const impotAvecQF     = impotAvecQF_raw.impot * nbParts;

  // 7. Plafonnement QF
  const demiPartsSupp   = (nbParts - baseParts) * 2;
  const avantageQF      = Math.max(0, impotBase - impotAvecQF);
  const plafondAvantage = b.plafond_demi_part * demiPartsSupp;
  const avantageReel    = demiPartsSupp > 0 ? Math.min(avantageQF, plafondAvantage) : 0;
  const impotBrut       = Math.round(impotBase - avantageReel);

  // Détail tranches — affiché sur nbParts (QF réel de l'utilisateur)
  // Le plafonnement QF est montré séparément comme correction
  const detailTranches = impotAvecQF_raw.detail.map(t => ({
    ...t,
    base:    Math.round(t.base * nbParts),
    montant: Math.round(t.montant * nbParts),
  }));
  const impotQFBrut = impotAvecQF; // avant correction plafonnement
  const correctionPlafond = demiPartsSupp > 0 && avantageQF > plafondAvantage
    ? Math.round(avantageQF - plafondAvantage) // montant récupéré par le plafonnement
    : 0;

  // 8. Décote
  let decote = 0;
  if (situation === 'marie') {
    if (impotBrut < b.decote_cpl_seuil)
      decote = Math.max(0, Math.round(b.decote_cpl_base - b.decote_taux * impotBrut));
  } else {
    if (impotBrut < b.decote_cel_seuil)
      decote = Math.max(0, Math.round(b.decote_cel_base - b.decote_taux * impotBrut));
  }
  const impotNet = Math.max(0, impotBrut - decote);

  // 9. CEHR — sur revenu fiscal de référence (revenuNetGlobal SANS déduction PER, car le PER réduit l'IR mais pas le RFR)
  const rfr = revenuNetGlobal + dividendes_pfu + pv_pfu;
  let cehr = 0;
  if (situation === 'marie') {
    if (rfr > b.cehr_cpl_s2)      cehr = (rfr - b.cehr_cpl_s2) * 0.04 + (b.cehr_cpl_s2 - b.cehr_cpl_s1) * 0.03;
    else if (rfr > b.cehr_cpl_s1) cehr = (rfr - b.cehr_cpl_s1) * 0.03;
  } else {
    if (rfr > b.cehr_cel_s2)      cehr = (rfr - b.cehr_cel_s2) * 0.04 + (b.cehr_cel_s2 - b.cehr_cel_s1) * 0.03;
    else if (rfr > b.cehr_cel_s1) cehr = (rfr - b.cehr_cel_s1) * 0.03;
  }
  cehr = Math.round(cehr);

  // 10. Prélèvements sociaux 17,2% sur revenus fonciers (hors PFU qui les inclut déjà)
  // S'appliquent sur le revenu NET : régime réel → foncier directement, micro-foncier → après abatt. 30%
  const psFoncier      = Math.round((foncier + microFoncierNet) * 0.172);
  // Détail CSG/CRDS/PS pour affichage
  const psFoncierCSG   = Math.round((foncier + microFoncierNet) * 0.092);  // CSG 9,2%
  const psFoncierCRDS  = Math.round((foncier + microFoncierNet) * 0.005);  // CRDS 0,5%
  const psFoncierSol   = Math.round((foncier + microFoncierNet) * 0.075);  // Prél. solidarité 7,5%

  // Prélèvements sociaux sur dividendes barème (17,2% du brut, l'abatt. 40% ne s'applique pas aux PS)
  const psDivBareme    = Math.round(dividendes_bareme * 0.172);

  // 11. PFU 30% (12,8% IR + 17,2% PS) — les PS sont déjà inclus dans le PFU
  const pfuDiv   = Math.round(dividendes_pfu * 0.30);
  const pfuDivIR = Math.round(dividendes_pfu * 0.128);
  const pfuDivPS = Math.round(dividendes_pfu * 0.172);
  const pfuPV    = Math.round(pv_pfu * 0.30);
  const pfuPVIR  = Math.round(pv_pfu * 0.128);
  const pfuPVPS  = Math.round(pv_pfu * 0.172);

  const totalPFU    = pfuDiv + pfuPV;
  const totalPS     = psFoncier + psDivBareme; // PS hors PFU (PFU inclut déjà ses PS)

  // Taux marginal (sur revenu imposable après PER)
  let txMarginal = 0;
  for (let i = b.tranches.length - 1; i >= 0; i--) {
    if ((revenuImposable / nbParts) > b.tranches[i].min) {
      txMarginal = b.tranches[i].taux * 100;
      break;
    }
  }

  // ── RÉDUCTIONS D'IMPÔT (non remboursables) ──────────────────────────────────

  // Dons associations : 66% dans la limite de 20% du revenu imposable
  const donsEffectifs   = Math.min(dons, revenuImposable * 0.20);
  const reductionDons   = Math.round(donsEffectifs * 0.66);
  // Scolarité enfants
  const reductionScol   = scol_college * 61 + scol_lycee * 153 + scol_superieur * 183;
  const totalReductions = reductionDons + reductionScol;

  // Impôt barème net après réductions (plancher 0)
  const impotApresReductions = Math.max(0, impotNet + cehr - totalReductions);

  // ── CRÉDITS D'IMPÔT (remboursables) ─────────────────────────────────────────

  // Garde enfants < 6 ans : crédit 50%, plafond 3 500€/enfant (soit crédit max 1 750€/enfant)
  // Plafond du CRÉDIT : 1 750€/enfant (= 50% × 3 500€ de dépenses max/enfant)
  const plafondGarde  = 1750 * Math.max(1, Math.floor(nbEnfants));
  const creditGarde   = Math.min(Math.round(garde_enfants * 0.50), plafondGarde);

  // Emploi à domicile : crédit 50%, plafond dépenses 12 000€ (crédit max 6 000€)
  const creditDomicile = Math.min(Math.round(emploi_domicile * 0.50), 6000);

  // Formation dirigeant : crédit = montant formation (max = SMIC horaire × nb heures,
  //   mais on laisse l'utilisateur entrer le montant du crédit directement)
  const creditFormation = Math.max(0, Math.round(formation));

  // Autres crédits libres
  const creditAutres = Math.max(0, Math.round(autres_credits));

  const totalCredits = creditGarde + creditDomicile + creditFormation + creditAutres;

  // ── SYNTHÈSE FINALE ─────────────────────────────────────────────────────────

  // Impôt IR total = impôt barème net après réductions + PFU - crédits
  // Note : les crédits peuvent générer un remboursement (si > impôt restant dû)
  const impotIRNetCredits  = impotApresReductions - totalCredits;
  const impotTotalBrut     = impotApresReductions + totalPFU; // avant crédits
  const impotTotalNetCredits = impotTotalBrut - totalCredits;

  const remboursementCredits = totalCredits > impotApresReductions
    ? totalCredits - impotApresReductions : 0;

  // Reste à payer = total dû - PAS déjà prélevé (peut être négatif → remboursement)
  // Note : les PS fonciers sont dus séparément (avis d'imposition distinct) mais on les inclut dans le total
  const impotFinal  = Math.max(0, impotIRNetCredits) + totalPFU + totalPS;
  const resteAPayer = impotFinal - pas_preleve;
  const remboursementPAS = resteAPayer < 0 ? Math.abs(resteAPayer) : 0;

  const revenuTotal = salaires + bic_bnc + foncier + micro_foncier + dividendes_bareme + dividendes_pfu + pv_bareme + pv_pfu + autres;
  const txMoyen     = revenuTotal > 0 ? (impotFinal / revenuTotal) * 100 : 0;

  return {
    // Inputs recap
    salaires, salairesNet, abatt10, abatt10_vous, abatt10_conjoint, abatt40, dividendesBaremeNet,
    abattMicroFoncier, microFoncierNet,
    revenuNetGlobal, revenuImposable, deductionPER, rfr, nbParts, baseParts,
    // Barème
    detailTranches, impotBase, impotQFBrut, correctionPlafond,
    avantageQF, avantageReel, plafondAvantage,
    impotBrut, decote, impotNet, cehr,
    // Réductions
    donsEffectifs, reductionDons, reductionScol, totalReductions,
    impotApresReductions,
    // Crédits
    creditGarde, creditDomicile, creditFormation, creditAutres, totalCredits,
    remboursementCredits,
    // Prélèvements sociaux hors PFU
    psFoncier, psFoncierCSG, psFoncierCRDS, psFoncierSol,
    psDivBareme, totalPS,
    // PFU
    pfuDiv, pfuDivIR, pfuDivPS,
    pfuPV,  pfuPVIR, pfuPVPS,
    totalPFU,
    // Totaux
    impotFinal, totalImpots: impotFinal,
    resteAPayer, remboursementPAS,
    txMoyen: Math.round(txMoyen * 100) / 100,
    txMarginal,
  };
}

// ─── SIMULATEUR IR — VUE ─────────────────────────────────────────────────────

let _irState = {
  annee:              2025,
  situation:          'celibataire',
  nbEnfants:          0,
  salaires_mode:      'brut',
  // Revenus
  salaires_vous:      0,
  salaires_conjoint:  0,
  bic_bnc:            0,
  foncier:            0,
  micro_foncier:      0,
  dividendes_bareme:  0,
  dividendes_pfu:     0,
  pv_bareme:          0,
  pv_pfu:             0,
  autres:             0,
  // Déductions du revenu imposable
  per:                0,   // versements PER déductibles
  // Réductions d'impôt (non remboursables)
  dons:               0,   // dons aux associations (réduction 66%)
  scol_college:       0,   // nb enfants au collège (réduction 61€/enfant)
  scol_lycee:         0,   // nb enfants au lycée (réduction 153€/enfant)
  scol_superieur:     0,   // nb enfants dans le supérieur (réduction 183€/enfant)
  // Crédits d'impôt (remboursables)
  garde_enfants:      0,   // frais garde enfants < 6 ans (crédit 50%, max 3 500€/enfant)
  emploi_domicile:    0,   // frais emploi à domicile (crédit 50%, max 12 000€)
  formation:          0,   // crédit impôt formation dirigeant
  autres_credits:     0,   // autres crédits d'impôt
  // Prélèvements déjà effectués
  pas_vous:           0,   // PAS prélevé sur le déclarant (retenues + acomptes)
  pas_conjoint:       0,   // PAS prélevé sur le conjoint
};

// Convertit _irState (champs UI) en paramètres pour calcIR
function getIRParams() {
  const s = _irState;
  return {
    ...s,
    // salaires_vous et salaires_conjoint sont déjà dans _irState
    // calcIR applique l'abattement 10% par personne
    pas_preleve: (s.pas_vous || 0) + (s.pas_conjoint || 0),
  };
}

function renderSimulateurIR(app, simId) {
  app.innerHTML = `
  ${navBar('ir')}
  <div class="page-container px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-bold text-white">Simulateur IR</h1>
        <p class="text-slate-400 text-sm mt-0.5" id="ir-subtitle">${BAREMES[_irState.annee]?.label || ''}</p>
        <p class="text-blue-400 text-xs mt-0.5" id="ir-simname">${_currentSimId ? (() => { const s = lsGetSimulations().find(x => x.id === _currentSimId); return s ? '📂 ' + s.nom : ''; })() : ''}</p>
      </div>
      <div class="flex gap-2 items-center">
        <button onclick="openSimulationsIR()" class="btn-secondary text-sm">📂 Mes simulations</button>
        <div id="ir-save-btns" class="flex gap-2">
          ${_currentSimId
            ? `<button id="btn-update-ir" onclick="updateSimulationIR()" class="btn-primary text-sm">💾 Mettre à jour</button>
               <button id="btn-save-ir"   onclick="saveSimulationIR()"   class="btn-secondary text-sm">+ Nouvelle copie</button>`
            : `<button id="btn-save-ir" onclick="saveSimulationIR()" class="btn-primary text-sm">💾 Sauvegarder</button>`}
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <!-- Formulaire -->
      <div class="lg:col-span-2 space-y-4" id="ir-form">
        ${renderIRForm()}
      </div>
      <!-- Résultats -->
      <div class="lg:col-span-3" id="ir-results">
        ${renderIRResults()}
      </div>
    </div>
  </div>`;
}

function irBlock(title, content, { open = false, borderClass = 'border-slate-700' } = {}) {
  return `
  <details class="bg-slate-800 rounded-xl border ${borderClass}" ${open ? 'open' : ''}>
    <summary class="flex items-center justify-between px-4 py-3">
      <span class="font-semibold text-white text-sm">${title}</span>
      <span class="chevron text-slate-400 text-xs">▾</span>
    </summary>
    <div class="px-4 pb-4 space-y-3 border-t border-slate-700/60 pt-3">
      ${content}
    </div>
  </details>`;
}

function renderIRForm() {
  const s = _irState;
  const marie = s.situation === 'marie';
  const anneesOptions = Object.keys(BAREMES).sort((a,b) => b - a).map(y =>
    `<option value="${y}" ${s.annee == y ? 'selected' : ''}>${BAREMES[y].label}</option>`
  ).join('');

  const situationContent = `
    <div>
      <label class="label">Année de revenus</label>
      <select class="input" onchange="updateIR('annee', parseInt(this.value)); document.getElementById('ir-subtitle').textContent = BAREMES[parseInt(this.value)]?.label || ''">
        ${anneesOptions}
      </select>
    </div>
    <div>
      <label class="label">Situation familiale</label>
      <select class="input" onchange="updateIR('situation', this.value)">
        <option value="celibataire" ${s.situation==='celibataire'?'selected':''}>Célibataire / Divorcé</option>
        <option value="marie"       ${s.situation==='marie'?'selected':''}>Marié / Pacsé</option>
        <option value="veuf"        ${s.situation==='veuf'?'selected':''}>Veuf</option>
      </select>
    </div>
    <div>
      <label class="label">Nombre d'enfants à charge</label>
      <input class="input" type="number" min="0" value="${s.nbEnfants}"
        onchange="updateIR('nbEnfants', parseInt(this.value)||0)" />
    </div>`;

  const revenusContent = `
    <div class="space-y-1">
      <label class="label">Salaires / traitements</label>
      <div class="flex gap-1 mb-2">
        <button onclick="updateIR('salaires_mode','brut')"
          class="flex-1 text-xs py-1 rounded transition-colors ${s.salaires_mode!=='net' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">
          Brut <span class="opacity-70">(abatt. 10%)</span>
        </button>
        <button onclick="updateIR('salaires_mode','net')"
          class="flex-1 text-xs py-1 rounded transition-colors ${s.salaires_mode==='net' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}">
          Net fiscal
        </button>
      </div>
      <div class="grid ${marie ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
        <div>
          ${marie ? '<p class="text-slate-500 text-xs mb-1">Vous</p>' : ''}
          <input class="input" type="number" min="0" value="${s.salaires_vous||''}"
            placeholder="0" onchange="updateIR('salaires_vous', parseFloat(this.value)||0)" />
        </div>
        ${marie ? `<div>
          <p class="text-slate-500 text-xs mb-1">Conjoint·e</p>
          <input class="input" type="number" min="0" value="${s.salaires_conjoint||''}"
            placeholder="0" onchange="updateIR('salaires_conjoint', parseFloat(this.value)||0)" />
        </div>` : ''}
      </div>
    </div>

    <div>
      <label class="label">BIC / BNC — résultat net (€)</label>
      <input class="input" type="number" value="${s.bic_bnc||''}"
        placeholder="0" onchange="updateIR('bic_bnc', parseFloat(this.value)||0)" />
    </div>

    <div>
      <label class="label">Revenus fonciers nets — régime réel (€)</label>
      <input class="input" type="number" min="0" value="${s.foncier||''}"
        placeholder="0" onchange="updateIR('foncier', parseFloat(this.value)||0)" />
    </div>

    <div class="space-y-1">
      <label class="label">Micro-foncier — recettes brutes (€)</label>
      <p class="text-slate-500 text-xs -mt-1">Abattement 30% auto (régime si recettes ≤ 15 000€/an)</p>
      <input class="input" type="number" min="0" value="${s.micro_foncier||''}"
        placeholder="0" onchange="updateIR('micro_foncier', parseFloat(this.value)||0)" />
    </div>

    `;

  const divPvContent = `
    <div class="space-y-1">
      <label class="label">Dividendes — option barème (€)</label>
      <p class="text-slate-500 text-xs -mt-1">Abattement 40% + barème IR</p>
      <input class="input" type="number" min="0" value="${s.dividendes_bareme||''}"
        placeholder="0" onchange="updateIR('dividendes_bareme', parseFloat(this.value)||0)" />
    </div>
    <div class="space-y-1">
      <label class="label">Dividendes — PFU / flat tax (€)</label>
      <p class="text-slate-500 text-xs -mt-1">Flat tax 30% (12,8% IR + 17,2% PS)</p>
      <input class="input" type="number" min="0" value="${s.dividendes_pfu||''}"
        placeholder="0" onchange="updateIR('dividendes_pfu', parseFloat(this.value)||0)" />
    </div>
    <hr class="border-slate-600/60" />
    <div class="space-y-1">
      <label class="label">Plus-values mobilières — option barème (€)</label>
      <input class="input" type="number" min="0" value="${s.pv_bareme||''}"
        placeholder="0" onchange="updateIR('pv_bareme', parseFloat(this.value)||0)" />
    </div>
    <div class="space-y-1">
      <label class="label">Plus-values mobilières — PFU (€)</label>
      <input class="input" type="number" min="0" value="${s.pv_pfu||''}"
        placeholder="0" onchange="updateIR('pv_pfu', parseFloat(this.value)||0)" />
    </div>
    <hr class="border-slate-600/60" />
    <div>
      <label class="label">Autres revenus imposables (€)</label>
      <input class="input" type="number" value="${s.autres||''}"
        placeholder="0" onchange="updateIR('autres', parseFloat(this.value)||0)" />
    </div>`;

  const deductionsContent = `
    <div class="space-y-1">
      <label class="label">PER — versements déductibles (€)</label>
      <p class="text-slate-500 text-xs -mt-1">Réduit directement le revenu imposable</p>
      <input class="input" type="number" min="0" value="${s.per||''}"
        placeholder="0" onchange="updateIR('per', parseFloat(this.value)||0)" />
    </div>`;

  const reductionsContent = `
    <div class="space-y-1">
      <label class="label">Dons aux associations (€ versés)</label>
      <p class="text-slate-500 text-xs -mt-1">Réduction 66%, limite 20% du revenu imposable</p>
      <input class="input" type="number" min="0" value="${s.dons||''}"
        placeholder="0" onchange="updateIR('dons', parseFloat(this.value)||0)" />
    </div>
    <div>
      <label class="label">Scolarité — enfants au collège</label>
      <input class="input" type="number" min="0" value="${s.scol_college||''}"
        placeholder="0" onchange="updateIR('scol_college', parseInt(this.value)||0)" />
    </div>
    <div>
      <label class="label">Scolarité — enfants au lycée</label>
      <input class="input" type="number" min="0" value="${s.scol_lycee||''}"
        placeholder="0" onchange="updateIR('scol_lycee', parseInt(this.value)||0)" />
    </div>
    <div>
      <label class="label">Scolarité — enseignement supérieur</label>
      <input class="input" type="number" min="0" value="${s.scol_superieur||''}"
        placeholder="0" onchange="updateIR('scol_superieur', parseInt(this.value)||0)" />
    </div>`;

  const creditsContent = `
    <div class="space-y-1">
      <label class="label">Garde d'enfants &lt; 6 ans (€ de frais)</label>
      <p class="text-slate-500 text-xs -mt-1">Crédit 50% des frais, max 1 750€ de crédit par enfant</p>
      <input class="input" type="number" min="0" value="${s.garde_enfants||''}"
        placeholder="0" onchange="updateIR('garde_enfants', parseFloat(this.value)||0)" />
    </div>
    <div class="space-y-1">
      <label class="label">Emploi à domicile — femme de ménage, etc. (€ de frais)</label>
      <p class="text-slate-500 text-xs -mt-1">Crédit 50%, max 12 000€ de frais (6 000€ de crédit)</p>
      <input class="input" type="number" min="0" value="${s.emploi_domicile||''}"
        placeholder="0" onchange="updateIR('emploi_domicile', parseFloat(this.value)||0)" />
    </div>
    <div class="space-y-1">
      <label class="label">Formation dirigeant (€ de crédit d'impôt)</label>
      <p class="text-slate-500 text-xs -mt-1">Montant du crédit (SMIC horaire × heures)</p>
      <input class="input" type="number" min="0" value="${s.formation||''}"
        placeholder="0" onchange="updateIR('formation', parseFloat(this.value)||0)" />
    </div>
    <div>
      <label class="label">Autres crédits d'impôt (€)</label>
      <input class="input" type="number" min="0" value="${s.autres_credits||''}"
        placeholder="0" onchange="updateIR('autres_credits', parseFloat(this.value)||0)" />
    </div>`;

  const pasContent = `
    <p class="text-slate-500 text-xs -mt-1">Retenues mensuelles employeur + acomptes versés dans l'année</p>
    <div class="grid ${marie ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-1">
      <div>
        ${marie ? '<p class="text-slate-500 text-xs mb-1">Vous</p>' : ''}
        <input class="input" type="number" min="0" value="${s.pas_vous||''}"
          placeholder="0" onchange="updateIR('pas_vous', parseFloat(this.value)||0)" />
      </div>
      ${marie ? `<div>
        <p class="text-slate-500 text-xs mb-1">Conjoint·e</p>
        <input class="input" type="number" min="0" value="${s.pas_conjoint||''}"
          placeholder="0" onchange="updateIR('pas_conjoint', parseFloat(this.value)||0)" />
      </div>` : ''}
    </div>`;

  return [
    irBlock('Situation fiscale', situationContent, { open: true }),
    irBlock('Revenus', revenusContent, { open: true }),
    irBlock('Dividendes, plus-values & autres', divPvContent),
    irBlock('Déductions du revenu', deductionsContent),
    irBlock('Réductions d\'impôt', reductionsContent),
    irBlock('Crédits d\'impôt', creditsContent),
    irBlock('Prélèvements déjà effectués', pasContent, { borderClass: 'border-orange-700/40' }),
  ].join('\n');
}

function updateIR(key, value) {
  _irState[key] = value;
  // Certains changements affectent l'apparence du formulaire (toggle, champs conjoint)
  if (key === 'salaires_mode' || key === 'situation') {
    const formEl = document.getElementById('ir-form');
    if (formEl) formEl.innerHTML = renderIRForm();
  }
  document.getElementById('ir-results').innerHTML = renderIRResults();
}

function renderIRResults() {
  const p = getIRParams();
  const r = calcIR(p);

  const totalRevenu = (_irState.salaires_vous||0) + (_irState.salaires_conjoint||0) + (_irState.bic_bnc||0) + (_irState.foncier||0)
    + (_irState.micro_foncier||0) + (_irState.dividendes_bareme||0) + (_irState.dividendes_pfu||0)
    + (_irState.pv_bareme||0) + (_irState.pv_pfu||0) + (_irState.autres||0);

  if (totalRevenu === 0) {
    return `<div class="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center text-slate-500">
      Saisissez vos revenus pour calculer l'impôt.
    </div>`;
  }

  // Barre de progression des tranches
  const barreHtml = r.detailTranches.filter(t => t.base > 0).map(t => {
    const colors = { 0: 'bg-slate-600', 0.11: 'bg-emerald-600', 0.30: 'bg-yellow-500', 0.41: 'bg-orange-500', 0.45: 'bg-red-600' };
    const w = Math.round((t.base / Math.max(r.revenuNetGlobal, 1)) * 100);
    return `<div class="${colors[t.taux]||'bg-slate-500'} h-full rounded" style="width:${w}%" title="${t.taux*100}% : ${fmtE(t.base)}"></div>`;
  }).join('');

  const tranchesHtml = r.detailTranches.filter(t => t.base > 0).map(t => `
    <tr class="border-b border-slate-700/50">
      <td class="py-2 text-slate-400">${t.taux === 0 ? '0 %' : (t.taux*100) + ' %'}</td>
      <td class="py-2 text-right text-slate-300">${fmtE(t.base)}</td>
      <td class="py-2 text-right text-white font-medium">${fmtE(t.montant)}</td>
    </tr>`).join('');

  const pfuRows = [];
  if (_irState.dividendes_pfu > 0) pfuRows.push(`
    <tr class="border-b border-slate-700/50">
      <td class="py-2 text-slate-400">Dividendes PFU 30%</td>
      <td class="py-2 text-right text-slate-300">${fmtE(_irState.dividendes_pfu)}</td>
      <td class="py-2 text-right text-white">${fmtE(r.pfuDiv)}</td>
    </tr>`);
  if (_irState.pv_pfu > 0) pfuRows.push(`
    <tr class="border-b border-slate-700/50">
      <td class="py-2 text-slate-400">Plus-values PFU 30%</td>
      <td class="py-2 text-right text-slate-300">${fmtE(_irState.pv_pfu)}</td>
      <td class="py-2 text-right text-white">${fmtE(r.pfuPV)}</td>
    </tr>`);

  return `
  <!-- Métriques clés -->
  <div class="grid grid-cols-3 gap-3 mb-4">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-3 text-center">
      <p class="text-slate-400 text-xs mb-1">Total impôts</p>
      <p class="text-xl font-bold text-white">${fmtE(r.impotFinal)}</p>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-3 text-center">
      <p class="text-slate-400 text-xs mb-1">Taux moyen</p>
      <p class="text-xl font-bold text-orange-400">${fmtPct(r.txMoyen)}</p>
    </div>
    ${p.pas_preleve > 0 ? `
    <div class="bg-slate-800 rounded-xl border ${r.resteAPayer >= 0 ? 'border-orange-700/50' : 'border-emerald-700/50'} p-3 text-center">
      <p class="text-slate-400 text-xs mb-1">${r.resteAPayer >= 0 ? 'Reste à payer' : 'Remboursement'}</p>
      <p class="text-xl font-bold ${r.resteAPayer >= 0 ? 'text-orange-400' : 'text-emerald-400'}">${r.resteAPayer >= 0 ? fmtE(r.resteAPayer) : fmtE(r.remboursementPAS)}</p>
    </div>` : `
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-3 text-center">
      <p class="text-slate-400 text-xs mb-1">Taux marginal</p>
      <p class="text-xl font-bold text-red-400">${fmtPct(r.txMarginal, 0)}</p>
    </div>`}
  </div>

  <!-- Barre tranches -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
    <h3 class="font-semibold text-white mb-3">Décomposition par tranche</h3>
    <div class="flex h-3 rounded overflow-hidden bg-slate-700 mb-4 gap-0.5">
      ${barreHtml}
    </div>
    <div class="flex gap-3 flex-wrap text-xs text-slate-400 mb-4">
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-slate-600 inline-block"></span>0%</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-emerald-600 inline-block"></span>11%</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-yellow-500 inline-block"></span>30%</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-orange-500 inline-block"></span>41%</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-600 inline-block"></span>45%</span>
    </div>
    <table class="w-full text-sm">
      <thead><tr class="border-b border-slate-600">
        <th class="text-left text-slate-400 pb-2 font-normal">Tranche</th>
        <th class="text-right text-slate-400 pb-2 font-normal">Base</th>
        <th class="text-right text-slate-400 pb-2 font-normal">Impôt</th>
      </tr></thead>
      <tbody>${tranchesHtml}</tbody>
    </table>
  </div>

  <!-- Calcul IR barème -->
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
    <h3 class="font-semibold text-white mb-3">Calcul IR barème</h3>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-400">Revenu net global</span>
        <span class="text-white">${fmtE(r.revenuNetGlobal)}</span>
      </div>
      ${r.abatt10 > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">dont abattement 10% salaires${_irState.situation === 'marie' && r.abatt10_conjoint > 0 ? ` (vous ${fmtE(r.abatt10_vous)} + conjoint ${fmtE(r.abatt10_conjoint)})` : ' (auto)'}</span>
        <span class="text-slate-400">−${fmtE(r.abatt10)}</span>
      </div>` : ((_irState.salaires_vous||0) + (_irState.salaires_conjoint||0)) > 0 && _irState.salaires_mode === 'net' ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">salaires saisis en net fiscal (abattement non recalculé)</span>
        <span class="text-slate-400"></span>
      </div>` : ''}
      ${r.abatt40 > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">dont abattement 40% dividendes</span>
        <span class="text-slate-400">−${fmtE(r.abatt40)}</span>
      </div>` : ''}
      ${r.abattMicroFoncier > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">dont abattement 30% micro-foncier</span>
        <span class="text-slate-400">−${fmtE(r.abattMicroFoncier)}</span>
      </div>` : ''}
      ${r.deductionPER > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">Déduction PER</span>
        <span class="text-emerald-400">−${fmtE(r.deductionPER)}</span>
      </div>
      <div class="flex justify-between text-xs border-t border-slate-700/50 pt-2">
        <span class="text-slate-400">Revenu imposable (après PER)</span>
        <span class="text-white">${fmtE(r.revenuImposable)}</span>
      </div>` : ''}
      <div class="flex justify-between">
        <span class="text-slate-400">Parts fiscales</span>
        <span class="text-white">${r.nbParts}${r.nbParts > r.baseParts ? ` (base ${r.baseParts} + enfants)` : ''}</span>
      </div>
      <div class="flex justify-between border-t border-slate-700/50 pt-2">
        <span class="text-slate-400">Impôt sur ${r.nbParts} parts</span>
        <span class="text-white">${fmtE(r.impotQFBrut)}</span>
      </div>
      ${r.correctionPlafond > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">Correction plafonnement QF (+${fmtE(r.correctionPlafond)} récupérés)</span>
        <span class="text-orange-400">+${fmtE(r.correctionPlafond)}</span>
      </div>` : ''}
      <div class="flex justify-between border-t border-slate-700/50 pt-2">
        <span class="text-slate-400">Impôt brut</span>
        <span class="text-white">${fmtE(r.impotBrut)}</span>
      </div>
      ${r.decote > 0 ? `<div class="flex justify-between text-xs">
        <span class="text-slate-500">Décote</span>
        <span class="text-emerald-400">−${fmtE(r.decote)}</span>
      </div>` : ''}
      <div class="flex justify-between font-semibold border-t border-slate-700/50 pt-2">
        <span class="text-slate-300">IR barème net</span>
        <span class="text-white">${fmtE(r.impotNet)}</span>
      </div>
      ${r.cehr > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">CEHR</span>
        <span class="text-orange-400">${fmtE(r.cehr)}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- PFU -->
  ${pfuRows.length > 0 ? `
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
    <h3 class="font-semibold text-white mb-3">Prélèvement Forfaitaire Unique (PFU)</h3>
    <table class="w-full text-sm">
      <thead><tr class="border-b border-slate-600">
        <th class="text-left text-slate-400 pb-2 font-normal">Source</th>
        <th class="text-right text-slate-400 pb-2 font-normal">Base</th>
        <th class="text-right text-slate-400 pb-2 font-normal">PFU 30%</th>
      </tr></thead>
      <tbody>${pfuRows.join('')}</tbody>
    </table>
    <p class="text-xs text-slate-500 mt-2">Dont prélèvements sociaux 17,2% inclus dans le PFU.</p>
  </div>` : ''}

  <!-- Prélèvements sociaux hors PFU -->
  ${r.totalPS > 0 ? `
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
    <h3 class="font-semibold text-white mb-3">Prélèvements sociaux (17,2%)</h3>
    <div class="space-y-2 text-sm">
      ${r.psFoncier > 0 ? `
      <div class="flex justify-between">
        <span class="text-slate-400">Revenus fonciers nets (${fmtE((_irState.foncier||0) + r.microFoncierNet)})</span>
        <span class="text-white">${fmtE(r.psFoncier)}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span class="text-slate-500">dont CSG 9,2%</span>
        <span class="text-slate-400">${fmtE(r.psFoncierCSG)}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span class="text-slate-500">dont CRDS 0,5%</span>
        <span class="text-slate-400">${fmtE(r.psFoncierCRDS)}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span class="text-slate-500">dont prélèvement de solidarité 7,5%</span>
        <span class="text-slate-400">${fmtE(r.psFoncierSol)}</span>
      </div>` : ''}
      ${r.psDivBareme > 0 ? `
      <div class="flex justify-between ${r.psFoncier > 0 ? 'border-t border-slate-700/50 pt-2' : ''}">
        <span class="text-slate-400">Dividendes option barème (brut ${fmtE(_irState.dividendes_bareme||0)})</span>
        <span class="text-white">${fmtE(r.psDivBareme)}</span>
      </div>` : ''}
      <div class="flex justify-between font-semibold border-t border-slate-700/50 pt-2">
        <span class="text-slate-300">Total PS</span>
        <span class="text-orange-300">${fmtE(r.totalPS)}</span>
      </div>
    </div>
  </div>` : ''}

  <!-- Réductions & Crédits -->
  ${(r.totalReductions > 0 || r.totalCredits > 0) ? `
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-4">
    <h3 class="font-semibold text-white mb-3">Réductions & Crédits d'impôt</h3>
    <div class="space-y-2 text-sm">
      ${r.totalReductions > 0 ? `
      <p class="text-xs text-slate-500 uppercase tracking-wide font-medium">Réductions (non remboursables)</p>
      ${r.reductionDons > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Dons (66% de ${fmtE(r.donsEffectifs)})</span>
        <span class="text-emerald-400">−${fmtE(r.reductionDons)}</span>
      </div>` : ''}
      ${r.reductionScol > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Scolarité (collège/lycée/supérieur)</span>
        <span class="text-emerald-400">−${fmtE(r.reductionScol)}</span>
      </div>` : ''}
      ` : ''}
      ${r.totalCredits > 0 ? `
      <p class="text-xs text-slate-500 uppercase tracking-wide font-medium mt-2">Crédits (remboursables)</p>
      ${r.creditGarde > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Garde d'enfants (50%)</span>
        <span class="text-emerald-400">−${fmtE(r.creditGarde)}</span>
      </div>` : ''}
      ${r.creditDomicile > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Emploi à domicile (50%)</span>
        <span class="text-emerald-400">−${fmtE(r.creditDomicile)}</span>
      </div>` : ''}
      ${r.creditFormation > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Formation dirigeant</span>
        <span class="text-emerald-400">−${fmtE(r.creditFormation)}</span>
      </div>` : ''}
      ${r.creditAutres > 0 ? `<div class="flex justify-between">
        <span class="text-slate-400">Autres crédits</span>
        <span class="text-emerald-400">−${fmtE(r.creditAutres)}</span>
      </div>` : ''}
      ${r.remboursementCredits > 0 ? `<div class="flex justify-between text-xs border-t border-slate-700/50 pt-2">
        <span class="text-slate-500">Excédent de crédits remboursé</span>
        <span class="text-blue-400">+${fmtE(r.remboursementCredits)}</span>
      </div>` : ''}
      ` : ''}
    </div>
  </div>` : ''}

  <!-- Récapitulatif final -->
  <div class="bg-blue-900/20 rounded-xl border border-blue-700/50 p-4">
    <h3 class="font-semibold text-white mb-3">Récapitulatif</h3>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-400">IR barème net</span>
        <span class="text-white">${fmtE(r.impotNet)}</span>
      </div>
      ${r.cehr > 0 ? `<div class="flex justify-between"><span class="text-slate-400">CEHR</span><span class="text-white">${fmtE(r.cehr)}</span></div>` : ''}
      ${r.totalReductions > 0 ? `<div class="flex justify-between"><span class="text-slate-400">Réductions d'impôt</span><span class="text-emerald-400">−${fmtE(r.totalReductions)}</span></div>` : ''}
      ${r.totalCredits > 0 ? `<div class="flex justify-between"><span class="text-slate-400">Crédits d'impôt</span><span class="text-emerald-400">−${fmtE(r.totalCredits)}</span></div>` : ''}
      ${r.totalPS > 0 ? `<div class="flex justify-between"><span class="text-slate-400">Prélèvements sociaux 17,2%</span><span class="text-white">${fmtE(r.totalPS)}</span></div>` : ''}
      ${r.totalPFU > 0 ? `<div class="flex justify-between"><span class="text-slate-400">PFU (dont PS inclus)</span><span class="text-white">${fmtE(r.totalPFU)}</span></div>` : ''}
      <div class="flex justify-between text-base font-bold border-t border-blue-700/50 pt-2">
        <span class="text-white">Total impôts & prélèvements</span>
        <span class="text-blue-300">${fmtE(r.impotFinal)}</span>
      </div>
      ${p.pas_preleve > 0 ? `
      <div class="flex justify-between border-t border-slate-700/50 pt-2">
        <span class="text-slate-400">Prélèvement à la source déjà payé</span>
        <span class="text-slate-300">−${fmtE(p.pas_preleve)}</span>
      </div>
      <div class="flex justify-between text-base font-bold pt-1 ${r.resteAPayer >= 0 ? 'text-orange-300' : 'text-emerald-400'}">
        <span>${r.resteAPayer >= 0 ? 'Reste à payer' : 'Remboursement attendu'}</span>
        <span>${r.resteAPayer >= 0 ? fmtE(r.resteAPayer) : fmtE(r.remboursementPAS)}</span>
      </div>` : ''}
      ${r.remboursementCredits > 0 && p.pas_preleve === 0 ? `
      <div class="flex justify-between text-xs pt-1">
        <span class="text-slate-500">Remboursement crédits excédentaires</span>
        <span class="text-blue-400">${fmtE(r.remboursementCredits)}</span>
      </div>` : ''}
      <div class="flex justify-between text-xs pt-1 border-t border-slate-700/50">
        <span class="text-slate-500">Taux moyen global</span>
        <span class="text-slate-300">${fmtPct(r.txMoyen)}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span class="text-slate-500">Taux marginal d'imposition</span>
        <span class="text-slate-300">${fmtPct(r.txMarginal, 0)}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span class="text-slate-500">Revenu fiscal de référence</span>
        <span class="text-slate-300">${fmtE(r.rfr)}</span>
      </div>
    </div>
  </div>`;
}

// ─── SIMULATIONS IR — LOCALSTORAGE ───────────────────────────────────────────

const LS_SIMUL_KEY = 'portfoliopro_simulations_ir';
let _currentSimId  = null; // ID de la simulation actuellement chargée (null = nouvelle)

function lsGetSimulations() {
  return STATE.simulations_ir || [];
}

function lsSaveSimulations(list) {
  STATE.simulations_ir = list;
  saveState();
}

function _buildSimObject(id, nom) {
  const p = getIRParams();
  const r = calcIR(p);
  return {
    id,
    nom,
    created_at: new Date().toISOString(),
    state:      { ..._irState },
    summary: {
      annee:      _irState.annee,
      situation:  _irState.situation,
      nbEnfants:  _irState.nbEnfants,
      impotFinal: r.impotFinal,
      txMoyen:    r.txMoyen,
    },
  };
}

function _flashBtn(id, msg, restore) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = restore; }, 1500);
}

function _refreshSaveButtons() {
  const wrap = document.getElementById('ir-save-btns');
  if (!wrap) return;
  if (_currentSimId) {
    const list = lsGetSimulations();
    const cur  = list.find(s => s.id === _currentSimId);
    wrap.innerHTML = `
      <button id="btn-update-ir" onclick="updateSimulationIR()" class="btn-primary text-sm">💾 Mettre à jour</button>
      <button id="btn-save-ir"   onclick="saveSimulationIR()"   class="btn-secondary text-sm">+ Nouvelle copie</button>`;
    // Afficher le nom de la simu chargée
    const subtitle2 = document.getElementById('ir-simname');
    if (subtitle2 && cur) subtitle2.textContent = `📂 ${cur.nom}`;
  } else {
    wrap.innerHTML = `
      <button id="btn-save-ir" onclick="saveSimulationIR()" class="btn-primary text-sm">💾 Sauvegarder</button>`;
    const subtitle2 = document.getElementById('ir-simname');
    if (subtitle2) subtitle2.textContent = '';
  }
}

function saveSimulationIR() {
  const defaultNom = `Simulation ${_irState.annee}`;
  const nom = prompt('Nom de la simulation :', defaultNom);
  if (nom === null) return;
  const sim = _buildSimObject(uid(), nom.trim() || defaultNom);
  const list = lsGetSimulations();
  list.unshift(sim);
  lsSaveSimulations(list);
  _currentSimId = sim.id;
  _refreshSaveButtons();
  _flashBtn('btn-update-ir', '✓ Sauvegardé', '💾 Mettre à jour');
}

function updateSimulationIR() {
  if (!_currentSimId) { saveSimulationIR(); return; }
  const list = lsGetSimulations();
  const idx  = list.findIndex(s => s.id === _currentSimId);
  if (idx === -1) { saveSimulationIR(); return; }
  const updated = _buildSimObject(_currentSimId, list[idx].nom);
  updated.created_at = list[idx].created_at; // conserver la date d'origine
  updated.updated_at = new Date().toISOString();
  list[idx] = updated;
  lsSaveSimulations(list);
  _flashBtn('btn-update-ir', '✓ Mis à jour', '💾 Mettre à jour');
}

function openSimulationsIR() {
  const list = lsGetSimulations();

  const rows = list.length === 0
    ? `<p class="text-slate-500 text-sm text-center py-6">Aucune simulation sauvegardée.</p>`
    : list.map(s => {
        const isCurrent = s.id === _currentSimId;
        const date = new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        const updDate = s.updated_at ? ' · maj ' + new Date(s.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
        const sitLabel = { celibataire: 'Célibataire', marie: 'Marié/Pacsé', veuf: 'Veuf' }[s.summary?.situation] || '';
        const enfants  = s.summary?.nbEnfants > 0 ? ` · ${s.summary.nbEnfants} enf.` : '';
        return `
        <div class="flex items-center justify-between gap-3 py-3 border-b border-slate-700/50 last:border-0 ${isCurrent ? 'bg-blue-900/10 -mx-4 px-4 rounded' : ''}">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate ${isCurrent ? 'text-blue-300' : 'text-white'}">${s.nom}${isCurrent ? ' <span class="text-xs font-normal opacity-70">(en cours)</span>' : ''}</p>
            <p class="text-slate-500 text-xs mt-0.5">${date}${updDate} · ${sitLabel}${enfants}</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-white text-sm font-semibold">${fmtE(s.summary?.impotFinal ?? 0)}</p>
            <p class="text-slate-500 text-xs">${fmtPct(s.summary?.txMoyen ?? 0)}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            ${isCurrent ? '' : `<button onclick="loadSimulationIR('${s.id}')" class="btn-secondary text-xs px-2 py-1">Charger</button>`}
            <button onclick="renameSimulationIR('${s.id}')" class="btn-secondary text-xs px-2 py-1">✏</button>
            <button onclick="deleteSimulationIR('${s.id}')" class="btn-danger text-xs px-2 py-1">✕</button>
          </div>
        </div>`;
      }).join('');

  document.body.insertAdjacentHTML('beforeend', `
  <div id="simul-modal" class="modal-backdrop" onclick="if(event.target===this)closeSimulationsIR()">
    <div class="modal-box" style="max-width:36rem">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-semibold text-white">Simulations sauvegardées</h3>
        <button onclick="closeSimulationsIR()" class="text-slate-400 hover:text-white text-lg leading-none">✕</button>
      </div>
      <div>${rows}</div>
    </div>
  </div>`);
}

function closeSimulationsIR() {
  document.getElementById('simul-modal')?.remove();
}

function loadSimulationIR(id) {
  const list = lsGetSimulations();
  const sim  = list.find(s => s.id === id);
  if (!sim) return;
  Object.assign(_irState, sim.state);
  _currentSimId = id;
  closeSimulationsIR();
  const formEl = document.getElementById('ir-form');
  if (formEl) formEl.innerHTML = renderIRForm();
  document.getElementById('ir-results').innerHTML = renderIRResults();
  document.getElementById('ir-subtitle').textContent = BAREMES[_irState.annee]?.label || '';
  _refreshSaveButtons();
}

function renameSimulationIR(id) {
  const list = lsGetSimulations();
  const sim  = list.find(s => s.id === id);
  if (!sim) return;
  const nom = prompt('Nouveau nom :', sim.nom);
  if (nom === null) return;
  const label = nom.trim();
  if (!label || label === sim.nom) return;
  sim.nom = label;
  lsSaveSimulations(list);
  // Mettre à jour le libellé affiché si c'est la simu courante
  if (_currentSimId === id) {
    const el = document.getElementById('ir-simname');
    if (el) el.textContent = '📂 ' + label;
  }
  closeSimulationsIR();
  openSimulationsIR();
}

function deleteSimulationIR(id) {
  if (!confirm('Supprimer cette simulation ?')) return;
  const list = lsGetSimulations().filter(s => s.id !== id);
  lsSaveSimulations(list);
  if (_currentSimId === id) {
    _currentSimId = null;
    _refreshSaveButtons();
  }
  closeSimulationsIR();
  openSimulationsIR();
}
