import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Heart,
  Sprout,
  Dumbbell,
  ChartNoAxesCombined,
  ShieldCheck,
  Bubbles,
  BadgeCentIcon,
} from 'lucide-react';
import { Reveal, Citation, Eyebrow } from '../components/UI';
import { images } from '../data';
import { useAuth } from '../context';

export default function Home() {
  const { user, profile } = useAuth();
  const start = user ? (profile ? '/dashboard' : '/onboarding') : '/signup';
  return (
    <>
      <section className="hero container">
        <Reveal className="hero-copy">
          <Eyebrow>SMALL STEPS. LASTING CHANGE.</Eyebrow>
          <h1>
            A healthier rhythm.
            <br />
            <span>Every day.</span>
          </h1>
          <p>
            Eat well. Get stronger. Feel more like you.
            <br className="desktop-break" /> A personal plan for your body, your goals,
            <br className="desktop-break" /> and the life you actually live.
          </p>
          <div className="hero-actions">
            <Link className="button" to={start}>
              Find your balance <ArrowUpRight size={19} />
            </Link>
            <a className="text-link" href="#learn">
              A little knowledge first <ArrowRight size={17} />
            </a>
          </div>
          <div className="hero-reassurance">
            <span>
              <Heart size={16} />
              No extreme all-or-nothing rules
            </span>
            <span>
              <Heart size={16} />
              Your pace, always
            </span>
          </div>
        </Reveal>
        <Reveal className="hero-visual" delay={0.12}>
          <div className="hero-photo-wrap">
            <img
              className="hero-photo"
              src={images.food}
              alt="A colorful bowl of vegetables, grains, and nourishing ingredients"
              fetchPriority="high"
            />
            <span className="photo-note">Good food. Good energy.</span>
          </div>
          <div className="floating-card food-badge">
            <span className="icon-disc">
              <Sprout size={21} />
            </span>
            <div>
              <strong>A little more nourishment.</strong>
              <span>A little less overthinking.</span>
            </div>
          </div>
          <div className="floating-card balance-badge">
            <span className="balance-ring">
              <Heart size={23} />
            </span>
            <div>
              <span>YOUR EVERYDAY GOAL</span>
              <strong>Progress, not perfection.</strong>
              <div className="mini-progress">
                <i />
              </div>
            </div>
          </div>
          <span className="hero-spark">
            <Sparkles size={35} strokeWidth={1.3} />
          </span>
        </Reveal>
      </section>
      <div className="container promise-strip">
        <span>
          <ShieldCheck />
          Guided by evidence
        </span>
        <span>
          <Sprout />
          Nourishment over restriction
        </span>
        <span>
          <ChartNoAxesCombined />
          Progress you can understand
        </span>
      </div>
      <section className="section container" id="journeys">
        <Reveal className="section-heading">
          <div>
            <Eyebrow>YOUR BODY. YOUR DIRECTION.</Eyebrow>
            <h2>
              There’s more than one
              <br />
              way to feel your best.
            </h2>
          </div>
          <p>
            Start where you are.
            <br />
            We’ll help you take the next step.
          </p>
        </Reveal>
        <div className="journey-grid">
          {[
            {
              title: 'Build strength',
              text: 'Nourish your muscles. Grow with intention.',
              tag: 'MUSCLE GAIN',
              image: images.femaleGain,
              link: '/muscle-gain',
              color: 'pink',
            },
            {
              title: 'Find your lighter',
              text: 'Sustainable fat loss. Nothing extreme.',
              tag: 'FAT LOSS',
              image: images.maleLoss,
              link: '/fat-loss',
              color: 'peach',
            },
            {
              title: 'Your kind of balance',
              text: 'Build, lean, or maintain. Make it yours.',
              tag: 'BUILD & LEAN · MAINTAIN',
              image: images.femaleMaintain,
              link: start,
              color: 'sage',
            },
          ].map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08}>
              <Link className={`journey-card ${item.color}`} to={item.link}>
                <div className="journey-image">
                  <img
                    src={item.image}
                    alt={
                      item.title === 'Build strength'
                        ? 'Woman practicing strength training in a gym'
                        : item.title === 'Find your lighter'
                          ? 'Man running outdoors'
                          : 'Woman practicing yoga'
                    }
                    loading="lazy"
                  />
                  <span className="round-link">
                    <ArrowUpRight size={22} />
                  </span>
                </div>
                <div className="journey-copy">
                  <span className="overline">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="learn-section" id="learn">
        <div className="container section">
          <Reveal className="section-heading">
            <div>
              <Eyebrow>A LITTLE KNOWLEDGE GOES A LONG WAY</Eyebrow>
              <h2>
                Understand your body.
                <br />
                <span className="rose-text">Be kinder to it.</span>
              </h2>
            </div>
            <p>
              Clear explanations. Credible sources.
              <br />
              No miracle promises.
            </p>
          </Reveal>
          <div className="knowledge-grid">
            <Reveal className="knowledge-card">
              <span className="knowledge-number">01 / THE BIGGER PICTURE</span>
              <div className="knowledge-icon">
                <ChartNoAxesCombined size={29} />
              </div>
              <h3>Fat loss ≠ weight loss.</h3>
              <p>
                The scale measures more than fat. Water, food, and lean tissue affect the number
                too. Look at trends over weeks, alongside how you feel and perform.
              </p>
              <Citation id="bodyFat" />
              <Link to="/fat-loss" className="text-link">
                Look beyond the scale <ArrowRight size={16} />
              </Link>
            </Reveal>
            <Reveal className="knowledge-card blush" delay={0.1}>
              <span className="knowledge-number">02 / KEEP YOUR STRENGTH</span>
              <div className="knowledge-icon">
                <Dumbbell size={29} />
              </div>
              <h3>Less muscle isn’t the goal.</h3>
              <p>
                A prolonged energy deficit can limit gains in lean tissue. Pair adequate nourishment
                with progressive resistance exercise, and avoid chasing rapid changes.
              </p>
              <Citation id="energy" />
              <Link to="/muscle-gain" className="text-link">
                Learn about muscle <ArrowRight size={16} />
              </Link>
            </Reveal>
            <Reveal className="knowledge-card" delay={0.2}>
              <span className="knowledge-number">03 / NO GYM? START HERE.</span>
              <div className="knowledge-icon">
                <Sprout size={29} />
              </div>
              <h3>Small food changes count.</h3>
              <p>
                A calorie deficit can come from food choices without formal workouts. Start with
                satisfying portions, fewer sugary drinks, and meals you enjoy. Movement still
                benefits your health.
              </p>
              <Citation id="activity" />
              <Link to="/fat-loss#everyday" className="text-link">
                Make it work at home <ArrowRight size={16} />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>
      <section className="container section myths">
        <Reveal className="section-heading">
          <div>
            <Eyebrow>LET’S CLEAR A FEW THINGS UP</Eyebrow>
            <h2>Less noise. More nourishment.</h2>
          </div>
          <p>A fresh perspective on familiar myths.</p>
        </Reveal>
        <div className="myth-grid">
          {[
            {
              image: images.bread,
              alt: 'Sliced wholegrain bread on a wooden board',
              myth: '“Carbs are the enemy.”',
              truth:
                'Carbohydrates can belong in a balanced diet. Whole grains add fibre; portion sizes and your overall eating pattern matter.',
              source: 'myths',
            },
            {
              image: images.avocado,
              alt: 'Fresh avocados, a source of unsaturated fat',
              myth: '“Eating fat makes you fat.”',
              truth:
                'Your body needs dietary fat. Foods such as nuts and avocado can fit your plan. They are energy-dense, so portions still count.',
              source: 'myths',
            },
            {
              image: images.female,
              alt: 'Woman exercising with weights',
              myth: '“More protein means instant muscle.”',
              truth:
                'Protein supports adaptation to resistance training. More is not automatically better, and food cannot replace the training stimulus.',
              source: 'protein',
            },
          ].map((item, i) => (
            <Reveal key={item.myth} delay={i * 0.08}>
              <article className="myth-card">
                <img src={item.image} alt={item.alt} loading="lazy" />
                <div>
                  <span className="myth-label">THE MYTH</span>
                  <h3>{item.myth}</h3>
                  <span className="truth-label">
                    <Check size={14} />
                    THE REALITY
                  </span>
                  <p>{item.truth}</p>
                  <Citation id={item.source} />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="container">
        <Reveal className="start-banner">
          <div className="banner-icon">
            <Sprout size={42} strokeWidth={1.2} />
          </div>
          <div>
            <Eyebrow>LET’S MAKE IT PERSONAL</Eyebrow>
            <h2>
              Your next chapter starts
              <br />
              with one small step.
            </h2>
            <p>A thoughtful plan. A place to track. A little more you.</p>
          </div>
          <Link to={start} className="button">
            Create my plan <ArrowUpRight size={19} />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
