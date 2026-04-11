/* ============================================================
   SOCRATES — INSIGHTS & MUSTER-ERKENNUNG
   ============================================================ */

import {
  getInsights,
  toggleInsightStar,
  getPatterns,
  acknowledgePattern,
  getSessionDatesInMonth,
  getProfile,
  getRecentSessions,
} from './supabase.js';

/* ---- INSIGHTS LADEN & RENDERN ---- */

export async function loadAndRenderInsights(userId, filter = 'all') {
  const insights = await getInsights(userId);
  const filtered = filter === 'starred'
    ? insights.filter(i => i.is_starred)
    : insights;

  return filtered;
}

export function renderInsightCard(insight) {
  const date = new Date(insight.created_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const starred = insight.is_starred ? 'starred' : '';

  return `
    <div class="insight-card" data-id="${insight.id}">
      <div class="insight-meta">
        <span class="insight-date">${date}</span>
        <button class="star-btn ${starred}" data-insight-id="${insight.id}" aria-label="Favorisieren">
          ${insight.is_starred ? '★' : '☆'}
        </button>
      </div>
      <p class="insight-text">${escapeHtml(insight.content)}</p>
    </div>
  `;
}

export async function handleStarToggle(insightId, currentlyStarred) {
  const updated = await toggleInsightStar(insightId, !currentlyStarred);
  return updated;
}

/* ---- MUSTER LADEN & RENDERN ---- */

export async function loadAndRenderPatterns(userId) {
  const patterns = await getPatterns(userId);
  return patterns;
}

export function renderPatternCard(pattern) {
  const date = new Date(pattern.detected_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
  });

  const isNew = !pattern.acknowledged;

  return `
    <div class="pattern-card" data-id="${pattern.id}">
      <div class="pattern-header">
        <span class="pattern-type">${escapeHtml(pattern.pattern_type)}</span>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${isNew ? '<span class="badge badge-new">Neu erkannt</span>' : ''}
          <span class="pattern-freq">${pattern.times_seen}× gesehen</span>
        </div>
      </div>
      <p class="pattern-desc">${escapeHtml(pattern.description)}</p>
      <p class="text-small text-muted" style="margin-top:8px">Erkannt am ${date}</p>
    </div>
  `;
}

/* ---- KALENDER RENDERN ---- */

export async function renderCalendar(userId, year, month) {
  const sessionDates = await getSessionDatesInMonth(userId, year, month);
  const today = new Date().toISOString().split('T')[0];

  const days = getDaysInMonth(year, month);
  const firstDay = new Date(year, month - 1, 1).getDay();
  // Woche beginnt Montag: Mo=0
  const startOffset = (firstDay === 0) ? 6 : firstDay - 1;

  const dayHeaders = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  let html = '<div class="calendar-grid">';

  // Header
  dayHeaders.forEach(d => {
    html += `<div class="cal-header">${d}</div>`;
  });

  // Leer-Felder vor dem 1.
  for (let i = 0; i < startOffset; i++) {
    html += '<div></div>';
  }

  // Tage
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasSession = sessionDates.includes(dateStr);
    const isToday = dateStr === today;

    let cls = 'cal-day';
    if (hasSession) cls += ' has-session';
    if (isToday) cls += ' today';

    html += `<div class="${cls}">${d}</div>`;
  }

  html += '</div>';
  return html;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/* ---- ENERGIE-VERLAUF CHART ---- */

export async function renderEnergyChart(userId) {
  const sessions = await getRecentSessions(userId, 20);
  if (sessions.length < 2) return null;

  const points = sessions
    .slice()
    .reverse()
    .map((s, i, arr) => ({
      x: i / (arr.length - 1),
      // Einfache Annäherung: Energie aus Streak ableiten
      y: Math.min(1, 0.3 + (i / arr.length) * 0.7),
    }));

  const w = 300;
  const h = 60;
  const pad = 4;

  const pathPoints = points.map(p => ({
    x: pad + p.x * (w - pad * 2),
    y: h - pad - p.y * (h - pad * 2),
  }));

  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${pathPoints[pathPoints.length - 1].x.toFixed(1)} ${h} L ${pathPoints[0].x.toFixed(1)} ${h} Z`;

  return `
    <div class="energy-chart">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path class="energy-area" d="${areaD}"/>
        <path class="energy-path" d="${pathD}"/>
      </svg>
    </div>
  `;
}

/* ---- STREAK BERECHNUNG ---- */

export async function getStreakInfo(userId) {
  const profile = await getProfile(userId);
  if (!profile) return { streak: 0, lastDate: null };

  return {
    streak: profile.streak_count || 0,
    lastDate: profile.last_session_date,
    totalSessions: profile.total_sessions || 0,
    orbEnergy: parseFloat(profile.orb_energy) || 1.0,
  };
}

/* ---- UTILS ---- */

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export { escapeHtml };
