# Prompts used

AI tooling: **Claude** (Anthropic), via the Claude chat interface. 

## Prompt 1: Main Bacbone of the calculator structure

```
Objective:
Build a full-stack calculator application with a React frontend and a backend microservice.
The frontend should consume the backend API to perform basic and advanced arithmetic operations.
Focus on clean design, maintainable code, and testable architecture.

Requirements:
Functional:
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

Non-Functional:
   * Clean, readable, and idiomatic code (frontend and backend)
   * Unit tests covering key functionality for both layers
   * Documentation: setup instructions, API usage, and design rationale
   * Optional: Dockerfile for full-stack deployment

Constraints
   * Frontend: React with TypeScript
   * Backend: Go

Extra Requirements
   README.md
      * Setup instructions
      * How to run the frontend and backend
      * Examples of API calls (if using REST)
      * Design decisions or assumptions
   docker-compose.yml
   Makefile
      * Build
      * Test
      * Run
      * Docker Compose
   Tests
      * Unit tests
      * Coverage report
```

## Prompt 2: UI redesign

```
UI is looking dull
1- Make it responsive
2- Change layout, make it looklike a calculator
3- Also I want buttons with symbols, not labels
4- Make the result panel always visible and inside the design, not an extension that is detached from design
```

## Prompt 3: CORS

```
Add CORS to "newRouter" function, also give me "go mod" for installation of package
```

## Prompt 4: 

```

```

## Prompt 5: 

```

```
