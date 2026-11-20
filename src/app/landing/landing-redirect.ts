import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QitsAppLinks } from '@qits/ui-components';

/**
 * What one address this component serves forwards, carried on the route's own `data` rather than
 * frozen into the component: `/logs` and `/errors` differ only in which landing screen they go to,
 * which query parameters that screen still reads, and the word their sentence uses, so the
 * difference is table data in `app.routes.ts` and not a second component.
 */
export interface LandingRedirectData {
  /**
   * The segment after `/projects/<project>/observability/` on the landing app, e.g. `logs`.
   *
   * A segment can also name one of *this* route's own matched parameters, with a leading `:`,
   * e.g. `traces/:traceId` — the landing screen it forwards to takes the same id in its own
   * address, so the id has to ride along in the path rather than in `params`, which only ever
   * names query parameters. Every `:name` is replaced by that parameter's matched value off this
   * route's own `paramMap`, URL-encoded; a path with no `:` in it, which is every address but
   * `traces/:traceId` today, passes through unchanged.
   */
  readonly path: string;
  /** The query parameters the landing screen still reads. Everything else is dropped. */
  readonly params: readonly string[];
  /** The plural noun the "moved to the landing app" sentence names, e.g. `logs`, `errors`. */
  readonly label: string;
}

/**
 * Where an address that used to be a screen of this application goes, now that the screen itself
 * lives in the landing app, at `/projects/<slug>/observability/<path>` — reading only the query
 * parameters `data.params` names.
 *
 * **The project comes from the route, not from `QITS_SCOPE`.** Every other page in this
 * application reads the address through that token instead, because it also recognises the
 * project form of the URL grammar once the project list has answered. This page has no such page
 * to wait for: it is leaving the moment it can, so it reads the `:project` segment the route table
 * already matched — present only under the scoped routes in `app.routes.ts` — and falls back to
 * `qits`, the estate's only project, exactly where that segment is absent.
 *
 * **The destination's origin is an async answer, and this screen waits for it rather than
 * guessing.** `QitsAppLinks.origin('qits-landing')` and its `environmentOrigin()` fallback both
 * come from the platform's navigation, fetched after this application started, so `link` is
 * `undefined` until one of them resolves — and stays that way forever on a platform that never
 * answers. A relative address would be wrong on every host but this one, so there is no fallback
 * that guesses it: with neither origin ever landing, this screen keeps saying where the address
 * moved to without acting on it, rather than sending the reader to this host's own
 * `/projects/...`, which nothing here serves.
 *
 * **A full-document navigation, not a router one.** The destination is a different application
 * entirely, so `Router.navigate` would compile a route this SPA does not have and go nowhere;
 * `document.location.replace` leaves no entry for the back button to return to this redirect.
 */
@Component({
  selector: 'app-landing-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      The {{ data.label }} moved to the landing app:
      @if (link(); as href) {
        <a [href]="href">{{ href }}</a>
      } @else {
        <span>resolving the landing app's address…</span>
      }
    </p>
  `,
})
export class LandingRedirect {
  private readonly route = inject(ActivatedRoute);
  private readonly links = inject(QitsAppLinks);
  private readonly document = inject(DOCUMENT);

  /** What this address forwards, named by the route that matched — see {@link LandingRedirectData}. */
  protected readonly data = this.route.snapshot.data as LandingRedirectData;

  /** The `:project` segment one level up, or `undefined` at this app's own unscoped address. */
  private readonly project = this.route.snapshot.parent?.paramMap.get('project') ?? 'qits';

  /**
   * {@link LandingRedirectData.path}, with each `:name` segment substituted from this route's own
   * matched parameters — see there for why. Built once, like `project` and `query`: none of this
   * page's state changes without a fresh navigation, which is a fresh `LandingRedirect` instance.
   */
  private readonly path = this.data.path.replace(/:([A-Za-z]\w*)/g, (_match, name: string) =>
    encodeURIComponent(this.route.snapshot.paramMap.get(name) ?? ''),
  );

  /** The forwarded query string, built once: this page never re-renders on a param change. */
  private readonly query = (() => {
    const params = this.route.snapshot.queryParamMap;
    const forwarded = new URLSearchParams();
    for (const name of this.data.params) {
      const value = params.get(name);
      if (value !== null) {
        forwarded.set(name, value);
      }
    }
    return forwarded.toString();
  })();

  /** The landing app's screen, once an origin for it is known — `undefined` until then. */
  protected readonly link = computed<string | undefined>(() => {
    const origin = this.links.origin('qits-landing') ?? this.links.environmentOrigin();
    if (!origin) {
      return undefined;
    }
    const path = `/projects/${encodeURIComponent(this.project)}/observability/${this.path}`;
    const search = this.query ? `?${this.query}` : '';
    return `${origin.replace(/\/+$/, '')}${path}${search}`;
  });

  constructor() {
    effect(() => {
      const link = this.link();
      if (link) {
        this.document.location.replace(link);
      }
    });
  }
}
