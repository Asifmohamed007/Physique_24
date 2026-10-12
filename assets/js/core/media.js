// Exercise media. Real images/videos come only from URLs stored in the
// database (with attribution). No links are invented: when none is stored
// the app draws an equipment illustration and offers a video search.
import { esc } from './ui.js';

const GROUP_COLOR = { chest: '#c6f432', back: '#2ad4f0', shoulders: '#9ad7ff', arms: '#ffd166', legs: '#7ef0a6', core: '#ff9f6b', other: '#c6c6d0' };

const GLYPH = {
  barbell: '<rect x="20" y="58" width="120" height="6" rx="3"/><rect x="30" y="40" width="10" height="42" rx="3"/><rect x="42" y="46" width="8" height="30" rx="3"/><rect x="120" y="40" width="10" height="42" rx="3"/><rect x="110" y="46" width="8" height="30" rx="3"/>',
  dumbbell: '<rect x="56" y="57" width="48" height="8" rx="4"/><rect x="40" y="42" width="14" height="38" rx="4"/><rect x="106" y="42" width="14" height="38" rx="4"/><rect x="30" y="48" width="8" height="26" rx="3"/><rect x="122" y="48" width="8" height="26" rx="3"/>',
  cable: '<circle cx="80" cy="30" r="10" fill="none" stroke-width="5"/><line x1="80" y1="40" x2="80" y2="78" stroke-width="3"/><rect x="62" y="78" width="36" height="8" rx="4"/><rect x="40" y="20" width="6" height="80" rx="3"/>',
  machine: '<rect x="36" y="22" width="8" height="78" rx="3"/><rect x="36" y="22" width="80" height="8" rx="3"/><rect x="58" y="70" width="44" height="10" rx="4"/><rect x="96" y="40" width="8" height="40" rx="3"/><rect x="108" y="34" width="14" height="40" rx="3"/>',
  bodyweight: '<circle cx="80" cy="28" r="10"/><rect x="76" y="40" width="8" height="34" rx="4"/><rect x="52" y="46" width="56" height="7" rx="3.5"/><rect x="66" y="72" width="7" height="32" rx="3.5" transform="rotate(12 70 72)"/><rect x="87" y="72" width="7" height="32" rx="3.5" transform="rotate(-12 90 72)"/>',
  band: '<path d="M40 60 C 60 20, 100 100, 120 60" fill="none" stroke-width="7"/>',
  other: '<circle cx="80" cy="60" r="24" fill="none" stroke-width="7"/>',
};

export function fallbackSVG(ex) {
  const color = GROUP_COLOR[ex.muscle_group] || GROUP_COLOR.other;
  const glyph = GLYPH[ex.equipment] || GLYPH.other;
  return `<svg viewBox="0 0 160 120" role="img" aria-label="${esc(ex.name || ex.exercise_name)} illustration" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2131"/><stop offset="1" stop-color="#0b0f17"/></linearGradient></defs>
    <rect width="160" height="120" fill="url(#g)"/>
    <circle cx="132" cy="18" r="46" fill="${color}" opacity=".08"/>
    <g fill="${color}" stroke="${color}" opacity=".9">${glyph}</g>
    <text x="10" y="112" fill="${color}" opacity=".75" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="800" font-size="13" letter-spacing="1">${esc((ex.muscle_group || '').toUpperCase())}</text>
  </svg>`;
}

/** Image if a stored URL exists (lazy, with fallback on error), else illustration. */
export function exerciseMedia(ex) {
  if (ex.image_url) {
    return `<img src="${esc(ex.image_url)}" alt="${esc(ex.name)} demonstration" loading="lazy" decoding="async" data-fallback-for="${esc(ex.slug || '')}">`;
  }
  return fallbackSVG(ex);
}

export function videoLink(ex) {
  if (ex.video_url) return { href: ex.video_url, label: 'Watch demonstration', stored: true };
  return {
    href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name || ex.exercise_name} exercise proper form`)}`,
    label: 'Find demo videos', stored: false,
  };
}

/** Replace broken images with the illustration (registered once by the app). */
export function installImageFallback(lookup) {
  window.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallbackFor) return;
    const ex = lookup(img.dataset.fallbackFor) || { name: img.alt, muscle_group: 'other', equipment: 'other' };
    const wrap = document.createElement('span');
    wrap.innerHTML = fallbackSVG(ex);
    img.replaceWith(wrap.firstElementChild);
  }, true);
}
