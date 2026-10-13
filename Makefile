SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: build build-backend build-frontend docker-build run-backend run-frontend test test-backend test-frontend coverage up down

build: build-backend build-frontend

build-backend:
	cd backend && go build -o bin/server ./cmd/server

build-frontend:
	cd frontend && npm ci && npm run typecheck && npm run build

docker-build:
	docker compose build

run-backend:
	cd backend && go run ./cmd/server

run-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm ci && npm test

# Runs both suites with coverage and collects everything under docs/ (all committed):
#   docs/coverage-report.txt     combined text summary (start here)
#   docs/backend-coverage/       coverage.out, coverage.html
#   docs/frontend-coverage/      full vitest HTML report (open index.html)
BACKEND_COV  := docs/backend-coverage
FRONTEND_COV := docs/frontend-coverage

coverage:
	rm -rf $(BACKEND_COV) $(FRONTEND_COV)
	mkdir -p $(BACKEND_COV)
	( echo "== Backend: go test -coverprofile / go tool cover -func =="; echo; \
	  cd backend && go test -coverprofile=../$(BACKEND_COV)/coverage.out ./... && \
	  go tool cover -func=../$(BACKEND_COV)/coverage.out && \
	  go tool cover -html=../$(BACKEND_COV)/coverage.out -o ../$(BACKEND_COV)/coverage.html ) 2>&1 | tee docs/coverage-report.txt
	( echo; echo "== Frontend: vitest --coverage =="; echo; \
	  cd frontend && npm ci --silent && NO_COLOR=1 npm run test:coverage ) 2>&1 | tee -a docs/coverage-report.txt
	mv frontend/coverage $(FRONTEND_COV)
	@echo; echo "Coverage written to docs/:"; ls -1 docs

# Frontend is served on http://localhost:8080
# Backend is served on http://localhost:8081
up:
	docker compose up --build

down:
	docker compose down