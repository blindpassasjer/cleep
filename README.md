# Cleep

**A self-hosted, open-source Google Keep alternative.** Fast, colorful notes with checklists,
photo/video/audio attachments, and labels — running entirely on your own hardware, backed by your
own Postgres database.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](#license)
[![Docker Image](https://img.shields.io/badge/ghcr.io-blindpassasjer%2Fcleep-2496ED?logo=docker&logoColor=white)](https://github.com/blindpassasjer/cleep/pkgs/container/cleep)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)

**[Try the live demo →](https://blindpassasjer.github.io/cleep/)** — a static build with a mocked,
browser-only backend (see [Demo mode](#demo-mode)) so you can click around without installing
anything.

No subscriptions, no ads, no third party reading your notes — just your data, on your server.

<p>
  <img src="docs/screenshots/notes-grid-light.png" alt="Cleep notes grid, light mode" width="49%" />
  <img src="docs/screenshots/notes-grid-dark.png" alt="Cleep notes grid, dark mode" width="49%" />
</p>
<p>
  <img src="docs/screenshots/checklist-note.png" alt="Editing a checklist note" width="49%" />
</p>

## Features

- 📝 **Notes & checklists** — pin, color, archive, trash (with undo everywhere it matters)
- 🖼️ **Attachments** — photos, videos, and audio recorded straight from the browser
- 🏷️ **Labels** for organizing notes into collections, plus multi-select bulk actions
- 🔍 **Search** across your whole library, plus filter by one or several collections at once (Any/All)
- ⌨️ **Keyboard shortcuts** — `/` to search, `c` new note, `l` new checklist, `g n/a/t` to jump around, `?` for the full list
- 👥 **Multi-user accounts** with session-based auth — everyone gets their own private notes; admins can reset a locked-out user's password
- 📦 **Import from Google Keep** and **export everything** as a zip — your data is never trapped
- 📱 **Installable as a PWA** — add it to your home screen and it works offline (needs HTTPS, see below)
- 🐳 **One `docker compose up`** — Postgres and the app, nothing else to configure

## Quick start (Docker Compose)

1. **Clone the repo and set up your environment file:**

   ```sh
   git clone https://github.com/blindpassasjer/cleep.git
   cd cleep
   cp .env.example .env
   ```

   Open `.env` and fill in:
   - `SESSION_SECRET` — generate one with `openssl rand -hex 32`
   - `POSTGRES_PASSWORD` and `DATABASE_URL` — keep the password in sync between the two
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` *(optional)* — bootstraps your first account on startup, so
     you can sign in immediately instead of building a registration flow

   Every variable is documented inline in [.env.example](.env.example), including `COOKIE_SECURE`
   and `TRUST_PROXY` for deployments behind a reverse proxy, and the optional
   `AUTH_RATE_LIMIT_MAX` / `UPLOAD_RATE_LIMIT_MAX` knobs for tuning the rate limiter.

2. **Start it:**

   ```sh
   docker compose up -d
   ```

3. **Open `http://<host>:6169`** and sign in with the admin account you configured above.

That's it — Postgres migrations run automatically before the app starts.

### Upgrading

```sh
git pull            # if you track the repo (for docker-compose.yml + scripts)
docker compose pull
docker compose up -d
```

Schema migrations run automatically on container start. **No `.env` changes are required** — every
setting added since your last pull is optional and defaults to the previous behavior. Two things
worth knowing:

- If you already run behind TLS with `COOKIE_SECURE=true`, Cleep now also sends an `HSTS` header
  (6-month max-age). That's correct for an HTTPS deployment but means browsers will refuse plain
  `http://` to that hostname for a while — as before, only set `COOKIE_SECURE=true` when TLS is
  actually terminated in front of Cleep.
- If you deploy with this repo's `docker-compose.yml`, `git pull` it so the new
  `AUTH_RATE_LIMIT_*` / `UPLOAD_RATE_LIMIT_*` passthrough lines are present (they default to empty
  and are harmless if missing).

### Where your data lives

Everything is stored in plain, host-visible folders instead of opaque Docker volumes, so you can
browse, back up, or move it like any other files:

| What | Where |
|---|---|
| Notes, users, labels (Postgres) | `./data/postgres` |
| Photos, videos, audio recordings | `./data/attachments/<user-id>/<note-id>/<file>` |

### Backups

`scripts/backup.sh` writes a timestamped folder (a `pg_dump` of the database + a tar of
`./data/attachments`) under `./backups`. Run it from the directory with `docker-compose.yml`:

```sh
./scripts/backup.sh                       # -> ./backups/<timestamp>/
./scripts/backup.sh --keep 7              # prune to the 7 newest afterwards
```

Restore one with `./scripts/restore.sh ./backups/<timestamp>` (it prompts before overwriting;
pass `--yes` to skip). A daily backup is one cron line: `0 3 * * * cd /srv/cleep && ./scripts/backup.sh --keep 14`.

### Import / export

**Settings → Your data** has an **Export all data** button (a `.zip` of every note, label and
attachment) and an **Import from Google Keep** picker — export your notes from
[Google Takeout](https://takeout.google.com/) (select *Keep*), then upload the resulting `.zip`.
Titles, checklists, colors, labels, pin/archive state and media all come across; trashed Keep
notes are skipped.

### Publishing your own image

The `docker-publish.yml` GitHub Actions workflow builds and pushes
`ghcr.io/blindpassasjer/cleep` on every push to `main`. GHCR packages default to **private** on
their first publish, even in a public repo — after the first workflow run, open the package
settings on GitHub and set its visibility to public so `docker compose pull` works without
authentication.

## Demo mode

The [live demo](https://blindpassasjer.github.io/cleep/) is a static build deployed to GitHub
Pages by [`.github/workflows/deploy-demo.yml`](.github/workflows/deploy-demo.yml) on every push to
`main`. GitHub Pages can only serve static files, so the demo build swaps the real Express/Postgres
API (`src/api/client.ts`) for a mock (`src/api/mockClient.ts`) that runs entirely in the browser:
notes and labels are saved to `localStorage` on your own device, attachments live only in memory
for the session, and there's no real login, multi-user, or admin behavior. Nothing is sent to a
server. Use "Reset demo data" in Settings to start over.

Build it yourself with:

```sh
VITE_DEMO=true npm run build
```

## PWA and HTTPS

Cleep is installable as a Progressive Web App — an "Install"/"Add to Home Screen" prompt, its own
window, and an offline app shell. This, like microphone access for audio recordings, only works
over a **secure context** (HTTPS, or `localhost`). Browsers won't register a service worker at all
on a plain `http://<nas-ip>:6169` origin, so with the default setup above neither installability
nor offline support will be available — the app itself still works fine either way.

To unlock both, put a reverse proxy with a TLS certificate in front of Cleep — Caddy, Traefik,
Nginx Proxy Manager, or your NAS's built-in one all work well. Once you do, also set
`TRUST_PROXY=true` in `.env` — otherwise every request looks to the app like it's coming from the
proxy's own IP, which shares the login rate limiter across all visitors and can trip a
"Too many requests" error after perfectly normal use.

## Local development

```sh
npm install
npm run server:dev   # API server on :6169
npm run dev           # Vite dev server on :5173, proxies /api to :6169
```

Point `DATABASE_URL` at a local Postgres instance, set `SESSION_SECRET` and `ATTACHMENTS_DIR` (any
local folder for uploaded files), then run `npm run db:migrate` before starting the server.

### Tests

```sh
DATABASE_URL_TEST=postgres://cleep:cleep@localhost:5432/cleep_test npm test
```

`npm test` runs the Vitest server-integration suite against a real Postgres (it creates and
truncates tables itself — point `DATABASE_URL_TEST` at a throwaway database). CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, both builds, and the tests
against a Postgres service container on every push and PR.

## Tech stack

React 18 · Express · PostgreSQL · Drizzle ORM · TypeScript · Vite — no framework lock-in, no
managed cloud service required, just a small, readable codebase you can actually audit.

## Contributing

Issues and pull requests are welcome — this is a small enough codebase that most changes are
straightforward to review.

## License

[Apache-2.0](LICENSE)
