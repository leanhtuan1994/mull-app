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

Dev-only screens (only in `__DEV__`): `mull://dev/engine` (load a GGUF, stream, stop, unload, timings, embedding check), `mull://dev/gallery` (UI primitives in light/dark), `mull://dev/markdown` (every markdown element, replayable as a stream), `mull://dev/seed-chat` (a 200-message chat for scroll tests) and `mull://dev/retrieval` (recall@4 of the embedding model on a Vietnamese fixture).

## Architecture

```
src/app/                 expo-router routes
  _layout.tsx            bootstrap gate (DB, catalog, model files), onboarding guard, sheets
  onboarding.tsx         welcome → pick first model
  (drawer)/              index (new chat), chat/[id], models, settings/{index,storage,prompts}
  model/[id].tsx         model detail (formSheet)
  source/[id].tsx        the passage behind a citation (formSheet, open chat only)
  image-viewer.tsx       a sent image, full screen
  model-picker.tsx       switch chat model / set default (formSheet)
  prompt-edit.tsx        add/edit system prompt preset (formSheet)
src/features/
  llm/                   LlmEngine + EmbeddingEngine, LlamaRn*/Mock* engines, llm-store (priority queue), app lifecycle
  models/                catalog.json + zod (chat/embedding, vision mmproj), compatibility (RAM budget with KV), download state machine,
                         background transport, model-store, storage stats
  chat/                  chat-store, context budget, token estimate, prepare-markdown, chat list
  attachments/           attachment files (drafts → chat folders), pickers, chunking, ingest, retrieval, document context
  prompts/               built-in presets, preset validation
  settings/              settings store (zustand persist on MMKV)
  services.ts            app singletons (engine, llm, chat, models) + bootstrap()
src/db/                  expo-sqlite: migrations (PRAGMA user_version), repositories, FTS5 search
modules/mull-files/      local Expo module (Swift): streaming SHA-256, iCloud backup exclusion, disk usage, image resize, PDF text
src/themes/mull.css      light/dark tokens (direction B)
```

Key rules the code relies on:

- **Never release a model while it generates.** All `load` / `generate` / `embed` / `countTokens` / `unload` calls go through the queue in `llm-store.ts`; only `stop()` bypasses it. Unloading during native generation crashes llama.cpp. Document indexing is `background` work and always yields to answers.
- **A model is "downloaded" only after every file is verified.** Transfers (`<model>/<file>`) write `<file>.download`; size and SHA-256 must match the catalog before the rename. A vision model needs both `model.gguf` and `mmproj.gguf`. `models.init()` reconciles the DB with the disk on every launch. Chat flows use `downloadedChatIds`, never the embedding model.
- **Document text is untrusted data.** It is cleaned of chat-template tokens, sent inside `<tài_liệu>` in the user turn, never in the system prompt. Rendered answers never load images, and only the app adds `mull://` links (citations of passages it supplied).
- **Streaming goes to the UI once per frame** and to SQLite once per answer, never per token.
- **Each chat stores a copy of its system prompt.** Editing a preset never changes existing chats.
- **Search is accent-insensitive**: `normalizeVi()` folds text before it is written to `messages_fts`, and queries are folded the same way.
- **RAM budget**: `RAM × 0.6 × 0.95 − 0.5 GB`; model cost = files (incl. mmproj) + KV cache at full context + 0.3 GB. `minRamGB` is an extra floor, never a bypass.

Adding a model: see `docs/model-catalog.md`. Architecture details: `docs/architecture.md`.

## Styling

- Uniwind classes with Mull tokens (`bg-background`, `bg-surface`, `text-muted`, `bg-accent`, `text-accent-text`, `bg-fill`, `bg-bubble`, `bg-drawer`, …) defined in `src/themes/mull.css` and `global.css`.
- System fonts: SF Pro for body; `font-rounded` (SF Rounded) for large titles via `LargeTitle`, which keeps line height ≥ 1.2 for stacked Vietnamese diacritics.
- Answers render with `react-native-enriched-markdown` through `MarkdownText`; pass model text through it, never raw. Its grammars/RaTeX come from `postinstall` (allowed in `pnpm-workspace.yaml`); `codeHighlightLanguages` in `package.json` may only list grammars the package ships.
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
