# MTProto Moderator logging (`stdout`)

Runtime logs are emitted through `Logger` in `src/utils/logger.ts` to stdout as JSON lines:

- `ts`
- `level`
- `message`
- optional metadata fields

## Event catalog

### `message=mtproto_listener_started` / `message=mtproto_listener_stopped`

- **Source:** `src/bg-services/mtproto-listener-service.ts`
- **When:** Session listener starts/stops
- **Fields:** `sessionId`

### `message=mtproto_event_handler_failed`

- **Source:** `src/controllers/mtproto-controller.ts`
- **When:** Incoming MTProto message handler throws
- **Fields:** `error`

### `message=auth_http_service_started`

- **Source:** `src/bg-services/auth-http-service.ts`
- **When:** Auth HTTP server starts
- **Fields:** `port`

### `message=mgmt_bot_started` / `message=mgmt_bot_not_started_missing_token`

- **Source:** `src/bg-services/mgmt-bot-service.ts`
- **When:** Management bot starts or is skipped due to missing token

### `message=bot_command_failed`

- **Source:** `src/controllers/bot-controller.ts`
- **When:** Bot command/text handling fails
- **Fields:** `error`

### `message=first_message_reply_sent`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** First non-secret message receives level-1 warning reply
- **Fields:** `senderId`, `chatId`, `experiment`, `variant`, `hasMedia`

### `message=second_message_warning_sent`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** Second non-secret message receives level-2 (final warning) reply
- **Fields:** `senderId`, `chatId`, `experiment`, `variant`, `hasMedia`

### `message=sender_queued_for_block`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** Sender is queued for block after third (or later) non-secret message
- **Fields:** `senderId`, `chatId`, `experiment`, `variant`

### `message=moderation_skipped_prior_block`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** Inbound DM from someone who already has a logged block decision — no automated action taken
- **Fields:** `senderId`, `chatId`

### `message=moderation_duplicate_inbound_skipped`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** Duplicate Telegram message id within the same chat was ignored after dedupe
- **Fields:** `senderId`, `chatId`, `messageId`, `source`

### `message=chat_automation_*`

- **Source:** `src/controllers/chat-automation-controller.ts`
- **When:** Bot API automation path resolves `getBusinessConnection`, checks session, or runs moderation
- **Fields:** varies (`chat_automation_no_mtproto_session`, `chat_automation_get_connection_failed`, etc.)

### `message=sender_blocked` / `message=failed_to_block_sender`

- **Source:** `src/use-cases/execute-moderation-action.ts`
- **When:** Block operation succeeds/fails
- **Fields:** `senderId` (+ `error` on failure)

### `message=failed_to_send_reply`

- **Source:** `src/use-cases/process-incoming-message.ts`
- **When:** MTProto reply send fails
- **Fields:** `chatId`, `error`

### `message=client_notification_sent` / `message=client_notification_failed`

- **Source:** `src/services/client-notification-service.ts`
- **When:** Bot notification delivery succeeds/fails
- **Fields:** `clientUserId` (+ `error` on failure)

### `message=client_notification_skipped_bot_unavailable` / `message=client_notification_skipped_invalid_user_id`

- **Source:** `src/services/client-notification-service.ts`
- **When:** Notification cannot be attempted

### `message=client_notification_html_file_failed`

- **Source:** `src/services/client-notification-service.ts`
- **When:** HTML policy/template file read fails
- **Fields:** `clientUserId`, `filePath`, `error`

### `message=onboarding_*`

- **Source:** `src/use-cases/onboarding.ts`
- **When:** Onboarding lifecycle logs:
  - `onboarding_text_received`
  - `onboarding_state_check`
  - `onboarding_phone_received`
  - `onboarding_connecting`
  - `onboarding_connected`
  - `onboarding_requesting_code`
  - `onboarding_auth_error`
  - `onboarding_failed`

### `message=action_queue_task_failed`

- **Source:** `src/bg-services/action-queue-service.ts`
- **When:** Queued moderation action throws
- **Fields:** `error`

### `message=analytics_persist_failed`

- **Source:** `src/utils/analytics.ts`
- **When:** Persisting analytics event fails
- **Fields:** `event`, `error`

### `message=shutdown_requested`

- **Source:** `src/root.ts`
- **When:** Graceful shutdown signal received

## Ops log

### `message=ops_create_db_ok`

- **Source:** `src/zz-ops/create-db.ts`
- **When:** SQL schema is applied
- **Fields:** `environment`, `databasePath`, `sqlPath`
