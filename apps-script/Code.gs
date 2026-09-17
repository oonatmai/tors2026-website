/**
 * 6th Thai Orthodontic Resident Symposium 2026 — registration backend
 * (Google Apps Script, bound to a Google Sheet).
 *
 * Setup (see website/README.md):
 *   1. Paste this file into Extensions > Apps Script of a new Google Sheet.
 *   2. Edit CONFIG below.  3. Run setup() once and accept permissions (Sheets, Mail, Drive).
 *   4. Deploy > New deployment > Web app, execute as Me, access Anyone. Copy the /exec URL.
 *
 * Endpoints
 *   GET  ?action=status                    which universities already have a case presenter, and the total
 *   GET  ?action=profile&id=REG-0001&key=… presenter profile (magic link)
 *   POST {…registration…}                  new registration
 *   POST {action:'update', id, key, specific_title, summary, slides_link}
 *   POST {action:'upload', id, key, filename, mime, data(base64)}
 */
var CONFIG = {
  SHEET_NAME: 'Registrations',
  EVENT_NAME: '6th Thai Orthodontic Resident Symposium 2026',
  EVENT_DATE: '21 December 2026',
  ORGANISATION: 'Department of Orthodontics, Faculty of Dentistry, Chulalongkorn University',
  REPLY_TO: '',   // departmental address for replies; '' = replies go to the account running this script
  SENDER_NAME: '6th Thai Orthodontic Resident Symposium Organising Committee',
  SITE_URL: 'https://oonatmai.github.io/tors2026-website',   // public site address (used in the presenter link); change again if a custom domain is added
  EDIT_DEADLINE: '2026-11-20T23:59:59+07:00',     // presenters cannot edit title/slides after this
  DRIVE_FOLDER_NAME: 'TORS2026 presenter uploads', // created in the script owner's Drive
  MAX_UPLOAD_MB: 20,
  ID_PREFIX: 'REG-',
  MIN_FORM_SECONDS: 3,
  MAX_PER_10MIN: 30,
};

var HEADERS = ['timestamp', 'registration_id', 'title', 'name', 'first_name', 'surname', 'email', 'phone',
               'university', 'position', 'role', 'presentation_title', 'dietary', 'consent',
               'confirmation_sent', 'token', 'specific_title', 'summary', 'slides_link', 'slides_file_id',
               'slides_uploaded', 'updated_at'];
var TITLES = ['Mr.', 'Ms.', 'Dr.', 'Asst. Prof.', 'Assoc. Prof.', 'Prof.'];
var UNIVERSITIES = ['Chulalongkorn University', 'Mahidol University', 'Chiang Mai University', 'Khon Kaen University',
                    'Prince of Songkla University', 'Srinakharinwirot University', 'Naresuan University',
                    'Walailak University', 'Other'];
var POSITIONS = ['Resident – Year 1', 'Resident – Year 2', 'Resident – Year 3', 'Faculty member',
                 'PhD student', "Master's student", 'Other'];
var ROLES = ['participant', 'oral'];   // oral = case presenter (one per university)
var ALLOWED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-powerpoint', 'application/vnd.apple.keynote', 'application/zip'];

// ------------------------------------------------------------------ setup / helpers
/** Run once to see how many emails this account may send per day via MailApp. */
function checkQuota() {
  Logger.log('Remaining MailApp quota today: ' + MailApp.getRemainingDailyQuota());
}

function setup() {
  var sheet = getSheet();
  if (sheet.getLastRow() <= 1) {                       // no registrations yet: (re)write the header row
    sheet.clearContents();
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#8e2a55').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  getUploadFolder();                    // creates the Drive folder and triggers the Drive permission prompt
  MailApp.getRemainingDailyQuota();     // triggers the email permission prompt
  Logger.log('Setup complete. Remaining email quota today: ' + MailApp.getRemainingDailyQuota());
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
}
function getUploadFolder() {
  var it = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}
function col(name) { return HEADERS.indexOf(name) + 1; }   // 1-based column index
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clean(v) { return String(v || '').trim().replace(/\s+/g, ' '); }
function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function editingLocked() { return new Date() > new Date(CONFIG.EDIT_DEADLINE); }
function contactText() { return CONFIG.REPLY_TO || 'the organisers'; }

function deadlineText() {
  return Utilities.formatDate(new Date(CONFIG.EDIT_DEADLINE), 'Asia/Bangkok', 'd MMMM yyyy');
}
function newToken() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', t = '';
  for (var i = 0; i < 24; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return t;
}
function presenterUrl(id, token) {
  return CONFIG.SITE_URL.replace(/\/$/, '') + '/presenter.html?id=' + encodeURIComponent(id) + '&key=' + encodeURIComponent(token);
}

/** Case-presenter status: total registered cases and, per university, whether one is registered. */
function presenterStatus(sheet) {
  var registered = {}, total = 0, last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    var r = col('role') - 1, u = col('university') - 1;
    rows.forEach(function (row) {
      if (String(row[r]) === 'oral') { total++; registered[String(row[u]).trim()] = true; }
    });
  }
  var list = UNIVERSITIES.filter(function (n) { return n !== 'Other'; })
    .map(function (n) { return { name: n, registered: !!registered[n] }; });
  Object.keys(registered).forEach(function (n) {                 // universities typed under "Other"
    if (UNIVERSITIES.indexOf(n) < 0) list.push({ name: n, registered: true });
  });
  return { total: total, universities: list };
}

