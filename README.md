# QuestFlow Monorepo

A web app for building, visualizing, and AI-generating RPG questlines.

## Structure

```
QuestFlow/
  frontend/   # React + Vite frontend
  backend/    # Express + TypeScript API
```

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in values
npm run dev            # http://localhost:3000
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev               # http://localhost:5173
```

See each subdirectory's README for full documentation:
- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
