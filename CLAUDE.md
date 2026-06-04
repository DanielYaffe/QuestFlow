# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- **Never run `git commit` unless the user explicitly asks you to commit.** Finish the code changes, then stop and wait.

## Stack

- **Backend:** Node 20, TypeScript, Express 5, Mongoose, BullMQ + Redis
- **Frontend:** React 18, Vite, Tailwind 4, Radix UI / shadcn, React Router 7 (HashRouter)
- **Tests:** Jest (backend only)

## Constraints

- Never use `any`. Use `unknown` + type guards.

- Controllers call services. Services call DB. Never bypass.


