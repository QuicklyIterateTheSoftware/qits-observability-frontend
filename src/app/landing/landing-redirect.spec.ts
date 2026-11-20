import { DOCUMENT } from '@angular/common';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideQitsNavigationTree, type QitsNavigation } from '@qits/ui-components';
import { LandingRedirect, type LandingRedirectData } from './landing-redirect';

/**
 * Where an old bookmark to one of this app's own addresses lands, now that the screen itself lives
 * in the landing app — `/logs`, `/errors`, `/metrics` and `/spans` alike, told apart only by the
 * `data` the matching route in `app.routes.ts` carries.
 *
 * **No router here, on purpose.** The component reads its one route parameter off
 * `ActivatedRoute.snapshot.parent`, which is a plain object this suite can shape directly — mounting
 * the whole route table through a harness would additionally have to stand up `QitsMainLayout` just
 * to reach a page that is leaving before it would ever be drawn.
 *
 * **`DOCUMENT` is a proxy over the real one, not a bare replacement.** jsdom's own
 * `location.replace` cannot be spied on at all, but the real `DOCUMENT` is also what Angular's own
 * test renderer uses to attach and tear down the fixture's root element — a fake carrying nothing
 * but a `location` breaks `TestBed.createComponent` itself before this page gets a chance to run.
 * The proxy forwards every other read straight to `document`, methods bound to it so their native
 * internals still see the object they expect, and answers only `location` itself.
 */
