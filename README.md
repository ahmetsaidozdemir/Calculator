# Calculator

A full-stack calculator built with **React, TypeScript, and Go**.
The frontend provides a responsive, keyboard-accessible calculator interface, while a Go REST API handles arithmetic operations and numerical edge cases.

## Features

- **Arithmetic:** addition, subtraction, multiplication, division, exponentiation, square root, and percentage.
- **Calculator behavior:** chained calculations, sign changes, decimal input, and error handling.
- **Keyboard support:** perform calculations without relying exclusively on the on-screen keypad.
- **Responsive UI:** layouts for mobile, desktop, and landscape phones.
- **Accessibility:** descriptive control labels, status announcements, and visible calculation states.
- **API-driven calculations:** arithmetic is handled by the backend, with structured errors displayed in the calculator UI.
- **Automated tests:** frontend and backend unit tests, with coverage reports.
- **Containerized deployment:** separate Nginx frontend and distroless Go backend images, orchestrated with Docker Compose.

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Go, `net/http`, JSON |
| Testing | Frontend unit tests, Go tests, coverage reporting |
| Web serving | Nginx |
| Containers | Docker, Docker Compose |
| Backend runtime | Distroless static image, non-root user |

The backend uses Go's standard library for HTTP serving and `github.com/rs/cors` for CORS middleware.

## Architecture

```text
Browser
   |
   | HTTP
   v
Nginx / React frontend
   |
   | /api/*
   v
Go REST API
   |
   v
Calculation logic
```

The frontend and backend have separate responsibilities:

- **Frontend:** manages calculator input, interaction state, rendering, and API requests.
- **Backend API:** validates requests, executes calculations, and maps failures to structured HTTP responses.
- **Calculation layer:** contains arithmetic rules and numerical edge-case handling independently of HTTP.
- **Nginx:** serves the production frontend build and proxies API requests to the Go service.

### Project structure

```text
.
├── backend/
│   ├── Dockerfile
│   ├── cmd/
│   │   └── server/
│   └── internal/
│       ├── calc/
│       └── api/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf.template
│   └── src/
│       ├── calculatorReducer.ts
│       ├── useCalculator.ts
│       ├── keys.ts
│       ├── operations.ts
│       ├── api.ts
│       └── components/
│           └── Calculator.tsx
├── docs/
│   └── coverage-report.txt
├── docker-compose.yml
├── Makefile
└── PROMPTS.md
```

## Getting started

### Prerequisites

- Go 1.22 or later
- Node.js 20 or later and npm
- Docker and Docker Compose for containerized execution

### Run locally

Start the backend in the first terminal:

```bash
cd backend
go run ./cmd/server
```

The backend listens on `http://localhost:8080` by default.

Start the frontend in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. In development, Vite proxies API requests to the backend on port `8080`.

The Makefile also provides shortcuts:

```bash
make run-backend
make run-frontend
```

### Run with Docker Compose

Build and start both services:

```bash
docker compose up --build
```

Open the frontend at `http://localhost:80` with the default configuration. The host ports can be configured through the environment variables used by `docker-compose.yml`.

The frontend proxies requests under `/api/` to the backend. The backend also has a host port mapping in the current Compose configuration, allowing direct API testing.

To stop the services:

```bash
docker compose down
```

To follow the logs:

```bash
docker compose logs -f
```

### Container images

| Image | Base | Role |
|---|---|---|
| `calculator-frontend` | `nginx:1.27-alpine` | Serves the production-built React application and proxies `/api/*` requests to the backend. |
| `calculator-backend` | `gcr.io/distroless/static-debian12:nonroot` | Runs the statically compiled Go REST API as a non-root user, without a shell or package manager. |

The backend image uses a multi-stage build: compilation happens in a Go Alpine build stage, while the runtime image contains the compiled binary. This keeps build tooling out of the production image.

