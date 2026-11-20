# Wrapped Challenge 2026

A single-HTML, mobile-friendly family Spotify Wrapped prediction game with a shared Cloudflare Worker + D1 database. No Spotify API or login required.

## Deploy

1. Install Node.js and Wrangler (`npm install -g wrangler`) and sign in (`wrangler login`).
2. In this folder run `wrangler d1 create wrapped-challenge`.
3. Copy the database ID printed by Wrangler into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
4. Initialize the remote database: `wrangler d1 execute wrapped-challenge --remote --file=./schema.sql`.
5. Set your organizer PIN securely: `wrangler secret put ADMIN_PIN` and enter a secret of at least 6 characters. **Do not put the PIN in HTML or wrangler.toml.**
6. Deploy: `wrangler deploy`. Share the workers.dev URL with family.

For local development, initialize with `wrangler d1 execute wrapped-challenge --local --file=./schema.sql`, create `.dev.vars` containing `ADMIN_PIN=your-test-pin` (never commit it), and run `wrangler dev`.

## Rules

- Predictions: 5 artists, 30 songs, 5 genres. Results: the same ranked lengths.
- All fields are numbered, and edits save automatically.
- Predictions stay hidden until the organizer locks them.
- Players choose their name; no password is required. Anyone who knows a name can edit that player's data, by design.
- Actual results become visible as soon as a player saves them, with scores updated automatically.
- Points = actual-rank weight × distance multiplier, rounded to one decimal per prediction.
- Artist weights: 150, 125, 100, 75, 50. Genre weights: 45, 37.5, 30, 22.5, 15. Song weight at actual rank r = (31-r) × 350 / 465.
- Distance multipliers: exact 100%; 1 away 80%; 2 away 65%; 3 away 50%; 4 away 40%; 5–6 away 30%; 7–9 away 20%; 10–14 away 10%; 15+ away 5%.
- A missing match scores zero. Perfect total: 1,000 points.

## Important limitations / options

- This is a **casual, name-only game**, not tamper-proof: anyone can choose another player's name, and players can edit their own actual results. For competitive integrity, add authentication and/or organizer result verification.
- The Worker restricts phase changes using the server-side PIN and hides predictions from the public state endpoint before locking. However, because player IDs are accessible to anyone who joined by name, name-only access is not private or secure. Do not use this for sensitive information.
- Score matching ignores capitalization, accents normalization, punctuation, and whitespace, but it does not identify song aliases or alternate artist spellings. Use consistent `Song — Artist` formatting. If two names differ substantially, correct them in the actual-results form.
- Results are considered submitted when at least one actual field is filled. For fair final rankings, wait until everyone completes all 40 results.
- Refreshing from another device uses the same name to access the profile during the prediction phase. After locking, a returning player should use the same browser/device; organizer can reopen predictions to restore a player on a new device.
