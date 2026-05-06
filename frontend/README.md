# Ayvro - Decision Engine for Your Money

A modern, minimal financial decision assistant for thoughtful spenders.

## Brand Identity

- **Name**: Ayvro
- **Tagline**: Decision Engine for Your Money
- **Primary Color**: #0F3D3E (Teal Petroleum)
- **Background**: #F8FAF9
- **Style**: Modern, minimal, professional, decisive

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Auth, Database, Edge Functions)
- Framer Motion
- **Capacitor 8** (Android + iOS native shell)

## Features

- Task management with priorities
- Calendar events
- Expense tracking and budgets
- AI conversational assistant
- Wellness monitoring
- Native local notifications, haptic feedback, splash screen, status bar
- Pull-to-refresh, swipe-to-delete, offline detection
- Light/Dark mode
- Multi-language (22 languages)
- Account deletion (GDPR + Apple/Google compliance)

## Web Development

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
```

## Native Mobile App (Android + iOS)

This project ships as a true native app via Capacitor. The codebase is the same — only the shell changes.

### One-time setup (after cloning)

```bash
npm install
npm run build
npx cap add android
npx cap add ios          # macOS + Xcode required
```

### Daily workflow

After every code change you want to test on device:

```bash
npm run build
npx cap sync             # syncs both platforms
```

### Run on Android

```bash
npx cap open android     # opens Android Studio
```

Then click ▶ in Android Studio. Build APK: **Build → Build APK(s)**. Build signed AAB for Play Store: **Build → Generate Signed Bundle**.

> ⚠️ Constraint: project must stay compatible with **Android Gradle Plugin 8.11.1**. Do not upgrade AGP to 8.13+.

### Run on iOS (macOS only)

```bash
npx cap open ios         # opens Xcode
```

Then run on simulator or signed device. Archive for App Store: **Product → Archive**.

### Deep link (OAuth callback)

URL scheme: `com.ayvro.app://auth-callback`
Configured in `capacitor.config.ts`. The app routes deep links to `/auth` automatically (see `src/hooks/useNativeApp.ts`).

### Native plugins in use

| Plugin | Purpose |
| --- | --- |
| `@capacitor/splash-screen` | Branded launch screen |
| `@capacitor/status-bar` | Themed status bar (#0F3D3E) |
| `@capacitor/app` | Lifecycle, hardware back button (Android), deep links |
| `@capacitor/keyboard` | Native keyboard resize |
| `@capacitor/local-notifications` | Reliable scheduled notifications (works app-killed) |
| `@capacitor/haptics` | Tap / swipe / success feedback |
| `@capacitor/network` | Native online/offline detection |
| `@capacitor/share` | Native share sheet |
| `@capacitor/preferences` | Persistent Supabase auth storage |

## Store Publishing Checklist

- [x] Privacy policy in-app + at public URL
- [x] Terms & conditions
- [x] **Account deletion in-app** (Apple/Google requirement)
- [ ] App Store Connect / Google Play Console listing
- [ ] Screenshots: Android 1080×1920 + iOS 6.7" / 6.1"
- [ ] Feature graphic Android 1024×500
- [ ] App icon 512×512 (Play) / 1024×1024 (App Store)
- [ ] Data safety form (Google) / Privacy Nutrition Label (Apple)

## License

Proprietary - Ayvro Team
