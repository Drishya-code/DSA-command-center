# DSA Command Center

A local-first DSA learning dashboard built with React, TypeScript, Vite, and Tailwind CSS.

## Features

- Dashboard with daily execution planning
- Striver A2Z roadmap tracking
- Problem search, filtering, attempts, outcomes, notes, and mistakes
- Spaced revision scheduling
- Weak-topic and progress analytics
- Video/resource tracking
- Local-first progress persistence with `localStorage`
- Import/export of progress data
- Responsive dark/light UI
- Static deployment to GitHub Pages

## Data scope

The application includes the problem/resource dataset bundled in `src/data/`. External source links are provided for the Striver A2Z ecosystem. The app does **not** claim to contain a complete live copy of any third-party sheet.

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS v4
- date-fns
- clsx

## Run locally

Requirements: Node.js 20+ and npm.

```bash
git clone <your-repository-url>
cd dsa-command-center
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run type checking:

```bash
npm run typecheck
```

Run all checks:

```bash
npm run check
```

## GitHub Pages

This repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

1. Push the repository to GitHub with `main` as the default branch.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Push to `main`.
4. GitHub Actions will build and deploy the `dist/` folder.

The Vite base path is configured for static hosting, so the app works from a repository Pages URL.

## Project structure

```text
.
├── public/
├── src/
│   ├── components/
│   ├── context/
│   ├── data/
│   ├── hooks/
│   └── utils/
├── .github/workflows/
├── index.html
├── package.json
├── package-lock.json
├── tsconfig*.json
└── vite.config.ts
```

## Persistence

User progress is stored in the browser's `localStorage`. Clearing site data will remove local progress unless it has been exported first.

## License

Add the license you want to use before publishing if this repository will be distributed as open source.
