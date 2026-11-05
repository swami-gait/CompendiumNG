// ============================================================
// CompendiumNG Web — Toast notifications (transient messages)
// ============================================================

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export type ToastKind = 'info' | 'success' | 'error';

/** Shows a transient toast; does not steal focus. */
export function showToast(message: string, kind: ToastKind = 'info', durationMs = 4000): void {
  if (!message) return;
  const root = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  root.appendChild(toast);
  // Force a reflow so the enter animation runs
  void toast.offsetWidth;
  toast.classList.add('toast-show');
  window.setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 500); // fallback if transition events are suppressed
  }, durationMs);
}
