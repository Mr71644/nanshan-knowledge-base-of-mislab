# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install     # Install dependencies (requires pnpm >= 8, Node >= 18)
pnpm dev         # Start dev server at http://localhost:5173
pnpm build       # Production build (output to dist/)
pnpm lint        # ESLint check
pnpm preview     # Preview production build locally
```

Docker deployment (multi-stage build → nginx):

```bash
docker build -t sytusramlethal/mislab-kb:latest .
docker run -d --name mislab-kb -p 8080:80 sytusramlethal/mislab-kb:latest
```

## Architecture

React 18 + Vite 5 + Redux Toolkit application. Uses **Hash Router** (`createHashRouter`) — all routes are `#/` prefixed.

### Key paths

- `@` alias → `./src` (configured in `vite.config.js`)
- `base: './'` in Vite config for relative asset paths (required for Docker/nginx deployment)

### Routing (`src/router/index.jsx`)

| Route | Component | Purpose |
|---|---|---|
| `/home` | MemoFileList | Main file list |
| `/home/list/:id` | MemoFileList | Folder contents |
| `/content/:folder/:id` | MemoContent | Rich text view/edit |
| `/addContent/:folder` | MemoAddContent | New rich text |
| `/excel/:folder/:id` | MemoExcel | Excel view/edit |
| `/addExcel/:folder` | MemoAddExcel | New Excel |
| `/administrator` | MemoAdministrator | User/role management (wrapped in `AdminRoute`) |
| `/login` | MemoLogin | Login page |
| `/preview` | MemoPreview | File preview page |
| `/` | Navigate → `/home` | Root redirect |
| `*` | MemoNotFound | 404 catch-all |

**Note:** `AuthRoute` (`src/router/AuthRoute.jsx`) exists but is **not currently used** in the router — all routes render without authentication guards.

All view components are exported as `Memo[ComponentName]` (wrapped in `memo()`). Import the `Memo` prefixed version in the router.

### State management (Redux Toolkit)

- **user slice** (`src/store/modules/user.js`): token stored in `localStorage` via `src/utils/token.js`
- **message slice** (`src/store/modules/message.js`): global notification state for Ant Design Message

**Import order matters**: `src/utils/request.js` imports `store` directly, so `request.js` must be imported before the Redux `<Provider>` renders. Currently `main.jsx` imports the store first which triggers `request.js` via the user module.

### API layer (`src/utils/request.js`)

- Axios instance with base URL from environment variable `import.meta.env.VITE_API_BASE_URL`
- Environment configuration:
  - `.env.development` → `VITE_API_BASE_URL=/api` — uses Vite proxy (see below)
  - `.env.production` → `VITE_API_BASE_URL=http://101.43.146.27/new-app/api`
  - `.env` → `VITE_APP_TITLE=MISLab知识库` (shared across all environments)

**Vite proxy (dev only):** `/api` requests are proxied to `http://101.43.146.27/new-app/api` with the `/api` prefix stripped. Configured in `vite.config.js` → `server.proxy`.
- Request interceptor: auto-attaches `Authorization: Bearer ${token}`
- Response interceptor: unwraps to `response.data`; on 401 → clears token, shows warning, redirects to `#/login`
- API modules in `src/apis/` split by domain (`content.js`, `excel.js`, `folder.js`, `file.js`, etc.)

### Component convention

Every component/view follows three-file structure:

```
ComponentName/
  ├── index.jsx           # Logic
  ├── index.module.css    # Compiled CSS
  └── index.module.less   # Source styles (LESS)
```

Styles use CSS Modules: `import style from './index.module.css'`, then `style.className`.

**Exceptions:** `ChatInput` and `TiptapEditor` lack `.less` source files (CSS was written directly).

### Univer Excel integration (`src/components/UniverSheet/`)

Uses **preset mode** (v0.15.x) — do NOT mix with plugin-mode APIs:

- `createUniver({ presets, locales })` → returns `{ univer, univerAPI }`
- `univerAPI.createWorkbook(data)` to load, `univerAPI.getActiveWorkbook().save()` to snapshot
- Data must conform to Univer's `IWorkbookData` interface
- Presets: `@univerjs/preset-sheets-core` + `@univerjs/preset-sheets-advanced`
- All `@univerjs/*` packages must stay at the same version (currently 0.15.0)

### ChatInput component (`src/components/ChatInput/`)

AI chat assistant (floating button). **Note:** uses a hardcoded API URL (`http://10.92.191.37:8000/api/v1/ask`) directly — does NOT use the shared `request` axios instance from `src/utils/request.js`.

### File type status codes

Used in FileList: `1` = rich text, `2` = folder, `3` = Excel, `4` = regular file.

### Authentication flow

Token lifecycle: login → stored in `localStorage` → attached via request interceptor → 401 response triggers cleanup + redirect to `/login`.

### Custom hooks

- `useMessage` (`src/hooks/useMessage.jsx`): wraps Ant Design Message with `{ content, callBack, delayTime, show }` config

## Known issues

- (none currently)
