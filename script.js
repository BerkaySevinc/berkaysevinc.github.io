const CACHE_KEY = 'gh_pages_cache';
const FETCH_LOG_KEY = 'gh_fetch_log';
const RATE_WINDOW = 60 * 60 * 1000;
const MAX_FETCHES_PER_HOUR = 11;

// Detect GitHub username from hostname (e.g. "berkaysevinc.github.io" → "berkaysevinc")
function getGitHubUser() {
  const host = window.location.hostname;
  if (host.endsWith('.github.io')) {
    return host.replace('.github.io', '');
  }
  return null;
}

// Format repo name: "workout-planner" → "Workout Planner"
function formatRepoName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Theme
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

document.querySelector('.theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// Fetch rate tracking
function getFetchLog() {
  try {
    return JSON.parse(localStorage.getItem(FETCH_LOG_KEY)) || [];
  } catch { return []; }
}

function pruneFetchLog() {
  const cutoff = Date.now() - RATE_WINDOW;
  const log = getFetchLog().filter(t => t > cutoff);
  localStorage.setItem(FETCH_LOG_KEY, JSON.stringify(log));
  return log;
}

function canFetch() {
  return pruneFetchLog().length < MAX_FETCHES_PER_HOUR;
}

function recordFetch() {
  const log = pruneFetchLog();
  log.push(Date.now());
  localStorage.setItem(FETCH_LOG_KEY, JSON.stringify(log));
}

// Cache
function getCached() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw && raw.ts && raw.data) return raw;
  } catch {}
  return null;
}

function setCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
}

// UI helpers
const grid = document.getElementById('grid');
const status = document.getElementById('status');

function showStatus(type, text) {
  status.innerHTML = `<span class="status-dot ${type}"></span>${text}`;
}

function showSkeletons() {
  grid.innerHTML = Array.from({ length: 6 }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line desc1"></div>
      <div class="skeleton-line desc2"></div>
    </div>
  `).join('');
}

function renderCards(repos, username) {
  if (repos.length === 0) {
    grid.innerHTML = `
      <div class="empty" style="grid-column: 1 / -1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <p>No GitHub Pages projects found.</p>
      </div>`;
    return;
  }

  grid.innerHTML = repos.map((repo, i) => {
    const url = `https://${username}.github.io/${repo.name}/`;
    const displayName = formatRepoName(repo.name);
    const desc = repo.description || 'No description';
    return `
      <a href="${url}" class="card fade-in" style="animation-delay: ${i * 0.05}s" target="_blank" rel="noopener">
        <div class="card-name">${displayName}<span class="arrow">→</span></div>
        <div class="card-desc">${desc}</div>
      </a>`;
  }).join('');
}

// Set dynamic UI elements
function setupUI(username) {
  const title = document.getElementById('site-title');
  title.innerHTML = `${username}`;

  const footerLink = document.getElementById('footer-link');
  footerLink.href = `https://github.com/${username}`;
  footerLink.textContent = `github.com/${username}`;

  document.title = `${username} — Projects`;
}

// Main
async function loadProjects() {
  const username = getGitHubUser();

  if (!username) {
    showStatus('error', 'Could not detect GitHub username from hostname');
    return;
  }

  setupUI(username);
  showSkeletons();

  // Rate limit reached — fall back to cache
  if (!canFetch()) {
    const cached = getCached();
    if (cached) {
      renderCards(cached.data, username);
      showStatus('cached', 'Loaded from cache (rate limit reached)');
    } else {
      renderCards([], username);
      showStatus('error', 'Rate limit reached and no cache available');
    }
    return;
  }

  // Always fetch fresh data
  try {
    recordFetch();
    const res = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const repos = await res.json();
    const pagesRepos = repos
      .filter(r => r.has_pages && r.name !== `${username}.github.io`)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
      .map(r => ({ name: r.name, description: r.description }));

    setCache(pagesRepos);
    renderCards(pagesRepos, username);
    const remaining = MAX_FETCHES_PER_HOUR - pruneFetchLog().length;
    showStatus('', `Updated just now · ${remaining} requests remaining this hour`);
  } catch (err) {
    const cached = getCached();
    if (cached) {
      renderCards(cached.data, username);
      showStatus('error', `API error — loaded from cache`);
    } else {
      renderCards([], username);
      showStatus('error', `Failed to load: ${err.message}`);
    }
  }
}

loadProjects();
