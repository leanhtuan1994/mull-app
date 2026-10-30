# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project Overview

Mull is an iPhone app (Expo, React Native) that downloads small language models (GGUF) onto the device and chats with them entirely offline. There is no account, server, analytics or telemetry; the only network use is downloading model files from Hugging Face.

- UI language: Vietnamese (`src/translations/vi.json`); `en.json` mirrors every key.
- Platform: iPhone only, iOS 17+, `supportsTablet: false`. Android config exists only so `expo prebuild` stays valid.
- Engine: `llama.rn` (llama.cpp) behind the `LlmEngine` interface; `MockEngine` for tests and simulator UI work.
- Started from the [react-native-caracal](https://github.com/leanhtuan1994/react-native-caracal) template (Expo SDK 58, RN 0.88, Uniwind + HeroUI Native).

Design source: the approved prototype at https://claude.ai/artifact/4wn7BZfbmqiktpvC4311gy. Requirements: `plans/reports/brainstorm-261030-1557-mull-v1-requirements.md`.

## Package Manager

pnpm only (`preinstall` enforces it). Add Expo-managed packages with `npx expo install <pkg>` so versions match SDK 58.

## Commands

```bash
pnpm install
pnpm prebuild                 # generate ios/ (CNG; ios/ and android/ are git-ignored)
pnpm ios                      # build + run on the iOS Simulator (dev client)
pnpm start                    # Metro only
EXPO_PUBLIC_MULL_ENGINE=mock pnpm start   # scripted engine instead of llama.cpp
pnpm check-all                # lint + type-check + translation lint + tests
pnpm test                     # Jest
pnpm e2e-test                 # Maestro flows in .maestro/
```

Dev-only screens (only in `__DEV__`): `mull://dev/engine` (load a GGUF, stream, stop, unload, timings) and `mull://dev/gallery` (UI primitives in light/dark).

## Architecture

```
src/app/                 expo-router routes
  _layout.tsx            bootstrap gate (DB, catalog, model files), onboarding guard, sheets
  onboarding.tsx         welcome → pick first model
  (drawer)/              index (new chat), chat/[id], models, settings/{index,storage,prompts}
  model/[id].tsx         model detail (formSheet)
  model-picker.tsx       switch chat model / set default (formSheet)
  prompt-edit.tsx        add/edit system prompt preset (formSheet)
src/features/
  llm/                   LlmEngine, LlamaRnEngine, MockEngine, llm-store (serial queue), app lifecycle
  models/                catalog.json + zod, compatibility (RAM budget), download state machine,
                         background transport, model-store, storage stats
  chat/                  chat-store, context budget, token estimate, date grouping, chat list
  prompts/               built-in presets, preset validation
  settings/              settings store (zustand persist on MMKV)
  services.ts            app singletons (engine, llm, chat, models) + bootstrap()
src/db/                  expo-sqlite: migrations (PRAGMA user_version), repositories, FTS5 search
modules/mull-files/      local Expo module (Swift): streaming SHA-256, iCloud backup exclusion, disk usage
src/themes/mull.css      light/dark tokens (direction B)
```

Key rules the code relies on:

- **Never release a model while it generates.** All `load` / `generate` / `unload` calls go through the serial queue in `llm-store.ts`; only `stop()` bypasses it. Unloading during native generation crashes llama.cpp.
- **A model file is "downloaded" only after verification.** Transfers write `model.gguf.download`; the size and SHA-256 must match the catalog before it is renamed to `model.gguf` and recorded in SQLite. `models.init()` reconciles the DB with the disk on every launch.
- **Streaming goes to the UI once per frame** and to SQLite once per answer, never per token.
- **Each chat stores a copy of its system prompt.** Editing a preset never changes existing chats.
- **Search is accent-insensitive**: `normalizeVi()` folds text before it is written to `messages_fts`, and queries are folded the same way.
- **RAM budget**: `RAM × 0.6 × 0.95 − 0.5 GB`, model cost `size + 0.3 GB`; `minRamGB` in the catalog overrides the formula.

Adding a model: see `docs/model-catalog.md`. Architecture details: `docs/architecture.md`.

## Styling

- Uniwind classes with Mull tokens (`bg-background`, `bg-surface`, `text-muted`, `bg-accent`, `text-accent-text`, `bg-fill`, `bg-bubble`, `bg-drawer`, …) defined in `src/themes/mull.css` and `global.css`.
- System fonts: SF Pro for body; `font-rounded` (SF Rounded) for large titles via `LargeTitle`, which keeps line height ≥ 1.2 for stacked Vietnamese diacritics.
- Shared primitives in `src/components/ui`: `GlassIconButton`, `GlassPill`, `ModelMonogram`, `ListSection`/`ListRow`, `SegmentedControl`, `ProgressRing`, `ProgressButton`, `LargeTitle`, `ScreenHeader`.
- Respect Reduce Motion and Reduce Transparency via `useAccessibilitySettings()`; glass falls back to a solid surface.
- Every icon-only button needs an `accessibilityLabel` (Vietnamese). Touch targets ≥ 44 pt.
- Use `Text` from `@/components/ui` (caps Dynamic Type at `MAX_FONT_SCALE` = 1.6×) and pass `maxFontSizeMultiplier={MAX_FONT_SCALE}` to every `TextInput`. Avoid fixed-height containers around text.
- `accessibilityLabelledBy` is Android-only; on iOS give controls an `accessibilityLabel`.
- For colors needed as strings (SVG, markdown, placeholders) use `useThemeColors()`.
- Drawer hooks and types come from `expo-router/drawer` (expo-router bundles its own React Navigation).

## Code Standards

- TypeScript everywhere; prefer `type`; absolute imports `@/…`; kebab-case file names.
- ESLint enforces `max-params: 3`, sorted imports, `import type`.
- Tests live next to the code (`*.test.ts(x)`); stores take their dependencies as arguments so tests use `MockEngine`, an in-memory SQLite (`src/db/test-db.ts`, Node's built-in `node:sqlite`) and fake transports.
- Number formatting is Vietnamese (`src/lib/format.ts`): "2,5 GB", "0,8".
- Conventional commits, lowercase, ≤ 100 characters. Do not commit or push unless asked. The repo is public: never commit secrets or real `.env` values.

## Repository

GitHub `leanhtuan1994/mull-app` (branch `main`). Expo/EAS account `leanhtuan1994`, project `mull`; `EAS_PROJECT_ID` in `env.js` stays empty until `eas init` runs under that account.
