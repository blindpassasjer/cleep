# Changelog

All notable changes to Cleep are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## v0.3.0 — 2026-09-09

### Added

- **Turn a note into a checklist (or back) from the open note.** The list-vs-text
  choice is no longer fixed at creation — the open note has a "Show checkboxes" /
  "Hide checkboxes" toggle, like Google Keep. Conversion is line-based and
  lossless: every non-empty line becomes an item, hiding the checkboxes joins the
  items back into text one per line, and ticked items keep their text.

## v0.2.0 — 2026-09-08

First tagged release. Earlier `:latest` images already shipped the core feature
set — notes, checklists, photo/video/audio attachments, labels and collections,
search, multi-user accounts, Google Keep import/export, and PWA install.
Highlights since then:

### Added

- **Checklists: bring back a completed item instead of duplicating it.** Start
  typing an item that matches something you've already ticked off — e.g. `toma`
  in a grocery list — and Cleep offers to un-check "tomatoes 🍅 8x" and slide it
  back into place rather than adding a second copy. Keyboard: up/down to choose,
  Enter to accept, Esc to dismiss.
- **Link preview cards.** Every URL in a note gets a card in the grid and the
  open note — the OpenGraph image, the page's most prominent image when there's
  no OG tag, then the favicon, then a plain domain tile. Images and favicons are
  fetched and re-served by Cleep, so cards render behind a strict
  `img-src 'self'` CSP and off-site hosts never see the reader's IP.
- **Checked checklist items float to the bottom** with an animated reorder, and
  return to their original slot when un-checked.
- `dev:demo` script and remote-backend dev support, for working on the frontend
  against a live server.

### Changed

- Note-card action buttons reveal on hover, matching Google Keep, instead of
  always showing.

### Fixed

- Notes not opening under React StrictMode.
- Link-preview fetch edge cases: gzip/brotli/deflate decompression, a
  browser-shaped User-Agent, connecting directly by IP, and tolerating odd DNS
  resolvers.

## v0.1.0

Initial public build (untagged).
