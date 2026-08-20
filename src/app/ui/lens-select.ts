import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** One choice on a lens: what goes on the wire, and the words a reader picks by. */
export interface LensOption {
  /** The value the parameter takes. Never rendered. */
  readonly value: string;
  /** What the reader sees. */
  readonly label: string;
  /** An optional right-hand figure — a count, a share — drawn quieter, after the label. */
  readonly detail?: string;
}

/** Instance ids, so the label can name the control it belongs to. */
let nextLensId = 0;

/**
 * A lens as a dropdown: a label, a native `<select>`, and the page's own sentence about what the
 * choice does.
 *
 * **A native `<select>` rather than a drawn one, and that is the whole point of the component.**
 * The lists it holds are open-ended — the services reporting into a bucket, the sources in the
 * buffer — and a row of chips for those grows without bound, wraps the strip onto four lines and
 * still gives a keyboard reader one tab stop per option. The platform's control is one tab stop,
 * types-to-search, opens as a native popup on a phone, and needs no ARIA of its own. `qits-picker`
 * from the shared library is the sibling choice and is deliberately not used *here*: it renders its
 * options open in the flow of the page whenever nothing is chosen, which is right for a sidebar
 * where picking is the whole screen and wrong for a strip of four lenses above a table.
 *
 * **The empty value is "not narrowed", never a value.** `''` is what the browser gives back for the
 * first option and what {@link changed} converts to `null`, so a page never has to know the
 * difference between "All" and "no parameter". That matters because on the wire they are the same
 * thing: an absent `?service=` is every service, and sending `service=` would be a filter matching
 * a service called the empty string.
 *
 * The hint is projected rather than an input: every page says something different and specific
 * about its own lens — which clock a window is measured on, what a search actually matches — and
 * those sentences are the app's voice, not this component's.
 */
@Component({
  selector: 'app-lens-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="lens-label" [attr.for]="id">{{ label() }}</label>
    <select
      class="select"
      [id]="id"
      [value]="value() ?? ''"
      [disabled]="options().length === 0"
      (change)="onChange($event)"
    >
      <option value="">{{ allLabel() }}</option>
      @for (option of options(); track option.value) {
        <option [value]="option.value">{{ text(option) }}</option>
      }
    </select>
    @if (missing()) {
      <span class="missing"
        >“{{ value() }}” is not in this list. It is still applied — choose {{ allLabel() }} to clear
        it.</span
      >
    }
    <span class="hint"><ng-content /></span>
  `,
  styles: `
    /* The host *is* the lens row, so a page can drop it straight into its lens strip beside the
       segmented controls it already has and get the same alignment with no wrapper. */
    :host {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
    }
    .lens-label {
      min-width: 6rem;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
    }
    .select {
      flex: 0 1 22rem;
      min-width: 10rem;
      padding: 0.3rem 0.55rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: #fff;
      font: inherit;
      font-size: 0.88rem;
      color: #374151;
    }
    .select:disabled {
      color: #9ca3af;
      background: #f3f4f6;
    }
    .select:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 1px;
    }
    .hint {
      flex: 1 1 18rem;
      min-width: 0;
      color: #6b7280;
      font-size: 0.82rem;
    }
    .missing {
      flex: 0 0 auto;
      color: #b45309;
      font-size: 0.82rem;
    }
  `,
})
export class LensSelect {
  /** The axis this narrows on — "Service", "Severity". Uppercased by the stylesheet, not here. */
  readonly label = input.required<string>();

  /** What is chosen, or null for everything. A value with no option is reported, not hidden. */
  readonly value = input<string | null>(null);

  readonly options = input.required<readonly LensOption[]>();

  /** The first option's words: "All services", "Any severity". Never a blank line in the list. */
  readonly allLabel = input('All');

  /** The chosen value, or null when the reader picked the "all" row. */
  readonly changed = output<string | null>();

  protected readonly id = `lens-${(nextLensId += 1)}`;

  /**
   * A live value that no option offers — a link carrying `?service=` for a service that has since
   * stopped reporting, or was never in this bucket.
   *
   * Said out loud rather than silently dropped. The filter is still on the wire and still shaping
   * the answer, so a select that simply showed "All" would be describing a request it is not
   * making, and the empty table under it would look like an empty bucket.
   */
  protected readonly missing = computed(() => {
    const current = this.value();
    return !!current && !this.options().some((option) => option.value === current);
  });

  protected text(option: LensOption): string {
    return option.detail ? `${option.label} · ${option.detail}` : option.label;
  }

  protected onChange(event: Event): void {
    this.changed.emit((event.target as HTMLSelectElement).value || null);
  }
}
