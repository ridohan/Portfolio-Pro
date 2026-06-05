# Module Gestion de Société — Spécifications d'implémentation

## Vue d'ensemble

Le module "Société" permet de gérer les activités de conseil/freelance d'une ou plusieurs sociétés. Il s'articule autour de trois niveaux :

1. **Fiche société** — informations légales (déjà partiellement implémenté)
2. **Missions** — clients, TJM, TVA, délai de paiement
3. **CRA Prévisionnel** — tableau mensuel de jours facturables par mission → CA prévisionnel

Futur (hors scope immédiat) : prévisionnel de trésorerie avec décalage de paiement, résultat fiscal, charges sociales TNS.

---

## Modèle de données

### `societes` (existant — à compléter si besoin)

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique |
| `nom` | string | Raison sociale |
| `forme` | string | `ei` \| `eurl` \| `sarl` \| `sas` \| `sasu` \| `snc` \| `sci` |
| `regime_fiscal` | string | `ir` \| `is` |
| `date_creation` | date | Date de création |
| `capital` | number | Capital social (€) |
| `note` | string | Note libre |

### `missions` (nouveau)

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique (ex: `mis_xxx`) |
| `societe_id` | string | Référence vers `societes.id` |
| `client` | string | Nom du client |
| `tjm` | number | Taux journalier moyen (€ HT) |
| `tva` | boolean | `true` = TVA applicable (20%), `false` = sans TVA (client étranger, franchise...) |
| `delai_paiement` | number | Délai de paiement en jours (défaut : 30) |
| `date_debut` | date | Date de début de mission |
| `date_fin` | date \| null | Date de fin de mission (null = en cours) |
| `actif` | boolean | Mission active ou archivée |
| `note` | string | Note libre |

### `cra_entries` (nouveau)

Un enregistrement = une mission × un mois. Les mois sans absence ni surcharge n'ont pas d'entrée (valeurs implicites par défaut).

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant unique |
| `mission_id` | string | Référence vers `missions.id` |
| `societe_id` | string | Dénormalisé pour faciliter les requêtes |
| `annee` | number | Année (ex: 2025) |
| `mois` | number | Mois (1 à 12) |
| `jours_absence` | number | Jours d'absence prévus pour cette mission ce mois (défaut : 0) |
| `jours_dispo_override` | number \| null | Surcharge du nombre de jours disponibles (null = calcul automatique) |

---

## Calcul des jours ouvrés

### Algorithme automatique

Pour chaque mois `(annee, mois)`, on compte les lundis→vendredis moins les jours fériés FR tombant un jour ouvré :

```js
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

function getJoursFeriesFR(annee) {
  // Algorithme de Gauss pour la date de Pâques
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
    new Date(annee, 0,  1),  // 1er janvier
    j(1),                    // Lundi de Pâques
    new Date(annee, 4,  1),  // 1er mai
    new Date(annee, 4,  8),  // 8 mai
    j(39),                   // Ascension
    j(50),                   // Lundi de Pentecôte
    new Date(annee, 6,  14), // 14 juillet
    new Date(annee, 7,  15), // 15 août
    new Date(annee, 10, 1),  // 1er novembre
    new Date(annee, 10, 11), // 11 novembre
    new Date(annee, 11, 25), // 25 décembre
  ];
}
```

### Surcharge par mission/mois

Certains clients ont des calendriers différents (jours fériés étrangers). Si `jours_dispo_override` est renseigné pour une entrée `(mission_id, annee, mois)`, il remplace le calcul automatique **uniquement pour cette mission ce mois**.

```
jours_facturables = max(0, (jours_dispo_override ?? joursOuvresAuto) - jours_absence)
```

---

## Calcul du CA par cellule

```
jours_facturables = max(0, jours_dispo - jours_absence)
ca_ht    = jours_facturables × tjm
ca_ttc   = tva ? ca_ht × 1.20 : ca_ht       (si pas de TVA : TTC = HT)
tva_due  = ca_ttc - ca_ht
```

---

## Interface — Vue détail société

### Onglets

```
Fiche  |  Missions  |  CRA Prévisionnel
```

---

### Onglet "Missions"

**Liste des missions actives** — cartes :

