# Aether -- Architecture

Forked from HuggingFace Chat UI (github.com/huggingface/chat-ui). Upstream features (auth, model switching, text generation, admin panel, sharing, voice input) remain in the codebase as dead code -- do not touch, do not extend, do not fix. If a build error traces to upstream code, stub it out.

Aether is the org's real-time communication backbone -- messaging, huddles, live mirror, speed reader, terminal chatter. SvelteKit app on the Mac Mini at port 51730, SQLite DB at `library/aether/aether.db`.

---

## 1. Directory Structure

```
library/aether-app/                    # App codebase (git: valaquer/aether)
├── src/
│   ├── app.css                        # Theme: foundation.css import + Tailwind
│   ├── app.html                       # HTML shell
│   ├── hooks.server.ts                # SvelteKit server hooks
│   ├── lib/
│   │   ├── server/
│   │   │   ├── aether-db.ts           # SQLite layer -- all DB reads/writes
│   │   │   ├── active-teammates.ts    # /tmp JSON state for online roster
│   │   │   ├── events.ts             # EventEmitter wrapper for SSE push
│   │   │   ├── huddle-helpers.ts      # endHuddle, removeFromHuddle, removeFromAllHuddles
│   │   │   ├── token-helpers.ts       # Huddle token triage, timeout, fan-out
│   │   │   ├── kitten.ts             # Kitty socket discovery, sendToKitty, process cleanup
│   │   │   ├── houston-state.ts       # Houston alert state (in-memory)
│   │   │   ├── houston-triage.ts      # 10-min triage timeout timer
│   │   │   ├── config.ts             # App configuration
│   │   │   ├── conversation.ts        # Upstream conversation CRUD (partially used)
│   │   │   ├── database.ts           # Upstream MongoDB adapter (unused -- we use SQLite)
│   │   │   ├── harness-reader.ts      # Codex rollout terminal chatter capture
│   │   │   ├── codex-rollout.ts       # Codex rollout cursor management
│   │   │   └── ...                    # Upstream dead code (endpoints/, router/, textGeneration/, mcp/, auth, models)
│   │   ├── components/                # Svelte UI components (mostly upstream, some kept)
│   │   │   ├── chat/                  # ChatMessage, MarkdownRenderer, ChatInput, etc.
│   │   │   ├── icons/                 # Lucide SVG icons
│   │   │   └── ...
│   │   ├── stores/                    # Svelte stores (upstream, partially used)
│   │   ├── types/                     # TypeScript type definitions
│   │   ├── utils/                     # Client-side utilities (markdown, URL handling)
│   │   ├── constants/                 # Shared constants
│   │   ├── actions/                   # Svelte actions (snapScrollToBottom)
│   │   ├── jobs/                      # Background jobs
│   │   ├── migrations/               # DB migration scripts
│   │   └── workers/                   # Web workers
│   └── routes/
│       ├── +page.svelte               # Main UI (1537 lines) -- sidebar, chat panel, activity panel, speed reader
│       ├── +layout.svelte             # Root layout
│       ├── renderUtils.ts             # Markdown + tool card rendering
│       ├── clipboardUtils.ts          # Copy/print room helpers
│       ├── bookmarkStore.svelte.ts    # Bookmark state management
│       ├── rulerStore.svelte.ts       # Measurement ruler state
│       └── api/
│           ├── message/               # POST: send message, fan-out, token enforcement
│           ├── rooms/                 # GET: sidebar data (Direct Rooms, Huddle Rooms, Past Sessions)
│           │   ├── activate/          # POST: teammate comes online
│           │   └── deactivate/        # POST: teammate goes offline + huddle cleanup
│           ├── huddle/                # POST: start/end/add/remove/request/pass
│           ├── archive-huddle/        # POST: archive huddle session to Past Sessions
│           ├── huddle-history/        # GET: past huddle data
│           ├── events/                # GET: SSE stream
│           ├── messages/              # GET: message history for a room
│           ├── tool-activity/         # POST: live mirror tool card ingestion
│           ├── houston-alert/         # GET/POST/DELETE: cop car LED state
│           ├── houston-escalate/      # POST: triage timeout escalation
│           ├── houston-heartbeat/     # POST: poller heartbeat
│           ├── speed-reader-*/        # Speed reader chunk/session management (6 endpoints)
│           ├── preferences/           # GET/POST: UI preferences
│           ├── bookmarks/             # GET/POST/DELETE: message bookmarks
│           ├── pinned-rooms/          # GET/POST/DELETE: pinned room state
│           ├── broadcast/             # POST: broadcast to all teammates
│           ├── workbench-apps/        # GET: workbench app registry
│           ├── start-workbench-app/   # POST: launch workbench apps
│           ├── tab-closed/            # POST: handle ungraceful tab close
│           ├── active-rooms/          # GET: active rooms for a teammate
│           ├── pulse/                 # POST: unread pulse notification
│           ├── dismiss-pulse/         # POST: clear pulse
│           ├── print/                 # POST: generate printable room transcript
│           ├── copy-room/             # POST: copy room to clipboard
│           ├── livemirror-status/     # GET: live mirror on/off state
│           ├── rsvp-check/            # GET: huddle RSVP check
│           └── fetch-url/             # POST: proxy URL fetch
├── scripts/
│   ├── mcp-aether-server.js           # MCP server: post_to_aether, speed reader tools
│   └── mcp-huddle-server.js           # MCP server: huddle lifecycle + token tools
├── build/                             # Production build output
├── static/                            # Static assets
└── package.json                       # SvelteKit 2 + Svelte 5 + better-sqlite3

library/aether/                        # Data directory (NOT in git)
├── aether.db                          # SQLite database (~2.3GB)
├── aether.db-shm, aether.db-wal      # WAL mode companions
├── aether-preferences.json            # UI preferences
├── workbench-apps.json                # Workbench app registry
├── livemirror-global                  # Live mirror activation flag
├── junk-phrases.md                    # Terminal chatter junk filter phrases
├── backups/                           # DB snapshots
├── snapshots/                         # State snapshots
└── reminders-state/                   # Reminder state files
```

