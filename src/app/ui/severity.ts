import type { QitsBadgeTone } from '@qits/ui-components';
import type { TelemetryLogDto } from '../api/dto';

/**
 * How a log record's severity is drawn, as a pure function over the two fields that carry it.
 *
 * It is a function rather than a template expression for the same reason the waterfall's layout is:
 * the interesting cases are the ones a careless rendering gets plausibly wrong, and they are worth
 * asserting directly rather than through the DOM.
 *
 * **Two fields, and either of them can be absent.** `severityNumber` is the OTel scale and
 * `severityText` is the exporter's own word for it. Measured on the live service against a posted
 * fixture: a record with neither set answers `severityNumber: 0` and `severityText: ""`, and that is
 * not a defect — the OTLP field is optional and an exporter is free to leave it out. So there are
 * three shapes here, not one: both set, a number with no word, and nothing at all.
 *
 * **Nothing at all is drawn as nothing at all.** A record with no severity is labelled
 * {@link UNSET_LABEL}, never `INFO`: guessing a level would turn an exporter's omission into a
 * claim about the record, and on this UI a fabricated `INFO` beside a real one is indistinguishable.
 * {@link Severity.unset} is what lets the screen say so once, below the tail, rather than in every
 * row.
 *
 * **The word comes from the exporter when there is one.** A record answering `WARNING` is drawn as
 * `WARNING`, not normalised to `WARN` — that word is also what the service's `?query=` matches, so
 * re-spelling it here would make the tail disagree with its own search box.
 */

/** The OTel scale's floors. A number at or above each is that level, up to the next. */
export const TRACE_SEVERITY = 1;
export const DEBUG_SEVERITY = 5;
export const INFO_SEVERITY = 9;
export const WARN_SEVERITY = 13;
export const ERROR_SEVERITY = 17;
export const FATAL_SEVERITY = 21;

/** What a record with no severity at all is called. Never a level, because none was reported. */
export const UNSET_LABEL = 'no severity';

/** The band a `?severity=` narrowing names. The six words the service's `minSeverity` accepts. */
export type SeverityBand = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * The bands the log tail's severity dropdown offers, quietest first.
 *
 * **Every one of them is a floor, and the labels say so.** `WARN` on the wire means "13 and above",
 * which is warnings *and* errors *and* fatals — so a label reading `WARN` alone would promise a
 * filter nobody asked for and make the ERROR rows underneath look like a bug. `TRACE` is offered
 * even though it admits almost everything, because it is not the same answer as no filter at all:
 * it excludes the records that carry no severity, and on a platform where a bridge can emit those
 * by the hundred that is a genuinely useful thing to ask for.
 */
export const SEVERITY_BANDS: readonly { readonly value: SeverityBand; readonly label: string }[] = [
  { value: 'TRACE', label: 'TRACE and above' },
  { value: 'DEBUG', label: 'DEBUG and above' },
  { value: 'INFO', label: 'INFO and above' },
  { value: 'WARN', label: 'WARN and above' },
  { value: 'ERROR', label: 'ERROR and above' },
  { value: 'FATAL', label: 'FATAL only' },
];

/**
 * The band a URL asks for, or null.
 *
 * **Anything unrecognised reads as no filter**, and that is not laxity — it is the one place this
 * app is allowed to be lax, because the alternative is worse than either. The service answers a
 * misspelt `minSeverity` with a `400`, so passing a hand-edited URL parameter straight through
 * would turn a typo in a shared link into an error screen where the reader wanted a log tail. The
 * dropdown can only ever produce these six, so the coercion is unreachable from the UI itself.
 */
export function readSeverityBand(raw: string | null): SeverityBand | null {
  const name = (raw ?? '').trim().toUpperCase();
  return SEVERITY_BANDS.some((band) => band.value === name) ? (name as SeverityBand) : null;
}

/** A severity as a screen draws it. */
export interface Severity {
  /** The chip's word: the exporter's own, or the level the number names, or {@link UNSET_LABEL}. */
  readonly label: string;
  /** The chip's tone. `neutral` covers both the quiet levels and the absence of one. */
  readonly tone: QitsBadgeTone;
  /** The exporter set neither field. The row is drawn, and the omission is stated rather than filled. */
  readonly unset: boolean;
  /** True at or above {@link ERROR_SEVERITY} — the line the errors screen is drawn along. */
  readonly isError: boolean;
}

/** The level a number names, or the empty string for `0`, which OTel spells "unspecified". */
export function severityWord(severityNumber: number): string {
  if (severityNumber >= FATAL_SEVERITY) {
    return 'FATAL';
  }
  if (severityNumber >= ERROR_SEVERITY) {
    return 'ERROR';
  }
  if (severityNumber >= WARN_SEVERITY) {
    return 'WARN';
  }
  if (severityNumber >= INFO_SEVERITY) {
    return 'INFO';
  }
  if (severityNumber >= DEBUG_SEVERITY) {
    return 'DEBUG';
  }
  if (severityNumber >= TRACE_SEVERITY) {
    return 'TRACE';
  }
  return '';
}

/**
 * The chip for one record.
 *
 * The word is preferred over the number because the word is the exporter's and is what the search
 * matches; the number decides the tone, because the tone is a comparison and a word is not
 * comparable. A record carrying a word but no number — legal, and seen in the wild from bridges
 * that map a logging framework's level straight to text — is drawn in its own word at a neutral
 * tone, which is honest: nothing said how severe it is.
 */
export function severityOf(
  log: Pick<TelemetryLogDto, 'severityNumber' | 'severityText'>,
): Severity {
  const word = log.severityText.trim();
  const number = Number.isFinite(log.severityNumber) ? log.severityNumber : 0;
  if (!word && number <= 0) {
    return { label: UNSET_LABEL, tone: 'neutral', unset: true, isError: false };
  }
  return {
    label: word || severityWord(number),
    tone: toneOf(number),
    unset: false,
    isError: number >= ERROR_SEVERITY,
  };
}

/** Danger from ERROR up, warning at WARN, info at INFO, and neutral for everything quieter. */
function toneOf(severityNumber: number): QitsBadgeTone {
  if (severityNumber >= ERROR_SEVERITY) {
    return 'danger';
  }
  if (severityNumber >= WARN_SEVERITY) {
    return 'warning';
  }
  if (severityNumber >= INFO_SEVERITY) {
    return 'info';
  }
  return 'neutral';
}