```
█ Acme Corp              TJM : 650 €/j    TVA : oui    Délai : 30 j
  Depuis 01/03/2025 — en cours                     [Modifier]  [Archiver]

█ ClientUS               TJM : 800 €/j    TVA : non    Délai : 45 j
  Depuis 15/01/2025 — en cours                     [Modifier]  [Archiver]
```

**Formulaire ajout / modification (modale) :**

| Champ | Contrôle | Défaut / Validation |
|---|---|---|
| Nom du client | text | Requis |
| TJM | number (€/j) | > 0, requis |
| TVA applicable | toggle oui / non | oui |
| Délai de paiement | number (jours) | 30 |
| Date de début | date | Requis |
| Date de fin | date | Optionnel |
| Note | textarea | — |

**Règles :**
- Pas de suppression : archivage uniquement (`actif: false`)
- Les missions archivées sont masquées par défaut, affichables via "Voir les missions archivées"

---

### Onglet "CRA Prévisionnel"

#### Structure du tableau

```
                  Jan 2025   Fév 2025   Mar 2025  …   Total
                   23 j ouv.  20 j ouv.  21 j ouv.
──────────────────────────────────────────────────────────────
Acme Corp                                                      HT | TTC
650 €/j · TVA     [0]abs     [2]abs     [0]abs         …
                  23 j fact  18 j fact  21 j fact
                  14 950 €   11 700 €   13 650 €       …
──────────────────────────────────────────────────────────────
ClientUS                                                       HT | TTC
800 €/j · no TVA  [0]abs     [0]abs     [5]abs         …
                  23 j fact  20 j fact  16 j fact
                  18 400 €   16 000 €   12 800 €       …
──────────────────────────────────────────────────────────────
TOTAL HT          33 350 €   27 700 €   26 450 €       …
TOTAL TTC         35 870 €   29 640 €   28 370 €       …
```

#### En-tête de colonne (mois)

```
Janvier 2025
23 j ouvrés        ← calcul auto, ou surcharge globale du mois (rare)
```

#### Cellule (mission × mois)

```
[ 2 ] j absence   ← input numérique inline, défaut 0
─────────────────
  21 j facturés
13 650 € HT
16 380 € TTC

✏ 25 j            ← si jours_dispo_override, affiché en petit avec icône
```

Si la mission a une `date_fin` dépassée pour ce mois → cellule grisée, non éditable.

#### Colonne totaux (droite)

Par mission : total annuel HT + total annuel TTC.

#### Ligne totaux (bas)

Par mois : somme CA HT toutes missions + somme CA TTC toutes missions + total jours facturés.

#### Interactions utilisateur

| Action | Déclencheur | Sauvegarde |
|---|---|---|
| Saisir jours absence | Input inline → blur ou Enter | `API.saveCRAEntry({mission_id, annee, mois, jours_absence})` |
| Surcharger jours dispo | Clic sur ✏ de la cellule d'en-tête → mini-modal | `API.saveCRAEntry({..., jours_dispo_override: val})` |
| Réinitialiser surcharge | Vider le champ de surcharge | `jours_dispo_override: null` → supprimer l'entrée si aussi `jours_absence === 0` |
| Changer d'année | Sélecteur `← 2024 | 2025 | 2026 →` | Pas de sauvegarde, recalcul local |

---

## API — Nouvelles actions AppScript

```js
// Missions
API.saveMission(data)      // upsert sur id (créer ou modifier)
API.archiveMission(id)     // passe actif: false

// CRA
API.saveCRAEntry(data)     // upsert sur (mission_id, annee, mois)
API.deleteCRAEntry(id)     // supprimer une entrée (retour aux valeurs par défaut)
```

**Extension de `getData` :**

```js
STATE = {
  societes:        [],
  missions:        [],     // ← nouveau
  cra_entries:     [],     // ← nouveau
  simulations_ir:  [],
  exercices_fiscaux: [],
  ui_prefs:        [],
}
```

**Nouveaux onglets Google Sheet :**

`missions` : `id | societe_id | client | tjm | tva | delai_paiement | date_debut | date_fin | actif | note`

`cra_entries` : `id | mission_id | societe_id | annee | mois | jours_absence | jours_dispo_override`

---

