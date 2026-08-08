# Design-iteration rules (coordinator rulings — read BEFORE cycle 1)

Binding constraints for the visual-layer iteration, relayed by the maintainer.
Read CONTRACTS.md (esp. pin #6) and docs/sessionboard-parity-map.md first.

## Ruling: external font requests are OUT (coordinator, 2026-08-08)

Remove the Google Fonts preconnect + stylesheet already added to `app/index.html`.

1. A third-party DNS + TLS + render-blocking CSS fetch sits on the critical path of a
   site whose measured latency is an explicit competition bonus criterion (57–93 ms
   medians today — this is the single easiest way to lose that).
2. Pin #6: lightweight and boring; no new runtime deps without coordinator sign-off.
   A CDN font is a runtime dependency on someone else's uptime, judged live.
3. A third-party origin on a public judged site, for zero functional gain.

**Allowed path if a non-system typeface is genuinely needed:** self-hosted subsetted
woff2 from our own origin, preloaded, `font-display: swap`, bytes counted against the
pin #6 150 KB budget. No external origins, ever. Fastest-approved default: system stack.

## Embeds are separate and stay tiny

`app/src/embeds/templates.ts` is server-rendered with its own INLINE CSS — completely
outside the SPA token/stylesheet system (~3.4 KB, zero-JS, iframed on third-party
sites). NO webfont there regardless. If the design language changes, the embeds need
their own matching pass or they'll ship in the old design — invisible in SPA
screenshots. Typography may differ from the SPA; color/spacing language must track.

## The other three traps (from UI/07 — every cycle is reviewed against these)

- `.btn/.card/.badge` etc. in `styles/base.css` are shared across all 9 surfaces +
  login + landing: any change must be verified on landing, org dashboard, scheduler,
  and portal, in BOTH themes, before a cycle is "done".
- `styles/tokens.css`: every color needs all THREE definitions — light base,
  `prefers-color-scheme` dark override, AND `data-theme` dark override — or the theme
  toggle breaks subtly in one direction.
- No new runtime deps (package.json diff must be empty). No drift toward
  Sessionboard's identifiable look-and-feel (the parity doc records the line).

Maintainer checks every cycle diff against all of the above before committing;
violations get routed back through the coordinator, not silently fixed.
