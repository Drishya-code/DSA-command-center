# DSA Command Center

**Independent DSA Learning Tracker** — a local-first React/Vite dashboard for working through the
public 402-question A2Z DSA path: daily plan, spaced revision, analytics, and streaks.

## Disclaimer

This is an independent learning tracker. External resources are linked to their respective
original platforms. This project is not affiliated with or endorsed by TakeUForward, Striver,
GeeksforGeeks, or LeetCode.

> **Installer update:** The `v0.1.0` NSIS `.exe` is superseded. Use the MSI from the latest release;
> new releases no longer publish the NSIS installer.

## Develop

```bash
npm install
npm run dev
```

## Production build (static site)

```bash
npm install
npm run build
```

The deployable website is the generated **`dist/`** folder. It uses relative asset paths, so it
works on any static host, any subpath (e.g. GitHub Pages project sites), or even opened directly.

## Windows desktop application (Tauri 2)

The desktop build wraps the same React/Vite app. Progress remains in the app's local WebView
storage on this device; there is no account, backend, or cloud sync.

### Install the app

For normal use, download the latest **DSA Command Center `.msi`** from the GitHub
Releases page and run it. The installer adds both a Start Menu entry and a desktop shortcut.
Once installed, launch DSA Command Center from that shortcut whenever you want.
Your progress is saved locally between launches. Use **Settings → Export data** to keep a backup
or move progress to another computer.

The installer may show a Windows SmartScreen warning until it is signed and builds publisher
reputation. Only download it from this project's official GitHub Releases page. Releases include a
SHA-256 checksum so you can verify the downloaded MSI. To sign releases, configure the repository
secrets `WINDOWS_CERTIFICATE` (base64-encoded code-signing `.pfx`) and
`WINDOWS_CERTIFICATE_PASSWORD`; SmartScreen can still warn about new signed files until reputation
builds.

Prerequisites for building on Windows: Node.js, Rust (stable), and the Microsoft C++ Build Tools
with the Windows 10/11 SDK. WebView2 Runtime is required to run the installed app and is normally
present on current Windows installations.

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

The Windows MSI installer is generated under `src-tauri/target/release/bundle/msi/`. Pushing a
version tag such as `v0.1.2` runs the release workflow and publishes the MSI and its SHA-256
checksum as GitHub Release assets. GitHub also provides source ZIP and tar.gz archives automatically.

- **GitHub Pages:** upload the contents of `dist/` to your repository's Pages branch/folder
  (e.g. `docs/` or `gh-pages`), or use any action that publishes `dist/`.
- No backend and no `npm run dev` are needed after deployment.
- Progress lives in browser `localStorage` (key `dsa-tracker:progress:v2`); users can export/import
  JSON from Settings.

## Structure notes

- `src/data/problems.ts` — 402-question catalog: factual metadata (title, topic, difficulty,
  platform, estimated time) plus outbound resource URLs. No third-party problem statements,
  explanations, or solution text are stored.
- `src/data/dsaRoadmap.ts` — 19-step roadmap metadata and per-topic resource links.
- Cloud sync can be layered on later behind the existing `useLocalStorage` / `ProgressContext`
  boundary without touching the UI.
