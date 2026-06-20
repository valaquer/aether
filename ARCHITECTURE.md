# Facade — Architecture

## Origin

Forked from HuggingFace Chat UI (upstream: github.com/huggingface/chat-ui).
The upstream codebase contains many features irrelevant to Facade. Rather than
strip them, we leave them in place and document them here. Dead code that does
not execute does not cause bugs.

## How to use this document

Each feature below is classified as either **Keep** or **Drop**.

- **Keep:** We use or may use this. Read and understand it before modifying.
- **Drop:** Dead code from the upstream. Do not touch. If a build error traces
  to it, replace with a stub — do not fix or extend.

## Feature Registry

### 1. Authentication (DROP)

HuggingFace OAuth login/logout. Routes at `/login`, `/login/callback`,
`/logout`, `.well-known/oauth-cimd`. Server modules: `auth.ts`,
`adminToken.ts`, `apiToken.ts`. Types: `User.ts`, `Session.ts`.
Utility: `utils/auth.ts` (`requireAuthUser`).

Gated behind CLIENT_ID env var — does not run on localhost unless configured.
Safe to leave in place.

### 2. Model support (DROP)

Model list, model switching in chat, model detail pages with thumbnails,
model subscriptions. Routes at `/models`, `/models/{name}`. API at
`/api/models`, `/api/v2/models/*`. Server modules: `models.ts`,
`endpoints/` (OpenAI, image generation). Not needed — Facade is
a comms layer, not an AI chat app.

### 3. Conversation management (KEEP)

Core chat infra: create, load, rename, delete conversations; message history.
Routes at `/conversation/[id]`. API at `/api/conversation/*`,
`/api/v2/conversations/*`. Server module: `conversation.ts`.

Sub-features that could be split:
- **3A (KEEP):** Basic CRUD, message loading
- **3B (DROP):** Message tree with branching / alternate replies
- **3C (DROP):** Public share links (`/r/[id]`)

### 4. User settings (DROP)

Settings page at `/settings` with per-model config (custom prompts, provider
override, multimodal/tools toggle), theme switching (dark/light), haptics.
Store: `stores/settings.ts`. API: `/api/v2/user/settings`.
Not needed — no models to configure in Facade.

### 5. File attachments (KEEP)

Upload images, text files, PDFs into conversations. Paste from clipboard.
Fetch from URL. File preview/download. Components: `FileDropzone.svelte`,
`UploadedFile.svelte`, `UrlFetchModal.svelte`, `ImageLightbox.svelte`.
Server: `files/uploadFile.ts`, `files/downloadFile.ts`.
Needed for screenshot sharing.

### 6. Voice input (DROP)

Microphone recording, transcription API, audio waveform. Components:
`VoiceRecorder.svelte`, `AudioWaveform.svelte`. API: `/api/transcribe`.
AI-chat feature, not needed for teammate comms.

### 7. MCP (Model Context Protocol) (DROP)

MCP client with server management UI (add/remove/toggle servers), tool
calling in conversations. Components: `MCPServerManager.svelte`,
`AddServerForm.svelte`, `ServerCard.svelte`. API: `/api/mcp/*`.
Store: `stores/mcpServers.ts`. Server: `mcp/`. Not needed — Facade
does not route to LLMs.

### 8. Text generation (DROP)

LLM streaming pipeline, stop/retry, reasoning blocks, arch-router for model
fallback, text generation engine with file refs and MCP tool orchestration.
Server modules: `textGeneration/`, `router/`, `generateFromDefaultEndpoint.ts`.
Not needed — Facade is human-to-human communication.

### 9. Admin panel (DROP)

Conversation data export (`/admin/export`), usage stats (`/admin/stats/compute`).
Protected by admin API secret. Not needed for localhost tool.

### 10. Metrics & logging (PARTIAL)

Prometheus metrics endpoint at `/metrics` — **DROP** (production monitoring).
Pino structured logging (`logger.ts`) — **KEEP** (useful for debugging message
routing failures, DB errors, SSE drops).

### 11. Sharing (DROP)

Public conversation share links (`/r/[id]`), HuggingFace Hub integration.
Component: `ShareConversationModal.svelte`. Not needed — Facade is
private teammate chat.

### 12. Mobile support (KEEP)

Responsive layout, mobile nav sidebar, virtual keyboard handling.
Component: `MobileNav.svelte`. Low weight, zero maintenance cost.

