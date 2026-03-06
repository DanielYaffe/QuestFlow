# QuestFlow

A web app for building, visualizing, and AI-generating RPG questlines. Design quest graphs, manage characters and rewards, generate story content with Gemini AI, and create game-ready sprites — all in one place.

## Repositories

| Repo | Description |
|------|-------------|
| [QuestFlow](https://github.com/DanielYaffe/QuestFlow) | Frontend (this repo) |
| [QuestFlow-Backend](https://github.com/DanielYaffe/QuestFlow-Backend) | Express + MongoDB API |

---

## Features

- **Quest Builder** — visual node/edge graph editor powered by React Flow
- **AI Quest Generation** — generate quest objectives, characters, and full questlines from a story premise using Gemini AI
- **Sprite Generator** — generate game-ready sprite images with style filters (art style, perspective, palette, etc.) via async Gemini image generation
- **Characters & Rewards** — manage NPCs and loot per questline with AI-generated portraits
- **Background generation** — sprite jobs run in the background via SSE; toast notifications appear when ready even if you navigate away
- **Google OAuth + JWT** — login with email/password or Google

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Routing | React Router v7 |
| UI | Tailwind CSS v4, Radix UI, MUI, shadcn/ui |
| Animations | Framer Motion (motion) |
| Quest graph | @xyflow/react + dagre |
| HTTP client | Axios (with silent JWT refresh) |
| Notifications | Sonner |
| State | React Context + hooks |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Backend running at `http://localhost:3000` (see [backend README](./backend/README.md))

### Install & Run

```bash
pnpm install
pnpm dev
```

The app runs at `http://localhost:5173`.

### Build

```bash
pnpm build
```

---

## Environment

No `.env` file is required for the frontend. The Axios base URL is hardcoded to `http://localhost:3000` in development. Update [src/app/api/axiosInstance.ts](src/app/api/axiosInstance.ts) to point at your deployed backend.

---

## Project Structure

```
src/
  app/
    api/           # Axios API modules (auth, questlines, sprites, ...)
    components/    # Shared UI components
    context/       # React contexts (Auth, SpriteJobContext)
    layouts/       # MainLayout (sidebar + nav)
    pages/
      Dashboard/
      QuestBuilder/   # Visual quest graph editor + sidebar panels
      QuestCreate/    # AI-powered questline creation wizard
      SpriteGenerator/
      SpriteAnimator/
      Login/
    types/         # Shared TypeScript types
```

---

## Key Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — list of your questlines |
| `/create` | AI quest creation wizard (5-step) |
| `/quest-builder/:id` | Visual quest graph builder |
| `/sprite-generator` | AI sprite generation tool |
| `/sprite-animator` | Sprite animation tool |

---

## Background Sprite Generation

Sprite generation uses a fire-and-forget pattern:

1. `POST /sprites/generate` → returns `{ jobId }` in <50ms
2. Frontend opens an SSE connection (`GET /sprites/jobs/:jobId/stream`)
3. When Gemini finishes (30–60s), the SSE event fires and a toast notification appears
4. The SSE connection lives at the app root (`SpriteJobContext`) — navigating away does **not** cancel generation
