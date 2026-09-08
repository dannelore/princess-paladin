/* ==========================================================================
   Princess & Paladin — site navigation
   /assets/pp-nav.js

   One file that owns the whole site map. Every page gets the same sticky
   ribbon the quest log uses, with a dropdown under each folder listing its
   subpages.

   Add it to a page with one line, just before </body>:

     <script src="/assets/pp-nav.js" defer></script>

   The script does the rest:

     - If the page already has <header class="pp-ribbon">, it leaves the
       ribbon alone and only rewrites the six links inside its .pp-nav.
     - If it doesn't, it builds one, drops it in at the top of <body>, and
       moves the page's existing .pp-nav into it. Folder index pages keep
       their hero underneath.

   Optional attributes on <body> set what the ribbon says:

     data-nav-eyebrow="Castle Keep"     small gold line
     data-nav-title="Meal Planner"      the page name

   Left off, it works them out from DIRECTORY and the page's own title.

   ADDING A PAGE
   Add it to DIRECTORY below and it appears in the dropdown AND on
   /templates/links/ — that page reads this same list. Nothing else to edit.
   ========================================================================== */

window.PPNav = (function(){
  "use strict";

  /* ------------------------------------------------------------------
     THE SITE MAP
     `nav:false` keeps a folder out of the ribbon but still lists it on
     the links page. The Bach is the only one of those — it's a party
     site with its own look and it doesn't belong in the site nav.
     ------------------------------------------------------------------ */
  var DIRECTORY = [
    {
      key: 'home',
      label: 'Home',
      href: '/',
      nav: true,
      groups: [
        { name: 'Home', pages: [
          { label: 'Main Index', href: '/', note: 'Hero, nav cards, comfort show roulette' }
        ]}
      ]
    },

    {
      key: 'dannelore',
      label: 'Princess',
      href: '/dannelore/',
      nav: true,
      groups: [
        { name: 'Dannelore', pages: [
          { label: 'Dannelore Index', href: '/dannelore/', note: "Danni's landing page" }
        ]},
        { name: 'Quest Log', pages: [
          { label: 'Quest Board',   href: '/dannelore/quest-log/',             note: 'Dailies, to-dos and projects' },
          { label: 'Pets',          href: '/dannelore/quest-log/pets.html',    note: 'Companions, closet and shop' },
          { label: 'Monsters',      href: '/dannelore/quest-log/monsters.html',note: 'Shared HP bar and drop tables' },
          { label: 'Fitting Room',  href: '/dannelore/quest-log/fit.html',     note: 'Tune garment fit per stage' }
        ]},
        { name: 'Self-Care', pages: [
          { label: 'Self-Care Index', href: '/dannelore/self-care/',                     note: 'The three routines' },
          { label: 'Morning Office',  href: '/dannelore/self-care/morning-office.html',  note: 'Wake-up flowchart' },
          { label: 'Evening Office',  href: '/dannelore/self-care/evening-office.html',  note: 'Wind-down flowchart' },
          { label: 'Skincare',        href: '/dannelore/self-care/skincare.html',        note: 'Products and order' }
        ]}
      ]
    },

    {
      key: 'vmprman',
      label: 'Paladin',
      href: '/vmprman/',
      nav: true,
      groups: [
        { name: 'Paladin', pages: [
          { label: 'Paladin Index',      href: '/vmprman/',           note: "Brendon's landing page" },
          { label: 'Paladin Quest Log',  href: '/vmprman/quest-log/', note: "Brendon's board — same files, ?who=brendon" }
        ]}
      ]
    },

    {
      key: 'castle',
      label: 'Castle Keep',
      href: '/castle/',
      nav: true,
      groups: [
        { name: 'Castle Keep', pages: [
          { label: 'Castle Index',      href: '/castle/',                        note: 'Household tools' },
          { label: 'Meal Planner',      href: '/castle/meal-planner.html',       note: 'Week plan and shopping list' },
          { label: 'Recipe Book',       href: '/castle/recipe-book.html',        note: 'Everything we cook' },
          { label: 'Recipe Constructor',href: '/castle/recipe-construction.html',note: 'Build a new recipe entry' }
        ]}
      ]
    },

    {
      key: 'side-quests',
      label: 'Side Quests',
      href: '/side-quests/',
      nav: true,
      groups: [
        { name: 'Side Quests', pages: [
          { label: 'Side Quests Index', href: '/side-quests/',                  note: 'The tile grid' },
          { label: 'Bucket Quest',      href: '/side-quests/bucket-quest.html', note: 'Couples bucket list and its timeline' },
          { label: 'Couch Quest',       href: '/side-quests/couch-quest.html',  note: 'Watch list' },
          { label: 'Spooky Quest',      href: '/side-quests/spooky-quest.html', note: '1 September – 31 October' }
        ]}
      ]
    },

    {
      key: 'templates',
      label: 'Templates',
      href: '/templates/',
      nav: true,
      groups: [
        { name: 'Templates', pages: [
          { label: 'Component Reference', href: '/templates/',       note: 'Emblem markup and shared pieces' },
          { label: 'Link Directory',      href: '/templates/links/', note: 'Every page on the site, with copy buttons' }
        ]}
      ]
    },

    /* Out of the ribbon on purpose — see the note at the top of DIRECTORY. */
    {
      key: 'bach',
      label: 'The Bach',
      href: '/bach/',
      nav: false,
      groups: [
        { name: 'The Bach', pages: [
          { label: 'Bach Index',   href: '/bach/',                note: 'Party plan' },
          { label: 'Drag Show',    href: '/bach/dragshow.html',   note: '' },
          { label: 'Smarty Pants', href: '/bach/smartypants.html',note: '' }
        ]}
      ]
    }
  ];

  /* The canonical emblem. Copied verbatim from /templates/ — never redraw it. */
  var EMBLEM =
    '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M8 44 L4 20 L20 32 L32 12 L44 32 L60 20 L56 44 Z" fill="#E87CA6" stroke="#9C7440" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M8 44 H56" stroke="#9C7440" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="32" cy="10" r="3.5" fill="#9C7440"/>' +
      '<circle cx="4" cy="18" r="3" fill="#9C7440"/>' +
      '<circle cx="60" cy="18" r="3" fill="#9C7440"/>' +
    '</svg>' +
    '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g transform="translate(16,0)">' +
        '<path d="M16 2 L20 6 L20 40 L16 46 L12 40 L12 6 Z" fill="#B23A3A" stroke="#7C1F2A" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<rect x="6" y="40" width="20" height="5" rx="1.5" fill="#9C7440" stroke="#7C5B30" stroke-width="1.2"/>' +
        '<rect x="14" y="45" width="4" height="15" rx="1.5" fill="#7C1F2A"/>' +
        '<circle cx="16" cy="60" r="3.4" fill="#9C7440" stroke="#7C5B30" stroke-width="1.2"/>' +
      '</g>' +
    '</svg>';

  /* ---------------- helpers ---------------- */

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* "/castle/index.html" and "/castle/" are the same place. So are
     "/side-quests/couch-quest" and "/side-quests/couch-quest.html" — the
     side-quests index links to the extensionless form. */
  function normalize(path){
    var p = String(path || '/').split('#')[0].split('?')[0];
    p = p.replace(/index\.html$/, '');
    p = p.replace(/\.html$/, '');
    if(p.length > 1 && p.charAt(p.length-1) === '/') p = p.slice(0, -1);
    return p === '' ? '/' : p;
  }

  function here(){ return normalize(location.pathname); }

  function pagesOf(folder){
    var out = [];
    (folder.groups || []).forEach(function(g){
      (g.pages || []).forEach(function(p){ out.push(p); });
    });
    return out;
  }

  /* Which folder are we standing in? Longest matching prefix wins, so
     /dannelore/quest-log/pets.html lands on Princess, not Home. */
  function currentFolder(){
    var path = here(), best = null;
    DIRECTORY.forEach(function(f){
      var base = normalize(f.href);
      if(base === '/') return;
      if(path === base || path.indexOf(base + '/') === 0){
        if(!best || base.length > normalize(best.href).length) best = f;
      }
    });
    return best || DIRECTORY[0];
  }

  function currentPage(){
    var path = here(), found = null;
    DIRECTORY.forEach(function(f){
      pagesOf(f).forEach(function(p){
        if(normalize(p.href) === path) found = p;
      });
    });
    return found;
  }

  /* Brendon's log is the same set of files with ?who=brendon on the end.
     Losing that on a nav click would drop him into Danni's board, so it
     rides along on anything under /dannelore/quest-log/. */
  function withWho(href){
    var who = '';
    try{ who = new URLSearchParams(location.search).get('who') || ''; }catch(e){}
    if(!who || who.toLowerCase() !== 'brendon') return href;
    if(normalize(href).indexOf('/dannelore/quest-log') !== 0) return href;
    return href + (href.indexOf('?') > -1 ? '&' : '?') + 'who=brendon';
  }

  /* ---------------- the nav itself ---------------- */

  function navHTML(){
    var path = here();
    var folder = currentFolder();
    var html = '';

    DIRECTORY.filter(function(f){ return f.nav !== false; }).forEach(function(f){
      var pages = pagesOf(f);
      var isCurrent = f.key === folder.key;

      /* Home has one page and no menu worth opening. */
      var hasMenu = pages.length > 1;

      html += '<div class="pp-navitem' + (hasMenu ? ' has-menu' : '') + '">';
      html += '<a href="' + esc(withWho(f.href)) + '"' +
              (isCurrent ? ' aria-current="page"' : '') + '>' + esc(f.label) + '</a>';

      if(hasMenu){
        html += '<button class="pp-navcaret" type="button" aria-expanded="false" ' +
                'aria-label="' + esc(f.label) + ' pages"><span></span></button>';
        html += '<div class="pp-dropdown" role="group" aria-label="' + esc(f.label) + ' pages">';

        (f.groups || []).forEach(function(g, i){
          /* One group means the heading would just repeat the folder name. */
          if((f.groups || []).length > 1){
            html += '<span class="pp-dropdown-head">' + esc(g.name) + '</span>';
          } else if(i > 0){
            html += '<span class="pp-dropdown-rule"></span>';
          }
          (g.pages || []).forEach(function(p){
            var on = normalize(p.href) === path;
            html += '<a href="' + esc(withWho(p.href)) + '"' +
                    (on ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</a>';
          });
        });

        html += '</div>';
      }
      html += '</div>';
    });

    return html;
  }

  function ribbonHTML(eyebrow, title){
    return '' +
      '<div class="pp-ribbon-inner">' +
        '<a class="pp-ribbon-mark" href="/" aria-label="Princess &amp; Paladin home">' +
          '<span class="pp-emblem pp-emblem-sm" style="margin:0;">' + EMBLEM + '</span>' +
        '</a>' +
        '<div class="pp-ribbon-titles">' +
          '<span class="pp-ribbon-eyebrow">' + esc(eyebrow) + '</span>' +
          '<span class="pp-ribbon-title">' + esc(title) + '</span>' +
        '</div>' +
        '<nav class="pp-nav" aria-label="Main navigation"></nav>' +
      '</div>';
  }

  /* ---------------- dropdown behaviour ----------------
     Hover opens it on a mouse. A tap on the caret opens it on a phone,
     where hover doesn't exist. Clicking the folder name itself always
     just goes to the folder. */
  function wireDropdowns(root){
    function closeAll(except){
      root.querySelectorAll('.pp-navitem.is-open').forEach(function(el){
        if(el === except) return;
        el.classList.remove('is-open');
        var c = el.querySelector('.pp-navcaret');
        if(c) c.setAttribute('aria-expanded','false');
      });
    }

    root.addEventListener('click', function(e){
      var caret = e.target.closest('.pp-navcaret');
      if(!caret) return;
      e.preventDefault();
      var item = caret.closest('.pp-navitem');
      var open = item.classList.toggle('is-open');
      caret.setAttribute('aria-expanded', open ? 'true' : 'false');
      closeAll(item);
    });

    document.addEventListener('click', function(e){
      if(!e.target.closest || !e.target.closest('.pp-navitem')) closeAll(null);
    });

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closeAll(null);
    });
  }

  /* ---------------- mount ---------------- */

  function titleFor(){
    var body = document.body;
    var eyebrow = body.getAttribute('data-nav-eyebrow');
    var title   = body.getAttribute('data-nav-title');
    if(eyebrow && title) return { eyebrow: eyebrow, title: title };

    var folder = currentFolder();
    var page   = currentPage();
    var heroTitle = document.querySelector('.pp-title, h1.site-title, .title');

    return {
      eyebrow: eyebrow || (folder.key === 'home' ? 'Princess & Paladin' : folder.label),
      title:   title   || (page ? page.label
                                : (heroTitle ? heroTitle.textContent.trim()
                                             : document.title.split('·')[0].trim()))
    };
  }

  function mount(){
    if(!document.body) return;

    var ribbon = document.querySelector('header.pp-ribbon');

    if(!ribbon){
      /* No ribbon on this page yet — build one and move the hero's nav in. */
      var t = titleFor();
      ribbon = document.createElement('header');
      ribbon.className = 'pp-ribbon';
      ribbon.innerHTML = ribbonHTML(t.eyebrow, t.title);
      document.body.insertBefore(ribbon, document.body.firstChild);

      /* The hero keeps its emblem, title and tagline; the old pill row
         goes, because the ribbon is carrying it now. */
      document.querySelectorAll('nav.pp-nav').forEach(function(n){
        if(!ribbon.contains(n)) n.parentNode.removeChild(n);
      });
    }

    var nav = ribbon.querySelector('nav.pp-nav');
    if(!nav){
      nav = document.createElement('nav');
      nav.className = 'pp-nav';
      nav.setAttribute('aria-label','Main navigation');
      ribbon.querySelector('.pp-ribbon-inner').appendChild(nav);
    }

    nav.innerHTML = navHTML();
    wireDropdowns(nav);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return {
    DIRECTORY: DIRECTORY,
    EMBLEM: EMBLEM,
    normalize: normalize,
    pagesOf: pagesOf,
    mount: mount
  };
})();
