# Calcul fiscal — SASU à l'IS (Impôt sur les Sociétés)

> Document de référence pour Portfolio Pro — décrit la logique de calcul IS implémentée dans `js/app.js`.

---

## 1. Contexte : SASU à l'IS

La SASU est par défaut soumise à l'IS. Contrairement à l'IR :

- L'impôt est payé **par la société**, pas par l'associé.
- L'associé ne déclare à l'IR **que ce qu'il se verse** : salaire (imposé comme traitement) et/ou dividendes (imposés en PFU ou barème).
- Le **résultat net après IS** reste dans la société jusqu'à décision de distribution.

---

## 2. Construction de l'assiette (résultat fiscal avant IS)

Identique au module IR — 3 niveaux d'assiette selon le degré de certitude :

### 2.1 Résultat courant ✅
```
Résultat courant = CA HT encaissé (paiements ✓ confirmés) − Dépenses HT totales
```

### 2.2 Résultat court terme ⏳
```
Résultat court terme = CA HT (✓ confirmés + ⏳ prévus) − Dépenses HT totales
```

### 2.3 Résultat prévisionnel fin d'année 📅
```
Résultat fin d'année = CA HT prévisionnel annuel (CRA) − Dépenses HT totales
```

> Les **salaires versés** (dirigeant ou salarié) sont des **dépenses** dans le bilan — ils réduisent donc l'assiette avant IS, exactement comme en comptabilité réelle (les salaires sont des charges déductibles).

---

## 3. Calcul de l'IS

### 3.1 Taux en vigueur (France, 2024-2025)

| Tranche | Taux | Condition |
|---------|------|-----------|
| 0 € → 42 500 € | **15 %** (taux réduit) | PME : CA < 10 M€, capital libéré, détenu à ≥ 75 % par des personnes physiques |
| > 42 500 € | **25 %** (taux normal) | Au-delà du seuil, ou si conditions PME non remplies |

> Ces taux et le seuil sont **paramétrables** dans l'interface (section ⚙️ Paramètres IS), ce qui permet de s'adapter à de futurs changements législatifs sans modifier le code.

### 3.2 Formule

```
Base taux réduit  = min(Résultat fiscal, Seuil)
Base taux normal  = max(0, Résultat fiscal − Seuil)

IS taux réduit    = Base réduite  × Taux réduit   (ex: × 15 %)
IS taux normal    = Base normale  × Taux normal    (ex: × 25 %)

IS total          = IS taux réduit + IS taux normal

Taux effectif IS  = IS total / Résultat fiscal × 100
```

### 3.3 Exemples chiffrés

| Résultat fiscal | IS taux réduit (15 %) | IS taux normal (25 %) | IS total | Taux effectif |
|----------------|----------------------|----------------------|----------|--------------|
| 30 000 € | 4 500 € | 0 € | **4 500 €** | 15,0 % |
| 42 500 € | 6 375 € | 0 € | **6 375 €** | 15,0 % |
| 80 000 € | 6 375 € | 9 375 € | **15 750 €** | 19,7 % |
| 150 000 € | 6 375 € | 26 875 € | **33 250 €** | 22,2 % |

---

## 4. Résultat après IS

```
Résultat net société = Résultat fiscal − IS total
```

Ce résultat reste **dans la société**. Il peut être affecté en :

- **Réserves** (report à nouveau, réserve légale 5 % jusqu'à 10 % du capital)
- **Distribution de dividendes** (vote en AG après approbation des comptes, soit l'année N+1)

### Ce que l'outil affiche

| Ligne | Description |
|-------|-------------|
| Résultat fiscal (avant IS) | = Assiette = CA − Dépenses (dont salaires) |
| IS à payer | Calculé selon les tranches |
| **Résultat net société** | Ce qui reste après IS |
| Salaires versés | Rappel des charges salariales passées en dépenses |

> 💡 Les dividendes ne sont **pas** déduits ici — ils seront distribués en N+1 et subiront alors la fiscalité personnelle de l'associé (PFU 30 % ou barème IR + prélèvements sociaux 17,2 %).

---

## 5. Deltas entre assiettes

Comme pour le module IR, des blocs delta permettent de visualiser le **gain marginal** :

### Delta court terme vs courant
```
Δ Résultat brut    = Assiette court terme − Assiette courante
Δ IS supplémentaire = IS(court terme) − IS(courant)
Δ Résultat net     = Résultat net(court terme) − Résultat net(courant)
```

### Delta fin d'année vs courant
```
Δ Résultat brut    = Assiette fin − Assiette courante
Δ IS supplémentaire = IS(fin) − IS(courant)
Δ Résultat net     = Résultat net(fin) − Résultat net(courant)
```

### Delta fin d'année vs court terme
```
Δ Résultat brut    = Assiette fin − Assiette court terme
Δ IS supplémentaire = IS(fin) − IS(court terme)
Δ Résultat net     = Résultat net(fin) − Résultat net(court terme)
```

---

## 6. Paramètres stockés

Les paramètres IS sont sauvegardés dans `STATE.fiscal_configs` avec `type: 'is'` :

```json
{
  "societe_id": "xxx",
  "type": "is",
  "taux_reduit": 0.15,
  "taux_normal": 0.25,
  "seuil_reduit": 42500
}
```

Ils sont inclus dans l'export JSON et restaurés à l'import.

---

## 7. Évolutions futures possibles

| Évolution | Description |
|-----------|-------------|
| Dividendes | Ajouter un module de simulation PFU / barème sur les dividendes distribués |
| Acomptes IS | Gérer les acomptes trimestriels IS (1/4 × IS N-1) |
| Cotisation minimale | CVAE / CFE à intégrer dans les charges |
| Remontée associé | Simuler la combinaison salaire + dividendes pour optimiser le net après toutes taxes |

---

## 8. Différences clés IS vs IR

| Point | IS | IR |
|-------|----|----|
| Qui paie l'impôt | La société | L'associé |
| Assiette | Résultat fiscal de la société | BNC de l'associé = résultat de la société |
| Taux | 15 % / 25 % (fixe) | Barème progressif du foyer fiscal |
| Salaires | Charge déductible | Charge déductible |
| Dividendes | Prélevés sur résultat net après IS, taxés en N+1 | N/A (tout est BNC) |
| CSG/CRDS | Non applicable au niveau société | Applicable sur le BNC (zone grise) |
