# The Last Rack — Deucejuice Studios

The game's website (the game was "VR Bowlliards 2" until autumn 2026; the repo keeps its old
name). Plain HTML/CSS/JS — no framework, no build step, no dependencies, no cookies, no analytics.

Live at https://hughson.github.io/VRBowlliard2/ (GitHub Pages, `main`, root).

## Pages

- `index.html` — the game, with the live "Playing now / Rooms open" counts
- `pages/leaderboards.html` — Bowlliards, darts and the all-time richest, top 100
- `pages/story.html` — the comic
- `pages/about.html` — what's in the pub
- `pages/support.html` — requirements, FAQ, contact
- `pages/privacy.html` — privacy policy (required for Meta Store submission)

`js/chrome.js` injects the shared header and footer so the nav lives in one
place. Each page sets `<body data-nav="home|boards|story|about|support|privacy">`.

## Live data

Both read the game's Firestore (project `vr-bowlliards`) over its REST API with a plain `fetch`:
no SDK, no key, only collections that `firestore.rules` in the game project leaves public-read.

- `js/live-stats.js` — the home page's counts, from `liveRooms` (each public room's heartbeat,
  every 20 s; rooms silent for 60 s aren't counted). Refreshes every 30 s; hides itself at zero.
- `js/leaderboards.js` — the leaderboards, from the same rows the boards in the game read
  (`vb2_players`, `vb2_coop_pairs`, `vb2_bowl_lb`, `vb2_darts_lb`, `vb2_ice_public`).

Firestore bills a read per row, so the leaderboards read nothing until a tab is opened, read a
collection once for all of its boards, and keep it five minutes (see the top of the file). If
the game's field names or minimums change (`DartsBoardInfo`, `LeaderboardCategoryInfo`,
`IceLeaderboards`), change `leaderboards.js` to match.

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

`pages/privacy.html` is `Store Assets/The Last Rack Privacy Policy.md` from the game project,
with the maker, contact address and date filled in and a section about this website added.
Keep the two the same.

If what the game collects changes — a new backend, an analytics SDK, anything about voice —
the policy must be updated to match before the change ships.
