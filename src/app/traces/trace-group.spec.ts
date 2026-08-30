import type { TraceSummaryDto } from '../api/dto';
import { groupKey, viewTraceGroups } from './trace-group';

/**
 * The fold the grouped list is drawn from, asserted directly rather than through the DOM — the
 * same reasoning as the error groups' figures and the waterfall's layout.
 */
describe('trace groups', () => {
  const trace = (over: Partial<TraceSummaryDto> = {}): TraceSummaryDto => ({
    traceId: 'trace-1',
    rootName: 'GET /users/42',
    rootService: 'svc',
    rootRoute: '/users/{id}',
    services: ['svc'],
    startEpochNanos: 1_000_000_000,
    durationMs: 20,
    spanCount: 3,
    errorSpanCount: 0,
    hasException: false,
    rootMissing: false,
    ...over,
  });

  it('keys on the route, and only falls back to the span name where there is none', () => {
    expect(groupKey(trace())).toBe('/users/{id}');
    expect(groupKey(trace({ rootRoute: null, rootName: 'consume orders' }))).toBe('consume orders');
    expect(groupKey(trace({ rootRoute: null, rootName: '' }))).toBe('(unnamed span)');
  });

  it('folds GET and POST of one path into one entry — the path is the key, not the name', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'a', rootName: 'GET /users/42' }),
      trace({ traceId: 'b', rootName: 'POST /users/42' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe('/users/{id}');
    expect(groups[0].routed).toBe(true);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['a', 'b']);
  });

  it('keeps the server’s order: groups by first appearance, members untouched inside', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'newest', rootRoute: '/b' }),
      trace({ traceId: 'older', rootRoute: '/a' }),
      trace({ traceId: 'oldest', rootRoute: '/b' }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['/b', '/a']);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['newest', 'oldest']);
  });

  it('summarises the figures a collapsed row draws', () => {
    const groups = viewTraceGroups([
      trace({
        traceId: 'a',
        durationMs: 20,
        startEpochNanos: 1_000_000_000,
        errorSpanCount: 2,
        hasException: true,
        services: ['svc'],
      }),
      trace({
        traceId: 'b',
        durationMs: 800,
        startEpochNanos: 5_000_000_000,
        services: ['svc', 'other'],
      }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].erroredTraces).toBe(1);
    expect(groups[0].hasException).toBe(true);
    expect(groups[0].maxDurationMs).toBe(800);
    expect(groups[0].latestStartEpochNanos).toBe(5_000_000_000);
    expect(groups[0].services).toEqual(['svc', 'other']);
  });

  it('groups a rootless trace by its stand-in span’s route, matching what its row says', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'whole' }),
      trace({ traceId: 'rootless', rootMissing: true }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['whole', 'rootless']);
  });

  it('is routed once any member carries a route, whichever member arrived first', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'a', rootRoute: null, rootName: '/users' }),
      trace({ traceId: 'b', rootRoute: '/users', rootName: 'GET /users' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].routed).toBe(true);
  });
});
