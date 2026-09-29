import { esc } from './ui.js';
import { icon } from './icons.js';

export function renderFooter(site) {
  const el = document.getElementById('site-footer');
  if (!el) return;
  const team = site.team || {};
  const socials = team.socials || [];
  const year = new Date().getFullYear();
  el.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <img src="assets/logo/ihot-wordmark.png" alt="IHOT Robotics" width="399" height="160" loading="lazy" decoding="async">
          <p>${esc(site.footer?.tagline || '')}</p>
          <div class="socials">
            ${socials.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.label)}" title="${esc(s.label)}">${icon[s.icon] || icon.globe}</a>`).join('')}
          </div>
        </div>
        <div>
          <h2>Resources</h2>
          <ul>${(site.subteams || []).map((t) => `<li><a href="#/team/${esc(t.slug)}">${esc(t.name)}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h2>Team</h2>
          <ul>
            <li><a href="#/about">About IHOT</a></li>
            <li><a href="#/sponsors">Sponsors</a></li>
            <li><a href="#/join">Join us</a></li>
            <li><a href="#/login">Editor login</a></li>
          </ul>
        </div>
        <div>
          <h2>Follow</h2>
          <ul>${socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join('')}</ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} ${esc(team.name || '')} · FRC Team ${esc(team.number || '')}</span>
        <span>${esc(site.footer?.legal || '')}</span>
      </div>
    </div>`;
}
