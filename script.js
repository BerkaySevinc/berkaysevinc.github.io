const CACHE_KEY = 'gh_pages_cache';
const CACHE_TTL = 60 * 60 * 1000;
const TIMER_TOLERANCE = 300;

// Detect GitHub username from hostname or local folder name
function getGitHubUser() {
  const host = window.location.hostname;

  if (host.endsWith('.github.io')) {
    return host.replace('.github.io', '');
  }

  // Local dev: extract from folder name like
  const match = decodeURIComponent(window.location.pathname).match(/([^/]+)\.github\.io/i);
  if (match) return match[1];

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

// Cache
function getCached() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw && raw.ts != null && raw.data && (Date.now() - raw.ts) < CACHE_TTL) return raw;
  } catch { }
  return null;
}

function setCache(data) {
  const ts = Date.now();
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts, data }));
  return ts;
}

function formatAge(ts) {
  const minutes = Math.floor((Date.now() - ts + TIMER_TOLERANCE) / 60000);
  if (minutes < 1) return 'Updated just now';
  return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
}

// UI
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
      <div class="skeleton-line desc2"></div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCards(repos, username) {
  const hasSkeletons = grid.querySelector('.skeleton-card');

  function insertCards() {
    if (repos.length === 0) {
      grid.innerHTML = `
        <div class="empty">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
          <p>No GitHub Pages projects found.</p>
        </div>`;
      return;
    }

    grid.innerHTML = repos.map((repo, i) => {
      const url = `https://${username}.github.io/${repo.name}/`;
      const displayName = escapeHtml(formatRepoName(repo.name));
      const desc = escapeHtml(repo.description || 'No description');
      const delay = i * 0.08;
      return `
        <a href="${url}" class="card card-enter" style="animation-delay: ${delay}s" data-index="${String(i + 1).padStart(2, '0')}" target="_blank" rel="noopener">
          <div class="card-content" style="animation-delay: ${delay}s">
            <div class="card-name">${displayName}<span class="card-arrow">→</span></div>
            <div class="card-desc">${desc}</div>
          </div>
        </a>`;
    }).join('');
  }

  if (hasSkeletons) {
    grid.classList.add('fade-out');
    setTimeout(() => {
      grid.classList.remove('fade-out');
      insertCards();
    }, 300);
  } else {
    insertCards();
  }
}

// Dynamic UI
function setupUI(username) {
  document.getElementById('site-title').textContent = username;

  const footerLink = document.getElementById('footer-link');
  footerLink.href = `https://github.com/${username}`;
  footerLink.querySelector('span').textContent = `github.com/${username}`;
  footerLink.classList.add('visible');

  document.title = `${username} — Projects`;
}

// Main
let statusInterval = null;
let minuteTimeout = null;
let expiryTimeout = null;
let isLoading = false;

function scheduleExpiry(cacheTs) {
  if (expiryTimeout) clearTimeout(expiryTimeout);
  const msUntilExpiry = (cacheTs + CACHE_TTL) - Date.now();
  expiryTimeout = setTimeout(() => {
    if (statusInterval) clearInterval(statusInterval);
    if (minuteTimeout) clearTimeout(minuteTimeout);
    statusInterval = null;
    minuteTimeout = null;
    expiryTimeout = null;
    localStorage.removeItem(CACHE_KEY);
    loadProjects();
  }, msUntilExpiry);
}

function tick(cacheTs) {
  scheduleExpiry(cacheTs);
  if ((cacheTs + CACHE_TTL) - Date.now() < TIMER_TOLERANCE) return false;
  showStatus('', formatAge(cacheTs));
  return true;
}

function startStatusTicker(cacheTs) {
  if (statusInterval) clearInterval(statusInterval);
  if (minuteTimeout) clearTimeout(minuteTimeout);

  const msToNextMinute = 60000 - ((Date.now() - cacheTs) % 60000);
  minuteTimeout = setTimeout(() => {
    minuteTimeout = null;
    if (tick(cacheTs)) {
      statusInterval = setInterval(() => tick(cacheTs), 60000);
    }
  }, msToNextMinute);

  scheduleExpiry(cacheTs);
}

function onPageFocus() {
  const cached = getCached();
  if (cached) {
    showStatus('', formatAge(cached.ts));
    startStatusTicker(cached.ts);
  } else if (getGitHubUser()) {
    loadProjects();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onPageFocus();
});

window.addEventListener('online', onPageFocus);

async function loadProjects() {
  if (isLoading) return;

  const username = getGitHubUser();

  if (!username) {
    showStatus('error', 'Could not detect GitHub username from hostname');
    return;
  }

  setupUI(username);

  const cached = getCached();
  if (cached) {
    renderCards(cached.data, username);
    showStatus('', formatAge(cached.ts));
    startStatusTicker(cached.ts);
    return;
  }

  isLoading = true;
  showStatus('', 'Loading\u2026');
  showSkeletons();

  try {
    const res = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const repos = await res.json();
    const pagesRepos = repos
      .filter(r => r.has_pages && r.name !== `${username}.github.io`)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
      .map(r => ({ name: r.name, description: r.description }));

    const ts = setCache(pagesRepos);
    renderCards(pagesRepos, username);
    showStatus('', 'Updated just now');
    startStatusTicker(ts);
  } catch (err) {
    renderCards([], username);
    showStatus('error', `Failed to load: ${err.message}`);
  } finally {
    isLoading = false;
  }
}

loadProjects();