/** Row object {rowIndex, values{}} for a registration id + token, or null. */
function findPresenter(sheet, id, key) {
  var last = sheet.getLastRow();
  if (last < 2 || !id || !key) return null;
  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][col('registration_id') - 1]) === id) {
      var stored = String(rows[i][col('token') - 1]);
      if (!stored || stored.length !== String(key).length) return null;
      var diff = 0;                                             // constant-time compare
      for (var k = 0; k < stored.length; k++) diff |= stored.charCodeAt(k) ^ String(key).charCodeAt(k);
      if (diff !== 0) return null;
      var v = {};
      HEADERS.forEach(function (h, j) { v[h] = rows[i][j]; });
      return { rowIndex: i + 2, values: v };
    }
  }
  return null;
}
function profileJson(p) {
  var v = p.values;
  return {
    ok: true, id: v.registration_id, name: v.title + ' ' + v.name, university: v.university, role: v.role,
    presentation_title: v.presentation_title || '',
    specific_title: v.specific_title || '', summary: v.summary || '',
    slides_link: v.slides_link || '', slides_uploaded: v.slides_uploaded ? String(v.slides_uploaded) : '',
    updated_at: v.updated_at ? String(v.updated_at) : '',
    locked: editingLocked(), deadline: deadlineText(), max_upload_mb: CONFIG.MAX_UPLOAD_MB,
  };
}

// ------------------------------------------------------------------ GET
function doGet(e) {
  var sheet = getSheet();
  var action = e && e.parameter ? e.parameter.action : '';
  if (action === 'status') {
    var st = presenterStatus(sheet);
    return json({ ok: true, total: st.total, universities: st.universities });
  }
  if (action === 'profile') {
    var p = findPresenter(sheet, clean(e.parameter.id), clean(e.parameter.key));
    if (!p) return json({ ok: false, error: 'This link is not valid. Please use the link from your confirmation email, or contact ' + contactText() + '.' });
    if (p.values.role !== 'oral') return json({ ok: false, error: 'This page is for case presenters only.' });
    return json(profileJson(p));
  }
  return json({ ok: true, service: 'thai-ortho-resident-symposium-2026-registration', registrations: Math.max(sheet.getLastRow() - 1, 0) });
}

// ------------------------------------------------------------------ POST
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'update') return handleUpdate(data);
    if (data.action === 'upload') return handleUpload(data);
    return handleRegistration(data);
  } catch (err) {
    return json({ ok: false, error: 'Server error: ' + err.message });
  }
}

function handleRegistration(data) {
  if (data.website) return json({ ok: true, id: CONFIG.ID_PREFIX + '0000' });     // honeypot
  if (data.loaded_at && Date.now() - Number(data.loaded_at) < CONFIG.MIN_FORM_SECONDS * 1000) {
    return json({ ok: false, error: 'Please take a moment to check your details and try again.' });
  }
  var problem = validate(data);
  if (problem) return json({ ok: false, error: problem });

  var row, id, token = '';
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (rateLimited()) return json({ ok: false, error: 'The registration server is busy. Please try again in a few minutes.' });
    var sheet = getSheet();
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    if (emailExists(sheet, data.email)) {
      return json({ ok: false, code: 'duplicate',
        error: 'This email address is already registered. To change your details, contact ' + contactText() + ' quoting your Registration ID.' });
    }
    if (data.role === 'oral') {
      var uni = data.university === 'Other' ? clean(data.university_other) : data.university;
      if (universityHasPresenter(sheet, uni)) {
        return json({ ok: false, code: 'university_taken',
          error: 'A case presenter from ' + uni + ' is already registered. Each university presents one case; please register as a participant, or contact ' + contactText() + ' if this is a mistake.' });
      }
      token = newToken();
    }
    id = CONFIG.ID_PREFIX + pad(sheet.getLastRow(), 4);   // header is row 1, so first registrant = 0001
    row = buildRow(data, id, token);
    sheet.appendRow(row.values);
  } finally {
    lock.releaseLock();
  }

  var link = token ? presenterUrl(id, token) : '';
  var status = sendConfirmation(data, row, id, link);
  try { var s = getSheet(); s.getRange(s.getLastRow(), col('confirmation_sent')).setValue(status); } catch (ignore) {}

  return json({ ok: true, id: id, name: row.certName, university: row.university, role: data.role,
                case_title: row.caseTitle, presenter_url: link });
}

