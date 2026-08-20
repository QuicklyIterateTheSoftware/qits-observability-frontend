import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { StoreStateDto, TelemetrySourceDto } from '../api/dto';
import { routes } from '../app.routes';
import { ObservabilityNav } from './observability-nav';

/**
 * The source dropdown in the chrome — the control that made the rest of this application reachable.
 *
 * **The router is here and the pages are not**, which is the arrangement this component actually
 * lives in: it is declared by the shell, outside the outlet, so it survives every navigation
 * underneath it. Navigating with no outlet mounted gives exactly that — a settled URL for it to
 * read and write, and no page firing reads of its own into this suite's expectations.
 *
 * **It spends nothing.** The sources it offers arrive with the shell's own two requests, held by
 * `TelemetryBuffer` for every screen; a menu that fetched its own list would double this app's
 * steady-state traffic to learn what it was already being told. The `http.verify()` after each test
 * is that assertion, and it is silent when it regresses.
 */
describe('ObservabilityNav', () => {
  let http: HttpTestingController;

  const SOURCE = '_service/qits-ci';
  const ENCODED = '_service%2Fqits-ci';

  const store = (): StoreStateDto => ({
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    totalBytes: 1024,
    maxTotalBytes: 67108864,
    caps: { spansPerSource: 2000, logsPerSource: 10000, metricSeriesPerSource: 500 },
    sourceCount: 2,
    evictedSpans: 0,
    evictedLogs: 0,
    droppedMetricSeries: 0,
  });

  const source = (over: Partial<TelemetrySourceDto> = {}): TelemetrySourceDto => ({
    key: SOURCE,
    kind: 'SERVICE',
    label: 'qits-ci',
    repositoryId: null,
    workspaceId: null,
    services: [{ name: 'qits-ci', spans: 1841, logs: 92, metricSeries: 61 }],
    spans: 1841,
    logs: 92,
    metricSeries: 61,
    bytes: 3910224,
    oldestReceivedAt: new Date(Date.now() - 1800_000).toISOString(),
    newestReceivedAt: new Date(Date.now() - 60_000).toISOString(),
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

  async function settle(fixture: ComponentFixture<ObservabilityNav>): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  /** Mount the menu on a URL, with the shell's two answers already given. */
  async function open(
    url: string,
    sources: readonly TelemetrySourceDto[] = [source()],
  ): Promise<ComponentFixture<ObservabilityNav>> {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(ObservabilityNav);
    fixture.detectChanges();
    http.expectOne('/observability/api/telemetry/store').flush(store());
    http.expectOne('/observability/api/telemetry/sources').flush({ sources });
    await settle(fixture);
    return fixture;
  }

  function words(fixture: ComponentFixture<ObservabilityNav>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function menu(fixture: ComponentFixture<ObservabilityNav>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Choose a row of the picker by the words on it, the way a reader does. */
  async function pick(fixture: ComponentFixture<ObservabilityNav>, label: string): Promise<void> {
    const row = Array.from(menu(fixture).querySelectorAll<HTMLElement>('.qits-picker-option')).find(
      (option) => (option.textContent ?? '').includes(label),
    );
    expect(row, `no option reading "${label}"`).toBeTruthy();
    row?.click();
    await settle(fixture);
  }

  it('offers every bucket with what it holds, spending no request of its own', async () => {
    const fixture = await open('/', [
      source(),
      source({
        key: '_service/qits-gateway',
        label: 'qits-gateway',
        spans: 4,
        logs: 6,
        metricSeries: 0,
      }),
    ]);

    expect(words(fixture)).toContain('qits-ci');
    expect(words(fixture)).toContain('qits-gateway');
    // 1,841 + 92 + 61 — one figure, because the column is 240px wide and the question it answers is
    // "which of these has anything in it", not "how much of what".
    expect(words(fixture)).toContain('1,994');
  });

  it('carries the chosen source into the URL, and clears a service that belonged to the old one', async () => {
    const fixture = await open(`/logs?source=${ENCODED}&service=qits-ci&q=timeout`, [
      source(),
      source({ key: '_service/qits-gateway', label: 'qits-gateway' }),
    ]);

    // Chosen already, so the picker is collapsed onto it rather than standing open on the list.
    expect(menu(fixture).querySelector('.qits-picker-value')?.textContent).toContain('qits-ci');

    // Clearing puts the list back; then the other bucket can be chosen from it.
    menu(fixture).querySelector<HTMLElement>('.qits-picker-clear')?.click();
    await settle(fixture);
    await pick(fixture, 'qits-gateway');

    const url = TestBed.inject(Router).url;
    expect(url).toContain('source=_service%2Fqits-gateway');
    // A service name belongs to the bucket it was chosen in; carried across it filters to nothing.
    expect(url).not.toContain('service=qits-ci');
    // Everything else survives: a search means the same thing in any bucket.
    expect(url).toContain('q=timeout');
  });

  it('offers every screen once a bucket is chosen, in the order a reader works down them', async () => {
    const chosen = await open(`/traces?source=${ENCODED}`);
    const links = Array.from(menu(chosen).querySelectorAll('.links a'));

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Overview',
      'Traces',
      'Spans',
      'Errors',
      'Logs',
      'Metrics',
    ]);
  });

  it('offers no screen link at all until there is a bucket for it to read', async () => {
    // Each `it` gets its own root injector, and with it its own buffer — which is why this is a
    // second test rather than a second mount: the shell's two reads happen once per application.
    const none = await open('/');

    expect(menu(none).querySelector('.links')).toBeNull();
    expect(words(none)).toContain('pick the application');
  });

  it('leaves the list open for a key the buffer no longer holds, rather than drawing a blank bar', async () => {
    // A restart empties the buffer; a link from before it still names a bucket that is gone. The
    // picker takes its words from an option, so a value with none would render as an empty pill.
    const fixture = await open('/logs?source=_service%2Fvanished');

    expect(menu(fixture).querySelector('.qits-picker-value')).toBeNull();
    expect(menu(fixture).querySelector('.qits-picker-list')).not.toBeNull();
  });

  it('says the buffer is being read rather than that nothing has reported', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    const fixture = TestBed.createComponent(ObservabilityNav);
    fixture.detectChanges();

    // Before the first answer these are two different facts, and the wrong one is alarming.
    expect(words(fixture)).toContain('Reading the buffer');

    http.expectOne('/observability/api/telemetry/store').flush(store());
    http.expectOne('/observability/api/telemetry/sources').flush({ sources: [] });
    await settle(fixture);

    expect(words(fixture)).toContain('Nothing has reported yet');
  });
});
