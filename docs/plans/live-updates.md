# Live updates plan: polling for notifications, messages and counts

Status: agreed in a Q&A session, not yet built.

## Problem
The bell, the message badge, the chat list and open chats update only through
Supabase Realtime in the browser. If the browser session is missing or the
connection drops silently, nothing retries and the UI freezes until a reload.

## Decisions
| Topic | Decision |
|---|---|
| Polling | Always on, as a safety net under Realtime. 30s while Realtime is connected, 10s when the channel is closed or errored. Pauses on a hidden tab; refreshes at once on focus, visibility and `online`. Backs off after errors. |
| Fetch path | Route handler `GET /api/live/summary` (cookie session on the server). `Cache-Control: no-store`, 401 when signed out. Not a server action, not the browser Supabase client. |
| Summary body | `{ notifications: { unread, items }, chatUnread, counts }` |
| Open chat | Separate `GET /api/chat/[id]/messages?after=<id or time>`, every 5s while the chat is open, the tab is visible and Realtime is down. Returns messages and reactions; merged by id with `mergeMessages`. |
| Presence | The summary call runs `tours_touch_presence()`, only from a visible tab. The separate heartbeat request goes away. |
| Counts | Live in place through one shared client component that starts from the server value then follows the poll. Admin: all review queues on the admin dashboard (incl. packages to approve). Operator: pending bookings plus filter-tab counts. Guide: new assignments and today's tours. |
| Message badge | Comes from `chatUnread` in the summary call. No other nav numbers. |
| Toast | Top, under the header, 6s. Tap opens the link and marks that item read. One toast per poll, grouped ("3 new notifications"). No toast on the first poll after load. No message toast for the chat that is open. |
| Sound | Short tone generated in code (no audio file), on by default, starts after the first tap on the page. At most once per 3s. Silent for the open chat and the person's own messages. Mute toggle in `/tours/notifications` settings, remembered per device. |
| Tab title | Prefix with the combined unread count, e.g. `(2) Daet Connect`. |
| Web push | The service worker (`public/sw.js`) skips the OS notification when a site tab is visible and focused; closed or background tabs still get it. |
| Tabs | No leader election. Each visible tab polls itself; hidden tabs do not. |
| Delivery | One PR from `main` with tests. |

## Build steps
1. **Server**: shared loader that returns the summary (reuse `loadNotifications`, the `tours_chat_inbox` unread sum and per-role count queries); route handler with auth check, no-store, presence touch; chat `after=` endpoint with membership check.
2. **Hook** `usePolling`: visibility/focus/online handling, interval switch by Realtime state, exponential backoff with a cap, jitter, abort on unmount.
3. **Live store**: one provider mounted in the page frame that polls once and shares the result; bell, `useUnreadChats`, count components and the title prefix read from it. Items merge by id with Realtime inserts so nothing shows twice.
4. **Chat list and open chat**: list refreshes with the summary when Realtime is down; `ChatWindow` polls the `after=` endpoint; the "Offline" note becomes "Reconnecting…".
5. **Alerts**: toast component (grouped, 6s, tap to open and mark read), sound helper with throttle and mute, settings toggle.
6. **Service worker**: suppress the OS notification while a site tab is focused.
7. **Counts component** wired into the admin, operator and guide dashboards and the booking filter tabs.
8. **Remove** the separate presence heartbeat request.

## Tests
- Hook: no polling while hidden, immediate refresh on visible, interval switch (30s/10s), backoff after errors, cleanup.
- Merge/dedupe: the same item arriving via Realtime and polling shows once; first poll sets a baseline and raises no toast.
- Endpoints: signed out returns 401; a non-member cannot read a chat; `after=` returns only newer rows.
- Sound throttle and mute; toast grouping; design-rules test still passes (no shadows, no `bg-white`).
- e2e: a notification inserted while Realtime is blocked appears within one poll.

## Cost and limits
About one light request per active visible tab every 30s. Counts use head-only count queries and the notification list is capped at 15 rows.

## Open items to check while building
- Exact list of admin review queues and the guide "new assignment" definition (assigned but not acknowledged).
- Whether `tours_chat_inbox` is cheap enough to call every poll, or the unread total needs its own small RPC.
