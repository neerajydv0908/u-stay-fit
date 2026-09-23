# Health estimates: formulas, assumptions, and limits

This document explains the implementation. It is not a personalized diet prescription. The app provides general adult wellness education and record keeping, and it makes uncertainty visible.

## 1. Scope

The automated planner accepts ages 18–80 and requires confirmation that it is not being used for pregnancy, breastfeeding, eating-disorder care, or a condition requiring a prescribed diet. Input ranges are product validation boundaries, not declarations that every person inside those ranges should use an automated plan.

BMI, energy needs, body fat, lean body mass, and protein are estimates. Health, medication, body composition, and measurement technique can change their usefulness. A professional assessment may be needed even if a form accepts the inputs.

## 2. Units

Stored measurements use kilograms and centimetres. Energy uses kilocalories per day (`kcal/day`), often called “calories” on food labels. Macronutrients use grams; water uses millilitres.

```text
metres = centimetres / 100
inches = centimetres / 2.54
pounds = kilograms × 2.2046226218
```

The dashboard’s lb setting only changes display and input conversion. It does not create a second independent weight record.

## 3. BMI

```text
BMI = weightKg / (heightCm / 100)²
```

Example: 80 kg at 180 cm gives approximately 24.7. BMI is a screening measure and does not identify which portion of body mass is muscle or fat. The app refuses a fat-loss plan whose current or target BMI is below 18.5. This is a narrow guardrail, not a full clinical assessment. [CDC: Adult BMI categories](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html).

## 4. Resting energy estimate

Mifflin–St Jeor:

```text
Male equation:   10 × kg + 6.25 × cm − 5 × ageYears + 5
Female equation: 10 × kg + 6.25 × cm − 5 × ageYears − 161
```

The code uses the familiar variable name `bmr`; the original paper predicts resting energy expenditure. Example: 80 kg, 180 cm, age 30, male equation gives 1,780 kcal/day before activity multiplication. This is a statistical estimate, not calorimetry. The equation’s binary coefficients should not be mistaken for a complete description of gender or every person’s physiology. [Mifflin et al., 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/).

## 5. Approximate maintenance

```text
maintenance = restingEstimate × activityFactor
```

| Activity selection | Factor |
| --- | ---: |
| Mostly seated | 1.2 |
| Lightly active | 1.375 |
| Moderately active | 1.55 |
| Very active | 1.725 |

These commonly used multipliers are broad application heuristics, not factors validated by the original Mifflin paper for each user. A brief activity label cannot measure total daily energy expenditure. The app suggests reviewing real trends over several weeks instead of treating the first number as exact.

If estimated maintenance is below 1,500 kcal/day, the planner withholds a calorie target and rejects automated plan creation. This is the app’s supported-range rule, not a diagnosis or a universal minimum recommendation.

## 6. Goal timeframe and calorie adjustment

For loss or gain, the initial request is calculated as:

```text
requested daily adjustment = |targetKg − startingKg| × 7700 / days
```

