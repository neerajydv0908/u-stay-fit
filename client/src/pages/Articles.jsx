import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Sprout, Dumbbell, Heart, Check } from 'lucide-react';
import { Reveal, Citation, Eyebrow } from '../components/UI';
import { images } from '../data';
export default function Article({ type }) {
  const gain = type === 'gain';
  return (
    <div className="article-page">
      <section className="container article-hero">
        <Reveal>
          <Eyebrow>{gain ? 'THE MUSCLE GAIN GUIDE' : 'THE FAT LOSS GUIDE'}</Eyebrow>
          <h1>
            {gain ? (
              <>
                Strength grows.
                <br />
                <span>So can you.</span>
              </>
            ) : (
              <>
                Less pressure.
                <br />
                <span>Steadier progress.</span>
              </>
            )}
          </h1>
          <p>
            {gain
              ? 'Build a stronger body with a little science, enough nourishment, and a rhythm you can keep.'
              : 'Understand what fat loss really means, protect your strength, and make room for the foods you love.'}
          </p>
          <a href="#essentials" className="button">
            Start with the essentials <ArrowRight size={18} />
          </a>
          <span className="article-meta">7 MIN READ · SOURCES CHECKED SEPTEMBER 2026</span>
        </Reveal>
        <Reveal className="article-hero-image">
          <img
            src={gain ? images.femaleGain : images.food}
            alt={gain ? 'Woman strength training in a gym' : 'Colorful vegetable and grain bowl'}
          />
          <div className="article-image-caption">
            <Heart size={18} />
            Your body deserves care, at every stage.
          </div>
        </Reveal>
      </section>
      <div className="container article-content" id="essentials">
        <aside className="article-toc">
          <span className="overline">IN THIS GUIDE</span>
          <a href="#meaning">What does it mean?</a>
          <a href="#practice">The foundations</a>
          <a href="#everyday">Your everyday approach</a>
          <a href="#tracking">What to track</a>
          <a href="#references">Read the evidence</a>
        </aside>
        <div className="article-body">
          <Reveal>
            <section id="meaning">
              <Eyebrow>01 / UNDERSTAND THE GOAL</Eyebrow>
              <h2>
                {gain
                  ? 'Muscle gain is more than a bigger number.'
                  : 'Fat loss and weight loss tell different stories.'}
              </h2>
              <p>
                {gain
                  ? 'Muscle growth, also called hypertrophy, happens as muscle tissue adapts to repeated resistance training. Food supplies energy and building blocks; recovery gives your body time to adapt. Gaining weight alone does not show that you have gained muscle.'
                  : 'Body weight includes fat, muscle, bone, water, and the food being digested. A lower reading may reflect a change in any of these. Fat loss specifically means reducing stored body fat; preserving your ability to move and perform matters too.'}
              </p>
              <p>
                {gain
                  ? 'Fat-free mass is everything that is not fat, including water, organs, and bone. It is not the same as skeletal muscle. Neither BMI nor a tape measure can tell you your muscle percentage.'
                  : 'Body composition estimates have their own errors. Even a tape-based body-fat estimate can miss meaningful short-term changes. A single weigh-in or calculated percentage should never define your progress.'}
              </p>
              <Citation id="bodyFat" />
            </section>
          </Reveal>
          <Reveal>
            <section id="practice">
              <Eyebrow>02 / BUILD THE FOUNDATIONS</Eyebrow>
              <h2>
                {gain
                  ? 'Train. Nourish. Recover. Repeat.'
                  : 'A manageable deficit, with enough nourishment.'}
              </h2>
              {gain ? (
                <>
                  <p>
                    Progressive resistance training gives muscles a reason to adapt. Over time, that
                    might mean more controlled repetitions, a slightly heavier load, or better
                    technique. Start at a manageable level and seek qualified guidance if you are
                    new or have health concerns.
                  </p>
                  <Citation id="activity" />
                  <div className="article-callout">
                    <Dumbbell />
                    <div>
                      <h3>Protein supports the work.</h3>
                      <p>
                        A meta-analysis in healthy adults doing resistance training found benefits
                        from protein supplementation, with average gains levelling off around 1.6
                        g/kg/day. This is context, not a requirement for every body or a reason to
                        buy supplements.
                      </p>
                      <Citation id="protein" />
                    </div>
                  </div>
                  <p>
                    A modest energy surplus can be a starting point for a gain plan. This app limits
                    its suggested surplus to 300 kcal/day as a product guardrail. That limit is not
                    a medical prescription, and extra calories cannot guarantee a specific amount of
                    muscle.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Your body uses energy throughout the day, even at rest. A calorie deficit means
                    taking in less energy than you use over time. Your needs change with body size,
                    activity, medicines, health, and other factors.
                  </p>
                  <Citation id="planner" />
                  <div className="article-callout">
                    <Sprout />
                    <div>
                      <h3>Steady usually beats extreme.</h3>
                      <p>
                        The CDC describes gradual loss of about 1–2 pounds per week as more likely
                        to be maintained than faster loss. That is broad guidance, not a target
                        everyone should pursue. A slower pace can be appropriate.
                      </p>
                      <Citation id="loss" />
                    </div>
                  </div>
                  <p>
                    In this app, a shorter deadline never overrides the calorie guardrails. You will
                    see a limited adjustment and a message to reconsider the timeframe. Mathematical
                    estimates cannot promise a finish date.
                  </p>
                </>
              )}
            </section>
          </Reveal>
          <Reveal>
            <section id="everyday">
              <Eyebrow>03 / MAKE IT FIT YOUR LIFE</Eyebrow>
              <h2>
                {gain ? 'Build a plate you look forward to.' : 'Yes, you can start without a gym.'}
              </h2>
              <p>
                {gain
                  ? 'Include a protein food, a carbohydrate food, fruit or vegetables, and a source of fat across your meals. Beans, lentils, eggs, dairy, tofu, fish, and meat offer different ways to get protein. Choose what suits your preferences, budget, and allergies.'
                  : 'Food changes can create a deficit without a formal exercise programme. Keep your approach practical: plan a satisfying meal, notice portions, and choose an unsweetened drink more often. Avoid assuming that skipping entire food groups is necessary.'}
              </p>
              <Citation id="myths" />
              <ul className="check-list">
                {(gain
                  ? [
                      'Give yourself regular meals and time to recover.',
                      'Record exercises, repetitions, and how the session felt.',
                      'Review your training performance as well as body weight.',
                    ]
                  : [
                      'Notice calorie-containing drinks and routine extras.',
                      'Serve a comfortable portion and check in with hunger.',
                      'Keep a food record to learn patterns, without judgement.',
                    ]
                ).map((t) => (
                  <li key={t}>
                    <Check size={18} />
                    {t}
                  </li>
                ))}
              </ul>
              <p>
                {gain
                  ? 'Physical activity benefits health beyond appearance. Adults are generally advised to include muscle-strengthening activity on at least two days each week; your training should match your abilities.'
                  : 'Exercise is still valuable: it supports heart health, strength, and wellbeing. Resistance training provides a muscle-building stimulus that eating less cannot replace. Choose movement you can safely enjoy.'}
              </p>
              <Citation id="activity" />
            </section>
          </Reveal>
          <Reveal>
            <section id="tracking">
              <Eyebrow>04 / KEEP THE BIGGER PICTURE</Eyebrow>
              <h2>Look for patterns, not perfect days.</h2>
              <p>
                Use similar weigh-in conditions when possible, and interpret several weeks of
                records alongside energy, strength, sleep, and how you feel. Log food using its
                label or a reliable food database. Exercise calorie estimates are uncertain; U Stay
                Fit records them separately and does not automatically subtract them from your food
                target.
              </p>
              <div className="article-callout soft">
                <Heart />
                <div>
                  <h3>Your wellbeing comes first.</h3>
                  <p>
                    This planner is for general adult wellness. It is not intended for pregnancy,
                    breastfeeding, eating-disorder care, or conditions needing a prescribed diet. If
                    tracking feels distressing, or you develop dizziness, unusual fatigue, or
                    unexplained weight changes, pause and seek professional support.
                  </p>
                </div>
              </div>
            </section>
          </Reveal>
          <section id="references">
            <h3>Read the evidence for yourself.</h3>
            <p className="muted">
              These links support the educational content. They do not imply endorsement of U Stay
              Fit.
            </p>
            <div className="source-list">
              {[
                gain ? 'protein' : 'loss',
                'activity',
                'myths',
                'bodyFat',
                'bmr',
                'planner',
                'bmi',
              ].map((id) => (
                <Citation key={id} id={id} />
              ))}
            </div>
            <Link to="/signup" className="button">
              Put the knowledge into practice <ArrowUpRight size={18} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
