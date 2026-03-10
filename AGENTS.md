# AGENTS.md

## Build & Dev Commands
- **Dev:** `bun run tauri dev` — **Lint:** `bun run lint` (Biome) — **Lint+fix:** `bun run lint:fix`
- **Build:** `bun run build:tauri` — **Typecheck:** `bun run typecheck` — **Check Rust:** `cargo check` (from `src-tauri/`)
- **Package manager:** Bun (not npm/yarn). No test framework configured.

## Architecture
- **Tauri v2** desktop app: Rust backend (`src-tauri/src/`) + React frontend (`src/`).
- Rust entry: `lib.rs` (registers `#[tauri::command]` fns). Modules: `commands`, `processor`, `compression`, `watcher`, `config`, `tray`, `platform`.
- Frontend: **React 19 + Vite 7 + Tailwind v4 + TypeScript strict**. Path alias `@/*` → `./src/*`.
- UI components in `src/components/ui/` (coss registry, install via CLI — do NOT hand-write). Icons: `@solar-icons/react-perf`.
- Hooks in `src/hooks/`. Rust↔JS via Tauri `invoke`/`emit`/`listen`.

## Code Style
- **Biome** formatter: tabs, 100-char line width, double quotes, semicolons, ES5 trailing commas.
- **TypeScript:** strict, no unused locals/params, named exports, kebab-case filenames.
- **Rust:** edition 2021, serde for serialization, `thiserror` for errors. Bridge structs derive `Clone, Serialize`.
- Prefer existing libs. Do not introduce new icon/component libraries. Break custom code into reusable components.
