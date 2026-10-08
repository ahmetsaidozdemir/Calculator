# Calculator

A full-stack calculator: a **React + TypeScript** keypad calculator that talks to a **Go REST API**.

- Operations: add, subtract, multiply, divide, **power**, **square root**, **percent**
- A real calculator UI: symbol keys, a display built into the device (always visible), chained calculations, and full **keyboard support**
- Responsive: fills the screen on phones, a centred device on desktop, side-by-side layout on landscape phones; light and dark themes
- Errors from the API (division by zero, overflow, ...) appear on the calculator's own display
- Unit tests for both layers (frontend 89 tests / 100% coverage; backend 79.6% overall, 97-100% on the logic packages), coverage snapshot in [`docs/coverage-report.txt`](docs/coverage-report.txt)
- **Two Docker images** (frontend on nginx, backend on distroless) brought up together with **docker compose**
- Backend uses only the Go standard library; zero third-party Go dependencies

## Project structure

```
.
├── backend/
│   ├── Dockerfile
│   ├── cmd/server/          # main(): config, timeouts, graceful shutdown, routing, -healthcheck
│   └── internal/
│       ├── calc/            # pure arithmetic + edge cases (no HTTP)
│       ├── api/             # HTTP handlers, JSON contract, error mapping, logging
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf.template  # static files + /api proxy to the backend
│   └── src/
│       ├── calculatorReducer.ts  # the calculator's behaviour: a pure state machine
│       ├── useCalculator.ts      # runs the reducer and makes the API calls it asks for
│       ├── keys.ts               # keypad layout + keyboard shortcuts (data)
│       ├── operations.ts         # symbols and how each operation is displayed
│       ├── api.ts                # the only code that calls fetch()
│       └── components/Calculator.tsx
├── docker-compose.yml
├── docs/coverage-report.txt
├── Makefile
└── PROMPTS.md               # AI prompts used
```

## Setup

Prerequisites: **Go 1.22+** and **Node 20+** (Docker is optional).

### Run in development (two terminals)

