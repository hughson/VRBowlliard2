/* The pub's leaderboards on the website: Bowlliards, darts and the all-time richest, each to
 * the top 100 (the boards on the pub wall show ten or fifteen).
 *
 * Read straight from the game's public Firestore figures with a plain fetch — the same rows the
 * boards in the game read, so the two always agree. No SDK, no key: these collections are
 * public-read in firestore.rules.
 *
 *   Bowlliards  all-time   vb2_players, vb2_coop_pairs
 *               week/month vb2_bowl_lb/{w+Monday | m+month}/rows and /pairs
 *   Darts       every period vb2_darts_lb/{all | w… | m…}/rows
 *   Richest     vb2_ice_public (worth)
 *
 * READS COST MONEY (Firestore bills a read per row), so:
 *   - nothing is read until its tab is opened;
 *   - a collection is read whole ONCE and every board on it is worked out here (eight
 *     Bowlliards boards from one read, thirteen darts boards from one read);
 *   - what was read is kept for five minutes, across page reloads (sessionStorage);
 *   - once a collection outgrows ALL_CAP rows it is no longer read whole: each board then asks
 *     for its own top 100 in order, so a view never costs more than ALL_CAP reads.
 *
 * Player names come from the game and are untrusted: they only ever reach the page through
 * textContent, never innerHTML.
 */
