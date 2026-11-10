// End-to-end smoke test for the packaged desktop shell.
// Usage: npm run build && npx electron electron/smoke-test.cjs
// Runs the real main process against a throwaway data folder, drives the UI, and checks the files on disk.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rent-tracker-smoke-'));
process.env.RENT_TRACKER_DATA_DIR = dataDir;

const { app, BrowserWindow } = require('electron');
require('./main.cjs');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await wait(1500);

  check('desktop bridge exposed', await js('Boolean(window.rentAPI && window.rentAPI.isDesktop)'));
  check('node is not reachable from the page', await js("typeof require === 'undefined' && typeof process === 'undefined'"));
  check('app rendered', (await js('document.body.innerText')).includes('Rent Tracker'));

  // First run: welcome screen -> Try with sample data
  check('welcome screen shown on first run', await js(`Boolean(document.querySelector('#welcome-heading'))`));
  const clicked = await js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Try with sample data')); if (b) { b.click(); return true; } return false; })()`);
  check('sample button found', clicked);
  await wait(600);

  const dbFile = path.join(dataDir, 'rent-tracker-db.json');
  const db = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : null;
  check('database file written', db !== null, dbFile);
  check('schema version 5', db && db.schemaVersion === 5, db && db.schemaVersion);
  check(
    'each unit has a tenancy with rent history',
    db &&
      db.units.length > 0 &&
      db.units.every((u) => db.tenancies.some((t) => t.unitId === u.id && Array.isArray(t.rentHistory))),
    db && { units: db.units.length, tenancies: db.tenancies.length }
  );

  const backups = fs.existsSync(path.join(dataDir, 'backups')) ? fs.readdirSync(path.join(dataDir, 'backups')) : [];
  check('daily backup created', backups.some((f) => /^rent-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(f)), backups);

  // Data survives a reload (read back from the file, not memory)
  win.webContents.reload();
  await wait(1500);
  await js(`[...document.querySelectorAll('button')].find(b => /^\\s*Units/.test(b.innerText))?.click()`);
  await wait(400);
  const firstBuilding = db && db.units[0] && db.units[0].building;
  check('data persists after reload', firstBuilding && (await js('document.body.innerText')).includes(firstBuilding), firstBuilding);

  // Archive the first unit via the UI and confirm it is kept on disk
  const archived = await js(`(() => { const b = document.querySelector('button[aria-label^="Archive "]'); if (!b) return false; b.click(); return true; })()`);
  await wait(300);
  await js(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Archive')?.click()`);
  await wait(500);
  const afterArchive = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  check(
    'archive keeps unit and payments on disk',
    archived && afterArchive.units.length === db.units.length && afterArchive.units.some((u) => u.archivedAt),
    afterArchive.units.filter((u) => u.archivedAt).length
  );

  // ---- Phase 2 flows -------------------------------------------------
  // Helpers inside the page: set a React-controlled input and click buttons by text.
  await js(`window.__t = {
    set(el, v) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    btn(root, text) { return [...root.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(text)); },
    field(root, label) { return [...root.querySelectorAll('label')].find((l) => l.innerText.includes(label))?.querySelector('input,textarea,select'); },
    dialog() { return document.querySelector('[role=dialog]'); },
  }; true`);

  // Move out the first occupied unit
  const movedTenant = await js(`(() => { const b = document.querySelector('button[aria-label^="Move "][aria-label$=" out"]'); if (!b) return null; const t = b.getAttribute('aria-label'); b.click(); return t; })()`);
  await wait(300);
  await js(`__t.btn(__t.dialog(), 'Confirm move-out')?.click()`);
  await wait(500);
  let dbNow = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const ended = dbNow.tenancies.find((t) => t.endedAt);
  check('move-out ends the tenancy', Boolean(movedTenant && ended), movedTenant);

  // Move a new tenant into that vacant unit, with a deposit
  const movedIn = await js(`(() => { const b = __t.btn(document, 'Move in tenant'); if (!b) return false; b.click(); return true; })()`);
  await wait(300);
  await js(`(() => { const d = __t.dialog(); __t.set(__t.field(d, 'Tenant name'), 'Smoke Tenant'); __t.set(__t.field(d, 'Security deposit received'), '300'); __t.btn(d, 'Move in').click(); })()`);
  await wait(500);
  dbNow = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const newTenancy = dbNow.tenancies.find((t) => t.tenant === 'Smoke Tenant');
  check(
    'move-in creates a new tenancy on the same unit with its deposit',
    movedIn && newTenancy && ended && newTenancy.unitId === ended.unitId && newTenancy.deposit?.amount === 300,
    newTenancy && { unit: newTenancy.unitId, deposit: newTenancy.deposit }
  );

  // Record a cash payment and check it gets receipt number 1
  await js(`(() => { const cards = [...document.querySelectorAll('h3')].map((h) => h.closest('div.rounded-2xl')); const card = cards.find((c) => c && c.innerText.includes('Smoke Tenant')); __t.btn(card, 'Record payment').click(); })()`);
  await wait(300);
  await js(`__t.btn(__t.dialog(), 'Record payment')?.click()`);
  await wait(500);
  dbNow = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const firstPayment = dbNow.payments.find((p) => p.tenancyId === newTenancy?.id);
  check('payment is linked to the tenancy with receipt no. 1', firstPayment && firstPayment.receiptNo === 1 && firstPayment.method === 'cash', firstPayment && { receiptNo: firstPayment.receiptNo, method: firstPayment.method });

  // Open that receipt and render the print-only copy to PDF: it must be a single A5 page
  await js(`[...document.querySelectorAll('button')].find((b) => /^Payments$/.test(b.innerText.trim())).click()`);
  await wait(300);
  await js(`document.querySelector('button[aria-label^="Receipt "]')?.click()`);
  await wait(400);
  const hasPrintCopy = await js(`Boolean(document.querySelector('body > .print-doc-root .receipt-doc'))`);
  await js(`document.body.classList.add('print-doc', 'print-a5'); true`);
  const pdf = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
  await js(`document.body.classList.remove('print-doc', 'print-a5'); true`);
  if (process.env.SMOKE_PDF_OUT) fs.writeFileSync(process.env.SMOKE_PDF_OUT, pdf);
  const pdfText = pdf.toString('latin1');
  const box = pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
  // A5 portrait = 419.5 x 595.3 points
  check(
    'receipt prints as one A5 page',
    hasPrintCopy && box && Math.abs(Number(box[1]) - 419.5) < 2 && Math.abs(Number(box[2]) - 595.3) < 2 && pages === 1,
    box ? { width: box[1], height: box[2], pages } : 'no MediaBox'
  );

  // ---- Phase 3: Reports and expenses ---------------------------------
  // Close any open dialog, then open the Reports tab
  await js(`document.querySelectorAll('[role=dialog] button[aria-label="Close"]').forEach((b) => b.click()); true`);
  await wait(200);
  await js(`[...document.querySelectorAll('button')].find((b) => /^Reports$/.test(b.innerText.trim())).click()`);
  await wait(500);
  const charts = await js(`({ svgs: document.querySelectorAll('figure.viz-root svg').length, bars: document.querySelectorAll('figure.viz-root svg path').length, sections: [...document.querySelectorAll('h3')].map((h) => h.innerText) })`);
  check('reports tab shows both charts and all sections', charts.svgs === 2 && charts.bars > 0 && charts.sections.some((s) => s.startsWith('Who owes')) && charts.sections.includes('Expenses'), charts);

  // Add an expense through the form
  await js(`__t.btn(document, 'Add expense').click()`);
  await wait(300);
  await js(`(() => { const d = __t.dialog(); __t.set(__t.field(d, 'Amount'), '45'); __t.set(__t.field(d, 'Note'), 'Smoke repair'); __t.btn(d, 'Add expense').click(); })()`);
  await wait(500);
  dbNow = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const listed = await js(`document.body.innerText.includes('Smoke repair')`);
  check('expense is saved and listed', dbNow.expenses.length === 1 && dbNow.expenses[0].amount === 45 && listed, dbNow.expenses);
  check('activity log records the change', (dbNow.activity || []).some((a) => a.summary.includes('Smoke repair')), (dbNow.activity || []).slice(0, 2));

  // Optional screenshots for a visual check (light, then dark)
  if (process.env.SMOKE_SCREENSHOT_DIR) {
    win.setSize(1280, 1000);
    await wait(500);
    fs.writeFileSync(path.join(process.env.SMOKE_SCREENSHOT_DIR, 'reports-light.png'), (await win.webContents.capturePage()).toPNG());
    await js(`document.getElementById('theme-toggle').click()`);
    await wait(500);
    fs.writeFileSync(path.join(process.env.SMOKE_SCREENSHOT_DIR, 'reports-dark.png'), (await win.webContents.capturePage()).toPNG());
    await js(`document.getElementById('theme-toggle').click()`);
    await wait(300);
  }

  // The portfolio report prints on A4
  await js(`document.body.classList.add('print-doc', 'print-a4'); true`);
  const reportPdf = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
  await js(`document.body.classList.remove('print-doc', 'print-a4'); true`);
  if (process.env.SMOKE_SCREENSHOT_DIR) fs.writeFileSync(path.join(process.env.SMOKE_SCREENSHOT_DIR, 'report.pdf'), reportPdf);
  const reportBox = reportPdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  // A4 portrait = 595.3 x 841.9 points
  check(
    'portfolio report prints on A4',
    reportBox && Math.abs(Number(reportBox[1]) - 595.3) < 2 && Math.abs(Number(reportBox[2]) - 841.9) < 2,
    reportBox ? { width: reportBox[1], height: reportBox[2] } : 'no MediaBox'
  );

  // ---- Phase 4: keyboard, search, templates, PIN lock -----------------
  const key = (k, mods = {}) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key: k, bubbles: true, ...mods })})); true`);
  await js(`document.querySelectorAll('[role=dialog] button[aria-label="Close"]').forEach((b) => b.click()); true`);
  await wait(200);

  // Esc closes a dialog
  await js(`__t.btn(document, 'Add expense').click()`);
  await wait(300);
  const openBefore = await js(`document.querySelectorAll('[role=dialog]').length`);
  await key('Escape');
  await wait(300);
  check('Esc closes a dialog', openBefore === 1 && (await js(`document.querySelectorAll('[role=dialog]').length`)) === 0);

  // Ctrl+K finds a tenant and opens their history
  await key('k', { ctrlKey: true });
  await wait(300);
  await js(`(() => { const i = document.querySelector('[role=dialog][aria-label="Search"] input'); __t.set(i, 'golden'); })()`);
  await wait(300);
  const hits = await js(`[...document.querySelectorAll('#quick-search-results [role=option]')].map((o) => o.innerText.split('\\n')[0])`);
  await js(`document.querySelector('[role=dialog][aria-label="Search"] input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`);
  await wait(400);
  const opened = await js(`[...document.querySelectorAll('[role=dialog]')].map((d) => d.getAttribute('aria-label'))`);
  check('Ctrl+K search opens the tenant history', hits[0] === 'Golden Spices LLC' && opened.includes('Unit history'), { hits, opened });
  await key('Escape');
  await wait(300);

  // A saved template changes the real WhatsApp reminder
  await key('6', { ctrlKey: true });
  await wait(400);
  await js(`(() => { const s = document.querySelector('section[aria-labelledby="templates-heading"]'); __t.btn(s, 'Reminder: rent overdue').click(); })()`);
  await wait(300);
  await js(`(() => { const s = document.querySelector('section[aria-labelledby="templates-heading"]'); const a = s.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(a, 'SMOKE {tenant} owes {amount}'); a.dispatchEvent(new Event('input', { bubbles: true })); __t.btn(s, 'Save').click(); })()`);
  await wait(400);
  await key('1', { ctrlKey: true });
  await wait(400);
  const waText = await js(`decodeURIComponent([...document.querySelectorAll('a[href^="https://wa.me/"]')][0]?.getAttribute('href') || '')`);
  check('saved template is used in WhatsApp reminders', /text=SMOKE .+ owes OMR/.test(waText), waText.slice(0, 80));

  // PIN lock: set, lock, wrong PIN refused, right PIN unlocks; PIN never stored in plain text
  await key('6', { ctrlKey: true });
  await wait(400);
  await js(`(() => { const s = document.querySelector('section[aria-labelledby="security-heading"]'); __t.btn(s, 'Set a PIN').click(); })()`);
  await wait(300);
  const saveStarted = Date.now();
  await js(`(() => { const s = document.querySelector('section[aria-labelledby="security-heading"]'); const i = s.querySelectorAll('input[type=password]'); __t.set(i[0], '4821'); __t.set(i[1], '4821'); s.querySelector('form').requestSubmit(); })()`);
  let recovery = '';
  for (let i = 0; i < 40 && !recovery; i++) {
    await wait(100);
    recovery = await js(`document.querySelector('section[aria-labelledby="security-heading"] .font-mono')?.innerText || ''`);
  }
  const saveMs = Date.now() - saveStarted;
  dbNow = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  check('PIN is saved as a hash only, with a recovery code', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(recovery) && dbNow.settings.security?.pin?.hash && !JSON.stringify(dbNow.settings).includes('4821'), { recovery, saveMs });
  await js(`window.dispatchEvent(new Event('rent-tracker:lock')); true`);
  await wait(300);
  const lockedNoContent = await js(`Boolean(document.querySelector('#lock-heading')) && !document.querySelector('nav')`);
  const tryPin = async (pinValue) => {
    await js(`(() => { __t.set(document.querySelector('input[aria-label="PIN"]'), '${pinValue}'); document.querySelector('#lock-heading').closest('form').requestSubmit(); })()`);
    await wait(1500);
  };
  await tryPin('1111');
  const refused = await js(`Boolean(document.querySelector('#lock-heading')) && (document.querySelector('[role=alert]')?.innerText || '').includes('Wrong PIN')`);
  await tryPin('4821');
  const unlocked = await js(`Boolean(document.querySelector('nav')) && !document.querySelector('#lock-heading')`);
  check('PIN lock hides the app, refuses a wrong PIN, unlocks with the right one', lockedNoContent && refused && unlocked, { lockedNoContent, refused, unlocked });

  // About section: developer, version, WhatsApp and PayCore links (not clicked: they would open the real browser)
  await key('6', { ctrlKey: true });
  await wait(400);
  const about = await js(`(() => { const s = document.querySelector('section[aria-labelledby="about-heading"]'); if (!s) return null; s.scrollIntoView(); return { text: s.innerText, links: [...s.querySelectorAll('a')].map((a) => a.href) }; })()`);
  check('About shows developer, version and links', !!about && about.text.includes('Muhammad Shahbaz Arshad') && /Version [0-9]+[.][0-9]+[.][0-9]+/.test(about.text) && about.links.some((l) => l.startsWith('https://wa.me/96890959084')) && about.links.includes('https://paycoresalarysystem.com/'), about && about.links);
  if (process.env.SMOKE_SCREENSHOT_DIR) {
    try {
      fs.writeFileSync(path.join(process.env.SMOKE_SCREENSHOT_DIR, 'about.png'), (await win.webContents.capturePage()).toPNG());
    } catch (err) {
      console.log('(about screenshot skipped: ' + err.message + ')');
    }
  }

  // Links must not open inside the app. (Plain http is denied without handing it to the browser,
  // so this check does not pop open a real browser tab.)
  await js(`window.open('http://localhost:9/', '_blank')`);
  await wait(300);
  check('external links do not open app windows', BrowserWindow.getAllWindows().length === 1);
}

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    let failed = false;
    try {
      await run(win);
    } catch (err) {
      check('smoke run threw', false, String(err && err.stack || err));
    }
    for (const r of results) {
      if (!r.ok) failed = true;
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== undefined ? '  (' + JSON.stringify(r.detail) + ')' : ''}`);
    }
    try {
      // Chromium may still hold files in the temp folder on Windows; leftovers in %TEMP% are harmless.
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      console.log(`(temp folder left for the OS to clean: ${dataDir})`);
    }
    console.log(failed ? 'SMOKE TEST FAILED' : 'SMOKE TEST PASSED');
    app.exit(failed ? 1 : 0);
  });
});
