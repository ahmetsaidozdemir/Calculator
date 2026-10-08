# Prompts used

AI tooling: **Claude** (Anthropic), via the Claude chat interface. The assistant wrote the code, tests and docs, and ran them in its own sandbox (`go test`, `vitest`, a production build, and `curl` smoke tests against the running server, including real nginx in front of the Go server). The Dockerfiles and `docker-compose.yml` were written but could not be built there (no Docker daemon), so build them once locally before submitting. The UI was not viewed in a real browser by the assistant; colour contrast was checked numerically.

## Prompt 1: the assignment, pasted verbatim

```
Objective
Build a full-stack calculator application with a React frontend and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.Requirements
Functional
Operations:

* Addition, Subtraction, Multiplication, Division
* Optional: Exponentiation, Square Root, Percentage

Frontend (React):

* Intuitive UI for entering input and displaying results
* Input validation and error handling
* Responsive design (basic mobile support)

Backend (REST API):

* Expose endpoints for calculator operations
* Validate input and handle edge cases (division by zero, invalid data)
* Return results in JSON format

Non-Functional

* Clean, readable, and idiomatic code (frontend and backend)
* Unit tests covering key functionality for both layers
* Documentation: setup instructions, API usage, and design rationale
* Optional: Dockerfile for full-stack deployment

Constraints

* Frontend: React (TypeScript preferred)
* Backend: Go is perferred

Deliverables

1. Git repository with frontend and backend code
2. README with setup instructions, API examples, and design decisions
3. Unit tests and coverage report
4. Optional: Dockerfile to run frontend + backend together

Instructions

1. Use any AI tooling you would like
2. Spend ~2–4 hours on this assignment. Prioritize correctness, clarity, and maintainability over extra features.
3. Push your solution to GitHub, GitLab, or another Git repository.
4. Share the repository link with us for evaluation.
5. Share any prompts that you used in your work
6. Make sure your README includes:
   * Setup instructions
   * How to run the frontend and backend
   * Examples of API calls (if using REST)
   * Design decisions or assumptions
```

## Prompt 2: UI redesign and Docker

```
Sooo, the UI of the React part is looking embarresingly dull, can we
1- Make it responsive
2- Maybe change layout, a bit like a good calculator, with good colors and button sizes, also I want buttons with symbols, not labels
and make result panel always visible and inside the panel, not an extension that is detached from design

Also, want 2 docker images and docker compose to set the up
```

## Further prompts

_Add any further prompts you send while reviewing or changing the code here._
