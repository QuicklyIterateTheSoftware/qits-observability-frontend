# qits-observability-frontend

The observability explorer: the read-only view of what this platform is reporting about itself,
served by qits-observability itself at the root of `observability.<env>.<domain>` through Quinoa.
One screen and no forms or writes at all; `/logs`, `/errors`, `/metrics`, `/spans`, `/traces` and
`/traces/<traceId>` are six further addresses that redirect to the landing app's own screens rather
than screens of their own (qits-2313, qits-2339, qits-2340, qits-2341, qits-2342, qits-2343).

**Every screen is reachable twice**: at the root and under a project slug — `/qits/traces` is the
same page as `/traces`. The literal routes are matched first, so `traces`, `spans`, `errors`, `logs`
and `metrics` stay this app's own screens and never read as projects of those names. The scope is
read from the address by `@qits/ui-components` (`provideQitsScope('project')`), never from a route
parameter, and it is drawn in the page header and nowhere else: the buffer carries no project, so a
scope here says where the reader came from rather than what is shown.

**Which application you are reading is a dropdown in the chrome.** Every screen below reads one
bucket of the buffer, named by `?source=`, and that bucket is chosen from a `qits-picker` in the
platform sidebar — offered under this application's own navigation entry, so it is on screen
wherever you are and it lists every source with what it holds. It used to be a table on the overview
and nothing else, which meant a link to `/logs` landed on "no source is selected" and
a sentence pointing back at a page the reader had not been on. Changing the source keeps every lens
except `?service=`, because a service name belongs to the bucket it was chosen in.

**The shell costs 2 requests, and every screen adds exactly one.** `GET /telemetry/store` and
`GET /telemetry/sources` are held app-wide by one injectable and shared by every page, so no page in
this SPA costs more than 3 requests cold. The budgets below are asserted in the specs, not merely
written down here.

- **`/`** — the overview. The buffer's own state, every source with its per-signal
  counts and its per-service breakdown, and the ephemerality stated in full. **2 + 0**: the two
  shell reads and nothing per source, because a source's counts and its service breakdown arrive
  with its row. Expanding a source costs nothing, and selecting one costs nothing — selection is a
  query parameter the next screen reads.
- **`/traces`** — no longer a screen here. The trace list moved into the landing app, at
  `/projects/<slug>/observability/traces`, and this address now exists only to carry an old
  bookmark there: it forwards `?source=`, `?sort=`, `?threshold=`, `?service=` and `?view=` — the
  lenses the landing screen still reads — and resolves `<slug>` the same way as the others below.
  **+0**: nothing here is read from the buffer any more, and the redirect is a full-page navigation
  once the landing app's origin is known (qits-2342).
- **`/traces/<traceId>`** — no longer a screen here either. The waterfall, the span detail pane and
  the correlated logs moved into the landing app, at
  `/projects/<slug>/observability/traces/<traceId>`, and this address now exists only to carry an
  old bookmark there: it forwards `?source=` — the one lens the landing screen still reads — drops
  anything else (`?service=`, `?since=`, `?q=`, `?sort=` and `?threshold=` belong to the list above
  it, not to one trace), and resolves `<slug>` the same way. **+0**: nothing here is read from the
  buffer any more, and the redirect is a full-page navigation once the landing app's origin is known
  (qits-2343).
- **`/spans`** — no longer a screen here. The span table moved into the landing app, at
  `/projects/<slug>/observability/slow-spans`, and this address now exists only to carry an old
  bookmark there: it forwards `?source=`, `?sort=`, `?threshold=` and `?since=` — the lenses the
  landing screen still reads — drops anything else (`?service=`, chiefly), and resolves `<slug>`
  the same way. **+0**: nothing here is read from the buffer any more, and the redirect is a
  full-page navigation once the landing app's origin is known (qits-2341). An old bookmark with no
  `?threshold=` meant this screen's own floor of 0 — "any span", not just a slow one — and now lands
  on the landing screen's own default instead, which is the endpoint's `500`.
- **`/errors`** — no longer a screen here. The error list moved into the landing app, at
  `/projects/<slug>/observability/errors`, and this address now exists only to carry an old bookmark
  there: it forwards `?source=` and `?since=` — the lenses the landing screen still reads — drops
  anything else (`?service=`, chiefly), and resolves `<slug>` from the `:project` segment of the
  address it was given, or `qits` where there was none. **+0**: nothing here is read from the buffer
  any more, and the redirect is a full-page navigation once the landing app's origin is known
  (qits-2339).