---

## 2. Dependency Graph

### External Dependencies (runtime-critical)

```
aether-app
├── better-sqlite3          # SQLite driver -- all persistent state
├── @modelcontextprotocol/sdk  # MCP server framework (mcp-aether-server, mcp-huddle-server)
├── svelte 5 + @sveltejs/kit 2  # UI framework + server
├── marked                  # Markdown rendering
├── tailwindcss 3           # Styling
├── uuid                    # Message/room ID generation
└── openai                  # Unused (upstream dead code, still in deps)
```

### Internal Module Dependencies

```
+page.svelte (UI)
  ├── renderUtils.ts (markdown + tool cards)
  ├── clipboardUtils.ts
  ├── bookmarkStore.svelte.ts
  └── rulerStore.svelte.ts

/api/message (message routing)
  ├── aether-db.ts (save, resolve rooms, token check, huddle members)
  ├── kitten.ts (sendToKitty fan-out)
  ├── events.ts (SSE emit)
  ├── token-helpers.ts (triage, timeout, token advance)
  └── houston-triage.ts (watchtower room clear)

/api/huddle (huddle lifecycle)
  ├── aether-db.ts (room CRUD, token init, member queries)
  ├── huddle-helpers.ts (endHuddle, removeFromHuddle)
  ├── token-helpers.ts (timer management)
  ├── kitten.ts (auto-wake, sendToKitty notifications)
  └── events.ts (SSE emit)

/api/rooms/deactivate (session end)
  ├── huddle-helpers.ts → removeFromAllHuddles
  ├── aether-db.ts (resolveActiveRoom, setRoomType)
  ├── active-teammates.ts (deactivateTeammate)
  ├── kitten.ts (cleanupMiniAndMaybeCloseTab)
  └── events.ts (SSE emit)

huddle-helpers.ts
  ├── aether-db.ts (room queries, member lists, room type changes)
  ├── token-helpers.ts (clearTokenTimer, clearQueueAndRetriage)
  ├── events.ts (SSE emit)
  └── kitten.ts (sendToKitty notifications)

kitten.ts
  ├── /opt/homebrew/bin/kitten (Kitty remote control binary)
  ├── /tmp/honeybloom-kitty-*.sock (Kitty socket -- discovered at runtime)
  ├── janus-config.csv (harness lookup for OpenCode inbox routing)
  └── open-team.sh (teammate launcher)

mcp-aether-server.js → POST /api/message, /api/speed-reader-*
mcp-huddle-server.js → POST /api/huddle, /api/message (read_room)
```

### External System Dependencies

```
ORG.md (library/wiki/Organization/ORG.md)
  Read by: /api/rooms (sidebar groups, roster, permanent team huddle rooms from Groups, permanent project rooms from "Active project rooms in Aether")
           /api/huddle (project validation, team leader list)
           /api/message (cross-huddle routing -- sender's team host lookup)

janus-config.csv (library/scripts/janus-config.csv)
  Read by: /api/rooms (model labels in sidebar)
           kitten.ts (harness lookup for inbox routing)

Kitty terminal (local process on Mac Mini)
  Used by: kitten.ts for all message delivery, tab lifecycle, teammate launch

open-team.sh (library/scripts/open-team.sh)
  Called by: kitten.ts:launchTeammate() for auto-wake

Houston poller (OPS-scripts/houston-poller.py)
  Calls: /api/houston-alert (POST alerts), /api/houston-heartbeat (POST heartbeat)

PostToolUse hooks (library/scripts/hooks/aether-relay.sh)
  Calls: /api/tool-activity (POST tool cards for live mirror)
```

