// The California library pages' check script (/library-check.js; owner
// decision, 23 November 2026: "Yes, live on tap"). tools/seo/build-pages.mjs
// writes this function's source into that same-origin file (the pages' CSP
// allows scripts from 'self' only, and none inline), so it is
// self-contained: no module-level references.
//
// Nothing is checked when the page loads: crawlers that run scripts never
// start a catalog search. The script only shows the "Check" buttons (hidden
// in the HTML, so a reader without scripts sees the links to the app) and
// waits for a tap. Each tap is one POST /api/v2/holdings/check with the
// library ID and the book's key, the app's own check: one live search of the
// library's catalog, nothing stored (server/data/catalog-policies.json). No
// search text is sent or put in an address. "Check all" asks one book after
// another, never two at once, and a tap during it waits its turn. The
// answer is shown in the row with the app's words: found, with the catalog's
// matching entries and its link; not found; or couldn't check, with why.
// Nothing moves: no animation, so reduced motion needs nothing more.

/** @param {any} win @param {Document} doc */
export function installLibraryChecks(win, doc) {
  var TIMEOUT_MS = 65000;
  // The catalog's matching entries shown for a found book, best match first
  // (the app's own cap: server libraryBookSearch.js MAX_MATCHES).
  var MAX_MATCHES = 10;
  var NOT_MISSING = ' This does not mean the book is missing.';
  // Reasons a second try would not change (the app offers no Try again for them).
  var LASTING = { blocked: true, unsupported: true, unrecognized: true, configuration: true };
  var REASONS = ['unconfirmed', 'timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'unsupported', 'configuration', 'cancelled', 'busy', 'details'];
  if (!doc || typeof doc.querySelectorAll !== 'function' || typeof win.fetch !== 'function' || typeof win.Promise !== 'function') return 0;

  function unknownText(reason) {
    switch (reason) {
      case 'timeout': return 'The library’s catalog did not answer in time.' + NOT_MISSING;
      case 'blocked': return 'This library does not allow outside checks of its catalog.' + NOT_MISSING;
      case 'unsupported':
      case 'unrecognized':
      case 'configuration': return 'We can’t read this library’s catalog for this book yet.' + NOT_MISSING;
      case 'busy': return 'The library’s catalog is busy with other checks. Try again in a minute.' + NOT_MISSING;
      case 'details': return 'We couldn’t get this book’s details to search the library’s catalog. Try again in a minute.' + NOT_MISSING;
      case 'unavailable': return 'The library’s catalog is not answering right now.' + NOT_MISSING;
      default: return 'We couldn’t check the library’s catalog this time.' + NOT_MISSING;
    }
  }
  function linkText(answer, kind) {
    if (answer === 'unknown' || answer === 'unconfirmed') return 'Open catalog';
    if (answer === 'not_found') return kind === 'search' ? 'Search the library’s catalog yourself' : 'Open the library’s catalog';
    return kind === 'record' ? 'See this book in the library’s catalog' : kind === 'search' ? 'Search the library’s catalog for this book' : 'Open the library’s catalog';
  }
  function webLink(value) {
    if (typeof value !== 'string' || value.length > 2000) return null;
    try {
      var url = new win.URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (error) { return null; }
  }
  function text(value, max) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : ''; }
  // The reply read as the app reads it: anything it does not know is "unknown".
  function readReply(data) {
    data = data && typeof data === 'object' ? data : {};
    var answer = data.answer === 'found' || data.answer === 'not_found' || data.answer === 'unconfirmed' ? data.answer : 'unknown';
    var view = { answer: answer, matches: [] };
    if ((answer === 'unknown' || answer === 'unconfirmed') && REASONS.indexOf(data.reason) >= 0) view.reason = data.reason;
    var catalogUrl = webLink(data.catalogUrl);
    if (catalogUrl) {
      view.catalogUrl = catalogUrl;
      if (['record', 'search', 'catalog'].indexOf(data.catalogLinkKind) >= 0) view.catalogLinkKind = data.catalogLinkKind;
    }
    if (answer === 'found' && Array.isArray(data.matches)) {
      for (var i = 0; i < data.matches.length && view.matches.length < MAX_MATCHES; i += 1) {
        var match = data.matches[i] || {}, title = text(match.title, 300);
        if (title) view.matches.push({ title: title, author: text(match.author, 300), url: webLink(match.url) });
      }
    }
    return view;
  }
  function node(tag, className, content) {
    var item = doc.createElement(tag);
    if (className) item.className = className;
    if (content != null) item.textContent = content;
    return item;
  }
  function link(href, content) {
    var item = node('a', null, content);
    item.setAttribute('href', href);
    return item;
  }
  function label(button, words, title) {
    button.textContent = words;
    button.appendChild(node('span', 'sr-only', ': ' + title));
  }
  function render(row, view) {
    var box = row.querySelector('[data-check-answer]');
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var answer = view.answer;
    if (answer === 'waiting') { box.appendChild(node('p', 'check-label', 'Waiting to check…')); return; }
    if (answer === 'checking') {
      box.appendChild(node('p', 'check-label', 'Checking the library’s catalog…'));
      box.appendChild(node('p', 'note', 'The catalog can take up to a minute to answer.'));
      return;
    }
    var tone = answer === 'found' ? 'found' : answer === 'not_found' ? 'not-found' : 'grey';
    box.appendChild(node('p', 'check-label check-' + tone, answer === 'found' ? 'Found in the catalog' : answer === 'not_found' ? 'Not found in the catalog' : 'Couldn’t check right now'));
    var words = answer === 'found' ? 'The library’s catalog has an entry with this title, searched just now. It may be another edition.'
      : answer === 'not_found' ? 'We looked for this book in the library’s catalog and did not find it. The library may still have another edition.'
        : answer === 'unconfirmed' ? 'The library’s catalog answered, but we could not tell whether it has this book.' : unknownText(view.reason);
    box.appendChild(node('p', null, words));
    if (answer === 'found' && view.matches.length) {
      box.appendChild(node('p', null, 'In the library’s catalog:'));
      var list = node('ul', 'check-matches');
      for (var i = 0; i < view.matches.length; i += 1) {
        var match = view.matches[i], item = node('li');
        var href = match.url || view.catalogUrl;
        item.appendChild(href ? link(href, match.title) : node('span', null, match.title));
        if (match.author) item.appendChild(node('span', 'check-match-author', ' · ' + match.author));
        list.appendChild(item);
      }
      box.appendChild(list);
    }
    if (view.catalogUrl) box.appendChild(link(view.catalogUrl, linkText(answer, view.catalogLinkKind) + ' ↗')).className = 'check-catalog';
  }
  // One check: the app's book-page check, a POST with no cookies.
  function ask(libraryId, bookKey) {
    var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
    var timedOut = false;
    var timer = win.setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, TIMEOUT_MS);
    var options = { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ libraryId: libraryId, bookKey: bookKey }) };
    if (controller) options.signal = controller.signal;
    return win.Promise.resolve().then(function () { return win.fetch('/api/v2/holdings/check', options); })
      .then(function (response) { return response && response.ok ? response.json() : {}; })
      .then(readReply, function () { return { answer: 'unknown', reason: timedOut ? 'timeout' : undefined, matches: [] }; })
      .then(function (view) { win.clearTimeout(timer); return view; });
  }
  function setup(section) {
    var libraryId = section.getAttribute('data-library-id');
    if (!libraryId) return false;
    var rows = Array.prototype.slice.call(section.querySelectorAll('[data-book-key]'));
    var all = section.querySelector('[data-check-all]'), progress = section.querySelector('[data-check-progress]');
    // One check at a time on this page: taps and "Check all" share one queue.
    var queue = win.Promise.resolve();
    function enqueue(row) {
      var state = row.getAttribute('data-state');
      if (state === 'waiting' || state === 'checking') return queue;
      row.setAttribute('data-state', 'waiting');
      var button = row.querySelector('[data-check]');
      if (button) button.disabled = true;
      render(row, { answer: 'waiting' });
      queue = queue.then(function () {
        row.setAttribute('data-state', 'checking');
        render(row, { answer: 'checking' });
        return ask(libraryId, row.getAttribute('data-book-key')).then(function (view) {
          row.setAttribute('data-state', 'answered');
          render(row, view);
          // The answer shown, for /google-tag.js: the answer and its reason, never the book.
          row.setAttribute('data-answer', view.answer);
          try { row.dispatchEvent(new win.CustomEvent('mybookshelf-check', { bubbles: true, detail: { answer: view.answer, reason: view.reason } })); } catch (error) { /* Not counted. */ }
          if (button) {
            label(button, 'Check again', row.getAttribute('data-title') || 'this book');
            button.disabled = false;
            button.hidden = Boolean(view.answer === 'unknown' && LASTING[view.reason]);
          }
        });
      });
      return queue;
    }
    rows.forEach(function (row) {
      var button = row.querySelector('[data-check]');
      if (!button) return;
      button.addEventListener('click', function () { enqueue(row); });
      button.hidden = false;
    });
    if (all) {
      all.addEventListener('click', function () {
        var todo = rows.filter(function (row) {
          var state = row.getAttribute('data-state'), button = row.querySelector('[data-check]');
          return state !== 'waiting' && state !== 'checking' && !(button && button.hidden);
        });
        if (!todo.length) return;
        all.disabled = true;
        var done = 0;
        if (progress) progress.textContent = 'Checking 1 of ' + todo.length + '…';
        todo.forEach(function (row) {
          enqueue(row).then(function () {
            done += 1;
            if (progress) progress.textContent = done < todo.length ? 'Checking ' + (done + 1) + ' of ' + todo.length + '…' : 'Checked ' + todo.length + (todo.length === 1 ? ' book.' : ' books.');
            if (done === todo.length) all.disabled = false;
          });
        });
      });
      all.hidden = false;
    }
    return true;
  }
  var sections = doc.querySelectorAll('[data-library-check]'), count = 0;
  for (var s = 0; s < sections.length; s += 1) if (setup(sections[s])) count += 1;
  return count;
}

/** The pages' /library-check.js: the function above, run once the page is read. */
export function libraryCheckScriptSource() {
  return '(function(){"use strict";\n' + installLibraryChecks.toString().replace(/^export /, '') + '\n'
    + 'if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { installLibraryChecks(window, document); });\n'
    + 'else installLibraryChecks(window, document);\n})();\n';
}
