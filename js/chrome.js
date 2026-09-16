/* Shared header/footer, injected so nav lives in one place without a build step.
 * Each page sets <body data-nav="home|about|support|privacy">.
 *
 * Links are built from the site root derived at runtime from this script's own
 * URL, so the same file works from the root, from /pages/, and from a project
 * subpath like username.github.io/RepoName/ — where absolute "/..." links would
 * resolve to the account root and 404. */
(function () {
  'use strict';

  // .../js/chrome.js -> .../  (site root, with trailing slash)
  const root = new URL('../', document.currentScript.src).href;

  const LINKS = [
    ['home', '', 'The Game'],
    ['about', 'pages/about.html', 'About'],
    ['support', 'pages/support.html', 'Support']
  ];

  // External, so it sits outside LINKS (no data-nav state, opens in a new tab).
  const DISCORD = 'https://discord.gg/93efkcDKPG';

  const current = document.body.dataset.nav || '';

  const nav = LINKS.map(([id, path, label]) =>
    `<a href="${root}${path}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <header class="site-head">
      <div class="wrap">
        <a class="brand" href="${root}"><span class="dot"></span> <span class="chrome">VR Bowlliards</span> <span class="gold">2</span></a>
        <nav class="nav">${nav}<a class="nav-discord" href="${DISCORD}" target="_blank" rel="noopener">Discord</a></nav>
      </div>
    </header>`);

  document.body.insertAdjacentHTML('beforeend', `
    <footer class="site-foot">
      <div class="wrap">
        <div>© ${new Date().getFullYear()} Deucejuice Studios</div>
        <nav>
          <a href="${root}pages/about.html">About</a>
          <a href="${root}pages/support.html">Support</a>
          <a href="${root}pages/privacy.html">Privacy</a>
          <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>
        </nav>
      </div>
    </footer>`);
})();
