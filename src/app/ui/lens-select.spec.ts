import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LensSelect, type LensOption } from './lens-select';

/**
 * The dropdown every lens on this app is drawn with.
 *
 * Three of its four behaviours are the ones a page would get wrong if it rolled its own, and all
 * three are silent when they break: the empty row has to come back as `null` rather than as `''`,
 * a value with no option has to be *said* rather than hidden, and an empty option list has to
 * disable the control rather than offer a lone "All" that changes nothing.
 */
@Component({
  imports: [LensSelect],
  template: `
    <app-lens-select
      label="Service"
      allLabel="All services"
      [value]="value()"
      [options]="options()"
      (changed)="chosen.set($event)"
    >
      What this lens does.
    </app-lens-select>
  `,
})
class Host {
  readonly value = signal<string | null>(null);
  readonly options = signal<readonly LensOption[]>([
    { value: 'qits-ci', label: 'qits-ci', detail: '1,841 spans' },
    { value: 'qits-artifacts', label: 'qits-artifacts', detail: '12 spans' },
  ]);
  readonly chosen = signal<string | null | undefined>(undefined);
}

describe('LensSelect', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  function select(): HTMLSelectElement {
    return (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function pick(value: string): void {
    select().value = value;
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('draws the all row first, then every option with its figure beside it', () => {
    const rows = Array.from(select().options).map((option) => option.text);

    expect(rows).toEqual(['All services', 'qits-ci · 1,841 spans', 'qits-artifacts · 12 spans']);
    expect(text()).toContain('What this lens does.');
  });

  it('reports the all row as null, because an empty parameter is not the same as an absent one', () => {
    pick('qits-ci');
    expect(fixture.componentInstance.chosen()).toBe('qits-ci');

    pick('');
    // `''` on the wire would be a filter matching a service called the empty string.
    expect(fixture.componentInstance.chosen()).toBeNull();
  });

  it('says out loud that a live value is not in the list, rather than showing All', () => {
    fixture.componentInstance.value.set('qits-vanished');
    fixture.detectChanges();

    // The filter is still on the wire and still shaping the answer, so a control that quietly read
    // "All services" would be describing a request it is not making — and the empty table under it
    // would look like an empty bucket.
    expect(text()).toContain('“qits-vanished” is not in this list');
    expect(text()).toContain('It is still applied');
  });

  it('disables itself when there is nothing to choose between', () => {
    fixture.componentInstance.options.set([]);
    fixture.detectChanges();

    expect(select().disabled).toBe(true);
  });
});
