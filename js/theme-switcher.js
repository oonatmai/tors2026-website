// TEMPORARY prototype theme switcher. To remove: delete the <script src="js/theme-switcher.js"> tag from each page.
(function () {
  var THEMES = [
    { id: "current", name: "Pink & navy · navy page (poster)", a: "#1f2b4d", b: "#d8286f" },
    { id: "light",   name: "Pink & navy · light page",         a: "#f7f7fb", b: "#d8286f" },
  ];
  var KEY = "tors-theme";
  function current() { var t = document.documentElement.getAttribute("data-theme") || "current"; return THEMES.some(function (x) { return x.id === t; }) ? t : "current"; }
  function apply(id) {
    if (id === "current") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    label.textContent = "Theme: " + THEMES.filter(function (t) { return t.id === id; })[0].name;
    panel.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.id === id); });
  }
  var css = document.createElement("style");
  css.textContent = "#tsw{position:fixed;right:16px;bottom:16px;z-index:999;font:600 13px/1.2 'Plus Jakarta Sans',system-ui,sans-serif}" +
    "#tsw .b{display:flex;align-items:center;gap:.5rem;background:#1c1c22;color:#fff;border:0;border-radius:999px;padding:.6rem .95rem;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}" +
    "#tsw .b i{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,#1f2b4d,#d8286f)}" +
    "#tsw .p{position:absolute;right:0;bottom:48px;background:#fff;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.22);padding:.5rem;min-width:200px;display:none}" +
    "#tsw.open .p{display:block}#tsw .p button{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;background:none;border:0;border-radius:9px;padding:.55rem .65rem;font:inherit;color:#222;cursor:pointer}" +
    "#tsw .p button:hover{background:#f3f1f4}#tsw .p button.on{background:#f8e7ee;font-weight:700}" +
    "#tsw .p button span{width:22px;height:14px;border-radius:4px;flex:none}#tsw .p .h{font-size:11px;color:#777;padding:.3rem .65rem .4rem;letter-spacing:.06em;text-transform:uppercase}";
  document.head.appendChild(css);
  var box = document.createElement("div"); box.id = "tsw";
  var btn = document.createElement("button"); btn.className = "b"; btn.type = "button";
  var dot = document.createElement("i"); var label = document.createElement("span"); btn.appendChild(dot); btn.appendChild(label);
  var panel = document.createElement("div"); panel.className = "p";
  var h = document.createElement("div"); h.className = "h"; h.textContent = "Pink & navy variants"; panel.appendChild(h);
  THEMES.forEach(function (t) {
    var b = document.createElement("button"); b.type = "button"; b.dataset.id = t.id;
    var sw = document.createElement("span"); sw.style.background = "linear-gradient(90deg," + t.a + " 50%," + t.b + " 50%)";
    b.appendChild(sw); b.appendChild(document.createTextNode(t.name));
    b.addEventListener("click", function () { apply(t.id); box.classList.remove("open"); });
    panel.appendChild(b);
  });
  btn.addEventListener("click", function () { box.classList.toggle("open"); });
  document.addEventListener("click", function (e) { if (!box.contains(e.target)) box.classList.remove("open"); });
  box.appendChild(btn); box.appendChild(panel); document.body.appendChild(box);
  apply(current());
})();
