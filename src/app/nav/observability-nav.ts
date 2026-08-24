import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { QITS_SCOPE, QitsPicker, scopeCommands, type QitsPickerOption } from '@qits/ui-components';
import { SOURCE_PARAM } from '../buffer/selected-source';
import { TelemetryBuffer } from '../buffer/telemetry-buffer';
import { formatCount } from '../ui/format';

/**
 * The screens a chosen source can be looked at through, in the order a reader works down them.
 *
 * `segment` and not a path: the address a link goes to depends on the project in scope, so the
 * commands are built per render from `QITS_SCOPE` rather than frozen here.
 */
const SCREENS: readonly { readonly segment: string; readonly label: string }[] = [
  { segment: 'traces', label: 'Traces' },
  { segment: 'spans', label: 'Spans' },
  { segment: 'errors', label: 'Errors' },
  { segment: 'logs', label: 'Logs' },
  { segment: 'metrics', label: 'Metrics' },
];

/**
 * Which source is being looked at, and the screens that look at it — the sub-menu under this
 * application's entry in the platform navigation.
 *
 * **This is the control the application was missing.** Every screen below `/observability/` reads
 * one bucket, named by `?source=`, and until now the only place to choose one was a table on the
 * overview: a reader who followed a link to `/observability/logs` got "no source is selected" and a
 * sentence pointing them back to a page they had not been on. The buffer's sources are the
 * applications reporting into this platform, so choosing one is not a filter over a page — it is
 * *which* telemetry the whole application is showing, which is exactly the shape the shared
 * `qits-picker` is for, and exactly why it belongs in the chrome rather than repeated on five
 * screens.
 *
 * **The selection is derived from the URL, never held here.** A deep link, the back button and the
 * overview's own Select buttons must all leave this picker showing the bucket that is actually on
 * screen; a field of its own would be a second truth for something the address bar already states,
 * and the two would part company on the first back press.
 *
 * **Changing the source clears `?service=`.** A service name belongs to the bucket it was chosen
 * in — `qits-ci` reports into one source and not into another — so carrying it across would apply a
 * filter that matches nothing and draw an empty screen that looks like an empty bucket. Every other
 * lens survives the hop, because a window and a sort mean the same thing wherever they are read.
 *
 * **Declared by the shell, not by a page.** `RouterOutlet` destroys the outgoing component after
 * creating the incoming one, so a declaration inside a page would be torn down and rebuilt on every
 * hop — and this menu would flicker on a navigation that does not change it.
 */
@Component({
  selector: 'app-observability-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsPicker, RouterLink],
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="hint">Reading the buffer…</p>
      }
      @case ('error') {
        <p class="hint error" role="alert">Could not read the sources.</p>
      }
      @default {
        <qits-picker
          [options]="options()"
          [value]="selected()"
          (valueChange)="onSource($event)"
          ariaLabel="Telemetry source"
          placeholder="Pick a source"
          emptyLabel="Nothing has reported yet"
        />

        @if (selected()) {
          <ul class="links">
            <li>
              <a [routerLink]="ownBase()" [queryParams]="scope()">Overview</a>
            </li>
            @for (screen of screens(); track screen.label) {
              <li>
                <a [routerLink]="screen.commands" [queryParams]="scope()">{{ screen.label }}</a>
              </li>
            }
          </ul>
        } @else {
          <p class="hint">
            One bucket at a time — pick the application whose telemetry you want to read.
          </p>
        }
      }
    }
  `,
  styles: `
    /* The layout contributes a bare block and no opinions, so every rule this menu needs is here.
       It renders inside a 240px column that already scrolls and pads, hence no padding of its own. */
    :host {
      display: block;
      min-width: 0;
      padding: 4px 0 8px;
    }
    .links {
      list-style: none;
      margin: 6px 0 0;
      padding: 0;
    }
    .links a {
      display: block;
      padding: 4px 10px 4px 18px;
      font-size: 13px;
      color: #374151;
      text-decoration: none;
      border-radius: 6px;
      overflow-wrap: anywhere;
    }
    .links a:hover {
      background: #f3f4f6;
      color: #111827;
    }
    .hint {
      margin: 6px 10px;
      font-size: 12px;
      color: #6b7280;
    }
    .error {
      color: #b91c1c;
    }
  `,
})
export class ObservabilityNav {
  private readonly buffer = inject(TelemetryBuffer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * The project the address names. Optional: a spec that renders this menu alone gets the unscoped
   * answer, which is what the menu shows at the root of this host.
   */
  private readonly projectScope = inject(QITS_SCOPE, { optional: true });

  /** Where this app's own addresses start, inside the project on screen. */
  protected readonly ownBase = computed(() => scopeCommands(this.projectScope?.scope() ?? {}));

  /** The screen links, each one inside the scope the reader arrived in. */
  protected readonly screens = computed(() =>
    SCREENS.map((screen) => ({
      label: screen.label,
      commands: [...this.ownBase(), screen.segment],
    })),
  );

  /**
   * The query parameters, read off the root route.
   *
   * This component sits outside the router outlet, so the route it is injected with is the root
   * one — which is the right one to read here: query parameters belong to the whole URL rather than
   * to any segment of it, so the answer is the same one the page below is reading.
   */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: convertToParamMap({}),
  });

  /** Whether the source list is here yet, so the menu says "reading" rather than "nothing". */
  protected readonly state = computed(() => this.buffer.sources().kind);

  /**
   * The chosen key, but **only when the buffer still lists it**.
   *
   * A key whose bucket has gone — a restarted process, an evicted source — leaves the picker open
   * on its options instead of collapsed onto a label it cannot draw: the picker takes its words
   * from the option, so a value with no option would render as a blank bar. The page below still
   * reads the key from the URL and says for itself that the bucket is empty; this menu's job is
   * only to offer what can be picked.
   */
  protected readonly selected = computed<string | undefined>(() => {
    const key = this.params().get(SOURCE_PARAM);
    return key && this.buffer.sourceList().some((source) => source.key === key) ? key : undefined;
  });

  /**
   * One option per bucket, with what it holds beside its name.
   *
   * The figure is the total record count rather than a breakdown: this is a 240px column, and the
   * question it answers is "which of these has anything in it", not "how much of what". The
   * per-signal split is one click away on the overview, and the band above every screen repeats it
   * for whichever source is chosen.
   */
  protected readonly options = computed<readonly QitsPickerOption<string>[]>(() =>
    this.buffer.sourceList().map((source) => ({
      value: source.key,
      label: `${source.label} · ${formatCount(source.spans + source.logs + source.metricSeries)}`,
    })),
  );

  /** What a screen link carries: the source alone, so a hop resets the lenses of the last screen. */
  protected readonly scope = computed(() => ({ [SOURCE_PARAM]: this.params().get(SOURCE_PARAM) }));

  /**
   * A new source, as a navigation that keeps the screen and every lens except the service.
   *
   * `undefined` is the picker's cleared state and drops the parameter entirely, which is the state
   * every screen already knows how to draw: it asks for nothing until a bucket is named.
   */
  protected async onSource(key: string | undefined): Promise<void> {
    await this.router.navigate([], {
      queryParams: { [SOURCE_PARAM]: key ?? null, service: null },
      queryParamsHandling: 'merge',
    });
  }
}
