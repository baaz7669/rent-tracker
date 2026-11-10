<p align="center"><img src="public/icon.svg" width="112" alt="Rent Tracker logo"></p>

# Rent Tracker

Free, offline rent tracking software for Windows, made for landlords and caretakers.
Your data stays on your own computer: no account, no subscription, no internet needed.

Made by **Muhammad Shahbaz Arshad**, WhatsApp **+968 9095 9084** (messages only).

## Download

Go to the **Releases** page of this repository and download:

- `Rent Tracker Setup x.y.z.exe`: installer (recommended)
- `Rent Tracker x.y.z Portable.exe`: runs without installing

Windows may show a SmartScreen warning because the app is not code-signed. Click **More info → Run anyway**.

## Features

- **Automatic dues:** monthly, quarterly, 6-monthly or yearly rent, with rent changes from a chosen date
- **Collect in one tap:** cash, bank transfer, card or cheque, with part payments and undo
- **Cheques:** record a series of post-dated cheques; mark cleared or bounced (with an optional fee)
- **Tenants:** move-in and move-out with security deposit settlement; history of previous tenants
- **Extra charges:** late fees, utilities, repairs
- **Numbered receipts and tenant statements:** print, save as PDF or send on WhatsApp
- **WhatsApp reminders** with wording you can edit
- **Reports:** due vs collected, arrears by age, buildings, occupancy, expenses and net income; CSV export and A4 report
- **Needs attention today:** cheques to deposit, long arrears, leases ending, vacant units
- **Search everything** with Ctrl+K; keyboard shortcuts
- **Safe data:** saved to a file on every change, automatic daily backups (last 30), full backup and restore
- **Optional PIN lock** for shared PCs
- Currency of your choice (OMR, AED, SAR, USD, …); light and dark mode

## Where your data is kept

- Data file: `%APPDATA%\Rent Tracker\rent-tracker-db.json`
- Daily backups: `%APPDATA%\Rent Tracker\backups\` (Settings → Open daily backups folder)

## Build it yourself

Requirements: Windows 10/11 and [Node.js](https://nodejs.org) 20 or newer.

Double-click **`Build Rent Tracker.bat`**, or run:

```bash
npm install
npm run dist:win
```

The `.exe` files appear in `dist-electron\`.

Development:

```bash
npm run dev       # browser version at http://localhost:3000
npm run desktop   # build and open the Windows app
npm test          # unit tests (Vitest)
npm run smoke     # end-to-end test of the Windows app
npm run lint      # type check
```

The code also contains an optional encrypted phone sync and auto-update system
(`src/logic/sync.ts`, `src/components/CloudSync.tsx`, `supabase/setup.sql`). It is switched off in the released app.

## Also by Muhammad Shahbaz Arshad

**[PayCore Salary System](https://paycoresalarysystem.com/)**: payroll software without the monthly bill.
Offline Windows payroll for small and growing businesses in Oman and the Gulf.

## License

[MIT](LICENSE): free to use, change and share. Please keep the copyright notice.
