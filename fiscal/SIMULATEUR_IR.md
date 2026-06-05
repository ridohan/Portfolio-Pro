# Simulateur IR — Documentation

## Vue d'ensemble

Le simulateur IR est le premier module de **Portfolio Pro**. Il permet de calculer l'impôt sur le revenu d'un foyer fiscal français selon le barème progressif officiel, avec prise en charge des déductions, réductions, crédits d'impôt, prélèvements sociaux et prélèvement à la source.

Il fonctionne en mode **calculatrice temps réel** : chaque modification d'un champ met à jour instantanément tous les résultats, sans validation.

Les simulations sont sauvegardées en **localStorage** — aucun serveur requis, les données restent locales.

---

## Calcul de l'impôt — logique complète

### 1. Barème progressif (`BAREMES`)

Les tranches sont paramétrables par année pour faciliter les mises à jour annuelles.

**Revenus 2025 (déclaration 2026) :**

| Tranche | Taux |
|---|---|
| 0 — 11 600 € | 0 % |
| 11 600 — 29 579 € | 11 % |
| 29 579 — 84 577 € | 30 % |
| 84 577 — 181 917 € | 41 % |
| > 181 917 € | 45 % |

Chaque objet `BAREMES[annee]` contient également : `plafond_demi_part`, les bornes d'abattement salaires (`abatt_sal_min`, `abatt_sal_max`), les paramètres de décote et les seuils CEHR.

---

### 2. Revenus pris en compte

| Champ | Description |
|---|---|
| Salaires (vous / conjoint) | Saisissables en brut (abattement 10% auto) ou en net fiscal |
| BIC / BNC | Résultat net professionnel |
| Revenus fonciers — régime réel | Revenus nets après charges |
| Micro-foncier — recettes brutes | Abattement 30% appliqué automatiquement |
| Dividendes — option barème | Abattement 40% + intégration au barème IR |
| Dividendes — PFU | Flat tax 30% (12,8 % IR + 17,2 % PS) |
| Plus-values mobilières — barème | Intégration au barème IR |
| Plus-values mobilières — PFU | Flat tax 30% |
| Autres revenus | Tout autre revenu imposable |

---

### 3. Abattement 10 % sur salaires

Appliqué **par personne séparément** (règle fiscale française) :

```
abattement_personne = min(max(salaire × 10%, min_504€), max_14555€)
abattement_total = abattement_vous + abattement_conjoint
```

Le minimum de 504 € s'applique individuellement — ce qui est crucial pour les petits salaires (ex. 1 500 € brut → abattement 504 € et non 150 €).

---

### 4. Quotient familial et plafonnement

**Parts fiscales :**

| Situation | Parts de base | Enfants |
|---|---|---|
| Célibataire / Divorcé / Veuf | 1 | +0,5/enfant pour le 1er et 2e, +1 au-delà |
| Marié / Pacsé | 2 | idem |

**Calcul avec plafonnement :**

1. Calculer l'impôt sur `baseParts` (2 pour couple, 1 sinon)
2. Calculer l'impôt sur `nbParts` (avec enfants)
3. `avantageQF = impotBase − impotAvecQF`
4. `plafond = 1 807 € × (demi-parts supplémentaires)`
5. `avantageRéel = min(avantageQF, plafond)`
6. `impôtBrut = impotBase − avantageRéel`

---

### 5. Décote

Appliquée si l'impôt brut est inférieur à un seuil :

| Situation | Seuil | Formule |
|---|---|---|
| Célibataire | < 1 982 € | 897 − 0,4525 × impôtBrut |
| Couple | < 3 275 € | 1 483 − 0,4525 × impôtBrut |

---

### 6. CEHR (Contribution Exceptionnelle sur les Hauts Revenus)

Calculée sur le **Revenu Fiscal de Référence** (RFR = revenu net global + dividendes PFU + PV PFU). La déduction PER ne réduit pas le RFR.

| Situation | Tranche | Taux |
|---|---|---|
| Célibataire | 250 000 — 500 000 € | 3 % |
| Célibataire | > 500 000 € | 4 % |
| Couple | 500 000 — 1 000 000 € | 3 % |
| Couple | > 1 000 000 € | 4 % |

---

### 7. Prélèvements sociaux (17,2 %) sur revenus du patrimoine

Calculés séparément de l'IR, **hors PFU** (qui les inclut déjà) :

| Source | Base | PS |
|---|---|---|
| Micro-foncier | Recettes brutes × 70% (net après abatt. 30%) | × 17,2 % |
| Foncier réel | Revenu net déclaré | × 17,2 % |
| Dividendes barème | Montant brut (l'abatt. 40% ne s'applique pas aux PS) | × 17,2 % |

**Détail CSG/CRDS :**
- CSG 9,2 %
- CRDS 0,5 %
- Prélèvement de solidarité 7,5 %

---

### 8. Déductions du revenu

| Déduction | Effet |
|---|---|
| PER | Réduit le revenu imposable avant application du barème (dans la limite du revenu net global). Ne réduit pas le RFR. |

---

### 9. Réductions d'impôt (non remboursables)

| Réduction | Calcul |
|---|---|
| Dons aux associations | 66 % des versements, dans la limite de 20 % du revenu imposable |
| Scolarité — collège | 61 € / enfant |
| Scolarité — lycée | 153 € / enfant |
| Scolarité — enseignement supérieur | 183 € / enfant |