function validate(d) {
  var s = function (v, max) { return typeof v === 'string' && v.trim().length > 0 && v.length <= (max || 300); };
  if (TITLES.indexOf(d.title) < 0) return 'Please choose a title.';
  if (!s(d.first_name, 80)) return 'First name is required.';
  if (!s(d.surname, 80)) return 'Surname is required.';
  if (!s(d.email, 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'A valid email address is required.';
  if (!s(d.phone, 30)) return 'Phone number is required.';
  if (UNIVERSITIES.indexOf(d.university) < 0) return 'Please choose your university.';
  if (d.university === 'Other' && !s(d.university_other, 120)) return 'Please type the name of your university.';
  if (POSITIONS.indexOf(d.position) < 0) return 'Please choose your position.';
  if (ROLES.indexOf(d.role) < 0) return 'Please choose how you will take part.';
  if (d.role !== 'participant' && d.presentation_title && d.presentation_title.length > 300) return 'The case title is too long (max 300 characters).';
  if (d.dietary && d.dietary.length > 200) return 'Dietary requirements text is too long.';
  if (d.consent !== true) return 'Please confirm your details to continue.';
  return '';
}

function buildRow(d, id, token) {
  var first = clean(d.first_name), last = clean(d.surname);
  var university = d.university === 'Other' ? clean(d.university_other) : d.university;
  var name = first + ' ' + last;
  var ct = d.role === 'participant' ? '' : clean(d.presentation_title);
  var v = {};
  HEADERS.forEach(function (h) { v[h] = ''; });
  v.timestamp = new Date(); v.registration_id = id; v.title = d.title; v.name = name; v.first_name = first;
  v.surname = last; v.email = clean(d.email).toLowerCase(); v.phone = clean(d.phone); v.university = university;
  v.position = d.position; v.role = d.role; v.presentation_title = ct;
  v.dietary = clean(d.dietary); v.consent = 'yes'; v.token = token;
  return { values: HEADERS.map(function (h) { return v[h]; }), certName: d.title + ' ' + name, university: university, caseTitle: ct };
}

function emailExists(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var emails = sheet.getRange(2, col('email'), last - 1, 1).getValues();
  var target = clean(email).toLowerCase();
  for (var i = 0; i < emails.length; i++) if (String(emails[i][0]).trim().toLowerCase() === target) return true;
  return false;
}
function universityHasPresenter(sheet, university) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var target = clean(university).toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][col('role') - 1]) === 'oral' && String(rows[i][col('university') - 1]).trim().toLowerCase() === target) return true;
  }
  return false;
}
function rateLimited() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('submissions') || 0) + 1;
  cache.put('submissions', String(n), 600);
  return n > CONFIG.MAX_PER_10MIN;
}

// ------------------------------------------------------------------ presenter page actions
function handleUpdate(d) {
  var sheet = getSheet();
  var p = findPresenter(sheet, clean(d.id), clean(d.key));
  if (!p || p.values.role !== 'oral') return json({ ok: false, error: 'This link is not valid.' });
  if (editingLocked()) return json({ ok: false, locked: true, error: 'Editing closed on ' + deadlineText() + '. Please contact ' + contactText() + ' for changes.' });
  var title = clean(d.specific_title), summary = String(d.summary || '').trim(), link = clean(d.slides_link);
  if (title.length > 300) return json({ ok: false, error: 'The title is too long (max 300 characters).' });
  if (summary.length > 1500) return json({ ok: false, error: 'The summary is too long (max 1500 characters).' });
  if (link && !/^https?:\/\/\S+$/.test(link)) return json({ ok: false, error: 'The slides link must start with http:// or https://.' });
  var r = p.rowIndex;
  sheet.getRange(r, col('specific_title')).setValue(title);
  sheet.getRange(r, col('summary')).setValue(summary);
  sheet.getRange(r, col('slides_link')).setValue(link);
  if (title) sheet.getRange(r, col('presentation_title')).setValue(title);   // what the certificate prints
  sheet.getRange(r, col('updated_at')).setValue(new Date());
  return json(profileJson(findPresenter(sheet, clean(d.id), clean(d.key))));
}

