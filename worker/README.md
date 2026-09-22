# The paste helper

A small Cloudflare Worker. The quest board sends it a pasted list; it asks
Claude to turn that into quest-log shorthand and sends the lines back. The
board drops them into the quick-add box, where you read them and press Enter —
the same path as anything typed by hand.

It exists because the board is a static site. Anything the board ships is
public, so it can't hold an API key. This is the one piece that can.

**What it can and can't do.** It holds the key and talks to Claude. That's
all. It can't read the quest log, can't write to it, and never touches
Firestore — the board sends it only what Claude needs to tag and rate
sensibly: your tag names, the titles and difficulties already on the board,
and what's currently open. The worst a stolen token can do is spend API
credit.

## Setting it up

You need a Cloudflare account (the free tier is plenty) and an Anthropic API
key from [console.anthropic.com](https://console.anthropic.com/).

```bash
cd worker
npm install
npx wrangler login          # opens a browser, once per machine
```

Then put in the two secrets. They go in through `wrangler`, never into a file
in this repo:

```bash
npx wrangler secret put ANTHROPIC_API_KEY     # paste your key when prompted
npx wrangler secret put PP_TOKEN              # any long random string — see below
```

For `PP_TOKEN`, make something nobody would guess:

```bash
openssl rand -hex 24
```

Keep that string — you type it into the board in a moment. Then deploy:

```bash
npx wrangler deploy
```

Wrangler prints a URL like `https://pp-paste-helper.<your-subdomain>.workers.dev`.

## Pointing the board at it

On the quest board: **Settings → Paste helper**. Paste the worker URL and the
same `PP_TOKEN` string, and press Save. They're stored in that browser only —
not in the quest log — so do it once per device you want it on.

Then open quick add (press `N`), paste a messy list, and press
**✨ tidy with Claude**.

## What it costs

Each paste is one Claude Opus 5 call. A typical list — a dozen items, with
your tags and a calibration sample as context — runs around 1,500 input and
400 output tokens, so roughly **2c a paste** at Opus 5 rates ($5/$25 per
million tokens). Cloudflare's free tier covers the Worker itself.

If that adds up faster than you'd like, change the `model` in `src/index.js`
to `claude-sonnet-5` and redeploy — about 2.5x cheaper, and this is a
well-specified task rather than a hard one.

## Keeping it locked down

- `ALLOWED_ORIGINS` in `src/index.js` lists who may call it. Anything else
  gets a 403. Add a host there if you serve the board from somewhere new.
- `PP_TOKEN` is checked on every request. Without it: 401.
- Pastes over 8,000 characters are refused, so nobody can post a novel at
  your API key.

To change the token later, run `wrangler secret put PP_TOKEN` again, redeploy,
and update Settings on each device.

## Testing

```bash
cd worker
npm install
node test.mjs
```

24 assertions against a stand-in for the Anthropic API — no real calls, no
key needed, nothing spent. It covers the happy path, what does and doesn't
get sent to Claude, every refusal (bad token, foreign origin, empty and
oversized pastes), and the model misbehaving (wrong shape, refusal, rate
limit, rejected key).
