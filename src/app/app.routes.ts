import type { Route, Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { LandingRedirect, type LandingRedirectData } from './landing/landing-redirect';
import { NotFound } from './not-found/not-found';
import { OverviewPage } from './overview/overview-page';
import { SpansPage } from './spans/spans-page';
import { TracePage } from './traces/trace-page';
import { TracesPage } from './traces/traces-page';

/**
 * Eight routes, all of them inside the platform chrome.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them; only the outlet's
 * content changes. Its `children` was empty until now, and its comment named this as the hook the
 * pages would attach to.
 *
 * **The overview is the root view**, not a child called `/overview`: `/observability/` is where an
 * operator arrives, and "is anything arriving at all" is what they came to find out.
 *
 * **A trace is addressed by its id alone** — `/observability/traces/<traceId>` — because that is
 * what the service's own route takes. The bucket it lives in rides in `?source=` beside it, along
 * with every other lens that costs a request: `?service=`, `?since=`, `?q=`, `?sort=` and
 * `?threshold=`. Nothing that costs a request hides in component state, which is what makes every
 * screen here a link somebody can send.
 *
 * **`/spans` is the flat view of what `/traces` groups**, and it is a route rather than a lens on
 * the trace list because it answers a different question: "what did this service do", not "what
 * happened in this trace". It reads `slow-spans`, which had no screen at all until it existed —
 * with the floor at 0 that endpoint enumerates rather than filters.
 *
 * Everything loads eagerly. There are eight routes, they share every component below them, and a
 * lazy chunk boundary here would be ceremony that costs a round trip.
 *
 * The `**` route sits *inside* the children — see {@link NotFound} for why. Without it an unknown
 * URL rendered blank chrome, which reads as a screen that failed rather than as a page that does
 * not exist.
 *
 * **Every route here was, for a while, a real screen.** A `PendingPage` stood behind the unwritten
 * ones so that the route table was the whole route table from the first commit — addressable,
 * carrying the selected source, and saying what each screen would show and cost rather than
 * rendering blank chrome. `/metrics` was the last one standing behind it, so that component is gone
 * with it.
 *
 * **`/logs`, `/errors` and `/metrics` later went the other way.** The log tail, the error list and
 * the metric table all moved into the landing app, at `/projects/<slug>/observability/logs`,
 * `/projects/<slug>/observability/errors` and `/projects/<slug>/observability/metrics`, so all three
 * addresses are now {@link LandingRedirect}: a full-page hop to the matching screen, carrying
 * whichever query parameters that screen still reads — `?source=`, `?q=`, `?since=` and `?level=`
 * for `/logs` (qits-2313); `?source=` and `?since=` for `/errors` (qits-2339); `?source=` and
 * `?name=` for `/metrics` (qits-2340) — and dropping anything else. Old bookmarks to any form of
 * this app's own `/logs`, `/errors` or `/metrics` still work; they just do not land on a screen of
 * this application any more.
 */

const OWN: Routes = [
  { path: '', component: OverviewPage },
  { path: 'traces', component: TracesPage },
  { path: 'traces/:traceId', component: TracePage },
  { path: 'spans', component: SpansPage },
  {
    path: 'errors',
    component: LandingRedirect,
    data: {
      path: 'errors',
      params: ['source', 'since'],
      label: 'errors',
    } satisfies LandingRedirectData,
  },
  {
    path: 'logs',
    component: LandingRedirect,
    data: {
      path: 'logs',
      params: ['source', 'q', 'since', 'level'],
      label: 'logs',
    } satisfies LandingRedirectData,
  },
  {
    path: 'metrics',
    component: LandingRedirect,
    data: {
      path: 'metrics',
      params: ['source', 'name'],
      label: 'metrics',
    } satisfies LandingRedirectData,
  },
];

/**
 * The same seven addresses under a project slug — `/qits/traces` beside `/traces`.
 *
 * **Order is the whole guard.** The literal routes above are matched first, so `traces`, `spans`,
 * `errors`, `logs` and `metrics` stay this app's own screens and never read as projects of those
 * names; only what none of them claim falls through to `:project`. Every screen but three never
 * reads this parameter: it asks `QITS_SCOPE`, which parses the address the same way in both forms,
 * so one component serves both. `/logs`, `/errors` and `/metrics` are the exception — {@link
 * LandingRedirect} reads `:project` straight off this route rather than through `QITS_SCOPE`,
 * because it has no reason to wait on the project list that token's parsing needs: it is leaving
 * this application either way, so it falls back to `qits` rather than to the unscoped answer
 * `QITS_SCOPE` would give while that list is still loading.
 *
 * This app is project scoped and not repository scoped: the buffer carries no project and no
 * repository row, so a scope here says where the reader came from rather than what is drawn.
 */
const SCOPED: Route = { path: ':project', children: OWN };

export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [...OWN, SCOPED, { path: '**', component: NotFound }],
  },
];
