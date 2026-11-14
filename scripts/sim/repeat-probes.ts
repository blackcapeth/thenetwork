// The declined pair is the roster at the time of the "no" (markDeclined reads the same roster).
// A person already replaced is not part of that pair. A later probe_started that pairs the member
// with someone still on the roster is a repeat.
import type { MemberId, RunRecord } from "../../packages/core/src/index.ts";

export interface DeclinedPairReprobes {
  declines: number;
  again: string[];
}

/** Repeats of a pair a member declined. `again` is `oppId -> laterProbeId` for each one. */
export function declinedPairReprobes(records: RunRecord[]): DeclinedPairReprobes {
  const roster = new Map<string, MemberId[]>();
  const noes: { t: number; opp: string; member: string; others: string[] }[] = [];
  const started: { t: number; id: string; participants: MemberId[] }[] = [];
  for (const l of records) {
    if (l.type !== "network_log" || l.detail.plan) continue;
    if (l.kind === "probe_started") {
      const p = l.detail.proposal as { id: string; participants: MemberId[] };
      roster.set(String(p.id), [...p.participants]);
      started.push({ t: l.t, id: String(p.id), participants: p.participants });
    } else if (l.kind === "probe_replaced") {
      const id = String(l.detail.oppId);
      const p = l.detail.proposal as { participants?: MemberId[] } | undefined;
      if (p?.participants) roster.set(id, [...p.participants]);
    } else if (l.kind === "probe_answer" && l.detail.yes === false && !l.detail.expired) {
      const opp = String(l.detail.oppId), member = String(l.detail.memberId);
      noes.push({ t: l.t, opp, member, others: (roster.get(opp) ?? []).filter(x => x !== member) });
    }
  }
  const again: string[] = [];
  for (const n of noes) for (const l of started) {
    if (l.t <= n.t) continue;
    if (l.participants.includes(n.member) && n.others.some(o => l.participants.includes(o))) again.push(`${n.opp} -> ${l.id}`);
  }
  return { declines: noes.length, again };
}
