import type { TraceSummaryDto } from '../api/dto';

/**
 * The trace list folded into one entry per path, as a pure function over the page.
 *
 * A function rather than a template expression, for the reason the waterfall's layout and the
 * error groups' figures are ones: the shapes that matter are the ones a careless rendering gets
 * *plausibly* wrong, and each is worth asserting directly instead of through the DOM.
 *
 * **The key is the route, not the span name.** `GET /users` and `POST /users` are one path — the
 * method stays readable on the member rows, whose `rootName` is conventionally "METHOD /route".
 * Only when a trace carries no route at all (`rootRoute` null: a non-HTTP root, or a root the
 * buffer evicted along with its attributes) does the name stand in as the key, so the chain always
 * terminates and there is no "unknown" bucket to invent.
 *
 * **Nothing is re-sorted here.** Groups appear in the order their first member holds in the
 * server-sorted list, and members keep the server's order inside them — the same doctrine as the
 * error groups. Under the `recent` lens that puts the group with the newest trace first; under
 * `duration`, the group holding the slowest. A client re-sort would make the two lenses lie.
 */

/** One path's entry: the figures its row draws, and its member traces left untouched underneath. */
export interface TraceGroupView {
  /** The grouping key — the route, or the root name where no route exists. */
  readonly key: string;
  /** True when the key came from route attributes rather than standing in from the span name. */
  readonly routed: boolean;
  /** The member traces, in the server's order. */
  readonly traces: readonly TraceSummaryDto[];
  /** How many member traces hold at least one ERROR span. */
  readonly erroredTraces: number;
  /** True when any member trace recorded an exception event. */
  readonly hasException: boolean;
  /** The slowest member's whole-trace duration. */
  readonly maxDurationMs: number;
  /** The newest member's start, for the row's stamp. */
  readonly latestStartEpochNanos: number;
  /** Every service seen across the members, first-seen order. */
  readonly services: readonly string[];
}

/** Nothing to draw. Kept as a value so a template never destructures a null. */
export const NO_TRACE_GROUPS: readonly TraceGroupView[] = [];

/** The key one trace groups under. Exported so a spec can assert the precedence on its own. */
export function groupKey(trace: TraceSummaryDto): string {
  return trace.rootRoute ?? (trace.rootName || '(unnamed span)');
}

/** The page folded into groups, first-appearance order — one pass, no re-sort. */
export function viewTraceGroups(traces: readonly TraceSummaryDto[]): readonly TraceGroupView[] {
  const groups = new Map<
    string,
    {
      routed: boolean;
      traces: TraceSummaryDto[];
      erroredTraces: number;
      hasException: boolean;
      maxDurationMs: number;
      latestStartEpochNanos: number;
      services: Set<string>;
    }
  >();
  for (const trace of traces) {
    const key = groupKey(trace);
    let group = groups.get(key);
    if (!group) {
      group = {
        routed: trace.rootRoute !== null,
        traces: [],
        erroredTraces: 0,
        hasException: false,
        maxDurationMs: 0,
        latestStartEpochNanos: 0,
        services: new Set<string>(),
      };
      groups.set(key, group);
    }
    group.traces.push(trace);
    group.routed ||= trace.rootRoute !== null;
    if (trace.errorSpanCount > 0) {
      group.erroredTraces++;
    }
    group.hasException ||= trace.hasException;
    group.maxDurationMs = Math.max(group.maxDurationMs, trace.durationMs);
    group.latestStartEpochNanos = Math.max(group.latestStartEpochNanos, trace.startEpochNanos);
    for (const service of trace.services) {
      group.services.add(service);
    }
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    routed: group.routed,
    traces: group.traces,
    erroredTraces: group.erroredTraces,
    hasException: group.hasException,
    maxDurationMs: group.maxDurationMs,
    latestStartEpochNanos: group.latestStartEpochNanos,
    services: [...group.services],
  }));
}
