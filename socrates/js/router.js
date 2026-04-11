/* ============================================================
   SOCRATES — ROUTER & AUTH FLOW
   ============================================================ */

import { getSession, getProfile, ensureProfile, onAuthChange } from './supabase.js';

const PAGES = {
  landing:     '/socrates/index.html',
  onboarding:  '/socrates/onboarding.html',
  app:         '/socrates/app.html',
  reflection:  '/socrates/reflection.html',
  insights:    '/socrates/insights.html',
  settings:    '/socrates/settings.html',
};

function currentPage() {
  const path = window.location.pathname;
  if (path.includes('onboarding')) return 'onboarding';
  if (path.includes('reflection'))  return 'reflection';
  if (path.includes('insights'))    return 'insights';
  if (path.includes('settings'))    return 'settings';
  if (path.includes('app'))         return 'app';
  return 'landing';
}

export function navigate(page) {
  window.location.href = PAGES[page] || PAGES.landing;
}

export async function guardRoute() {
  const page = currentPage();
  const session = await getSession();

  // Nicht eingeloggt → Landing
  if (!session) {
    if (page !== 'landing') {
      navigate('landing');
      return null;
    }
    return null;
  }

  const user = session.user;
  const profile = await ensureProfile(user.id);

  // Eingeloggt, kein Onboarding → Onboarding
  if (!profile.onboarding_done) {
    if (page !== 'onboarding') {
      navigate('onboarding');
      return null;
    }
    return { user, profile };
  }

  // Eingeloggt + Onboarding → App-Seiten
  if (page === 'landing') {
    navigate('app');
    return null;
  }

  if (page === 'onboarding') {
    navigate('app');
    return null;
  }

  return { user, profile };
}

/* ---- AUTH STATE CHANGE HANDLING ---- */
export function initAuthListener() {
  onAuthChange(async (event, session) => {
    const page = currentPage();

    if (event === 'SIGNED_IN' && session) {
      const profile = await ensureProfile(session.user.id);
      if (!profile.onboarding_done) {
        if (page !== 'onboarding') navigate('onboarding');
      } else {
        if (page === 'landing') navigate('app');
      }
    }

    if (event === 'SIGNED_OUT') {
      if (page !== 'landing') navigate('landing');
    }

    // Magic Link callback
    if (event === 'PASSWORD_RECOVERY' || event === 'TOKEN_REFRESHED') {
      // handled automatically
    }
  });
}

/* ---- PAGE TRANSITION ---- */
export function pageTransition(el) {
  el.classList.add('page-enter');
  requestAnimationFrame(() => {
    el.classList.remove('page-enter');
    el.classList.add('page-active');
  });
}

/* ---- NAV ACTIVE STATE ---- */
export function setActiveNav() {
  const page = currentPage();
  const map = {
    app:        'nav-today',
    reflection: 'nav-today',
    insights:   'nav-insights',
    settings:   'nav-settings',
  };
  const activeId = map[page];
  if (activeId) {
    document.getElementById(activeId)?.classList.add('active');
  }
}
