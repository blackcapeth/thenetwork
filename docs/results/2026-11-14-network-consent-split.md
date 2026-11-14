# Welcome pair history, a probed minor, and the consent roster

This note is hand-written. The counts come from the command output.

Three changes, taken off the need-channel pull request:

1. A newcomer welcome reads the 60-day pair history. A host the newcomer already declined is left out.
2. A minor signal closes an open introduction when a probe already reached that member and someone else has taken their place.
3. Gate `network-consent-5` reads the roster at the time of the no, including `probe_replaced`. `markDeclined` records that same roster. The gate calls `declinedPairReprobes` in `scripts/sim/repeat-probes.ts`.

Upstream `main` is `a8b60e7`. Bun 1.4.2. No model. Provider keys were unset. Cost 0. No seed sweep.

## Command

```sh
bun test --conditions eliza-source packages/network/test/network-consent-split.integration.test.ts
```

The before run is the same file on this branch with the two `packages/network/src/network.ts` lines removed. The roster tests stay in the file. The before command below uses `-t "declined pair and a probed minor"` so only those two cases run.

## Welcome and minor signal

| Case | Before | After |
|---|---|---|
| Welcome host after Ned declined Hana | `[["h"]]` (fail) | `[]` (pass) |
| Open intro after Ana, already probed and replaced, says "I'm 16" | stage `probing`, reason absent (fail) | stage `closed`, reason `minors policy` (pass) |

Before, filtered command: exit 1. 0 pass, 2 fail, 7 expect() calls, 108 ms.

The welcome failure was:

```text
Expected: []
Received: [["h"]]
```

The minor-signal failure was:

```text
Expected: { "stage": "closed", "reason": "minors policy" }
Received: { "stage": "probing" }
```

After, full file: exit 0. 6 pass, 0 fail, 13 expect() calls, 117 ms.

## The roster still flags a real repeat

A real repeat is a later `probe_started` that pairs the member with someone who was on the roster when they said no.

| Fixture | Previous roster (first `probe_started` only) | Roster at the no |
|---|---|---|
| Ada says no to Bo. A later probe is Ada and Bo. | `o1 -> o2` | `o1 -> o2` |
| Bo is replaced by Cy before the no. A later probe is Ada and Bo. | `o1 -> o2` | none |
| Bo is replaced by Cy before the no. A later probe is Ada and Cy. | none | `o1 -> o2` |
| The no is expired, or it is a plan no. A later probe is Ada and Bo. | | none |

The first row is the repeat the gate must keep. Both rosters flag it. The second row counts a person who had already been replaced. The roster at the no leaves that pair out. The third row is a later probe with the person who was on the roster at the no. The new function flags it. An empty result on the first row or the third row fails the test.

The four roster cases are in the same command. They pass on the after run (4 pass inside the 6).

## Typecheck

`bun run typecheck` on this branch: exit 0.

## Limits

The welcome case and the minor case are one scripted world each. The roster cases are four log fixtures. No full `bun run sim`. No agent client. The engine judge is off. Cost 0.
