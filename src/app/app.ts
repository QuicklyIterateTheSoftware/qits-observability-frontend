import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { QitsNavSubmenu } from '@qits/ui-components';
import { ObservabilityNav } from './nav/observability-nav';

/**
 * The shell: an outlet, and the source picker offered to the chrome as a sub-menu.
 *
 * The chrome this SPA wears — sidebar, top bar, the links out to the other applications — is
 * `QitsMainLayout` behind the `''` route (see app.routes.ts), so that it survives navigation
 * instead of being rebuilt on every page.
 *
 * **The sub-menu is declared here and rendered somewhere else, and that is the only arrangement
 * available.** `QitsMainLayout` is a route component — the pages are inside *its* outlet and this
 * shell is outside it — so nothing can be projected upwards into the sidebar. The template is
 * handed over instead, and the layout renders it under this application's navigation entry.
 *
 * It belongs to the shell rather than to a page for a correctness reason: `RouterOutlet` destroys
 * the outgoing component after creating the incoming one, so a declaration inside a page would be
 * torn down and rebuilt on every hop, in a menu that did not itself change.
 *
 * This component still knows nothing of `/observability/` — the mount point is the build's
 * `baseHref`, which the layout reads off the document rather than being told.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, QitsNavSubmenu, ObservabilityNav],
  template: `
    <ng-template qitsNavSubmenu><app-observability-nav /></ng-template>
    <router-outlet />
  `,
})
export class App {}
