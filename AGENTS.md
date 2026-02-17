# AGENTS.md

## Build & Dev Commands
- **Dev:** `bun run tauri dev` (starts Vite + Tauri together)
- **Build:** `bun run build:tauri` (sets up libvips, then `tsc && vite build`)
---
Note: you can skip running these commands as the dev server automatically performs this.
---
- **Type-check frontend:** `bunx tsc --noEmit`
- **Check Rust:** `cargo check` (run from `src-tauri/`)
- **Package manager:** Bun (not npm/yarn)

## Architecture
- **Tauri v2** desktop app: Rust backend (`src-tauri/`) + React frontend (`src/`).
- Rust entry point: `src-tauri/src/lib.rs`. Tauri commands are `#[tauri::command]` fns registered in `invoke_handler`.
- Frontend uses **React 19**, **Vite 7**, **Tailwind CSS v4** (`@tailwindcss/vite`), **TypeScript** (strict mode).
- UI components: coss UI registry, (https://coss.com/ui/llms.txt) in `src/components/ui/`. Icons: **@solar-icons/react-perf**. 
---
Note: USE ONLY OFFICIAL COSS UI COMPONENTS. INSTALL THEM WITH THE CLI. DO NOT WRITE YOUR OWN COMPONENTS
---
- Path alias: `@/*` → `./src/*`. Utility: `src/lib/utils.ts` (`cn()` via clsx + tailwind-merge).
- Hooks go in `src/hooks/`. Rust↔frontend communication via Tauri events (`emit`/`listen`) and commands (`invoke`).

## Code Style
- **TypeScript:** strict, no unused locals/params. Use named exports, kebab-case filenames.
- **Rust:** edition 2021, serde for serialization. Structs that cross the Tauri bridge derive `Clone, Serialize`.
- Prefer existing libraries already in the project. Do not introduce new icon libraries.
