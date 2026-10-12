// Landing page motion: hero letter drop, parallax plates, and four
// scroll-scrubbed sections. All content is the real plan from the PDF.
import { fallbackSVG } from './core/media.js';
import { isoInTz, weekdayOf } from './logic/dates.js';
import { PHASES } from './logic/program.js';

const $ = (s) => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
$('#yr').textContent = new Date().getFullYear();

const WEEK = [
  { d: 'SAT', wd: 6, name: 'Push', focus: 'Chest, shoulders, triceps', ex: [['Barbell or machine chest press', '3 × 6–10'], ['Incline dumbbell press', '3 × 8–12'], ['Seated shoulder press', '2 × 8–12'], ['Lateral raise', '3 × 12–20'], ['Triceps rope pushdown', '3 × 10–15']] },
  { d: 'SUN', wd: 0, name: 'Pull + Abs', focus: 'Back, rear delts, biceps, core', ex: [['Lat pulldown', '3 × 8–12'], ['Chest-supported row', '3 × 8–12'], ['Seated cable row', '2 × 10–12'], ['Reverse pec deck', '3 × 12–20'], ['Dumbbell curl', '3 × 10–15'], ['Cable crunch + dead bug', '3 + 2 sets']] },
  { d: 'MON', wd: 1, name: 'Legs', focus: 'Quads, hamstrings, glutes, calves', ex: [['Leg press or goblet squat', '3 × 8–12'], ['Romanian deadlift', '3 × 8–10'], ['Leg curl', '3 × 10–15'], ['Leg extension', '2 × 10–15'], ['Standing calf raise', '3 × 12–20']] },
  { d: 'TUE', wd: 2, name: 'Upper + Abs', focus: 'Chest, back, shoulders, arms, core', ex: [['Incline press', '3 × 8–12'], ['Lat pulldown (other grip)', '3 × 8–12'], ['One-arm cable row', '2 × 10–12'], ['Lateral raise', '3 × 12–20'], ['Cable triceps extension', '2 × 10–15'], ['Hammer curl', '2 × 10–15'], ['Hanging knee raise', '3 × 8–15']] },
  { d: 'WED', wd: 3, name: 'Lower', focus: 'Legs, glutes, calves', ex: [['Squat or leg press', '3 × 6–10'], ['Hip thrust', '3 × 8–12'], ['Leg curl', '3 × 10–15'], ['Split squat', '2 × 8–10/side'], ['Seated calf raise', '3 × 12–20']] },
  { d: 'THU', wd: 4, rest: true, name: 'Recovery', focus: 'Easy walk and mobility if convenient', ex: [['No hard lifting', '—'], ['7–9 hours of sleep', 'nightly'], ['Water through the day', '2.5–3.5 L']] },
  { d: 'FRI', wd: 5, rest: true, name: 'Rest', focus: 'Recover, prep meals, sleep', ex: [['Prepare meals for the week', '—'], ['Streak stays intact', '✓'], ['Back to Push tomorrow', 'SAT']] },
];

// ---------- hero ----------
const today = isoInTz(new Date(), 'Asia/Qatar');
const todayWd = weekdayOf(today);
let i = 0;
$('#week-word').innerHTML = WEEK.map((w) => `<span class="wd ${w.rest ? 'rest' : ''} ${w.wd === todayWd ? 'today' : ''}">${w.wd === todayWd ? '<span class="tag">Today in Doha</span>' : ''}${[...w.d].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`).join('');
const t = WEEK.find((w) => w.wd === todayWd);
$('#today-line').innerHTML = t.rest
  ? `Today is a <strong>rest day</strong>. Sessions run Saturday to Wednesday, 4:30–6:00 PM.`
  : `Today is <strong>${t.name} day</strong> — ${t.focus.toLowerCase()}. Gym from 4:30 to 6:00 PM.`;
requestAnimationFrame(() => document.body.classList.add('loaded'));

// signed-in visitors go straight to the app
try {
  if (Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))) {
    document.querySelectorAll('[data-cta]').forEach((a) => { a.href = 'app.html'; a.textContent = 'Open your dashboard'; });
    document.querySelectorAll('[data-auth-hide]').forEach((a) => a.remove());
  }
} catch { /* storage blocked */ }

// ---------- build scrubbed content ----------
$('#hz-track').innerHTML = WEEK.map((w, n) => `<article class="day-panel ${w.rest ? 'rest-panel' : ''}">
  <span class="big" aria-hidden="true">${w.d}</span>
  <span class="dn">${w.rest ? 'Off day' : `Session ${n + 1} of 5`}</span>
  <h3>${w.name}</h3><p class="focus">${w.focus}</p>
  <ol>${w.ex.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('')}</ol></article>`).join('');
$('#hz-dots').innerHTML = WEEK.map(() => '<span></span>').join('');

$('#demo-thumb').innerHTML = fallbackSVG({ name: 'Incline Dumbbell Press', muscle_group: 'chest', equipment: 'dumbbell' });
const DEMO = [[20, 12], [20, 11], [20, 10]];
$('#demo-rows').innerHTML = DEMO.map((_, n) => `<div class="demo-row" data-r="${n}"><span class="set-no" style="font:800 1.2rem var(--font-display);color:var(--muted);text-align:center">${n + 1}</span>
  <span class="cell" data-w>—</span><span class="cell" data-reps>—</span><span class="tick"><i data-lucide="check"></i></span></div>`).join('');

