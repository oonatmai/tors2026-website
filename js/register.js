// Registration form: validation, conditional fields, live certificate preview, submit.
(function () {
  var form = document.getElementById("regForm");
  if (!form) return;
  var loadedAt = Date.now();
  var $ = function (id) { return document.getElementById(id); };

  // ---- registration closed? ----
  if (!SITE_CONFIG.REGISTRATION_OPEN) {
    $("formWrap").hidden = true;
    $("closedBox").hidden = false;
    return;
  }

  function resolvedUniversity() {
    var u = $("university").value;
    return u === "Other" ? $("university_other").value.trim() : u;
  }
  function clean(s) { return (s || "").trim().replace(/\s+/g, " "); }
  function updatePreview() {}

  // ---- case-presenter status (which universities already have a case, and the total) ----
  function renderStatus(data) {
    var ul = $("caseList"); ul.innerHTML = "";
    if (!data) { $("caseTotal").textContent = "unavailable at the moment"; return; }
    var n = data.total || 0, all = data.universities || [];
    $("caseTotal").textContent = n === 0 ? "none yet" : n + " of " + all.length + " universities";
    all.forEach(function (u) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="case-title"></span><span class="badge"></span>';
      li.querySelector(".case-title").textContent = u.name;
      var b = li.querySelector(".badge");
      b.textContent = u.registered ? "case registered" : "open";
      b.className = "badge " + (u.registered ? "taken" : "free");
      ul.appendChild(li);
    });
  }
  async function loadStatus() {
    var url = SITE_CONFIG.SCRIPT_URL;
    if (url && url.indexOf("http") === 0) {
      try {
        var res = await fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + "action=status&t=" + Date.now());
        var data = await res.json();
        if (data.ok) { renderStatus(data); return; }
      } catch (e) { /* fall through */ }
    }
    renderStatus(null);
  }
  loadStatus();

  // ---- conditional fields ----
  $("university").addEventListener("change", function () {
    var other = this.value === "Other";
    $("otherWrap").hidden = !other;
    $("university_other").required = other;
    if (!other) $("university_other").value = "";
    updatePreview();
  });
  form.querySelectorAll("input[name=role]").forEach(function (r) {
    r.addEventListener("change", function () {
      var presenting = this.value !== "participant";
      $("titleWrap").hidden = !presenting;
      updatePreview();
    });
  });

  // ---- validation helpers ----
  function setError(id, msg) {
    var field = $(id).closest(".field");
    if (!field) return;
    field.classList.toggle("show-error", !!msg);
    $(id).classList.toggle("invalid", !!msg);
    var e = field.querySelector(".field-error");
    if (e && msg) e.textContent = msg;
  }
  function validate() {
    var ok = true;
    var req = { title: "Please choose a title.", first_name: "First name is required.", surname: "Surname is required.",
                email: "A valid email address is required.", phone: "Phone number is required.",
                university: "Please choose your university.", position: "Please choose your position." };
    Object.keys(req).forEach(function (id) {
      var el = $(id), bad = !el.value.trim();
      if (id === "email" && !bad) bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      var msg = bad ? req[id] : "";
      if (!bad && (id === "first_name" || id === "surname") && !/^[A-Za-z\u00C0-\u024F .'\-]+$/.test(el.value.trim())) {
        msg = "Please use English letters only, as it should appear on your certificate.";
      }
      setError(id, msg);
      if (msg) bad = true;
      if (bad) ok = false;
    });
    if ($("university").value === "Other") {
      var bad = !$("university_other").value.trim();
      setError("university_other", bad ? "Please type the name of your university." : "");
      if (bad) ok = false;
    }
    var role = form.querySelector("input[name=role]:checked");
    $("roleError").style.display = role ? "none" : "block";
    if (!role) ok = false;
    $("consentError").style.display = $("consent").checked ? "none" : "block";
    if (!$("consent").checked) ok = false;
    return ok;
  }

  // ---- submit ----
  function showError(msg) {
    var box = $("formError");
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    $("formError").hidden = true;
    if (!validate()) {
      var firstBad = form.querySelector(".show-error, .invalid");
      if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!SITE_CONFIG.SCRIPT_URL || SITE_CONFIG.SCRIPT_URL.indexOf("http") !== 0) {
      showError("The registration form is not connected yet (SCRIPT_URL missing in js/config.js).");
      return;
    }
    var role = form.querySelector("input[name=role]:checked").value;
    var payload = {
      title: $("title").value,
      first_name: clean($("first_name").value),
      surname: clean($("surname").value),
      email: $("email").value.trim().toLowerCase(),
      phone: $("phone").value.trim(),
      university: $("university").value,
      university_other: clean($("university_other").value),
      position: $("position").value,
      role: role,
      presentation_title: role === "participant" ? "" : $("presentation_title").value.trim(),
      dietary: clean($("dietary").value),
      consent: $("consent").checked,
      website: $("website").value,       // honeypot, must stay empty
      loaded_at: loadedAt,
    };
    var btn = $("submitBtn");
    btn.disabled = true; btn.textContent = "Submitting…";
    try {
      var res = await fetch(SITE_CONFIG.SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },   // simple request: no CORS preflight
        body: JSON.stringify(payload),
      });
      var data;
      try { data = await res.json(); } catch (e) { throw new Error("bad-json"); }
      if (data.ok) {
        $("okId").textContent = data.id;
        $("okName").textContent = data.name;
        $("okUni").textContent = data.university;
        $("okRole").textContent = { participant: "Participant", oral: "Case presenter" }[data.role] || data.role;
        var ct = data.case_title || "";
        $("okCase").textContent = ct || "to be added on your presenter page";
        $("okCase").previousElementSibling.hidden = $("okCase").hidden = data.role === "participant";
        if (data.presenter_url) { $("presenterBox").hidden = false; $("presenterLink").href = data.presenter_url; $("presenterLink").textContent = data.presenter_url; }
        $("okEmail").textContent = payload.email;
        $("formWrap").hidden = true;
        $("successBox").hidden = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        showError(data.error || "Registration failed. Please try again.");
      }
    } catch (err) {
      showError("Could not reach the registration server. Please try again in a moment" + (SITE_CONFIG.CONTACT_EMAIL ? ", or email " + SITE_CONFIG.CONTACT_EMAIL : "") + ".");
    } finally {
      btn.disabled = false; btn.textContent = "Submit registration";
    }
  });

})();
