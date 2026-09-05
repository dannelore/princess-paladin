/* ==========================================================================
   Princess & Paladin — progress trackers
   /assets/pp-progress.js

     <script src="/assets/pp-progress.js" defer></script>

   Write the numbers in your HTML and this fills in the rest:

     <div class="pp-progress"      data-current="4" data-total="10" data-label="Season 2"></div>
     <div class="pp-progress-ring" data-current="3" data-total="8"></div>
     <div class="pp-pips"          data-current="5" data-total="10"></div>

   Everything on the page is drawn automatically on load. After that:

     PPProgress.set(el, 6, 10);     update one tracker
     PPProgress.draw();             redraw everything (after re-rendering a list)
     PPProgress.draw(container);    redraw one branch

   Clickable pips fire an event you can listen for:

     el.addEventListener("pp-progress-change", e => {
       console.log(e.detail.current, e.detail.total);
     });
   ========================================================================== */

window.PPProgress = (function(){
  "use strict";

  var PIP_LIMIT = 15;   // past this many, pips collapse to a count

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
    var head  = el.querySelector(".pp-progress-head");
    var value = formatValue(el, v);

    el.querySelector(".pp-progress-label").textContent = label;
    el.querySelector(".pp-progress-value").textContent = value;
    head.style.display = (label || value) ? "" : "none";

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
    el.querySelector(".pp-ring-text").textContent =
      done ? "✓" : Math.round(v.pct * 100) + "";
    el.classList.toggle("is-complete", done);

    setA11y(el, v, el.getAttribute("data-label") || "");
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
    el.setAttribute("aria-valuetext",
      (label ? label + ": " : "") + v.current + " of " + v.total);
  }

  function drawOne(el){
    if(el.classList.contains("pp-progress-ring")) return drawRing(el);
    if(el.classList.contains("pp-pips"))          return drawPips(el);
    if(el.classList.contains("pp-progress"))      return drawBar(el);
  }

  function draw(root){
    var scope = root || document;
    var all = scope.querySelectorAll(".pp-progress, .pp-progress-ring, .pp-pips");
    for(var i = 0; i < all.length; i++) drawOne(all[i]);
  }

  function set(el, current, total){
    if(typeof el === "string") el = document.querySelector(el);
    if(!el) return;
    el.setAttribute("data-current", current);
    if(total != null) el.setAttribute("data-total", total);
    drawOne(el);
  }

  /* Clicking a pip sets the count to that position.
     Clicking the pip that's already last turns it off, so you can go back. */
  document.addEventListener("click", function(e){
    var pip = e.target.closest ? e.target.closest(".pp-pip") : null;
    if(!pip) return;
    var box = pip.parentElement;
    if(!box || box.getAttribute("data-clickable") !== "true") return;

    var index   = parseInt(pip.getAttribute("data-index"), 10);
    var current = parseFloat(box.getAttribute("data-current")) || 0;
    var total   = parseFloat(box.getAttribute("data-total")) || 0;
    var next    = (index === current) ? index - 1 : index;

    set(box, next, total);
    box.dispatchEvent(new CustomEvent("pp-progress-change", {
      bubbles: true,
      detail: { current: next, total: total }
    }));
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ draw(); });
  }else{
    draw();
  }

  return { draw: draw, set: set };
})();
