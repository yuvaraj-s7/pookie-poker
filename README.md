# Scrum Poker

A modern real-time Scrum Poker / Planning Poker web app built with Next.js, React, TypeScript, Express, Socket.IO, and Tailwind CSS.

Teams can create rooms, join with a room code, vote privately, reveal estimates together with animated card flips, calculate averages, detect consensus, and reset for a new round.

## Features

- Create and join rooms with a short room code
- Moderator role for revealing votes, resetting rounds, and editing the story
- Hidden votes until the moderator reveals
- 3D card flip animation on reveal
- Average estimate using numeric votes only
- Consensus detection when all numeric votes match
- Participant list with online, voted, waiting, and revealed states
- Invite link copy button with browser fallback
- Responsive layout for desktop, tablet, and mobile
- In-memory room/session storage

## Tech Stack

- Next.js
- React
- TypeScript
- Node.js
- Express
- Socket.IO
- Tailwind CSS

## Important Deployment Note

This app uses a custom long-running Node.js server in [`server.ts`](./server.ts). That server runs Express, prepares Next.js, and attaches Socket.IO for real-time WebSocket communication.

Vercel is excellent for standard Next.js apps, but Vercel serverless functions are not designed to host a persistent Socket.IO WebSocket server with in-memory room state.

Because of that, the current app cannot be deployed to Vercel as-is with full real-time Socket.IO behavior.

You have two good deployment paths:

1. Deploy the full app to a Node server platform such as Render, Railway, Fly.io, DigitalOcean, AWS, or a VPS.
2. Refactor the app for Vercel by replacing the in-memory Socket.IO server with a hosted realtime/state service such as Ably, Pusher, Liveblocks, Supabase Realtime, Upstash Redis, or a separate backend.

The fastest working deployment is option 1.

## Local Development

### Requirements

- Node.js 20 or newer
- npm

Check your versions:

