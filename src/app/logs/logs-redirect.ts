import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QitsAppLinks } from '@qits/ui-components';

/**
 * The query parameters the landing app's logs screen still reads. Everything else a bookmark here
 * might carry — `?service=`, chiefly — named a lens that screen does not have, so it is dropped
 * rather than forwarded as something the destination cannot act on.
 */
const FORWARDED_PARAMS = ['source', 'q', 'since', 'level'] as const;

/**
 * Where `/logs` and `/<project>/logs` go now that the log tail itself lives in the landing app, at
 * `/projects/<slug>/observability/logs` — the same screen, reading the same four lenses.
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
 * that guesses it: with neither origin ever landing, this screen keeps saying where the logs moved
 * to without acting on it, rather than sending the reader to this host's own `/projects/...`, which
 * nothing here serves.
 *
 * **A full-document navigation, not a router one.** The destination is a different application
 * entirely, so `Router.navigate` would compile a route this SPA does not have and go nowhere;
 * `document.location.replace` leaves no entry for the back button to return to this redirect.
 */
@Component({
  selector: 'app-logs-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      The logs moved to the landing app:
      @if (link(); as href) {
        <a [href]="href">{{ href }}</a>
      } @else {
        <span>resolving the landing app's address…</span>
      }
    </p>
  `,
})
export class LogsRedirect {
  private readonly route = inject(ActivatedRoute);
  private readonly links = inject(QitsAppLinks);
  private readonly document = inject(DOCUMENT);

  /** The `:project` segment one level up, or `undefined` at this app's own unscoped `/logs`. */
  private readonly project = this.route.snapshot.parent?.paramMap.get('project') ?? 'qits';

  /** The forwarded query string, built once: this page never re-renders on a param change. */
  private readonly query = (() => {
    const params = this.route.snapshot.queryParamMap;
    const forwarded = new URLSearchParams();
    for (const name of FORWARDED_PARAMS) {
      const value = params.get(name);
      if (value !== null) {
        forwarded.set(name, value);
      }
    }
    return forwarded.toString();
  })();

  /** The landing app's logs screen, once an origin for it is known — `undefined` until then. */
  protected readonly link = computed<string | undefined>(() => {
    const origin = this.links.origin('qits-landing') ?? this.links.environmentOrigin();
    if (!origin) {
      return undefined;
    }
    const path = `/projects/${encodeURIComponent(this.project)}/observability/logs`;
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