Docker Compose waits for the backend health check before starting the frontend. Because the distroless image does not include common shell utilities such as `curl`, the backend binary provides its own health-check mode.

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | Port on which the Go server listens; defaults to `8080`. |
| `FRONTEND_PORT` | Host port mapped to the Nginx container's port `80`. |
| `BACKEND_PORT` | Host port mapped to the backend's port `8080`. |
| `BACKEND_INTERNAL_URI` | Backend address used by Nginx inside the container network. |
| `VITE_BACKEND_EXTERNAL_URI` | Optional frontend build-time API base URL for deployments that use a separately hosted API. |

For the default local development setup, the frontend uses Vite's development proxy and the backend listens on port `8080`.

## REST API

The API base path is `/api/v1`. Request and response bodies use JSON.

### `POST /api/v1/calculate`

Performs a calculation.

**Request fields**

| Field | Type | Description |
|---|---|---|
| `operation` | string | Operation to execute. |
| `a` | number | First operand; required. |
| `b` | number | Second operand; required for binary operations and rejected for square root. |

**Supported operations**

| Operation | Operands | Calculation |
|---|---|---|
| `add` | `a`, `b` | `a + b` |
| `subtract` | `a`, `b` | `a - b` |
| `multiply` | `a`, `b` | `a × b` |
| `divide` | `a`, `b` | `a ÷ b` |
| `power` | `a`, `b` | `a` raised to the power of `b` |
| `sqrt` | `a` | Square root of `a` |
| `percent` | `a`, `b` | `a` percent of `b` |

### Examples

Addition:

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":0.1,"b":0.2}'
```

Square root:

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","a":144}'
```