---

## 3. Data Flow

### Message Delivery

```
Teammate A's Claude Code session
  → MCP tool: post_to_aether({ body, room })
  → mcp-aether-server.js derives sender from CWD basename
  → POST /api/message { sender: "a", body, room: "direct-b" }
  → Server: resolveActiveRoom("direct-b") → "direct-b-20260802-095500"
  → Token check (huddle rooms only): getTokenHolder() must match sender
  → Cross-huddle notice prepend (if sender not a participant)
  → saveMessage() → SQLite messages table
  → emitEvent({ type: "message" }) → SSE stream → browser UI updates
  → Fan-out: sendToKitty("b", payload) → kitten send-text to Kitty tab
  → Teammate B's Claude Code receives text as stdin input
```

### Huddle Lifecycle

```
start_huddle MCP tool
  → POST /api/huddle { action: "start", host, participants, project? }
  → Dedup: resolveActiveRoom("huddle-{host}") -- return existing if found
  → Work huddle: validate project against ORG.md, check uniqueness constraints
  → saveRoom({ id: "huddle-{host}-{ts}", type: "huddle", participants })
  → initHuddleToken(roomId) → huddle_tokens table
  → Auto-wake: ensureTabOpen() for each participant → kitten.ts
  → System message saved + SSE emitted + Kitty fan-out to all members
```

### Teammate Activation/Deactivation

```
Tab opens (open-team.sh)
  → POST /api/rooms/activate { name: "chica" }
  → saveRoom({ id: "direct-chica-{ts}", type: "teammate" })
  → activateTeammate() → /tmp/aether-active-teammates.json
  → emitEvent({ type: "huddle_update" }) → sidebar refresh

Tab closes (end-session skill or manual)
  → POST /api/rooms/deactivate { name: "chica" }
  → Teammate stays in all huddle participant lists (not removed)
  → setRoomType(directRoom, "past")
  → deactivateTeammate() → removes from /tmp JSON
  → emitEvent({ type: "huddle_update" })
  → setTimeout 2s → cleanupMiniAndMaybeCloseTab() → kill process + close tab
```

### SSE Event System

```
Server: emitEvent({ type, ... })
  → Node.js EventEmitter ("aether-event")
  → All connected SSE clients receive the event
  → Browser: EventSource at /api/events
  → +page.svelte: processes event type
    → "message": update chat panel if current room matches
    → "huddle_update": reload sidebar (fetch /api/rooms)
    → "speed_reader_chunk": update speed reader display
```

### Live Mirror (Tool Activity)

```
Teammate's PostToolUse hook (aether-relay.sh)
  → Checks livemirror-global flag exists
  → Filters: skip post_to_aether calls, skip credential paths
  → POST /api/tool-activity { sender, room, toolName, toolInput, toolOutput }
  → saveMessage(type: "tool_call") + SSE emit(toolCall: true)
  → Fan-out to huddle members via sendToKitty (format: [live-mirror] ...)
```

---

## 4. Blast Radius Map

### aether-db.ts
Touches: EVERYTHING. Every API endpoint, both MCP servers, huddle-helpers, token-helpers. Changes here affect all message storage, room management, token state, bookmarks, speed reader, Houston alerts.

### huddle-helpers.ts
Touches: /api/huddle (lifecycle), /api/rooms/deactivate (cleanup), token-helpers. Changes affect huddle creation, ending, participant management, and the deactivation cleanup path.

### kitten.ts
Touches: /api/message (delivery), /api/huddle (auto-wake), /api/rooms/deactivate (process cleanup), /api/rooms (alive check), token-helpers (Kitty fan-out). Changes affect ALL message delivery to teammates and the entire teammate lifecycle.

### token-helpers.ts
Touches: /api/message (triage after Boss speaks, retriage after post), /api/huddle (timer management), huddle-helpers (cleanup on remove). Changes affect the entire huddle speaking-turn system.

### events.ts
Touches: Every endpoint that modifies state. Changes affect ALL real-time UI updates.

### /api/message/+server.ts
Touches: Message storage, huddle fan-out, token enforcement, cross-huddle routing, Houston triage. This is the busiest endpoint -- changes have the widest blast radius of any single file.

