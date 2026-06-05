# Portfolio Pro — Instructions générales

## Vue d'ensemble

**Portfolio Pro** est un outil de gestion de sociétés et de fiscalité d'entreprise. Il complète Portfolio Dev (patrimoine personnel) en se concentrant sur les aspects professionnels :

- **Tableau de bord** : vue synthèse par société
- **Simulateur fiscal IR** : calcul de l'impôt sur le revenu (personnel et sociétés à l'IR)
- **Gestion IS** : impôt sur les sociétés (prévu)
- **Prévisionnel** : projections de trésorerie et résultats (prévu)
- **Charges sociales** : calcul des cotisations TNS / salariales (prévu)

---

## Structure de navigation

```
Dashboard (vue synthèse sociétés)
├── Fiscal
│   ├── Simulateur IR
│   │   ├── Mode personnel
│   │   └── Mode société IR (EI, SNC, SCI, EURL IS → IR)
│   ├── Simulateur IS (prévu)
│   └── Historique fiscal (prévu)
├── Sociétés
│   ├── Fiche société (forme juridique, capital, associés)
│   └── Comptes annuels (prévu)
└── Prévisionnel (prévu)
```

---

## Module : Simulateur IR

Calcul de l'impôt sur le revenu selon le barème progressif français.

### Cas d'usage

1. **Mode personnel** : simuler son IR en tant que particulier (salarié, indépendant, investisseur)
2. **Mode société à l'IR** : calculer l'IR d'une EI, SNC, SCI ou EURL soumise à l'IR — les bénéfices s'ajoutent aux autres revenus du foyer fiscal

### Sources de revenus supportées

| Catégorie | Code | Régime |
|---|---|---|
| Salaires / traitements | `salaire` | Abattement 10% (min 495€, max 14 171€) |
| Dividendes (PFU) | `dividendes_pfu` | PFU 30% (flat tax) — hors barème IR |
| Dividendes (barème) | `dividendes_bareme` | Abattement 40% puis barème IR |
| BIC / BNC (résultat net) | `bic_bnc` | Intégré au revenu global sans abattement |
| Plus-values mobilières | `pv_mobilier` | PFU 30% par défaut ou option barème + abattement durée |
| Revenus fonciers | `foncier` | Intégré au revenu global |

### Barème IR 2025 (revenus 2024)

| Tranche | Taux |
|---|---|
| Jusqu'à 11 497 € | 0 % |
| 11 497 € – 29 315 € | 11 % |
| 29 315 € – 83 823 € | 30 % |
| 83 823 € – 180 294 € | 41 % |
| Au-delà de 180 294 € | 45 % |

### Quotient familial

| Situation | Parts |
|---|---|
| Célibataire / Divorcé | 1 |
| Marié / Pacsé (imposition commune) | 2 |
| + 1er enfant à charge | + 0,5 |
| + 2ème enfant à charge | + 0,5 |
| + 3ème enfant et suivants | + 1 par enfant |

Plafond de l'avantage lié au quotient familial : 1 791 € par demi-part supplémentaire (2024).

### Décote

Réduction appliquée aux impôts modestes :
- Célibataire : si impôt brut < 1 929 € → décote = 873 − 0,4525 × impôt brut
- Couple : si impôt brut < 3 191 € → décote = 1 444 − 0,4525 × impôt brut

### CEHR (Contribution Exceptionnelle sur les Hauts Revenus)

| Revenu fiscal de référence | Taux (célibataire) | Taux (couple) |
|---|---|---|
| Jusqu'à 250 000 € | 0 % | 0 % |
| 250 000 € – 500 000 € | 3 % | 0 % |
| Au-delà de 500 000 € | 4 % | 3 % jusqu'à 1M, 4% au-delà |

### Sorties du simulateur

- Impôt brut par tranche (tableau de décomposition)
- Décote appliquée
- Impôt net avant CEHR
- CEHR
- **Total impôt dû**
- Taux moyen d'imposition
- Taux marginal d'imposition

---

## Principes généraux

- Application **100% statique** : HTML, CSS, JavaScript vanilla
- **Zéro dépendance** : pas de librairie JS, graphiques en SVG natif
- Données persistées dans **Google Sheets** (même architecture que Portfolio Dev)
- Préférences UI synchronisées cross-device via `ui_prefs`
- Dark theme (palette Slate de Tailwind)

---

## Voir aussi

- [Architecture technique](./TECHNICAL.MD)
- [Fiscal IR](./fiscal/INSTRUCTIONS.MD)
