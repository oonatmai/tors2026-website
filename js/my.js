// "My registration" page: loads the profile via the magic link (id + key), lets every registrant
// correct their name / dietary needs or cancel, and lets case presenters manage title, summary and slides.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var id = (qs.get("id") || "").trim(), key = (qs.get("key") || "").trim();
  var url = SITE_CONFIG.SCRIPT_URL;
  var profile = null;
  var STORE = "tors2026-my";

  // Remember the link on this device so a home-screen shortcut (which may drop the query) still works.
  try {
    if (id && key) localStorage.setItem(STORE, JSON.stringify({ id: id, key: key }));
    else { var saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved && saved.id && saved.key) { id = saved.id; key = saved.key; } }
  } catch (e) { /* storage unavailable */ }
  var CACHE = STORE + "-profile";
  function cacheProfile(p) { try { localStorage.setItem(CACHE, JSON.stringify(p)); } catch (e) {} }
  var myLink = location.origin + location.pathname + "?id=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(key);

  function fail(msg) {
    $("loading").hidden = true; $("profile").hidden = true;
    $("invalid").hidden = false; $("invalidMsg").textContent = msg || "";
  }
  if (!id || !key) return fail("The link is missing its identification.");
  if (!url || url.indexOf("http") !== 0) return fail("This page is not connected yet (SCRIPT_URL missing in js/config.js).");

  async function api(params, body) {
    var res = body
      ? await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ id: id, key: key }, body)) })
      : await fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(Object.assign({ id: id, key: key, t: Date.now() }, params)).toString());
    return res.json();
  }
  function showError(msg) { var b = $("formError"); b.textContent = msg; b.hidden = false; $("saved").hidden = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function showSaved(msg) { var b = $("saved"); b.textContent = msg || "Saved. Thank you!"; b.hidden = false; $("formError").hidden = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function setError(fid, msg) { var el = $(fid), e = el.parentElement.querySelector(".field-error"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } el.classList.toggle("invalid", !!msg); }

  // ---------------------------------------------------------------- render
  function render(p) {
    profile = p; if (p && p.ok) cacheProfile(p);
    $("loading").hidden = true; $("profile").hidden = false;
    var presenter = p.role === "oral";
    $("pId").textContent = p.id; $("pUni").textContent = p.university; $("pEmail").textContent = p.email || "";
    $("pRole").textContent = presenter ? "Case presenter" : "Participant";
    $("title").value = p.title || ""; $("first_name").value = p.first_name || ""; $("surname").value = p.surname || ""; $("dietary").value = p.dietary || "";
    $("regDeadline").textContent = p.reg_deadline || "";
    document.querySelectorAll(".regDeadlineText").forEach(function (el) { el.textContent = p.reg_deadline || ""; });
    updateCertPreview();

    var cancelled = (p.status || "").toLowerCase() === "cancelled";
    $("cancelledBox").hidden = !cancelled;
    $("attendanceCard").hidden = cancelled;
    $("cancelConfirm").hidden = true; $("cancelBtn").hidden = false;

    var regLocked = !!p.reg_locked;
    $("regLockedBox").hidden = !regLocked;
    if (regLocked) $("regLockedBox").textContent = "Changes closed on " + p.reg_deadline + ". Your details are final; contact the organisers for any change.";
    ["title", "first_name", "surname", "dietary", "saveProfileBtn", "cancelBtn", "reinstateBtn"].forEach(function (i) { $(i).disabled = regLocked; });

    // presenter section
    $("presenterForm").hidden = !presenter; $("presenterChecklist").hidden = !presenter;
    if (presenter) {
      $("pTopic").textContent = p.topic || "–"; $("pCase").textContent = p.presentation_title || "not yet given";
      $("specific_title").value = p.specific_title || p.presentation_title || ""; $("summary").value = p.summary || ""; $("slides_link").value = p.slides_link || "";
      $("maxMb").textContent = p.max_upload_mb || 20; $("deadline").textContent = p.deadline || "";
      $("updatedAt").textContent = p.updated_at ? "Last saved: " + new Date(p.updated_at).toLocaleString() : "";
      var st = $("slidesStatus");
      if (p.slides_uploaded) { st.hidden = false; st.textContent = "Uploaded: " + p.slides_uploaded; } else st.hidden = true;
      var locked = !!p.locked;
      $("lockedBox").hidden = !locked;
      if (locked) $("lockedBox").textContent = "Case editing closed on " + p.deadline + ". Your case details are final; contact the committee for any change.";
      ["specific_title", "summary", "slides_link", "slidesFile", "uploadBtn", "saveBtn"].forEach(function (i) { $(i).disabled = locked; });
      if (!locked) $("uploadBtn").disabled = !$("slidesFile").files.length;
      updateChecklist();
    }
  }
  function updateCertPreview() {
    var t = $("title").value, f = $("first_name").value.trim(), s = $("surname").value.trim();
    $("certPreview").textContent = (t ? t + " " : "") + f + (s ? " " + s : "");
  }
  ["title", "first_name", "surname"].forEach(function (i) { $(i).addEventListener("input", updateCertPreview); });
  function updateChecklist() {
    $("summaryCount").textContent = $("summary").value.length;
    $("ck1").classList.toggle("done", !!$("specific_title").value.trim());
    $("ck2").classList.toggle("done", !!$("summary").value.trim());
    $("ck3").classList.toggle("done", !!(profile && profile.slides_uploaded) || !!$("slides_link").value.trim());
  }
  ["specific_title", "summary", "slides_link"].forEach(function (i) { $(i).addEventListener("input", updateChecklist); });

  // ---------------------------------------------------------------- load (instant from cache, then refresh)
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (e) {}
  if (cached && cached.ok && cached.id === id) {
    render(cached);
    var note = document.createElement("p"); note.className = "hint refreshing"; note.id = "refreshNote"; note.textContent = "Checking for updates\u2026";
    $("profile").parentElement.insertBefore(note, $("profile"));
  }
  api({ action: "profile" }).then(function (p) {
    var n = $("refreshNote"); if (n) n.remove();
    if (p.ok) { cacheProfile(p); render(p); } else if (!cached) fail(p.error); else showError(p.error);
  }).catch(function () { var n = $("refreshNote"); if (n) n.remove(); if (!cached) fail("Could not reach the server. Please try again in a moment."); });

  // ---------------------------------------------------------------- personal details
  $("profileForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var ok = true;
    ["first_name", "surname"].forEach(function (i) {
      var v = $(i).value.trim(), msg = "";
      if (!v) msg = "Required.";
      else if (!/^[A-Za-zÀ-ɏ .'\-]+$/.test(v)) msg = "English letters only, as it should appear on your certificate.";
      setError(i, msg); if (msg) ok = false;
    });
    if (!$("title").value) { showError("Please choose a title."); return; }
    if (!ok) return;
    var btn = $("saveProfileBtn"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      var p = await api(null, { action: "profile_update", title: $("title").value, first_name: $("first_name").value.trim(), surname: $("surname").value.trim(), dietary: $("dietary").value.trim() });
      if (p.ok) { render(p); showSaved("Your details are saved. Your certificate will read: " + p.name + "."); } else showError(p.error || "Could not save.");
    } catch (e) { showError("Could not reach the server. Please try again."); }
    finally { btn.textContent = "Save my details"; btn.disabled = !!(profile && profile.reg_locked); }
  });

  // ---------------------------------------------------------------- attendance (two-step, no browser dialogs)
  $("cancelBtn").addEventListener("click", function () { $("cancelConfirm").hidden = false; $("cancelBtn").hidden = true; });
  $("cancelNo").addEventListener("click", function () { $("cancelConfirm").hidden = true; $("cancelBtn").hidden = false; });
  async function attendance(action) {
    try {
      var p = await api(null, { action: action });
      if (p.ok) { render(p); $("cancelBtn").hidden = false; showSaved(action === "cancel" ? "Your registration is cancelled. We hope to see you another time." : "Welcome back! Your registration is active again."); }
      else showError(p.error || "Could not update.");
    } catch (e) { showError("Could not reach the server. Please try again."); }
  }
  $("cancelYes").addEventListener("click", function () { attendance("cancel"); });
  $("reinstateBtn").addEventListener("click", function () { attendance("reinstate"); });

  // ---------------------------------------------------------------- presenter: save case details
  $("presenterForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var link = $("slides_link").value.trim();
    if (link && !/^https?:\/\/\S+$/.test(link)) return showError("The slides link must start with http:// or https://.");
    var btn = $("saveBtn"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      var p = await api(null, { action: "update", specific_title: $("specific_title").value.trim(), summary: $("summary").value.trim(), slides_link: link });
      if (p.ok) { render(p); showSaved("Case details saved. Thank you!"); } else showError(p.error || "Could not save.");
    } catch (e) { showError("Could not reach the server. Please try again."); }
    finally { btn.disabled = !!(profile && profile.locked); btn.textContent = "Save case details"; }
  });

  // ---------------------------------------------------------------- presenter: upload
  $("slidesFile").addEventListener("change", function () { $("uploadBtn").disabled = !this.files.length || !!(profile && profile.locked); });
  $("uploadBtn").addEventListener("click", async function () {
    var f = $("slidesFile").files[0];
    if (!f) return;
    var max = (profile && profile.max_upload_mb || 20) * 1024 * 1024;
    if (f.size > max) return showError("This file is " + (f.size / 1048576).toFixed(1) + " MB, above the " + (max / 1048576) + " MB limit. Please share a Google Drive link instead.");
    var btn = $("uploadBtn"); btn.disabled = true; btn.textContent = "Uploading…";
    var prog = $("uploadProgress"); prog.hidden = false; prog.firstElementChild.style.width = "30%";
    try {
      var b64 = await new Promise(function (resolve, reject) {
        var r = new FileReader(); r.onload = function () { resolve(String(r.result).split(",")[1]); }; r.onerror = reject; r.readAsDataURL(f);
      });
      prog.firstElementChild.style.width = "60%";
      var p = await api(null, { action: "upload", filename: f.name, mime: f.type || "application/octet-stream", data: b64 });
      prog.firstElementChild.style.width = "100%";
      if (p.ok) { render(p); showSaved("Slides uploaded. Thank you!"); $("slidesFile").value = ""; }
      else showError(p.error || "Upload failed.");
    } catch (e) { showError("Upload failed. Please try again, or share a link instead."); }
    finally { btn.textContent = "Upload slides"; btn.disabled = true; setTimeout(function () { prog.hidden = true; prog.firstElementChild.style.width = "0"; }, 800); }
  });

  // ---------------------------------------------------------------- keep this page handy
  var ua = navigator.userAgent, isIOS = /iPhone|iPad|iPod/.test(ua), isAndroid = /Android/.test(ua);
  var standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var installEvent = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvent = e; $("installBtn").hidden = false; $("installTip").textContent = ""; });
  $("installBtn").addEventListener("click", async function () {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch (e) {}
    installEvent = null; $("installBtn").hidden = true;
  });
  if (standalone) $("installTip").textContent = "This page is saved on your home screen.";
  else if (isIOS) $("installTip").innerHTML = "On iPhone or iPad: tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.";
  else if (isAndroid) $("installTip").innerHTML = "On Android: open the browser menu (⋮) and choose <strong>Add to Home screen</strong>.";
  else $("installTip").textContent = "On a computer, bookmark this page or copy the link.";
  if (navigator.share) {
    $("shareBtn").hidden = false;
    $("shareBtn").addEventListener("click", function () {
      navigator.share({ title: "TORS 2026 – My registration", text: "My registration page for the 6th Thai Orthodontic Resident Symposium 2026", url: myLink }).catch(function () {});
    });
  }
  $("copyBtn").addEventListener("click", async function () {
    var btn = $("copyBtn");
    try { await navigator.clipboard.writeText(myLink); btn.textContent = "Link copied"; }
    catch (e) { window.prompt = null; btn.textContent = "Copy from the address bar"; }
    setTimeout(function () { btn.textContent = "Copy link"; }, 2500);
  });
})();
