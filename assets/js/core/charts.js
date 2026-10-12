// Chart.js wrappers. Charts only ever receive data loaded from the database.
import { prefersReducedMotion } from './ui.js';

const C = { lime: '#c6f432', cyan: '#2ad4f0', grid: 'rgba(143,154,171,.12)', text: '#8f9aab', warn: '#ffb547' };
export const COLORS = C;

function base() {
  const Chart = window.Chart;
  if (!Chart) throw new Error('Chart library failed to load. Check your connection and reload.');
  Chart.defaults.color = C.text;
  Chart.defaults.font.family = 'Figtree, system-ui, sans-serif';
  Chart.defaults.borderColor = C.grid;
  return Chart;
}

const live = new Set();
export function destroyAll() { live.forEach((c) => { try { c.destroy(); } catch { /* already gone */ } }); live.clear(); }

function make(canvas, config) {
  const Chart = base();
  const chart = new Chart(canvas, {
    ...config,
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 700, easing: 'easeOutCubic' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: !!config.legend, labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: { backgroundColor: '#0d1422', borderColor: '#2a3240', borderWidth: 1, padding: 10, titleFont: { weight: '700' } },
        ...(config.options?.plugins || {}),
      },
      scales: config.type === 'doughnut' ? undefined : {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
        y: { grid: { color: C.grid }, beginAtZero: config.beginAtZero ?? false, ticks: { precision: 1 }, ...(config.y || {}) },
      },
      ...(config.extra || {}),
    },
  });
  live.add(chart);
  return chart;
}

function gradient(canvas, color) {
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 220);
  g.addColorStop(0, `${color}55`);
  g.addColorStop(1, `${color}00`);
  return g;
}

export function lineChart(canvas, { labels, data, label, color = C.lime, target, unit = '' }) {
  const datasets = [{
    label, data, borderColor: color, backgroundColor: gradient(canvas, color), fill: true, tension: 0.35,
    pointRadius: data.length > 30 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: color, spanGaps: true,
  }];
  if (target != null) datasets.push({ label: 'Target', data: labels.map(() => target), borderColor: C.cyan, borderDash: [6, 6], pointRadius: 0, fill: false });
  return make(canvas, {
    type: 'line', data: { labels, datasets }, legend: target != null,
    options: { plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}${unit}` } } } },
  });
}

export function barChart(canvas, { labels, data, label, color = C.lime, target, beginAtZero = true, max }) {
  const datasets = [{ label, data, backgroundColor: data.map((v) => (target != null && v >= target ? color : `${color}66`)), borderRadius: 6, maxBarThickness: 34 }];
  if (target != null) datasets.push({ type: 'line', label: 'Target', data: labels.map(() => target), borderColor: C.cyan, borderDash: [6, 6], pointRadius: 0 });
  return make(canvas, { type: 'bar', data: { labels, datasets }, beginAtZero, legend: target != null, y: max ? { max } : {} });
}