### 13. Background generation (DROP)

Polls for in-progress AI generations. Component:
`BackgroundGenerationPoller.svelte`. Store: `backgroundGenerations.ts`.
AI-chat feature — not relevant for Facade.

### 14. Health check (KEEP)

`/healthcheck` endpoint returning OK. One file, zero complexity.
Useful to verify server is alive during development.

### 15. Privacy page (DROP)

Static privacy policy at `/privacy`. HF-specific, irrelevant for localhost tool.

### 16. Debug endpoints (DROP)

OpenAI debug (`__debug/openai`), config dump (`/api/v2/debug/config`),
refresh (`/api/v2/debug/refresh`). Dev aids — not needed.

### 17. Docker/Deployment (DROP)

Dockerfile, docker-compose.yml, Helm chart, entrypoint.sh. Not needed —
Facade runs locally via `npm run dev`.

### 18. Static assets (DROP branding, KEEP icons)

HF branding (favicons, manifest, OG thumbnails) — **DROP.** Reusable icon
SVGs (burger, chevron, loading, sun/moon, etc. in `components/icons/`) —
**KEEP.** Small, no deps, useful for Facade UI.

### 19. Markdown rendering (KEEP)

Renders message content as formatted text — bold, italic, code blocks with
syntax highlighting, LaTeX math, links, tables. Components:
`MarkdownRenderer.svelte`, `CodeBlock.svelte`, `MarkdownBlock.svelte`.
Utilities: `marked.ts`, `parseBlocks.ts`, `parseIncompleteMarkdown.ts`.
Essential for readable teammate communication (code snippets, formatted messages).


## Built Architecture (Facade-specific)

Everything in this section is custom code added on top of the upstream HF fork.
These files are ours — modify freely.

### Stack

- SvelteKit 2 + Svelte 5 (runes: $state, $effect, $props, $derived)
- TailwindCSS v3 for styling
- JetBrains Mono (Google Fonts CDN) — 300 weight, 12px, 1.8 line-height
- `marked` library for markdown rendering (GFM enabled)
- No database yet — state lives in `/tmp/facade-active-teammates.json`
- No auth required — localhost only

### UI Layer (Chica's spec, pixel-perfect)

| File | Purpose |
|---|---|
| `src/app.css` | All theme variables, markdown styles (Obsidianite gradients), diff rendering, code blocks |
| `src/routes/+layout.svelte` | Root layout — imports app.css, JetBrains Mono font, renders children |
| `src/routes/+page.svelte` | Main chat UI: sidebar, message grid (72px+minmax(0,1fr), 570px), input bar, markdown rendering |

Design constants:
- Font: JetBrains Mono, weight 300, 12px, line-height 1.8
- Text color: `#CDCCC2`, muted: `#808080`
- Content width: 570px max, grid columns: 72px label + minmax(0, 1fr) content
- Background: `#0b0d10` (premium black), panels: `#0e1114`, elements: `#1e1e1e`, dividers: `#282a30`
- Sidebar: 280px, `#0e1114` bg, dashed `#282a30` border, three-section layout. Section headers in Inter. Teammate names in system-ui. Chat sender labels in Inter. (Teammates, Huddles, Past Rooms) with gradient headers and 60px padding-bottom per section. Huddle rooms read from `/tmp/kitty-huddles.json` (MCP huddle server state) with host name + participant list. Teammate and huddle names are lowercase.
- Input bar: 1px dashed `#282a30` border with 2px `#5A3E2E` (copper) left border, `#1e1e1e` bg. Boss messages also get 2px `#5A3E2E` left border.
- Markdown gradients: blue-to-purple (`#5c9cf5` → `#9d7cd8`) on headings/bold/blockquotes
- Keyboard shortcuts: Ctrl+Up/Down (sidebar nav), Enter (focus input), Escape (blur input)

### Server Layer (Kitty lifecycle mirror + event-driven rooms)