Les réductions sont imputées sur l'impôt net (barème + CEHR). Elles ne génèrent pas de remboursement si elles excèdent l'impôt dû.

---

### 10. Crédits d'impôt (remboursables)

| Crédit | Calcul | Plafond |
|---|---|---|
| Garde d'enfants < 6 ans | 50 % des frais | 1 750 € de crédit / enfant |
| Emploi à domicile (femme de ménage, etc.) | 50 % des frais | 6 000 € de crédit (12 000 € de frais) |
| Formation dirigeant | Montant direct (SMIC horaire × heures) | — |
| Autres crédits | Montant direct | — |

Les crédits sont remboursables : si leur total excède l'impôt restant dû, la différence est **remboursée** par l'État.

---

### 11. Prélèvement à la source (PAS)

Saisissable séparément pour le déclarant et le conjoint (retenues mensuelles employeur + acomptes versés dans l'année).

```
Reste à payer = impôt final − PAS total versé
```

- Positif → solde à régler
- Négatif → remboursement attendu

---

### 12. Synthèse finale

```
impôt final = max(0, IR barème net + CEHR − réductions − crédits) + PFU + PS patrimoine
reste à payer = impôt final − PAS versé
```

---

## Interface utilisateur

### Formulaire (colonne gauche)

Organisé en **blocs collapsibles** (`<details>/<summary>`) :

| Bloc | Ouvert par défaut |
|---|---|
| Situation fiscale | ✅ |
| Revenus (salaires, BIC, foncier, micro-foncier) | ✅ |
| Dividendes, plus-values & autres | ❌ |
| Déductions du revenu (PER) | ❌ |
| Réductions d'impôt | ❌ |
| Crédits d'impôt | ❌ |
| Prélèvements déjà effectués | ❌ |

**Champs conjoint :** quand la situation est "Marié / Pacsé", les champs salaires et PAS s'affichent en deux colonnes (Vous / Conjoint·e). La modification de la situation familiale re-rend le formulaire automatiquement.

**Toggle Brut / Net fiscal :** le mode de saisie des salaires (brut avec abattement 10% auto, ou net fiscal directement). Le changement re-rend le formulaire pour mettre à jour l'apparence du toggle.

### Résultats (colonne droite)

1. **Métriques clés** — 3 cartes : total impôts / taux moyen / taux marginal (ou "reste à payer" si PAS renseigné)
2. **Décomposition par tranche** — barre de progression colorée + tableau
3. **Calcul IR barème** — détail étape par étape (abattements, QF, plafonnement, décote)
4. **PFU** — si dividendes ou PV au PFU
5. **Prélèvements sociaux** — si revenus fonciers ou dividendes barème
6. **Réductions & Crédits** — si renseignés
7. **Récapitulatif** — synthèse avec PAS et reste à payer / remboursement

---

## Gestion des simulations (localStorage)

### Sauvegarde

- Clé localStorage : `portfoliopro_simulations_ir`
- Chaque simulation contient : `id`, `nom`, `created_at`, `updated_at` (optionnel), `state` (snapshot complet de `_irState`), `summary` (impôt final, taux moyen, situation — pour affichage rapide)

### Workflow

| Action | Comportement |
|---|---|
| **Sauvegarder** (nouvelle) | Demande un nom → crée une nouvelle entrée → devient la simulation courante |
| **Mettre à jour** (existante) | Écrase la simulation courante (sans prompt) → conserve la date de création |
| **+ Nouvelle copie** | Demande un nom → crée une copie indépendante |
| **Charger** | Restaure tous les champs du formulaire → devient la simulation courante |
| **Renommer** | Prompt pré-rempli → mise à jour du nom |
| **Supprimer** | Confirmation → suppression → reset de la simulation courante si nécessaire |

### Simulation courante (`_currentSimId`)

La variable `_currentSimId` (en mémoire) indique quelle simulation est active. Les boutons du header s'adaptent :
- `null` → bouton "💾 Sauvegarder"
- ID connu → boutons "💾 Mettre à jour" + "+ Nouvelle copie"

Le nom de la simulation en cours s'affiche sous le titre en bleu.

---

## Précision du calcul

Le simulateur a été validé contre le simulateur officiel impots.gouv.fr et le simulateur Boursorama sur plusieurs cas de test :

| Cas | Impôts.gouv | Notre simulateur | Écart |
|---|---|---|---|
| 60 000 € brut, marié, 2 enfants | 1 585 € | 1 585 € | 0 € |
| 45 000 € net fiscal, marié, 2 enfants | 147 € | 147 € | 0 € |
| 154 400 € brut, marié, 2 enfants | 24 547 € | 24 548 € | 1 € (arrondi) |
| 167 863 € (mix salaires + BIC + micro-foncier), marié, 2 enfants | 162 309 € (base) | 162 314 € (base) | 5 € (arrondi micro-foncier) |

> **Point clé** : l'abattement 10% sur salaires s'applique **par personne** (minimum 504 €/personne). Un petit salaire de 1 500 € bénéficie d'un abattement de 504 € et non de 150 €. Cette règle est critique pour les foyers avec une forte asymétrie de revenus.

---

## Évolutions prévues

- Synchronisation des simulations avec Google Sheets (via AppScript) quand la connexion est configurée
- Utilisation du simulateur IR dans le module de gestion des sociétés à l'IR (EI, SNC, SCI, EURL)
- Comparateur multi-simulations côte à côte
- Export PDF / impression
