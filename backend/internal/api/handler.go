// Package api is the HTTP layer
// Decodes requests, delegates to package calc
// Maps results and errors to JSON responses.
package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"calculator/internal/calc"
)

// Max Body Cap, 4096 bytes for now
const maxBodyBytes = 1 << 12

// CalculateRequest is the body of POST /api/v1/calculate.
// Operands are pointers so a missing field can be told apart from zero.
type CalculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

// CalculateResponse is the body returned on success.
type CalculateResponse struct {
	//	Operation string  `json:"operation"`
	Result float64 `json:"result"`
}

// ErrorResponse is the body returned for every failure.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody carries code and message.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Handler error, so it can not be moved to calc package
var errTrailingData = errors.New("body must contain a single JSON object")

// calcErrors maps domain errors to HTTP responses.
// 400 means the request itself is malformed;
// 422 means it is mathematically invalid.
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

// NewHandler returns the API routes.
// It is a plain http.Handler so it can be tested with httptest.
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
	writeJSON(w, http.StatusOK, CalculateResponse{Result: result})
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

	// Decode the first JSON value without binding it to the request type.
	var raw json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		return err
	}

	// The API requires a JSON object, not null, an array, or a scalar.
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '{' {
		return errors.New("request body must be a JSON object")
	}

	// Reject a second JSON value or any trailing non-whitespace data.
	var extra json.RawMessage
	err := dec.Decode(&extra)
	switch {
	case errors.Is(err, io.EOF):
		// Exactly one JSON value.
	case err == nil:
		return errTrailingData
	default:
		return err
	}

	// Decode the object into the actual request type and reject
	// unknown fields.
	objectDecoder := json.NewDecoder(bytes.NewReader(raw))
	objectDecoder.DisallowUnknownFields()

	if err := objectDecoder.Decode(dst); err != nil {
		return err
	}

	return nil
}

func writeDecodeError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body is too large")
	case errors.Is(err, io.EOF):
		writeError(w, http.StatusBadRequest, "invalid_json", "request body is empty")
	default:
		writeError(w, http.StatusBadRequest, "invalid_json", "request body must contain a valid JSON object")
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