This is simple energy bookkeeping. Human weight change is dynamic; it depends on more than a fixed calorie-to-kilogram conversion. Muscle gain has an especially different relationship to energy intake and training. The app does not represent this calculation as a physiological forecast. The NIDDK’s model is a more sophisticated reference for understanding changing energy needs. [NIDDK Body Weight Planner](https://www.niddk.nih.gov/bwp).

For fat loss, the allowed deficit is the smallest of:

```text
requested adjustment
500 kcal/day
20% of estimated maintenance
the amount that would leave 1500 kcal/day
```

For gain, the allowed surplus is at most 300 kcal/day. These are conservative product choices, not individualized clinical limits. The UI explains when a target is capped and supplies only an illustrative timeframe from the same simplified calculation. A cap does not guarantee safety, success, or muscle preservation.

Maintenance and recomposition use the maintenance estimate. The requested days become a planning intention; the app does not promise simultaneous fat loss and muscle gain by a fixed date.

The CDC discusses gradual weight loss of roughly 1–2 pounds per week as more sustainable than rapid loss for many people. The app does not force every user to pursue that rate. [CDC: Steps for losing weight](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html).

## 7. Body-fat estimates

The app shows two different body-fat numbers, and labels which is which.

### 7.1 BMI-based estimate (always shown)

The onboarding preview and the dashboard use the Deurenberg equation, which needs only BMI, age, and the equation setting:

```text
bodyFat% = 1.20 × BMI + 0.23 × ageYears − 10.8 × S − 5.4
S = 1 for the male equation, 0 for the female equation
```

Example: 80 kg, 180 cm (BMI 24.69), age 30, male equation gives 1.20 × 24.69 + 0.23 × 30 − 10.8 − 5.4 ≈ 20.3%. The unrounded BMI is used inside the formula; the result is rounded to one decimal. In the code this value is `bodyFatBmi`.

The equation was fitted to a Dutch population and predicts an *average* fatness for a given BMI, age, and sex. It cannot see how much of someone's mass is muscle, so a lean, muscular person is typically overestimated and a person with little muscle can be underestimated. Treat it as a screening-level number. [Deurenberg et al., 1991](https://pubmed.ncbi.nlm.nih.gov/2043597/).

### 7.2 Tape-based estimate (optional)

The optional circumference calculation uses a commonly used Navy-style equation with measurements converted to inches:

```text
Male estimate (%):
86.010 × log10(abdomen − neck)
− 70.041 × log10(height)
+ 36.76

Female estimate (%):
163.205 × log10(waist + hips − neck)
− 97.684 × log10(height)
− 78.387
```

Every length in those equations is in inches. The UI collects centimetres and converts internally. Mixing units produces incorrect results. The male input refers to the abdomen at the navel; the female input uses waist and hip circumferences. Follow consistent tape technique rather than mixing measurement sites.

The implementation requires the relevant inputs, positive differences, and a computed value between 2% and 65%. A result outside that plausibility range is withheld rather than clamped into a deceptively believable number. The range itself is an application validation choice. The same 2–65% guard is applied to the BMI-based estimate. In the code the tape value is `bodyFat`; the two estimates are shown side by side when tape measurements are entered, and they will usually differ.

Circumference equations were developed in particular populations and can miss body-composition changes. They should not be presented as device measurements or clinical truth. See the [National Academies discussion of military body-composition methods](https://www.ncbi.nlm.nih.gov/books/NBK235939/) and [Foulis et al., 2023, on limitations during training](https://pmc.ncbi.nlm.nih.gov/articles/PMC10282178/).

## 8. Lean body mass and the skeletal-muscle range

Lean body mass (LBM) is everything except fat: muscle, bone, water, organs, and other tissue. The app estimates it with the Boer formula, which needs only weight, height, and the equation setting:

```text
Male equation:   LBM (kg) = 0.407 × weightKg + 0.267 × heightCm − 19.2
Female equation: LBM (kg) = 0.252 × weightKg + 0.473 × heightCm − 48.3
```

Example: 80 kg, 180 cm, male equation gives 0.407 × 80 + 0.267 × 180 − 19.2 ≈ 61.4 kg, or about 76.8% of body weight. In the code this is `leanBodyMass` with `leanMassPercentage`. A result that is not between 0 kg and the person's weight is withheld. [Boer, 1984](https://pubmed.ncbi.nlm.nih.gov/6496691/).

Skeletal muscle typically makes up about 45–55% of lean body mass, so the app shows a **range** (`muscleMassRange`), for the example about 27.6–33.8 kg. It deliberately does not present a single "muscle mass" figure, because the true share varies with training history, age, and sex, and none of the inputs can measure it.

For the same reason the app still returns `musclePercentage: null`. Subtracting body-fat percentage from 100 does **not** give muscle percentage, and no formula here can. A user may enter a separately assessed muscle value in a check-in; when one exists, the dashboard shows it first and keeps the Boer estimate as context. Its interpretation depends on the method, device definition, hydration, and measurement conditions. Even a measured or device-estimated number is not perfect.

Two lean-mass numbers can appear: `leanBodyMass` (Boer) and, when tape measurements are entered, `leanMassFromTape` (weight minus tape-estimated fat). They come from different equations and will differ.

## 9. Protein mass and protein percentage

A multi-compartment description of fat-free mass treats it as roughly 73% water, 7% bone mineral, and 20% protein. The app uses those averages:

```text
fatFreeMass  = weightKg − weightKg × bodyFatBmi / 100
proteinMass  = fatFreeMass × 0.20
protein%     = proteinMass / weightKg × 100
```

Example: 80 kg at 20.3% body fat gives a fat-free mass of 63.76 kg, about 12.8 kg of protein, or 15.9% of body weight. The chain starts from the rounded BMI-based body-fat percentage that the user sees, so someone checking the arithmetic from the screen reproduces the result; rounding differences are within 0.1 kg. In the code these are `fatFreeMass`, `proteinMass`, and `proteinPercentage`, and they are withheld whenever the body-fat estimate is withheld.

The 73/7/20 split is a population average. Hydration status, age, illness, and training change it, and the number inherits every limitation of the body-fat estimate it is built on. It is a model output, not a measurement of anyone's protein. [Wang et al., 1999, on the hydration of fat-free mass](https://pubmed.ncbi.nlm.nih.gov/10232621/).

## 10. Protein, carbohydrate, and fat suggestions

The illustrative macro starting points are:

```text
protein: 1.6 g/kg for gain, loss, or recomposition; 1.2 g/kg for maintenance
fat:     30% of target energy, divided by 9 kcal/g
carbs:   remaining energy, divided by 4 kcal/g
```

Values are rounded; energy totals can differ slightly after rounding. These are app defaults, not universal targets. Conditions such as kidney disease or a prescribed diet require appropriate individual guidance.

The protein context includes a meta-analysis of healthy adults undertaking resistance training; an average levelling-off point does not mean all people require exactly that amount or need supplements. [Morton et al., 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/).

The app does not create a medically tailored menu. The 36 example meals in `data.js` (including common Indian dishes such as dal, rajma, paneer, idli, and dosa) have approximate single-serving values and may contain allergens. Users should edit logged amounts using actual labels or a reliable food-composition source.

## 11. Food intake and exercise are kept distinct

Exercise energy estimates are uncertain. The selected activity multiplier already attempts to account for habitual activity. Automatically adding every exercise estimate to the daily food target could count the same activity twice.

The dashboard therefore records exercise duration and optional energy separately. It does not encourage “earning” food or subtract exercise from food intake to produce a net-calorie score. Movement has benefits beyond weight change. [CDC: Physical activity, weight, and health](https://www.cdc.gov/healthy-weight-growth/physical-activity/index.html).

## 12. Hydration

The default 2,000 ml is a changeable reminder, not a universal fluid prescription. Water from food and other drinks contributes, and needs vary by health, activity, climate, and life stage. A person with a fluid restriction should follow their clinician’s advice. [CDC: Water and healthier drinks](https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html).

## 13. Myth education

The homepage explains that whole grains can fit an eating pattern, dietary fats are not inherently forbidden, and protein alone does not create instant muscle. It avoids labeling a food group as morally good or bad. [NIDDK: Nutrition and physical-activity myths](https://www.niddk.nih.gov/health-information/weight-management/myths-nutrition-physical-activity).

The homepage also explains that an energy deficit can impair gains in lean tissue during resistance training. This is evidence about group-level training outcomes, not a prediction that a particular person will lose a particular amount of muscle. [Murphy and Koehler: meta-analysis of energy deficiency and resistance training](https://pubmed.ncbi.nlm.nih.gov/34623696/).

## 14. Review procedure for future changes

If you change a formula or health claim:

1. Find an appropriate primary or authoritative source.
2. Read its population, methods, and limitations—not just the headline.
3. Record units and assumptions.
4. Update both the code and the user-facing explanation.
5. Check an independently worked numerical example.
6. Test boundary cases and unsupported inputs.
7. Seek qualified health-content review before a public release.

Sources were checked during development in September 2026. Their inclusion supports specific educational statements; it does not imply that the organizations endorse U Stay Fit or validate all of its product choices.
