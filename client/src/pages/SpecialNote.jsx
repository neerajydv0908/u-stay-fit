import { Heart } from 'lucide-react';
import { Eyebrow, Reveal } from '../components/UI';

// A personal dedication page: a photograph on the left, a short note on the right, on a soft
// pink background with a translucent glass heart behind the text.
export default function SpecialNote() {
  return (
    <div className="special-note">
      <svg className="glass-heart" viewBox="0 0 512 512" aria-hidden="true">
        <defs>
          <linearGradient id="glass-heart-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="0.55" stopColor="#ffe3ea" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f6c6d3" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="glass-heart-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id="glass-heart-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        <path
          d="M256 464 L228 438 C130 350 64 290 64 210 C64 150 110 106 168 106 C202 106 234 122 256 150 C278 122 310 106 344 106 C402 106 448 150 448 210 C448 290 382 350 284 438 Z"
          fill="#f3b8c8"
          opacity="0.5"
          filter="url(#glass-heart-glow)"
        />
        <path
          d="M256 464 L228 438 C130 350 64 290 64 210 C64 150 110 106 168 106 C202 106 234 122 256 150 C278 122 310 106 344 106 C402 106 448 150 448 210 C448 290 382 350 284 438 Z"
          fill="url(#glass-heart-fill)"
          stroke="#ffffff"
          strokeOpacity="0.9"
          strokeWidth="3"
        />
        <ellipse
          cx="170"
          cy="180"
          rx="52"
          ry="30"
          fill="url(#glass-heart-shine)"
          transform="rotate(-28 170 180)"
        />
      </svg>
      <div className="container special-note-layout">
        <Reveal className="special-note-photo">
          <img
            src="/photos/special-note.jpg"
            alt="Two hands held together, each wearing a matching black thread bracelet"
          />
        </Reveal>
        <Reveal className="special-note-text" delay={0.08}>
          <Eyebrow>A SPECIAL NOTE</Eyebrow>
          <h1>For the love of my life.</h1>
          <p>
            This application is dedicated to my partner, the love of my life. The idea for it came
            from her: from the way she cares about health, and from the way she cares about me.
          </p>
          <p>
            Everything here is a small symbol of that. Every screen and every gentle word is my way
            of saying how much I care for her, and how deeply I love her.
          </p>
          <p className="special-note-sign">
            With love, always <Heart size={15} aria-hidden="true" />
          </p>
        </Reveal>
      </div>
    </div>
  );
}
