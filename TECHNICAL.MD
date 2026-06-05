# Architecture Technique — Portfolio Pro

## Contraintes

- Application **100% statique** — HTML, CSS, JavaScript vanilla
- Hébergée sur **GitHub Pages** (ou équivalent)
- **Aucun backend, aucune base de données serveur**
- Google Sheets est la **seule source de vérité** pour toutes les données persistées

---

## Vue d'ensemble

```
App HTML (fichier local ou GitHub Pages)
    │
    │  lecture / écriture synchrone
    ▼
localStorage (navigateur)
    └── portfoliopro_data     ← STATE complet sérialisé en JSON
```

Pas de serveur, pas de réseau, pas de dépendance externe.
Les données sont exportables / importables via un fichier JSON horodaté.

---

## Structure de STATE

Objet unique sérialisé dans `localStorage` sous la clé `portfoliopro_data` :

```js
STATE = {
  societes:          [],   // fiches société
  missions:          [],   // missions par société
  cra_entries:       [],   // entrées CRA (mission × mois)
  simulations_ir:    [],   // simulations IR sauvegardées (via localStorage dédié)
  exercices_fiscaux: [],   // données fiscales annuelles par société
}
```

> Note : les simulations IR sont également stockées séparément sous la clé `portfoliopro_simulations_ir` pour un accès indépendant depuis le simulateur.

---

## Backup / Restauration

- **Export** : bouton dans ⚙ Paramètres → génère `portfoliopro_backup_YYYY-MM-DD.json`
- **Import** : bouton dans ⚙ Paramètres → sélection d'un fichier JSON → remplacement du STATE complet
- **Réinitialisation** : bouton rouge dans ⚙ Paramètres → remet STATE à zéro

---

## Architecture du code

### Fichiers

```
index.html          ← point d'entrée unique
js/
  storage.js        ← persistance localStorage (load/save/export/import)
  app.js            ← application complète (router + vues + calculs)
fiscal/
  INSTRUCTIONS.MD   ← documentation du module fiscal
  SIMULATEUR_IR.md  ← documentation détaillée du simulateur IR
societe/
  GENERAL.MD        ← spécifications du module société / CRA
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

Les données restent dans le navigateur — elles ne transitent jamais sur un réseau.
Aucune configuration requise au premier lancement.
