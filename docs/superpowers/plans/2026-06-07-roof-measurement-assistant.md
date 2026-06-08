# Roof Measurement Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shadcn/ui internal app for reviewing and approving roof measurement inputs backed by a Supabase schema.

**Architecture:** The app uses Next.js App Router with server actions for property creation and approval. Supabase stores the canonical workflow records, while local deterministic domain functions generate the first draft measurement and export summary so V1 is useful without paid data integrations.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Supabase Postgres, `@supabase/ssr`, Vitest.

---

### Task 1: Scaffold App and Design System

**Files:**
- Create: Next.js app files in project root
- Create: `components.json`
- Create: `src/components/ui/*`

- [ ] Run `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
- [ ] Run `npx shadcn@latest init -d --base radix`
- [ ] Add needed shadcn components: button, card, input, textarea, label, switch, badge, separator, tabs, select, slider, table
- [ ] Run `npm run lint`

### Task 2: Add Supabase Schema and Clients

**Files:**
- Create: `supabase/migrations/20260607000000_create_measurement_workflow.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/database.types.ts`
- Create: `.env.example`

- [ ] Add tables, enums, indexes, RLS enablement, and broad authenticated policies for internal users
- [ ] Add browser/server Supabase clients using publishable key env vars
- [ ] Document required Supabase environment variables

### Task 3: Test Draft Measurement Domain Logic

**Files:**
- Create: `src/lib/measurements/draft-provider.test.ts`
- Create: `src/lib/measurements/draft-provider.ts`
- Create: `src/lib/measurements/summary.test.ts`
- Create: `src/lib/measurements/summary.ts`

- [ ] Write failing tests for deterministic draft estimates and risk flags
- [ ] Implement draft generation with conservative confidence and needs-review status
- [ ] Write failing tests for approved summary formatting
- [ ] Implement export summary formatting
- [ ] Run `npm test`

### Task 4: Implement Workflow Actions

**Files:**
- Create: `src/app/actions.ts`
- Modify: `src/lib/measurements/*`

- [ ] Add `createPropertyWithDraft` server action
- [ ] Add `approveMeasurement` server action
- [ ] Add audit event inserts for intake, draft generation, and approval
- [ ] Return local demo data when Supabase env vars are absent

### Task 5: Build Product Screens

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/measurement/*`

- [ ] Build dashboard shell with intake, review packet, approval panel, and audit sections
- [ ] Use shadcn components for form controls, tabs, badges, tables, and cards
- [ ] Make the interface dense, operational, and responsive
- [ ] Avoid overstating data confidence in copy or UI state

### Task 6: Verify

**Files:**
- Modify as needed based on failures

- [ ] Run `npm test`
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Start dev server
- [ ] Verify desktop and mobile render with browser screenshot checks
