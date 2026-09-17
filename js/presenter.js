// Presenter page: loads the profile via the magic link, saves title/summary/link, uploads slides.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var id = (qs.get("id") || "").trim(), key = (qs.get("key") || "").trim();
  var url = SITE_CONFIG.SCRIPT_URL;
  var profile = null;

  function fail(msg) {
    $("loading").hidden = true; $("profile").hidden = true;
    $("invalid").hidden = false; $("invalidMsg").textContent = msg || "";
  }
  if (!id || !key) return fail("The link is missing its identification.");
  if (!url || url.indexOf("http") !== 0) return fail("The presenter page is not connected yet (SCRIPT_URL missing in js/config.js).");

  async function api(params, body) {
    var res = body
      ? await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ id: id, key: key }, body)) })
      : await fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(Object.assign({ id: id, key: key, t: Date.now() }, params)).toString());
    return res.json();
  }

  function render(p) {
    profile = p;
    $("loading").hidden = true; $("profile").hidden = false;
    $("pName").textContent = p.name; $("pUni").textContent = p.university; $("pId").textContent = p.id; $("pCase").textContent = p.presentation_title || "not yet given";
    $("specific_title").value = p.specific_title || p.presentation_title || ""; $("summary").value = p.summary || ""; $("slides_link").value = p.slides_link || "";
    $("maxMb").textContent = p.max_upload_mb || 20; $("deadline").textContent = p.deadline || "";
    $("updatedAt").textContent = p.updated_at ? "Last saved: " + new Date(p.updated_at).toLocaleString() : "";
    var st = $("slidesStatus");
    if (p.slides_uploaded) { st.hidden = false; st.textContent = "Uploaded: " + p.slides_uploaded; } else st.hidden = true;
    if (p.locked) {
      $("lockedBox").hidden = false;
      $("lockedBox").textContent = "Editing closed on " + p.deadline + ". Your details below are final; contact the committee for any change.";
      ["specific_title", "summary", "slides_link", "slidesFile", "uploadBtn", "saveBtn"].forEach(function (i) { $(i).disabled = true; });
    }
    updatePreview();
  }
  function updatePreview() {
    $("summaryCount").textContent = $("summary").value.length;
    $("ck1").classList.toggle("done", !!$("specific_title").value.trim());
    $("ck2").classList.toggle("done", !!$("summary").value.trim());
    $("ck3").classList.toggle("done", !!(profile && profile.slides_uploaded) || !!$("slides_link").value.trim());
  }
  ["specific_title", "summary", "slides_link"].forEach(function (i) { $(i).addEventListener("input", updatePreview); });

  function showError(msg) { var b = $("formError"); b.textContent = msg; b.hidden = false; $("saved").hidden = true; b.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function showSaved(msg) { var b = $("saved"); b.textContent = msg || "Saved. Thank you!"; b.hidden = false; $("formError").hidden = true; }

  // ---- load ----
  api({ action: "profile" }).then(function (p) { p.ok ? render(p) : fail(p.error); })
    .catch(function () { fail("Could not reach the server. Please try again in a moment."); });

  // ---- save ----
  $("presenterForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var link = $("slides_link").value.trim();
    if (link && !/^https?:\/\/\S+$/.test(link)) return showError("The slides link must start with http:// or https://.");
    var btn = $("saveBtn"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      var p = await api(null, { action: "update", specific_title: $("specific_title").value.trim(), summary: $("summary").value.trim(), slides_link: link });
      if (p.ok) { render(p); showSaved(); } else showError(p.error || "Could not save.");
    } catch (e) { showError("Could not reach the server. Please try again."); }
    finally { btn.disabled = !!(profile && profile.locked); btn.textContent = "Save changes"; }
  });

  // ---- upload ----
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
})();
