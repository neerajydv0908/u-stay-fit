import localPhotos from './photos.local.js';
import { SUPPORT_EMAIL } from '../../shared/contact.js';

// Fill these in before a public launch. They appear in the footer and the privacy notice.
export const operator = {
  name: 'Neeraj Yadav', // the person or organisation operating the service
  email: SUPPORT_EMAIL, // a monitored address for privacy and support requests (shared/contact.js)
  instagram: 'https://www.instagram.com/ustay_fit_0916/', // full profile URL, or leave empty
  x: 'https://x.com/Ustayfit0916', // full profile URL, or leave empty
  location: 'Kansas, United States', // country or region whose privacy law applies to the operator
};

// Source photographs are from Unsplash (IDs below). Run `npm run photos:fetch` once to store
// copies under client/public/photos; until then the original Unsplash URLs are used.
export const photoSources = {
  food: ['photo-1512621776951-a57141f2eefd', 1400],
  bread: ['photo-1511278475330-1a31a6fc4dcc', 700],
  avocado: ['photo-1640209702049-a692a1190529', 700],
  female: ['photo-1571019613723-c7e5b75bd4c6', 850],
  male: ['photo-1548933122-5fedf3661c57', 850],
  femaleMaintain: ['photo-1552196603-d02485940b9f', 800],
  maleGain: ['photo-1656774950529-44a6153521ee', 800],
  femaleGain: ['photo-1649888216899-047093431441', 800],
  maleLoss: ['photo-1637579103895-9ba8218e9aca', 800],
  maleMaintain: ['photo-1630415188521-120ff5adfd02', 800],
  // One photo per newer myth card (home page), each used only there.
  mythSkipMeals: ['photo-1531928351158-2f736078e0a1', 700],
  mythStrength: ['photo-1567598317136-3cd762432241', 700],
  mythCardio: ['photo-1638183395699-2c0db5b6afbb', 700],
  mythCrunches: ['photo-1758875569284-c57e79ef75e0', 700],
  mythRest: ['photo-1677572936823-43a5717c1d7b', 700],
  mythBulk: ['photo-1648775170273-dcbe48fb12a0', 700],
  mythShortWorkout: ['photo-1519310572353-9536984a4b0b', 700],
};
export const unsplashUrl = (id, width) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
export const images = Object.fromEntries(
  Object.entries(photoSources).map(([key, [id, width]]) => [
    key,
    localPhotos[key] || unsplashUrl(id, width),
  ]),
);
export const photosSelfHosted =
  Object.keys(localPhotos).length === Object.keys(photoSources).length;
export const journeyImage = (gender, journey) =>
  gender === 'female'
    ? {
        gain: images.femaleGain,
        loss: images.female,
        recomp: images.femaleGain,
        maintain: images.femaleMaintain,
      }[journey]
    : {
        gain: images.maleGain,
        loss: images.maleLoss,
        recomp: images.male,
        maintain: images.maleMaintain,
      }[journey];
