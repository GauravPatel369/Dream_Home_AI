# Dream Home AI — Project Details

This document explains what the project is, what was built, key features, architecture and techniques used, how to run it, known constraints and recommended next steps.

---

## 1. Project Summary

Dream Home AI is a small React single-page application that converts a user's answers to a 5-question lifestyle quiz into a curated "home personality" and a set of cinematic room visuals (Bedroom, Kitchen, Exterior, Workspace). The app also suggests matched real-estate listings and offers a shareable PNG export of the user's personality card.

The app is intentionally client-side-first. Image generation uses DALL·E (or equivalent) via an API when an API key is present; when the key is absent or the API call fails, the app falls back to curated Unsplash-style images so the UI stays usable.

---

## 2. What was built (high level)

- A responsive React app (Create React App) with pages/components implemented in a single `App.js` file.
- Quiz flow: 5 questions (vibe, style, location, priority space, budget). Answers stored in React state.
- Image prompt builder (`src/utils/imageGen.js`) that turns answers into high-quality prompts for image generation.
- Image generation orchestration with per-room streaming updates and graceful fallback to unsplash-style images.
- Ability to regenerate a single room (with optional custom prompt from the user) and robust handling to avoid stale async writes overwriting fresh images.
- Shareable PNG export using `html2canvas` (export uses base64 images to avoid expiry issues).
- Editable quiz UI: users can add options to a question and add new questions at runtime (inline forms). This is currently runtime-only (not persisted across reloads).
- Listings matching using a simple overlap scoring against `MOCK_LISTINGS`.
- Snaphomz link integration — currently forced to `https://snaphomz.com/` (no query params) per product requirement.
- UI notices when the image API is unauthorized or quota-limited; fallbacks are used automatically.

---

## 3. Key features

- 5-Question interactive quiz with card-style options
- 4 AI Room visuals (Bedroom, Kitchen, Exterior, Workspace)
- Per-room regeneration, with support for user-supplied prompts
- Shareable personality card (PNG export via `html2canvas`)
- Matched listings (mock data) and listing CTA
- Inline UX to add custom quiz options and add new questions during runtime
- Fallback images when API key is missing or exhausted

---

## 4. Project structure and important files

- `public/index.html` — static HTML shell
- `src/index.js` — React entrypoint
- `src/App.js` — Main application UI and logic (quiz, results, regenerate, prompt UI, share export)
- `src/App.css` — App styling (theme tokens, layout, components)
- `src/data/quizData.js` — Default quiz questions, archetypes, and `MOCK_LISTINGS`
- `src/utils/imageGen.js` — Prompt builder, image generation wrappers, fallback images, and listing matcher
- `package.json` — project dependencies and run scripts
- `README.md` — quick start and high-level documentation
- `DETAILS.md` — this file (detailed project documentation)

---

## 5. Architecture & data flow

1. User opens the app and clicks Start → Quiz flow begins.
2. The user answers each question; answers are saved into React state.
3. On final answer, `getArchetype()` determines the user's archetype (name, tagline, colors).
4. Prompts are generated for each room using `buildImagePrompts(answers)`.
5. `generateHomeImages()` runs in sequence and calls back (`onRoomReady`) as each room finishes so the UI can show images progressively.
6. Each generated image is converted to a data URL (base64) to avoid expiring presigned URLs and to make `html2canvas` rendering reliable.
7. `getMatchedListings()` computes listing scores from `MOCK_LISTINGS` and displays top matches.
8. Users can regenerate a single room (or provide a custom prompt) — `handleRegenerate(room, prompt)` runs `generateSingleImage()` and updates the room image only if the generation ID matches the latest, preventing stale results from overwriting new ones.

---

## 6. Techniques & libraries used

- React 18 (functional components + hooks) — UI and state management
- Create React App (`react-scripts`) — build tooling and dev server
- html2canvas — DOM → PNG export
- Unsplash image URLs as curated fallback imagery
- Fetch API — browser HTTP calls to image APIs
- In-memory optimistic UI updates and per-room generation IDs to avoid race conditions

---

## 7. API and keys

- The app expects an environment variable named `REACT_APP_OPENAI_API_KEY` (or `REACT_APP_ANTHROPIC_API_KEY` in README) to enable direct client-side image generation via OpenAI / DALL·E or similar.
- Important: API keys embedded in client-side bundles are visible in the browser. For production usage, run a small server-side proxy (Express, Vercel Serverless function, etc.) that holds the API key and forwards requests server-side.

Notes on errors:
- The app now handles `401/403` (unauthorized) and `429` (rate limit/quota) responses by returning fallback images and setting `apiStatus` in the UI so the user sees a banner explaining fallback mode.

---

## 8. Known limitations & recent fixes

- Images generated via DALL·E produce presigned URLs that may expire — the app converts images to base64 as soon as they are returned to prevent the share-export or later UI loads from breaking.
- Previously a race condition could cause older async generation results (from the initial batch) to overwrite newer user-initiated regenerations. This has been fixed by tracking per-room generation IDs (`latestRoomGen`) and ignoring stale results.
- Regeneration and custom prompt flows now set per-room loading state so the UI shows a skeleton while regenerating.
- The inline quiz add option/question UI is runtime-only and not persisted between reloads — consider localStorage persistence as a next step.

---

## 9. Running locally

Requirements: Node.js v18+, npm 9+

Commands:

```bash
npm install
npm start
```

The app will run at http://localhost:3000 by default.

Environment:
- Create a `.env` (copy `.env.example`) and set `REACT_APP_OPENAI_API_KEY` if you want to enable direct image generation from the browser (not recommended for public production).



---
## 11. Contact & ownership

Gaurav Patel
patelgaurav2099@gmail.com