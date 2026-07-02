import { useEffect, useId, useRef } from 'react';

// The beetle rolls its ball along the footer divider in a classic dung-beetle
// handstand: nearly vertical, head down, front legs braced on the ground,
// back legs pushing the ball. Movement is a little mood machine (push /
// struggle / rest / sprint) so it starts, stops, and changes pace — mostly it
// rests, so catching it mid-roll feels like a "did I just see that?" moment.
// Hovering the strip startles it into a scurry.

type Mood = 'push' | 'struggle' | 'rest' | 'sprint';

const MOODS: Record<Mood, { speed: number; minMs: number; maxMs: number }> = {
  push: { speed: 13, minMs: 1500, maxMs: 3500 },
  struggle: { speed: 4.5, minMs: 900, maxMs: 2200 },
  rest: { speed: 0, minMs: 3000, maxMs: 9000 },
  sprint: { speed: 34, minMs: 500, maxMs: 1100 },
};

const ACTIVE_POOL: Mood[] = ['push', 'push', 'push', 'push', 'struggle', 'struggle', 'sprint'];

const SVG_HEIGHT = 40;
const SVG_WIDTH = 92;
const BALL_RADIUS_PX = 19 * (SVG_HEIGHT / 52);

function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickMood(prev: Mood, fleeing: boolean): Mood {
  if (!fleeing && prev !== 'rest' && Math.random() < 0.55) return 'rest';
  const pool = ACTIVE_POOL.filter((m) => m !== prev);
  return pool[Math.floor(Math.random() * pool.length)] ?? 'push';
}

export function DungBeetle() {
  const maskId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const walkerRef = useRef<HTMLDivElement>(null);
  const ballSpinRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const frontLegARef = useRef<SVGPathElement>(null);
  const frontLegBRef = useRef<SVGPathElement>(null);
  const hindLegARef = useRef<SVGPathElement>(null);
  const hindLegBRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const walker = walkerRef.current;
    if (!strip || !walker) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      walker.style.transform = `translateX(${Math.round(strip.clientWidth * 0.12)}px)`;
      walker.style.opacity = '1';
      return;
    }

    let x = -SVG_WIDTH - 30;
    let speed = 0;
    let phase = 0;
    let ballRot = 0;
    let hoverBoost = 1;
    let hovered = false;
    let mood: Mood = 'push';
    let moodUntil = performance.now() + randBetween(MOODS.push.minMs, MOODS.push.maxMs);
    let lastTime = performance.now();
    let frame = 0;
    let running = false;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (now > moodUntil) {
        mood = pickMood(mood, hovered);
        moodUntil = now + randBetween(MOODS[mood].minMs, MOODS[mood].maxMs);
      }

      let target = MOODS[mood].speed;
      if (mood === 'struggle') target *= 0.6 + 0.45 * Math.sin(now / 170);
      hoverBoost += ((hovered ? 2.2 : 1) - hoverBoost) * Math.min(1, dt * 4);
      speed += (target * hoverBoost - speed) * Math.min(1, dt * 2.5);

      const dx = speed * dt;
      x += dx;
      phase += dx * 0.5;
      ballRot += (dx / BALL_RADIUS_PX) * (180 / Math.PI);

      if (x > strip.clientWidth + 30) {
        x = -SVG_WIDTH - 30;
      }

      walker.style.transform = `translateX(${x}px)`;
      ballSpinRef.current?.setAttribute('transform', `rotate(${ballRot})`);

      const bob = Math.sin(phase * 2) * 0.5;
      const rock = mood === 'rest' ? Math.sin(now / 400) * 0.6 : Math.sin(phase) * 2.5;
      bodyRef.current?.setAttribute('transform', `translate(0 ${bob}) rotate(${rock} 52 49.5)`);

      // legs piston along their push axis: hind legs stroke into the ball,
      // front legs brace and shove backward against the ground in unison
      const wA = (Math.sin(phase) + 1) / 2;
      const wB = (Math.sin(phase + Math.PI) + 1) / 2;
      frontLegARef.current?.setAttribute('transform', `translate(${-wA * 1.2} 0)`);
      frontLegBRef.current?.setAttribute('transform', `translate(${-wA * 1.2} 0)`);
      hindLegARef.current?.setAttribute('transform', `translate(${wA * 2.2} ${wA * 0.1})`);
      hindLegBRef.current?.setAttribute('transform', `translate(${wB * 2.4} ${-wB * 0.1})`);

      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      walker.style.opacity = '1';
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) start();
      else stop();
    });
    observer.observe(strip);

    const onEnter = () => {
      hovered = true;
      mood = 'sprint';
      moodUntil = performance.now() + randBetween(MOODS.sprint.minMs, MOODS.sprint.maxMs);
    };
    const onLeave = () => {
      hovered = false;
    };
    strip.addEventListener('pointerenter', onEnter);
    strip.addEventListener('pointerleave', onLeave);

    return () => {
      stop();
      observer.disconnect();
      strip.removeEventListener('pointerenter', onEnter);
      strip.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={stripRef} aria-hidden="true" className="relative h-10 overflow-hidden border-b border-[#2a2a2a]">
      <div ref={walkerRef} className="absolute bottom-0 left-0 opacity-0 will-change-transform">
        <svg
          aria-hidden="true"
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          viewBox="0 0 120 52"
          fill="none"
          className="block"
        >
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-24" y="-24" width="48" height="48">
            <rect x="-24" y="-24" width="48" height="48" fill="#fff" />
            <circle cx="6" cy="-6" r="3" fill="#000" />
            <circle cx="-7" cy="4" r="2.5" fill="#000" />
            <circle cx="2" cy="10" r="2" fill="#000" />
            <circle cx="-3" cy="-10" r="1.8" fill="#000" />
          </mask>

          <g fill="#fff" stroke="#fff" opacity="0.9">
            {/* dung ball: irregular lump, spins as it rolls */}
            <g transform="translate(84 31.5)">
              <g ref={ballSpinRef}>
                <path
                  d="M19 0 L15.8 9.2 L9.8 16.9 L0 18.6 L-9.7 16.7 L-15.8 9.1 L-19.4 0 L-16.1 -9.3 L-9.8 -16.9 L0 -18.4 L9.6 -16.6 L16 -9.3 Z"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  mask={`url(#${maskId})`}
                />
                <circle cx="19.5" cy="-8.5" r="2" stroke="none" />
                <circle cx="-6" cy="19" r="1.8" stroke="none" />
              </g>
            </g>

            {/* beetle: low and squat, wedged under the ball's shoulder — stepped
                profile of elytra dome, pronotum hump, and a small head scooping
                the ground; legs are tiny stubs, hind pair pushing under the ball */}
            <g strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path ref={frontLegARef} d="M52.5 47.5 L51.3 48.8 L52 50" fill="none" />
              <path ref={frontLegBRef} d="M54.8 46.8 L55.8 48.2 L55.2 50" fill="none" />
              <path ref={hindLegARef} d="M61 39.5 L64 38.7 L66.8 39.7" fill="none" />
              <path ref={hindLegBRef} d="M58.5 43.5 L62.5 42.8 L67 43.3" fill="none" />
            </g>
            <g ref={bodyRef} stroke="none">
              <path d="M48 49.2 C48.2 47.2 49.3 45.1 51 44.9 L51.8 45 C51.2 41.4 52.2 38.3 54.2 37.5 L54.9 37.7 C54.3 31.8 57.2 27.6 61.5 27.7 C63.9 27.9 66 29.4 66.4 31.5 C65 36.3 62.6 40.7 59.2 44 C56 47.1 51.8 49.5 48 49.2 Z" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
