/* Story script for the If It Kills Me skin on Alvstonia.
   build.js copies this into the board wrapper.

   What it does:
   1. Colors: a character with a Color in their profile gets it; everyone
      else keeps their role's color from the stylesheet.
   2. Story dates: age, the labelled boxes and "in this scene" are worked
      out as of the thread's date.
   3. Sidebar: counts the characters in each role.

   A thread's story date goes in its topic description, e.g. "May 15, 2023".
   The Details and Relationships profile fields hold one entry per line:
       Family: Montgomery
       2024-07-16 Partner: Archer Hawthorne
   Each label shows its latest entry on or before the thread's date. An
   entry with no date always applies. An empty value hides the label. */
var Alv = (function () {
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var params = new URLSearchParams(location.search);
  var skin = params.get('skinid');

  function monthIndex(word) {
    return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  }

  /* Reads the first date in a piece of text. Understands "2023-05-15",
     "May 15, 2023", "15 May 2023", "May 2023" and a bare year. */
  function parseDate(text) {
    if (!text) return null;
    var m;
    if ((m = text.match(/\b(\d{4})-(\d{1,2})(?:-(\d{1,2}))?\b/))) {
      return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    }
    if ((m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/)) && monthIndex(m[2]) >= 0) {
      return { y: +m[3], m: monthIndex(m[2]), d: +m[1] };
    }
    if ((m = text.match(/\b([A-Za-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})\b/)) && monthIndex(m[1]) >= 0) {
      return { y: +m[3], m: monthIndex(m[1]), d: m[2] ? +m[2] : 1 };
    }
    if ((m = text.match(/\b(\d{4})\b/))) {
      return { y: +m[1], m: 0, d: 1 };
    }
    return null;
  }

  function stamp(date) {
    return date.y * 10000 + (date.m + 1) * 100 + date.d;
  }

  function ageAt(born, when) {
    var age = when.y - born.y;
    if (when.m < born.m || (when.m === born.m && when.d < born.d)) age -= 1;
    return age;
  }

  /* The entries that apply on a date, as [{label, value}], in the order
     the labels first appear. With no date, the latest of each. */
  function factsAt(lines, when) {
    var limit = when ? stamp(when) : Infinity;
    var latest = {};
    var order = [];
    lines.forEach(function (line) {
      var m = line.match(/^\s*(?:(\d{4}(?:-\d{1,2}){0,2})\s+)?([^:]+):\s*(.*)$/);
      if (!m) return;
      var at = m[1] ? stamp(parseDate(m[1])) : 0;
      var label = m[2].trim();
      if (at > limit) return;
      if (!(label in latest)) order.push(label);
      if (!(label in latest) || at >= latest[label].at) latest[label] = { at: at, value: m[3].trim() };
    });
    return order
      .filter(function (label) { return latest[label].value; })
      .map(function (label) { return { label: label, value: latest[label].value }; });
  }

  /* Turns a hex color into the "r, g, b" form this skin's colors use,
     lifted if needed so it reads on a dark page. Empty if not a hex color. */
  function triplet(text) {
    var hex = (text || '').trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return '';
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var floor = 0.55;
    if (l < floor) {
      /* scale toward white until the lightness reaches the floor */
      var t = (floor - l) / (1 - l);
      r += (1 - r) * t;
      g += (1 - g) * t;
      b += (1 - b) * t;
    }
    return Math.round(r * 255) + ', ' + Math.round(g * 255) + ', ' + Math.round(b * 255);
  }

  function source(root, key) {
    return root.querySelector('[data-src="' + key + '"]');
  }

  /* The lines of a profile field, as plain text. */
  function fieldLines(node) {
    if (!node) return [];
    return node.innerHTML.split(/<br\s*\/?>|\n/i).map(function (html) {
      var holder = document.createElement('div');
      holder.innerHTML = html;
      return holder.textContent;
    });
  }

  /* A web address typed into a profile field, or an empty string. */
  function fieldLink(node) {
    if (!node) return '';
    var a = node.querySelector('a[href]');
    var url = a ? a.getAttribute('href') : node.textContent.trim();
    return /^https?:\/\/\S+$/i.test(url) ? url : '';
  }

  function find(facts, label) {
    for (var i = 0; i < facts.length; i++) {
      if (facts[i].label.toLowerCase() === label.toLowerCase()) return facts[i];
    }
    return null;
  }

  /* Fills one profile block (a post's mini profile, a member list card or
     a profile page): its color, labelled boxes, wiki button and lists. */
  function fill(root, when) {
    var holder = root.getAttribute('data-alv') === 'post' ? root.closest('.new-post') || root : root;
    var color = triplet((source(root, 'color') || {}).textContent);
    if (color) holder.style.setProperty('--mg', color);

    var facts = factsAt(fieldLines(source(root, 'facts')), when);

    var slots = root.querySelectorAll('[data-slot]');
    for (var i = 0; i < slots.length; i++) {
      var labels = slots[i].getAttribute('data-slot').split('|');
      var hit = null;
      for (var j = 0; j < labels.length && !hit; j++) hit = find(facts, labels[j]);
      var extra = slots[i].getAttribute('data-also');
      extra = extra ? find(facts, extra) : null;
      var text = [hit && hit.value, extra && extra.value].filter(Boolean).join(' / ');
      var out = slots[i].querySelector('span');
      var name = slots[i].querySelector('b');
      if (hit && name) name.textContent = hit.label;
      else if (extra && name) name.textContent = extra.label;
      if (out) {
        out.textContent = text;
        out.title = text;
      }
    }

    var wiki = fieldLink(source(root, 'wiki'));
    var button = root.querySelector('.alv-wiki');
    if (wiki && button) {
      button.setAttribute('href', wiki);
      button.style.display = '';
    }

    var lists = root.querySelectorAll('[data-lines]');
    for (var k = 0; k < lists.length; k++) {
      var key = lists[k].getAttribute('data-lines');
      var rows = key === 'facts' ? facts : factsAt(fieldLines(source(root, key)), when);
      rows.forEach(function (row) {
        var line = document.createElement('div');
        var label = document.createElement('i');
        label.textContent = row.label;
        line.appendChild(label);
        line.appendChild(document.createTextNode(' ' + row.value));
        lists[k].appendChild(line);
      });
    }
  }

  /* Posts: age at the scene, and how each character stands with the
     others posting on this page as of the thread's date. */
  function posts(when) {
    var minis = document.querySelectorAll('[data-alv="post"]');
    var people = [];
    var i;

    for (i = 0; i < minis.length; i++) {
      var mini = minis[i];
      var nameBox = mini.querySelector('.alv-name');
      people.push({
        root: mini,
        post: mini.closest('.new-post') || mini,
        id: mini.getAttribute('data-uid'),
        name: nameBox ? nameBox.textContent.trim() : ''
      });

      var born = parseDate((source(mini, 'born') || {}).textContent);
      var dot = mini.querySelector('.alv-age');
      if (born && when && dot && stamp(when) >= stamp(born)) {
        dot.querySelector('span').textContent = String(ageAt(born, when));
        dot.style.display = '';
      }
    }

    people.forEach(function (me) {
      var out = me.root.querySelector('.alv-scene span');
      if (!out) return;
      var seen = {};
      var full = [];
      factsAt(fieldLines(source(me.root, 'ties')), when).forEach(function (tie) {
        var key = tie.label.toLowerCase();
        for (var j = 0; j < people.length; j++) {
          var other = people[j];
          var name = other.name.toLowerCase();
          if (other.id === me.id || seen[other.id]) continue;
          if (name === key || name.split(/\s+/)[0] === key || name.indexOf(key + ' ') === 0) {
            seen[other.id] = true;
            if (full.length) out.appendChild(document.createTextNode(' / '));
            var who = document.createElement('a');
            who.href = 'index.php?showuser=' + other.id;
            who.textContent = other.name.split(/\s+/)[0];
            who.style.color = 'rgb(' + getComputedStyle(other.post).getPropertyValue('--mg').trim() + ')';
            out.appendChild(who);
            out.appendChild(document.createTextNode(' ' + tie.value));
            full.push(other.name.split(/\s+/)[0] + ' ' + tie.value);
            break;
          }
        }
      });
      out.title = full.join(' / ');
    });
  }

  /* Names the book you are in, from the breadcrumbs, so the stylesheet
     can darken the page: "Book 1" becomes data-section="book-1". Each
     book is a forum, so this is the first forum in the breadcrumbs. */
  function section() {
    var links = document.querySelectorAll('#navstrip a');
    for (var i = 0; i < links.length; i++) {
      if (/[?&]showforum=\d+/.test(links[i].getAttribute('href') || '')) {
        var name = links[i].textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        document.documentElement.setAttribute('data-section', name);
        return;
      }
    }
  }

  /* Header bar: the logged-in character's own color on their name. */
  function me() {
    var name = document.querySelector('.wttmemname[data-color]');
    var color = name ? triplet(name.getAttribute('data-color')) : '';
    if (color) name.style.setProperty('--mg', color);
  }

  /* Homepage forum boxes: "1 scene" not "1 scenes", and a plain
     "No scenes yet" where a forum is empty. */
  function forumBoxes() {
    var counts = document.querySelectorAll('[data-one]');
    for (var i = 0; i < counts.length; i++) {
      var n = parseInt(counts[i].textContent.replace(/,/g, ''), 10) || 0;
      counts[i].textContent = n + ' ' + counts[i].getAttribute(n === 1 ? 'data-one' : 'data-many');
    }
    var threads = document.querySelectorAll('.wttindexthread');
    for (var j = 0; j < threads.length; j++) {
      if (/^-*$/.test(threads[j].textContent.trim())) {
        threads[j].textContent = 'No scenes yet';
        threads[j].parentNode.classList.add('alv-empty');
      }
    }
  }

  /* Homepage cast box: a round picture for every character with a role. */
  function cast(page) {
    var box = document.getElementById('alv-cast');
    if (!box) return;
    var cards = page.querySelectorAll('[data-alv="card"]');
    for (var i = 0; i < cards.length; i++) {
      var role = (cards[i].getAttribute('class') || '').match(/\bmg-[6-9]\b/);
      var link = cards[i].querySelector('.wttmlname a');
      if (!role || !link) continue;
      var name = link.textContent.trim();
      var img = cards[i].querySelector('.wttmlavbox img');
      var color = triplet((source(cards[i], 'color') || {}).textContent);
      var dot = document.createElement('a');
      dot.className = 'alv-castdot ' + role[0];
      dot.href = link.getAttribute('href');
      dot.title = name;
      if (color) dot.style.setProperty('--mg', color);
      if (img) {
        var pic = document.createElement('img');
        pic.src = img.getAttribute('src');
        pic.alt = name;
        dot.appendChild(pic);
      } else {
        dot.textContent = name.charAt(0);
      }
      box.appendChild(dot);
    }
  }

  /* Sidebar: how many characters are in each role, from the member list.
     The same list fills the homepage cast box. */
  function roleCounts() {
    var boxes = document.querySelectorAll('[data-role-count]');
    if (!boxes.length) return;
    fetch('index.php?act=Members&max_results=100' + (skin ? '&skinid=' + encodeURIComponent(skin) : ''))
      .then(function (response) { return response.text(); })
      .then(function (html) {
        var page = new DOMParser().parseFromString(html, 'text/html');
        for (var i = 0; i < boxes.length; i++) {
          var group = boxes[i].getAttribute('data-role-count');
          var count = page.querySelectorAll('[data-alv="card"].mg-' + group + ', .alv-castcard.mg-' + group).length;
          boxes[i].textContent = (count < 10 ? '0' : '') + count;
        }
        cast(page);
      })
      .catch(function () {});
  }

  /* While previewing this skin with ?skinid=N, keeps every link and form
     on it so you can click around. */
  function keepSkin() {
    if (!skin) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto):/i.test(href) || /admin\.php/.test(href)) continue;
      try {
        var url = new URL(href, location.href);
        if (url.host !== location.host || url.searchParams.has('skinid')) continue;
        url.searchParams.set('skinid', skin);
        links[i].setAttribute('href', url.href);
      } catch (e) {}
    }
    var forms = document.querySelectorAll('form');
    for (var j = 0; j < forms.length; j++) {
      if (forms[j].querySelector('input[name="skinid"]')) continue;
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'skinid';
      input.value = skin;
      forms[j].appendChild(input);
    }
  }

  function run() {
    section();
    var desc = document.querySelector('.topic-desc');
    var when = desc ? parseDate(desc.textContent) : null;
    var blocks = document.querySelectorAll('[data-alv]');
    for (var i = 0; i < blocks.length; i++) fill(blocks[i], when);
    posts(when);
    forumBoxes();
    me();
    roleCounts();
    keepSkin();
  }

  return { run: run, parseDate: parseDate, ageAt: ageAt, factsAt: factsAt, triplet: triplet };
})();
