// ─── STATE ───────────────────────────────────────────────────────────────────

const STATE_DEFAULTS = {
  societes: [],
  missions: [],
  cra_entries: [],
  simulations_ir: [],
  exercices_fiscaux: [],
};

let STATE = { ...STATE_DEFAULTS };

// Persiste STATE dans localStorage après chaque mutation
function saveState() {
  Storage.save(STATE);
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

function navigate(hash) { location.hash = hash; }

window.addEventListener('hashchange', render);
window.addEventListener('load', render);

// ─── RENDER ──────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');

  // Charger depuis localStorage au premier appel
  const saved = Storage.load();
  if (saved) {
    STATE = { ...STATE_DEFAULTS, ...saved };
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
    <div class="max-w-6xl mx-auto flex items-center gap-2">
      <span class="text-white font-bold mr-4 text-sm">Portfolio Pro</span>
      ${items}
      <div class="ml-auto flex gap-2">
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

  const cardsHtml = societes.length === 0
    ? `<div class="col-span-full text-center py-12 text-slate-500">
        <p class="text-lg mb-2">Aucune société configurée</p>
        <a href="#societes" class="btn-primary text-sm">Ajouter une société</a>
       </div>`
    : societes.map(s => {
        const forme = { ei: 'EI', eurl: 'EURL', sarl: 'SARL', sas: 'SAS', sasu: 'SASU', snc: 'SNC', sci: 'SCI' }[s.forme] || s.forme;
        const regime = s.regime_fiscal === 'ir' ? badge('IR', 'orange') : badge('IS', 'blue');
        return `
        <a href="#societes/${s.id}" class="block bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-blue-500 transition-colors">
          <div class="flex items-start justify-between mb-2">
            <span class="font-semibold text-white">${s.nom}</span>
            ${regime}
          </div>
          <div class="text-slate-400 text-sm">${forme}</div>
          ${s.capital ? `<div class="text-slate-500 text-xs mt-1">Capital : ${fmtE(s.capital)}</div>` : ''}
        </a>`;
      }).join('');

  const lastSimHtml = simuls.length > 0 ? `
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <h3 class="font-semibold text-white mb-3">Dernières simulations IR</h3>
      <div class="space-y-2">
        ${simuls.slice(-5).reverse().map(s => `
          <a href="#ir/${s.id}" class="flex items-center justify-between py-2 border-b border-slate-700/50 hover:text-blue-400 transition-colors">
            <span class="text-sm text-slate-300">${s.nom || 'Simulation sans titre'}</span>
            <span class="text-xs text-slate-500">${s.annee || ''}</span>
          </a>`).join('')}
      </div>
      <a href="#ir" class="btn-secondary text-xs mt-3 block text-center">Nouvelle simulation</a>
    </div>` : '';

  app.innerHTML = `
  ${navBar('dashboard')}
  <div class="max-w-6xl mx-auto px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">Dashboard</h1>
      <a href="#societes" class="btn-primary text-sm">+ Société</a>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      ${cardsHtml}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 class="font-semibold text-white mb-3">Accès rapide</h3>
        <div class="grid grid-cols-2 gap-3">
          <a href="#ir" class="bg-slate-700 hover:bg-slate-600 rounded-lg p-3 text-center transition-colors">
            <div class="text-2xl mb-1">📊</div>
            <div class="text-sm text-slate-300">Simulateur IR</div>
          </a>
          <a href="#societes" class="bg-slate-700 hover:bg-slate-600 rounded-lg p-3 text-center transition-colors">
            <div class="text-2xl mb-1">🏢</div>
            <div class="text-sm text-slate-300">Mes sociétés</div>
          </a>
        </div>
      </div>
      ${lastSimHtml}
    </div>
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
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center justify-between">
          <div>
            <span class="font-semibold text-white">${s.nom}</span>
            <span class="ml-2 text-slate-500 text-sm">${forme}</span>
            <span class="ml-2">${s.regime_fiscal === 'ir' ? badge('IR', 'orange') : badge('IS', 'blue')}</span>
            ${s.capital ? `<span class="ml-2 text-slate-400 text-xs">Capital ${fmtE(s.capital)}</span>` : ''}
          </div>
          <div class="flex gap-2">
            <button onclick="openSocieteModal('${s.id}')" class="btn-secondary text-xs">Modifier</button>
            <button onclick="deleteSociete('${s.id}')" class="btn-danger text-xs">Suppr.</button>
          </div>
        </div>`;
      }).join('')}</div>`;

  app.innerHTML = `
  ${navBar('societes')}
  <div class="max-w-4xl mx-auto px-4 py-6">
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