```bash
# 1. Backend  ->  http://localhost:8080
cd backend
go run ./cmd/server

# 2. Frontend ->  http://localhost:5173  (proxies /api to :8080)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. `make run-backend` and `make run-frontend` are shortcuts.

### Run with Docker (two images, one command)

```bash
docker compose up --build        # or: make up
```

Open <http://localhost:80> (set `FRONTEND_PORT=80` to use another port).

| Image                | Base                         | Role                                                                 |
| -------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `calculator-frontend` | `nginx:1.27-alpine`          | Serves the built React app and proxies `/api/*` to the backend       |
| `calculator-backend`  | `distroless/static:nonroot`  | The Go API: a static binary, no shell, runs as a non-root user       |

The backend is not published to the host; only the frontend container talks to it, so the browser sees a single origin and no CORS is needed. Compose starts the frontend only once the backend reports healthy (the Go binary probes itself with `-healthcheck`, since distroless has no `curl`). The API is still reachable through the frontend:

```bash
curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"add","a":1,"b":2}'
```

Build and run the images individually if you prefer:

```bash
docker build -t calculator-backend ./backend
docker build -t calculator-frontend ./frontend
docker network create calc
docker run -d --rm --network calc --name backend calculator-backend
docker run --rm --network calc -p 8080:80 calculator-frontend
```

### Run as a single process (no Docker)

The Go server can also serve the built frontend itself:

```bash
cd frontend && npm install && npm run build && cd ..
cd backend && go run ./cmd/server   # http://localhost:8080
```

### Configuration

| Component | Variable          | Default                | Meaning                                                              |
| --------- | ----------------- | ---------------------- | -------------------------------------------------------------------- |
| backend   | `PORT`            | `8080`                 | Port the server listens on                                           |
| frontend image | `BACKEND_INTERNAL_URI` | `http://backend:8080` | Where nginx proxies `/api/*` (rendered into the nginx config at start-up) |
| frontend build | `VITE_BACKEND_EXTERNAL_URI` | *unset* (same origin) | Build-time API base URL; would also require CORS on the backend |

## Tests and coverage

```bash
make test        # both layers
make coverage    # summaries + HTML reports

# or individually
cd backend  && go test -cover ./...
cd frontend && npm test            # npm run test:coverage for coverage
```

Latest results (full output in [`docs/coverage-report.txt`](docs/coverage-report.txt)):

| Layer    | Result                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| Backend  | `calc` 97.1% · `api` 98.0% · `web` 100% · `cmd/server` 40.9% · **total 79.6%**                       |
| Frontend | 89 tests across 6 files, **100%** statements/branches/functions/lines                               |

The low `cmd/server` figure is deliberate: routing, env handling and the health probe are tested, but `main`/`run` (binding a port, OS signals, graceful shutdown) are thin process wiring that I chose not to unit-test. The 2.9% gap in `calc` is one defensive branch that cannot be reached with valid floats.

## API

Base path `/api/v1`. All bodies are JSON.

### `POST /api/v1/calculate`

| Field       | Type   | Notes                                                              |
| ----------- | ------ | ------------------------------------------------------------------ |
| `operation` | string | One of the operations below                                        |
| `a`         | number | Required                                                           |
| `b`         | number | Required for binary operations, **rejected** for `sqrt`            |

| `operation` | Operands | Meaning                       |
| ----------- | -------- | ----------------------------- |
| `add`       | `a`, `b` | `a + b`                       |
| `subtract`  | `a`, `b` | `a - b`                       |
| `multiply`  | `a`, `b` | `a × b`                       |
| `divide`    | `a`, `b` | `a ÷ b`                       |
| `power`     | `a`, `b` | `a` to the power `b`          |
| `sqrt`      | `a`      | square root of `a`            |
| `percent`   | `a`, `b` | `a` percent of `b`            |

**Success (200)**

```bash
curl -s -X POST localhost:8080/api/v1/calculate \
  -d '{"operation":"add","a":0.1,"b":0.2}'
# {"operation":"add","result":0.3}

curl -s -X POST localhost:8080/api/v1/calculate \
  -d '{"operation":"sqrt","a":144}'
# {"operation":"sqrt","result":12}

curl -s -X POST localhost:8080/api/v1/calculate \
  -d '{"operation":"percent","a":15,"b":200}'
# {"operation":"percent","result":30}
```

**Errors**: every failure has the same shape: a stable `code` for programs, a `message` for people.

```bash
curl -s -i -X POST localhost:8080/api/v1/calculate \
  -d '{"operation":"divide","a":1,"b":0}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":{"code":"division_by_zero","message":"cannot divide by zero"}}
```

| HTTP | `code`                 | When                                                       |
| ---- | ---------------------- | ---------------------------------------------------------- |
| 400  | `invalid_json`         | Malformed/empty body, wrong types, unknown fields, trailing data |
| 400  | `unknown_operation`    | Missing or unsupported `operation`                         |
| 400  | `missing_operand`      | `a` missing, or `b` missing for a binary operation         |
| 400  | `unexpected_operand`   | `b` supplied to `sqrt`                                     |
| 405  | `method_not_allowed`   | Anything but `POST` on `/calculate` (`Allow: POST` is set) |
| 413  | `request_too_large`    | Body over 4 KiB                                            |
| 422  | `division_by_zero`     | `x ÷ 0`, or `0` to a negative power                        |
| 422  | `negative_square_root` | `sqrt` of a negative number                                |
| 422  | `not_a_real_number`    | e.g. `(-8)` to the power `0.5`                             |
| 422  | `out_of_range`         | Result overflows float64 (JSON cannot carry `Infinity`)    |
| 404  | `not_found`            | Unknown path under `/api/`                                 |
| 500  | `internal_error`       | Bug; details are logged, never returned                    |

### `GET /healthz`

Returns `{"status":"ok"}`; handy for container/orchestrator probes.

## Design decisions and assumptions

**Architecture**
- **Three thin layers on the backend.** `calc` (pure maths, no HTTP) → `api` (HTTP/JSON mapping) → `cmd/server` (wiring). The rules live in `calc`, so they are tested without HTTP, and `api` tests cover only the contract.
- **One `calculate` endpoint instead of one route per operation.** Operations are data in a registry (`calc.operations`), so adding one is a single map entry plus a tiny frontend entry, with no new route, handler, or test scaffolding. The trade-off is that the operation is in the body rather than the URL.
- **Sentinel errors + a mapping table.** `calc` returns typed errors (`errors.Is`); `api` maps them to status/code in one table. No string matching, and unmapped errors become a generic 500 so internals never leak.
- **400 vs 422.** 400 means "your request is malformed"; 422 means "well-formed, but the maths is invalid". Clients can tell a bug from a user mistake.
- **Standard library only (Go 1.22 `ServeMux`).** Method+path patterns are enough for two routes; no framework to learn or update.
- **The Go server can also serve the built UI**, which makes the Docker image a single small, non-root, distroless container and removes any need for CORS.

**Numbers**
- **`float64` with results rounded to 15 significant digits.** Without this, `0.1 + 0.2` would show `0.30000000000000004`. 15 digits is float64's guaranteed round-trip precision, so integers up to 10^15 stay exact. Beyond ~9×10^15, float64 itself cannot represent every integer.
- **`NaN`/`±Inf` are never returned.** JSON cannot encode them, so they become `422` errors; `-0` is normalised to `0`.
- **`percent` means "`a` percent of `b`"** (15, 200 → 30). Other calculators define `%` differently (e.g. `a / 100`); this is the version that fits a stateless two-operand API, and it is documented in the UI labels ("Percent … Of …").

**Frontend**
- **A keypad calculator driven by a pure state machine.** All behaviour (typing rules, operator changes, chaining, errors) lives in `calculatorReducer.ts` as `(state, action) => state`, with no I/O. When a key needs the backend, the reducer records a `request`; `useCalculator` performs the call and dispatches `resolved`/`failed`. So every key sequence is unit-tested without a network, and the component is a thin view.
- **Chaining.** `2 + 3 ×` evaluates `2 + 3` on the server when `×` is pressed, shows `5 ×`, and continues. Evaluation is strictly left-to-right (like a basic desk calculator), not precedence-aware: `2 + 3 × 4` gives 20, not 14. Pressing `=` straight after an operator uses the first operand twice (`5 + =` is 10). Input is ignored while a request is in flight, so results can never arrive out of order.
- **Invalid input is impossible by construction.** The reducer allows one decimal point, at most 15 digits (the backend's precision) and no stray characters, and the keyboard handler only reacts to mapped keys. What remains, such as division by zero, is the server's call: its message is shown on the display, and the next key dismisses it. The server stays the single source of truth for maths.
- **The display is part of the device.** It is always rendered (so the layout never jumps), shows the running expression above the entry, shrinks its font for long numbers, and doubles as the error and status area (`role="status"`, `aria-busy` while calculating).
- **Symbol keys, accessible names.** Keys show `÷ × − + √ ^ % ⌫ ±`; each also has an `aria-label`/tooltip ("Divide", "Square root", ...) so screen readers and hover users still get words. The operator waiting for its second operand is shown pressed (`aria-pressed`).
- **Keyboard support.** Digits, `+ - * / ^ %`, `.` or `,` (decimal), `Enter`/`=`, `Backspace`, `Esc`/`c` (clear), `r` (square root), `n` (change sign). `Enter` never re-presses the on-screen key you last clicked, and Ctrl/Cmd/Alt shortcuts are left to the browser.
- **Responsive.** Phones: the calculator fills the screen and the display absorbs spare height (safe-area insets respected). Tablets/desktop: a centred 24rem device. Landscape phones: display left, keys right, so nothing scrolls. Light/dark follow the system; all text/background pairs meet WCAG AA (4.5:1).
- **All network code lives in `api.ts`.** Components never touch `fetch`; failures surface as one `ApiError` type (including network failure and non-JSON proxy errors).

**Deployment**
- **Two images, each with one job.** nginx serves the static build and reverse-proxies `/api/`, so the browser has a single origin (no CORS) and the Go service stays private. The backend image is a static binary on distroless (no shell, non-root).
- **Self-probing health check.** The backend binary supports `-healthcheck`, which GETs its own `/healthz`; compose uses it so the frontend only starts once the API is up.
- **Backend address is configuration**, not code: `BACKEND_URI` is rendered into the nginx config when the container starts.

**Out of scope on purpose** (the brief asks to prioritise correctness and clarity): calculation history, full expression parsing with operator precedence and parentheses, authentication, rate limiting, i18n.

## Next steps

- CORS middleware (configurable origin) if the frontend is ever hosted separately
- Calculation history; locale-aware number formatting (e.g. `1.234,5`)
- Arbitrary-precision decimals (`math/big`) for financial use cases
- OpenAPI spec generated from the handler types; CI workflow running `make test` and building both images

## AI tooling

This project was built using Claude (Anthropic). The prompts used can be found in [`PROMPTS.md`](PROMPTS.md).
