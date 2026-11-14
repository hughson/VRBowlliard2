/* Live player/room counts, read straight from the game's Firestore.
 *
 * The game already talks to Firestore over its REST API (project vr-bowlliards, no SDK), so
 * this reads the same endpoint with a plain fetch — no Firebase dependency on a static site.
 *
 * The widget HIDES ITSELF unless there is something real to show. A site advertising
 * "0 players online" is worse than one that says nothing, and this has to degrade quietly
 * when the game is quiet, when the fetch fails, and when the collection does not exist yet.
 */
(function () {
  'use strict';

  var PROJECT = 'vr-bowlliards';
  var URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
            '/databases/(default)/documents/liveRooms';

  // A room is live only while its heartbeat is recent. A client that crashes never runs its
  // delete, so trusting the stored isOpen flag would slowly fill the page with rooms that
  // closed days ago. 60s = three missed 20s heartbeats.
  var STALE_MS = 60 * 1000;
  var REFRESH_MS = 30 * 1000;

  function fieldInt(doc, key) {
    var f = doc.fields && doc.fields[key];
    if (!f) return 0;
    return parseInt(f.integerValue || f.doubleValue || 0, 10) || 0;
  }

  function fieldTime(doc, key) {
    var f = doc.fields && doc.fields[key];
    if (!f || !f.timestampValue) return 0;
    var t = Date.parse(f.timestampValue);
    return isNaN(t) ? 0 : t;
  }

  function render(rooms, players) {
    var el = document.getElementById('live-stats');
    if (!el) return;

    if (!rooms) { el.hidden = true; return; }

    el.querySelector('[data-live-rooms]').textContent = rooms;
    el.querySelector('[data-live-players]').textContent = players;
    el.querySelector('[data-live-noun]').textContent =
      rooms === 1 ? 'Room open' : 'Rooms open';
    el.hidden = false;
  }

  function refresh() {
    fetch(URL, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.documents) { render(0, 0); return; }

        var now = Date.now();
        var rooms = 0, players = 0;

        data.documents.forEach(function (doc) {
          if (now - fieldTime(doc, 'updatedAt') > STALE_MS) return;  // stale heartbeat
          var n = fieldInt(doc, 'playerCount');
          if (n <= 0) return;
          rooms += 1;
          players += n;
        });

        render(rooms, players);
      })
      .catch(function () { render(0, 0); });   // quiet on any failure
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  setInterval(refresh, REFRESH_MS);
})();
