/* ============================================================
   SOCRATES — ORB CONTROLLER
   Zustände · Animationen · Energie-Logik
   ============================================================ */

export class Orb {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.energy = 1.0;
    this.state = 'high';
    this.particles = [];
    this._animFrame = null;

    if (this.container) this._build();
  }

  /* ---- BUILD DOM ---- */
  _build() {
    this.container.innerHTML = `
      <div class="orb-scene">
        <div class="orb" data-energy="high" id="socrates-orb">
          <div class="orb-layer orb-halo"></div>
          <div class="orb-layer orb-base"></div>
          <div class="orb-layer orb-inner"></div>
          <div class="orb-layer orb-sheen"></div>
          <div class="orb-ring"></div>
          <div class="orb-ring-2"></div>
        </div>
        <div class="orb-particles" id="orb-particles"></div>
      </div>
    `;

    this.orbEl = this.container.querySelector('#socrates-orb');
    this.particlesEl = this.container.querySelector('#orb-particles');
    this._spawnParticles();
  }

  /* ---- SET ENERGY ---- */
  setEnergy(value) {
    this.energy = Math.min(1.0, Math.max(0.05, parseFloat(value) || 0));
    this.state = this._energyToState(this.energy);

    if (this.orbEl) {
      this.orbEl.dataset.energy = this.state;
      this._updateParticleIntensity();
    }
  }

  _energyToState(e) {
    if (e >= 0.7) return 'high';
    if (e >= 0.4) return 'mid';
    if (e >= 0.15) return 'low';
    return 'critical';
  }

  /* ---- ANIMATIONS ---- */

  flash() {
    if (!this.orbEl) return;
    this.orbEl.classList.remove('orb-flash');
    // Force reflow
    void this.orbEl.offsetWidth;
    this.orbEl.classList.add('orb-flash');
    this._burstParticles();

    setTimeout(() => {
      this.orbEl?.classList.remove('orb-flash');
    }, 2000);
  }

  birth() {
    if (!this.orbEl) return;
    this.orbEl.classList.add('orb-birth');
    setTimeout(() => {
      this.orbEl?.classList.remove('orb-birth');
    }, 2500);
  }

  tremor() {
    if (!this.orbEl) return;
    this.orbEl.classList.add('orb-tremor');
  }

  stopTremor() {
    this.orbEl?.classList.remove('orb-tremor');
  }

  /* ---- STATUS TEXT ---- */
  getStatusText() {
    const texts = {
      high:     ['Bereit für heute', 'In voller Kraft', 'Leuchtend und klar'],
      mid:      ['Ruhig und präsent', 'Wartend auf dich', 'Im Gleichgewicht'],
      low:      ['Du wurdest vermisst', 'Sehnsüchtig wartend', 'Leise brennend'],
      critical: ['Fast erloschen', 'Kehre zurück', 'Brauche deine Reflexion'],
    };
    const arr = texts[this.state] || texts.mid;
    return arr[Math.floor(Date.now() / 10000) % arr.length];
  }

  getAbsenceStatusText(daysSince) {
    if (daysSince >= 7)  return 'Du warst lange fort. Die Seele zittert.';
    if (daysSince >= 3)  return `${daysSince} Tage ohne Reflexion.`;
    if (daysSince === 2) return 'Gestern fehltest du.';
    return this.getStatusText();
  }

  /* ---- PARTICLES ---- */

  _spawnParticles() {
    if (!this.particlesEl) return;
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'orb-particle';

      const angle = (i / 8) * Math.PI * 2;
      const radius = 80 + Math.random() * 40;
      const x = 50 + Math.cos(angle) * (radius / 2);
      const y = 50 + Math.sin(angle) * (radius / 2);
      const tx = (Math.random() - 0.5) * 30;
      const ty = -(20 + Math.random() * 30);

      p.style.cssText = `
        --top: ${y}%;
        --left: ${x}%;
        --tx: ${tx}px;
        --ty: ${ty}px;
        --duration: ${3 + Math.random() * 4}s;
        --delay: ${Math.random() * 4}s;
      `;

      this.particlesEl.appendChild(p);
      this.particles.push(p);
    }
  }

  _burstParticles() {
    if (!this.particlesEl) return;
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('div');
      p.className = 'orb-particle';

      const angle = (i / 6) * Math.PI * 2;
      const tx = Math.cos(angle) * (40 + Math.random() * 30);
      const ty = Math.sin(angle) * (40 + Math.random() * 30) - 20;

      p.style.cssText = `
        --top: 50%;
        --left: 50%;
        --tx: ${tx}px;
        --ty: ${ty}px;
        --duration: 1.5s;
        --delay: ${i * 0.05}s;
        background: var(--accent-gold);
        width: 4px; height: 4px;
      `;

      this.particlesEl.appendChild(p);
      setTimeout(() => p.remove(), 2000);
    }
  }

  _updateParticleIntensity() {
    const opacity = {
      high: '0.6',
      mid: '0.3',
      low: '0.15',
      critical: '0.05',
    }[this.state];

    this.particles.forEach(p => {
      p.style.opacity = opacity;
    });
  }

  /* ---- ENERGY BAR ---- */
  renderEnergyBar(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.style.width = `${this.energy * 100}%`;
  }
}

/* ---- STANDALONE ENERGY CALCULATION ---- */

export function calculateNewEnergy(currentEnergy, action, daysSinceSession = 0) {
  let energy = parseFloat(currentEnergy) || 1.0;

  if (action === 'session_complete') {
    energy = Math.min(1.0, energy + 0.15);
  } else if (action === 'day_decay' && daysSinceSession >= 2) {
    const decay = Math.min((daysSinceSession - 1) * 0.05, 0.5);
    energy = Math.max(0.05, energy - decay);
  }

  return Math.round(energy * 1000) / 1000;
}

export function energyToState(e) {
  if (e >= 0.7) return 'high';
  if (e >= 0.4) return 'mid';
  if (e >= 0.15) return 'low';
  return 'critical';
}