function handleUpload(d) {
  var sheet = getSheet();
  var p = findPresenter(sheet, clean(d.id), clean(d.key));
  if (!p || p.values.role !== 'oral') return json({ ok: false, error: 'This link is not valid.' });
  if (editingLocked()) return json({ ok: false, locked: true, error: 'Editing closed on ' + deadlineText() + '.' });
  if (!d.data || !d.filename) return json({ ok: false, error: 'No file received.' });
  var bytes = Utilities.base64Decode(d.data);
  if (bytes.length > CONFIG.MAX_UPLOAD_MB * 1024 * 1024) return json({ ok: false, error: 'File is larger than ' + CONFIG.MAX_UPLOAD_MB + ' MB. Please share a Google Drive link instead.' });
  var mime = d.mime || 'application/octet-stream';
  if (ALLOWED_MIME.indexOf(mime) < 0 && !/\.(pdf|pptx?|key)$/i.test(d.filename)) return json({ ok: false, error: 'Please upload a PDF or PowerPoint file.' });

  var root = getUploadFolder();
  var subName = p.values.registration_id + ' ' + p.values.name;
  var it = root.getFoldersByName(subName);
  var folder = it.hasNext() ? it.next() : root.createFolder(subName);
  // remove the previous upload so only the latest version is kept
  if (p.values.slides_file_id) { try { DriveApp.getFileById(String(p.values.slides_file_id)).setTrashed(true); } catch (ignore) {} }
  var safeName = String(d.filename).replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
  var file = folder.createFile(Utilities.newBlob(bytes, mime, safeName));
  var r = p.rowIndex;
  sheet.getRange(r, col('slides_file_id')).setValue(file.getId());
  sheet.getRange(r, col('slides_uploaded')).setValue(safeName + ' (' + Math.round(bytes.length / 1024 / 1024 * 10) / 10 + ' MB, ' +
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd MMM yyyy HH:mm') + ')');
  sheet.getRange(r, col('updated_at')).setValue(new Date());
  return json(profileJson(findPresenter(sheet, clean(d.id), clean(d.key))));
}

// ------------------------------------------------------------------ email
function sendConfirmation(d, row, id, presenterLink) {
  var roleText = { participant: 'Participant', oral: 'Case presenter' }[d.role];
  var lines = [
    'Dear ' + row.certName + ',',
    '',
    'Thank you for registering for the ' + CONFIG.EVENT_NAME + ', organised by the',
    CONFIG.ORGANISATION + ', on ' + CONFIG.EVENT_DATE + '. Registration is free.',
    '',
    'Registration ID: ' + id,
    'Role: ' + roleText,
  ];
  if (d.role !== 'participant') {
    lines.push('Case title: ' + (row.caseTitle || '(to be added on your presenter page)'), '',
      'YOUR PRESENTER PAGE',
      'Use this private link to add or change the title of your case, a short summary,',
      'and to upload your slides (before ' + deadlineText() + '):',
      presenterLink,
      'Please keep this email: the link is personal and cannot be guessed.');
  }
  lines.push(
    '',
    'Your certificate will be issued with the following details:',
    '',
    '  Name:        ' + row.certName,
    '  Affiliation: ' + row.university,
    '',
    'Please check these carefully. If anything is incorrect, simply reply to this',
    'email quoting your Registration ID and we will correct it before certificates',
    'are produced.',
    '',
    'We look forward to seeing you.',
    '',
    'Kind regards,',
    CONFIG.SENDER_NAME,
    CONFIG.ORGANISATION,
    CONFIG.REPLY_TO || ''
  );
  try {
    var mail = { to: clean(d.email), name: CONFIG.SENDER_NAME,
      subject: 'Registration confirmed - ' + CONFIG.EVENT_NAME + ' (' + id + ')',
      body: lines.join('\n') };
    if (CONFIG.REPLY_TO) mail.replyTo = CONFIG.REPLY_TO;
    MailApp.sendEmail(mail);
    return 'yes';
  } catch (err) {
    return 'error: ' + err.message;
  }
}