| File | Purpose |
|---|---|
| `src/lib/server/kitten.ts` | Discovers Kitty socket (`KITTY_LISTEN_ON` or `/tmp/honeybloom-kitty-*.sock`). Exports: `sendToKitty()` (message delivery), `discoverSocket()` (socket discovery), `isTabAlive(teammate)` (checks if Kitty tab exists via `kitten @ ls --match`), `closeKittyTab(teammate)` (closes tab via `kitten @ close-tab --match`). Both check functions are failure-tolerant (return false on error). |
| `src/lib/server/active-teammates.ts` | JSON file state at `/tmp/facade-active-teammates.json`. Export: `activateTeammate()`, `deactivateTeammate()`, `getActiveTeammates()` |
| `src/lib/server/events.ts` | Wraps Node.js EventEmitter. Export: `emitEvent()`, `onEvent()`. Used for SSE push. |
| `src/routes/api/rooms/activate/+server.ts` | POST endpoint called by `kitty-open-teammate.sh` on tab open. Calls `activateTeammate()`, saves room to SQLite, emits SSE `room_update`. |
| `src/routes/api/rooms/deactivate/+server.ts` | POST endpoint called by `/end-session` on tab close or hover × dismiss. Smart dismiss (REQ-138): checks if Kitty tab is alive via `isTabAlive()` — if so, closes it via `closeKittyTab()` before deactivating. Then calls `deactivateTeammate()`, handles huddle cleanup (ends if host, removes + advances token if participant), emits SSE `room_update`. |

### Control Strip (REQ-139, REQ-142)

Invisible toolbar above the input bar, inside the absolute-positioned input area. Premium black (`--color-bg`) background, no border, 6px vertical padding. Uses the same 72px+1fr grid as the input bar for alignment. Contains: live mirror LED (16px gap to next icon), pause/play button, stop button. Icons are inline Lucide SVGs at 14px, `#555` default, `#7a5e4a` copper when active. VCR 3-state model: `scrollState` ('live' | 'paused') + `messageQueue` array. When paused, SSE messages for the current room queue invisibly. Play pops one and scrolls to it (`scrollIntoView block: center`). Stop flushes queue to live. Queue counter badge (copper 10px) next to play icon. Auto-flush on send and room switch.

### Floating Input Bar (REQ-68, REQ-131)

The input bar uses `position: absolute; bottom: 0` inside the `position: relative` main content container. It floats over the chat area — when the textarea grows, it expands upward over chat messages without affecting the chat scroll container's height or scroll position. The chat scroll container has `padding-bottom: 130px` to clear the default single-line input bar height (~117px + breathing room). This value is coupled to the input bar layout — if the input bar's default height changes, the padding must be updated.

Textarea auto-sizing uses CSS `field-sizing: content` (REQ-131) — native browser layout, no JavaScript. Replaced the autosize npm library which caused intermittent input bar jumps due to its intermediate `height: auto` reset during resize measurement. `max-height: 200px` caps growth; `rows="1"` sets minimum height.

### API Layer

| Route | Method | Purpose |
|---|---|---|
| `/api/rooms` | GET | Returns active teammates + huddles from JSON state |
| `/api/events` | GET | SSE stream — pushes events when room state changes |
| `/api/message` | POST | Accepts `{ sender, room, body }`. Stores message, forwards to target's Kitty tab via `kitten send-text`. Self-delivery guard: skips Kitty forward if sender is the room owner (no self-echo). |
| `/api/preferences` | GET, POST | Read/write `facade-preferences.json`. Stores `selectedRoom` (persisted sidebar selection across sessions). |

### Message Flow (REQ-013)

```
Teammate A → post_to_facade(body="hello", room="direct-b")
  → MCP server → POST /api/message { sender: "a", room: "direct-b", body: "hello" }
  → Server stores message, emits SSE event for Facade UI
  → Target check: room owner "b" !== sender "a" → deliver to Kitty
  → sendToKitty("b", "[a] hello")
  → Teammate B's Kitty tab receives the message as typed input
```

Same flow applies for Boss → teammate (sender="boss" is no longer hardcoded — the self-delivery guard handles all senders uniformly).

### Data Flow

```
Kitty tab opens (kitty-open-teammate.sh)
  → POST /api/rooms/activate { sender: "natalie" }
  → activateTeammate("natalie"), saveRoom(...) in SQLite
  → emitEvent({ type: "room_update" })
  → /api/events SSE stream pushes to browser
  → +page.svelte EventSource receives event, calls loadSidebar()
  → Sidebar re-renders with new teammate entry
```

Same flow in reverse for tab close: `/end-session` → POST `/api/rooms/deactivate` → deactivate + huddle cleanup → SSE → sidebar update. Hover × on sidebar entries provides manual dismiss for ungraceful exits (REQ-126).

