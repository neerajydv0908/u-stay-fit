import { z } from 'zod';
import { calculatePlan } from './calculations.js';

const number = (min, max) => z.coerce.number().finite().min(min).max(max);
const optionalNumber = (min, max) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), number(min, max).optional());
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters. A memorable passphrase works well.')
  .max(128);
const emailSchema = z.email().trim().toLowerCase().max(254);
const identifierSchema = z.string().trim().toLowerCase().min(1).max(254);
const tokenSchema = z.string().trim().min(20).max(100);
const nameSchema = z.string().trim().min(2).max(70);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, 'Use 3–30 letters, numbers, or underscores.');
export const accountDetailsSchema = z.object({ name: nameSchema, username: usernameSchema });
export const registerSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(true, {
    error: 'Please confirm that you have read the privacy notice.',
  }),
});
export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1).max(128),
});
export const identifierOnlySchema = z.object({ identifier: identifierSchema });
export const emailOnlySchema = z.object({ email: emailSchema });
export const tokenOnlySchema = z.object({ token: tokenSchema });
export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export const mfaSchema = z.object({
  mfaToken: tokenSchema,
  code: z.string().trim().min(6, 'Enter the 6-digit code or a recovery code.').max(20),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    code: z.string().trim().max(20).optional(),
  })
  .refine((p) => p.currentPassword !== p.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password that is different from the current one.',
  });
export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});
export const passwordOnlySchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().trim().max(20).optional(),
});
export const deleteAccountSchema = z.object({
  password: z.string().max(128).optional(),
  code: z.string().trim().max(20).optional(),
  confirm: z.literal('DELETE', { error: 'Type DELETE to confirm.' }),
});
export const profileSchema = z
  .object({
    gender: z.enum(['female', 'male']),
    equationSex: z.enum(['female', 'male']),
    journey: z.enum(['loss', 'gain', 'recomp', 'maintain']),
    height: number(120, 230),
    weight: number(35, 300),
    age: number(18, 80).int(),
    neck: optionalNumber(20, 65),
    waist: optionalNumber(40, 220),
    hips: optionalNumber(50, 220),
    activity: z.enum(['sedentary', 'light', 'moderate', 'active']),
    targetWeight: number(35, 300),
    days: number(30, 730).int(),
    waterGoal: number(500, 4000).default(2000),
    eligible: z.literal(true, {
      error: 'Please confirm that this general adult planner is appropriate for you.',
    }),
    healthConsent: z.literal(true, {
      error: 'Please consent to storing your measurements and records before saving a plan.',
    }),
  })
  .superRefine((p, ctx) => {
    const error = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.journey === 'loss' && p.targetWeight >= p.weight)
      error('targetWeight', 'For fat loss, choose a target below your starting weight.');
    if (p.journey === 'gain' && p.targetWeight <= p.weight)
      error('targetWeight', 'For muscle gain, choose a target above your starting weight.');
    if (
      p.journey === 'loss' &&
      (p.targetWeight / (p.height / 100) ** 2 < 18.5 || p.weight / (p.height / 100) ** 2 < 18.5)
    )
      error(
        'targetWeight',
        'This planner cannot recommend weight loss at a BMI below 18.5. Discuss an appropriate plan with a clinician.',
      );
    if ((p.neck != null) !== (p.waist != null))
      error('waist', 'Enter both neck and waist, or leave both empty.');
    if (p.neck && p.waist && p.waist <= p.neck)
      error('waist', 'Waist must be larger than neck for this estimate.');
    if (p.neck && p.equationSex === 'female' && !p.hips)
      error('hips', 'Add hip circumference for the female body-fat equation.');
    if (calculatePlan(p).unsupported)
      error(
        'activity',
        'Your estimated maintenance is below this general planner’s supported range. We cannot suggest a calorie plan; please seek individual professional guidance.',
      );
  });

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00Z');
    return (
      !Number.isNaN(d.valueOf()) &&
      d.toISOString().slice(0, 10) === s &&
      s >= '2000-01-01' &&
      d.valueOf() < Date.now() + 86400000
    );
  }, 'Choose a valid date from today or the past.');
const entryBase = { date: dateSchema };
export const entrySchema = z.discriminatedUnion('kind', [
  z.object({
    ...entryBase,
    kind: z.literal('food'),
    name: z.string().trim().min(1).max(120),
    meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']),
    calories: number(1, 5000),
    protein: number(0, 500),
    carbs: number(0, 1000),
    fat: number(0, 500),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('water'),
    amount: number(1, 2000).int(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('exercise'),
    name: z.string().trim().min(1).max(120),
    minutes: number(1, 480).int(),
    calories: number(0, 3000),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('weight'),
    weight: number(35, 300),
    bodyFat: optionalNumber(2, 65),
    muscle: optionalNumber(5, 75),
    note: z.string().trim().max(300).default(''),
  }),
]);
