# Planner App

An annual planner with an embedded AI assistant. The app is two pieces:

- **Frontend**: a Vite + React app (everything in `src/`). All planner state (days, leave types, budgets, etc.) is stored in the browser's `localStorage`. There is no database, so data is per-browser and per-device, and is not shared between users.
- **Backend**: a small Express server (`server.js`) exposing `POST /api/chat`. It relays messages to Claude (via `@anthropic-ai/sdk`), streams the response back as SSE, and returns proposed day updates that the frontend applies to `localStorage`. The backend is stateless.

The frontend reaches the backend via `VITE_API_URL` (see `src/components/ChatPanel.jsx`), falling back to `http://localhost:3001` when that variable is unset.

## Local development

The app runs as two processes. Open two terminals in the project root:

```bash
npm run server   # backend  -> http://localhost:3001  (loads ANTHROPIC_API_KEY from .env)
npm run dev      # frontend -> http://localhost:5173
```

Then open http://localhost:5173. With `VITE_API_URL` unset locally, the frontend automatically talks to the local backend on port 3001.

Requirements:
- A `.env` file in the project root containing `ANTHROPIC_API_KEY=...` (gitignored). The `server` script loads it via Node's `--env-file`.
- Node 20.6+ (for `--env-file` support).

## Deployment

- **Backend** runs on Railway (`npm start` -> `node server.js`). It reads `ANTHROPIC_API_KEY` from Railway Variables, listens on `process.env.PORT`, and the Railway public domain must target that same port.
- **Frontend** runs on Vercel as a static build. It requires `VITE_API_URL` (set to the Railway backend URL, no trailing slash) in the Vercel project's Environment Variables.

Both auto-deploy from the `main` branch:

```bash
git add -A
git commit -m "your change"
git push origin main
```

Notes:
- `VITE_API_URL` is inlined at **build time**, so changing it (or any frontend env var) requires a redeploy/rebuild, not just a save.
- Code changes deploy on push; environment-variable changes need a redeploy to take effect.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