### Huddle Rooms

Active huddle rooms are managed by Facade-native huddle actions in `src/routes/api/huddle/+server.ts` (REQ-61). Huddle lifecycle (start, end, add, remove participants) is handled via the `mcp-huddle-server.js` MCP server, which calls the `/api/huddle` endpoint. Rooms are stored in SQLite with type `huddle` and session-scoped IDs (`huddle-{host}-{timestamp}`). The `/api/rooms` endpoint maps each entry to a huddle sidebar item with the host name and participant list. SSE-driven sidebar refresh picks up new huddles automatically when `loadSidebar()` is called on `huddle_update` events.

### Huddle Message Flow

Messages sent to `huddle-{host}` rooms fan out to all huddle members. The `/api/message` endpoint detects huddle rooms (room ID starts with `huddle-`), reads the SQLite participants list, and delivers via `sendToKitty` to every member except the sender. Token notifications are fanned out to all members' Kitty tabs only — not saved or displayed in Facade (REQ-64, REQ-77). Client-side filter also hides historical token messages from DB.

**Room resolution (REQ-69, REQ-78):** Huddle rooms are session-scoped (`huddle-{host}-{timestamp}`). Short-form IDs like `huddle-claire` resolve to the active room via `resolveActiveRoom()` using `originalRoomId`. Resolution runs BEFORE `roomExists()` check (REQ-78) — prevents past/ghost rooms from intercepting short-form IDs. All huddle room saveRoom calls set `originalRoomId: "huddle-{host}"`. Unresolvable huddle rooms return 404 — never create phantom direct rooms.

**Dedup guard (REQ-115):** The `start` action checks `resolveActiveRoom('huddle-' + host)` before creating a new room. If an active huddle exists for the host, returns the existing room ID with `{ existing: true }` instead of creating a duplicate. Prevents MCP retries and model double-calls from creating parallel huddles.

**End auto-resolve (REQ-115):** The `end` action falls back to `resolveActiveRoom(roomId)` when `getRoom(roomId)` returns null. Handles models passing short-form IDs like `huddle-katja` instead of the full timestamped room ID.

**Late-join catch-up (REQ-133):** When a participant is added to an active huddle, they receive a chronological digest of all prior conversational messages via `sendToKitty` before the "added" notification. Token noise and tool activity cards are filtered out. Uses `getMessages(roomId)` from facade-db, formatted as `[HH:MM] sender: content` per line.

**Auto-request token (REQ-70):** Token enforcement is replaced with first-class auto-request. If the token is free, auto-grant and speak. If someone else holds it, auto-queue the sender and hold the message in `pending_messages` table. When the token advances to the queued sender, held messages are delivered automatically via `deliverPending()`. Boss-speaks and end-huddle deliver all pending messages via `deliverAllPending()` before clearing/closing. No 403 errors.

### Token Management (REQ-66/67)

Shared logic in `src/lib/server/token-helpers.ts`:
- **Boss clears (REQ-66):** When Boss posts in a huddle, token holder and queue are cleared. All members notified "Boss spoke – token released. Request to speak." Everyone re-requests fresh.
- **30s timeout (REQ-67):** `startTokenTimer(roomId)` sets a 30s setTimeout. If the holder doesn't post, the timer calls `getTokenHolder` (fire-time lookup, no stale refs) and advances to the next in queue. Timer restarts recursively if a new holder exists. Held messages for the new holder are delivered on advance.
- **Timer lifecycle:** Started on grant and token advance. Cleared on post, Boss clear, manual release, participant removal, and huddle end. No orphan timers (Pattern 1).

### Live Mirror / Tool Activity (REQ-53/54/55/80/81/82 + May 26)

Real-time tool activity relay for huddle observability. Multi-part pipeline:

1. **PostToolUse hook** (`chica/hooks/facade-relay.sh`): Registered in both Claude Code (`claude-settings.json`) and OpenCode (`opencode.json`) configs. Checks global flag at `library/facade/livemirror-global` (REQ-134). Exits immediately if absent (zero cost). Filters out `post_to_facade` tool calls (REQ-80) and credential-bearing paths (FP-12). POSTs to `/api/tool-activity` with `{ sender, room, toolName, toolInput, toolOutput, status, summary }`.

