# Calcul fiscal — SASU à l'IR (Impôt sur le Revenu)

> Document de référence pour Portfolio Pro — décrit la logique de calcul implémentée dans `js/app.js`.

---

## 1. Contexte : pourquoi une SASU à l'IR ?

Une SASU est normalement soumise à l'IS (Impôt sur les Sociétés). L'option IR est possible pendant les 5 premières années sur option expresse. Dans ce régime :

- Le résultat de la société est **directement imposé entre les mains de l'associé unique** comme des BNC (Bénéfices Non Commerciaux).
- Il n'y a **pas de distinction salaire / dividende** : le résultat net de la société = assiette imposable de l'associé.
- Les prélèvements sociaux (CSG/CRDS) s'appliquent sur cette assiette, mais leur taux exact est **fiscalement ambigu** (voir section 3).

---

## 2. Construction de l'assiette BNC

L'assiette est construite en 3 niveaux selon le degré de certitude des encaissements.

### 2.1 Assiette courante ✅
Uniquement les paiements **confirmés reçus** (état `✓` dans le bilan).

```
Assiette courante = Σ CA HT des factures marquées ✓ − Dépenses HT totales
```

### 2.2 Assiette court terme ⏳
Paiements confirmés **+** paiements marqués comme prévus prochainement (état `⏳`).

```
Assiette court terme = Σ CA HT (✓ + ⏳) − Dépenses HT totales
```

### 2.3 Assiette fin d'année 📅
Prévisionnel complet de l'année : tous les mois calculés selon le CRA prévisionnel, quelle que soit leur confirmation.

```
Assiette fin d'année = CA HT prévisionnel annuel − Dépenses HT totales
```

> **Note importante** : le CA d'une mission est calculé sur les mois effectivement dans la plage de la mission (date début → date fin), pas sur 12 mois complets.

---

## 3. CSG / CRDS sur revenus de la SASU IR

C'est la zone grise fiscale. Trois scénarios sont proposés :

| Scénario | Taux | Cas d'usage |
|----------|------|-------------|
| 0 % — Exonération | 0 % | Cas rarissime, exonération explicite |
| 9,7 % — Taux activité | 9,7 % | Taux applicable aux revenus d'activité non salariée |
| 17,2 % — Revenus du capital | 17,2 % | Taux prélèvements sociaux si assimilé à revenus du capital |

```
CSG/CRDS = Assiette BNC × taux du scénario
```

### Point clé : CSG déductible N+1

Au taux de 9,7 %, une fraction de 6,8 % est théoriquement déductible de l'IR **l'année suivante** (N+1), pas l'année en cours. L'outil calcule donc **l'IR sur l'assiette pleine** sans déduire la CSG de l'année N. Cette déduction N+1 est à prendre en compte séparément lors de la déclaration suivante.

---

## 4. Calcul de l'Impôt sur le Revenu (IR)

### 4.1 Paramètres du foyer fiscal

| Paramètre | Description |
|-----------|-------------|
| Situation | Célibataire / Marié(e) ou pacsé(e) |
| Nb enfants | Détermine le quotient familial |
| Salaires (vous + conjoint) | En brut ou net fiscal |
| BNC SASU | = assiette construite ci-dessus |
| Revenus fonciers nets | Régime réel |
| Micro-foncier brut | Abattement 30 % appliqué automatiquement |
| Dividendes (barème / PFU) | Option barème = abattement 40 % ; PFU = flat tax 30 % |
| Plus-values (barème / PFU) | Idem dividendes |
| Autres revenus | Libre |
| Déduction PER | Plan d'Épargne Retraite |
| PAS déjà versé | Prélèvement à la source déjà payé (vous + conjoint) |

### 4.2 Étapes du calcul

#### Étape 1 — Abattements préliminaires

**Salaires bruts → nets fiscaux** (si mode brut) :
```
Abattement 10 % par personne, min 504 €, max 14 555 € (barème 2025)
Salaires net fiscal = Σ(salaire_i − abattement_i)
```

**Dividendes option barème** :
```
Abattement 40 % → dividendes nets = dividendes × 60 %
```

**Micro-foncier** :
```
Abattement 30 % → micro-foncier net = micro-foncier × 70 %
```

#### Étape 2 — Revenu net global
```
Revenu net global = Salaires nets + BNC + Foncier réel + Micro-foncier net
                  + Dividendes barème nets + Plus-values barème + Autres
```

#### Étape 3 — Déduction PER
```
Déduction PER = min(PER saisi, Revenu net global)
Revenu imposable = max(0, Revenu net global − Déduction PER)
```

> Le PER réduit le revenu imposable mais **pas le Revenu Fiscal de Référence** (RFR) utilisé pour la CEHR.

#### Étape 4 — Quotient familial

```
Célibataire sans enfant  → 1 part
Marié sans enfant        → 2 parts
+ 1er enfant             → +0,5 part
+ 2e enfant              → +0,5 part (total +1 part pour 2 enfants)
+ à partir du 3e         → +1 part par enfant supplémentaire
```

#### Étape 5 — Impôt brut au barème

Barème 2025 (revenus déclarés en 2026) :

| Tranche | Taux |
|---------|------|
| 0 € → 11 600 € | 0 % |
| 11 600 € → 29 579 € | 11 % |
| 29 579 € → 84 577 € | 30 % |
| 84 577 € → 181 917 € | 41 % |
| > 181 917 € | 45 % |

