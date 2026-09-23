// One pure module is shared by browser previews and authoritative server responses.
export const ACTIVITY = {
  sedentary: {
    label: 'Mostly seated',
    description: 'Desk days, little structured exercise',
    factor: 1.2,
  },
  light: {
    label: 'Lightly active',
    description: 'Light movement or exercise 1–3 days/week',
    factor: 1.375,
  },
  moderate: {
    label: 'Moderately active',
    description: 'Regular exercise 3–5 days/week',
    factor: 1.55,
  },
  active: {
    label: 'Very active',
    description: 'Physical work or hard exercise most days',
    factor: 1.725,
  },
};
export const JOURNEYS = {
  loss: {
    title: 'Fat loss',
    subtitle: 'Less fat. More energy.',
    description: 'A manageable deficit with nourishing food.',
  },
  gain: {
    title: 'Muscle gain',
    subtitle: 'Build your kind of strong.',
    description: 'Fuel your training and give yourself time to grow.',
  },
  recomp: {
    title: 'Build & lean',
    subtitle: 'A little of both.',
    description: 'Support strength while working on body composition.',
  },
  maintain: {
    title: 'Maintain',
    subtitle: 'Feel good. Stay steady.',
    description: 'Find a rhythm that feels sustainable.',
  },
};
export function calculatePlan(p) {
  const bmi = p.weight / (p.height / 100) ** 2;
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.equationSex === 'male' ? 5 : -161);
  const maintenance = Math.round(bmr * (ACTIVITY[p.activity]?.factor || 1.2));
  let bodyFat = null;
  if (p.neck && p.waist && p.waist > p.neck && (p.equationSex === 'male' || p.hips)) {
    const inches = (n) => n / 2.54;
    const raw =
      p.equationSex === 'male'
        ? 86.01 * Math.log10(inches(p.waist - p.neck)) -
          70.041 * Math.log10(inches(p.height)) +
          36.76
        : 163.205 * Math.log10(inches(p.waist + p.hips - p.neck)) -
          97.684 * Math.log10(inches(p.height)) -
          78.387;
    if (raw >= 2 && raw <= 65) bodyFat = Math.round(raw * 10) / 10;
  }
  // Whole-body estimates that need only height, weight, age, and the equation setting.
  // Deurenberg et al. (1991): body fat % = 1.20 × BMI + 0.23 × age − 10.8 × sex − 5.4,
  // where sex is 1 for the male equation and 0 for the female equation.
  const deurenberg = 1.2 * bmi + 0.23 * p.age - 10.8 * (p.equationSex === 'male' ? 1 : 0) - 5.4;
  const bodyFatBmi = deurenberg >= 2 && deurenberg <= 65 ? Math.round(deurenberg * 10) / 10 : null;
  // Boer (1984) lean body mass in kg: everything that is not fat (muscle, bone, water, organs).
  const boer =
    p.equationSex === 'male'
      ? 0.407 * p.weight + 0.267 * p.height - 19.2
      : 0.252 * p.weight + 0.473 * p.height - 48.3;
  const leanBodyMass = boer > 0 && boer < p.weight ? Math.round(boer * 10) / 10 : null;
  // Multi-compartment model: fat-free mass is roughly 73% water, 7% bone mineral, 20% protein.
  // Fat-free mass is derived from the rounded Deurenberg percentage shown to the user.
  const fatFreeMass = bodyFatBmi == null ? null : p.weight - (p.weight * bodyFatBmi) / 100;
  const proteinMass = fatFreeMass == null ? null : fatFreeMass * 0.2;
  // 7700 is a rough bookkeeping heuristic, NOT a physiological prediction.
  // The conservative limits below are product guardrails, not clinical thresholds.
  const requestedAdjustment = (Math.abs(p.targetWeight - p.weight) * 7700) / p.days;
  let adjustment = 0;
  if (p.journey === 'loss' && bmi >= 18.5 && p.targetWeight / (p.height / 100) ** 2 >= 18.5) {
    adjustment = -Math.min(
      requestedAdjustment,
      500,
      maintenance * 0.2,
      Math.max(0, maintenance - 1500),
    );
  }
  if (p.journey === 'gain') adjustment = Math.min(requestedAdjustment, 300);
  const unsupported = maintenance < 1500;
  const target = unsupported ? null : Math.round(maintenance + adjustment);
  const limited =
    ['loss', 'gain'].includes(p.journey) && requestedAdjustment > Math.abs(adjustment) + 1;
  return {
    bmi: Math.round(bmi * 10) / 10,
    bmr: Math.round(bmr),
    maintenance,
    target,
    bodyFat,
    leanMassFromTape: bodyFat == null ? null : Math.round(p.weight * (1 - bodyFat / 100) * 10) / 10,
    bodyFatBmi,
    leanBodyMass,
    leanMassPercentage: leanBodyMass == null ? null : Math.round((boer / p.weight) * 1000) / 10,
    // Skeletal muscle is typically about 45–55% of lean body mass; a range, not a single value.
    muscleMassRange:
      leanBodyMass == null
        ? null
        : [Math.round(boer * 0.45 * 10) / 10, Math.round(boer * 0.55 * 10) / 10],
    fatFreeMass: fatFreeMass == null ? null : Math.round(fatFreeMass * 10) / 10,
    proteinMass: proteinMass == null ? null : Math.round(proteinMass * 10) / 10,
    proteinPercentage:
      proteinMass == null ? null : Math.round((proteinMass / p.weight) * 1000) / 10,
    // A measured muscle percentage still needs a separate assessment; it is never invented here.
    musclePercentage: null,
    protein: Math.round(p.weight * (p.journey === 'maintain' ? 1.2 : 1.6)),
    fat: Math.round((target * 0.3) / 9),
    carbs: Math.max(
      0,
      Math.round(
        (target - p.weight * (p.journey === 'maintain' ? 1.2 : 1.6) * 4 - target * 0.3) / 4,
      ),
    ),
    adjustment: Math.round(adjustment),
    limited,
    unsupported,
    suggestedDays:
      adjustment !== 0
        ? Math.ceil((Math.abs(p.targetWeight - p.weight) * 7700) / Math.abs(adjustment))
        : null,
    message: unsupported
      ? 'Your estimated energy needs are outside this general planner’s supported range. No calorie target is suggested. Please seek individual guidance from a qualified professional.'
      : limited
        ? 'Your requested pace is faster than this planner supports. We have limited the calorie adjustment; extend your timeframe and review progress with a qualified professional.'
        : p.journey === 'recomp'
          ? 'Start near estimated maintenance, train progressively, and review strength and measurements. Recomposition has no guaranteed deadline.'
          : 'This is a starting estimate. Review your energy, hunger, strength, and weight trends over several weeks.',
  };
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const kgToLb = (value) => value * 2.2046226218;
export const lbToKg = (value) => value / 2.2046226218;
