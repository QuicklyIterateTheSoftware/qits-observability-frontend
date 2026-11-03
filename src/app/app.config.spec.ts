import { HttpBackend, HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { QitsSession, QitsTokens } from '@qits/angular';
import { appConfig } from './app.config';

/**
 * The backend choice is invisible when it is wrong: the XHR one works perfectly and simply produces
 * client spans that never exist. On the telemetry UI that failure would be quietly self-inflicted,
 * so it is asserted here rather than discovered as a gap in the platform's own instrumentation.
 */
describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  it('provides an HttpClient on the fetch backend', () => {
    expect(TestBed.inject(HttpClient)).toBeTruthy();
    expect(TestBed.inject(HttpBackend).constructor.name).toContain('Fetch');
  });

  /**
   * epic qits-543: the app must sign in with a bearer rather than ride the `qits-session` cookie
   * past the edge. `QitsTokens`/`QitsSession` only resolve if `provideQitsBearerSignIn` is in the
   * providers list, which is a cheap proxy for "the provider and the interceptor are wired".
   */
  it('provides the bearer sign-in', () => {
    expect(TestBed.inject(QitsTokens)).toBeTruthy();
    expect(TestBed.inject(QitsSession)).toBeTruthy();
  });
});
