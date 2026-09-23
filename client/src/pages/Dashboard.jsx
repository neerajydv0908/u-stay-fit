import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Droplets,
  Dumbbell,
  Flame,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Sprout,
  Trash2,
  Utensils,
  Weight,
  X,
  Heart,
  Info,
  PartyPopper,
  TrendingDown,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context';
import { Citation, Empty, Eyebrow, Field, ErrorMessage, Modal, Reveal } from '../components/UI';
import { calculatePlan, JOURNEYS, localDate, kgToLb, lbToKg } from '../../../shared/calculations';
import { foodIdeas } from '../data';

const addDays = (date, amount) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return localDate(d);
};
const dateLabel = (date, options) =>
  new Date(date + 'T12:00:00').toLocaleDateString(undefined, options);
const sum = (entries, field) => entries.reduce((total, e) => total + Number(e[field] || 0), 0);
// How the daily target is spread across meals; the shares add up to 1.
const MEAL_SHARES = { Breakfast: 0.25, Lunch: 0.3, Dinner: 0.3, Snack: 0.15 };
const MEALS = Object.keys(MEAL_SHARES);
// Pick one idea per meal for a date so the suggestions rotate day by day.
const ideaForMeal = (meal, date) => {
  const ideas = foodIdeas.filter((idea) => idea.meal === meal);
  const dayNumber = Math.floor(new Date(`${date}T12:00:00`).valueOf() / 86400000);
  return ideas.length ? ideas[dayNumber % ideas.length] : null;
};