const plateSizes = [[54, 22, '#c6f432'], [46, 18, '#2ad4f0'], [40, 16, '#f3f6fa'], [34, 14, '#ffb547'], [28, 12, '#8f9aab']];
let lx = 168, rx = 732;
$('#plates-l').innerHTML = plateSizes.map(([h, w, c], n) => { const x = lx; lx += w + 3; return `<rect class="plate" data-p="${n}" x="${x}" y="${70 - h}" width="${w}" height="${h * 2}" rx="4" fill="${c}" style="transform:translateX(-60px)"/>`; }).join('');
$('#plates-r').innerHTML = plateSizes.map(([h, w, c], n) => { rx -= w; const x = rx; rx -= 3; return `<rect class="plate" data-p="${n}" x="${x}" y="${70 - h}" width="${w}" height="${h * 2}" rx="4" fill="${c}" style="transform:translateX(60px)"/>`; }).join('');
$('#ticks').innerHTML = Array.from({ length: 24 }, () => '<i></i>').join('');

const FOODS = [['Morning', '4 eggs', 25], ['Mid-morning', 'Milk, 250 ml', 8], ['Lunch', '150 g chicken + rice', 46], ['Pre-workout', 'Greek yogurt + banana', 19], ['After the gym', '150 g fish + dal', 54]];
$('#foods').innerHTML = FOODS.map(([m, f, g]) => `<div class="food"><div><strong>${f}</strong><br><span>${m}</span></div><b>${g} g</b></div>`).join('');
window.lucide?.createIcons();

// ---------- scroll engine ----------
const scrubs = [...document.querySelectorAll('[data-scrub]')];
const nav = $('.l-nav');
const plates = [...document.querySelectorAll('.plates [data-speed]')];
const handlers = {
  week(p, el) {
    const track = el.querySelector('#hz-track');
    const max = track.scrollWidth - window.innerWidth;
    track.style.transform = `translate3d(${-max * p}px,0,0)`;
    const idx = Math.min(WEEK.length - 1, Math.round(p * (WEEK.length - 1)));
    el.querySelectorAll('#hz-dots span').forEach((d, n) => d.classList.toggle('on', n === idx));
  },
  demo(p, el) {
    // three sets: fill at 0.08/0.38/0.66, tick shortly after; timer drains between
    DEMO.forEach(([w, r], n) => {
      const row = el.querySelector(`[data-r="${n}"]`);
      const start = 0.08 + n * 0.29;
      const filled = p > start, done = p > start + 0.1;
      row.classList.toggle('filled', filled); row.classList.toggle('done', done);
      row.querySelector('[data-w]').textContent = filled ? w : '—';
      row.querySelector('[data-reps]').textContent = p > start + 0.04 ? r : '—';
    });
    const seg = (p - 0.18) / 0.29;
    const within = seg - Math.floor(seg);
    const left = p < 0.18 || p > 0.86 ? 1 : 1 - within;
    el.querySelector('#demo-bar').style.width = `${left * 100}%`;
    const s = Math.round(120 * left);
    el.querySelector('#demo-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  weeks(p, el) {
    const week = Math.min(24, 1 + Math.floor(p * 24));
    el.querySelector('#wk-num').textContent = String(week).padStart(2, '0');
    const ph = PHASES.findIndex((x) => week >= x.from && week <= x.to);
    el.querySelectorAll('.plate').forEach((r) => r.classList.toggle('on', Number(r.dataset.p) <= ph));
    el.querySelector('#ph-name').textContent = PHASES[ph].name;
    el.querySelector('#ph-focus').textContent = `Weeks ${PHASES[ph].from}–${PHASES[ph].to}: ${PHASES[ph].focus}.`;
    el.querySelectorAll('#ticks i').forEach((t2, n) => t2.classList.toggle('on', n < week));
  },
  protein(p, el) {
    let sum = 0;
    el.querySelectorAll('.food').forEach((f, n) => {
      const on = p > 0.1 + n * 0.16;
      f.classList.toggle('on', on);
      if (on) sum += FOODS[n][2];
    });
    el.querySelector('#meter-fill').style.setProperty('--fill', (sum / 180) * 100);
    el.querySelector('#meter-num').textContent = sum;
  },
};

let ticking = false;
function frame() {
  ticking = false;
  const y = window.scrollY, vh = window.innerHeight;
  const docH = document.documentElement.scrollHeight - vh;
  document.querySelector('.progress-line').style.setProperty('--sp', docH > 0 ? y / docH : 0);
  nav.classList.toggle('scrolled', y > 20);
  if (!reduced) plates.forEach((pl) => { pl.style.transform = `translate3d(0,${y * Number(pl.dataset.speed)}px,0)`; });
  for (const el of scrubs) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -vh || r.top > vh * 2) continue;
    const total = el.offsetHeight - vh;
    const p = reduced || total <= 0 ? 1 : clamp(-r.top / total);
    handlers[el.dataset.scrub]?.(p, el);
  }
}
const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
window.addEventListener('scroll', request, { passive: true });
window.addEventListener('resize', request);
frame();

// one-time reveals for the feature grid
const io = !('IntersectionObserver' in window) ? null : new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => (reduced || !io ? el.classList.add('in') : io.observe(el)));