- **`/logs`** — no longer a screen here either. The tail moved into the landing app, at
  `/projects/<slug>/observability/logs`, and this address now exists only to carry an old bookmark
  there: it forwards `?source=`, `?q=`, `?since=` and `?level=` — the lenses the landing screen
  still reads — drops anything else (`?service=`, chiefly), and resolves `<slug>` the same way.
  **+0**: nothing here is read from the buffer any more, and the redirect is a full-page navigation
  once the landing app's origin is known (qits-2313).
- **`/metrics`** — no longer a screen here. The metric table moved into the landing app, at
  `/projects/<slug>/observability/metrics`, and this address now exists only to carry an old
  bookmark there: it forwards `?source=` and `?name=` — the lenses the landing screen still reads —
  drops anything else (`?service=`, chiefly), and resolves `<slug>` the same way. **+0**: nothing
  here is read from the buffer any more, and the redirect is a full-page navigation once the landing
  app's origin is known (qits-2340).

Every address above but `/logs`, `/errors`, `/metrics`, `/spans`, `/traces` and `/traces/<traceId>`
is a real screen. A `PendingPage` stood behind the unwritten ones so the route table was the whole
route table from the first commit — addressable, carrying the selected source, and saying what each
screen would show and cost, because an unbuilt route that renders blank chrome is indistinguishable
from a screen that failed to load. `/metrics` was the last one behind it, so that component is gone
with it. `/logs`, `/errors`, `/metrics`, `/spans`, `/traces` and `/traces/<traceId>` later lost
their own screens the other way: not because they were never built, but because the landing app
grew better ones and these addresses became redirects to them (qits-2313, qits-2339, qits-2340,
qits-2341, qits-2342, qits-2343).

**The lenses live in the URL, not in the components.** `?source=`, `?sort=`, `?threshold=`,
`?service=`, `?since=`, `?q=` and `?name=` each change what is on screen, and by the house rule
anything that costs a request is URL state — so every screen here is a link somebody can send and
the back button means "the list I was looking at". `?name=` is the one that costs no request and is
in the URL anyway: it narrows rows the page already holds, and a metric table somebody meant to send
is the one they had narrowed. A duration floor is applied by the service
(`durationMs >= threshold`), which is why it is a query parameter rather than a filter over rows the
browser already paid to receive; so is a window and so is a search. `limit` is the one figure that
never comes from a URL: the service answers `400` outside `1..1000` rather than clamping, so it is a
constant.

**`?since=` absent is not a very large window.** It means "everything still buffered", which on a
bounded store is a _smaller_ answer than the parameter suggests and the only setting that can never
hide a record the buffer is holding. It is the default on both screens that offer one. A window
filters on the service's own ingest stamp, never on the exporter's clock.

**Follow mode is the single exception to the URL rule, and it is a considered one.** It changes the
_cadence_ and never the answer — every read it makes is the read the screen would have made anyway —
and it switches itself off when the reader scrolls up, so keeping it in the URL would rewrite
somebody's address bar and their history as they read. Everything that changes _what comes back_
stays in the URL, so a shared link is still the list that was meant.

## What this UI has to say before it shows anything

**The store empties on every restart, by design.** qits-observability receives OTLP from every
service on this platform and keeps it in memory: no database, no file on disk, no retention. A
deploy of the service is a restart, and a restart is an empty buffer. That is stated on the overview
in full and in a band on every screen — as information, not as an apology, and not as a dismissible
banner, because what it says never stops being true.

**It is also bounded**, per source and in total, and the bounds bite. The eviction counters are
shown whenever they are non-zero, in ordinary weight: eviction is the bound doing its job, and it is
also the difference between "the buffer is showing you everything" and "the buffer is showing you
what survived".

**So empty is a family of answers, not one**, and this app never draws "No data". A buffer that came
up two minutes ago and a buffer that has been up six hours and received nothing are the same blank
table and completely different facts. `app-empty` takes a required message for exactly this reason —
a component here physically cannot say "nothing" without saying why.

**No fake freshness.** Every record's time is drawn as an absolute clock reading with a relative
suffix (`15:40:02 · 2 m ago`), never a bare "2 m ago". This buffer holds records that may predate
your last page load by hours.

**A record with no severity is drawn as having none, never as `INFO`.** The OTLP field is optional
and a record can arrive with `severityNumber: 0` and no text at all — measured, by posting one. The
chip reads "no severity" and the tail says so once underneath, because a fabricated level sitting
beside a reported one is indistinguishable from it, and this is the one screen whose whole job is to
say exactly what a service claimed. The exporter's own word is kept where there is one: a service
answering `WARNING` is drawn as `WARNING` and not normalised to `WARN`, since that word is also what
the service's search matches.

