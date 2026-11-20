import type { Route, Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { LandingRedirect, type LandingRedirectData } from './landing/landing-redirect';
import { NotFound } from './not-found/not-found';
import { OverviewPage } from './overview/overview-page';
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
 * what the landing app's own route takes, now that the waterfall moved there too (qits-2343): this
 * app's address is the same one, it just forwards it rather than drawing it. The bucket a trace
 * lives in still rides in `?source=` beside it, the one lens this redirect still reads; the list
 * above it still reads every other lens that costs a request — `?service=`, `?since=`, `?q=`,
 * `?sort=` and `?threshold=` — because those shape which traces it shows rather than which trace is
 * open. Nothing that costs a request hides in component state, which is what makes every screen
 * here a link somebody can send.
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
 * **`/logs`, `/errors`, `/metrics`, `/spans` and now `/traces/<traceId>` later went the other
 * way.** The log tail, the error list, the metric table, the span table and the trace waterfall
 * all moved into the landing app, at `/projects/<slug>/observability/logs`,
 * `/projects/<slug>/observability/errors`, `/projects/<slug>/observability/metrics`,
 * `/projects/<slug>/observability/slow-spans` and `/projects/<slug>/observability/traces/<traceId>`,
 * so all five addresses are now {@link LandingRedirect}: a full-page hop to the matching screen,
 * carrying whichever query parameters that screen still reads — `?source=`, `?q=`, `?since=` and
 * `?level=` for `/logs` (qits-2313); `?source=` and `?since=` for `/errors` (qits-2339); `?source=`
 * and `?name=` for `/metrics` (qits-2340); `?source=`, `?sort=`, `?threshold=` and `?since=` for
 * `/spans` (qits-2341); `?source=` for `/traces/<traceId>` (qits-2343) — and dropping anything
 * else. Old bookmarks to any form of this app's own `/logs`, `/errors`, `/metrics`, `/spans` or
 * `/traces/<traceId>` still work; they just do not land on a screen of this application any more.
 * An old `/spans` bookmark with no `?threshold=` meant this screen's own floor of 0 — "any span" —
 * and now lands on the landing screen's own default instead, which is the endpoint's 500 ms.
 * `traces/:traceId` is also the first address here whose own forwarded path names a route
 * parameter rather than only a literal segment — see {@link LandingRedirectData.path}.
 */

const OWN: Routes = [
  { path: '', component: OverviewPage },
  { path: 'traces', component: TracesPage },
  {
    path: 'traces/:traceId',
    component: LandingRedirect,
    data: {
      path: 'traces/:traceId',
      params: ['source'],
      label: 'trace',
    } satisfies LandingRedirectData,
  },
  {
    path: 'spans',
    component: LandingRedirect,
    data: {
      path: 'slow-spans',
      params: ['source', 'sort', 'threshold', 'since'],
      label: 'slow spans',
    } satisfies LandingRedirectData,
  },
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
 * names; only what none of them claim falls through to `:project`. Every screen but five never
 * reads this parameter: it asks `QITS_SCOPE`, which parses the address the same way in both forms,
 * so one component serves both. `/logs`, `/errors`, `/metrics`, `/spans` and `traces/:traceId` are
 * the exception — {@link LandingRedirect} reads `:project` straight off this route rather than
 * through `QITS_SCOPE`, because it has no reason to wait on the project list that token's parsing
 * needs: it is leaving this application either way, so it falls back to `qits` rather than to the
 * unscoped answer `QITS_SCOPE` would give while that list is still loading.
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
