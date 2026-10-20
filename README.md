# ChipRoom

ChipRoom is a real-time, private poker **chip manager** for home games. Friends join a room with a six-character code, receive virtual chips, bet through the streets, and the host chooses the winner of each pot. It deliberately does **not** deal cards, evaluate hands, or decide a winner from cards — the cards stay on your real table.

The server is authoritative: all chips, turns, pots, payouts and history are computed and persisted on the backend. The React client is a live view and control surface.

## Features

- Landing page with create/join flows and a dark emerald poker-table theme.
- Private rooms with room name, host nickname, starting stack, blinds, 2–10 seats, optional password, spectators, late joining, rebuys and host approval.
- Shareable six-character room codes and copyable invite links.
- Guest sessions with reconnect by stored session token; refresh or a dropped socket does not lose chips or duplicate a seat.
- Server-authoritative No-Limit betting: check, bet, call, raise, fold, all-in.
- Minimum bet/raise validation, short all-in raise rules, raise reopening rules, stack limits and server-side turn ownership.
- Automatic street progression (`preflop → flop → turn → river`) with no cards dealt.
- Automatic settlement when only one unfolded player remains.
- Main and side pots built from contribution tiers, including folded dead money and multiple all-ins.
- Manual host settlement per pot with ties, equal splits, clockwise odd-chip allocation, payout preview and server-recomputed confirmation.
- Dealer button rotation, heads-up blind order, short all-in blinds, sitting out, disconnect status and host force-fold/recovery controls.
- Live action feed, hand history, contribution/pot/payout detail, session statistics and an auditable chip-adjustment ledger.
- Host dashboard for starting/pausing/resuming hands, approving/removing players, settings, rebuys, sit-outs, hand recovery and confirmed room reset.
- Responsive table with keyboard-accessible controls, toasts, dialogs, loading/empty/error states and poker-term tooltips.

## Stack

| Layer | Technology |
| --- | --- |
| Client | React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide, Socket.IO client |
| Server | Node.js, Express, TypeScript, Socket.IO, Zod |
| Database | PostgreSQL, Drizzle ORM, SQL migrations |
| Tests | Vitest (engine/pot unit tests and PostgreSQL integration tests) |
| Shared | npm workspace with Zod schemas and DTO types used by client and server |

```
.
├── client/                  React application
├── server/                  Express + Socket.IO API
│   ├── drizzle/             Generated SQL migrations
│   └── src/
│       ├── db/              Drizzle schema, client, migration runner
│       ├── game/            Betting engine and pot engine (pure, tested)
│       ├── services/        Room, hand, settlement and history transactions
│       ├── http.ts          REST endpoints and error mapping
│       ├── socket.ts        Realtime events, personalized broadcasts, presence
│       └── index.ts         HTTP server, static client serving, shutdown
├── shared/                  Shared types, enums and Zod request schemas
└── eslint.config.js
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 14 or newer

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the environment files:

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

   Edit `server/.env` if your PostgreSQL user, password, host or port differ.

3. Create a database and apply migrations:

   ```bash
   createdb chiproom
   npm run db:migrate
   ```

   Or with `psql`:

   ```sql
   CREATE DATABASE chiproom;
   ```

4. Start the API and client together:

   ```bash
   npm run dev
   ```

   - Client: <http://localhost:5173>
   - API: <http://localhost:3001>
   - Health check: <http://localhost:3001/api/health>

   `npm run dev` rebuilds the shared package first, then runs the server and Vite client concurrently. You can also run them in separate terminals with `npm run dev:server` and `npm run dev:client`.

## Environment variables

### Server (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/chiproom` | PostgreSQL connection string |
| `PORT` | `3001` | API/socket port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated allowed browser origins |
| `NODE_ENV` | `development` | Set to `production` when deployed |
| `TRUST_PROXY` | unset | Set to `1` behind a trusted reverse proxy so `req.ip` is real |
| `DATABASE_POOL_MAX` | `10` | Maximum PostgreSQL pool size |
| `CLIENT_DIST` | `../client/dist` | Optional override for the built client directory |
| `TEST_DATABASE_URL` | local `chiproom_test` | Used by integration tests |

### Client (`client/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | empty (same origin) | API base URL during development, e.g. `http://localhost:3001` |

In production, build the client and serve it from the API process. Leave `VITE_API_URL` empty so REST and Socket.IO use the same origin.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Build shared package and run API + client concurrently |
| `npm run dev:server` | API with `tsx watch` |
| `npm run dev:client` | Vite dev server |
| `npm run build` | Build shared, client and server for production |
| `npm start` | Start the built API; serves `client/dist` when present |
| `npm test` | Run all Vitest unit and integration tests once |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | TypeScript check for all workspaces |
| `npm run lint` | ESLint across the repository |
| `npm run db:migrate` | Apply generated SQL migrations |
| `npm run db:generate` | Generate a new migration after changing the schema |

## How the game works

### Hand lifecycle

1. The host starts a hand. Eligible seated players with chips are included.
2. The dealer button moves clockwise from the previous hand. The small and big blinds are posted; a short stack can post an all-in blind.
3. Preflop action begins left of the big blind. In heads-up play the dealer posts the small blind and acts first preflop.
4. A betting round ends when every player who can act has acted and matched the current bet. The next street starts left of the dealer.
5. If nobody can act (everyone remaining is all-in), the remaining streets run out automatically and the hand waits for settlement.
6. If only one player remains unfolded, the server awards every pot to that player transactionally and marks the hand complete.
7. Otherwise the host selects eligible winners for each pot, reviews the server-computed payout preview, and confirms.
8. The host starts the next hand manually.

### Betting rules