2. **Summary cards (May 26):** The hook generates compact summaries per tool type:
   - **Read**: filename + "(partial)" or "(full)" — extracted from tool output `<path>` tags and "Showing lines" footer
   - **Grep**: filename extracted from first result line in tool output
   - **Glob**: match count from output line count
   - **Bash**: command text (first 80 chars) — tool input buffered via PreToolUse temp file
   - **Edit**: filename from tool input
   - **Write**: filename from tool input
   - **Reddit/Vision**: generic descriptions
   Tools without summaries (unrecognized) render as expanded cards with full input/output.

3. **Tool input bridging (OpenCode only):** OpenCode's PostToolUse dispatch does not set `OPENCODE_TOOL_INPUT` (env var is always `{}`). Workaround: PreToolUse hook (`red-mist.sh`) writes `OPENCODE_TOOL_INPUT` to `/tmp/facade-tool-input-{teammate}`. PostToolUse hook reads this file when the env var is empty. Claude Code path is unaffected — stdin JSON carries full tool input.

4. **Case-insensitive matching (May 26):** Tool name case patterns match both uppercase (Claude Code: `Read`) and lowercase (OpenCode: `read`).

5. **API endpoint** (`src/routes/api/tool-activity/+server.ts`): Saves as `type: "tool_call"` in SQLite, emits SSE with `toolCall: true` and `summary` field. Fans out full detail to all huddle participants' Kitty tabs via `sendToKitty` (REQ-81). Format: `[live-mirror] {sender} used {toolName}` + input + output + status.

6. **UI rendering** (`renderToolCard` in `+page.svelte`): If `summary` is truthy — compact card with status icon + tool name + summary text. If falsy — expanded card with full Input/Output blocks. Word wrap via `white-space: pre-wrap` (REQ-80). Sender label baseline aligned via conditional padding (REQ-82).

Activation: Boss types `/start-livemirror` in Facade input bar. Deactivation: `/end-livemirror`. Global flag persists through reboot.

**Status indicator (REQ-135):** Green LED (8px circle, `#4ade80` with glow) left of "boss" label. Gray (`#666`) when off.

### Terminal Chatter Catcher (PostResponse, May 26)

Captures model text responses (non-MCP output) to the activity column. Two-part system:

1. **OpenCode fork** (`honeybloom.patch`): Adds `PostResponse` hook type at the loop exit in `prompt.ts`. Fires when `result === "stop"` or `lastAssistant.finish` includes "stop" with no pending tool calls. Extracts text-only parts from `lastAssistantMsg`, passes via stdin to hook script. Protected by try-catch — hook failure never crashes the session.

2. **Hook script** (`chica/hooks/facade-response.sh`): Reads response text from stdin, POSTs to `/api/tool-activity` with `{ sender, room, body }`. Room pinned to `direct-{teammate}` — terminal chatter is Boss-only, no huddle fan-out.

3. **Junk filter (May 26):** Built into facade-response.sh. Filters out responses that are ≤10 words AND contain sit-out keywords (`queue|acknowledged|holding|waiting|standing|token|nothing to add`). "OK" and "Noted" explicitly pass through (no sit-out keyword match). Prevents status acknowledgments ("OK. Standing by." etc.) from cluttering the activity column.

4. **Endpoint** (`/api/tool-activity`): Saves as `type: "response"` in SQLite, emits SSE with `response: true`. Rendered alongside tool_call cards in the activity column.

**Harness gap:** PostResponse hook type exists only in the OpenCode fork. Claude Code has no equivalent — terminal chatter is OpenCode-only.

### Wakeup Message (REQ-85, fixed May 26)

`kitty-open-teammate.sh` builds a Facade-format wakeup prompt via `build_wakeup_message()`. The prompt includes session context, Facade directive, and behavioral guidance formatted as structured metadata (`sender: boss / room: direct-{name} / timestamp / body`).

**Delivery:**
- **Claude Code**: via `--dangerously-skip-permissions "$wakeup_prompt"` — passes as initial user prompt
- **OpenCode**: via `--prompt "$wakeup_prompt"` flag (previously missing — OpenCode launched bare with no wakeup)

**Fix (May 26, 24d6dfb):** `build_wakeup_message()` was scoped inside the `else` (Claude Code) branch only. Moved before the harness check so both harnesses receive the wakeup. OpenCode gets `--prompt` flag. Claude Code path unchanged.

### REQ Log

