// Electron main process for Rent Tracker.
// Data lives in a single JSON file in the user's app-data folder, written atomically,
// with one automatic backup per day (the newest 30 are kept).

const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DAILY_BACKUPS_TO_KEEP = 30;
const DB_FILENAME = 'rent-tracker-db.json';

// Lets tests (and power users) point the app at a different data folder.
if (process.env.RENT_TRACKER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.RENT_TRACKER_DATA_DIR));
}

function dataDir() {
  return app.getPath('userData');
}
function dbPath() {
  return path.join(dataDir(), DB_FILENAME);
}
function backupDir() {
  return path.join(dataDir(), 'backups');
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readDb() {
  try {
    return fs.readFileSync(dbPath(), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Rejects anything that is not a plausible Rent Tracker database before it can replace the file. */
function assertLooksLikeDb(json) {
  const parsed = JSON.parse(json);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.schemaVersion !== 'number' ||
    !Array.isArray(parsed.units) ||
    !Array.isArray(parsed.payments)
  ) {
    throw new Error('Refusing to save: data is not a Rent Tracker database');
  }
}

function assertLooksLikeBackup(json) {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.app !== 'rent-tracker' || !Array.isArray(parsed.units)) {
    throw new Error('Refusing to save: not a Rent Tracker backup');
  }
}

function writeDbAtomic(json) {
  assertLooksLikeDb(json);
  fs.mkdirSync(dataDir(), { recursive: true });
  const target = dbPath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, target);
}

/** Copies the current database into backups/ once per day and prunes old copies. */
function ensureDailyBackup() {
  if (!fs.existsSync(dbPath())) return;
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `rent-tracker-${todayStamp()}.json`);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(dbPath(), target);
  }
  const daily = fs
    .readdirSync(dir)
    .filter((f) => /^rent-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const old of daily.slice(0, Math.max(0, daily.length - DAILY_BACKUPS_TO_KEEP))) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
}

let mainWindow = null;

function isOwnPage(frameUrl) {
  if (!frameUrl) return false;
  if (process.env.VITE_DEV_SERVER_URL) return frameUrl.startsWith(process.env.VITE_DEV_SERVER_URL);
  return frameUrl.startsWith('file://');
}

function guard(event) {
  return isOwnPage(event.senderFrame && event.senderFrame.url);
}

