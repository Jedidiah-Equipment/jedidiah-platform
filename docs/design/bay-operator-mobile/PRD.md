# PRD — Bay Operator Mobile App (JedidiahOps)

**Status:** Approved for build · **Epic:** [#513](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/513) · **Package:** `pkg/mobile`

A read-only Expo (React Native) app that lets a manager view production **Bays**, each Bay's **schedule** (the active Job plus upcoming Job Slots), **Job Slot detail**, and the Job's **Documents** through an in-app PDF reader. It is built on the existing `pkg/mobile` skeleton, which already has better-auth email/password login wired.

## 1. Background

The design was mocked in Claude Design (HTML/CSS/JS) and exported as a handoff bundle, committed here under `project/`. The primary prototype is **`project/BayApp.dc.html`** (one responsive component that drives phone and tablet); `project/Bay Operator App.dc.html` frames it in phone + tablet shells. Recreate the visual output faithfully — do not copy the prototype's internal structure.

Design references:
- Prototype source (read in full): [`project/BayApp.dc.html`](project/BayApp.dc.html)
- Phone screenshot: [`project/screenshots/final-phone.png`](project/screenshots/final-phone.png)
- Tablet screenshot: [`project/screenshots/final-tablet.png`](project/screenshots/final-tablet.png)

## 2. Goals

- Give managers an at-a-glance, on-the-floor view of every Bay's current and upcoming work.
- Drill into a Job Slot's detail and open its documents (Parts Book, BOM, Brochure) without leaving the app.
- Match the design in **both light and dark**, aligned with the web app's theme.
- Reuse existing backend APIs — **no new server endpoints**.

## 3. Users & access

- **Audience:** authenticated users holding `job:read` — `admin`, `procurement-manager`, `job-viewer`.
- The `bay-operator` role is a non-sign-in personnel record (shop-floor Bay assignment) and **cannot** log in — despite the app's colloquial name, its users are managers/viewers.
- **Read-only.** No create/edit/schedule actions; the only write is sign-out. (Authorization model: `pkg/domain/src/auth/authorization.ts`.)

## 4. Platforms & responsiveness

- **Verify on:** Android phone and Android tablet. iOS must not break — all library choices stay cross-platform — but iOS is not actively verified in this phase.
- **Breakpoint:** the schedule view is a single responsive component. At width **≥ 760px** it renders a **master–detail** layout (schedule list 40% / Job Slot detail 60%) side-by-side; below 760px it navigates list → detail and back.

## 5. Screens

| Screen | Summary | Source (in `BayApp.dc.html`) |
|--------|---------|------------------------------|
| **Login** | Restyle existing better-auth login to the JedidiahOps mockup. | LOGIN section |
| **Bay List** | Profile header (avatar, name, menu) + responsive grid of Bay cards (operator, active Job, coloured days-left, progress). | BAY LIST section |
| **Bay schedule — list pane** | ACTIVE NOW hero + UP NEXT timeline of upcoming Job Slots. | JOBS section (list pane) |
| **Bay schedule — detail pane** | Status chips, product card, DOCUMENTS list, SLOT grid, JOB grid. | JOBS section (detail pane) |
| **Document viewer** | In-app PDF reader (header, page area, footer page/zoom). | DOCUMENT VIEWER overlay |

Profile menu contains a **theme toggle (light/dark/system)** and **Log out**.

## 6. Data mapping — no new APIs

All screens are served by existing procedures and routes:

| Need | Existing source |
|------|-----------------|
| Bay list + active Job + days-left | `jobs.listBays` + `@pkg/domain` `bayWorkingCalendars` / `projectBaySchedule` (mirror web `use-shop-floor-bays.ts` + `bay-schedule-derivations.ts`) |
| A Bay's Job Slots (active + upcoming) | `jobs.listJobBays` + the domain projection |
| Job Slot detail + its documents | `jobs.get` (returns documents, slots, schedule — see `pkg/core/src/jobs/job-read-service.ts`) |
| Document bytes | Authed HTTP `GET /api/jobs/:jobId/documents/:documentId/download` |

The only new work is **client-side**: `pkg/mobile` has no tRPC client or authed document fetch yet.

## 7. Theme

- Canonical tokens move to **`pkg/domain`** as pure objects (no React/Tailwind), re-exported from `pkg/domain/src/index.ts`. **Light + dark** sets.
- Palette aligns with web `pkg/web/src/styles/globals.css` (neutral surfaces + brand yellow primary `#f8d300` light / `#fff000` dark, near-black on-primary). The mockup is the **dark** variant.
- Plus **semantic tokens** the screens need: in-progress blue, scheduled amber, next green, and the days-left colour scale (`≤2` red, `≤5` amber, else green).
- Mobile's tailwind/gluestack theme is **generated from the domain tokens** — no hand-duplicated colours.
- Follow-up: web `globals.css` is later refactored to consume the same domain tokens ([#522](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/522)), completing the consolidation.

## 8. Tech decisions

- **Component library:** gluestack-ui v2 (+ NativeWind v4). This reverses the previous `pkg/mobile/AGENTS.md` "no NativeWind" rule — that doc is updated as part of [#515](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/515).
- **Color mode:** follow OS via `useColorScheme`, with a persisted light/dark/system override in the profile menu (mirrors web's three-way).
- **Routing:** keep Expo Router file-based under `app/`.
- **PDF:** `react-native-pdf`, sourced from the authed download URL with the session cookie header (`authClient.getCookie`). Allowed because `pkg/mobile` runs a custom dev client (`expo run:android`), not Expo Go.
- **Auth/base URL:** reuse the existing `lib/auth.ts` conventions (`EXPO_PUBLIC_API_BASE_URL`, `10.0.2.2:7002` on Android).

## 9. Out of scope (this phase)

- iOS verification, offline/caching, push notifications.
- Any write/scheduling actions, calendar editing, or admin features.
- New backend APIs.

## 10. Issues

Epic: [#513](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/513)

| # | Issue | Depends on |
|---|-------|-----------|
| [#514](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/514) | Theme tokens in `pkg/domain` (light + dark) | — |
| [#515](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/515) | gluestack-ui v2 + NativeWind setup, color-mode, domain-token theme | #514 |
| [#516](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/516) | tRPC client + authed document fetch | — |
| [#517](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/517) | Login screen restyle | #515 |
| [#518](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/518) | Bay List screen + shared profile header/menu | #515, #516 |
| [#519](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/519) | Bay schedule — list pane (ACTIVE NOW + UP NEXT) | #515, #516, #518 |
| [#520](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/520) | Bay schedule — Job Slot detail pane + responsive master–detail | #519 |
| [#521](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/521) | In-app document viewer (react-native-pdf) | #516, #520 |
| [#522](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/522) | (web follow-up) Migrate `globals.css` to domain tokens | #514 |