(function () {
  'use strict';

  var BASE = 'https://firestore.googleapis.com/v1/projects/vr-bowlliards/databases/(default)/documents';
  var TOP = 100;                    // rows shown
  var ALL_CAP = 500;                // a collection up to this size is read whole
  var CACHE_MS = 5 * 60 * 1000;     // how long a read is kept

  // ───────────────────────── boards ─────────────────────────

  // Bowlliards, as LeaderboardCategory in the game. Records carry the Ultra / Real Cue badge
  // they were set with (field + "Ultra"); counts and averages carry none.
  var BOWL = [
    { id: 'high',  tab: 'High score',  col: 'Score',   field: 'highScore',      badge: true,
      about: 'The best single game. A perfect game is 300.' },
    { id: 'avg',   tab: 'Average',     col: 'Average', field: 'avgScore',
      about: 'Average score over every game saved.' },
    { id: 'run',   tab: 'High run',    col: 'Run',     field: 'highRun',        badge: true,
      about: 'The longest run of strikes in a row.' },
    { id: 'frame', tab: 'High frame',  col: 'Frame',   field: 'highFrameScore', badge: true,
      about: 'The best score in a single frame.' },
    { id: 'break', tab: 'Best break',  col: 'Balls',   field: 'maxBreakBalls',  badge: true,
      about: 'Most balls potted on a break shot.' },
    { id: 'games', tab: 'Most games',  col: 'Games',   field: 'totalGames',
      about: 'Games finished.' },
    { id: 'pot',   tab: 'Potting',     col: 'Potting', field: 'pottingAvg',
      about: 'Balls potted per shot taken, break shots not counted.' },
    { id: 'wins',  tab: 'Win record',  col: 'W-L-T',   field: 'wins', soloOnly: true,
      about: 'Head-to-head matches in public rooms: wins, losses, ties. Ranked by wins.' }
  ];

  // Darts, as DartsBoardInfo in the game. The server leaves a figure off a row until the player
  // has played enough to rank, so "has the field" is "is on the board".
  var DART_GAMES = [
    { id: '501', tab: '501' }, { id: '301', tab: '301' }, { id: 'cricket', tab: 'Cricket' },
    { id: 'around', tab: 'Around the World' }, { id: 'matches', tab: 'Matches' }
  ];
  var DARTS = [
    { game: '501', id: 'fewest', tab: 'Fewest darts', col: 'Darts', field: 'x501Fewest', asc: true,
      about: 'Fewest darts to win a leg of 501, on your own or in a match.' },
    { game: '501', id: 'avg', tab: '3-dart average', col: 'Average', field: 'x501Avg', dp: 2,
      about: 'Points per three darts over every 501 leg finished. 3 legs to rank.' },
    { game: '501', id: 'checkout', tab: 'Highest checkout', col: 'Checkout', field: 'x501Checkout',
      about: 'The biggest finishing turn in a won leg of 501.' },
    { game: '501', id: '180s', tab: '180s', col: '180s', field: 'x501N180',
      about: 'Maximums thrown in 501.' },
    { game: '301', id: 'fewest', tab: 'Fewest darts', col: 'Darts', field: 'x301Fewest', asc: true,
      about: 'Fewest darts to win a leg of 301.' },
    { game: 'cricket', id: 'fewest', tab: 'Fewest darts', col: 'Darts', field: 'crFewest', asc: true,
      about: 'Fewest darts to win a game of cricket.' },
    { game: 'cricket', id: 'mpr', tab: 'Marks per round', col: 'Marks/round', field: 'crMpr', dp: 2,
      about: 'Marks per round of three darts over every cricket game finished. 3 games to rank.' },
    { game: 'around', id: 'plain', tab: 'Plain', col: 'Darts', field: 'atw0Fewest', asc: true,
      about: 'Fewest darts round the board: 1 to 20, then the bull.' },
    { game: 'around', id: 'perfect', tab: 'Perfect Turn', col: 'Darts', field: 'atw1Fewest', asc: true,
      about: 'With Perfect Turn (bonus darts aren’t counted).' },
    { game: 'around', id: 'double', tab: 'Double-Advance', col: 'Darts', field: 'atw2Fewest', asc: true,
      about: 'With Double-Advance (a double moves you 2, a treble 3).' },
    { game: 'around', id: 'both', tab: 'Both', col: 'Darts', field: 'atw3Fewest', asc: true,
      about: 'With Perfect Turn and Double-Advance.' },
    { game: 'matches', id: 'wins', tab: 'Wins', col: 'Wins', field: 'mWins',
      about: 'Darts matches won, any game.' },
    { game: 'matches', id: 'rate', tab: 'Win %', col: 'Win %  W-L', field: 'mRateKey', rate: true,
      about: 'Share of darts matches won. {min} matches to rank.' }
  ];

  var PERIODS = [
    { id: 'week', tab: 'This week' }, { id: 'month', tab: 'This month' }, { id: 'all', tab: 'All-time' }
  ];

  // ───────────────────────── periods (UTC, as the server keys them) ─────────────────────────

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function monday(now) {
    var dow = (now.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  }

  /** "all", "w20261109" (the week's Monday), "m202611". */
  function periodKey(period) {
    var now = new Date();
    if (period === 'all') return 'all';
    if (period === 'month') return 'm' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1);
    var m = monday(now);
    return 'w' + m.getUTCFullYear() + pad(m.getUTCMonth() + 1) + pad(m.getUTCDate());
  }

  function periodTitle(period) {
    var now = new Date();
    if (period === 'all') return 'All-time';
    if (period === 'month') return MONTHS[now.getUTCMonth()] + ' ' + now.getUTCFullYear();
    var m = monday(now);
    return 'Week of ' + m.getUTCDate() + ' ' + MONTHS[m.getUTCMonth()].slice(0, 3);
  }

  function periodSuffix(period) {
    return period === 'week' ? ' this week' : period === 'month' ? ' this month' : '';
  }

  // ───────────────────────── reading ─────────────────────────

  /** A Firestore REST document's fields as a plain object (numbers, strings, booleans). */
  function plain(fields) {
    var o = {};
    for (var k in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
      var v = fields[k];
      if (v.integerValue !== undefined) o[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) o[k] = Number(v.doubleValue);
      else if (v.stringValue !== undefined) o[k] = v.stringValue;
      else if (v.booleanValue !== undefined) o[k] = v.booleanValue;
    }
    return o;
  }

  function runQuery(src, order, desc, limit) {
    var q = { from: [{ collectionId: src.coll }], limit: limit };
    if (order) q.orderBy = [{ field: { fieldPath: order }, direction: desc ? 'DESCENDING' : 'ASCENDING' }];
    return fetch(BASE + (src.parent ? '/' + src.parent : '') + ':runQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: q }),
      cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error('leaderboard read failed: ' + r.status);
      return r.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('leaderboard read: unexpected answer');
      var out = [];
      rows.forEach(function (x) {
        if (x.error) throw new Error('leaderboard read: ' + (x.error.message || 'error'));
        if (x.document) out.push(plain(x.document.fields || {}));
      });
      return out;
    });
  }

  var mem = {};   // key -> { at, rows } | { promise }

  function stored(key) {
    try {
      var s = JSON.parse(sessionStorage.getItem('lb:' + key) || 'null');
      return s && Array.isArray(s.rows) && Date.now() - s.at < CACHE_MS ? s : null;
    } catch (e) { return null; }
  }

  function store(key, entry) {
    try { sessionStorage.setItem('lb:' + key, JSON.stringify(entry)); } catch (e) { /* full or blocked: fine */ }
  }

  /** One read, shared by everyone who asks while it's on its way, kept CACHE_MS. → { rows, at } */
  function cached(key, read) {
    var m = mem[key];
    if (m && m.promise) return m.promise;
    if (m && Date.now() - m.at < CACHE_MS) return Promise.resolve(m);
    var s = stored(key);
    if (s) { mem[key] = s; return Promise.resolve(s); }
    var p = read().then(function (rows) {
      var entry = { at: Date.now(), rows: rows };
      mem[key] = entry;
      store(key, entry);
      return entry;
    }, function (err) {
      delete mem[key];
      throw err;
    });
    mem[key] = { promise: p };
    return p;
  }

  function srcKey(src) { return (src.parent ? src.parent + '/' : '') + src.coll; }

  /**
   * The rows a board is worked out from: the whole collection while it's small enough to read
   * whole, otherwise the top rows by the board's own field. → { rows, at }
   */
  function rowsFor(src, field, desc, limit) {
    return cached(srcKey(src), function () { return runQuery(src, null, false, ALL_CAP); })
      .then(function (all) {
        if (all.rows.length < ALL_CAP) return all;
        return cached(srcKey(src) + '?' + field + (desc ? '-' : '+') + limit,
          function () { return runQuery(src, field, desc, limit); });
      });
  }

  // ───────────────────────── working a board out ─────────────────────────

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function int(row, k) { return isNum(row[k]) ? Math.round(row[k]) : 0; }

  /** A name as the page shows it: one line, no control characters, not endless. */
  function cleanName(s) {
    var out = '', i, c;
    s = typeof s === 'string' ? s : '';
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      // Control characters, zero-width and text-direction marks, line separators.
      if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200b && c <= 0x200f) ||
          (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) continue;
      out += s.charAt(i);
    }
    out = out.trim();
    if (out.length > 32) out = out.slice(0, 31) + String.fromCharCode(0x2026);
    return out || 'Player';
  }

  // The level saved with a record: low bits the Ultra level, one bit Real Cue Mode (UltraRealism).
  function badges(row, board) {
    if (!board.badge) return [];
    var v = int(row, board.field + 'Ultra'), level = Math.min(v & 3, 2), out = [];
    if (level === 2) out.push({ text: 'Full Ultra', cls: 'full' });
    else if (level === 1) out.push({ text: 'Ultra', cls: 'ultra' });
    if (v & 4) out.push({ text: 'Real cue', cls: 'cue' });
    return out;
  }

  function oneDp(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function potting(v) { var s = v.toFixed(3); return s.charAt(0) === '0' ? s.slice(1) : s; }

  /** A Bowlliards row's figure for a board, or null when the row isn't on it. → { sort, text } */
  function bowlValue(row, board, period) {
    var f = board.field, v = row[f];
    if (board.id === 'wins') {
      var w = int(row, 'wins'), l = int(row, 'losses'), t = int(row, 'ties');
      if (w + l + t < 1) return null;
      return { sort: w, text: w + '-' + l + '-' + t };
    }
    if (board.id === 'avg') {
      // All-time rows hold the totals; a week's or month's row holds the average the server worked out.
      if (!isNum(v)) {
        if (period !== 'all' || int(row, 'totalGames') < 1) return null;
        v = int(row, 'totalScore') / int(row, 'totalGames');
      }
      return { sort: v, text: oneDp(v) };
    }
    if (board.id === 'pot') {
      if (!isNum(v)) {
        if (period !== 'all' || int(row, 'totalShots') < 1) return null;
        v = int(row, 'totalBallsMade') / int(row, 'totalShots');
      }
      return { sort: v, text: potting(v) };
    }
    if (!isNum(v) || v <= 0) return null;
    return { sort: v, text: String(Math.round(v)) };
  }

  function dartsValue(row, board) {
    var v = row[board.field];
    if (!isNum(v)) return null;
    if (board.rate) {
      var w = int(row, 'mWins'), l = int(row, 'mLosses'), n = w + l;
      return { sort: v, text: (n > 0 ? Math.floor(100 * w / n) : 0) + '%', note: w + '-' + l };
    }
    return { sort: v, text: board.dp ? v.toFixed(board.dp) : String(Math.round(v)) };
  }

  /** The top rows, best first. sharedRanks: equal figures share a place (1, 2, 2, 4), as darts does. */
  function rank(rows, valueOf, nameOf, asc, sharedRanks, badgesOf) {
    var list = [];
    rows.forEach(function (row) {
      var v = valueOf(row);
      if (v) list.push({ v: v, name: nameOf(row), badges: badgesOf ? badgesOf(row) : [] });
    });
    list.sort(function (a, b) { return asc ? a.v.sort - b.v.sort : b.v.sort - a.v.sort; });
    list = list.slice(0, TOP);
    list.forEach(function (e, i) {
      e.rank = sharedRanks && i > 0 && list[i - 1].v.sort === e.v.sort ? list[i - 1].rank : i + 1;
    });
    return list;
  }

  // ───────────────────────── the view's state ─────────────────────────

  var state = { game: 'bowl', period: 'all', mode: 'solo', bowl: 'high', dgame: '501', dstat: 'fewest' };

  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function dartStats(game) { return DARTS.filter(function (b) { return b.game === game; }); }

  /** Keep the state to things that exist (a link from somewhere, an old bookmark). */
  function tidy() {
    if (['bowl', 'darts', 'rich'].indexOf(state.game) < 0) state.game = 'bowl';
    if (!find(PERIODS, state.period)) state.period = 'all';
    if (state.mode !== 'coop') state.mode = 'solo';
    var b = find(BOWL, state.bowl);
    if (!b || (b.soloOnly && state.mode === 'coop')) state.bowl = 'high';
    if (!find(DART_GAMES, state.dgame)) state.dgame = '501';
    if (!find(dartStats(state.dgame), state.dstat)) state.dstat = dartStats(state.dgame)[0].id;
  }

  // #bowl/all/solo/high   #darts/week/501/fewest   #rich
  function readHash() {
    var p = (location.hash || '').replace(/^#/, '').split('/');
    if (p[0] === 'bowl') { state.game = 'bowl'; state.period = p[1]; state.mode = p[2]; state.bowl = p[3]; }
    else if (p[0] === 'darts') { state.game = 'darts'; state.period = p[1]; state.dgame = p[2]; state.dstat = p[3]; }
    else if (p[0] === 'rich') state.game = 'rich';
    tidy();
  }

  function writeHash() {
    var h = state.game === 'bowl' ? ['bowl', state.period, state.mode, state.bowl]
          : state.game === 'darts' ? ['darts', state.period, state.dgame, state.dstat] : ['rich'];
    try { history.replaceState(null, '', '#' + h.join('/')); } catch (e) { /* file:// and the like */ }
  }

  /** What the state asks for: where to read, how to work it out, how to title it. */
  function describe() {
    var key = periodKey(state.period);
    if (state.game === 'rich') {
      return {
        accent: 'ice', title: 'All-time richest', period: 'All-time', col: 'Ice', who: 'Player',
        about: 'Ice in hand and on the tables. Ice is the pub’s play money: it can’t be exchanged for real money.',
        src: { parent: '', coll: 'vb2_ice_public' }, field: 'worth', desc: true, limit: TOP,
        empty: 'Nobody on the board yet.',
        build: function (rows) {
          return rank(rows, function (r) {
            return isNum(r.worth) && r.worth > 0 ? { sort: r.worth, text: Math.round(r.worth).toLocaleString('en-US') } : null;
          }, function (r) { return cleanName(r.name); }, false, false);
        }
      };
    }
    if (state.game === 'darts') {
      var d = find(dartStats(state.dgame), state.dstat);
      return {
        accent: 'silver', title: find(DART_GAMES, state.dgame).tab + ' · ' + d.tab, period: periodTitle(state.period),
        col: d.col, who: 'Player',
        about: d.about.replace('{min}', state.period === 'all' ? '10' : '5'),
        src: { parent: 'vb2_darts_lb/' + key, coll: 'rows' }, field: d.field, desc: !d.asc, limit: TOP,
        empty: 'Nobody on this board yet' + periodSuffix(state.period) + '.',
        build: function (rows) {
          return rank(rows, function (r) { return dartsValue(r, d); },
            function (r) { return cleanName(r.displayName); }, !!d.asc, true);
        }
      };
    }
    var b = find(BOWL, state.bowl), coop = state.mode === 'coop', all = state.period === 'all';
    // Averages aren't a field on the all-time rows, so when a collection is too big to read whole
    // they're worked out from the most-played rows (as the game does).
    var computed = all && (b.id === 'avg' || b.id === 'pot');
    return {
      accent: 'gold', title: 'Bowlliards · ' + b.tab, period: periodTitle(state.period),
      col: b.col, who: coop ? 'Pair' : 'Player', about: b.about,
      src: all ? { parent: '', coll: coop ? 'vb2_coop_pairs' : 'vb2_players' }
               : { parent: 'vb2_bowl_lb/' + key, coll: coop ? 'pairs' : 'rows' },
      field: computed ? 'totalGames' : b.field, desc: true, limit: computed ? ALL_CAP : TOP,
      empty: 'Nobody on this board yet' + periodSuffix(state.period) + '.',
      build: function (rows) {
        return rank(rows, function (r) { return bowlValue(r, b, state.period); },
          function (r) {
            return coop ? cleanName(r.player1DisplayName) + ' & ' + cleanName(r.player2DisplayName)
                        : cleanName(r.displayName);
          }, false, false, function (r) { return badges(r, b); });
      }
    };
  }

  // ───────────────────────── drawing ─────────────────────────

  var root, els = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function chips(label, items, current, pick) {
    var row = el('div', 'lb-row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    items.forEach(function (it) {
      var b = el('button', 'chip', it.tab);
      b.type = 'button';
      b.setAttribute('aria-pressed', it.id === current ? 'true' : 'false');
      b.addEventListener('click', function () { if (it.id !== current) pick(it.id); });
      row.appendChild(b);
    });
    return row;
  }

  function set(change) {
    change();
    tidy();
    writeHash();
    draw();
  }

  function drawControls() {
    var c = els.controls;
    c.textContent = '';
    c.appendChild(chips('Leaderboard', [
      { id: 'bowl', tab: 'Bowlliards' }, { id: 'darts', tab: 'Darts' }, { id: 'rich', tab: 'Richest' }
    ], state.game, function (id) { set(function () { state.game = id; }); }));
    c.firstChild.classList.add('lb-games');

    if (state.game === 'rich') return;
    c.appendChild(chips('Period', PERIODS, state.period, function (id) { set(function () { state.period = id; }); }));

    if (state.game === 'bowl') {
      c.appendChild(chips('Solo or co-op', [{ id: 'solo', tab: 'Solo' }, { id: 'coop', tab: 'Co-op' }],
        state.mode, function (id) { set(function () { state.mode = id; }); }));
      c.appendChild(chips('Board', BOWL.filter(function (b) { return !(b.soloOnly && state.mode === 'coop'); }),
        state.bowl, function (id) { set(function () { state.bowl = id; }); }));
    } else {
      c.appendChild(chips('Game', DART_GAMES, state.dgame, function (id) { set(function () { state.dgame = id; }); }));
      c.appendChild(chips('Board', dartStats(state.dgame), state.dstat, function (id) { set(function () { state.dstat = id; }); }));
    }
  }

  function message(text, retry) {
    var tr = el('tr', 'lb-msg'), td = el('td', null, text);
    td.colSpan = 3;
    if (retry) {
      var b = el('button', 'icon-btn', 'Try again');
      b.type = 'button';
      b.addEventListener('click', function () { draw(); });
      td.appendChild(document.createTextNode(' '));
      td.appendChild(b);
    }
    tr.appendChild(td);
    els.body.textContent = '';
    els.body.appendChild(tr);
  }

  function clock(at) {
    var d = new Date(at);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  var asked = 0;      // the latest draw: an earlier one's answer is dropped
  var shownAt = 0;    // when the rows on screen were read

  function draw() {
    var view = describe(), mine = ++asked;
    drawControls();
    els.panel.setAttribute('data-accent', view.accent);
    els.title.textContent = view.title;
    els.period.textContent = view.period;
    els.about.textContent = view.about;
    els.who.textContent = view.who;
    els.col.textContent = view.col;
    els.foot.textContent = '';
    message('Loading…');
    els.panel.setAttribute('aria-busy', 'true');

    rowsFor(view.src, view.field, view.desc, view.limit).then(function (got) {
      if (mine !== asked) return;
      els.panel.removeAttribute('aria-busy');
      shownAt = got.at;
      var list = view.build(got.rows);
      if (!list.length) { message(view.empty); }
      else {
        var frag = document.createDocumentFragment();
        list.forEach(function (e) {
          var tr = el('tr');
          tr.appendChild(el('td', 'rank' + (e.rank <= 3 ? ' top r' + e.rank : ''), String(e.rank)));
          var name = el('td', 'lb-name');
          name.appendChild(el('span', 'lb-who', e.name));
          e.badges.forEach(function (b) { name.appendChild(el('span', 'lb-badge ' + b.cls, b.text)); });
          tr.appendChild(name);
          var val = el('td', 'lb-val', e.v.text);
          if (e.v.note) val.appendChild(el('span', 'lb-note', e.v.note));
          tr.appendChild(val);
          frag.appendChild(tr);
        });
        els.body.textContent = '';
        els.body.appendChild(frag);
      }
      els.foot.textContent = (list.length >= TOP ? 'Top ' + TOP : list.length === 1 ? '1 player' : list.length + ' on the board') +
        ' · read from the game at ' + clock(got.at);
    }).catch(function () {
      if (mine !== asked) return;
      els.panel.removeAttribute('aria-busy');
      message('The leaderboard can’t be reached right now.', true);
    });
  }

  function start() {
    root = document.getElementById('lb-app');
    if (!root) return;
    root.textContent = '';
    els.controls = el('div', 'lb-controls');
    els.panel = el('div', 'panel lb-panel');
    var head = el('div', 'lb-title');
    els.title = el('h2');
    els.period = el('span', 'lb-period');
    head.appendChild(els.title);
    head.appendChild(els.period);
    els.about = el('p', 'lb-about');
    var table = el('table', 'data-table lb-table'), thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'lb-rank-h', '#'));
    els.who = el('th', null, 'Player');
    els.col = el('th', 'lb-val-h');
    hr.appendChild(els.who);
    hr.appendChild(els.col);
    thead.appendChild(hr);
    els.body = el('tbody');
    table.appendChild(thead);
    table.appendChild(els.body);
    els.foot = el('p', 'lb-foot');
    els.panel.appendChild(head);
    els.panel.appendChild(els.about);
    els.panel.appendChild(table);
    els.panel.appendChild(els.foot);
    root.appendChild(els.controls);
    root.appendChild(els.panel);

    readHash();
    draw();
    window.addEventListener('hashchange', function () { readHash(); draw(); });

    // Left open: read again once what's on screen is older than the cache, only while the page
    // is actually being looked at.
    setInterval(function () {
      if (document.visibilityState === 'visible' && shownAt && Date.now() - shownAt >= CACHE_MS) draw();
    }, 30 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
