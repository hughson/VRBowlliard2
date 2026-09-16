# VR Bowlliards 2 — Deucejuice Studios

Static marketing and compliance site. Plain HTML/CSS/JS — no framework, no build
step, no dependencies, no cookies, no analytics.

## Pages

- `index.html` — the game
- `pages/about.html` — how it plays
- `pages/support.html` — requirements, FAQ, contact
- `pages/privacy.html` — privacy policy (required for Meta Store submission)

`js/chrome.js` injects the shared header and footer so the nav lives in one
place. Each page sets `<body data-nav="home|about|support|privacy">`.

## Hosting

Any static host. For GitHub Pages: push to a public repo, then
Settings → Pages → Deploy from branch → root. The site uses absolute paths
(`/css/...`), so if you deploy to a project subpath rather than a custom domain
or `username.github.io`, either switch those to relative paths or serve it from
the domain root.

## Local preview

```
python3 -m http.server 8000
```

## Note on the privacy policy

The policy describes what the game actually collects, checked against the source
in September 2026: Meta account ID and display name, game results in Firebase
(high score, high frame score, high run, max break balls, total games), and live
match state plus voice carried through Photon during multiplayer. There is no
analytics, advertising or crash-reporting SDK in the build.

If any of that changes — a new backend, an analytics SDK, stored voice — the
policy must be updated to match before the change ships.
