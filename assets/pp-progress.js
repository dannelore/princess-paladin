/* ==========================================================================
   Princess & Paladin — progress trackers
   /assets/pp-progress.js
   ========================================================================== */

window.PPProgress = (function(){
  "use strict";

  var PIP_LIMIT = 15;

  function num(el, attr, fallback){
    var v = parseFloat(el.getAttribute(attr));
    return isFinite(v) ? v : fallback;
  }

  function clamp(current, total){
    if(total <= 0) return { current: 0, total: 0, pct: 0 };
    var c = Math.max(0, Math.min(current, total));
    return { current: c, total: total, pct: c / total };
  }

  function formatValue(el, v){
    var mode = el.getAttribute("data-format") || "count";
    var pct  = Math.round(v.pct * 100);
    if(mode === "none")    return "";
    if(mode === "percent") return pct + "%";
    if(mode === "both")    return v.current + " of " + v.total + "  ·  " + pct + "%";
    return v.current + " of " + v.total;
  }

  /* ---------------- bar ---------------- */
  function drawBar(el){
    var v = clamp(num(el,"data-current",0), num(el,"data-total",0));

    if(!el.querySelector(".pp-progress-track")){
      el.innerHTML =
        '<div class="pp-progress-head">' +
          '<span class="pp-progress-label"></span>' +
          '<span class="pp-progress-value"></span>' +
        '</div>' +
        '<div class="pp-progress-track">' +
          '<div class="pp-progress-fill"></div>' +
        '</div>';
    }

    var label = el.getAttribute("data-label") || "";
    var text  = el.getAttribute("data-text");
    var value = (text != null) ? text : formatValue(el, v);

    el.querySelector(".pp-progress-label").textContent = label;
    el.querySelector(".pp-progress-value").textContent = value;
    el.querySelector(".pp-progress-head").style.display = (label || value) ? "" : "none";

    el.querySelector(".pp-progress-fill").style.width = (v.pct * 100) + "%";
    el.classList.toggle("is-complete", v.total > 0 && v.current >= v.total);

    setA11y(el, v, label);
  }

  /* ---------------- ring ---------------- */
  function drawRing(el){
    var v    = clamp(num(el,"data-current",0), num(el,"data-total",0));
    var size = num(el,"data-size",46);
    var w    = Math.max(3, Math.round(size * 0.1));
    var r    = (size - w) / 2;
    var circ = 2 * Math.PI * r;
    var done = v.total > 0 && v.current >= v.total;

    if(!el.querySelector("svg")){
      el.innerHTML =
        '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true">' +
          '<circle class="pp-ring-track" cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" stroke-width="'+w+'"></circle>' +
          '<circle class="pp-ring-fill"  cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" stroke-width="'+w+'"' +
            ' stroke-dasharray="'+circ+'" stroke-dashoffset="'+circ+'"></circle>' +
        '</svg>' +
        '<span class="pp-ring-text"></span>';
    }

    el.querySelector(".pp-ring-fill").style.strokeDashoffset = circ * (1 - v.pct);
    el.querySelector(".pp-ring-text").textContent = done ? "✓" : Math.round(v.pct * 100) + "";
    el.classList.toggle("is-complete", done);

    setA11y(el, v, el.getAttribute("data-label") || "");
  }

  /* ---------------- chips ----------------
     Each chip is an independent toggle. The watched state is stored as a
     comma-separated list of 1-based indices in data-watched (e.g. "1,3,5").
     data-current is kept in sync as the count, for bars and rings that read it.

     To opt out of per-chip toggle mode and use the old sequential behaviour,
     omit data-watched (or don't set it at all) — the chip row will fall back
     to filling sequentially from data-current as before. */
  function watchedSet(el){
    var raw = el.getAttribute("data-watched");
    if(!raw) return null;   // no set — sequential mode
    var set = {};
    raw.split(",").forEach(function(v){ var n = parseInt(v,10); if(n > 0) set[n] = true; });
    return set;
  }

  function drawChips(el){
    var total    = num(el,"data-total",0);
    var word     = el.getAttribute("data-chip-label");
    var clickable= el.getAttribute("data-clickable") === "true";
    var start    = num(el,"data-chip-start",1);
    var watched  = watchedSet(el);   // null → sequential mode
    var current  = num(el,"data-current",0);

    el.innerHTML = "";

    for(var i = 1; i <= total; i++){
      var n   = start + i - 1;
      var on  = watched ? !!watched[i] : i <= current;
      var chip = document.createElement(clickable ? "button" : "span");
      chip.className = "pp-chip" + (on ? " is-on" : "");
      chip.setAttribute("data-index", i);
      chip.textContent = word ? (word + " " + n) : String(n);
      if(clickable){
        chip.type = "button";
        chip.setAttribute("aria-pressed", on ? "true" : "false");
        chip.setAttribute("aria-label", (word || "Episode") + " " + n);
      }
      el.appendChild(chip);
    }

    var count = watched ? Object.keys(watched).length : current;
    el.classList.toggle("is-complete", total > 0 && count >= total);
    setA11y(el, { current: count, total: total, pct: total ? count/total : 0 }, el.getAttribute("data-label") || "");
  }

  /* ---------------- pips ---------------- */
  function drawPips(el){
    var v = clamp(num(el,"data-current",0), num(el,"data-total",0));
    var clickable = el.getAttribute("data-clickable") === "true";
    var shown = Math.min(v.total, PIP_LIMIT);

    el.innerHTML = "";

    for(var i = 1; i <= shown; i++){
      var pip = document.createElement(clickable ? "button" : "span");
      pip.className = "pp-pip" + (i <= v.current ? " is-on" : "");
      pip.setAttribute("data-index", i);
      if(clickable){
        pip.type = "button";
        pip.setAttribute("aria-label", i + " of " + v.total);
      }
      el.appendChild(pip);
    }

    if(v.total > PIP_LIMIT){
      var more = document.createElement("span");
      more.className = "pp-pips-more";
      more.textContent = v.current + " of " + v.total;
      el.appendChild(more);
    }

    el.classList.toggle("is-complete", v.total > 0 && v.current >= v.total);
    setA11y(el, v, el.getAttribute("data-label") || "");
  }

  /* ---------------- shared ---------------- */
  function setA11y(el, v, label){
    el.setAttribute("role","progressbar");
    el.setAttribute("aria-valuemin","0");
    el.setAttribute("aria-valuemax", String(v.total));
    el.setAttribute("aria-valuenow", String(v.current));
    el.setAttribute("aria-valuetext", (label ? label + ": " : "") + v.current + " of " + v.total);
  }

  function drawOne(el){
    if(el.classList.contains("pp-progress-ring")) return drawRing(el);
    if(el.classList.contains("pp-chips"))         return drawChips(el);
    if(el.classList.contains("pp-pips"))          return drawPips(el);
    if(el.classList.contains("pp-progress"))      return drawBar(el);
  }

  function draw(root){
    var scope = root || document;
    var all = scope.querySelectorAll(".pp-progress, .pp-progress-ring, .pp-chips, .pp-pips");
    for(var i = 0; i < all.length; i++) drawOne(all[i]);
  }

  function set(el, current, total){
    if(typeof el === "string") el = document.querySelector(el);
    if(!el) return;
    el.setAttribute("data-current", current);
    if(total != null) el.setAttribute("data-total", total);
    drawOne(el);
  }

  /* Click handler — chips toggle individually; pips stay sequential */
  document.addEventListener("click", function(e){
    if(!e.target.closest) return;
    var unit = e.target.closest(".pp-chip, .pp-pip");
    if(!unit) return;
    var box = unit.parentElement;
    if(!box || box.getAttribute("data-clickable") !== "true") return;

    var index = parseInt(unit.getAttribute("data-index"), 10);
    var total = parseFloat(box.getAttribute("data-total")) || 0;

    if(unit.classList.contains("pp-chip")){
      /* per-chip toggle mode */
      var watched = watchedSet(box) || {};
      if(watched[index]) delete watched[index];
      else               watched[index] = true;

      var keys = Object.keys(watched).map(Number).sort(function(a,b){return a-b;});
      box.setAttribute("data-watched", keys.join(","));
      box.setAttribute("data-current", keys.length);
      drawOne(box);

      box.dispatchEvent(new CustomEvent("pp-progress-change", {
        bubbles: true,
        detail: { watched: watched, current: keys.length, total: total }
      }));
    } else {
      /* pip sequential mode — unchanged */
      var current = parseFloat(box.getAttribute("data-current")) || 0;
      var next    = (index === current) ? index - 1 : index;
      set(box, next, total);
      box.dispatchEvent(new CustomEvent("pp-progress-change", {
        bubbles: true,
        detail: { current: next, total: total }
      }));
    }
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ draw(); });
  }else{
    draw();
  }

  return { draw: draw, set: set };
})();
