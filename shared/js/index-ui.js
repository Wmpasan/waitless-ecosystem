(function () {
  function getRootPrefix() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const segments = path.split('/').filter(Boolean);

    if (segments.length > 0) {
      const last = segments[segments.length - 1] || '';
      if (/\.(html|htm|php|aspx)$/i.test(last)) {
        segments.pop();
      }
    }

    return segments.length > 0 ? '../'.repeat(segments.length) : './';
  }

  function updateAuthNavState(user) {
    const signInLinks = document.querySelectorAll('.wl-topnav a[href*="auth/login.html"]');
    signInLinks.forEach((link) => {
      const shouldHide = !!user;
      link.style.display = shouldHide ? 'none' : '';
      link.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');
    });
  }

  function resolveHeaderPath(value, root) {
    if (!value) return value;
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(value)) return value;
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return value;
    return `${root}${value}`;
  }

  function normalizeHeaderPaths(root) {
    document.querySelectorAll('.wl-topbar a[href], .wl-topbar img[src]').forEach((element) => {
      const attribute = element.tagName === 'A' ? 'href' : 'src';
      const value = element.getAttribute(attribute);
      if (!value) return;

      const resolved = resolveHeaderPath(value, root);
      if (resolved !== value) {
        element.setAttribute(attribute, resolved);
      }
    });
  }

  function addGlobalTopbar() {
    if (document.querySelector('.wl-topbar')) return;
    const root = getRootPrefix();
    const topbar = document.createElement('header');
    topbar.className = 'wl-topbar waitless-global-topbar';
    topbar.innerHTML = `
      <a class="wl-brand" href="${root}index.html" aria-label="Waitless home">
        <img src="${root}images/new.png" alt="" />
        <span>Waitless</span>
      </a>
      <nav class="wl-topnav" aria-label="Primary">
        <a href="${root}index.html#how">How it works</a>
        <a href="${root}index.html#roles">Workspaces</a>
        <a href="${root}auth/login.html">Sign in</a>
      </nav>
    `;
    normalizeHeaderPaths(root);
    document.body.insertBefore(topbar, document.body.firstChild);
    document.body.classList.add('waitless-index-ui');
  }

  function initAuthNav() {
    addGlobalTopbar();

    if (window.firebase && typeof window.firebase.auth === 'function') {
      const auth = window.firebase.auth();
      auth.onAuthStateChanged((user) => {
        updateAuthNavState(user);
      });
    } else {
      updateAuthNavState(null);
    }
  }

  document.addEventListener('DOMContentLoaded', initAuthNav);
})();
