// ============================================================
// CompendiumNG Web — Application Entry Point
// ============================================================

import './styles/index.css';
import { initApp } from './ui/App';

// Boot the application — all DOM containers already exist in index.html
initApp().catch((err: unknown) => {
  console.error('CompendiumNG Web failed to initialise:', err);
  // Show error inside loading screen if it still exists
  const loading = document.getElementById('loading-screen');
  if (loading) {
    loading.innerHTML = `
      <div style="text-align:center;color:#f43f5e;padding:2rem;max-width:480px">
        <h2 style="margin-bottom:1rem;color:#f43f5e">Failed to initialise</h2>
        <p style="color:#8b949e;font-size:0.875rem;margin-bottom:1rem">
          ${(err as Error)?.message ?? String(err) ?? 'Unknown error'}
        </p>
        <pre style="background:#161b22;padding:1rem;border-radius:8px;font-size:0.75rem;color:#8b949e;text-align:left;overflow:auto;max-height:200px">
${(err as Error)?.stack ?? ''}
        </pre>
        <button onclick="location.reload()" style="margin-top:1.5rem;padding:0.5rem 1.25rem;background:#0ea5e9;border:none;border-radius:8px;color:white;cursor:pointer;font-size:0.875rem">
          Retry
        </button>
      </div>`;
  }
});
