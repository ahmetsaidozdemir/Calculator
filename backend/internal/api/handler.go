// Package api is the HTTP layer: it decodes requests, delegates to package calc
// and maps results and errors to JSON responses.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"calculator/internal/calc"
)

// maxBodyBytes caps request bodies; a calculate request is well under 100 bytes.
const maxBodyBytes = 4 << 10

// CalculateRequest is the body of POST /api/v1/calculate. Operands are pointers
// so a missing field can be told apart from zero.
type CalculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

// CalculateResponse is the body returned on success.
type CalculateResponse struct {
	Operation string  `json:"operation"`
	Result    float64 `json:"result"`
}

// ErrorResponse is the body returned for every failure.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody carries a stable machine-readable code and a human-readable message.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

var errTrailingData = errors.New("body must contain a single JSON object")

// calcErrors maps domain errors to HTTP responses. 400 means the request itself
// is malformed; 422 means it is well-formed but mathematically invalid.
var calcErrors = []struct {
	target error
	status int
	code   string
}{
	{calc.ErrUnknownOperation, http.StatusBadRequest, "unknown_operation"},
	{calc.ErrMissingOperand, http.StatusBadRequest, "missing_operand"},
	{calc.ErrUnexpectedOperand, http.StatusBadRequest, "unexpected_operand"},
	{calc.ErrDivisionByZero, http.StatusUnprocessableEntity, "division_by_zero"},
	{calc.ErrNegativeSqrt, http.StatusUnprocessableEntity, "negative_square_root"},
	{calc.ErrNotReal, http.StatusUnprocessableEntity, "not_a_real_number"},
	{calc.ErrOutOfRange, http.StatusUnprocessableEntity, "out_of_range"},
}

// NewHandler returns the API routes. It is a plain http.Handler so it can be
// tested with httptest and mounted under any server.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", handleCalculate)
	mux.HandleFunc("/api/v1/calculate", methodNotAllowed(http.MethodPost))
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("/api/", handleNotFound)
	return mux
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req CalculateRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		writeDecodeError(w, err)
		return
	}

	result, err := calc.Evaluate(req.Operation, req.A, req.B)
	if err != nil {
		writeCalcError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, CalculateResponse{Operation: req.Operation, Result: result})
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "no such endpoint")
}

func methodNotAllowed(allowed string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", allowed)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "use "+allowed+" for this endpoint")
	}
}

// decodeJSON strictly decodes one JSON value: unknown fields and trailing data
// are errors, so typos like {"operand": ...} fail loudly instead of silently.
func decodeJSON(body io.Reader, dst any) error {
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	_, err := dec.Token()
	switch {
	case err == nil:
		return errTrailingData
	case errors.Is(err, io.EOF):
		return nil
	default:
		return err
	}
}

func writeDecodeError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body is too large")
	case errors.Is(err, io.EOF):
		writeError(w, http.StatusBadRequest, "invalid_json", "request body is empty")
	default:
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body: "+err.Error())
	}
}

func writeCalcError(w http.ResponseWriter, err error) {
	for _, e := range calcErrors {
		if errors.Is(err, e.target) {
			writeError(w, e.status, e.code, err.Error())
			return
		}
	}
	// Unmapped errors are bugs; don't leak internals to the client.
	writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, ErrorResponse{Error: ErrorBody{Code: code, Message: message}})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The status line is already sent; there is nothing useful to do on failure.
	_ = json.NewEncoder(w).Encode(body)
}