### /api/rooms/deactivate/+server.ts
Touches: Huddle membership (removeFromAllHuddles), room lifecycle, teammate state, process cleanup. Changes affect what happens when ANY teammate session ends.

### /api/huddle/+server.ts
Touches: Room creation (team + work huddles), participant management, token initialization, auto-wake, dedup guards, ORG.md validation. Changes affect all huddle operations.

### /api/rooms/+server.ts
Touches: Sidebar rendering. Reads ORG.md (roster, sidebar groups), janus-config.csv (model labels), active-teammates.ts JSON cache (online state). Changes affect what Boss sees in the sidebar. No longer calls `kitten @ ls` directly -- reads the cached JSON file instead.

### +page.svelte (1537 lines)
Touches: All client-side rendering -- sidebar, chat panel, activity panel, speed reader, VCR controls, bookmarks, keyboard shortcuts. Changes can introduce visual regressions visible to Boss in real time.

### ORG.md (external)
Read by: /api/rooms, /api/huddle, /api/message. Changes to roster, sidebar order, groups, or project list affect sidebar rendering, huddle validation, and cross-huddle routing.

### janus-config.csv (external)
Read by: /api/rooms (model labels), kitten.ts (harness routing). Changes affect sidebar model badges and OpenCode inbox routing.

### open-team.sh (external)
Called by: kitten.ts:launchTeammate(). Changes affect auto-wake behavior for huddle participants and incoming messages.

---

## 5. Known Issues

### Permanent huddle rooms (Aug 2)
Huddle rooms are permanent sidebar fixtures sourced from ORG.md -- 10 team rooms from Groups section, project rooms from "Active project rooms in Aether" section. The rooms API merges ORG.md fixtures with active DB rooms via `resolveActiveRoom()`. Active sessions use their DB room ID; inactive fixtures use sentinel IDs (`fixture-huddle-{host}`, `fixture-work-{project}`). Archive moves session messages to Past Sessions but the fixture stays. Deactivation no longer removes teammates from huddles -- offline participants stay greyed out.

### Sidebar blink on mass boot
When Boss hits Raycast start and all 26 teammates activate simultaneously, the /api/rooms endpoint is called rapidly. Each activation emits a `huddle_update` SSE event, causing the browser to re-fetch /api/rooms repeatedly. The sidebar teammates column blinks on/off for 1-2 minutes until all activations settle. Likely cause: `getAliveTeammates()` polls Kitty socket `ls` which is expensive during mass boot.

### +page.svelte size
At 1537 lines, the main page file handles sidebar, chat, activity panel, speed reader, VCR controls, bookmarks, keyboard shortcuts, and lightbox -- all in one component. Further extraction is blocked on needing a central message store (per PLAYBOOK).

### Stale references
ARCHITECTURE.md (this file) previously used "Facade" (old project name) throughout and referenced deprecated systems (OpenCode, Codex, `/tmp/facade-*` paths). Active teammates file is `/tmp/aether-active-teammates.json`. MCP servers are `honeybloom-aether` and `honeybloom-huddle`.

### Database size
aether.db is ~2.3GB and growing. No retention policy or archival mechanism exists. WAL mode is enabled.

### SSE activation gap (REQ-305 fix shipped)
Fixed Aug 3. Root cause: three simultaneous failures -- SSE connection going stale (no keepalive, no onerror), sidebar poller hitting `kitten @ ls` timeouts under load, and visibility reconnect not retrying on first failure. Fix: 15s SSE heartbeat, client onerror with exponential backoff, visibility retry at 2s, and `/api/rooms` now reads JSON cache instead of calling `kitten @ ls` on every request. Background reconciler syncs JSON with Kitty every 30s.

---

## Conventions

- Svelte 5 runes ($state, $effect, $props, $derived) -- no legacy Svelte 4 patterns
- TailwindCSS v3 for styling
- JetBrains Mono, weight 300, 12px, line-height 1.8
- Foundation.css shared with Bavaria, Ember, Wiki apps (symlinked into src/lib/)
- Sidebar CSS shared via sidebar.css (symlinked)
- En dash with spaces for dashes. No em dashes.
- No comments unless explaining a non-obvious decision
- Room IDs: `direct-{name}-{timestamp}`, `huddle-{host}-{timestamp}`, `work-{host}-{timestamp}`
- `isHuddleRoom(id)` checks `startsWith("huddle-") || startsWith("work-") || startsWith("fixture-huddle-") || startsWith("fixture-work-")`
- Sidebar sections: Huddle Rooms, Direct Rooms, Past Sessions
- Permanent fixtures use sentinel IDs: `fixture-huddle-{host}`, `fixture-work-{project}`
- Boss and system are exempt from token enforcement
- Update this file after every shipped REQ (R14)
