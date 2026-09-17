// Shared behaviour: active nav link, mobile menu, config-driven text.
(function () {
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(function (a) {
    if (a.getAttribute("href") === here) a.classList.add("active");
  });
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  if (typeof SITE_CONFIG !== "undefined") {
    document.querySelectorAll("[data-config]").forEach(function (el) {
      var v = SITE_CONFIG[el.getAttribute("data-config")];
      if (v !== undefined) el.textContent = v;
    });
    document.querySelectorAll("[data-mailto]").forEach(function (el) {
      if (!SITE_CONFIG.CONTACT_EMAIL) {            // no address yet: hide the whole contact line
        var line = el.closest("[data-contact]");
        (line || el).remove();
        return;
      }
      el.setAttribute("href", "mailto:" + SITE_CONFIG.CONTACT_EMAIL);
      if (!el.textContent.trim()) el.textContent = SITE_CONFIG.CONTACT_EMAIL;
    });
  }
})();

// ---- scroll reveal ----
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var targets = document.querySelectorAll("section:not(.hero):not(.page-title) .wrap > *, .card, table.stack tbody tr, form.reg fieldset, .checklist");
  if (reduce || !("IntersectionObserver" in window)) return;
  var seen = new Set();
  var vh = window.innerHeight || 800;
  var onScreen = 0;
  targets.forEach(function (el, i) {
    if (el.closest(".hero") || el.hidden || el.closest("[hidden]")) { el.classList.add("noanim"); return; }
    el.classList.add("reveal");
    // items already on screen at load arrive one after another instead of all at once
    var r = el.getBoundingClientRect();
    if (r.top < vh * 0.9 && r.bottom > 0) {
      seen.add(el);
      (function (node, n) { setTimeout(function () { node.classList.add("in"); }, 120 + n * 70); })(el, onScreen++);
    }
    // stagger siblings inside grids and table bodies
    var par = el.parentElement, idx = 0;
    if (par && (par.classList.contains("grid") || par.tagName === "TBODY")) idx = Array.prototype.indexOf.call(par.children, el);
    el.style.transitionDelay = (idx * (par && par.tagName === "TBODY" ? 45 : 90)) + "ms";
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && !seen.has(e.target)) { seen.add(e.target); e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
})();

// ---- countdown on the home page ----
(function () {
  var box = document.getElementById("countdown");
  if (!box || typeof SITE_CONFIG === "undefined" || !SITE_CONFIG.EVENT_DATE_ISO) return;
  var target = new Date(SITE_CONFIG.EVENT_DATE_ISO).getTime();
  var cells = { d: box.querySelector("[data-cd=d]"), h: box.querySelector("[data-cd=h]"), m: box.querySelector("[data-cd=m]"), s: box.querySelector("[data-cd=s]") };
  function set(el, v) {
    v = String(v).padStart(2, "0");
    if (el.textContent !== v) { el.textContent = v; el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); }
  }
  function update() {
    var diff = target - Date.now();
    if (diff <= 0) { box.innerHTML = '<div><b>Today</b><span>see you there</span></div>'; clearInterval(timer); return; }
    var s = Math.floor(diff / 1000);
    set(cells.d, Math.floor(s / 86400)); set(cells.h, Math.floor(s % 86400 / 3600)); set(cells.m, Math.floor(s % 3600 / 60)); set(cells.s, s % 60);
  }
  update();
  var timer = setInterval(update, 1000);
})();