function registerIpc() {
  ipcMain.on('db:read', (event) => {
    if (!guard(event)) {
      event.returnValue = null;
      return;
    }
    try {
      event.returnValue = readDb();
    } catch (err) {
      console.error('Failed to read database:', err);
      event.returnValue = null;
    }
  });

  ipcMain.on('db:write', (event, json) => {
    if (!guard(event) || typeof json !== 'string') {
      event.returnValue = false;
      return;
    }
    try {
      writeDbAtomic(json);
      ensureDailyBackup();
      event.returnValue = true;
    } catch (err) {
      console.error('Failed to write database:', err);
      event.returnValue = false;
    }
  });

  // "Backup now": let the user choose where to save the JSON file (defaults to Documents).
  ipcMain.handle('backup:save', async (event, payload) => {
    if (!guard(event) || !payload || typeof payload.content !== 'string') return false;
    const safeName = String(payload.filename || 'rent-tracker-backup.json').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Rent Tracker backup',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: [{ name: 'Rent Tracker backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, payload.content, 'utf8');
    return true;
  });

  // Safety copies before restore/erase: written straight into the backups folder, no dialog to cancel.
  ipcMain.handle('backup:save-silent', async (event, payload) => {
    if (!guard(event) || !payload || typeof payload.content !== 'string') return false;
    try {
      assertLooksLikeBackup(payload.content);
      const safeName = String(payload.filename || 'rent-tracker-backup.json').replace(/[\\/:*?"<>|]/g, '_');
      fs.mkdirSync(backupDir(), { recursive: true });
      fs.writeFileSync(path.join(backupDir(), safeName), payload.content, 'utf8');
      return true;
    } catch (err) {
      console.error('Safety backup failed:', err);
      return false;
    }
  });

  // Receipts/statements: print the page (in print mode) to PDF, then ask where to save it.
  ipcMain.handle('pdf:save', async (event, opts) => {
    if (!guard(event) || !mainWindow) return false;
    const pageSize = opts && opts.pageSize === 'A5' ? 'A5' : 'A4';
    const safeName = String((opts && opts.filename) || 'document.pdf').replace(/[\\/:*?"<>|]/g, '_');
    try {
      const pdf = await event.sender.printToPDF({ pageSize, printBackground: true, preferCSSPageSize: true });
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save PDF',
        defaultPath: path.join(app.getPath('documents'), safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return false;
      fs.writeFileSync(result.filePath, pdf);
      return true;
    } catch (err) {
      console.error('PDF export failed:', err);
      return false;
    }
  });

  // Summary notification (opt-in in Settings). Plain text only, length-limited.
  ipcMain.handle('app:notify', (event, payload) => {
    if (!guard(event) || !Notification.isSupported() || !payload) return false;
    const title = String(payload.title || 'Rent Tracker').slice(0, 80);
    const body = String(payload.body || '').slice(0, 300);
    const note = new Notification({ title, body });
    note.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    note.show();
    return true;
  });

  ipcMain.handle('backup:open-folder', async (event) => {
    if (!guard(event)) return false;
    fs.mkdirSync(backupDir(), { recursive: true });
    const error = await shell.openPath(backupDir());
    return error === '';
  });

  ipcMain.handle('app:info', (event) => {
    if (!guard(event)) return null;
    return { dataFile: dbPath(), backupFolder: backupDir(), version: app.getVersion() };
  });

  ipcMain.handle('update:state', (event) => (guard(event) ? updateState : null));
  ipcMain.handle('update:check', async (event) => {
    if (!guard(event)) return updateState;
    await checkForUpdates();
    return updateState;
  });
  ipcMain.handle('update:install', (event) => {
    if (!guard(event) || updateState.status !== 'downloaded') return false;
    // Data is saved on every change, so quitting to install loses nothing.
    setImmediate(() => getUpdater().quitAndInstall(false, true));
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Auto-updates (GitHub Releases, installed app only)                  */
/* ------------------------------------------------------------------ */

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PLACEHOLDER_OWNER = 'YOUR_GITHUB_USERNAME';
let updater = null;
let updateState = { status: 'idle', version: null, percent: 0, message: '' };

function updatesUnavailableReason() {
  if (!app.isPackaged) return 'Updates work in the installed app only.';
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'The portable version cannot update itself. Download the new version from the releases page.';
  const publish = (require('../package.json').build || {}).publish || [];
  if (!publish[0] || !publish[0].owner || publish[0].owner === PLACEHOLDER_OWNER) {
    return 'Updates are not set up yet (no GitHub releases address).';
  }
  return '';
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', updateState);
}

function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => setUpdateState({ status: 'checking', message: '' }));
  updater.on('update-available', (info) => setUpdateState({ status: 'downloading', version: info.version, percent: 0 }));
  updater.on('update-not-available', () => setUpdateState({ status: 'up-to-date', message: '' }));
  updater.on('download-progress', (p) => setUpdateState({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => setUpdateState({ status: 'downloaded', version: info.version, percent: 100 }));
  updater.on('error', (err) => setUpdateState({ status: 'error', message: String((err && err.message) || err).slice(0, 200) }));
  return updater;
}

async function checkForUpdates() {
  const reason = updatesUnavailableReason();
  if (reason) {
    setUpdateState({ status: 'unavailable', message: reason });
    return;
  }
  try {
    await getUpdater().checkForUpdates();
  } catch (err) {
    setUpdateState({ status: 'error', message: String((err && err.message) || err).slice(0, 200) });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    title: 'Rent Tracker',
    backgroundColor: '#EDF1F4',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'dist', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // WhatsApp and other web links open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isOwnPage(url)) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Only one copy may run, so two windows can never overwrite each other's data.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Windows needs an app id for notifications to show the right name.
  app.setAppUserModelId('com.renttracker.desktop');

  app.whenReady().then(() => {
    registerIpc();
    // Check for updates shortly after start, then every few hours (installed app only).
    setTimeout(checkForUpdates, 10_000);
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
    try {
      ensureDailyBackup();
    } catch (err) {
      console.error('Startup backup failed:', err);
    }
    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
