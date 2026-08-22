# Cleep

A self-hostable, open-source clone of Google Keep. React + Express + Postgres, packaged for Docker.

## Features

- Create, edit, pin, color, archive, and trash notes
- Labels
- Multi-user accounts with session-based auth
- Search across your notes

## Self-hosting with Docker Compose

1. Copy the environment template and fill in real values:

   ```sh
   cp .env.example .env
   ```

   Generate a session secret with `openssl rand -hex 32`, and set `POSTGRES_PASSWORD` /
   `DATABASE_URL` to match. Optionally set `ADMIN_EMAIL` / `ADMIN_PASSWORD` to bootstrap the
   first account on startup.

2. Start it:

   ```sh
   docker compose up -d
   ```

3. Open `http://<host>:6169` and sign in with the admin account you configured.

See [.env.example](.env.example) for details on every variable, including `COOKIE_SECURE` for
deployments behind a reverse proxy.

The `docker-publish.yml` GitHub Actions workflow builds and pushes `ghcr.io/blindpassasjer/cleep`
on every push to `main`. GHCR packages default to private on first publish even in a public repo —
after the first workflow run, open the package settings on GitHub and set its visibility to public
so `docker compose pull` works without authentication.

## Local development

```sh
npm install
npm run server:dev   # API server on :6169
npm run dev           # Vite dev server on :5173, proxies /api to :6169
```

Point `DATABASE_URL` at a local Postgres instance and run `npm run db:migrate` before starting
the server.

## License

Apache-2.0
