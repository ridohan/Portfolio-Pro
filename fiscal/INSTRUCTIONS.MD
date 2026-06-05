# Module Fiscal — Simulateur IR

## Objectif

Calculer l'impôt sur le revenu d'un foyer fiscal selon le barème progressif français, avec support des situations personnelles et des revenus de sociétés à l'IR.

## Cas d'usage principaux

### 1. Simulation personnelle
Estimation de l'IR annuel pour un particulier avec :
- Salaires + autres revenus
- Situation familiale
- Options (option barème sur dividendes, etc.)

### 2. Société à l'IR
Pour une EI, SNC, SCI ou EURL à l'IR : le bénéfice de la société est ajouté aux revenus du foyer fiscal de l'exploitant. Le simulateur permet de modéliser l'impact fiscal du résultat de la société.

## Paramètres du simulateur

```
Année fiscale         : 2024 (défaut)
Situation familiale   : célibataire | marié/pacsé | divorcé | veuf
Nombre d'enfants      : 0 à N
Parts fiscales        : calculées automatiquement

Revenus :
  Salaires nets       : montant brut — l'abattement 10% est appliqué automatiquement
  BIC/BNC             : résultat net de l'activité (pas d'abattement)
  Revenus fonciers    : nets de charges
  Dividendes          : choix PFU (flat tax) ou option barème (abattement 40%)
  Plus-values mob.    : choix PFU ou option barème
  Autres revenus      : intégrés sans abattement

Options :
  Option barème div.  : si coché, dividendes intégrés au barème avec abattement 40%
  Option barème PV    : si coché, PV intégrées au barème (avec abattements durée si applicable)
```

## Algorithme de calcul

```
1. Calcul du revenu brut global
   ├── Salaires × 0.9 (abattement 10%, min 495€, max 14 171€ par foyer)
   ├── BIC/BNC net
   ├── Revenus fonciers nets
   ├── Dividendes option barème × 0.6 (abattement 40%)
   └── Autres revenus

2. Revenu net imposable = Revenu brut global (après abattements)

3. Quotient familial → nombre de parts N

4. Impôt par part = bareme(revenuImposable / N) × N
   avec plafonnement de l'avantage QF (1 791€ / demi-part)

5. Décote (si impôt modeste)

6. Impôt net (après décote)

7. CEHR sur revenu fiscal de référence

8. Total IR dû = impôt net + CEHR

9. Impôt sur les revenus PFU séparément :
   ├── Dividendes PFU : 30% (12.8% IR + 17.2% PS)
   └── PV mobilières PFU : 30%
   Note : les PS (17.2%) sont inclus dans le PFU mais pas dans le barème IR
```

## Sorties

```
Décomposition par tranche
  Tranche 0%  : xxx € × 0%  = 0 €
  Tranche 11% : xxx € × 11% = yyy €
  ...

Décote : −zzz €
Impôt barème net : xxx €

PFU dividendes : xxx € (dont IR: yyy €, PS: zzz €)
PFU plus-values : xxx €

CEHR : xxx €

═══════════════════════════
Total IR dû : xxx €
Total prélèvements sociaux : yyy € (inclus dans PFU)
Taux moyen IR : x.xx %
Taux marginal : xx %
```

## Évolutions prévues

- Sauvegarde des simulations dans Google Sheets
- Comparaison de scénarios côte à côte
- Simulation pluriannuelle (évolution du résultat sur N années)
- Intégration IS pour comparaison IR vs IS
- Charges sociales TNS (pour EI/gérant majoritaire)
