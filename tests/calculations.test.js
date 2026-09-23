import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, kgToLb, lbToKg } from '../shared/calculations.js';
import { profileSchema, entrySchema, dateSchema } from '../shared/schemas.js';
import { foodIdeas } from '../client/src/data.js';
const baseline = {
  gender: 'male',
  equationSex: 'male',
  journey: 'loss',
  height: 180,
  weight: 80,
  age: 30,
  activity: 'sedentary',
  targetWeight: 76,
  days: 90,
  waterGoal: 2000,
  eligible: true,
  healthConsent: true,
};
test('Mifflin male and female estimates match independently calculated examples', () => {
  assert.equal(calculatePlan(baseline).bmr, 1780);
  assert.equal(calculatePlan(baseline).maintenance, 2136);
  assert.equal(calculatePlan({ ...baseline, equationSex: 'female' }).bmr, 1614);
});
test('short deadlines cannot override calorie or deficit guardrails', () => {
  const plan = calculatePlan({ ...baseline, targetWeight: 65, days: 30 });
  assert.equal(plan.limited, true);
  assert.ok(plan.target >= 1500);
  assert.ok(Math.abs(plan.adjustment) <= 500);
  assert.ok(Math.abs(plan.adjustment) <= plan.maintenance * 0.2 + 0.5);
  assert.ok(plan.suggestedDays > 30);
});
test('longer requested timeframes reduce the requested deficit', () => {
  assert.ok(calculatePlan({ ...baseline, days: 180 }).target > calculatePlan(baseline).target);
});
test('gain is capped and cannot promise arbitrary rapid muscle growth', () => {
  const plan = calculatePlan({ ...baseline, journey: 'gain', targetWeight: 100, days: 30 });
  assert.equal(plan.adjustment, 300);
  assert.equal(plan.limited, true);
});
test('maintenance and recomposition stay at maintenance', () => {
  for (const journey of ['maintain', 'recomp']) {
    const plan = calculatePlan({ ...baseline, journey });
    assert.equal(plan.target, plan.maintenance);
  }
});
test('no fabricated tape-based body fat or measured muscle percentage', () => {
  assert.equal(calculatePlan(baseline).bodyFat, null);
  assert.equal(calculatePlan(baseline).leanMassFromTape, null);
  assert.equal(calculatePlan(baseline).musclePercentage, null);
  assert.equal(calculatePlan({ ...baseline, neck: 40, waist: 90 }).bodyFat, 18.5);
  assert.equal(calculatePlan({ ...baseline, neck: 40, waist: 90 }).leanMassFromTape, 65.2);
  assert.equal(
    calculatePlan({ ...baseline, equationSex: 'female', neck: 34, waist: 75, hips: 100 }).bodyFat,
    25.5,
  );
});
test('Deurenberg body fat, Boer lean mass, and protein match worked examples', () => {
  // Male equation, 180 cm, 80 kg, 30 years: BMI 24.69.
  // Body fat = 1.2 × 24.69 + 0.23 × 30 − 10.8 × 1 − 5.4 = 20.33 → 20.3%.
  // Lean body mass = 0.407 × 80 + 0.267 × 180 − 19.2 = 61.42 → 61.4 kg.
  // Fat-free mass = 80 − 80 × 20.3 / 100 = 63.76 kg; protein = 12.75 kg → 15.9% of weight.
  const male = calculatePlan(baseline);
  assert.equal(male.bodyFatBmi, 20.3);
  assert.equal(male.leanBodyMass, 61.4);
  assert.equal(male.leanMassPercentage, 76.8);
  assert.deepEqual(male.muscleMassRange, [27.6, 33.8]);
  assert.equal(male.fatFreeMass, 63.8);
  assert.equal(male.proteinMass, 12.8);
  assert.equal(male.proteinPercentage, 15.9);
  // Female equation, 165 cm, 60 kg, 40 years: BMI 22.04.
  // Body fat = 1.2 × 22.04 + 0.23 × 40 − 0 − 5.4 = 30.25 → 30.2%.
  // Lean body mass = 0.252 × 60 + 0.473 × 165 − 48.3 = 44.87 → 44.9 kg.
  // Fat-free mass = 60 × 0.698 = 41.88 kg; protein = 8.38 kg → 14.0% of weight.
  const female = calculatePlan({
    ...baseline,
    equationSex: 'female',
    height: 165,
    weight: 60,
    age: 40,
    targetWeight: 57,
  });
  assert.equal(female.bodyFatBmi, 30.2);
  assert.equal(female.leanBodyMass, 44.9);
  assert.equal(female.proteinMass, 8.4);
  assert.equal(female.proteinPercentage, 14);
  // The equation setting, not the photo choice, selects the coefficients.
  assert.equal(calculatePlan({ ...baseline, gender: 'female' }).bodyFatBmi, 20.3);
  // Every whole-body estimate is derived from the same inputs and never contradicts itself.
  assert.ok(male.muscleMassRange[1] < male.leanBodyMass);
  assert.ok(Math.abs(male.proteinPercentage - (100 - male.bodyFatBmi) * 0.2) < 0.1);
});
test('implausible whole-body estimates are withheld, not clamped', () => {
  const plan = calculatePlan({
    ...baseline,
    journey: 'maintain',
    height: 230,
    weight: 35,
    age: 18,
    targetWeight: 35,
  });
  for (const key of [
    'bodyFatBmi',
    'leanBodyMass',
    'leanMassPercentage',
    'muscleMassRange',
    'fatFreeMass',
    'proteinMass',
    'proteinPercentage',
  ])
    assert.equal(plan[key], null, key);
});
test('every food idea is a complete single entry assigned to a real meal', () => {
  assert.ok(foodIdeas.length >= 30);
  const names = new Set();
  for (const idea of foodIdeas) {
    assert.ok(!Array.isArray(idea) && typeof idea === 'object', 'flat list of objects');
    assert.ok(['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(idea.meal), idea.name);
    for (const key of ['calories', 'protein', 'carbs', 'fat'])
      assert.ok(Number.isFinite(idea[key]) && idea[key] >= 0, `${idea.name} ${key}`);
    assert.ok(typeof idea.serving === 'string' && idea.serving.length > 0, idea.name);
    assert.ok(!names.has(idea.name), `duplicate idea: ${idea.name}`);
    names.add(idea.name);
    assert.equal(
      entrySchema.safeParse({
        kind: 'food',
        date: '2026-01-01',
        name: idea.name,
        meal: idea.meal,
        calories: idea.calories,
        protein: idea.protein,
        carbs: idea.carbs,
        fat: idea.fat,
      }).success,
      true,
      idea.name,
    );
  }
  for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snack'])
    assert.ok(
      foodIdeas.some((idea) => idea.meal === meal),
      meal,
    );
});
test('invalid and unsupported profile inputs are rejected', () => {
  for (const change of [
    { age: 17 },
    { height: -1 },
    { days: 0 },
    { weight: Infinity },
    { targetWeight: 40 },
    { eligible: false },
    { healthConsent: false },
    { neck: 45, waist: 40 },
    { targetWeight: 90 },
  ])
    assert.equal(profileSchema.safeParse({ ...baseline, ...change }).success, false);
});
test('optional tape measurements remain optional but coherent', () => {
  assert.equal(profileSchema.safeParse({ ...baseline, neck: '', waist: '' }).success, true);
  assert.equal(profileSchema.safeParse({ ...baseline, neck: 40 }).success, false);
  assert.equal(
    profileSchema.safeParse({ ...baseline, equationSex: 'female', neck: 34, waist: 75 }).success,
    false,
  );
});
test('invalid dates and negative logging values are rejected', () => {
  assert.equal(dateSchema.safeParse('2026-02-30').success, false);
  assert.equal(dateSchema.safeParse('2099-01-01').success, false);
  assert.equal(
    entrySchema.safeParse({ kind: 'water', date: '2026-01-01', amount: -250 }).success,
    false,
  );
});
test('weight unit conversion is reversible', () => {
  assert.ok(Math.abs(lbToKg(kgToLb(80)) - 80) < 0.000001);
});
test('unsupported low energy estimates do not become calorie prescriptions', () => {
  const input = {
    ...baseline,
    journey: 'maintain',
    equationSex: 'female',
    height: 140,
    weight: 38,
    age: 70,
    targetWeight: 38,
  };
  assert.equal(calculatePlan(input).target, null);
  assert.equal(profileSchema.safeParse(input).success, false);
});
