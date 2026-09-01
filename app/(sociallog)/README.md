# SocialLog

Social feed sub-app — posts, follows, friends, messaging, and leaderboards.
One of seven sub-apps under LogBook — see the [root README](../../README.md)
for how it fits into the wider app.

## What it does

- **Home** (`/sociallog`) — feed of posts (with topics, votes, comments),
  friends/follows, leaderboards.
- **Search** (`/sociallog/search`) — find other users by username (usernames
  are the cross-app identity managed in LogBook's `/profile`).
- **Messages** (`/sociallog/messages`) — direct messaging between users
  (threads + messages).
- **Config** (`/sociallog/config`) — SocialLog-specific settings
  (`SocialLogSettingsCard`, backed by `/api/sociallog/profile-settings`)
  plus "Export config as JSON". No dedicated onboarding flow yet.

## Routes

```
/sociallog             Home (feed)
/sociallog/search        Find users
/sociallog/messages         Direct messages
/sociallog/config              Settings
```

## Data model

Prisma models: `Friendship`, `SocialPost`, `SocialComment`, `SocialVote`,
`SocialFollow`, `SocialTopic`, `SocialPostTopic`, `SocialMessageThread`,
`SocialMessage`, `SocialProfileSettings`. Shares the top-level `Profile`
model (and its `username`) with every other app.

## Key files

```
app/(sociallog)/
  layout.tsx             Route-group layout/theming
  sociallog/page.tsx        Home (feed)
  sociallog/search/             Find users
  sociallog/messages/              Direct messages
  sociallog/config/                   Settings (incl. SocialLogSettingsCard)
components/SocialLogBottomNav.tsx      SocialLog's bottom nav
lib/sociallog/                            SocialLog-specific helpers
```
