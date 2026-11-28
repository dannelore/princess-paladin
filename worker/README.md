# The paste helper

A small Cloudflare Worker. The quest board sends it a pasted list; it asks
Claude to turn that into quest-log shorthand and sends the lines back. The
board drops them into the quick-add box, where you read them and press Enter —
the same path as anything typed by hand.

It exists because the board is a static site. Anything the board ships is
public, so it can't hold an API key. This is the one piece that can.

**What it can and can't do.** For pastes, it holds the key and talks to
Claude, and that's all. It never touches Firestore for this: the board sends
only what Claude needs to tag and rate sensibly. That means your tag names, the
titles and difficulties already on the board, and what's currently open. The
worst a stolen `PP_TOKEN` can do is spend API credit.

It has one other job: the [calendar feeds](#the-calendar-feed-skylight) that
put due quests and the meal plan on a Skylight. Those only ever *read* the
quest log and meal plan, and they never write.

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

## The calendar feed (Skylight)

The worker also serves calendar links that a Skylight (or Google Calendar, or
anything else that subscribes to a calendar URL) can show:

| Link ends in   | What's on it |
| -------------- | ------------ |
| `danni.ics`    | Danni's open to-dos and projects that have a due date |
| `brendon.ics`  | Brendon's, the same |
| `meals.ics`    | Lunch and dinner from the meal plan, two weeks back to eight ahead |

Everything is an all-day event on its date. A quest drops off the calendar
once it's ticked off. An overdue one stays on its due date rather than
following you to today. Dailies are left out, or the calendar would be nothing
but habits. Lunches are worked out exactly as the home page does it, leftovers
and all, because the worker uses the site's own `/assets/pp-meals.js`.

### Turning it on

Make a second secret just for the calendar. Skylight will hold this link, so
it's kept apart from `PP_TOKEN`, and changing it only breaks the calendar:

```bash
openssl rand -hex 24
npx wrangler secret put CAL_TOKEN     # paste that string when prompted
npx wrangler deploy
```

Until `CAL_TOKEN` is set, every calendar link is a 404.

### Putting it on the Skylight

1. On the quest board, **Settings → Calendar for Skylight**. Paste the
   `CAL_TOKEN` string and press Save. (It uses the worker URL from the paste
   helper settings just above, so set that up first.) Copy the link you want.
   To get Brendon's, open his board (`?who=brendon`) and do the same there.
2. In the Skylight app: **Calendar → Sync a New Calendar → Calendar URL**.
   Paste the link and tap **Sync Calendar URL**. Do this once per link: quests
   and meals as separate calendars means each gets its own colour on the
   frame.

If you'd rather build the link by hand, it's
`https://pp-paste-helper.<your-subdomain>.workers.dev/cal/<CAL_TOKEN>/danni.ics`.

Skylight checks the link on its own schedule, so a change on the board can take
a while to appear on the frame. The feed asks to be checked hourly, but it's
the calendar app that decides.

### Who can see it

Anyone holding a calendar link can read what's on it: quest titles, subtasks,
tags, and meals. Treat the link like a password. To cut off an old link, put in
a new `CAL_TOKEN`, redeploy, and re-add the new link on the Skylight.

The worker reads Firestore through its public REST API with the same client
key the board ships in `/assets/pp-firebase.js`, and asks only for the fields
it shows (`todos`, `projects`, `tags`; `mealplan`, `recipes`). That works
because the security rules let that public key read the data, which is also
how the board itself loads with no sign-in. So the feed opens up nothing new.
It does mean anyone who finds the public key can read the quest log directly.
That was already true before the calendar existed.

## Testing

```bash
cd worker
npm install
npm test
```

Two files, both run against stand-ins, with no real calls and nothing spent:

- `test.mjs`: 24 assertions on the paste helper against a fake Anthropic
  API. They cover the happy path, what does and doesn't get sent to Claude,
  every refusal (bad token, foreign origin, empty and oversized pastes), and
  the model misbehaving (wrong shape, refusal, rate limit, rejected key).
- `test-calendar.mjs`: 42 assertions on the calendar feeds against a fake
  Firestore. They cover who gets in (no token set, wrong token, the paste
  token, unknown feeds), what makes it onto each calendar and what doesn't,
  escaping and line folding, the meal plan's leftover lunches, and Firestore
  being down or a log missing.