**Which build emitted a record is on the record.** Every span, log and metric arrives with its
process's resource attributes beside its own — `service.name`, `service.version`,
`deployment.environment.name` and `service.instance.id` — and the version is the deploy's sha or its
calver. A platform that ships several times a day into a buffer that holds hours holds records from
more than one build, and they are otherwise identical on screen. The waterfall's span pane once drew
the whole map beside the span's own attributes, build first, because a rolling replace puts two
builds of one service in one buffer and knowing which one is current is exactly what a reader came
for — that behaviour moved with the waterfall itself to the landing app (qits-2343), the same way it
had already moved for the errors screen before it (qits-2339). No screen left in this repository
draws it any more.

**Where an exporter stamped no resource, nothing was drawn.** It was the one absence in this app
that got no sentence, and the distinction was the point: a span with no attributes is a fact about
somebody's instrumentation, while a record with no resource is the same non-fact repeated on every
record that exporter ever sent. That rule lived in the waterfall's span pane alone, so it moved with
the screen to the landing app too (qits-2343); no screen left here draws resource attributes at all.

**The restart sentence has one home.** Every screen ends its empty-state ladder with "the buffer was
emptied N ago when qits-observability restarted", and `ui/restart.ts` writes that lead. The trace
list shared it until its own address became a redirect too (qits-2342); the overview is its only
caller now. The coda was always each screen's own, in its own nouns, because what a restart costs
the overview is not what it cost the trace list.

**The workspace lens says what it is waiting for.** The other lens on this service is keyed on a
repository and a workspace, it is real, and it has never had a subject: no workspace dev server
exports OTLP, because the sender was dropped during a daemon extraction and the live launch path
never had it. The overview names that gap, says where it is written down, and promises nothing about
when — otherwise a reader who knows this platform runs workspaces reads the absence as a broken
screen.

## How it stays current

**It polls**, and that is a measurement rather than a preference: qits-observability has no SSE, no
WebSocket and no long-poll route. It does fire an internal change hint, but that hint fires only for
workspace-scoped records — which is none of the telemetry that exists today — so a stream wired to it
would look live and never fire, which is worse than no stream at all.

The band re-reads the store and the sources every 10 s — that is the only polling left in this
application now. The trace list's own 10 s cadence and the trace detail's choice not to poll at
all, a finished trace does not change, both moved to the landing app along with their screens
(qits-2342, qits-2343). **All polling stops when the tab is hidden** and does one immediate
catch-up read on return, so a backgrounded tab costs nothing.
A failed poll backs off to 30 s, keeps the last good answer on screen and marks it stale — data you
know is 40 s old beats an empty page.

The tail that once lived at `/logs` — with its Follow toggle re-reading every 5 s, the fastest
cadence anything here ever polled on — moved to the landing app along with the screen (qits-2313);
this application no longer polls anything that quickly.

## What is in `src/app/`

`api/` holds hand-written interfaces mirroring the service's wire shapes and one injectable over
`HttpClient` on the fetch backend — one upstream, because there is no second service to join
against. Nothing is generated: the service's own generated schema names its response records
`Response` through `Response4`, and the platform generates documents rather than clients.

**A source key is opaque.** It comes from the sources listing and goes back on the wire verbatim;
nothing here builds one, parses one, or reads meaning out of one. It is spelled `_service/qits-ci`
today and that is not a promise. The reason it exists at all is that the old `repositoryId` +
`workspaceId` pair cannot name the bucket every qits service actually exports into.

`nav/` holds the one thing this app puts in the platform chrome: the source picker and the screen
links under it, handed to `QitsMainLayout` as an `ng-template qitsNavSubmenu` from the shell. It is
declared in the shell rather than in a page for a correctness reason — `RouterOutlet` destroys the
outgoing component after creating the incoming one, so a declaration inside a page would be rebuilt
on every hop in a menu that did not itself change.

`ui/` carries `loadable`, `async`, `empty`, `format`, `lens-select`, `ticker` and `page.css`, mostly
copied from the sibling SPAs rather than shared. `@qits/ui-components` carries presentational components, not
application types, so there is nowhere to put them yet — and this feature does not edit the shared
library. Four modules there are this application's own rather than copies: `severity`, which turns a
log's two severity fields into a chip — drawn nowhere in this app any more now that the waterfall's
span pane, the last screen left here that drew it, moved to the landing app too (qits-2343), the
same way the errors screen's own copy of the same chip moved before it (qits-2339) — and also still
names the six bands and the URL coercion the logs screen's own dropdown used to draw, unused here
since that screen moved there too (qits-2313) and kept rather than deleted, since it is a direct
mirror of what the service's own `minSeverity` accepts; `window`, which holds the `?since=` spelling
every screen that offers a window must agree on; `restart`, which holds the threshold and the lead
sentence the overview's empty-state ladder ends with — its only caller now that the trace list that
once shared it became a redirect too (qits-2342); and `lens-select`, the dropdown every open-ended
lens is drawn with.

