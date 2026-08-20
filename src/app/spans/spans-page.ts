import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { QitsBadge, QitsButton } from '@qits/ui-components';
import {
  DEFAULT_LIMIT,
  type SpansResponse,
  type TelemetrySpanDto,
  type TraceSort,
} from '../api/dto';
import { ObservabilityApi } from '../api/observability-api';
import { SOURCE_PARAM, selectedSource } from '../buffer/selected-source';
import { SourceStrip } from '../buffer/source-strip';
import { TelemetryBuffer } from '../buffer/telemetry-buffer';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { formatCount, formatStamp, shortId } from '../ui/format';
import { LensSelect, type LensOption } from '../ui/lens-select';
import { IDLE, LOADING, describeError, failed, ready, type Loadable } from '../ui/loadable';
import { buildOf } from '../ui/resource';
import { restartEmptied } from '../ui/restart';
import { tickingNow } from '../ui/ticker';
import { SINCE_PARAM, WINDOW_PRESETS, readWindow, windowLabel } from '../ui/window';
import { formatDuration } from '../traces/trace-layout';

/** How often the table re-reads itself: the band's cadence, because they describe one moment. */
export const SPAN_LIST_POLL_INTERVAL_MS = 10_000;

/** What a failed poll falls back to. The last good table stays on screen and is marked stale. */
export const SPAN_LIST_BACKOFF_INTERVAL_MS = 30_000;

/** The order, as a query parameter. `duration` is the default here; `recent` is the other one. */
export const SORT_PARAM = 'sort';

/** The duration floor in milliseconds, as a query parameter. */
export const THRESHOLD_PARAM = 'threshold';

/** The per-service narrowing, as a query parameter. */
export const SERVICE_PARAM = 'service';

/**
 * The floors the dropdown offers.
 *
 * Zero is first and is the default, which is the opposite of what the endpoint's own name suggests
 * and is deliberate. `slow-spans` defaults to 500 ms — a sensible floor for the question "what is
 * slow", and the wrong one for the question this screen exists to answer, which is "what did this
 * application actually do". The filter is `>=`, so 0 admits every buffered span and turns the same
 * endpoint into an enumeration.
 */
export const THRESHOLD_PRESETS: readonly number[] = [0, 10, 100, 500, 1000];

/**
 * Every buffered span of one bucket, as rows — the screen this application was missing.
 *
 * The trace list groups spans and the trace screen draws one trace's waterfall, so until now the
 * only way to see a span was to already know which trace it was in. That left `slow-spans` — a
 * whole endpoint, filterable four ways — reachable by nothing but the API client's own spec, and it
 * left the plain question "what is this service doing" with no screen at all.
 *
 * **Load budget: `2 + 1`.** The two are the shell's, held by {@link TelemetryBuffer} and shared by
 * every screen. The one is this:
 *
 * - `GET /observability/api/telemetry/slow-spans?source=&service=&thresholdMs=&sinceMinutes=&sort=&limit=200`
 *
 * and it stays one request whatever the reader picks: all four lenses change *that* request, and
 * the service list is drawn from the source row the band already holds. **With no source the count
 * is `2 + 0`** — a sourceless read answers `200` with an empty list, so firing one would spend a
 * request to draw a screen indistinguishable from a service that has never exported.
 *
 * **Every lens is URL state**, so this screen is a link somebody can send and the back button means
 * "the list I was looking at". They are dropdowns rather than button rows because that is what a
 * lens whose options are open-ended wants — the services in a bucket are however many are
 * reporting — and because a screen whose whole purpose is exploring reads better as four labelled
 * choices than as four rows of chips.
 */
