import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { StoreStateDto, TelemetrySourceDto, TelemetrySpanDto } from '../api/dto';
import { routes } from '../app.routes';

/**
 * The span table, driven through `HttpTestingController`.
 *
 * **The budget is the first assertion and the negative half of it is the important one.** The page
 * costs the shell's two plus exactly one, and the shell's two plus *nothing* when no source is
 * named — a sourceless read answers `200` with an empty list, so a page that fired one anyway would
 * look identical on screen and spend a request to say "no telemetry" about a bucket nobody chose.
 *
 * **The default floor is 0 and that is asserted rather than assumed.** This screen reads
 * `slow-spans`, whose own default is 500 ms; sending nothing would therefore hide every fast span
 * and turn "what did this service do" into "what was slow", silently, on a screen whose whole
 * purpose is the first question.
 *
 * The rest is what four dropdowns owe a reader: each one reaches the wire, each one survives a
 * shared link, and an empty table gives a different reason for every different reason.
 */
describe('SpansPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const SOURCE = '_service/qits-ci';
  const ENCODED = '_service%2Fqits-ci';

  /** A span's start, in nanoseconds, built rather than typed — see the trace list's spec for why. */
  const START_NANOS = Date.UTC(2026, 7, 1, 13, 48, 13) * 1_000_000;

  const store = (over: Partial<StoreStateDto> = {}): StoreStateDto => ({
    startedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    totalBytes: 18234112,
    maxTotalBytes: 67108864,
    caps: { spansPerSource: 2000, logsPerSource: 10000, metricSeriesPerSource: 500 },
    sourceCount: 1,
    evictedSpans: 0,
    evictedLogs: 0,
    droppedMetricSeries: 0,
    ...over,
  });

  const source = (over: Partial<TelemetrySourceDto> = {}): TelemetrySourceDto => ({
    key: SOURCE,
    kind: 'SERVICE',
    label: 'qits-ci',
    repositoryId: null,
    workspaceId: null,
    services: [
      { name: 'qits-ci', spans: 1841, logs: 92, metricSeries: 61 },
      { name: 'qits-artifacts', spans: 12, logs: 3, metricSeries: 8 },
    ],
    spans: 1841,
    logs: 92,
    metricSeries: 61,
    bytes: 3910224,
    oldestReceivedAt: new Date(Date.now() - 3600_000).toISOString(),
    newestReceivedAt: new Date(Date.now() - 120_000).toISOString(),
    ...over,
  });

  const span = (over: Partial<TelemetrySpanDto> = {}): TelemetrySpanDto => ({
    traceId: 'c2712ea1a4adc35af6d31de56a75bd39',
    spanId: '9a1f0c2b7e4d6a81',
    parentSpanId: '',
    serviceName: 'qits-ci',
    scopeName: 'io.quarkus.opentelemetry',
    name: 'POST /ci/api/events/post-receive',
    kind: 'SERVER',
    startEpochNanos: START_NANOS,
    durationMs: 812,
    status: 'UNSET',
    statusMessage: '',
    attributes: {},
    resourceAttributes: { 'service.version': '2026.819.212848' },
    events: [],
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
  }

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return page().textContent ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  /** The shell's pair, which every screen in this app is answered with. */
  function shell(
    sources: readonly TelemetrySourceDto[] = [source()],
    state: StoreStateDto = store(),
  ): void {
    http.expectOne('/observability/api/telemetry/store').flush(state);
    http.expectOne('/observability/api/telemetry/sources').flush({ sources });
  }

  /** The screen's one read, matched by path so the assertion is about the query separately. */
  function spanRead() {
    return http.expectOne((request) => request.url === '/observability/api/telemetry/slow-spans');
  }

  function flushSpans(
    spans: readonly TelemetrySpanDto[] = [span()],
    envelope: { total?: number; truncated?: boolean } = {},
  ): void {
    spanRead().flush({
      spans,
      total: envelope.total ?? spans.length,
      truncated: envelope.truncated ?? false,
    });
  }

  /**
   * Pick a row of a lens dropdown by the words on it, the way a reader does.
   *
   * Located through the `<label>` rather than by position: this page carries four of these, and a
   * positional selector would keep passing while pointing at the wrong one.
   */
  async function choose(lens: string, option: string): Promise<void> {
    const label = Array.from(page().querySelectorAll('label.lens-label')).find(
      (element) => (element.textContent ?? '').trim() === lens,
    );
    expect(label, `no lens labelled "${lens}"`).toBeTruthy();
    const select = page().querySelector<HTMLSelectElement>(`#${label?.getAttribute('for')}`);
    expect(select, `no dropdown under "${lens}"`).toBeTruthy();
    const row = Array.from(select?.options ?? []).find((entry) => entry.text.startsWith(option));
    expect(row, `no row reading "${option}" under "${lens}"`).toBeTruthy();
    select!.value = row!.value;
    select!.dispatchEvent(new Event('change'));
    await settle();
  }

  it('costs the shell’s two plus exactly one, and enumerates rather than filters', async () => {
    await open(`/spans?source=${ENCODED}`);
    const requests = http.match(() => true);

    expect(requests.map((request) => request.request.url)).toEqual([
      '/observability/api/telemetry/store',
      '/observability/api/telemetry/sources',
      '/observability/api/telemetry/slow-spans',
    ]);

    // 0, not the endpoint's own 500: the filter is `>=`, so this is the enumeration this screen is
    // for. Sending nothing would hide every fast span behind a default nobody chose.
    expect(requests[2].request.params.get('thresholdMs')).toBe('0');
    expect(requests[2].request.params.get('sort')).toBe('duration');
    expect(requests[2].request.params.get('source')).toBe(SOURCE);
    expect(requests[2].request.params.has('sinceMinutes')).toBe(false);
    expect(requests[2].request.params.has('service')).toBe(false);

    requests[0].flush(store());
    requests[1].flush({ sources: [source()] });
    requests[2].flush({ spans: [span()], total: 1, truncated: false });
    await settle();

    expect(text()).toContain('POST /ci/api/events/post-receive');
    http.verify();
  });

  it('costs nothing beyond the shell when no source is named', async () => {
    await open('/spans');
    const requests = http.match(() => true);

    expect(requests.map((request) => request.request.url)).toEqual([
      '/observability/api/telemetry/store',
      '/observability/api/telemetry/sources',
    ]);

    requests[0].flush(store());
    requests[1].flush({ sources: [source()] });
    await settle();

    expect(text()).toContain('No source is selected');
    expect(text()).toContain('source dropdown');
  });

  it('narrows to one service through the dropdown, without a request for the service list', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell();
    flushSpans();
    await settle();

    // The rows came from the source the band already holds, with what each service has here.
    expect(text()).toContain('qits-artifacts');

    await choose('Service', 'qits-artifacts');

    expect(TestBed.inject(Router).url).toContain('service=qits-artifacts');
    const request = spanRead();
    expect(request.request.params.get('service')).toBe('qits-artifacts');
    request.flush({ spans: [], total: 0, truncated: false });
    await settle();

    expect(text()).toContain('none of what it sent is a span');
  });

  it('raises the floor through the dropdown, and the floor reaches the service', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell();
    flushSpans();
    await settle();

    await choose('Longer than', '500 ms');

    expect(TestBed.inject(Router).url).toContain('threshold=500');
    const request = spanRead();
    expect(request.request.params.get('thresholdMs')).toBe('500');
    request.flush({ spans: [], total: 0, truncated: false });
    await settle();

    expect(text()).toContain('500 ms or longer');
  });

  it('flips the order through the dropdown, and says which end a bounded answer kept', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell();
    flushSpans();
    await settle();

    await choose('Order', 'Newest first');

    expect(TestBed.inject(Router).url).toContain('sort=recent');
    const request = spanRead();
    expect(request.request.params.get('sort')).toBe('recent');
    request.flush({ spans: [span()], total: 1841, truncated: true });
    await settle();

    expect(text()).toContain('Showing the newest 1 of 1,841 matching spans');
  });

  it('reads its lenses back out of a shared link rather than starting from defaults', async () => {
    await open(`/spans?source=${ENCODED}&sort=recent&threshold=100&service=qits-ci&since=60`);
    shell();
    const pending = spanRead();

    expect(pending.request.params.get('sort')).toBe('recent');
    expect(pending.request.params.get('thresholdMs')).toBe('100');
    expect(pending.request.params.get('service')).toBe('qits-ci');
    expect(pending.request.params.get('sinceMinutes')).toBe('60');

    pending.flush({ spans: [span()], total: 1, truncated: false });
    await settle();
  });

  it('draws a failed span as failed, with the exporter’s own status message', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell();
    flushSpans([
      span({
        status: 'ERROR',
        statusMessage: 'connection reset by peer',
        events: [{ name: 'exception', epochNanos: START_NANOS, attributes: {}, exception: true }],
      }),
    ]);
    await settle();

    expect(text()).toContain('connection reset by peer');
    expect(text()).toContain('exception');
    expect(page().querySelector('tr.errored')).not.toBeNull();
  });

  it('names the build that emitted a span, which a stack trace cannot', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell();
    flushSpans();
    await settle();

    expect(text()).toContain('2026.819.212848');
  });

  it('says a service reports but exports no spans, rather than “no spans”', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell([source({ spans: 0, logs: 92, services: [] })]);
    flushSpans([]);
    await settle();

    expect(text()).toContain('No spans have arrived from qits-ci');
    expect(text()).toContain('92 log records');
  });

  it('blames a restart for an empty buffer while a restart is what happened', async () => {
    await open(`/spans?source=${ENCODED}`);
    shell(
      [source({ spans: 0, logs: 0, services: [] })],
      store({ startedAt: new Date().toISOString() }),
    );
    flushSpans([]);
    await settle();

    expect(text()).toContain('restart');
  });
});
