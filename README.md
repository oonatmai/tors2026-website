# 6th Thai Orthodontic Resident Symposium 2026 – Website & Registration

Static site (no build step) plus a Google Apps Script backend that stores registrations in a
Google Sheet and emails a confirmation. The Sheet exports straight into the certificate
generator in the parent folder.

```
website/
  index.html  programme.html  call.html  register.html  contact.html
  css/style.css        shared design (colours match the certificates)
  js/config.js         <-- the only file you must edit (Apps Script URL, deadline, contact)
  js/main.js           navigation
  js/register.js       form logic
  assets/logo.svg      placeholder logo; replace with your own (keep the file name or edit the pages)
  apps-script/Code.gs  backend, pasted into Google Apps Script
```

## 1. Set up the backend (once, ~5 minutes)

> **Current live backend (17 Sep 2026):** owned by the university account
> `6678306732@student.chula.ac.th` (Workspace: 1,500 emails/day).
> Sheet: https://docs.google.com/spreadsheets/d/1gWVdI9cQ9F14j9MoSwAZqM3yZqzxywametCPK57skhA/edit
> Script project: https://script.google.com/u/3/home/projects/1yr_ogGLZ4Ds0iu_FkUOWTVP0MmQAu-rPfZgj-imR63NDwNYS2Oh5UZsw/edit
> The earlier deployment on the personal Gmail account is no longer referenced by the site.
> Live site: https://oonatmai.github.io/tors2026-website/ (GitHub Pages from https://github.com/oonatmai/tors2026-website,
> branch main; every push redeploys within ~1 minute). `SITE_URL` in the script points there (version 3).

1. Sign in to Google with the account that should own the registrations (this account also
   sends the confirmation emails). Create a new Google Sheet, name it
   `6th Thai Orthodontic Resident Symposium 2026 Registrations`.
2. Menu **Extensions → Apps Script**. Delete the default code, paste the whole of
   `apps-script/Code.gs`, and edit the `CONFIG` block at the top (event date, reply-to address).
   Save (⌘S).
3. In the toolbar choose the function **`setup`** and press **Run**. Google asks for
   permission to edit the Sheet, send email and use Drive (for slide uploads); accept (choose *Advanced → Go to … (unsafe)* if
   the app is unverified, it is your own script). A `Registrations` tab with headers appears.
4. **Deploy → New deployment**. Type: **Web app**. Description: `v1`.
   Execute as: **Me**. Who has access: **Anyone**. Press Deploy and copy the URL ending in `/exec`.
   (“Anyone with Google account” would break the form: the browser would receive a login page.)
5. Open that URL in a browser tab. You should see `{"ok":true,...}`.
6. Paste the URL into `js/config.js` as `SCRIPT_URL`.

Later changes to `Code.gs` only go live after **Deploy → Manage deployments → ✎ → Version: New
version → Deploy**. The URL stays the same.

## 2. Test locally

```bash
cd website
python3 -m http.server 8123 --bind 0.0.0.0   # then open http://localhost:8123 (also reachable over Tailscale)
```

Fill the form once with your own email. Check: success panel with `REG-0001`, a new row in the
Sheet, and the confirmation email. Submitting the same email again must be refused.

## 3. Publish (Netlify Drop)

1. Go to https://app.netlify.com/drop and sign in (free).
2. Drag the whole `website` folder onto the page. It is live in seconds at a
   `something.netlify.app` address; rename it under *Site settings → Change site name*, e.g.
   `thai-ortho-resident-symposium-2026`.
3. To update the site later, drag the folder again onto *Deploys*.

## 4. From registrations to certificates

1. In the Sheet: **File → Download → Comma Separated Values (.csv)** of the `Registrations` tab.
2. In the project folder:
   ```bash
   conda activate symposium2026
   python generate.py ~/Downloads/PhD\ Symposium\ 2026\ Registrations\ -\ Registrations.csv
   python send.py            # dry run, then --send
   ```
   The columns `title, name, university, email, role, presentation_title` are read; the rest are ignored.
   Certificate numbers are assigned by row order (`TORS2026-0001`…). If you want the registration
   ID to be the certificate number instead, rename the Sheet column `registration_id` to
   `cert_id` before exporting.

## Presenter page (magic link)

Case presenters receive a private link in their confirmation email:
`presenter.html?id=REG-0003&key=<24-character secret>`. On that page they can add the specific title
of their case (printed on the certificate and in the programme), a short summary, and upload slides
(PDF/PowerPoint up to `MAX_UPLOAD_MB`, stored in the Drive folder `DRIVE_FOLDER_NAME` in the script
owner's Google Drive, one subfolder per presenter, only the latest file kept) or share a link.
Editing closes at `EDIT_DEADLINE` in `Code.gs`. Set `SITE_URL` in `Code.gs` to the public site
address so the link in the email is correct. To resend a lost link, copy `token` from the Sheet row
and build the URL above.

## Case presenters

There is no preset case list. A case presenter registers with an optional case title and can add or
change it on the presenter page until `EDIT_DEADLINE`. The form calls `?action=status`, which returns
the number of cases registered so far and, for each university, whether it already has a case presenter
(one per university is enforced by the backend).

## Notes and limits

- Confirmation emails use Google's MailApp quota: about 100/day on a personal Gmail account,
  1,500/day on Google Workspace. Registrations are still saved if an email fails; the
  `confirmation_sent` column shows `error: …` so you can follow up.
- Spam protection: hidden honeypot field, 3-second minimum form time, duplicate-email check,
  and a global limit of 30 submissions per 10 minutes (edit `MAX_PER_10MIN`).
- To close registration, set `REGISTRATION_OPEN: false` in `js/config.js` and re-upload.
- Everything in the sheet is personal data; keep sharing restricted to the committee.

## Updating the site

Stylesheet and script links carry a version tag (`?v=20260909b`). When you change `css/style.css` or
anything in `js/`, bump the tag in every page (search and replace) before uploading, so visitors'
browsers fetch the new files instead of a cached copy.

## Theme

Home hero background: `assets/hero-bg-b.jpg` (Chulalongkorn University Auditorium at night by Supanut Arunoprayote,
CC BY 3.0, Wikimedia Commons; credit line in the home footer). Alternative `assets/hero-bg-a.jpg` (Mahavajiravudh Building
by BunBn, CC BY-SA 4.0) – if you switch to it, change the credit line too. Both are pink duotones made with Pillow.

The site always uses the poster look (pink hero band, navy page). The prototype theme switcher was
removed on 17 Sep 2026; the unused `html[data-theme="light"]` rules stay in `css/style.css` in case a
light variant is wanted later.