```bash
node -v
npm -v
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is already in use:

```bash
PORT=3001 npm run dev
```

Then open:

```text
http://localhost:3001
```

## Production Build Locally

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

Or run on a custom port:

```bash
PORT=3001 npm start
```

Important: if you run `npm run dev` after `npm run build`, Next.js can rewrite `.next` for development. Before running production again, run:

```bash
npm run build
npm start
```

## How To Use

### Create a Room

1. Open the app.
2. Enter your name.
3. Click **Create Room**.
4. You become the moderator.
5. Share the room code or invite link with your team.

### Join a Room

1. Open the app.
2. Click **Join**.
3. Enter your name.
4. Enter the room code.
5. Click **Join Room**.

### Vote

1. Select one planning poker card.
2. You can change your vote before reveal.
3. Other participants only see that you voted, not the value.

### Reveal Votes

Only the moderator can reveal votes.

1. Click **Reveal Votes**.
2. All participant cards flip at the same time.
3. The results section shows all votes, average estimate, and consensus status.

### Start a New Round

Only the moderator can reset voting.

1. Click **Reset Voting**.
2. Votes are cleared.
3. Cards return to the hidden state.
4. Participants can vote again.

### Edit Story

Only the moderator can edit the story.

1. Click **Edit** in the story section.
2. Update the title or description.
3. Click **Save**.

## Room Data And Persistence

Room data is stored in server memory only.

That means:

- No database is required.
- Rooms are fast and simple.
- Rooms disappear when the server restarts.
- Data is not shared across multiple server instances.

This is expected for the MVP.

## Deploying The Current App

Use a platform that supports a persistent Node.js process and WebSockets.

Good options:

- Render Web Service
- Railway
- Fly.io
- DigitalOcean App Platform
- AWS EC2 / ECS
- VPS with Node.js and PM2

### Required Build Settings

Use these commands on your hosting platform:

```bash
npm install
npm run build
npm start
```

Set the Node version to 20 or newer.

The platform should provide a `PORT` environment variable. The server already reads it:

```ts
const port = Number(process.env.PORT ?? 3000);
```

### Render Example

Create a new **Web Service** and use:

```text
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
```

Environment:

```text
NODE_VERSION=20
NPM_CONFIG_PRODUCTION=false
```

Render will provide `PORT` automatically.

Do not set `NODE_ENV=production` in Render's environment variables for the build. The `start` script already sets `NODE_ENV=production`, and setting it globally during install can cause Render/npm to skip dev dependencies such as `typescript`, `@types/react`, Tailwind, and `tsx`, which are required to build and start this app.

### Railway Example

Create a new Railway project from your GitHub repo.

Use:

```text
Build Command: npm install && npm run build
Start Command: npm start
```

Railway will provide `PORT` automatically.

### VPS / PM2 Example

Install dependencies and build:

```bash
npm install
npm run build
```

Install PM2:

```bash
npm install -g pm2
```

Start the server:

```bash
PORT=3000 pm2 start npm --name scrum-poker -- start
```

Save the PM2 process list:

```bash
pm2 save
```

## Deploying With Vercel

### Current App Status

The current app is not directly compatible with Vercel hosting for full realtime behavior because it uses:

- A custom Express server
- Socket.IO WebSockets
- In-memory room state
- A persistent Node.js process

Vercel does not keep a single persistent Node process alive for this kind of Socket.IO server.

### Recommended Vercel Architecture

Use Vercel for the Next.js frontend and move realtime room state to another service.

Recommended options:

- Vercel frontend + Ably realtime
- Vercel frontend + Pusher Channels
- Vercel frontend + Liveblocks
- Vercel frontend + Supabase Realtime
- Vercel frontend + separate Node backend on Render/Railway/Fly.io

### Option A: Vercel Frontend + Separate Socket.IO Backend

Deploy the Socket.IO backend to Render/Railway/Fly.io and deploy the Next.js frontend to Vercel.

You would need to split the current code into:

- Frontend on Vercel
- Socket.IO server on a Node hosting platform

Then configure the client to connect to the backend URL:

```ts
io(process.env.NEXT_PUBLIC_SOCKET_URL)
```

Environment variable on Vercel:

```text
NEXT_PUBLIC_SOCKET_URL=https://your-backend.example.com
```

This keeps Socket.IO and in-memory rooms on a real Node server while Vercel serves the UI.

### Option B: Full Vercel Refactor

To run fully on Vercel, replace Socket.IO and server memory with hosted realtime/state infrastructure.

For example:

- Use Ably or Pusher for realtime events
- Use Upstash Redis, Vercel KV, Supabase, or another shared store for room state
- Replace `server.ts` Socket.IO handlers with API routes or server actions that write to shared storage
- Subscribe to realtime channels from the client

This is a larger refactor, but it is the best fit for Vercel.

### What Not To Do On Vercel

Do not deploy this current app to Vercel expecting `server.ts` to run as a persistent server.

These will not provide the required behavior:

```bash
npm start
```

as a persistent Socket.IO server on Vercel.

## Project Structure

```text
.
├── app
│   ├── globals.css       # Tailwind and global styles
│   ├── layout.tsx        # Next.js root layout
│   └── page.tsx          # Main Scrum Poker UI
├── lib
│   └── poker.ts          # Shared card, story, room, and result types
├── server.ts             # Express + Next.js + Socket.IO server
├── package.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
└── tsconfig.json
```

## Socket.IO Events

Room events:

- `room:create`
- `room:join`
- `room:leave`

Voting events:

- `vote:select`
- `vote:reveal`
- `vote:reset`

Presence events:

- `user:connected`
- `user:disconnected`

Story event:

- `story:update`

Client update event:

- `room:update`

## Troubleshooting

### Internal Server Error After Build

Run a fresh production build before starting:

```bash
npm run build
npm start
```

Do not run `npm run dev` and then immediately use `npm start` without rebuilding.

### Port Already In Use

Use another port:

```bash
PORT=3001 npm run dev
```

or:

```bash
PORT=3001 npm start
```

### Invite Link Copy Does Not Work

Some browsers block clipboard access outside secure contexts or under strict permissions. The app includes a fallback and will display the invite link if copying is unavailable.

### Rooms Disappear

This is expected. Rooms are stored in memory and disappear when the server restarts.

### Multiple Server Instances Do Not Share Rooms

This is expected for the MVP. In-memory state is local to one server process. To scale horizontally, move room state to Redis, Postgres, Supabase, Upstash, or another shared store.

## Verification Commands

Type-check:

```bash
npm exec tsc -- --noEmit
```

Build:

```bash
npm run build
```

Run production:

```bash
npm start
```

## Notes For Future Improvements

- Add persistent rooms with Redis or Postgres
- Add room expiration
- Add moderator transfer
- Add participant kick
- Add reveal countdown
- Add confetti on consensus
- Add dark mode
- Add deployment-ready Vercel architecture with hosted realtime