function fakeDocument(replace: (url: string) => void): Document {
  const location = { replace };
  return new Proxy(document, {
    get(target, prop, receiver) {
      if (prop === 'location') return location;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as Document;
}

const LOGS_DATA: LandingRedirectData = {
  path: 'logs',
  params: ['source', 'q', 'since', 'level'],
  label: 'logs',
};

const ERRORS_DATA: LandingRedirectData = {
  path: 'errors',
  params: ['source', 'since'],
  label: 'errors',
};

const METRICS_DATA: LandingRedirectData = {
  path: 'metrics',
  params: ['source', 'name'],
  label: 'metrics',
};

const SPANS_DATA: LandingRedirectData = {
  path: 'slow-spans',
  params: ['source', 'sort', 'threshold', 'since'],
  label: 'slow spans',
};

const TRACE_DATA: LandingRedirectData = {
  path: 'traces/:traceId',
  params: ['source'],
  label: 'trace',
};

describe('LandingRedirect', () => {
  let replace: ReturnType<typeof vi.fn<(url: string) => void>>;

  /** `project` left out is this app's own unscoped address, whose route names no project. */
  function mount(options: {
    readonly data: LandingRedirectData;
    readonly project?: string;
    readonly params?: Readonly<Record<string, string>>;
    readonly query?: Readonly<Record<string, string>>;
    readonly navigation?: QitsNavigation;
  }): ComponentFixture<LandingRedirect> {
    replace = vi.fn<(url: string) => void>();
    const route = {
      snapshot: {
        data: options.data,
        paramMap: convertToParamMap(options.params ?? {}),
        queryParamMap: convertToParamMap(options.query ?? {}),
        parent:
          options.project === undefined
            ? null
            : { paramMap: convertToParamMap({ project: options.project }) },
      },
    } as unknown as ActivatedRoute;

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: DOCUMENT, useValue: fakeDocument(replace) },
        provideQitsNavigationTree(options.navigation ?? {}),
      ],
    });
    const fixture = TestBed.createComponent(LandingRedirect);
    fixture.detectChanges();
    return fixture;
  }

  const LANDING_ORIGIN: QitsNavigation = {
    applications: { 'qits-landing': { origin: 'https://qits.example.test' } },
  };

  describe('/logs', () => {
    it('redirects to the landing app’s logs screen, forwarding only the lenses it still reads', () => {
      mount({
        data: LOGS_DATA,
        project: 'qits',
        query: { source: '_service/qits-ci', q: 'boom', since: '60', service: 'x' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/logs' +
          '?source=_service%2Fqits-ci&q=boom&since=60',
      );
    });

    it('uses the estate’s only project when the address names none', () => {
      mount({ data: LOGS_DATA, query: {}, navigation: LANDING_ORIGIN });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/logs',
      );
    });

    it('forwards no query string at all when nothing in the address is one of its lenses', () => {
      mount({
        data: LOGS_DATA,
        project: 'qits',
        query: { service: 'x', sort: 'slowest' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/logs',
      );
    });

    it('falls back to the environment origin where the landing app has none of its own', () => {
      mount({
        data: LOGS_DATA,
        project: 'qits',
        query: {},
        navigation: { origin: 'https://dev.qits.example' },
      });

      expect(replace).toHaveBeenCalledWith(
        'https://dev.qits.example/projects/qits/observability/logs',
      );
    });

    it('waits rather than redirecting to a relative URL when neither origin ever resolves', () => {
      const fixture = mount({ data: LOGS_DATA, project: 'qits', query: {}, navigation: {} });

      expect(replace).not.toHaveBeenCalled();
      // The message stays up rather than a blank page — it is the whole point of rendering anything.
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'The logs moved to the landing app',
      );
    });

    it('shows the destination it is about to leave for, so the line is never just a promise', () => {
      const fixture = mount({
        data: LOGS_DATA,
        project: 'qits',
        query: {},
        navigation: LANDING_ORIGIN,
      });

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'https://qits.example.test/projects/qits/observability/logs',
      );
    });
  });

  describe('/errors', () => {
    it('redirects to the landing app’s errors screen, forwarding only the lenses it still reads', () => {
      mount({
        data: ERRORS_DATA,
        query: { source: '_service/qits-ci', since: '60', service: 'x' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/errors' +
          '?source=_service%2Fqits-ci&since=60',
      );
    });

    it('keeps the project named in the address', () => {
      mount({
        data: ERRORS_DATA,
        project: 'qits',
        query: { source: '_service/qits-ci', since: '60' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/errors' +
          '?source=_service%2Fqits-ci&since=60',
      );
    });
  });

  describe('/metrics', () => {
    it('redirects to the landing app’s metrics screen, forwarding only the lenses it still reads', () => {
      mount({
        data: METRICS_DATA,
        query: { source: '_service/qits-ci', name: 'jvm.memory.used', service: 'x' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/metrics' +
          '?source=_service%2Fqits-ci&name=jvm.memory.used',
      );
    });

    it('keeps the project named in the address', () => {
      mount({
        data: METRICS_DATA,
        project: 'qits',
        query: { source: '_service/qits-ci', name: 'jvm.memory.used' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/metrics' +
          '?source=_service%2Fqits-ci&name=jvm.memory.used',
      );
    });
  });

  describe('/spans', () => {
    it('redirects to the landing app’s slow spans screen, forwarding only the lenses it still reads', () => {
      mount({
        data: SPANS_DATA,
        query: {
          source: '_service/qits-ci',
          sort: 'slowest',
          threshold: '250',
          since: '60',
          service: 'x',
        },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/slow-spans' +
          '?source=_service%2Fqits-ci&sort=slowest&threshold=250&since=60',
      );
    });

    it('keeps the project named in the address', () => {
      mount({
        data: SPANS_DATA,
        project: 'qits',
        query: { source: '_service/qits-ci', sort: 'slowest', threshold: '250', since: '60' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/slow-spans' +
          '?source=_service%2Fqits-ci&sort=slowest&threshold=250&since=60',
      );
    });
  });

  describe('/traces/:traceId', () => {
    it('substitutes the matched traceId into the forwarded path', () => {
      mount({
        data: TRACE_DATA,
        params: { traceId: 'abc123' },
        query: { source: '_service/qits-ci', service: 'x' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/traces/abc123' +
          '?source=_service%2Fqits-ci',
      );
    });

    it('keeps the project named in the address', () => {
      mount({
        data: TRACE_DATA,
        project: 'qits',
        params: { traceId: 'abc123' },
        query: { source: '_service/qits-ci' },
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        'https://qits.example.test/projects/qits/observability/traces/abc123' +
          '?source=_service%2Fqits-ci',
      );
    });

    it('URL-encodes an id with characters a path segment cannot carry literally', () => {
      mount({
        data: TRACE_DATA,
        project: 'qits',
        params: { traceId: 'a/b c?d#e' },
        query: {},
        navigation: LANDING_ORIGIN,
      });

      expect(replace).toHaveBeenCalledWith(
        `https://qits.example.test/projects/qits/observability/traces/${encodeURIComponent('a/b c?d#e')}`,
      );
    });
  });
});