@Component({
  selector: 'app-spans-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, LensSelect, QitsBadge, QitsButton, RouterLink, SourceStrip],
  templateUrl: './spans-page.html',
  styleUrls: ['../ui/page.css', './spans-page.css'],
})
export class SpansPage {
  private readonly api = inject(ObservabilityApi);
  private readonly buffer = inject(TelemetryBuffer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly now = tickingNow();

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly formatCount = formatCount;
  protected readonly formatDuration = formatDuration;
  protected readonly shortId = shortId;
  protected readonly buildOf = buildOf;
  protected readonly sourceParam = SOURCE_PARAM;

  protected readonly source = selectedSource();

  /** The order. Anything that is not `recent` is `duration`, which is this endpoint's own coercion. */
  protected readonly sort = computed<TraceSort>(() =>
    this.params().get(SORT_PARAM) === 'recent' ? 'recent' : 'duration',
  );

  /** The floor in milliseconds. A URL carrying nonsense reads as 0, which is "no floor". */
  protected readonly threshold = computed<number>(() => {
    const raw = Number(this.params().get(THRESHOLD_PARAM));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });

  /** The service narrowing, or null for every service in the bucket. */
  protected readonly service = computed<string | null>(() => this.params().get(SERVICE_PARAM));

  /** The window in minutes, or null for everything still buffered. */
  protected readonly since = computed<number | null>(() =>
    readWindow(this.params().get(SINCE_PARAM)),
  );

  private readonly state = signal<Loadable<SpansResponse>>(IDLE);
  private readonly pollProblem = signal('');

  protected readonly listState = this.state.asReadonly();
  protected readonly problem = this.pollProblem.asReadonly();

  /** The rows, once they are here. An empty list otherwise, so the template stays flat. */
  protected readonly spans = computed<readonly TelemetrySpanDto[]>(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.value.spans : [];
  });

  /** The selected source's own row, which is where the service dropdown comes from — at no cost. */
  protected readonly sourceRow = computed(() => this.buffer.source(this.source()));

  /** The services that have reported into this bucket. Arrived with the source; costs nothing. */
  protected readonly services = computed<readonly string[]>(
    () => this.sourceRow()?.services.map((service) => service.name) ?? [],
  );

  /** The service dropdown's rows, each carrying the span count this screen would draw for it. */
  protected readonly serviceOptions = computed<readonly LensOption[]>(
    () =>
      this.sourceRow()?.services.map((service) => ({
        value: service.name,
        label: service.name,
        detail: `${formatCount(service.spans)} spans`,
      })) ?? [],
  );

  /** The floors, as dropdown rows. `Any` is 0 and is the empty value, so it drops the parameter. */
  protected readonly thresholdOptions = computed<readonly LensOption[]>(() =>
    THRESHOLD_PRESETS.filter((ms) => ms > 0).map((ms) => ({
      value: String(ms),
      label: `${formatCount(ms)} ms or longer`,
    })),
  );

  /**
   * The one order that is not the default, as the dropdown's only row.
   *
   * The "all" row of a lens select is its default, and on this endpoint the default is `duration` —
   * so `Slowest first` is that row and `Newest first` is the single alternative. Listing both as
   * options would put "Slowest first" on screen twice, and the second copy would be a value where
   * the first is an absence.
   */
  protected readonly sortOptions: readonly LensOption[] = [
    { value: 'recent', label: 'Newest first' },
  ];

  /** The floor as the dropdown spells it: a string, or null for the "Any duration" row. */
  protected readonly thresholdValue = computed<string | null>(() =>
    this.threshold() > 0 ? String(this.threshold()) : null,
  );

  /** The order as the dropdown spells it: `recent`, or null for the default row. */
  protected readonly sortValue = computed<string | null>(() =>
    this.sort() === 'recent' ? 'recent' : null,
  );

  /** The window as the dropdown spells it: minutes, or null for "everything buffered". */
  protected readonly sinceValue = computed<string | null>(() => {
    const minutes = this.since();
    return minutes === null ? null : String(minutes);
  });

  /** The windows, as dropdown rows. `null` is the empty value: everything still buffered. */
  protected readonly windowOptions: readonly LensOption[] = WINDOW_PRESETS.filter(
    (minutes): minutes is number => minutes !== null,
  ).map((minutes) => ({ value: String(minutes), label: `Last ${windowLabel(minutes)}` }));

