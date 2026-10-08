.PHONY: run-backend run-frontend test test-backend test-frontend coverage up down

run-backend:
	cd backend && go run ./cmd/server

run-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test

# Prints a summary for both layers; HTML reports land in backend/coverage.html
# and frontend/coverage/index.html.
coverage:
	cd backend && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out && go tool cover -html=coverage.out -o coverage.html
	cd frontend && npm run test:coverage

# Both containers via docker compose; the app is served on http://localhost:8080
up:
	docker compose up --build

down:
	docker compose down
