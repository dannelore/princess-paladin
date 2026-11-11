/* Alvstonia skin script. build.js copies this into the board wrapper.
   What it does:
   1. Sections: names the category you are in, so the stylesheet can darken it.
   2. Post colors: gives each post its character's color, brightened if too dark.
   3. Story dates: works out age, tags and relationships as of the thread's date.
   4. Homepage: recent scenes and the cast strip.
   5. Sidebar: folds to an icon rail, and starts folded inside a thread.

   A thread's story date goes in its topic description, e.g. "May 15, 2023". */
var Alv = (function () {
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var params = new URLSearchParams(location.search);
  var skin = params.get('skinid');
  var inThread = params.has('showtopic') || params.get('act') === 'ST';
  /* Member groups that are story roles: Main, Secondary, Tertiary, Background. */
  var ROLE_GROUPS = [6, 7, 8, 9];

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

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

  /* The Details and Relationships fields hold one entry per line:
       Family: Hawthorne
       2024-07-01 Status: Dating Archer
       2026-09-06 Status: Single
     Each label shows its latest entry on or before the thread's date.
     An entry with no date always applies. An empty value hides the label. */
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

  /* Takes a hex color and returns one light enough to read on a dark
     page, or an empty string if the text is not a hex color. */
  function readable(text) {
    var hex = (text || '').trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return '';
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    l = Math.max(l, 0.62);
    return 'hsl(' + h + ' ' + Math.round(s * 100) + '% ' + Math.round(l * 100) + '%)';
  }

  function source(mp, key) {
    return mp.querySelector('[data-src="' + key + '"]');
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
    var img = node.querySelector('img[src]');
    var url = a ? a.getAttribute('href') : img ? img.getAttribute('src') : node.textContent.trim();
    return /^https?:\/\/\S+$/i.test(url) ? url : '';
  }

  function addTag(list, label, value) {
    var tag = document.createElement('span');
    var b = document.createElement('b');
    tag.className = 'alv-tag';
    b.textContent = label;
    tag.appendChild(b);
    tag.appendChild(document.createTextNode(value));
    list.appendChild(tag);
  }

  /* The story-role class on an element, such as "mg-7", or an empty string. */
  function roleClass(node) {
    var m = (node.getAttribute('class') || '').match(/\bmg-(\d+)\b/);
    return m && ROLE_GROUPS.indexOf(+m[1]) >= 0 ? m[0] : '';
  }

  /* Runs in the page head: marks the homepage so the banner shows there,
     and sets the sidebar open or folded before the page paints. */
  function early() {
    var inner = ['act', 'showforum', 'showtopic', 'showuser', 'c', 'f', 't'].some(function (key) {
      return params.has(key) && params.get(key) !== 'idx';
    });
    if (!inner) document.documentElement.setAttribute('data-page', 'home');

    var saved = null;
    try { saved = localStorage.getItem('alv-side'); } catch (e) {}
    document.documentElement.setAttribute('data-side', inThread || saved === 'closed' ? 'closed' : 'open');
  }

  /* The fold button on the sidebar. Your choice is remembered, except
     inside a thread, where the sidebar always starts folded. */
  function side() {
    var button = document.getElementById('alv-side-toggle');
    if (!button) return;
    button.addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.getAttribute('data-side') === 'closed' ? 'open' : 'closed';
      root.setAttribute('data-side', next);
      if (!inThread) {
        try { localStorage.setItem('alv-side', next); } catch (e) {}
      }
    });
  }

  /* Tags the page with the category from the breadcrumbs, and colors the
     header bar with the logged-in character's color. */
  function section() {
    var links = document.querySelectorAll('#navstrip a');
    for (var i = 0; i < links.length; i++) {
      if (/[?&]c=\d+/.test(links[i].getAttribute('href') || '')) {
        document.documentElement.setAttribute('data-section', slug(links[i].textContent));
        break;
      }
    }
    var bar = document.getElementById('alv-bar');
    var mine = bar ? readable(bar.getAttribute('data-color')) : '';
    if (mine) bar.style.setProperty('--me', mine);
  }

  /* On the index: tags each category block with its own section. */
  function categories() {
    var links = document.querySelectorAll('.maintitle a');
    for (var i = 0; i < links.length; i++) {
      var block = links[i].closest('.tableborder');
      if (block && /[?&]c=\d+/.test(links[i].getAttribute('href') || '')) {
        block.setAttribute('data-section', slug(links[i].textContent));
      }
    }
  }

  /* Colors each post and fills in the band above it: age, tags,
     portrait, and how the character stands with the others in the scene. */
  function posts() {
    var desc = document.querySelector('.topic-desc');
    var when = desc ? parseDate(desc.textContent) : null;
    var profiles = document.querySelectorAll('.alv-mp');
    var people = [];

    for (var i = 0; i < profiles.length; i++) {
      var mp = profiles[i];
      var post = mp.closest('.alv-post') || mp;
      var tags = mp.querySelector('.alv-tags');
      var nameBox = mp.querySelector('.alv-mp-name');
      var name = nameBox ? nameBox.textContent.trim() : '';

      var color = source(mp, 'color');
      color = color ? readable(color.textContent) : '';
      if (color) post.style.setProperty('--char', color);
      people.push({ mp: mp, post: post, name: name, id: mp.getAttribute('data-uid') });

      var born = source(mp, 'born');
      born = born ? parseDate(born.textContent) : null;
      var ageDot = mp.querySelector('.alv-dot-age');
      if (born && when && ageDot && stamp(when) >= stamp(born)) {
        ageDot.querySelector('b').textContent = String(ageAt(born, when));
        ageDot.hidden = false;
      } else if (born && tags) {
        addTag(tags, 'Born', String(born.y));
      }

      if (tags) {
        factsAt(fieldLines(source(mp, 'facts')), when).forEach(function (fact) {
          addTag(tags, fact.label, fact.value);
        });
      }

      var wiki = fieldLink(source(mp, 'wiki'));
      var wikiDot = mp.querySelector('.alv-dot-wiki');
      if (wiki && wikiDot) {
        wikiDot.setAttribute('href', wiki);
        wikiDot.hidden = false;
      }

      var picture = fieldLink(source(mp, 'portrait'));
      var frame = mp.querySelector('.alv-portrait');
      if (picture && frame) {
        var img = document.createElement('img');
        img.src = picture;
        img.alt = name;
        frame.appendChild(img);
        frame.hidden = false;
      }
    }

    people.forEach(function (me) { scenePartners(me, people, when); });
  }

  /* "In this scene": each Relationships line whose name matches someone
     else posting on this page, as it stood on the thread's date. */
  function scenePartners(me, people, when) {
    var box = me.mp.querySelector('.alv-with');
    if (!box) return;
    var seen = {};
    var found = [];
    factsAt(fieldLines(source(me.mp, 'ties')), when).forEach(function (tie) {
      var key = tie.label.toLowerCase();
      for (var j = 0; j < people.length; j++) {
        var other = people[j];
        var full = other.name.toLowerCase();
        if (other.id === me.id || seen[other.id]) continue;
        if (full === key || full.split(/\s+/)[0] === key || full.indexOf(key + ' ') === 0) {
          seen[other.id] = true;
          found.push({ other: other, value: tie.value });
          break;
        }
      }
    });
    if (!found.length) return;

    var label = document.createElement('span');
    label.className = 'alv-label';
    label.textContent = 'In this scene';
    box.appendChild(label);
    found.forEach(function (item) {
      var entry = document.createElement('span');
      var who = document.createElement('a');
      entry.className = 'alv-with-item';
      who.href = 'index.php?showuser=' + item.other.id;
      who.textContent = item.other.name.split(/\s+/)[0];
      who.style.setProperty('--char', getComputedStyle(item.other.post).getPropertyValue('--char').trim());
      entry.appendChild(who);
      entry.appendChild(document.createTextNode(' ' + item.value));
      box.appendChild(entry);
    });
    box.hidden = false;
  }

  /* Cast cards on the member list: color each from its Color field. */
  function castCards(root) {
    var cards = root.querySelectorAll('.alv-castcard');
    for (var i = 0; i < cards.length; i++) {
      var color = readable(cards[i].getAttribute('data-color'));
      if (color) cards[i].style.setProperty('--char', color);
    }
    return cards;
  }

  /* Homepage: puts recent scenes and the cast side by side, then fills
     the cast strip from the member list. A member shows once they have
     a Color or a story role. */
  function home() {
    var recent = document.getElementById('recent-topics');
    var cast = document.querySelector('.alv-castbox');
    if (recent) {
      var title = recent.querySelector('.maintitle');
      if (title) title.textContent = 'Recent scenes';
    }
    if (recent && cast) {
      var foot = document.createElement('div');
      foot.className = 'alv-foot';
      recent.parentNode.insertBefore(foot, recent);
      foot.appendChild(recent);
      foot.appendChild(cast);
    }
    var list = document.getElementById('alv-cast-list');
    if (!list) return;
    fetch('index.php?act=Members&max_results=100' + (skin ? '&skinid=' + encodeURIComponent(skin) : ''))
      .then(function (response) { return response.text(); })
      .then(function (html) {
        var page = new DOMParser().parseFromString(html, 'text/html');
        var cards = castCards(page);
        var shown = 0;
        for (var i = 0; i < cards.length; i++) {
          var color = cards[i].style.getPropertyValue('--char');
          var role = roleClass(cards[i]);
          var link = cards[i].querySelector('.alv-castcard-name a');
          if ((!color && !role) || !link) continue;
          var name = link.textContent.trim();
          var img = cards[i].querySelector('.alv-castcard-av img');
          var a = document.createElement('a');
          a.href = link.getAttribute('href');
          a.title = name;
          if (role) a.className = role;
          if (color) a.style.setProperty('--char', color);
          if (img) {
            var pic = document.createElement('img');
            pic.src = img.getAttribute('src');
            pic.alt = name;
            a.appendChild(pic);
          } else {
            a.textContent = name.charAt(0);
          }
          list.appendChild(a);
          shown += 1;
        }
        if (!shown) {
          var none = document.createElement('div');
          none.className = 'alv-cast-none';
          none.textContent = 'Characters appear here once they have a role or a Color.';
          list.appendChild(none);
        }
      })
      .catch(function () {});
  }

  /* While previewing a hidden skin with ?skinid=N, keeps every link and
     form on that skin so you can click around. */
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

  return {
    early: early,
    section: section,
    run: function () { side(); categories(); posts(); castCards(document); home(); keepSkin(); },
    parseDate: parseDate,
    ageAt: ageAt,
    factsAt: factsAt,
    readable: readable
  };
})();
Alv.early();
