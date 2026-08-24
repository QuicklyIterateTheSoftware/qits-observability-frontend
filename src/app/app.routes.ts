import type { Route, Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { ErrorsPage } from './errors/errors-page';
import { LogsPage } from './logs/logs-page';
import { MetricsPage } from './metrics/metrics-page';
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
 * **Every route here is now a real screen.** A `PendingPage` stood behind the unwritten ones so
 * that the route table was the whole route table from the first commit — addressable, carrying the
 * selected source, and saying what each screen would show and cost rather than rendering blank
 * chrome. `/metrics` was the last one standing behind it, so that component is gone with it.
 */

const OWN: Routes = [
  { path: '', component: OverviewPage },
  { path: 'traces', component: TracesPage },
  { path: 'traces/:traceId', component: TracePage },
  { path: 'spans', component: SpansPage },
  { path: 'errors', component: ErrorsPage },
  { path: 'logs', component: LogsPage },
  { path: 'metrics', component: MetricsPage },
];

/**
 * The same seven addresses under a project slug — `/qits/traces` beside `/traces`.
 *
 * **Order is the whole guard.** The literal routes above are matched first, so `traces`, `spans`,
 * `errors`, `logs` and `metrics` stay this app's own screens and never read as projects of those
 * names; only what none of them claim falls through to `:project`. A page never reads this
 * parameter: it asks `QITS_SCOPE`, which parses the address the same way in both forms, so one
 * component serves both.
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