Percentage:

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"percent","a":15,"b":200}'
```

A successful request returns HTTP `200` with the calculated result and operation:

```json
{
  "operation": "add",
  "result": 0.3
}
```

### Error handling

Errors use a consistent response structure with a stable machine-readable code and a human-readable message.

Example: division by zero

```bash
curl -i -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":1,"b":0}'
```

Example response:

```json
{
  "error": {
    "code": "division_by_zero",
    "message": "cannot divide by zero"
  }
}
```

**Error categories**

| HTTP status | Error code | Meaning |
|---|---|---|
| `400` | `invalid_json` | Malformed JSON, invalid field types, unknown fields, or trailing data. |
| `400` | `unknown_operation` | Missing or unsupported operation. |
| `400` | `missing_operand` | A required operand is missing. |
| `400` | `unexpected_operand` | An operand was supplied to an operation that does not accept it. |
| `405` | `method_not_allowed` | Unsupported HTTP method. |
| `413` | `request_too_large` | Request body exceeds the configured limit. |
| `422` | `division_by_zero` | Division by zero or zero raised to a negative power. |
| `422` | `negative_square_root` | Square root of a negative number. |
| `422` | `not_a_real_number` | Calculation produces a non-real result. |
| `422` | `out_of_range` | Result cannot be represented as a valid JSON number. |
| `404` | `not_found` | Unknown API path. |
| `500` | `internal_error` | Unexpected server-side failure; internal details are not returned to the client. |

### Health check

`GET /healthz`

Returns:

```json
{
  "status": "ok"
}
```

This endpoint is used to check backend readiness and supports container health monitoring.

## Frontend engineering

### Reducer-driven state management

The calculator's interaction logic is implemented as a pure state machine in `calculatorReducer.ts`. It handles input, operator selection, chaining, clearing, and error states without performing network requests.

`useCalculator.ts` coordinates the reducer with asynchronous API calls. When a calculation is required, it performs the request and dispatches a success or failure action. This separation makes interaction sequences testable without a live backend.

### Centralized API access

Network requests are centralized in `api.ts`. UI components do not call `fetch` directly. API failures are normalized into a common error type so network errors and server-side errors can be handled consistently.

### Keyboard and accessibility support

The calculator supports keyboard entry for digits, arithmetic operators, decimal input, evaluation, deletion, clearing, square root, and sign changes. Controls have descriptive accessible labels, and the display communicates calculation status and errors.

### Calculation behavior

Calculations are evaluated from left to right rather than using conventional mathematical operator precedence. For example:

```text
2 + 3 × 4 = 20
```

The calculator evaluates `2 + 3` first, then multiplies the result by `4`. Input is ignored while a request is in flight to avoid overlapping calculations changing the result out of order.

## Design decisions and assumptions

### Separation of concerns

The backend is organized into three logical layers:

- `calc`: arithmetic rules and numerical validation, independent of HTTP.
- `api`: request validation, JSON handling, HTTP status codes, and error mapping.
- `cmd/server`: application wiring, server configuration, timeouts, and shutdown behavior.

This keeps the calculation logic independently testable and prevents transport concerns from spreading into the core logic.

### One calculation endpoint

All operations use a single `POST /api/v1/calculate` endpoint. The requested operation is provided in the JSON body rather than encoded in the URL. This keeps the API small and makes the operation contract consistent.

### Explicit error mapping

Calculation errors are mapped to HTTP status codes and stable error codes. Malformed requests use `400 Bad Request`; mathematically invalid operations use `422 Unprocessable Entity`. Unexpected internal failures return a generic `500` response rather than exposing implementation details.

### Numerical precision

The backend uses `float64` and normalizes results to 15 significant digits to avoid exposing common floating-point artifacts such as `0.1 + 0.2` producing `0.30000000000000004`.

This is appropriate for a general-purpose calculator, but binary floating-point is not suitable for all financial calculations. Applications requiring exact decimal arithmetic would need a decimal or arbitrary-precision representation.

### Percentage semantics

The `percent` operation means “`a` percent of `b`.” For example, `15` and `200` produce `30`. This interpretation is explicit in the API and UI rather than relying on an ambiguous `%` convention.

### Container design

The production frontend and backend have separate images and responsibilities. Nginx serves static assets and proxies API requests; the backend runs as a non-root user in a minimal distroless runtime image.

This reduces the runtime image's contents and keeps frontend delivery separate from API execution. Compose health checks coordinate service startup.

## Testing and coverage

Run the complete test suite:

```bash
make test
```

Generate coverage summaries and reports:

```bash
make coverage
```

Or run tests individually:

```bash
cd backend
go test -cover ./...
```

```bash
cd frontend
npm ci
npm test
npm run test:coverage
```

Frontend type checking and production build can also be run with:

```bash
cd frontend
npm run typecheck
npm run build
```

### Coverage snapshot

The repository's existing coverage report records the following results. Re-run the suite before treating these figures as the current results.

| Layer | Coverage result |
|---|---|
| Backend `calc` | 97.1% |
| Backend `api` | 98.0% |
| Backend `web` | 100% |
| Backend `cmd/server` | 40.9% |
| Backend overall | 79.6% |
| Frontend | 89 tests; 100% statements, branches, functions, and lines |

The backend's lower `cmd/server` coverage reflects process-level wiring such as port binding, signal handling, and graceful shutdown that is not fully exercised by unit tests. The detailed coverage snapshot is available in [`docs/coverage-report.txt`](docs/coverage-report.txt).

## Limitations and scope

The project intentionally focuses on calculation correctness and a clear API/UI boundary. It does not currently include:

- Calculation history or persistent storage.
- A full expression parser, parentheses, or conventional operator precedence.
- User authentication or authorization.
- Rate limiting.
- Localization or locale-aware number formatting.
- Arbitrary-precision decimal arithmetic.

These features could be added if the requirements expand, but they are not necessary for the current calculator scope.

## AI tooling

This project was developed with AI assistance. The prompts used during development are documented in [`PROMPTS.md`](PROMPTS.md).

## License

No license is currently specified. Unless a license is added to the repository, reuse and redistribution permissions should not be assumed.