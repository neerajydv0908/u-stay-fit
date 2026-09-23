import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  Sparkles,
  Activity,
  Armchair,
  Footprints,
  Dumbbell,
} from 'lucide-react';
import { useAuth } from '../context';
import { api } from '../api';
import { Eyebrow, Field, ErrorMessage, Citation } from '../components/UI';
import { images, journeyImage } from '../data';
import { ACTIVITY, JOURNEYS, calculatePlan } from '../../../shared/calculations';
import { profileSchema } from '../../../shared/schemas';
const steps = [
  'A little about you',
  'Your direction',
  'Your starting point',
  'Your everyday',
  'Your personal plan',
];
export default function Onboarding() {
  const { user, profile, setAuth } = useAuth();
  // The dashboard can open an existing plan at a given step (?step=4 to set a new goal after
  // reaching one) and start from the latest check-in (?weight=…) instead of the old start.
  const [search] = useSearchParams();
  const requestedStep = Number(search.get('step')),
    requestedWeight = Number(search.get('weight'));
  const startingWeight =
    profile && requestedWeight >= 35 && requestedWeight <= 300 ? requestedWeight : null;
  const [step, setStep] = useState(
      profile && Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep <= 4
        ? requestedStep
        : 0,
    ),
    [detailed, setDetailed] = useState(Boolean(profile?.neck)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState(
    (profile && (startingWeight ? { ...profile, weight: startingWeight } : profile)) || {
      gender: '',
      equationSex: 'female',
      journey: '',
      height: '',
      weight: '',
      age: '',
      activity: 'sedentary',
      targetWeight: '',
      days: 90,
      neck: '',
      waist: '',
      hips: '',
      waterGoal: 2000,
      eligible: false,
      healthConsent: false,
    },
  );
  const navigate = useNavigate(),
    reduced = useReducedMotion();
  const update = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    setError('');
  };
  const numeric = Object.fromEntries(
    Object.entries(form).map(([key, value]) =>
      [
        'height',
        'weight',
        'age',
        'targetWeight',
        'days',
        'neck',
        'waist',
        'hips',
        'waterGoal',
      ].includes(key)
        ? [key, value === '' ? undefined : Number(value)]
        : [key, value],
    ),
  );
  const estimate =
    numeric.height >= 120 && numeric.weight >= 35 && numeric.age >= 18
      ? calculatePlan({
          ...numeric,
          targetWeight: numeric.targetWeight || numeric.weight,
          days: numeric.days || 90,
        })
      : null;
  const input = (key) => ({ value: form[key], onChange: (e) => update(key, e.target.value) });
  function next(event) {
    event.preventDefault();
    if (step === 0 && !form.gender) return setError('Choose a photo to continue.');
    if (step === 1 && !form.journey)
      return setError('Choose the direction that feels right for you.');
    if (step === 2) {
      const proposed = {
        ...numeric,
        targetWeight:
          form.journey === 'loss'
            ? Number(form.weight) - 2
            : form.journey === 'gain'
              ? Number(form.weight) + 2
              : Number(form.weight),
        // Both confirmations are asked for on the final step, so they are assumed here.
        eligible: true,
        healthConsent: true,
      };
      const checked = profileSchema.safeParse(proposed);
      const measurementError =
        !checked.success && checked.error.issues.find((i) => i.path[0] !== 'activity');
      if (measurementError) return setError(measurementError.message);
      if (!form.targetWeight) update('targetWeight', proposed.targetWeight);
    }
    setError('');
    setStep(step + 1);
  }
  async function save(event) {
    event.preventDefault();
    const result = profileSchema.safeParse({
      ...numeric,
      targetWeight: ['maintain', 'recomp'].includes(form.journey)
        ? numeric.weight
        : numeric.targetWeight,
    });
    if (!result.success) return setError(result.error.issues[0].message);
    setBusy(true);
    setError('');
    try {
      const saved = await api('/profile', { method: 'PUT', body: result.data });
      setAuth(saved);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container onboarding">
      <div className="onboarding-top">
        <Link to={profile ? '/dashboard' : '/'} className="text-link">
          <ArrowLeft size={16} />
          {profile ? 'Back to dashboard' : 'Back to home'}
        </Link>
        <span>MADE FOR YOU, {user.name.split(' ')[0].toUpperCase()}</span>
      </div>
      <div className="step-indicators" aria-label={`Step ${step + 1} of 5`}>
        {steps.map((label, i) => (
          <div key={label} className={i <= step ? 'current' : ''}>
            <span>{i < step ? <Check size={15} /> : `0${i + 1}`}</span>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduced ? false : { opacity: 0, x: 25 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? {} : { opacity: 0, x: -25 }}
          transition={{ duration: 0.3 }}
        >
          <form onSubmit={step === 4 ? save : next}>
            <div className="onboarding-heading">
              <Eyebrow>STEP 0{step + 1} / A PLAN THAT FITS YOU</Eyebrow>
              <h1>
                {
                  [
                    'Let’s get to know you.',
                    'What feels like your next chapter?',
                    'Start with where you are.',
                    'What does your everyday look like?',
                    'Small steps. Your own rhythm.',
                  ][step]
                }
              </h1>
              <p>
                {
                  [
                    'Choose the imagery you feel comfortable with. You can adjust the calculation setting separately.',
                    'Choose a direction. You can change your plan as your life changes.',
                    'These numbers are a starting point, never a judgement.',
                    'Include work, walking, and exercise. Choose a typical week, not your busiest one.',
                    'Choose a timeframe, explore your starting estimate, and make it yours.',
                  ][step]
                }
              </p>
            </div>
            {step === 0 && (
              <div className="gender-grid">
                {['female', 'male'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`photo-choice ${form.gender === g ? 'selected' : ''}`}
                    aria-pressed={form.gender === g}
                    onClick={() => {
                      setForm((p) => ({ ...p, gender: g, equationSex: g }));
                      setError('');
                    }}
                  >
                    <img
                      src={images[g]}
                      alt={g === 'female' ? 'Woman exercising in a gym' : 'Man in a fitness studio'}
                    />
                    <span>
                      {g === 'female' ? 'Female' : 'Male'}
                      <span className="choice-check">
                        {form.gender === g && <Check size={17} />}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {step === 1 && (
              <>
                <div className="goal-carousel" aria-label="Journey options; scroll horizontally">
                  {Object.entries(JOURNEYS).map(([key, goal]) => (
                    <button
                      className={`goal-choice ${form.journey === key ? 'selected' : ''}`}
                      key={key}
                      type="button"
                      aria-pressed={form.journey === key}
                      onClick={() => {
                        update('journey', key);
                        update('targetWeight', '');
                      }}
                    >
                      <img
                        src={journeyImage(form.gender, key)}
                        alt={`${form.gender === 'female' ? 'Woman' : 'Man'} being active`}
                      />
                      <div>
                        <span className="choice-check">
                          {form.journey === key && <Check size={17} />}
                        </span>
                        <h3>{goal.title}</h3>
                        <strong>{goal.subtitle}</strong>
                        <p>{goal.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="center muted small">
                  Photos illustrate activities, not promised body shapes. Swipe to explore on
                  smaller screens.
                </p>
              </>
            )}
            {step === 2 && (
              <div className="measure-layout">
                <div className="panel">
                  <div className="form-grid">
                    <Field
                      label="Height (cm)"
                      type="number"
                      min="120"
                      max="230"
                      step="0.1"
                      placeholder="e.g. 170"
                      required
                      {...input('height')}
                    />
                    <Field
                      label="Weight (kg)"
                      type="number"
                      min="35"
                      max="300"
                      step="0.1"
                      placeholder="e.g. 70"
                      required
                      {...input('weight')}
                    />
                    <Field
                      label="Age (years)"
                      type="number"
                      min="18"
                      max="80"
                      placeholder="18–80"
                      required
                      {...input('age')}
                    />
                    <label className="field">
                      <span>Equation setting</span>
                      <select {...input('equationSex')}>
                        <option value="female">Female equation</option>
                        <option value="male">Male equation</option>
                      </select>
                    </label>
                  </div>
                  <p className="small muted">
                    The published equations use binary sex coefficients, not gender identity. They
                    may be less suitable during hormone therapy or when body composition differs
                    from the study population. Use professional guidance where needed.
                  </p>
                  <button
                    className="details-toggle"
                    type="button"
                    onClick={() => setDetailed(!detailed)}
                    aria-expanded={detailed}
                  >
                    <span>
                      <Sparkles size={17} />
                      Detailed info for an additional body-fat estimate
                    </span>
                    <ChevronDown size={18} />
                  </button>
                  {detailed && (
                    <div className="details-fields">
                      <p className="small muted">
                        Use a soft tape, level and snug without compressing skin. Neck: just below
                        the larynx.{' '}
                        {form.equationSex === 'male'
                          ? 'Abdomen: at the navel.'
                          : 'Waist: at the narrowest point. Hips: at the widest point.'}{' '}
                        Repeat measurements. More inputs do not guarantee more accuracy.
                      </p>
                      <div className="form-grid">
                        <Field
                          label="Neck (cm)"
                          type="number"
                          min="20"
                          max="65"
                          step="0.1"
                          {...input('neck')}
                        />
                        <Field
                          label={
                            form.equationSex === 'male' ? 'Abdomen / waist (cm)' : 'Waist (cm)'
                          }
                          type="number"
                          min="40"
                          max="220"
                          step="0.1"
                          {...input('waist')}
                        />
                        {form.equationSex === 'female' && (
                          <Field
                            label="Hips (cm)"
                            type="number"
                            min="50"
                            max="220"
                            step="0.1"
                            {...input('hips')}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="estimate-preview">
                  <div className="note">
                    <Info size={18} />
                    <p>
                      These values may not be completely accurate: they are calculated using
                      published formulas (Deurenberg, Boer, Mifflin–St Jeor), not measured with
                      devices. Body fat, lean mass, and protein are whole-body estimates that change
                      only with height, weight, age, and the equation setting.
                    </p>
                  </div>
                  <h3>A first look at your numbers</h3>
                  <dl>
                    <div>
                      <dt>
                        BMI <small>Screening number, not a diagnosis</small>
                      </dt>
                      <dd>{estimate?.bmi || '—'}</dd>
                    </div>
                    <div>
                      <dt>
                        Body fat
                        <small>Deurenberg estimate from BMI, age, and the equation setting</small>
                      </dt>
                      <dd>{estimate?.bodyFatBmi != null ? `${estimate.bodyFatBmi}%` : '—'}</dd>
                    </div>
                    {detailed && (
                      <div>
                        <dt>
                          Body fat · tape{' '}
                          <small>Circumference estimate from your measurements</small>
                        </dt>
                        <dd>{estimate?.bodyFat != null ? `${estimate.bodyFat}%` : '—'}</dd>
                      </div>
                    )}
                    <div>
                      <dt>
                        Lean body mass
                        <small>
                          Boer estimate: muscle, bone, water, and organs.
                          {estimate?.muscleMassRange
                            ? ` Skeletal muscle is roughly 45–55% of it: about ${estimate.muscleMassRange[0]}–${estimate.muscleMassRange[1]} kg.`
                            : ' Skeletal muscle is roughly 45–55% of it.'}
                        </small>
                      </dt>
                      <dd>
                        {estimate?.leanBodyMass != null ? (
                          <>
                            {estimate.leanBodyMass}
                            <small>kg · {estimate.leanMassPercentage}% of weight</small>
                          </>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        Protein
                        <small>
                          About 20% of fat-free mass
                          {estimate?.proteinMass != null
                            ? `: roughly ${estimate.proteinMass} kg`
                            : ''}
                        </small>
                      </dt>
                      <dd>
                        {estimate?.proteinPercentage != null
                          ? `${estimate.proteinPercentage}%`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        Maintenance calories <small>Before your activity adjustment</small>
                      </dt>
                      <dd>
                        {estimate?.maintenance.toLocaleString() || '—'}
                        <small>kcal/day</small>
                      </dd>
                    </div>
                  </dl>
                  <Citation id="bmr" />
                  <Citation id="deurenberg" />
                  <Citation id="boer" />
                  <Citation id="compartments" />
                  {detailed && <Citation id="bodyFat" />}
                  {estimate && numeric.neck && !estimate.bodyFat && (
                    <p className="small muted">
                      No plausible tape-based body-fat estimate is available. Check the tape
                      measurements.
                    </p>
                  )}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="activity-grid">
                {Object.entries(ACTIVITY).map(([key, item], i) => {
                  const Icon = [Armchair, Footprints, Dumbbell, Activity][i];
                  return (
                    <button
                      type="button"
                      className={`activity-choice ${form.activity === key ? 'selected' : ''}`}
                      aria-pressed={form.activity === key}
                      key={key}
                      onClick={() => update('activity', key)}
                    >
                      <Icon size={30} />
                      <h3>{item.label}</h3>
                      <p>{item.description}</p>
                      <span className="choice-check">
                        {form.activity === key && <Check size={17} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {step === 4 && (
              <div className="measure-layout">
                <div className="panel">
                  <h3>Make space for steady change.</h3>
                  <div className="form-grid">
                    {['loss', 'gain'].includes(form.journey) && (
                      <Field
                        label="Goal weight (kg)"
                        type="number"
                        min="35"
                        max="300"
                        step="0.1"
                        required
                        hint={
                          startingWeight
                            ? `Counting from your latest check-in of ${startingWeight} kg. Choose your next goal.`
                            : undefined
                        }
                        {...input('targetWeight')}
                      />
                    )}
                    <Field
                      label="Your timeframe (days)"
                      type="number"
                      min="30"
                      max="730"
                      step="1"
                      required
                      {...input('days')}
                    />
                    <Field
                      label="Water reminder (ml/day)"
                      type="number"
                      min="500"
                      max="4000"
                      step="50"
                      required
                      hint="A personal reminder, not a prescribed fluid requirement."
                      {...input('waterGoal')}
                    />
                  </div>
                  <p className="small muted">
                    Fluid needs vary. Follow your clinician’s advice if you have a fluid
                    restriction. Food and other drinks also contribute to hydration.
                  </p>
                  <Citation id="water" />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.eligible}
                      onChange={(e) => update('eligible', e.target.checked)}
                      required
                    />
                    <span>
                      I’m an adult (18–80), not pregnant or breastfeeding, and I’m not using this
                      for eating-disorder care or a condition needing a prescribed diet. I
                      understand that this is general wellness guidance.
                    </span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(form.healthConsent)}
                      onChange={(e) => update('healthConsent', e.target.checked)}
                      required
                    />
                    <span>
                      I consent to U Stay Fit storing the measurements above and my daily food,
                      water, exercise, and weight records so it can show my plan and progress. I can
                      download or delete them at any time from{' '}
                      <Link to="/privacy">Account & security</Link>.
                    </span>
                  </label>
                  <p className="small muted">
                    If this planner isn’t suitable, you can still explore the educational guides
                    without registering a plan.
                  </p>
                </div>
                <div className="plan-preview">
                  <span className="overline">YOUR STARTING ESTIMATE</span>
                  <h2>
                    {estimate?.target?.toLocaleString() || '—'}
                    <small>kcal / day</small>
                  </h2>
                  <span className="plan-badge">{JOURNEYS[form.journey]?.title}</span>
                  <div className="macro-summary">
                    <span>
                      <strong>{estimate?.protein}g</strong>Protein
                    </span>
                    <span>
                      <strong>{estimate?.carbs}g</strong>Carbs
                    </span>
                    <span>
                      <strong>{estimate?.fat}g</strong>Fat
                    </span>
                  </div>
                  <p>{estimate?.message}</p>
                  {estimate?.limited && (
                    <div className="note">
                      <Info size={18} />
                      <p>
                        For illustration, this limited adjustment corresponds to about{' '}
                        {estimate.suggestedDays || 'more'} days using a simple energy calculation.
                        It is not a weight or muscle forecast.
                      </p>
                    </div>
                  )}
                  <p className="small">
                    Maintenance estimate: {estimate?.maintenance.toLocaleString()} kcal/day.
                    Nutrition splits are general starting suggestions; personal needs vary.
                  </p>
                  <Citation id="planner" />
                </div>
              </div>
            )}
            <ErrorMessage>{error}</ErrorMessage>
            <div className="onboarding-actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setStep(step - 1);
                    setError('');
                  }}
                >
                  <ArrowLeft size={17} />
                  Back
                </button>
              ) : (
                <span />
              )}
              <button className="button" disabled={busy}>
                {busy ? 'Saving your plan…' : step === 4 ? 'Meet my dashboard' : 'Continue'}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
