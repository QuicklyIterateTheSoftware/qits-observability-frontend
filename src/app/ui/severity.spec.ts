import {
  SEVERITY_BANDS,
  UNSET_LABEL,
  readSeverityBand,
  severityOf,
  severityWord,
} from './severity';

/**
 * The three shapes a severity arrives in, asserted directly rather than through a row.
 *
 * Two of them were measured on the live service against a posted OTLP fixture, because no service
 * on this platform produces them: an ERROR record and a record with **no severity at all**, which
 * answers `severityNumber: 0` and `severityText: ""`. The third is the shape every real service
 * sends — a number with the exporter's own word beside it, and the word is not always the one this
 * code would have picked (`WARNING`, not `WARN`).
 */
describe('severityOf', () => {
  const log = (severityNumber: number, severityText: string) => ({ severityNumber, severityText });

  it('draws the exporter’s own word rather than normalising it', () => {
    // Measured on the wire from qits-artifacts: 13 arrives spelled WARNING, and that spelling is
    // also what the service's ?query= matches — re-spelling it here would make the tail disagree
    // with its own search box.
    const severity = severityOf(log(13, 'WARNING'));

    expect(severity.label).toBe('WARNING');
    expect(severity.tone).toBe('warning');
    expect(severity.unset).toBe(false);
  });

  it('calls a record with no severity at all what it is, and never INFO', () => {
    const severity = severityOf(log(0, ''));

    expect(severity.label).toBe(UNSET_LABEL);
    expect(severity.unset).toBe(true);
    expect(severity.isError).toBe(false);
    // The failure this guards is silent: an invented INFO sits beside a reported one and no reader
    // can tell which claim the exporter actually made.
    expect(severity.label).not.toBe('INFO');
  });

  it('names the level from the number when the exporter sent no word', () => {
    const severity = severityOf(log(17, ''));

    expect(severity.label).toBe('ERROR');
    expect(severity.unset).toBe(false);
    expect(severity.isError).toBe(true);
  });

  it('draws a word with no number at a neutral tone, because nothing said how severe it is', () => {
    const severity = severityOf(log(0, 'oops'));

    expect(severity.label).toBe('oops');
    expect(severity.tone).toBe('neutral');
    expect(severity.unset).toBe(false);
    expect(severity.isError).toBe(false);
  });

  it('puts the error line at 17, which is where OTel puts it', () => {
    expect(severityOf(log(16, 'WARNING')).isError).toBe(false);
    expect(severityOf(log(17, 'ERROR')).isError).toBe(true);
    expect(severityOf(log(21, 'FATAL')).isError).toBe(true);
    expect(severityOf(log(17, 'ERROR')).tone).toBe('danger');
  });

  it('maps every band of the scale, and nothing at all for 0', () => {
    expect(severityWord(1)).toBe('TRACE');
    expect(severityWord(5)).toBe('DEBUG');
    expect(severityWord(9)).toBe('INFO');
    expect(severityWord(13)).toBe('WARN');
    expect(severityWord(17)).toBe('ERROR');
    expect(severityWord(21)).toBe('FATAL');
    expect(severityWord(0)).toBe('');
  });

  it('treats whitespace as no word rather than as a word', () => {
    expect(severityOf(log(0, '   ')).unset).toBe(true);
    expect(severityOf(log(9, '   ')).label).toBe('INFO');
  });
});

/**
 * The band a `?severity=` narrowing names, which is the log tail's dropdown and the service's
 * `minSeverity` in one vocabulary.
 *
 * The coercion is the whole point of the function and is unreachable from the UI — the dropdown can
 * only ever produce the six — so it is asserted here or nowhere. The service answers a band it does
 * not know with a `400`, and a typo in a hand-edited link must not become an error screen where the
 * reader wanted a log tail.
 */
describe('readSeverityBand', () => {
  it('accepts the six words in any case, and nothing else', () => {
    expect(readSeverityBand('error')).toBe('ERROR');
    expect(readSeverityBand('  Warn ')).toBe('WARN');
    expect(SEVERITY_BANDS.map((band) => band.value)).toEqual([
      'TRACE',
      'DEBUG',
      'INFO',
      'WARN',
      'ERROR',
      'FATAL',
    ]);
  });

  it('reads anything else as no filter at all', () => {
    expect(readSeverityBand('loud')).toBeNull();
    expect(readSeverityBand('17')).toBeNull();
    expect(readSeverityBand('')).toBeNull();
    expect(readSeverityBand(null)).toBeNull();
  });

  it('labels every band as the floor it is', () => {
    // "WARN" alone would promise a filter nobody asked for and make the ERROR rows under it look
    // like a bug. FATAL is the top of the scale, so it is the one band that is only itself.
    expect(SEVERITY_BANDS.map((band) => band.label)).toEqual([
      'TRACE and above',
      'DEBUG and above',
      'INFO and above',
      'WARN and above',
      'ERROR and above',
      'FATAL only',
    ]);
  });
});
