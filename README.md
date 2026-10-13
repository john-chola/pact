# Pact 🚀

A mobile app where small groups of developers do 7-day coding sprints together — checking in daily, supporting each other, and building real friendships in the process.

Built with **Expo (SDK 56) + Expo Router**, **Supabase** (auth, Postgres, realtime, Edge Functions) and **Expo Notifications**.

## Features

| | |
| --- | --- |
| Onboarding | Email sign up / log in, then name, what you're building and your goal |
| Groups | Create a pact (gets a 6-character invite code) or join one — max 5 people |
| 7-day sprints | Day X of 7 tracker, sprint results screen, "Start sprint 2" with the same crew |
| Daily check-in | What you worked on, how long, honest feeling, tomorrow's plan — one per day |
| Group feed | Everyone's check-ins, live via Supabase Realtime |
| Streaks | Per group and overall; kept by a database trigger so they can't be faked |
| Reactions | 🔥 💪 👏 ❤️ on any check-in |
| Reminders | Local daily reminder at the time you choose |
| Nudges | "Nudge 👊" a quiet group mate, plus a daily push to anyone who missed yesterday |

## Project layout

```
src/app/                      Screens (file-based routes)
  _layout.tsx                 Auth gate: sign-in → onboarding → app (Stack.Protected)
  sign-in.tsx, onboarding.tsx
  index.tsx                   Home: streak + your pacts
  groups.tsx                  Create / join a pact
  feed/[groupId].tsx          Sprint progress, crew, check-in form, feed, reactions
  sprint-complete/[groupId].tsx
  notifications.tsx           Daily reminder settings
src/components/ui.tsx         Shared themed UI (Screen, Button, Input, Chip, Card…)
src/lib/                      Supabase client, auth context, dates, notifications, types
supabase/schema.sql           Tables, RLS, RPCs, streak triggers, realtime
supabase/functions/nudge/     Edge Function that sends nudge push notifications
supabase/cron.sql             Schedules the daily nudge sweep
```

## Setup

### 1. App

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + publishable key
npx expo start
```

The app uses `expo-notifications` and `expo-secure-store`, so test on a **development build** (`eas build --profile development`) on a real phone. Push notifications don't work in Expo Go.

### 2. Database

In the Supabase dashboard open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and run it.

It is safe to run on the existing project: it adds missing columns, removes duplicate memberships, backfills profiles and replaces the RLS policies. Re-run it whenever the file changes.

Groups are created, joined and restarted through RPCs (`create_group`, `join_group_by_code`, `start_new_sprint`, `leave_group`). These enforce the 5-person cap and generate unique codes.

### 3. Nudges (optional, needs the Supabase CLI)

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy nudge --no-verify-jwt
supabase secrets set NUDGE_CRON_SECRET=$(openssl rand -hex 24)
```

Then enable the `pg_cron` and `pg_net` extensions. Fill in the placeholders in [`supabase/cron.sql`](supabase/cron.sql) and run it in the SQL editor.

For push delivery on Android, upload FCM credentials with `eas credentials`. For iOS, EAS sets up APNs during the build.

### 4. Ship

```bash
eas build --profile preview --platform android   # internal APK for testers
eas build --profile production --platform all
eas submit --platform ios                         # TestFlight
eas submit --platform android                     # Play Console
```

## Roadmap

- [x] Week 1–2 — auth, navigation, schema
- [x] Week 3–4 — groups, check-ins, realtime feed, streaks
- [x] Week 5–6 — reminders, nudges, sprint completion, UI polish
- [ ] Week 7 — test with the WhatsApp group, fix what breaks
- [ ] Week 8 — TestFlight + Play Store beta, onboard the first 20 users

Out of scope for the MVP: direct messages, discover feed, public profiles, leaderboards, payments.
