# exportuserbot analytics (`analytics_events`)

Telemetry is written through `Analytics.trackEvent(...)` in `src/utils/analytics.ts` and persisted via store query `analytics.insert`.

## Event catalog

### `onboarding_start`

- **When:** User sends `/start`
- **Props:** `userId`

### `onboarding_text`

- **When:** User sends text during onboarding
- **Props:** `userId`, `textLength`

### `onboarding_completed`

- **When:** Telegram auth succeeds and session is stored
- **Props:** `userId`

### `onboarding_failed`

- **When:** Onboarding auth flow fails
- **Props:** `userId`, `error`

### `group_picker_opened`

- **When:** User taps Groups and group list loads
- **Props:** `userId`, `groupCount`

### `group_export_completed`

- **When:** Member export finishes successfully
- **Props:** `userId`, `groupId`, `memberCount`
