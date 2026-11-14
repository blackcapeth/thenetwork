// The follow-up that left the need-channel PR: a welcome reads pair history, a minor signal
// closes an introduction a probe already reached, and the audit roster is the roster at the no.
// The repeat fixture is a later probe_started that pairs the member with someone they declined.
// The engine judge is off. No model call.
import { describe, expect, test } from "bun:test";
import { DAY, type MemberId, type RunRecord } from "@thenetwork/core";
import { declinedPairReprobes } from "../../../scripts/sim/repeat-probes.ts";
import { Mini } from "./mini.ts";

const log = (t: number, kind: string, detail: Record<string, unknown>): RunRecord => ({ t, type: "network_log", kind, detail });

/**
 * The roster the audit gate used before this change: participants on probe_started, never
 * updated when someone was replaced. Kept here so the same fixtures show the old result.
 */
function firstProbeRosterRepeats(records: RunRecord[]): string[] {
  const parts = new Map<string, MemberId[]>();
  for (const l of records) {
    if (l.type !== "network_log" || l.kind !== "probe_started" || l.detail.plan) continue;
    const p = l.detail.proposal as { id: string; participants: MemberId[] };
    parts.set(String(p.id), p.participants);
  }
  const again: string[] = [];
  for (const n of records) {
    if (n.type !== "network_log" || n.kind !== "probe_answer" || n.detail.yes !== false || n.detail.expired || n.detail.plan) continue;
    const m = String(n.detail.memberId);
    const others = (parts.get(String(n.detail.oppId)) ?? []).filter(x => x !== m);
    for (const l of records) {
      if (l.type !== "network_log" || l.kind !== "probe_started" || l.detail.plan || l.t <= n.t) continue;
      const p = l.detail.proposal as { id: string; participants: MemberId[] };
      if (p.participants.includes(m) && others.some(o => p.participants.includes(o))) again.push(`${n.detail.oppId} -> ${p.id}`);
    }
  }
  return again;
}

const realRepeat: RunRecord[] = [
  log(1, "probe_started", { proposal: { id: "o1", participants: ["ada", "bo"] } }),
  log(2, "probe_answer", { oppId: "o1", memberId: "ada", yes: false }),
  log(3, "probe_started", { proposal: { id: "o2", participants: ["ada", "bo"] } }),
];

const replacedThenOldPartner: RunRecord[] = [
  log(1, "probe_started", { proposal: { id: "o1", participants: ["ada", "bo"] } }),
  log(2, "probe_replaced", { oppId: "o1", out: "bo", in: "cy", proposal: { id: "o1", participants: ["ada", "cy"] } }),
  log(3, "probe_answer", { oppId: "o1", memberId: "ada", yes: false }),
  log(4, "probe_started", { proposal: { id: "o2", participants: ["ada", "bo"] } }),
];

const replacedThenDeclined: RunRecord[] = [
  log(1, "probe_started", { proposal: { id: "o1", participants: ["ada", "bo"] } }),
  log(2, "probe_replaced", { oppId: "o1", out: "bo", in: "cy", proposal: { id: "o1", participants: ["ada", "cy"] } }),
  log(3, "probe_answer", { oppId: "o1", memberId: "ada", yes: false }),
  log(4, "probe_started", { proposal: { id: "o2", participants: ["ada", "cy"] } }),
];

const expiredAndPlan: RunRecord[] = [
  log(1, "probe_started", { proposal: { id: "o1", participants: ["ada", "bo"] } }),
  log(2, "probe_answer", { oppId: "o1", memberId: "ada", yes: false, expired: true }),
  log(3, "probe_started", { proposal: { id: "p1", participants: ["ada", "bo"] }, plan: { activityId: "climb" } }),
  log(4, "probe_answer", { oppId: "p1", memberId: "ada", yes: false, plan: true }),
  log(5, "probe_started", { proposal: { id: "o2", participants: ["ada", "bo"] } }),
];