| REQ | Description | Status |
|-----|-------------|--------|
| REQ-000 | UI integration — Chica's mockup into Facade | Shipped |
| REQ-002 | Fixed input bar position (outside scrollable area) | Shipped |
| REQ-003 | Wipe sample data — empty state | Shipped |
| REQ-004 | Kitty lifecycle mirror — teammate opens/closes in sidebar | Shipped |
| REQ-005 | SSE push replacing browser polling for instant updates | Shipped |
| REQ-006 | Facade auto-start/stop with Kitty lifecycle + port 51730 + notify_facade cleanup | DROPPED | Boss prefers manual Raycast shortcuts (Facade/Markwhen). Dead code cleaned from kitty-open-teammate.sh, watchdog deleted. |
| REQ-007 | Boss→Kitty messaging — POST /api/message, kitten send-text, SSE echo, conversation view | Shipped |
| REQ-012 | Input bar text wrapping — autosize library, auto-grow textarea, word-wrap instead of horizontal overflow | Shipped |
| REQ-013 | Sender guard removal — teammate-to-teammate Kitty delivery, unconditional forward | Shipped |
| REQ-015 | Input bar label "Boss" → "boss" | Shipped |
| REQ-016 | Sidebar architecture: 3-section layout (Teammates, Huddles, Past Rooms), natural flow, 60px section padding, scrollable | Shipped |
| REQ-017 | Huddle rooms in sidebar — reads `/tmp/kitty-huddles.json`, shows host name + participants in compact layout; teammate names lowercase | Shipped |
| REQ-018 | Premium black palette — `--color-bg: #0b0d10`, `--color-bg-panel: #0e1114`, `--color-bg-step4: #282a30`, sidebar border-right dashed | Shipped |
| REQ-019 | Dashed borders — all section dividers, provoque.ai footer, and input box use 1px dashed var(--color-bg-step4) | Shipped |
| REQ-020 | Sidebar section headers font changed to Inter | Shipped |
| REQ-021 | Sidebar teammate name fonts changed to system-ui | Shipped |
| REQ-022 | Chat sender labels font changed to Inter | Shipped |
| REQ-023 | Remove Send button, spacer preserves input bar height | Shipped |
| REQ-024 | 2px #5A3E2E copper left border on input box and boss messages | Shipped |
| REQ-025 | "Fire up Markwhen" button in sidebar, symlinks markwhen-fork.html + dist/ into static/, replaces provoque.ai footer | Shipped |
| REQ-026 | Fan-out delivery from huddle rooms — messages to huddle-{host} deliver to all members' Kitty tabs | Shipped |
| REQ-056 | Huddle state polling in room-sync.ts — `/tmp/kitty-huddles.json` polled every 3s, `huddle_update` SSE emitted on state change | Shipped |
| REQ-057 | Delete old communication tools — removed send_message (honeybloom-mailbox MCP) and post_in_huddle (honeybloom-huddle) from all teammate configs and server-huddle.py. Facade post_to_facade is the replacement. | Shipped |
| REQ-058 | Sender identity fix — removed FACADE_SENDER=rio from user-level ~/.claude.json. CWD-based derivation (`basename(process.cwd())`) now takes effect for all 30 Claude Code teammates. Type C — takes effect on session restart. | Shipped |
| REQ-060 | Session-scoped room IDs — per-session isolation for direct rooms. Room created on teammate activation with `direct-{name}-{timestamp}` ID. Past rooms display full ID with prefix. | Shipped |
| REQ-061 | Facade-native huddle lifecycle tools — start_huddle, end_huddle, add_to_huddle, remove_from_huddle, request_token, release_token. SQLite huddle_tokens table, auto-wake, sendToKitty notifications. | Shipped |
| REQ-062 | Server-side token enforcement — `/api/message` rejects huddle posts from non-holders. Boss and system exempt. `getTokenHolder()` added to facade-db. Token cleanup on participant removal. | Shipped |
| REQ-063 | Fix token enforcement placement — check before `saveMessage`/`emitEvent` instead of after. Prevents rejected posts from appearing in Facade. | Shipped |
| REQ-064 | Token notification delivery — fan-out "Token passed to X" to all huddle members' Kitty tabs via `sendToKitty`. Fixes deadlock where new holder didn't know it was their turn. | Shipped |
| REQ-065 | Chat window jump fix via ResizeObserver — FAILED. Wrong approach (JS compensation for layout problem). Replaced by REQ-068. | Failed |
| REQ-066 | Boss message clears token — holder and queue cleared, "Boss spoke – token released" notification to all members. | Shipped |
| REQ-067 | Token timeout — 30s auto-release. Timer managed across all lifecycle paths. Shared token-helpers.ts module. | Shipped |
| REQ-068 | Floating input bar — position absolute over chat area. padding-bottom clearance. Replaces REQ-065. | Shipped |
| REQ-069 | Huddle room resolution — short-form IDs resolve to active session-scoped room via originalRoomId. Guard prevents phantom direct rooms. Ghost rooms cleaned. | Shipped |
| REQ-070 | Auto-request token — no 403. Token free → auto-grant. Someone else holds → auto-queue + hold message in pending_messages. Delivered on token advance, Boss-speaks, or huddle end. | Shipped |
| REQ-126 | Event-driven room lifecycle — replaces 3s room-sync polling with POST /api/rooms/activate (tab open) and POST /api/rooms/deactivate (tab close / ungraceful exit). Deactivate handles huddle cleanup. room-sync.ts deleted. Hover × in sidebar for manual dismissal. | Shipped |
| REQ-138 | Smart dismiss — × button checks if Kitty tab is alive via `isTabAlive()`. If alive, closes it via `closeKittyTab()` before deactivating. Covers CMD+W and crash cases without polling. | Shipped |
| REQ-139 | Control strip + auto-scroll pause. Invisible strip above input bar (premium black, no border). Contains live mirror LED (relocated from boss label) and scroll pause toggle. Pause gates the $effect scroll-to-bottom. Auto-resumes on send. Copper (#7a5e4a) when paused, gray (#555) when active. Lucide inline SVGs. | Shipped |
| REQ-140 | Auto-reconnect on tab visibility change. `visibilitychange` listener reconnects SSE EventSource + reloads sidebar + current room messages when Boss returns from another browser tab. Fixes blank screen after backgrounded tab. SSR guard on onDestroy. | Shipped |
| REQ-142 | VCR step-through scroll control. 3-state model: live (auto-scroll), paused (messages queue invisibly), step-through (play pops one at a time with scrollIntoView). Stop flushes queue to live. Queue counter badge (copper 10px). Control strip: LED + pause/play + stop. Auto-flush on send and room switch. Replaces REQ-139 simple pause. Padding-bottom 120px. | Shipped |
| REQ-260 | Auto-pause for huddle rooms. Huddles start paused on entry via `stoppedHuddles` Set. stepOne batch-pops terminal chatter + next real message. Boss messages bypass queue (SSE sender guard). Only Stop breaks pause permanently. | Shipped |
| REQ-262 | Multi-huddle auto-pause fix. All huddles implicitly paused unless in `stoppedHuddles` — removes single-string `pausedRoom` dependency for huddles. `queuedMessageIds` changed from flat `string[]` to per-room `Record<string, string[]>`. SSE handler, DB load path, flushQueue, stepOne, sendMessage all updated. `isCurrentRoomPaused` $derived centralizes pause check. Ctrl+Right calls `stepOne()`. | Shipped |
| REQ-264 | Sidebar nav clamp — Ctrl+Up/Down stops at top/bottom instead of wrapping. `Math.min`/`Math.max` replaces modulo. | Shipped |
| — | **Terminal chatter catcher** — PostResponse hook in OpenCode fork. Captures model text output to Facade activity column. Junk filter (≤10 words + sit-out keywords). OpenCode-only (Claude Code has no PostResponse hook type). | Shipped May 26 |
| — | **Summary cards v2** — Read shows filename + partial/full, Grep shows filename, Glob shows match count, Bash shows command (80 chars), Edit/Write show filename. Case-insensitive tool name matching. PreToolUse temp file bridges tool input for OpenCode. | Shipped May 26 |
| — | **Wakeup fix** — OpenCode now receives wakeup prompt via `--prompt` flag (was launching bare). `build_wakeup_message()` moved outside Claude Code branch. | Shipped May 26 |

## Conventions

- No em dashes. En dash with spaces for dashes: "the app — built for privacy".
- Follow existing patterns (Svelte 5 runes, Tailwind classes).
- No comments unless explaining a non-obvious decision.
- ARCHITECTURE.md is the source of truth. Update after every shipped REQ.
