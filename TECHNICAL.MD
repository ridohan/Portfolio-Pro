# Architecture Technique — Portfolio Pro

## Contraintes

- Application **100% statique** — HTML, CSS, JavaScript vanilla
- Hébergée sur **GitHub Pages** (ou équivalent)
- **Aucun backend, aucune base de données serveur**
- Google Sheets est la **seule source de vérité** pour toutes les données persistées

---

## Vue d'ensemble

```
App HTML (GitHub Pages)
    │
    │  fetch() — requêtes HTTP
    ▼
AppScript Web App
    │
    │  lecture / écriture
    ▼
Google Sheet (BDD)
    ├── societes
    ├── simulations_ir        ← historique des simulations IR sauvegardées
    ├── exercices_fiscaux     ← données fiscales annuelles par société
    └── ui_prefs
```

---

## Google Sheet — Structure des onglets

### `societes`

| Colonne | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique (ex : `soc_001`) |
| `nom` | string | Nom ou raison sociale |
| `forme` | string | `ei` \| `eurl` \| `sarl` \| `sas` \| `sasu` \| `snc` \| `sci` |
| `regime_fiscal` | string | `ir` \| `is` |
| `date_creation` | date | Date de création |
| `capital` | number | Capital social (en €) |
| `note` | string | Note libre |

### `simulations_ir`

| Colonne | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique |
| `nom` | string | Libellé de la simulation |
| `annee` | number | Année fiscale |
| `situation` | string | `celibataire` \| `marie` \| `divorce` \| `veuf` |
| `nb_enfants` | number | Nombre d'enfants à charge |
| `revenus` | json | Tableau de sources de revenus |
| `options` | json | Options (option barème dividendes, etc.) |
| `created_at` | datetime | Date de création |
| `societe_id` | string | Référence vers `societes.id` *(si simulation liée à une société)* |

### `ui_prefs`

| Colonne | Type | Description |
|---|---|---|
| `key` | string | Clé de préférence |
| `value` | string | Valeur JSON sérialisée |

---

## AppScript Web App

### Endpoints

**Lecture (GET)**
```
GET ?action=getData&token=xxx
→ retourne : societes, simulations_ir, exercices_fiscaux, ui_prefs
```

**Écriture (POST)**
```json
{ "action": "saveSociete", "data": { ... } }
{ "action": "deleteSociete", "id": "soc_001" }
{ "action": "saveSimulationIR", "data": { ... } }
{ "action": "deleteSimulationIR", "id": "sim_001" }
{ "action": "saveUiPref", "key": "dashboard_order", "value": "[...]" }
```

---

## Architecture du code

### Fichiers

```
index.html          ← point d'entrée unique
js/
  api.js            ← couche API (fetch + cache localStorage)
  app.js            ← application complète (router + vues + calculs)
fiscal/
  INSTRUCTIONS.MD   ← documentation du module fiscal
GENERAL.MD
TECHNICAL.MD
```

### STATE global

```js
let STATE = {
  societes: [],
  simulations_ir: [],
  exercices_fiscaux: [],
  ui_prefs: []
};
```

### Router

Navigation par `location.hash` :

```
#dashboard              → renderDashboard()
#ir                     → renderSimulateurIR()
#ir/:id                 → renderSimulateurIR(id)   // charger simulation sauvegardée
#societes               → renderSocietes()
#societes/:id           → renderSocieteDetail()
```

### Calculs IR (js/app.js)

Fonctions pures, aucune dépendance externe :

| Fonction | Rôle |
|---|---|
| `calcIR(params)` | Point d'entrée — orchestration |
| `calcRevenuNet(revenus)` | Revenus nets imposables après abattements |
| `calcQuotientFamilial(situation, nbEnfants)` | Nombre de parts |
| `calcBareme(revenuImposable, nbParts)` | Impôt brut via barème progressif |
| `calcDecote(impotBrut, nbParts)` | Décote |
| `calcCEHR(rfrTotal, nbParts)` | Contribution exceptionnelle hauts revenus |
| `calcPFU(montant)` | Flat tax 30% sur dividendes / PV |

---

## Sécurité

Identique à Portfolio Dev :
- Token secret dans les Script Properties AppScript
- URL AppScript + token dans le `localStorage` du navigateur (jamais dans le repo)
- Écran de configuration au premier lancement
