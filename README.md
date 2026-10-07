# Matinee

A Netflix-style streaming site for movies and TV shows.
Browse trending titles, open a detail page, and hit Play — playback runs inside
Matinee's own player on top of a sandboxed, popup-proof embed.

![stack](https://img.shields.io/badge/Next.js-16-black) ![bun](https://img.shields.io/badge/runtime-Bun-yellow) ![style](https://img.shields.io/badge/UI-Tailwind%20%2B%20shadcn-38bdf8)

## What's inside

- **Netflix-style UI** — billboard hero, poster rows, Top 10 with big rank
  numerals, hover cards, preview modal, bottom tab bar on mobile.
- **Two data sources, zero setup** —
  - [TMDB](https://www.themoviedb.org/) for movies & TV (trending, popular,
    top-rated, search, details, similar titles)
  - [TVMaze](https://www.tvmaze.com/) for TV episode guides
  - [AniList](https://anilist.co/) for anime matching (sub/dub sources)
- **Multi-source playback** — streams come from swappable embed sources
  (VidLink by default for speed, plus 2Embed, MultiEmbed, VidSrc and
  CineSrc as backups), all sandboxed popup-proof. A source switcher
  lives right in the player, and anime gets a **SUB / DUB toggle** via
  VidLink's anime path (MAL ids resolved from TMDB through AniList).
- **In-house player on CineSrc** — playback, progress bar, ±10s skip,
  volume, speed, next episode, episode picker, and Continue Watching
  stored locally. The stream embed is sandboxed **without** `allow-popups`,
  sits behind a full-surface click shield, and runs with its own controls
  off — popup ads are structurally impossible, and every interaction
  belongs to Matinee. Other sources run in direct mode: their own player
  UI inside the same popup-proof sandbox, with progress tracked from
  VidLink's player events.
- **Auto-landscape playback** — hitting Play automatically goes fullscreen
  and locks the screen to landscape (CSS-rotates the player on browsers
  that can't lock orientation, e.g. iOS Safari).
- **Faster starts** — remembers the stream server that worked last time and
  goes straight back to it, preconnects to the stream host while you browse,
  and auto-skips intros.

## Data & keys

Everything works with **no environment variables and no accounts**:

- The TMDB read key ships with the code.
- TVMaze is keyless.
- Watchlists, Continue Watching, and playback progress live in the
  browser's `localStorage` — no database required.

## Run it locally

```bash
bun install
bun run dev
```

Open http://localhost:3000.

Production build:

```bash
bun run build
bun run start
```

## Deploy to Vercel

1. Push this repo to your GitHub account.
2. Go to [vercel.com/new](https://vercel.com/new) and **Import** the repo.
3. Leave every setting at its default (framework auto-detected, no
   environment variables needed) and click **Deploy**.

You get a permanent `*.vercel.app` URL, and every future `git push`
redeploys automatically — no new links.

## Project layout

```
src/
  app/                 # home page + API routes (/api/movies, /api/tv, ...)
  components/site/     # Header, Hero, rows, cards, detail modal, players
  lib/                 # TMDB / TVMaze clients, progress, helpers
public/                # icons
prisma/                # schema (unused at runtime — no DB needed)
```

## Notes

- Streaming sources are provided by third parties and vary in
  availability; the player shows a friendly error with a retry when a
  source can't be reached.
- This project is for personal/educational use. Content metadata comes
  from TMDB / TVMaze.