let _socTab    = 'fiche';
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
    { key: 'fiche',    label: 'Fiche' },
    { key: 'missions', label: `Missions (${getMissionsActives(id).length})` },
    { key: 'cra',      label: 'CRA Prévisionnel' },
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

  app.innerHTML = `
  ${navBar('societes')}
  <div class="max-w-6xl mx-auto px-4 py-6">
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
          <button onclick="unarchiveMission('${m.id}','${soc.id}')" class="btn-secondary text-xs px-2 py-1">Restaurer</button>
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
  const missions   = getMissionsActives(soc.id);
  const annee      = _craAnnee;
  const moisLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const now        = new Date();
  const moisCourant = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();

  if (missions.length === 0) return `
    <div class="text-center py-12 text-slate-500">
      <p class="mb-3">Aucune mission active.</p>
      <button onclick="switchSocTab('missions','${soc.id}')" class="btn-secondary text-sm">Ajouter une mission</button>
    </div>`;

  // En-têtes mois
  const theadMois = moisLabels.map((label, i) => {
    const mois = i + 1;
    const jo   = calcJoursOuvres(annee, mois);
    const isCur = annee === anneeCourante && mois === moisCourant;
    return `<th class="text-center font-normal min-w-[90px] px-1 pb-2 ${isCur ? 'text-blue-400' : 'text-slate-400'}">
      <div class="text-xs font-medium">${label} ${annee}</div>
      <div class="text-slate-500 text-xs">${jo} j ouv.</div>
    </th>`;
  }).join('');

  // Lignes missions
  const tbodyRows = missions.map(m => {
    const totaux = calcCRATotauxMission(m, annee);
    const cells  = moisLabels.map((_, i) => {
      const mois  = i + 1;
      const hors  = isMoisHorsMission(m, annee, mois);
      const isCur = annee === anneeCourante && mois === moisCourant;
      if (hors) return `<td class="px-1 py-1"><div class="bg-slate-900/50 rounded h-16 opacity-30"></div></td>`;

      const entry = getCRAEntry(m.id, annee, mois);
      const c     = calcCRACell(m, annee, mois);
      const overrideBadge = c.joursOverride != null
        ? `<span class="text-blue-400 text-xs cursor-pointer" title="Jours surchargés" onclick="overrideCRADispo('${m.id}',${annee},${mois},'${soc.id}')">✏ ${c.joursOverride}j</span>`
        : `<span class="text-slate-600 text-xs cursor-pointer hover:text-slate-400" onclick="overrideCRADispo('${m.id}',${annee},${mois},'${soc.id}')">✏</span>`;

      const hasAbsence = (entry.jours_absence || 0) > 0;
      const bg = isCur ? 'bg-blue-900/10 border border-blue-800/30' : hasAbsence ? 'bg-amber-900/10' : 'bg-slate-800';

      return `<td class="px-1 py-1">
        <div class="${bg} rounded p-2 text-center">
          <div class="flex items-center justify-center gap-1 mb-1">
            <input type="number" min="0" max="${c.jousDispo}"
              class="w-10 text-center bg-slate-700 border border-slate-600 rounded text-xs text-white py-0.5 focus:border-blue-500 outline-none"
              value="${entry.jours_absence || ''}" placeholder="0"
              onchange="saveCRAEntry('${m.id}',${annee},${mois},'jours_absence',parseFloat(this.value)||0,'${soc.id}')"
              title="Jours d'absence" />
            <span class="text-slate-500 text-xs">abs</span>
          </div>
          <div class="text-white text-xs font-medium">${c.jFact} j</div>
          <div class="text-slate-300 text-xs">${fmtE(c.caHT)}</div>
          ${m.tva ? `<div class="text-slate-500 text-xs">${fmtE(c.caTTC)} TTC</div>` : ''}
          <div class="mt-1">${overrideBadge}</div>
        </div>
      </td>`;
    }).join('');

    return `<tr class="border-b border-slate-700/30">
      <td class="pr-3 py-2 min-w-[160px]">
        <div class="font-medium text-white text-sm">${m.client}</div>
        <div class="text-slate-500 text-xs">${fmtE(m.tjm)}/j ${!m.tva ? '· sans TVA' : ''}</div>
      </td>
      ${cells}
      <td class="pl-2 py-2 text-right min-w-[90px]">
        <div class="text-white text-sm font-semibold">${fmtE(totaux.caHT)}</div>
        ${m.tva ? `<div class="text-slate-400 text-xs">${fmtE(totaux.caTTC)} TTC</div>` : ''}
        <div class="text-slate-500 text-xs">${totaux.jours} j</div>
      </td>
    </tr>`;
  }).join('');

  // Ligne totaux
  const totauxMoisHtml = moisLabels.map((_, i) => {
    const mois = i + 1;
    const t    = calcCRATotauxMois(soc.id, annee, mois);
    const isCur = annee === anneeCourante && mois === moisCourant;
    return `<td class="px-1 py-2 text-center ${isCur ? 'text-blue-300' : ''}">
      <div class="text-white text-xs font-semibold">${fmtE(t.caHT)}</div>
      <div class="text-slate-400 text-xs">${t.jours} j</div>
    </td>`;
  }).join('');

  const totauxAnnee = missions.reduce((acc, m) => {
    const t = calcCRATotauxMission(m, annee);
    acc.caHT += t.caHT; acc.caTTC += t.caTTC; acc.jours += t.jours;
    return acc;
  }, { caHT: 0, caTTC: 0, jours: 0 });

  return `
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <button onclick="setCRAYear(-1,'${soc.id}')" class="btn-secondary text-sm px-2 py-1">←</button>
      <span class="text-white font-semibold text-lg">${annee}</span>
      <button onclick="setCRAYear(1,'${soc.id}')" class="btn-secondary text-sm px-2 py-1">→</button>
    </div>
    <div class="text-right">
      <span class="text-slate-400 text-sm">Total annuel : </span>
      <span class="text-white font-bold">${fmtE(totauxAnnee.caHT)} HT</span>
      <span class="text-slate-400 text-sm ml-1">(${totauxAnnee.jours} j)</span>
    </div>
  </div>
  <div class="overflow-x-auto rounded-xl border border-slate-700">
    <table class="w-full text-sm" style="min-width:1100px">
      <thead class="border-b border-slate-700 bg-slate-800/80">
        <tr>
          <th class="text-left text-slate-400 font-normal pb-2 pt-3 px-3">Mission</th>
          ${theadMois}
          <th class="text-right text-slate-400 font-normal pb-2 pt-3 px-2">Total</th>
        </tr>
      </thead>
      <tbody class="bg-slate-800/40">
        ${tbodyRows}
        <tr class="border-t-2 border-slate-600 bg-slate-800">
          <td class="px-3 py-2 text-slate-300 font-semibold text-sm">Total HT / mois</td>
          ${totauxMoisHtml}
          <td class="px-2 py-2 text-right">
            <div class="text-blue-300 font-bold text-sm">${fmtE(totauxAnnee.caHT)}</div>
            <div class="text-slate-400 text-xs">${totauxAnnee.jours} j</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="text-slate-600 text-xs mt-2">
    Cellule bleue = mois courant · Cellule ambrée = absence saisie · ✏ = surcharge jours disponibles
  </p>`;
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
  <div class="max-w-6xl mx-auto px-4 py-6">
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
  try { return JSON.parse(localStorage.getItem(LS_SIMUL_KEY)) || []; }
  catch { return []; }
}

function lsSaveSimulations(list) {
  localStorage.setItem(LS_SIMUL_KEY, JSON.stringify(list));
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