```
# Calcul sur 1 part (enfants)
Impôt sans enfants = barème(Revenu imposable / parts_base) × parts_base
Impôt avec QF      = barème(Revenu imposable / nbParts) × nbParts

Avantage QF = max(0, Impôt sans enfants − Impôt avec QF)
Plafond QF  = 1 807 € × (demi-parts supplémentaires) [barème 2025]

Avantage réel = min(Avantage QF, Plafond QF)
Impôt brut    = Impôt sans enfants − Avantage réel
```

#### Étape 6 — Décote

Mécanisme d'allégement pour les faibles revenus :

| Situation | Seuil d'impôt brut | Base décote |
|-----------|-------------------|-------------|
| Célibataire | < 1 982 € | 897 € |
| Couple | < 3 275 € | 1 483 € |

```
Décote = max(0, base − 0,4525 × impôt_brut)
Impôt net = max(0, impôt brut − décote)
```

#### Étape 7 — CEHR (Contribution Exceptionnelle sur les Hauts Revenus)

Calculée sur le **Revenu Fiscal de Référence** (RFR = revenu net global + PFU) :

| Situation | Tranche 1 | Tranche 2 |
|-----------|-----------|-----------|
| Célibataire | 250 000 € → 500 000 € : 3 % | > 500 000 € : 4 % |
| Couple | 500 000 € → 1 000 000 € : 3 % | > 1 000 000 € : 4 % |

#### Étape 8 — Prélèvements sociaux sur revenus fonciers

```
PS fonciers = (Foncier réel + Micro-foncier net) × 17,2 %
  dont CSG  9,2 %
  dont CRDS 0,5 %
  dont Prél. solidarité 7,5 %
```

Les PS sur dividendes barème : `dividendes_bareme × 17,2 %`

#### Étape 9 — PFU (Flat Tax 30 %)

Pour dividendes et plus-values en option PFU :
```
PFU = montant × 30 %  (= 12,8 % IR + 17,2 % PS déjà inclus)
```

#### Étape 10 — Réductions d'impôt (non remboursables)

| Réduction | Calcul |
|-----------|--------|
| Dons associations | 66 % du montant, dans la limite de 20 % du revenu imposable |
| Scolarité collège | 61 € / enfant |
| Scolarité lycée | 153 € / enfant |
| Scolarité supérieur | 183 € / enfant |

```
Impôt après réductions = max(0, Impôt net + CEHR − Total réductions)
```

#### Étape 11 — Crédits d'impôt (remboursables)

| Crédit | Calcul | Plafond |
|--------|--------|---------|
| Garde enfants < 6 ans | 50 % des dépenses | 1 750 €/enfant |
| Emploi à domicile | 50 % des dépenses | 6 000 € |
| Formation dirigeant | Montant crédit direct | — |
| Autres crédits | Montant libre | — |

#### Étape 12 — Synthèse finale

```
Impôt final = max(0, Impôt après réductions − Crédits) + PFU + PS fonciers

Reste à payer = Impôt final − PAS déjà versé (vous + conjoint)
  → positif = solde à payer
  → négatif = remboursement

Taux effectif moyen = Impôt final / Revenu total brut × 100
```

---

## 5. Résultat net d'impôt SASU IR

Une fois IR et CSG/CRDS calculés, le **net d'impôt** est affiché pour chaque scénario CSG :

```
Net d'impôt = Assiette BNC − CSG/CRDS − Impôt IR total
```

Trois colonnes sont présentées en parallèle (0 %, 9,7 %, 17,2 %) pour chacune des 3 assiettes.

---

## 6. Calcul des deltas entre assiettes

Pour mesurer le **gain marginal** entre l'assiette courante et les assiettes supérieures :

```
Δ BNC brut    = Assiette comparée − Assiette courante

Δ IR (solde)  = max(0, resteAPayer_comparé) − max(0, resteAPayer_courant)
  → Le plancher à 0 évite qu'un remboursement PAS (resteAPayer négatif)
    ne gonfle artificiellement le delta

Δ CSG/CRDS    = CSG_comparée − CSG_courante   [ligne séparée du Δ IR]

Δ Net         = Net_comparé − Net_courant
```

> **Exemple** : si l'assiette courante génère −3 000 € de reste à payer (remboursement PAS) et l'assiette fin d'année 40 000 €, le Δ IR est `40 000 − 0 = 40 000 €` et non `40 000 − (−3 000) = 43 000 €`.

---

## 7. Barèmes intégrés

L'outil contient les barèmes **2024** et **2025**. Pour ajouter une nouvelle année, il suffit d'ajouter une entrée dans l'objet `BAREMES` dans `app.js` avec les tranches, plafonds QF, paramètres de décote et seuils CEHR mis à jour.

---

## 8. Limites et points d'attention

| Point | Détail |
|-------|--------|
| CSG déductible N+1 | Les 6,8 % de CSG déductible au taux 9,7 % ne sont **pas** déduits de l'IR de l'année N dans le simulateur. À prendre en compte manuellement l'année suivante. |
| Charges sociales TNS | Une SASU IR n'a pas de cotisations TNS (pas de régime social de l'indépendant). La CSG/CRDS simulée ici est celle sur les revenus, pas des cotisations sociales. |
| Abattement BNC | Aucun abattement forfaitaire BNC n'est appliqué — l'assiette est le **résultat net** après dépenses réelles. |
| Plafond PER | La déductibilité PER est plafonnée au revenu global — le simulateur l'applique automatiquement. |
| Micro-foncier | Applicable uniquement si le total des recettes brutes foncières est ≤ 15 000 €/an. |
| CEHR | Rarement déclenchée en pratique (seuil 250 000 € pour un célibataire). |
