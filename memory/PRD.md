# Ayvro — PRD

## Original Problem Statement
> "ho creato questa app, trasformala in mobile first e ottimizza la ui"

Then:
> "dobbiamo rendere l'applicazione più responsiva e veloce"

User-prioritised features (UX performance / daily-use):
1. Global Quick-add FAB (Spesa/Task) — DONE
2. Home: Daily Budget Ring — DONE
3. Streak & Evening Check-in (retention loop) — DONE
4. Category Chips (reduce taps) — DONE
5. Weekly recap screen — DONE (route `/recap/weekly`)
6. Sticky AI chat input in Home — DONE
7. Minimal onboarding with sample data — DONE (Block C)

User language: Italian (always reply in IT).

## Stack
- React + Vite + TypeScript
- Tailwind, Framer Motion, Vaul (bottom sheets)
- Supabase (Auth, DB, Edge functions)
- Capacitor (native shell)

## Architecture (frontend)
```
src/
  components/   MobilePageHeader, BottomSheet, FAB, QuickAddFab,
                CategoryChips, DailyBudgetRing, CheckInSheet,
                HomeChatBar, NotificationSettings,
                SampleExpenseBanner
  pages/        HomePage, ExpensesPage, AssistantPage, AuthPage,
                OnboardingPage (3-step), WeeklyRecapPage, ...
  hooks/        useDailyBudget, useDailyCheckin, useNotifications, ...
  services/     dailyCheckinService, notificationService,
                weeklySummaryService, budgetService
supabase/
  migrations/   20260507000000_blocco_b_retention.sql  ← apply manually
```

## Changelog
- 2026-05-07 — **Block A** completed: Quick-Add FAB, Daily Budget Ring, Category Chips.
- 2026-05-07 — **Block B** completed (frontend): `daily_checkins` schema, evening check-in
  bottom sheet, weekly recap stories page, sticky Home chat bar, notification toggles for
  evening check-in & weekly recap, schedulers in `notificationService`.
- 2026-05-08 — Wired `NotificationSettings` UI toggles + `useNotifications` preference
  mapping for `eveningCheckin` / `weeklyRecap`. Added `hapticNotification` helper.
- 2026-05-08 — **Block C** (Activation Onboarding) completed: 3-step mandatory flow
  (Currency/Language → Monthly Budget → Sample Expense), creates real DB rows,
  auto-redirects via `ProtectedRoute`. Added `SampleExpenseBanner` on Home with
  tooltip ("hai una spesa di esempio, eliminala quando vuoi"). Smoke-tested all 3
  screens render correctly.

## Pending DB action (USER must run)
File: `frontend/supabase/migrations/20260507000000_blocco_b_retention.sql`
Adds `daily_checkins` table and 4 columns on `settings`. Until applied, the new toggles
will save but not persist remotely; check-in sheet will fail to write rows.

## Block C — How it works (recap)
- New users land on `/onboarding` automatically (via `ProtectedRoute` when no
  tasks and no budget exist).
- Step 1: pick locale → switches `i18n.language` live + saves to `settings.language`.
- Step 2: pick monthly budget → upserts into `budgets(user_id, month, year, amount)`.
- Step 3: pick a sample expense → inserts into `expenses` with description prefixed
  by `[Esempio]` so the Home banner can detect it.
- After finish: `auth.user_metadata.onboarding_completed = true`, localStorage flag
  set, navigate to `/`.
- On Home: `SampleExpenseBanner` displays as long as a `[Esempio]` expense exists
  and the localStorage flag is present (auto-cleared on dismiss / CTA click).

## Roadmap

### P2 — Polish
- Deep-link weekly recap notification → `/recap/weekly`
- Skeleton loader for HomeChatBar response
- Streak share card (social loop)
- Translations: add Block C strings (`onboarding.lang_*`, `onboarding.budget_*`,
  `onboarding.sample_*`, `onboarding.banner_*`) to all 22 locale files. Currently
  only IT uses the inline `defaultValue`; other languages will fall back to IT.

## Testing notes
- User has NO test Supabase account. All tests run on production data.
  Do **not** run automated mutations without explicit user permission.
- `tsc --noEmit` passes for the whole frontend.
- Block C smoke test: step 1/2/3 all render correctly at viewport 390×844.
