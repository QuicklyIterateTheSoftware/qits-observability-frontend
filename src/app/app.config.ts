import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsNavigation, provideQitsProjects, provideQitsScope } from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Six providers, in the order every sibling SPA lists them.
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideRouter` carries the selected source and every other lens in query parameters, and the
 *   trace id in the path, which is what makes each screen a link somebody can send.
 * - `withFetch` is not a preference. The default XHR backend is invisible to OTLP fetch
 *   instrumentation, so choosing it would quietly forfeit client spans — and on *this* application
 *   that is not an abstract loss. This is the telemetry UI; shipping it blind to the platform's own
 *   browser instrumentation would be a joke at its own expense.
 * - `provideQitsNavigation` fills the shared layout's sidebar. It issues one `GET /main-navigation`
 *   at startup and hands the answer to `QitsMainLayout`: the platform's door list is the edge's
 *   answer now, derived from the deployments it actually serves, rather than a list compiled into
 *   `@qits/ui-components` that lagged every new application. It rides on the `provideHttpClient`
 *   above, and without it the sidebar renders empty.
 * - `provideQitsProjects` fills the chrome's project picker from one `GET /projects/api/projects`,
 *   and installs the repositories of whatever project is in scope alongside it.
 * - `provideQitsScope('project')` says how deep this application's own addresses go. The buffer
 *   carries no project and no repository row, so the deepest address this app serves is
 *   `/<projectSlug>/…` — the scope is what a reader arrived in, not a filter over the telemetry.
 *   It is read from the address and nothing else, so picking a project navigates rather than
 *   remembers.
 *
 * Every call this app makes is a same-origin path on this service's own host, which is what lets
 * the browser's session cookie reach `/observability/api/telemetry/…` with no machine token and no
 * CORS. `/main-navigation` and `/projects/api` are path-routed on every host by the edge, so they
 * are spelled the same way from every SPA.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('project'),
  ],
};