  /**
   * What the answer left out, with both numbers in it.
   *
   * Which end was kept matters and is stated: this endpoint truncates by the sort it was given, so
   * a bounded answer is the 200 slowest or the 200 newest, never an arbitrary 200. The eviction
   * half is appended only while the buffer has actually evicted spans — a truncation that is this
   * screen's own limit must not be blamed on the buffer.
   */
  protected readonly truncation = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready' || !state.value.truncated) {
      return '';
    }
    const kept = this.sort() === 'duration' ? 'slowest' : 'newest';
    const shown =
      `Showing the ${kept} ${formatCount(state.value.spans.length)} of ` +
      `${formatCount(state.value.total)} matching spans.`;
    const store = this.buffer.storeValue();
    if (store && store.evictedSpans > 0) {
      return (
        `${shown} The buffer has also dropped ${formatCount(store.evictedSpans)} older spans at ` +
        'its cap, so the total itself is what survived.'
      );
    }
    return `${shown} Raise the floor, narrow to one service or shorten the window to see fewer.`;
  });

  /**
   * Why the table is empty, and never the same sentence for two different reasons.
   *
   * The narrowest explanation a reader can act on comes first; the blunt one about the buffer comes
   * last. A filter that excludes everything, a service that only logs, and a process that came up
   * thirty seconds ago all draw the same blank table and are three entirely different facts.
   */
  protected readonly emptyReason = computed(() => {
    const service = this.service();
    const threshold = this.threshold();
    const since = this.since();
    const row = this.sourceRow();
    const label = row?.label ?? this.source() ?? 'this source';

    if (service && !this.services().includes(service)) {
      return (
        `No service called ${service} has reported into ${label}. The filter is still applied — ` +
        'choose All services to see every span in this source.'
      );
    }
    if (threshold > 0) {
      return (
        `No span${service ? ` from ${service}` : ''} in ${label} ran for ` +
        `${formatCount(threshold)} ms or longer. Set the floor to Any duration to see every ` +
        'buffered span, however fast — most of them are.'
      );
    }
    if (since !== null) {
      const held = this.range();
      return (
        `No spans arrived in the last ${windowLabel(since)}. ` +
        (held
          ? `This source holds records from ${held} — clear the window to see them.`
          : 'Clear the window to see everything the buffer still holds.')
      );
    }
    if (service) {
      return (
        `${service} has reported into ${label}, but none of what it sent is a span. It may export ` +
        'logs only — a service reports traces and logs through separate bridges.'
      );
    }
    if (row && row.spans === 0) {
      return (
        `No spans have arrived from ${label}. It has exported ${formatCount(row.logs)} log ` +
        'records, so it is reporting — its tracing may be off, or its spans have been evicted; ' +
        'the band above says whether this buffer has evicted anything.'
      );
    }

    const restart = restartEmptied(
      this.buffer.storeValue(),
      this.now(),
      'Anything from before that is gone.',
    );
    if (restart) {
      return restart;
    }
    return `No spans are buffered for ${label}.`;
  });

  /** A source's buffered range, so "your window excludes it" stays a distinguishable answer. */
  protected readonly range = computed(() => {
    const row = this.sourceRow();
    if (!row?.oldestReceivedAt || !row.newestReceivedAt) {
      return '';
    }
    return (
      `${formatStamp(row.oldestReceivedAt, this.now())} to ` +
      `${formatStamp(row.newestReceivedAt, this.now())}`
    );
  });

  private handle: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private interval = SPAN_LIST_POLL_INTERVAL_MS;
  private running = 0;

  constructor() {
    /*
     * One effect over every lens: the source, the order, the floor, the service and the window are
     * all URL state, so a change to any of them is a navigation, and the read that answers it
     * belongs here rather than in five handlers that would each have to remember to fire it.
     */
    effect(() => {
      const query = {
        source: this.source(),
        sort: this.sort(),
        thresholdMs: this.threshold(),
        service: this.service(),
        sinceMinutes: this.since(),
      };
      void this.load(query);
    });

    const onVisibilityChange = () => this.onVisibilityChange();
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
      this.stopPolling();
    });

    this.syncPolling();
  }

  /** The order, as a navigation. `duration` is the default and is spelled as an absent parameter. */
  protected async setSort(sort: string | null): Promise<void> {
    await this.merge({ [SORT_PARAM]: sort === 'recent' ? 'recent' : null });
  }

  /** The floor, as a navigation. "Any duration" is 0 and is spelled as an absent parameter. */
  protected async setThreshold(ms: string | null): Promise<void> {
    const value = Number(ms);
    await this.merge({
      [THRESHOLD_PARAM]: Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : null,
    });
  }

  /** The service narrowing, as a navigation. The dropdown's "All services" row clears it. */
  protected async setService(name: string | null): Promise<void> {
    await this.merge({ [SERVICE_PARAM]: name });
  }

  /** The window, as a navigation. "Everything buffered" is spelled as an absent parameter. */
  protected async setSince(minutes: string | null): Promise<void> {
    await this.merge({ [SINCE_PARAM]: readWindow(minutes) === null ? null : minutes });
  }

  /** A span's status, as a badge tone. Only `ERROR` is a failure; `UNSET` is the ordinary case. */
  protected tone(status: string): 'danger' | 'neutral' {
    return status === 'ERROR' ? 'danger' : 'neutral';
  }

  /** Whether this span carries an exception event, which is a different fact from an ERROR status. */
  protected hasException(span: TelemetrySpanDto): boolean {
    return span.events.some((event) => event.exception);
  }

  protected age(startEpochNanos: number): string {
    return formatStamp(new Date(startEpochNanos / 1_000_000).toISOString(), this.now());
  }

  /**
   * Re-issue the read by hand. A refresh over a table that is already up keeps it if the read
   * fails — asking to be brought up to date is not a reason to lose what you were reading.
   */
  protected async refresh(): Promise<void> {
    if (this.state().kind === 'ready') {
      await this.poll();
      return;
    }
    await this.load({
      source: this.source(),
      sort: this.sort(),
      thresholdMs: this.threshold(),
      service: this.service(),
      sinceMinutes: this.since(),
    });
  }

  /** The screen's one read. **With no source there is no request** — see this class's note. */
  private async load(query: {
    source: string | null;
    sort: TraceSort;
    thresholdMs: number;
    service: string | null;
    sinceMinutes: number | null;
  }): Promise<void> {
    if (!query.source) {
      this.state.set(IDLE);
      this.pollProblem.set('');
      return;
    }
    this.state.set(LOADING);
    this.pollProblem.set('');
    try {
      this.state.set(
        ready(
          await this.api.slowSpans({
            source: query.source,
            service: query.service,
            sort: query.sort,
            thresholdMs: query.thresholdMs,
            sinceMinutes: query.sinceMinutes,
            limit: DEFAULT_LIMIT,
          }),
        ),
      );
    } catch (error) {
      this.state.set(failed(error));
    }
  }

  /** One tick. A failure keeps the table on screen and slows the cadence down. */
  private async poll(): Promise<void> {
    const source = this.source();
    if (!source || this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      this.state.set(
        ready(
          await this.api.slowSpans({
            source,
            service: this.service(),
            sort: this.sort(),
            thresholdMs: this.threshold(),
            sinceMinutes: this.since(),
            limit: DEFAULT_LIMIT,
          }),
        ),
      );
      this.pollProblem.set('');
      this.interval = SPAN_LIST_POLL_INTERVAL_MS;
    } catch (error) {
      this.pollProblem.set(describeError(error));
      this.interval = SPAN_LIST_BACKOFF_INTERVAL_MS;
    } finally {
      this.inFlight = false;
      this.syncPolling();
    }
  }

  /** A hidden tab reads nothing, and neither does a screen with no bucket to read. */
  private shouldPoll(): boolean {
    return !this.document.hidden && !!this.source();
  }

  private syncPolling(): void {
    if (!this.shouldPoll()) {
      this.stopPolling();
      return;
    }
    if (this.handle !== null && this.running === this.interval) {
      return;
    }
    this.stopPolling();
    this.running = this.interval;
    this.handle = setInterval(() => void this.poll(), this.interval);
  }

  private stopPolling(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
      this.running = 0;
    }
  }

  /** Coming back is worth one immediate read rather than up to ten seconds of a stale table. */
  private onVisibilityChange(): void {
    if (this.shouldPoll()) {
      void this.poll();
    }
    this.syncPolling();
  }

  /** A lens change is a navigation that keeps every other lens. `null` drops a parameter. */
  private async merge(params: Record<string, string | null>): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }
}
