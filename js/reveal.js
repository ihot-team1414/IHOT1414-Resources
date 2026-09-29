// Scroll-reveal (fade/slide in) and subtle parallax.
// Both switch off automatically for prefers-reduced-motion.

import { prefersReducedMotion } from './ui.js';

let revealObserver;
const parallaxEls = new Set();
let ticking = false;

export function initReveal(root = document) {
  const els = root.querySelectorAll('.reveal:not(.is-visible)');
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  }
  els.forEach((el) => revealObserver.observe(el));
}

// Elements with data-parallax="0.12" drift against the scroll by that factor.
export function initParallax(root = document) {
  parallaxEls.clear();
  if (prefersReducedMotion()) return;
  root.querySelectorAll('[data-parallax]').forEach((el) => parallaxEls.add(el));
  if (!parallaxEls.size) return;
  update();
}

function update() {
  ticking = false;
  const vh = window.innerHeight;
  parallaxEls.forEach((el) => {
    if (!el.isConnected) { parallaxEls.delete(el); return; }
    const r = el.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) return;
    const factor = parseFloat(el.dataset.parallax) || 0.1;
    const offset = (r.top + r.height / 2 - vh / 2) * -factor;
    el.style.setProperty('--parallax', `${offset.toFixed(1)}px`);
  });
}

window.addEventListener('scroll', () => {
  if (!ticking && parallaxEls.size) { ticking = true; requestAnimationFrame(update); }
}, { passive: true });
window.addEventListener('resize', () => parallaxEls.size && update());

// Count-up for numeric stats ("2004", "20+"). Non-numeric values are left alone.
export function countUp(el, duration = 1400) {
  const text = el.textContent.trim();
  const m = text.match(/^(\D*)(\d+)(\D*)$/);
  if (!m || prefersReducedMotion()) return;
  const [, pre, num, post] = m;
  const target = parseInt(num, 10);
  const start = target > 1000 ? target - 60 : 0;   // years count up the last few steps
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${pre}${Math.round(start + (target - start) * eased)}${post}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