export const sources = {
  energy: {
    name: 'Murphy & Koehler · Energy deficit & muscle',
    url: 'https://pubmed.ncbi.nlm.nih.gov/34623696/',
  },
  myths: {
    name: 'NIDDK · Nutrition & activity myths',
    url: 'https://www.niddk.nih.gov/health-information/weight-management/myths-nutrition-physical-activity',
  },
  loss: {
    name: 'CDC · Steps for losing weight',
    url: 'https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html',
  },
  activity: {
    name: 'CDC · Activity, weight & health',
    url: 'https://www.cdc.gov/healthy-weight-growth/physical-activity/index.html',
  },
  water: {
    name: 'CDC · Water & healthier drinks',
    url: 'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html',
  },
  bmr: {
    name: 'Mifflin et al. · Energy estimation',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
  protein: {
    name: 'Morton et al. · Protein & strength',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
  },
  bmi: {
    name: 'CDC · Adult BMI categories',
    url: 'https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html',
  },
  bodyFat: {
    name: 'Foulis et al. · Limits of tape estimates',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10282178/',
  },
  planner: { name: 'NIDDK · Body Weight Planner', url: 'https://www.niddk.nih.gov/bwp' },
  deurenberg: {
    name: 'Deurenberg et al. · BMI-based body-fat formula',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2043597/',
  },
  boer: {
    name: 'Boer · Lean body mass formula',
    url: 'https://pubmed.ncbi.nlm.nih.gov/6496691/',
  },
  compartments: {
    name: 'Wang et al. · Composition of fat-free mass',
    url: 'https://pubmed.ncbi.nlm.nih.gov/10232621/',
  },
  spotReduction: {
    name: 'Vispute et al. · Ab exercise & belly fat',
    url: 'https://pubmed.ncbi.nlm.nih.gov/21804427/',
  },
  keepMuscle: {
    name: 'Cava et al. · Keeping muscle during weight loss',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5421125/',
  },
  bulking: {
    name: 'Iraki et al. · Nutrition for muscle-building phases',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31247944/',
  },
  recovery: {
    name: 'ACSM · Resistance-training progression',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/',
  },
};
// "Less noise. More nourishment." on the home page: one card per myth, shown in a sideways
// (left-to-right) scroller. Each `source` is a key of `sources` above and each `image` a key of
// `photoSources`.
export const myths = [
  {
    image: 'bread',
    alt: 'Sliced wholegrain bread on a wooden board',
    myth: '“Carbs are the enemy.”',
    truth:
      'Carbohydrates can belong in a balanced diet. Whole grains add fibre; portion sizes and your overall eating pattern matter.',
    source: 'myths',
  },
  {
    image: 'avocado',
    alt: 'Fresh avocados, a source of unsaturated fat',
    myth: '“Eating fat makes you fat.”',
    truth:
      'Your body needs dietary fat. Foods such as nuts and avocado can fit your plan. They are energy-dense, so portions still count.',
    source: 'myths',
  },
  {
    image: 'female',
    alt: 'Woman exercising with weights',
    myth: '“More protein means instant muscle.”',
    truth:
      'Protein supports adaptation to resistance training. More is not automatically better, and food cannot replace the training stimulus.',
    source: 'protein',
  },
  {
    image: 'mythSkipMeals',
    alt: 'An empty plate with a knife and fork arranged into a sad face',
    myth: '“Skipping meals speeds up fat loss.”',
    truth:
      'Skipping meals often leaves you hungrier later, so you may eat more at the next meal. Regular, satisfying meals make a steady plan easier to keep.',
    source: 'myths',
  },
  {
    image: 'mythStrength',
    alt: 'Woman walking through a gym carrying a pair of dumbbells',
    myth: '“Lifting weights will make women bulky.”',
    truth:
      'Strength training builds strength and helps you manage your weight. Very large muscles take intense, targeted training and the right genetics, not a few sessions a week.',
    source: 'myths',
  },
  {
    image: 'mythCardio',
    alt: 'Woman running on a treadmill',
    myth: '“Cardio is the only way to lose fat.”',
    truth:
      'Fat loss comes from a steady energy deficit, and food choices alone can create one. Adding strength training helps you keep muscle while the fat comes off.',
    source: 'keepMuscle',
  },
  {
    image: 'mythCrunches',
    alt: 'Woman doing crunches on a mat while a trainer watches',
    myth: '“Crunches will burn belly fat.”',
    truth:
      'You cannot choose where fat comes off. Ab exercises strengthen your core, but belly fat shrinks with overall fat loss.',
    source: 'spotReduction',
  },
  {
    image: 'mythRest',
    alt: 'Man resting on a bench with a bottle of water after training',
    myth: '“Rest days slow your progress.”',
    truth:
      'Muscles adapt while you recover. Planned rest and lighter days between hard sessions are part of a good routine, not a step back.',
    source: 'recovery',
  },
  {
    image: 'mythBulk',
    alt: 'A tall stack of burgers beside a pile of fries',
    myth: '“To build muscle, eat everything in sight.”',
    truth:
      'A modest calorie surplus with progressive training is enough. Eating far more than you need mostly adds fat, not extra muscle.',
    source: 'bulking',
  },
  {
    image: 'mythShortWorkout',
    alt: 'A stopwatch stopped at fifteen',
    myth: '“A workout only counts if it’s long.”',
    truth:
      'Short sessions add up. Ten minutes here and there across the week still counts toward your activity goal. Something beats nothing.',
    source: 'myths',
  },
];
// Illustrative single servings, not a food database. Users should check their labels.
// Every idea has a meal of Breakfast, Lunch, Dinner, or Snack; the dashboard groups by that field.
export const foodIdeas = [
  {
    name: 'Greek yogurt, berries & oats',
    meal: 'Breakfast',
    calories: 340,
    protein: 24,
    carbs: 46,
    fat: 7,
    serving: '170 g plain yogurt, 40 g oats, 100 g berries',
  },
  {
    name: 'Chickpea & grain bowl',
    meal: 'Lunch',
    calories: 480,
    protein: 18,
    carbs: 67,
    fat: 15,
    serving: '150 g cooked chickpeas, 100 g cooked rice, vegetables',
  },
  {
    name: 'Chicken, rice & greens',
    meal: 'Dinner',
    calories: 520,
    protein: 43,
    carbs: 55,
    fat: 14,
    serving: '130 g cooked chicken, 150 g cooked rice, vegetables',
  },
  {
    name: 'Apple & peanut butter',
    meal: 'Snack',
    calories: 190,
    protein: 4,
    carbs: 28,
    fat: 8,
    serving: '1 medium apple, 1 tbsp peanut butter',
  },
  {
    name: 'Salmon, quinoa & spinach',
    meal: 'Dinner',
    calories: 520,
    protein: 43,
    carbs: 55,
    fat: 14,
    serving: '130 g cooked salmon, 150 g cooked quinoa, vegetables',
  },
  {
    name: 'Tuna, rice & broccoli',
    meal: 'Dinner',
    calories: 520,
    protein: 43,
    carbs: 55,
    fat: 14,
    serving: '130 g cooked tuna, 150 g cooked rice, vegetables',
  },
  // Common Indian meals; single-serving estimates for logging, not label data.
  {
    name: 'Dal Tadka & Rice',
    meal: 'Lunch',
    calories: 490,
    protein: 18,
    carbs: 78,
    fat: 12,
    serving: '200 g cooked dal, 150 g cooked rice',
  },
  {
    name: 'Rajma Chawal',
    meal: 'Lunch',
    calories: 520,
    protein: 19,
    carbs: 88,
    fat: 10,
    serving: '200 g rajma curry, 150 g cooked rice',
  },
  {
    name: 'Chole Chawal',
    meal: 'Lunch',
    calories: 540,
    protein: 19,
    carbs: 86,
    fat: 13,
    serving: '200 g chole, 150 g cooked rice',
  },
  {
    name: 'Chole & Roti',
    meal: 'Lunch',
    calories: 470,
    protein: 18,
    carbs: 69,
    fat: 14,
    serving: '200 g chole, 2 medium whole-wheat rotis',
  },
  {
    name: 'Dal & Roti',
    meal: 'Lunch',
    calories: 410,
    protein: 18,
    carbs: 64,
    fat: 10,
    serving: '200 g cooked dal, 2 medium whole-wheat rotis',
  },
  {
    name: 'Paneer Bhurji & Roti',
    meal: 'Lunch',
    calories: 520,
    protein: 28,
    carbs: 43,
    fat: 27,
    serving: '150 g paneer bhurji, 2 medium whole-wheat rotis',
  },
  {
    name: 'Palak Paneer & Roti',
    meal: 'Dinner',
    calories: 510,
    protein: 25,
    carbs: 42,
    fat: 28,
    serving: '200 g palak paneer, 2 medium whole-wheat rotis',
  },
  {
    name: 'Matar Paneer & Roti',
    meal: 'Dinner',
    calories: 540,
    protein: 25,
    carbs: 48,
    fat: 29,
    serving: '200 g matar paneer, 2 medium whole-wheat rotis',
  },
  {
    name: 'Aloo Gobi & Roti',
    meal: 'Lunch',
    calories: 390,
    protein: 11,
    carbs: 61,
    fat: 13,
    serving: '200 g aloo gobi, 2 medium whole-wheat rotis',
  },
  {
    name: 'Bhindi Masala & Roti',
    meal: 'Lunch',
    calories: 360,
    protein: 11,
    carbs: 50,
    fat: 14,
    serving: '200 g bhindi masala, 2 medium whole-wheat rotis',
  },
  {
    name: 'Mixed Vegetable Sabzi & Roti',
    meal: 'Lunch',
    calories: 380,
    protein: 12,
    carbs: 55,
    fat: 13,
    serving: '200 g mixed vegetable sabzi, 2 medium whole-wheat rotis',
  },
  {
    name: 'Khichdi',
    meal: 'Lunch',
    calories: 400,
    protein: 15,
    carbs: 65,
    fat: 10,
    serving: '350 g moong dal khichdi',
  },
  {
    name: 'Vegetable Pulao & Raita',
    meal: 'Lunch',
    calories: 450,
    protein: 13,
    carbs: 69,
    fat: 14,
    serving: '250 g vegetable pulao, 150 g plain raita',
  },
  {
    name: 'Vegetable Biryani & Raita',
    meal: 'Dinner',
    calories: 510,
    protein: 14,
    carbs: 76,
    fat: 17,
    serving: '300 g vegetable biryani, 150 g raita',
  },
  {
    name: 'Idli & Sambar',
    meal: 'Breakfast',
    calories: 350,
    protein: 13,
    carbs: 64,
    fat: 6,
    serving: '3 medium idlis, 200 g sambar',
  },
  {
    name: 'Masala Dosa & Sambar',
    meal: 'Breakfast',
    calories: 480,
    protein: 12,
    carbs: 72,
    fat: 16,
    serving: '1 medium masala dosa, 150 g sambar',
  },
  {
    name: 'Poha',
    meal: 'Breakfast',
    calories: 320,
    protein: 8,
    carbs: 53,
    fat: 9,
    serving: '250 g vegetable poha',
  },
  {
    name: 'Upma',
    meal: 'Breakfast',
    calories: 330,
    protein: 9,
    carbs: 52,
    fat: 10,
    serving: '250 g vegetable upma',
  },
  {
    name: 'Aloo Paratha & Curd',
    meal: 'Breakfast',
    calories: 470,
    protein: 14,
    carbs: 65,
    fat: 17,
    serving: '2 medium aloo parathas, 100 g plain curd',
  },
  {
    name: 'Paneer Paratha & Curd',
    meal: 'Breakfast',
    calories: 510,
    protein: 23,
    carbs: 56,
    fat: 22,
    serving: '2 medium paneer parathas, 100 g plain curd',
  },
  {
    name: 'Besan Chilla',
    meal: 'Breakfast',
    calories: 340,
    protein: 17,
    carbs: 43,
    fat: 11,
    serving: '2 medium besan chillas with vegetables',
  },
  {
    name: 'Moong Dal Chilla',
    meal: 'Breakfast',
    calories: 320,
    protein: 18,
    carbs: 44,
    fat: 8,
    serving: '2 medium moong dal chillas with vegetables',
  },
  {
    name: 'Pav Bhaji',
    meal: 'Dinner',
    calories: 520,
    protein: 14,
    carbs: 76,
    fat: 18,
    serving: '250 g bhaji, 2 pav',
  },
  {
    name: 'Dhokla',
    meal: 'Snack',
    calories: 250,
    protein: 10,
    carbs: 40,
    fat: 6,
    serving: '200 g dhokla',
  },
  {
    name: 'Samosa',
    meal: 'Snack',
    calories: 260,
    protein: 5,
    carbs: 32,
    fat: 13,
    serving: '1 medium samosa (approximately 100 g)',
  },
  {
    name: 'Curd Rice',
    meal: 'Lunch',
    calories: 390,
    protein: 12,
    carbs: 62,
    fat: 10,
    serving: '300 g curd rice',
  },
  {
    name: 'Soya Chunk Curry & Roti',
    meal: 'Dinner',
    calories: 430,
    protein: 29,
    carbs: 55,
    fat: 11,
    serving: '200 g soya chunk curry, 2 medium whole-wheat rotis',
  },
  {
    name: 'Dal Palak & Roti',
    meal: 'Dinner',
    calories: 420,
    protein: 20,
    carbs: 63,
    fat: 10,
    serving: '200 g dal palak, 2 medium whole-wheat rotis',
  },
  {
    name: 'Kadhi Chawal',
    meal: 'Lunch',
    calories: 480,
    protein: 15,
    carbs: 75,
    fat: 14,
    serving: '200 g kadhi, 150 g cooked rice',
  },
  {
    name: 'Dal Makhani & Roti',
    meal: 'Dinner',
    calories: 500,
    protein: 19,
    carbs: 58,
    fat: 22,
    serving: '200 g dal makhani, 2 medium whole-wheat rotis',
  },
];