## Fonctions de calcul (JS pur)

```js
// Récupérer les missions actives d'une société
function getMissionsActives(societeId) {
  return STATE.missions.filter(m => m.societe_id === societeId && m.actif !== false);
}

// Récupérer une entrée CRA (avec valeurs par défaut si absente)
function getCRAEntry(missionId, annee, mois) {
  return STATE.cra_entries.find(
    e => e.mission_id === missionId && e.annee == annee && e.mois == mois
  ) || { jours_absence: 0, jours_dispo_override: null };
}

// Calcul complet pour une cellule (mission × mois)
function calcCRACell(mission, annee, mois) {
  const entry     = getCRAEntry(mission.id, annee, mois);
  const jousDispo = entry.jours_dispo_override ?? calcJoursOuvres(annee, mois);
  const jFact     = Math.max(0, jousDispo - (entry.jours_absence || 0));
  const caHT      = jFact * mission.tjm;
  const caTTC     = mission.tva ? Math.round(caHT * 1.20) : caHT;
  return {
    jFact,
    jousDispo,
    joursAbsence:   entry.jours_absence || 0,
    joursOverride:  entry.jours_dispo_override,
    caHT,
    caTTC,
    tvaDue: caTTC - caHT,
  };
}

// Totaux mensuels toutes missions d'une société
function calcCRATotauxMois(societeId, annee, mois) {
  return getMissionsActives(societeId).reduce((acc, m) => {
    const c = calcCRACell(m, annee, mois);
    acc.jours += c.jFact;
    acc.caHT  += c.caHT;
    acc.caTTC += c.caTTC;
    return acc;
  }, { jours: 0, caHT: 0, caTTC: 0 });
}

// Totaux annuels par mission
function calcCRATotauxMission(mission, annee) {
  let caHT = 0, caTTC = 0, jours = 0;
  for (let mois = 1; mois <= 12; mois++) {
    const c = calcCRACell(mission, annee, mois);
    caHT  += c.caHT;
    caTTC += c.caTTC;
    jours += c.jFact;
  }
  return { caHT, caTTC, jours };
}
```

---

## Périmètre MVP

### Dans le scope

- [ ] Missions : liste, ajout, modification, archivage
- [ ] CRA Prévisionnel : tableau 12 mois
- [ ] Calcul automatique des jours ouvrés (jours fériés FR inclus)
- [ ] Saisie des jours d'absence par mission/mois (inline)
- [ ] Surcharge des jours disponibles par mission/mois
- [ ] Totaux CA HT/TTC par mois et par mission
- [ ] Persistance localStorage + sync Google Sheets

### Hors scope (futures itérations)

- [ ] **Prévisionnel de trésorerie** : encaissements décalés selon `delai_paiement`
  - *CA facturé en mois M → encaissement attendu en mois M + ceil(delai/30)*
  - *Vue "cash flow" : courbe encaissements prévisionnels mois par mois*
- [ ] **CRA réel vs prévisionnel** : saisie des jours réellement travaillés en fin de mois, comparaison
- [ ] **Résultat prévisionnel** : CA − charges fixes − charges variables → résultat fiscal
- [ ] **Charges sociales TNS** : calcul des cotisations sur résultat (pour EI/gérant majoritaire EURL IR)
- [ ] **Lien simulateur IR** : injection automatique du résultat société → champ BIC/BNC du simulateur IR
- [ ] **Export** : PDF / Excel du CRA mensuel ou annuel

---

## Notes de conception UI

- Le tableau CRA est large (12 colonnes) → **scroll horizontal** sur mobile, pleine largeur sur desktop
- **État visuel des cellules :**
  - Mois sans absence ni surcharge → fond neutre (slate)
  - Mois avec absence → fond légèrement coloré (amber teinté)
  - Mois avec surcharge jours dispo → indicateur ✏ visible
  - Mois passé → opacité réduite
  - Mois courant → mise en valeur (bordure bleue)
  - Mois après `date_fin` de la mission → grisé, non éditable
- **Missions sans TVA** : badge "sans TVA" sur la ligne de mission
- **Performance** : tout le calcul est local (JS pur), pas de requête réseau au changement d'année ou de cellule — uniquement au moment de la sauvegarde
