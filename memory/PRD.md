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
7. Minimal onboarding with sample data — PENDING (Block C)

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
                HomeChatBar, NotificationSettings
  pages/        HomePage, ExpensesPage, AssistantPage, AuthPage,
                OnboardingPage, WeeklyRecapPage, ...
  hooks/        useDailyBudget, useDailyCheckin, useNotifications, ...
  services/     dailyCheckinService, notificationService,
                weeklySummaryService
supabase/
  migrations/   20260507000000_blocco_b_retention.sql  ← apply manually
```

## Changelog
- 2026-05-07 — **Block A** completed: Quick-Add FAB, Daily Budget Ring, Category Chips.
- 2026-05-07 — **Block B** completed (frontend): `daily_checkins` schema, evening
  check-in bottom sheet, weekly recap stories page, sticky Home chat bar,
  notification toggles for evening check-in & weekly recap, schedulers
  in `notificationService`.
- 2026-05-08 — Wired `NotificationSettings` UI toggles + `useNotifications`
  preference mapping for `eveningCheckin` / `weeklyRecap`. Smoke test passed.

## Pending DB action (USER must run)
File: `frontend/supabase/migrations/20260507000000_blocco_b_retention.sql`
Adds `daily_checkins` table and 4 columns on `settings`. Until applied, the
new toggles will save but not persist remotely; check-in sheet will fail to
write rows.

## Roadmap

### P1 — Block C (Activation Onboarding)
- 3-step mandatory post-signup flow: monthly budget, currency, sample
  expense
- Pre-populate Home with the sample row + tooltip ("questa è una spesa
  esempio, eliminala quando vuoi")

### P2 — Polish
- Deep-link weekly recap notification → `/recap/weekly`
- Skeleton loaders for HomeChatBar response
- Streak share card (social loop)

## Testing notes
- User has NO test Supabase account. All tests run on production data.
  Do **not** run automated mutations without explicit user permission.
- `tsc --noEmit` passes for the whole frontend.