describe("network-consent-5 roster at the answer", () => {
  test("a later probe_started that pairs the member with the person they declined is still a repeat", () => {
    expect(declinedPairReprobes(realRepeat)).toEqual({ declines: 1, again: ["o1 -> o2"] });
    expect(firstProbeRosterRepeats(realRepeat)).toEqual(["o1 -> o2"]);
  });

  test("a person replaced before the no is not the declined pair", () => {
    expect(firstProbeRosterRepeats(replacedThenOldPartner)).toEqual(["o1 -> o2"]);
    expect(declinedPairReprobes(replacedThenOldPartner)).toEqual({ declines: 1, again: [] });
  });

  test("a later probe with the person on the roster at the no is still a repeat", () => {
    expect(declinedPairReprobes(replacedThenDeclined)).toEqual({ declines: 1, again: ["o1 -> o2"] });
  });

  test("an expired no and a plan no do not make a repeat", () => {
    expect(declinedPairReprobes(expiredAndPlan)).toEqual({ declines: 0, again: [] });
  });
});

const person = (id: string, name: string) => ({ id, name, age: 32, area: "Greenpoint", interests: ["climbing"], shareable: true });

describe("a declined pair and a probed minor", () => {
  test("a newcomer welcome does not ask a pair the newcomer already declined", async () => {
    const w = new Mini([person("i", "Ira Kim"), person("h", "Hana Ito")], { review: "auto", plans: false, growth: false, maxNewPerDay: 0 });
    await w.onboard("i", "h");
    await w.run(8 * DAY);
    w.add(person("n", "Ned Cho"));
    w.members.find(m => m.id === "n")!.invitedBy = "i";
    await w.onboard("n");
    w.propose(["n", "h"], { alternates: ["i"], objective: "a welcome coffee", category: "social" });
    // The queued proposal starts on the next morning run.
    await w.until(10);
    for (let i = 0; i < 6; i++) {
      const open = [...w.net.opps.values()].some(o => o.stage === "probing" || o.stage === "review");
      if (!open) break;
      if (!(await w.runUntil(() => ["n", "h", "i"].some(id => w.probed(id)), 2 * DAY))) break;
      for (const id of ["n", "h", "i"]) if (w.probed(id)) await w.say(id, "no");
    }
    const declined = w.log("probe_answer").some(l => l.detail.memberId === "n" && l.detail.yes === false);
    expect(declined).toBe(true);
    expect([...w.net.opps.values()].some(o => o.participants.includes("n") && o.stage !== "closed")).toBe(false);
    for (let i = 0; i < 5; i++) {
      await w.until(10);
      if ([...w.net.opps.values()].some(o => o.origin === "newcomer_welcome")) break;
    }
    const hosts = [...w.net.opps.values()].filter(o => o.origin === "newcomer_welcome" && o.participants.includes("n")).map(o => o.participants.filter(id => id !== "n"));
    expect(hosts).toEqual([]);
  });

  test("a minor signal closes an open introduction a probe already reached", async () => {
    const w = new Mini([person("a", "Ana Diaz"), person("b", "Ben Ito"), person("c", "Cy Moss")], { review: "auto", plans: false, growth: false, maxNewPerDay: 0 });
    await w.onboard("a", "b", "c");
    const id = w.propose(["a", "b"], { alternates: ["c"], objective: "a dinner", category: "social" });
    expect(await w.runUntil(() => w.probed("a"), 3 * DAY)).toBe(true);
    await w.say("a", "no");
    const opp = w.net.opps.get(id)!;
    expect({
      stage: opp.stage,
      participants: opp.participants,
      contacted: opp.contacted.has("a"),
      replaced: w.log("probe_replaced").some(l => l.detail.oppId === id && l.detail.out === "a"),
    }).toEqual({ stage: "probing", participants: ["c", "b"], contacted: true, replaced: true });
    await w.say("a", "I'm 16");
    expect(w.net.member("a").minor).toBe(true);
    expect({ stage: opp.stage, reason: opp.closedReason }).toEqual({ stage: "closed", reason: "minors policy" });
  });
});