- A check is only legal when there is nothing to call.
- A bet or raise must meet the minimum increment. The server also caps targets at the player's remaining stack.
- An all-in for less than a full raise does not reopen betting for players who already acted; they may call or fold but not re-raise.
- Folded and all-in players are skipped by the turn machine.
- Invalid actions, out-of-turn actions, duplicate retries and overspending are rejected server-side.
- Every action has a client-supplied idempotency key. Retrying the same action returns the existing result instead of applying it twice.

### Pots and payouts

Pot layers are derived from each player's total contribution:

- Every ascending contribution level creates a layer.
- Folded players' chips remain in the pot but folded players are never eligible.
- A layer with no eligible player is merged into the next lower pot so no chip is stranded.
- Ties split equally. If a pot does not divide evenly, the remainder is awarded one chip at a time clockwise starting left of the dealer, with the dealer last.
- The host cannot select a folded or ineligible player, skip a pot, or settle the same hand twice.
- Every payout is a single database transaction with a duplicate-payout guard and a chip-conservation check.

### Invariant

For every room:

```
sum(player stacks) + chips committed to the current hand = room.totalChips
```

`room.totalChips` changes only through recorded host-authorized chip adjustments (initial buy-in, rebuy, removal, reset). Adjustments are append-only ledger entries with amount, reason, host and timestamp.

## Database

Tables: `rooms`, `players`, `hands`, `hand_players`, `actions`, `pots`, `payouts`, `chip_adjustments`.

- Integer chips only.
- Unique room-code, room-seat and room-nickname indexes.
- Foreign keys with cascade behavior for room-owned rows.
- Hand/action history is append-only.
- Balance changes and payout writes run inside PostgreSQL transactions with room-row locking.
- Drizzle migrations live in `server/drizzle/`.

## API and realtime surface

REST:

- `POST /api/rooms` — create a room and host session
- `GET /api/rooms/:code` — public room preview
- `POST /api/rooms/:code/join` — join as player or spectator
- `GET /api/rooms/:code/state` — personalized state (`x-session-token`)
- `GET /api/rooms/:code/history` — hand history and stats (`x-session-token`)
- `GET /api/health` — health check

Socket.IO: the client subscribes with a room code and session token. Server-to-client state is personalized so hidden host-only data (such as the audit ledger) is not broadcast to every player.

Client events: `room:subscribe`, `room:ready`, `room:action`, `room:history`, `host:startHand`, `host:pause`, `host:resume`, `host:close`, `host:reset`, `host:settings`, `host:approve`, `host:kick`, `host:sitOut`, `host:adjustChips`, `host:previewSettlement`, `host:settle`, `host:recoverHand`, `host:advanceHand`.

Server events: `room:state`, `room:error`, `room:removed`.

## Testing

Integration tests use a separate database and truncate it between tests. Create it once:

```bash
createdb chiproom_test
```

Then run:

```bash
npm test
```

The suite includes:

- Blind posting, heads-up/three-handed order, dealer rotation and short all-in blinds.
- Every betting action, invalid actions, min bets/raises, overspending, turn enforcement and short all-in reopening.
- Street advancement, automatic run-outs, folds and auto-win.
- Contribution-tier pots, side pots, folded eligibility, dead money, ties and odd chips.
- Manual settlement preview, duplicate settlement prevention and payout conservation.
- Room create/join/password/approval/full-room/late-join/removal and unauthorized actions.
- Token authentication, reconnect-style state reads, concurrent action serialization and chip conservation.
- Host adjustments, audit entries, reset confirmation, pause/resume/close and settings guards.

If your test database is not the local default, set `TEST_DATABASE_URL` when running tests:

```bash
TEST_DATABASE_URL=postgres://user:pass@host:5432/chiproom_test npm test
```

## Production build and deployment

1. Set production environment variables. At minimum:

   ```bash
   DATABASE_URL=postgres://user:password@host:5432/chiproom
   NODE_ENV=production
   PORT=3001
   CLIENT_ORIGIN=https://your-domain.example
   TRUST_PROXY=1
   ```

2. Install, build and migrate:

   ```bash
   npm ci
   npm run build
   npm run db:migrate
   ```

3. Start:

   ```bash
   npm start
   ```

   The Express server serves the built client from `client/dist`, including SPA fallback routes. Put it behind HTTPS (Caddy, nginx, a platform load balancer) and keep the same origin for the UI and Socket.IO.

A simple single-instance deployment can run the API and PostgreSQL on one host. For multiple API instances, add a shared Socket.IO adapter (for example Redis) and a shared rate limiter; the current presence and rate-limit maps are process-local.

## Security notes

- Room passwords are hashed with bcrypt and never returned.
- Session tokens are random, stored client-side per room code, and required for state/history reads and every socket action.
- Host-only operations re-check `hostPlayerId` on the server.
- Zod validates REST and socket payloads; payloads are capped at 64 KB.
- Rate limits apply to room creation, joins, state reads, subscriptions and actions.
- Helmet, CORS allow-listing, static caching and JSON body limits are configured.
- Actions are idempotent and settlement is transactional, preventing duplicate payouts.
- This is a chip tracker for friends, not a gambling or real-money service.

## Limitations

- No cards, hand evaluation or card-based winner announcement. Settlement is manual by design.
- No user accounts, email recovery or cross-device identity. Access depends on the session token stored in the browser.
- One room per browser tab at a time; multiple tabs share the stored session.
- Socket.IO presence, rate limits and broadcast fan-out are process-local, so horizontal scaling needs a shared adapter and limiter.
- The host is trusted to choose the correct winners. The server enforces pot eligibility, arithmetic and chip conservation, not the real-life card outcome.
- No tournament blind schedules, time banks, chat, voice, or real-money payments.
# chip_manager
