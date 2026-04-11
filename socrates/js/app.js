/* ============================================================
   SOCRATES — APP INIT & GLOBALE LOGIK
   Toast · Modal · Utils · App-Start
   ============================================================ */

/* ---- TOAST SYSTEM ---- */

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3500) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-4px)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ---- MODAL SYSTEM ---- */

export function openModal(overlayEl) {
  overlayEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeModal(overlayEl) {
  overlayEl.classList.remove('open');
  document.body.style.overflow = '';
}

export function createConfirmModal(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog">
      <p style="margin-bottom:var(--space-3);color:var(--text-secondary);line-height:1.6;">${message}</p>
      <div style="display:flex;gap:var(--space-2);justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" id="confirm-cancel">Abbrechen</button>
        <button class="btn btn-danger btn-sm" id="confirm-ok">Bestätigen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => openModal(overlay));

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
    closeModal(overlay);
    setTimeout(() => overlay.remove(), 400);
  });

  overlay.querySelector('#confirm-ok').addEventListener('click', () => {
    closeModal(overlay);
    setTimeout(() => overlay.remove(), 400);
    onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(overlay);
      setTimeout(() => overlay.remove(), 400);
    }
  });
}

/* ---- LOADING OVERLAY ---- */

let loadingEl = null;

export function showLoading(text = '') {
  if (loadingEl) return;
  loadingEl = document.createElement('div');
  loadingEl.className = 'auth-loading';
  loadingEl.innerHTML = `
    <div class="auth-loading-logo">Socrates</div>
    ${text ? `<p style="color:var(--text-muted);font-size:0.8rem;letter-spacing:0.06em">${text}</p>` : ''}
    <div class="spinner"></div>
  `;
  document.body.appendChild(loadingEl);
}

export function hideLoading() {
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    loadingEl.style.transition = 'opacity 0.4s';
    setTimeout(() => {
      loadingEl?.remove();
      loadingEl = null;
    }, 400);
  }
}

/* ---- DATE FORMATTING ---- */

export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatDateShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function isToday(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export function daysSince(dateStr) {
  if (!dateStr) return 99;
  const diff = new Date() - new Date(dateStr);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/* ---- INPUT VALIDATION ---- */

export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ---- AUTO-RESIZE TEXTAREA ---- */

export function autoResizeTextarea(textarea) {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resize);
  resize();
}

/* ---- CHAR COUNT ---- */

export function initCharCount(textarea, countEl, min = 20) {
  const update = () => {
    const len = textarea.value.length;
    countEl.textContent = len;
    if (len >= min) {
      countEl.style.color = 'var(--accent-gold-dim)';
    } else {
      countEl.style.color = 'var(--text-muted)';
    }
  };
  textarea.addEventListener('input', update);
  update();
}

/* ---- GLOBAL ERROR HANDLER ---- */

export function handleError(error, userMessage = 'Ein Fehler ist aufgetreten.') {
  showToast(userMessage, 'error');
}

/* ---- PAGE INIT HELPER ---- */

export function initPage(main) {
  if (main) {
    main.classList.add('page-enter');
    requestAnimationFrame(() => {
      main.classList.remove('page-enter');
      main.classList.add('page-active');
    });
  }
}

/* ---- SCROLL TO BOTTOM ---- */

export function scrollToBottom(el, smooth = true) {
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'instant',
  });
}
