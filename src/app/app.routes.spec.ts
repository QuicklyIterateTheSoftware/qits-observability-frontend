import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  provideQitsNavigationLinks,
  provideQitsProjectList,
  provideQitsScope,
} from '@qits/ui-components';
import { routes } from './app.routes';

/**
 * The URL grammar, asserted where it is cheapest to get wrong: every screen is reachable twice — at
 * the root of this host and under a project slug — and this app's own first segments still win.
 *
 * `traces` is the case worth naming. It is a literal route here and it is also a plausible project
 * slug, so the order of the table is the only thing keeping `/traces` this app's own address — the
 * {@link LandingRedirect} it now resolves to (qits-2342) rather than a project named "traces". Each
 * page's own spec asserts what it draws; this file asserts only that the address reaches it.
 */

const NAV = [{ label: 'Observability', href: '/observability/' }] as const;

/** The projects the chrome knows, so `/qits/…` parses as a project and not as this app's own page. */
const PROJECTS = [{ id: 'p-1', slug: 'qits', name: 'QITS' }];

describe('routes', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks(NAV),
        provideQitsProjectList(PROJECTS),
        provideQitsScope('project'),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** The shell's two reads, answered so nothing is left pending when the harness settles. */
  function answerTheBuffer(): void {
    for (const request of http.match(
      (candidate) => candidate.url === '/observability/api/telemetry/store',
    )) {
      request.flush({});
    }
    for (const request of http.match(
      (candidate) => candidate.url === '/observability/api/telemetry/sources',
    )) {
      request.flush({ sources: [] });
    }
  }

  it('keeps its own literal route: /traces is the redirect, not a project', async () => {
    const harness = await RouterTestingHarness.create('/traces');
    answerTheBuffer();
    await harness.fixture.whenStable();

    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('app-landing-redirect'),
    ).not.toBeNull();
  });

  it('serves the same redirect under a project slug', async () => {
    const harness = await RouterTestingHarness.create('/qits/traces');
    answerTheBuffer();
    await harness.fixture.whenStable();

    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('app-landing-redirect'),
    ).not.toBeNull();
  });

  it('hands a trace address off to the landing app rather than drawing a waterfall of its own', async () => {
    const harness = await RouterTestingHarness.create('/traces/abc123');
    answerTheBuffer();
    await harness.fixture.whenStable();

    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelector('app-landing-redirect')).not.toBeNull();
    expect(element.textContent).toContain('The trace moved to the landing app');
  });

  it('hands the same trace address off under a project slug', async () => {
    const harness = await RouterTestingHarness.create('/qits/traces/abc123');
    answerTheBuffer();
    await harness.fixture.whenStable();

    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelector('app-landing-redirect')).not.toBeNull();
    expect(element.textContent).toContain('The trace moved to the landing app');
  });

  it('puts the overview at the root and under a project slug alike', async () => {
    const harness = await RouterTestingHarness.create('/qits');
    answerTheBuffer();
    await harness.fixture.whenStable();

    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('app-overview-page'),
    ).not.toBeNull();
  });

  it('names the scoped project in the header', async () => {
    // `/traces` and `/traces/:traceId` are both redirects now (qits-2342, qits-2343) and draw no
    // header of their own, so this reads the project off the one screen left that still has one:
    // the overview.
    const harness = await RouterTestingHarness.create('/qits');
    answerTheBuffer();
    await harness.fixture.whenStable();

    expect(
      (harness.routeNativeElement as HTMLElement).querySelector('.project-scope')?.textContent,
    ).toBe('QITS');
  });

  it('names no project at the root, where the address scopes nothing', async () => {
    const harness = await RouterTestingHarness.create('/');
    answerTheBuffer();
    await harness.fixture.whenStable();

    expect((harness.routeNativeElement as HTMLElement).querySelector('.project-scope')).toBeNull();
  });
});