**`lens-select` is a native `<select>` on purpose**, where the sidebar's source picker is
`qits-picker`. The shared component renders its options open in the flow of the page whenever
nothing is chosen, which is right for a sidebar where picking _is_ the screen and wrong for a strip
of four lenses above a table. The empty row of a lens select comes back as `null` rather than `''`,
because on the wire those are different requests: an absent `?service=` is every service, and an
empty one is a filter matching a service called the empty string. A live value the options do not
offer — a link carrying a `?service=` that has stopped reporting — is said out loud rather than
dropped, since the filter is still shaping an answer that would otherwise look like an empty
bucket.

**There was no charting dependency, and there will not be one.** The waterfall that used to draw one
trace, on the screen that moved to the landing app (qits-2343), was a nested list where each row
carried a `left` and a `width` in percent, computed from the trace's own start and span:
`parentSpanId` + `startEpochNanos` + `durationMs` is exactly that, and nothing in it was a curve. No
SPA on this platform has a chart library, and the one place a chart was ever considered, it was
refused in writing.

`traces/trace-layout.ts` moved along with the waterfall and the trace list alike, to the landing
app (qits-2342, qits-2343); `layOutTrace`, `EMPTY_WATERFALL`, `WaterfallRow` and `formatDuration`
are no longer part of this repository. The function existed to assert, directly rather than
through the DOM, the three shapes a bounded buffer forces — each of them drew something plausible
and wrong if handled carelessly: a span whose parent is not buffered, drawn at the top level rather
than re-parented; a trace with no root at all, flagged as `rootMissing` rather than promoting the
earliest survivor into a root it never was; and `durationMs` as integer milliseconds, so a
sub-millisecond span floored to a `0%`-width bar in CSS labelled `<1 ms` rather than vanishing.

`metric-series.ts` moved along with the metrics screen itself, to the landing app (qits-2340); the
metric-grouping, series-counting and unit-gloss logic it held is no longer part of this repository.

`error-group.ts` moved along with the errors screen itself, to the landing app (qits-2339); the
group-headline logic it held is no longer part of this repository.

`trace-group.ts` moved along with the trace list itself, to the landing app (qits-2342); the
path-folding logic it held is no longer part of this repository.

One measurement worth writing down: a nanosecond epoch is a 61-bit figure and JSON hands it to a
double, so its low bits are gone before this code sees it — 42 ms of nanos measures back as
42.000128 ms. Every calculation here lands in milliseconds, where 128 ns is five orders of magnitude
below the smallest thing drawn, so it is recorded rather than defended against. It is also why the
specs compare durations with a tolerance and build their stamps instead of typing them: a literal
that large is rejected outright by `no-loss-of-precision`.

## Running the checks

```bash
npm run lint && npm test && npm run build
```

**No pipeline runs here yet.** `.config/qits/ci-event-release-request.yml` is in place — the one
pipeline this repository has, running those same three on a release request's fold — but this
repository has no origin on the platform git host, so qits-ci never sees it and nothing runs them
but you. A change here reaches production when the `webui` gitlink in qits-observability-service is
bumped and that repository's own release request goes green — its pipeline fetches this submodule
from GitHub, rewrites the lockfile's registry origins, and builds the bundle into the service image.

## Development server

```bash
ng serve
```

Once the server is running, open `http://localhost:4200/`. The application reloads whenever you
modify a source file. `proxy.conf.json` forwards `/observability/api`, `/main-navigation` and
`/projects/api` to an edge on `localhost:8080`, because `ng serve` puts no edge in front. In a
deployment every call is a same-origin path on this service's own host, which is what carries the
browser's session cookie to `/observability/api/telemetry/…` with no machine token and no CORS.

## Running unit tests

```bash
ng test
```

Vitest on jsdom through `@angular/build:unit-test`, with no vitest config file, matching every other
SPA here. `HttpTestingController` with `afterEach(() => http.verify())` for the transport,
`RouterTestingHarness` + `provideLocationMocks()` for the routes, fake timers for the poller, and an
`app.config.spec.ts` asserting the Fetch backend — the backend choice is invisible when it is wrong,
and on the telemetry UI getting it wrong would be self-inflicted.

There is no end-to-end framework on this platform, in this repository or any sibling.