function CalorieChart({ entries, date, target, days = 7 }) {
  const points = Array.from({ length: days }, (_, i) => {
    const day = addDays(date, i - days + 1);
    const foods = entries.filter((e) => e.date === day && e.kind === 'food');
    return { date: day, calories: sum(foods, 'calories'), count: foods.length };
  });
  const max = Math.max(target * 1.2, ...points.map((p) => p.calories), 1);
  return (
    <>
      <div
        className="calorie-chart"
        role="img"
        aria-label={`Food calories for the last ${days} days. Dashed line represents the current daily target of ${target} calories.`}
      >
        <div className="chart-scale">
          <span>{Math.round(max).toLocaleString()}</span>
          <span>{Math.round(max / 2).toLocaleString()}</span>
          <span>0</span>
        </div>
        <div className="bar-plot">
          <div className="target-line" style={{ bottom: `${(target / max) * 100}%` }}>
            <span>GOAL {target.toLocaleString()}</span>
          </div>
          {points.map((p) => (
            <div className="bar-column" key={p.date}>
              <div
                title={`${p.date}: ${p.count ? p.calories + ' kcal logged' : 'no food entries'}`}
                style={{ height: `${Math.max(1, (p.calories / max) * 100)}%` }}
                className={`chart-bar ${p.date === date ? 'today' : ''} ${!p.count ? 'missing' : ''}`}
              />
              <span>{dateLabel(p.date, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="chart-data">
        <summary>View chart numbers</summary>
        <table>
          <caption>
            Current plan target: {target} kcal/day. Missing logs are not zero intake.
          </caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Food calories logged</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.count ? p.calories.toLocaleString() : 'Not logged'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
function WeightChart({ entries, unit }) {
  const points = entries
    .filter((e) => e.kind === 'weight')
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2)
    return (
      <Empty title="Your trend starts with two check-ins.">
        Log weight on two different days to see your line take shape. There’s no rush.
      </Empty>
    );
  const values = points.map((e) => (unit === 'lb' ? kgToLb(e.weight) : e.weight));
  const min = Math.min(...values) - 1,
    max = Math.max(...values) + 1;
  const firstTime = new Date(points[0].date).valueOf(),
    lastTime = new Date(points.at(-1).date).valueOf();
  const coords = values.map((value, i) => [
    45 + ((new Date(points[i].date).valueOf() - firstTime) / (lastTime - firstTime)) * 600,
    165 - ((value - min) / (max - min)) * 130,
  ]);
  return (
    <>
      <svg
        viewBox="0 0 690 205"
        className="weight-chart"
        role="img"
        aria-label="Your recorded weight trend over time"
      >
        <defs>
          <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#bc788b" stopOpacity=".25" />
            <stop offset="1" stopColor="#bc788b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 100, 165].map((y, i) => (
          <g key={y}>
            <line x1="45" x2="645" y1={y} y2={y} stroke="#e9e1db" strokeDasharray="4 5" />
            <text x="0" y={y + 4} fontSize="12" fill="#857c76">
              {(max - ((max - min) * i) / 2).toFixed(1)}
            </text>
          </g>
        ))}
        <path
          d={`M${coords.map((c) => c.join(',')).join(' L')} L645,180 L45,180 Z`}
          fill="url(#weight-fill)"
        />
        <polyline
          points={coords.map((c) => c.join(',')).join(' ')}
          fill="none"
          stroke="#a85166"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle key={points[i].date} cx={c[0]} cy={c[1]} r="4" fill="#a85166">
            <title>
              {points[i].date}: {values[i].toFixed(1)} {unit}
            </title>
          </circle>
        ))}
        <text x="45" y="200" fontSize="12" fill="#857c76">
          {points[0].date}
        </text>
        <text x="645" y="200" textAnchor="end" fontSize="12" fill="#857c76">
          {points.at(-1).date}
        </text>
      </svg>
      <details className="chart-data">
        <summary>View weight records</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight ({unit})</th>
              <th>Recorded body fat</th>
              <th>Recorded muscle</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{values[i].toFixed(1)}</td>
                <td>{p.bodyFat != null ? `${p.bodyFat}%` : '—'}</td>
                <td>{p.muscle != null ? `${p.muscle}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export default function Dashboard() {
  const { user, profile, logout } = useAuth();
  const plan = useMemo(() => calculatePlan(profile), [profile]);
  const [entries, setEntries] = useState([]),
    [date, setDate] = useState(localDate()),
    [tab, setTab] = useState('overview'),
    [loadError, setLoadError] = useState(''),
    [loading, setLoading] = useState(true);
  const [logKind, setLogKind] = useState(null),
    [drawer, setDrawer] = useState(false),
    [hydration, setHydration] = useState(false),
    [remove, setRemove] = useState(null),
    [toast, setToast] = useState(''),
    [note, setNote] = useState(null), // { tone: 'away' | 'party', text } shown for four seconds
    [confetti, setConfetti] = useState(false),
    [actionBusy, setActionBusy] = useState(false);
  // Remembered per goal, so "take a break" is asked once per target on this device.
  const goalKey = `usf-goal-${user.id}-${profile.journey}-${profile.targetWeight}`;
  const [goalAnswered, setGoalAnswered] = useState(() => {
    try {
      return localStorage.getItem(goalKey) === 'answered';
    } catch {
      return false;
    }
  });
  const [unit, setUnit] = useState(() => {
    try {
      return localStorage.getItem('usf-weight-unit') || 'kg';
    } catch {
      return 'kg';
    }
  });
  const navigate = useNavigate();
  async function refresh() {
    setLoadError('');
    try {
      let offset = 0;
      const records = new Map();
      do {
        const result = await api(`/entries?offset=${offset}`);
        result.entries.forEach((entry) => records.set(entry.id, entry));
        offset = result.nextOffset;
      } while (offset != null);
      setEntries([...records.values()]);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (note) {
      const timer = setTimeout(() => setNote(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [note]);
  const dayEntries = entries.filter((e) => e.date === date);
  const foods = dayEntries.filter((e) => e.kind === 'food'),
    exercises = dayEntries.filter((e) => e.kind === 'exercise');
  const calories = sum(foods, 'calories'),
    water = sum(
      dayEntries.filter((e) => e.kind === 'water'),
      'amount',
    );
  const latestWeight = entries
    .filter((e) => e.kind === 'weight' && e.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const currentWeight = latestWeight?.weight || profile.weight;
  const displayWeight = (kg) => (unit === 'lb' ? kgToLb(kg) : kg).toFixed(1);
  const caloriePercent = Math.min(100, (calories / plan.target) * 100);
  const loggedDays = new Set(
    entries.filter((e) => e.date <= date && e.date >= addDays(date, -6)).map((e) => e.date),
  ).size;
  // ---- Direction of travel. A check-in is compared with the one before it (or the starting
  // weight); swings under 0.2 kg are treated as normal day-to-day noise rather than a change.
  const NOISE = 0.2;
  const goalDirection = profile.journey === 'loss' ? -1 : profile.journey === 'gain' ? 1 : 0;
  const checkIns = useMemo(
    () => entries.filter((e) => e.kind === 'weight').sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );
  const checkInBefore = (entry, list = checkIns) =>
    list.filter((e) => e.date < entry.date && e.id !== entry.id).at(-1)?.weight ?? profile.weight;
  const isMovingAway = (entry, list = checkIns) => {
    if (!entry) return false;
    const previous = checkInBefore(entry, list);
    return goalDirection
      ? Math.sign(entry.weight - previous) === -goalDirection &&
          Math.abs(entry.weight - previous) > NOISE
      : Math.abs(entry.weight - profile.weight) > Math.abs(previous - profile.weight) + NOISE;
  };
  const hasReachedGoal = (entry) =>
    Boolean(
      goalDirection &&
      entry &&
      (goalDirection < 0
        ? entry.weight <= profile.targetWeight
        : entry.weight >= profile.targetWeight),
    );
  const newestCheckIn = checkIns.at(-1);
  const movingAway = isMovingAway(latestWeight);
  const reached = hasReachedGoal(latestWeight);
  const celebrate = hasReachedGoal(newestCheckIn) && !goalAnswered;
  // Fat loss and muscle gain fill the arc on the way to the goal; maintenance and recomposition
  // keep it full while the weight stays close to the starting reference.
  const weightProgress = goalDirection
    ? Math.max(
        0,
        Math.min(1, (currentWeight - profile.weight) / (profile.targetWeight - profile.weight)),
      )
    : 1 -
      Math.min(1, Math.abs(currentWeight - profile.weight) / Math.max(2, profile.weight * 0.03));
  const gaugeColor = movingAway ? '#c45c5c' : reached ? '#5f8a6c' : '#b5677b';
  const gaugeStatus = !latestWeight
    ? 'Your first check-in sets the direction.'
    : movingAway
      ? 'Moving away from your goal since the last check-in.'
      : reached
        ? 'Goal reached. Beautifully done.'
        : goalDirection
          ? `${Math.round(weightProgress * 100)}% of the way to your goal.`
          : Math.abs(currentWeight - profile.weight) < 0.05
            ? 'Right on your starting reference.'
            : `Within ${displayWeight(Math.abs(currentWeight - profile.weight))} ${unit} of your starting reference.`;
  function answerGoal(choice) {
    if (choice === 'extend') return navigate(`/onboarding?step=4&weight=${newestCheckIn.weight}`);
    if (choice === 'change') return navigate('/onboarding?step=1');
    try {
      localStorage.setItem(goalKey, 'answered');
    } catch {
      /* Preferences are optional. */
    }
    setGoalAnswered(true);
    setConfetti(true);
    setToast('');
    setNote({
      tone: 'party',
      text: `Congratulations, ${user.name.split(' ')[0]}! You deserve this break. See you soon!`,
    });
  }
  function setWeightUnit(value) {
    setUnit(value);
    try {
      localStorage.setItem('usf-weight-unit', value);
    } catch {
      /* Preferences are optional. */
    }
  }
  async function removeEntry() {
    setActionBusy(true);
    try {
      await api(`/entries/${remove.id}`, { method: 'DELETE', body: {} });
      setEntries((e) => e.filter((x) => x.id !== remove.id));
      setRemove(null);
      setToast('Entry removed. Your totals are up to date.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setActionBusy(false);
    }
  }
  async function signOut() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setToast(error.message);
    }
  }
  const tabs = [
    { id: 'overview', title: 'Overview', icon: LayoutDashboard },
    { id: 'meals', title: 'Food & my plan', icon: Utensils },
    { id: 'progress', title: 'My progress', icon: ChartNoAxesCombined },
  ];
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <span className="overline">YOUR LITTLE WELLNESS SPACE</span>
        <nav aria-label="Dashboard sections">
          {tabs.map(({ id, title, icon: Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={19} />
              {title}
              {tab === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <Sprout size={30} strokeWidth={1.4} />
          <h3>
            Keep showing up
            <br />
            for yourself.
          </h3>
          <p>
            Small things, done often.
            <br />
            That’s where change grows.
          </p>
          <Link to={profile.journey === 'gain' ? '/muscle-gain' : '/fat-loss'}>
            A little inspiration <ArrowUpRight size={15} />
          </Link>
        </div>
        <button className="sidebar-profile" onClick={() => setDrawer(true)}>
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <span>
            <strong>{user.name.split(' ')[0]}</strong>
            <small>Your account</small>
          </span>
          <Settings2 size={18} />
        </button>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-heading">
          <div>
            <button className="greeting" onClick={() => setDrawer(true)}>
              Hey, {user.name.split(' ')[0]} <span>✦</span>
              <ChevronDown size={18} />
            </button>
            <p>
              {tab === 'overview'
                ? 'Welcome back. A little care goes a long way.'
                : tab === 'meals'
                  ? 'Make room for food that makes you feel good.'
                  : 'Your journey is more than a single number.'}
            </p>
          </div>
          <label className="date-picker">
            <CalendarDays size={17} />
            <input
              aria-label="Dashboard date"
              type="date"
              value={date}
              max={localDate()}
              min="2000-01-01"
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
        </div>
        <div className="dashboard-plan-line">
          <span className="plan-badge">
            <Sprout size={14} />
            {JOURNEYS[profile.journey].title}
          </span>
          <span>{profile.days}-day intention</span>
          <button className="text-link" onClick={() => navigate('/onboarding')}>
            Adjust my plan <ArrowUpRight size={14} />
          </button>
        </div>
        {loadError && (
          <div className="error-message" role="alert">
            {loadError}
            <button onClick={refresh}>Try again</button>
          </div>
        )}
        {loading && (
          <p role="status" className="muted">
            Loading your records…
          </p>
        )}
        {tab === 'overview' && (
          <>
            <div className="dashboard-top-grid">
              <Reveal className="panel weight-panel">
                <div className="card-heading">
                  <h2>Your weight, in perspective</h2>
                  <Weight size={19} />
                </div>
                <div className="weight-gauge">
                  <svg viewBox="0 0 240 150" aria-hidden="true">
                    <path
                      d="M 25 125 A 95 95 0 0 1 215 125"
                      fill="none"
                      stroke="#eee5df"
                      strokeWidth="13"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 25 125 A 95 95 0 0 1 215 125"
                      fill="none"
                      stroke={gaugeColor}
                      strokeWidth="13"
                      strokeLinecap="round"
                      pathLength="100"
                      strokeDasharray={`${Math.max(3, weightProgress * 100)} 100`}
                      style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
                    />
                  </svg>
                  <div>
                    <span>{latestWeight ? 'LATEST CHECK-IN' : 'YOUR STARTING WEIGHT'}</span>
                    <strong>
                      {displayWeight(currentWeight)}
                      <small>{unit}</small>
                    </strong>
                    <button
                      className="unit-switch"
                      onClick={() => setWeightUnit(unit === 'kg' ? 'lb' : 'kg')}
                    >
                      Show {unit === 'kg' ? 'lb' : 'kg'}
                    </button>
                  </div>
                </div>
                <p
                  className={`gauge-status ${movingAway ? 'away' : reached ? 'reached' : ''}`}
                  role="status"
                >
                  {gaugeStatus}
                </p>
                <div className="weight-endpoints">
                  <span>
                    Starting
                    <strong>
                      {displayWeight(profile.weight)} {unit}
                    </strong>
                  </span>
                  <span>
                    {['loss', 'gain'].includes(profile.journey)
                      ? 'Your goal'
                      : 'Starting reference'}
                    <strong>
                      {displayWeight(
                        ['loss', 'gain'].includes(profile.journey)
                          ? profile.targetWeight
                          : profile.weight,
                      )}{' '}
                      {unit}
                    </strong>
                  </span>
                </div>
                <button
                  className="button secondary full-width"
                  onClick={() => setLogKind('weight')}
                >
                  <Plus size={17} />
                  Log a check-in
                </button>
              </Reveal>
              <Reveal className="panel calorie-panel" delay={0.06}>
                <div className="card-heading">
                  <h2>A little consistency</h2>
                  <span>LAST 7 DAYS</span>
                </div>
                <div className="calorie-card-summary">
                  <strong>
                    {calories.toLocaleString()}
                    <small>kcal logged</small>
                  </strong>
                  <span>
                    <i className="legend-dot" />
                    Food calories <i className="legend-dash" />
                    Current goal
                  </span>
                </div>
                <CalorieChart entries={entries} date={date} target={plan.target} />
                <div className="consistency-line">
                  <span>
                    <Check size={15} />
                    {loggedDays} of 7 days with a check-in
                  </span>
                  <div className="consistency-track">
                    <i style={{ width: `${(loggedDays / 7) * 100}%` }} />
                  </div>
                </div>
              </Reveal>
            </div>
            <div className="daily-heading">
              <h2>Your day, one small step at a time.</h2>
              <span>
                {date === localDate()
                  ? 'TODAY'
                  : dateLabel(date, { month: 'short', day: 'numeric' }).toUpperCase()}
              </span>
            </div>
            <div className="daily-grid">
              <div className="panel food-summary">
                <div className="card-heading">
                  <span className="icon-disc pink-disc">
                    <Utensils size={20} />
                  </span>
                  <button
                    className="add-button"
                    onClick={() => setLogKind('food')}
                    aria-label="Log food"
                  >
                    <Plus size={19} />
                  </button>
                </div>
                <h3>Something nourishing</h3>
                <div className="daily-stat">
                  {calories.toLocaleString()}
                  <span>/ {plan.target.toLocaleString()} kcal</span>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${caloriePercent}%` }} />
                </div>
                <p>
                  {foods.length
                    ? `${foods.length} food ${foods.length === 1 ? 'entry' : 'entries'} · ${Math.round(sum(foods, 'protein'))} g protein logged`
                    : 'Your food diary is ready when you are.'}
                </p>
                <button className="text-link" onClick={() => setLogKind('food')}>
                  Log your food <ArrowRight size={15} />
                </button>
              </div>
              <div className="panel water-summary">
                <div className="card-heading">
                  <span className="icon-disc blue-disc">
                    <Droplets size={20} />
                  </span>
                  <button
                    className="add-button"
                    onClick={() => setLogKind('water')}
                    aria-label="Log water"
                  >
                    <Plus size={19} />
                  </button>
                </div>
                <h3>A moment to hydrate</h3>
                <div className="daily-stat">
                  {(water / 1000).toFixed(2)}
                  <span>/ {(profile.waterGoal / 1000).toFixed(1)} L reminder</span>
                </div>
                <div className="water-drops" aria-label={`${water} millilitres logged`}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <Droplets
                      key={i}
                      size={24}
                      className={
                        i < Math.floor(Math.min(1, water / profile.waterGoal) * 8) ? 'filled' : ''
                      }
                    />
                  ))}
                </div>
                <p>Every sip is a little act of care.</p>
                <button className="text-link" onClick={() => setHydration(true)}>
                  Why hydration matters <ArrowRight size={15} />
                </button>
              </div>
              <div className="panel exercise-summary">
                <div className="card-heading">
                  <span className="icon-disc green-disc">
                    <Dumbbell size={20} />
                  </span>
                  <button
                    className="add-button"
                    onClick={() => setLogKind('exercise')}
                    aria-label="Log exercise"
                  >
                    <Plus size={19} />
                  </button>
                </div>
                <h3>Move in your own way</h3>
                <div className="daily-stat">
                  {sum(exercises, 'minutes')}
                  <span>minutes logged</span>
                </div>
                <div className="activity-decoration">
                  <Activity size={29} />
                  <span>
                    {exercises.length
                      ? `${sum(exercises, 'calories')} estimated kcal burned`
                      : 'Walking, lifting, stretching. It all counts.'}
                  </span>
                </div>
                <p>Recovery days have a place here too.</p>
                <button className="text-link" onClick={() => setLogKind('exercise')}>
                  Log your movement <ArrowRight size={15} />
                </button>
              </div>
            </div>
            <div className="dashboard-note">
              <span>
                <Heart size={21} />
              </span>
              <div>
                <strong>
                  {loggedDays
                    ? 'You’re making space for yourself. Keep that going.'
                    : 'Your first check-in is a lovely place to start.'}
                </strong>
                <p>
                  {plan.message} Exercise calories are recorded separately from your food target.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === 'meals' && (
          <>
            <div className="panel meal-plan">
              <div className="card-heading">
                <h2>Your meal rhythm</h2>
                <span>{plan.target.toLocaleString()} KCAL / DAY</span>
              </div>
              <p className="muted">
                A flexible way to spread your starting estimate across the day. These are meal
                ideas, not a prescribed menu. Adjust for allergies, preferences, and appetite. The
                suggestion for each meal changes with the selected date; all {foodIdeas.length}{' '}
                ideas are available when you log food.
              </p>
              <div className="meal-budget-grid">
                {MEALS.map((meal) => {
                  const idea = ideaForMeal(meal, date);
                  return (
                    <div key={meal}>
                      <span className="overline">{meal}</span>
                      <h3>
                        {Math.round(plan.target * MEAL_SHARES[meal])}
                        <small> kcal budget</small>
                      </h3>
                      <p>{idea?.name || 'Add your own idea'}</p>
                      {idea && (
                        <small className="muted">
                          Example serving: {idea.serving} · about {idea.calories} kcal,{' '}
                          {idea.protein} g protein
                        </small>
                      )}
                      <button className="text-link" onClick={() => setLogKind('food')}>
                        Plan or log a meal <Plus size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="macro-summary">
                <span>
                  <strong>{plan.protein} g</strong>Protein / day
                </span>
                <span>
                  <strong>{plan.carbs} g</strong>Carbohydrates / day
                </span>
                <span>
                  <strong>{plan.fat} g</strong>Fat / day
                </span>
              </div>
              <p className="small muted">
                Food idea nutrition is approximate and will not automatically match each meal
                budget. Check labels and edit your serving before logging.
              </p>
            </div>
          </>
        )}
        {tab === 'progress' && (
          <>
            <div className="panel">
              <div className="card-heading">
                <h2>Small changes, over time.</h2>
                <button className="button secondary" onClick={() => setLogKind('weight')}>
                  <Plus size={16} />
                  Check in
                </button>
              </div>
              <WeightChart entries={entries} unit={unit} />
            </div>
            <div className="body-metrics">
              <div className="panel">
                <span className="overline">STARTING BMI</span>
                <strong>{plan.bmi}</strong>
                <p>A screening measure, not a body-fat or fitness score.</p>
                <Citation id="bmi" />
              </div>
              <div className="panel">
                <span className="overline">BODY FAT</span>
                <strong>
                  {latestWeight?.bodyFat != null
                    ? `${latestWeight.bodyFat}%`
                    : plan.bodyFatBmi != null
                      ? `~${plan.bodyFatBmi}%`
                      : '—'}
                </strong>
                <p>
                  {latestWeight?.bodyFat != null
                    ? 'Your recorded measurement at the latest check-in.'
                    : 'Starting Deurenberg estimate from BMI, age, and the equation setting.'}
                  {plan.bodyFat != null && ` Tape-based starting estimate: ~${plan.bodyFat}%.`}
                </p>
                <Citation id="deurenberg" />
              </div>
              <div className="panel">
                <span className="overline">LEAN BODY MASS</span>
                <strong>
                  {latestWeight?.muscle != null ? (
                    `${latestWeight.muscle}%`
                  ) : plan.leanBodyMass != null ? (
                    <>
                      ~{plan.leanBodyMass}
                      <small>kg</small>
                    </>
                  ) : (
                    '—'
                  )}
                </strong>
                <p>
                  {latestWeight?.muscle != null
                    ? `Your recorded muscle value; accuracy depends on the method. Boer lean-mass estimate: ~${plan.leanBodyMass ?? '—'} kg.`
                    : plan.muscleMassRange
                      ? `Boer estimate, ${plan.leanMassPercentage}% of your starting weight. It includes water, bone, and organs; skeletal muscle is roughly 45–55% of it, about ${plan.muscleMassRange[0]}–${plan.muscleMassRange[1]} kg.`
                      : 'No plausible estimate for these inputs. Add a separately assessed value in a check-in.'}
                </p>
                <Citation id="boer" />
              </div>
              <div className="panel">
                <span className="overline">PROTEIN</span>
                <strong>
                  {plan.proteinPercentage != null ? `~${plan.proteinPercentage}%` : '—'}
                </strong>
                <p>
                  {plan.proteinMass != null
                    ? `About 20% of estimated fat-free mass, roughly ${plan.proteinMass} kg of your starting weight. A model-based estimate, not a measurement.`
                    : 'No plausible estimate for these inputs.'}
                </p>
                <Citation id="compartments" />
              </div>
            </div>
            <div className="note">
              <Info size={18} />
              <p>
                Calculated values are formula estimates from height, weight, age, and the equation
                setting, not device measurements. Lean mass includes water, bone, and organs; it is
                not muscle mass. A weight trend cannot confirm fat loss or muscle gain by itself.
              </p>
            </div>
          </>
        )}
        <section className="panel diary">
          <div className="card-heading">
            <h2>{tab === 'meals' ? 'Your food diary' : 'Your daily check-ins'}</h2>
            <button className="text-link" onClick={() => setLogKind('food')}>
              <Plus size={16} />
              Add an entry
            </button>
          </div>
          {(tab === 'meals' ? foods : dayEntries).length ? (
            <div className="entry-list">
              {(tab === 'meals' ? foods : dayEntries).map((entry) => {
                const Icon = {
                  food: Utensils,
                  water: Droplets,
                  exercise: Dumbbell,
                  weight: Weight,
                }[entry.kind];
                return (
                  <div className="entry-row" key={entry.id}>
                    <span className={`entry-icon ${entry.kind}`}>
                      <Icon size={19} />
                    </span>
                    <div>
                      <strong>
                        {entry.name ||
                          (entry.kind === 'water' ? 'A little hydration' : 'Weight check-in')}
                      </strong>
                      <small>
                        {entry.kind === 'food'
                          ? `${entry.meal} · ${entry.protein} g protein · ${entry.carbs} g carbs · ${entry.fat} g fat`
                          : entry.kind === 'exercise'
                            ? `${entry.minutes} minutes · energy estimate is not deducted from food`
                            : entry.kind === 'weight'
                              ? entry.note || 'A point in your journey'
                              : 'Water logged'}
                      </small>
                    </div>
                    <span className="entry-value">
                      {entry.kind === 'water'
                        ? `${entry.amount} ml`
                        : entry.kind === 'weight'
                          ? `${displayWeight(entry.weight)} ${unit}`
                          : `${entry.calories} kcal`}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${entry.name || entry.kind} entry`}
                      onClick={() => setRemove(entry)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="A fresh page for your day.">
              No {tab === 'meals' ? 'food ' : ''}entries for{' '}
              {dateLabel(date, { month: 'long', day: 'numeric' })} yet. Add a meal, some water, or a
              moment of movement.
            </Empty>
          )}
        </section>
        <p className="dashboard-fineprint">
          Your pace. Your progress. Your private space. <Link to="/privacy">About your data</Link>
        </p>
      </div>
      <LogDialog
        kind={logKind}
        date={date}
        unit={unit}
        onClose={() => setLogKind(null)}
        onSaved={(entry) => {
          const next = [entry, ...entries.filter((e) => e.id !== entry.id)];
          setEntries(next);
          setLogKind(null);
          const away =
            entry.kind === 'weight' &&
            isMovingAway(
              entry,
              next.filter((e) => e.kind === 'weight').sort((a, b) => a.date.localeCompare(b.date)),
            );
          if (away) {
            setToast('');
            setNote({
              tone: 'away',
              text: 'We are moving away from our goal, friend 🥲 One small step back tomorrow counts.',
            });
          } else if (!(entry.kind === 'weight' && hasReachedGoal(entry) && !goalAnswered))
            setToast('Saved. One small step, recorded.'); // the celebration speaks for itself
        }}
      />
      <Modal
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Your little corner"
        className="profile-drawer"
      >
        <div className="account-person">
          <span className="avatar">{user.name[0]}</span>
          <h3>{user.name}</h3>
          <p>@{user.username}</p>
        </div>
        <p className="small muted">{user.email || 'Signed in with a social account'}</p>
        <div className="drawer-links">
          <Link to="/onboarding">
            <Settings2 size={19} />
            Change my plan
            <ArrowUpRight size={16} />
          </Link>
          <Link to="/account">
            <ShieldCheck size={19} />
            Account & security
            <ArrowUpRight size={16} />
          </Link>
          <a href="/api/export/pdf" download>
            <Download size={19} />
            Download my records (PDF)
            <ArrowUpRight size={16} />
          </a>
          <Link to="/privacy">
            <Heart size={19} />
            Privacy & my data
            <ArrowUpRight size={16} />
          </Link>
          <button onClick={signOut}>
            <LogOut size={19} />
            Sign out
          </button>
        </div>
      </Modal>
      <Modal open={hydration} onClose={() => setHydration(false)} title="A little more about water">
        <p>
          Water helps with temperature regulation, joint cushioning, and normal body function. Needs
          vary with activity, climate, health, and life stage; food and other drinks contribute too.
        </p>
        <p>
          Your {profile.waterGoal} ml reminder is a personal preference. It is not a universal
          requirement or a prompt to drink large amounts quickly. Follow medical advice if you have
          a fluid restriction.
        </p>
        <Citation id="water" />
        <button
          className="button full-width"
          onClick={() => {
            setHydration(false);
            setLogKind('water');
          }}
        >
          Log a drink <Plus size={17} />
        </button>
      </Modal>
      <Modal open={Boolean(remove)} onClose={() => setRemove(null)} title="Remove this entry?">
        <p>
          This will remove the selected {remove?.kind} record and update the totals. You can add a
          corrected entry afterwards.
        </p>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setRemove(null)}>
            Keep it
          </button>
          <button className="button" disabled={actionBusy} onClick={removeEntry}>
            {actionBusy ? 'Removing…' : 'Remove entry'}
          </button>
        </div>
      </Modal>
      <Modal
        open={celebrate}
        onClose={(event) => event?.preventDefault?.()} // stays until one option is chosen
        title="Goal reached"
        className="celebration"
      >
        <span className="story-icon">
          <PartyPopper size={30} />
        </span>
        <Eyebrow>YOU DID IT</Eyebrow>
        <h3>Congratulations on hitting your target, {user.name.split(' ')[0]}!</h3>
        <p>
          You set out for {displayWeight(profile.targetWeight)} {unit} and your latest check-in is{' '}
          {newestCheckIn ? displayWeight(newestCheckIn.weight) : displayWeight(currentWeight)}{' '}
          {unit}. Take a moment to enjoy this.
        </p>
        <p className="celebration-question">What would you like to do next?</p>
        <div className="celebration-choices">
          <button className="button" onClick={() => answerGoal('extend')}>
            Extend my target <ArrowRight size={17} />
          </button>
          <button className="button secondary" onClick={() => answerGoal('change')}>
            Change my plan
          </button>
          <button className="button secondary" onClick={() => answerGoal('break')}>
            Take a break
          </button>
        </div>
      </Modal>
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      {note && (
        <div className={`toast note-${note.tone}`} role="status">
          {note.tone === 'away' ? <TrendingDown size={17} /> : <PartyPopper size={17} />}
          {note.text}
          <button aria-label="Dismiss notification" onClick={() => setNote(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// A short shower of paper pieces for the goal celebration; skipped when the person prefers
// reduced motion. Pure CSS animation, removed from the page once it has fallen.
function Confetti({ onDone }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.4 + Math.random() * 1.2,
        size: 6 + Math.random() * 8,
        color: ['#b5677b', '#e9c9b2', '#f0a7b8', '#64705a', '#f6dfa4', '#ffffff'][i % 6],
        tilt: Math.random() * 360,
      })),
    [],
  );
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(onDone, reduced ? 0 : 3800);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.tilt}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function LogDialog({ kind, date, unit, onClose, onSaved }) {
  const [form, setForm] = useState({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({
      date,
      idea: '',
      name: '',
      meal: 'Breakfast',
      calories: '',
      protein: 0,
      carbs: 0,
      fat: 0,
      amount: 250,
      minutes: '',
      weight: '',
      bodyFat: '',
      muscle: '',
      note: '',
    });
    setError('');
  }, [kind, date]);
  const input = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => setForm((p) => ({ ...p, [key]: e.target.value })),
  });
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = { ...form, kind };
      if (kind === 'weight' && unit === 'lb') data.weight = lbToKg(Number(form.weight));
      const result = await api('/entries', { method: 'POST', body: data });
      onSaved(result.entry);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={Boolean(kind)}
      onClose={onClose}
      title={
        {
          food: 'Something nourishing.',
          water: 'A moment to hydrate.',
          exercise: 'Movement, your way.',
          weight: 'A little check-in.',
        }[kind] || 'Log your day'
      }
    >
      <form onSubmit={submit} className="form-stack">
        <Field
          label="Date"
          type="date"
          max={localDate()}
          min="2000-01-01"
          required
          {...input('date')}
        />
        {kind === 'food' && (
          <>
            <label className="field">
              <span>Start with an idea (optional)</span>
              <select
                value={form.idea ?? ''}
                onChange={(e) => {
                  const idea = e.target.value;
                  setForm((p) =>
                    idea === ''
                      ? { ...p, idea, serving: '' }
                      : { ...p, ...foodIdeas[Number(idea)], idea },
                  );
                }}
              >
                <option value="">Enter my own food</option>
                {MEALS.map((meal) => (
                  <optgroup label={meal} key={meal}>
                    {foodIdeas.map((food, i) =>
                      food.meal === meal ? (
                        <option value={i} key={food.name}>
                          {food.name} · {food.calories} kcal
                        </option>
                      ) : null,
                    )}
                  </optgroup>
                ))}
              </select>
              <small>
                {foodIdeas.length} examples, grouped by meal. Values are approximate; edit nutrition
                to match your actual serving and label.
              </small>
            </label>
            <Field
              label="Food / meal name"
              placeholder="e.g. Homemade lentil bowl"
              required
              maxLength={120}
              {...input('name')}
            />
            {form.serving && <p className="small muted">Example serving: {form.serving}</p>}
            <div className="form-grid">
              <label className="field">
                <span>Meal</span>
                <select {...input('meal')}>
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <Field
                label="Calories (kcal)"
                type="number"
                min="1"
                max="5000"
                step="1"
                required
                {...input('calories')}
              />
              <Field
                label="Protein (g)"
                type="number"
                min="0"
                max="500"
                step="0.1"
                required
                {...input('protein')}
              />
              <Field
                label="Carbohydrates (g)"
                type="number"
                min="0"
                max="1000"
                step="0.1"
                required
                {...input('carbs')}
              />
              <Field
                label="Fat (g)"
                type="number"
                min="0"
                max="500"
                step="0.1"
                required
                {...input('fat')}
              />
            </div>
          </>
        )}
        {kind === 'water' && (
          <>
            <div className="water-presets">
              {[150, 250, 500, 750].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={Number(form.amount) === n ? 'selected' : ''}
                  onClick={() => setForm((p) => ({ ...p, amount: n }))}
                >
                  <Droplets size={19} />
                  {n} ml
                </button>
              ))}
            </div>
            <Field
              label="Water amount (ml)"
              type="number"
              min="1"
              max="2000"
              step="1"
              required
              {...input('amount')}
            />
            <p className="small muted">
              Log what you drank. Your reminder is not a drinking requirement.
            </p>
          </>
        )}
        {kind === 'exercise' && (
          <>
            <Field
              label="Activity"
              placeholder="e.g. Evening walk or strength session"
              required
              maxLength={120}
              {...input('name')}
            />
            <div className="form-grid">
              <Field
                label="Duration (minutes)"
                type="number"
                min="1"
                max="480"
                required
                {...input('minutes')}
              />
              <Field
                label="Estimated calories burned"
                type="number"
                min="0"
                max="3000"
                step="1"
                required
                hint="Enter 0 if you don’t have an estimate."
                {...input('calories')}
              />
            </div>
            <p className="small muted">
              Exercise calories are uncertain. They won’t increase your food target or be counted
              twice with your activity setting.
            </p>
          </>
        )}
        {kind === 'weight' && (
          <>
            <Field
              label={`Weight (${unit})`}
              type="number"
              min={unit === 'kg' ? 35 : 77.162}
              max={unit === 'kg' ? 300 : 661.386}
              step="0.1"
              required
              {...input('weight')}
            />
            <p className="small muted">
              You can record your weight twice a day: the second save replaces the first, and the
              day then keeps that value. Optional values below must come from a separate assessment,
              not a guess.
            </p>
            <div className="form-grid">
              <Field
                label="Measured body fat (%) · optional"
                type="number"
                min="2"
                max="65"
                step="0.1"
                {...input('bodyFat')}
              />
              <Field
                label="Measured muscle (%) · optional"
                type="number"
                min="5"
                max="75"
                step="0.1"
                {...input('muscle')}
              />
            </div>
            <Field
              label="A note to yourself (optional)"
              placeholder="Energy, strength, how you feel…"
              maxLength={300}
              {...input('note')}
            />
          </>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        <button className="button full-width" disabled={busy}>
          {busy ? 'Saving…' : 'Save this small step'}
          <Check size={18} />
        </button>
      </form>
    </Modal>
  );
}
