package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, rec.Body.String())
	}
	return v
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want float64
	}{
		{"add", `{"operation":"add","a":1,"b":2}`, 3},
		{"subtract", `{"operation":"subtract","a":5,"b":8}`, -3},
		{"multiply", `{"operation":"multiply","a":0.1,"b":3}`, 0.3},
		{"divide", `{"operation":"divide","a":1,"b":4}`, 0.25},
		{"power", `{"operation":"power","a":2,"b":10}`, 1024},
		{"sqrt", `{"operation":"sqrt","a":9}`, 3},
		{"percent", `{"operation":"percent","a":15,"b":200}`, 30},
		{"zero operands are not 'missing'", `{"operation":"add","a":0,"b":0}`, 0},
		{"exponent notation", `{"operation":"add","a":1e3,"b":1}`, 1001},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/calculate", tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			got := decode[CalculateResponse](t, rec)
			if got.Result != tt.want {
				t.Errorf("result = %v, want %v", got.Result, tt.want)
			}
		})
	}
}

func TestCalculateEchoesOperation(t *testing.T) {
	rec := do(t, http.MethodPost, "/api/v1/calculate", `{"operation":"sqrt","a":16}`)
	if got := decode[CalculateResponse](t, rec); got.Operation != "sqrt" || got.Result != 4 {
		t.Errorf("response = %+v, want operation=sqrt result=4", got)
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		// Domain errors: well-formed request, invalid maths -> 422.
		{"division by zero", `{"operation":"divide","a":1,"b":0}`, 422, "division_by_zero"},
		{"zero to negative power", `{"operation":"power","a":0,"b":-1}`, 422, "division_by_zero"},
		{"sqrt of negative", `{"operation":"sqrt","a":-1}`, 422, "negative_square_root"},
		{"non-real power", `{"operation":"power","a":-8,"b":0.5}`, 422, "not_a_real_number"},
		{"overflow", `{"operation":"multiply","a":1e308,"b":10}`, 422, "out_of_range"},

		// Malformed requests -> 400.
		{"unknown operation", `{"operation":"modulo","a":1,"b":2}`, 400, "unknown_operation"},
		{"missing operation", `{"a":1,"b":2}`, 400, "unknown_operation"},
		{"missing a", `{"operation":"add","b":2}`, 400, "missing_operand"},
		{"missing b", `{"operation":"add","a":1}`, 400, "missing_operand"},
		{"b given to unary operation", `{"operation":"sqrt","a":4,"b":1}`, 400, "unexpected_operand"},
		{"null operand counts as missing", `{"operation":"add","a":null,"b":1}`, 400, "missing_operand"},
		{"empty body", ``, 400, "invalid_json"},
		{"malformed JSON", `{"operation":`, 400, "invalid_json"},
		{"not an object", `[1,2]`, 400, "invalid_json"},
		{"operand as string", `{"operation":"add","a":"1","b":2}`, 400, "invalid_json"},
		{"operand out of float64 range", `{"operation":"add","a":1e999,"b":2}`, 400, "invalid_json"},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, 400, "invalid_json"},
		{"trailing data", `{"operation":"add","a":1,"b":2} {"x":1}`, 400, "invalid_json"},

		{"body too large", `{"operation":"` + strings.Repeat("a", 5000) + `"}`, 413, "request_too_large"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/calculate", tt.body)
			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d; body: %s", rec.Code, tt.wantStatus, rec.Body.String())
			}
			got := decode[ErrorResponse](t, rec)
			if got.Error.Code != tt.wantCode {
				t.Errorf("error code = %q, want %q", got.Error.Code, tt.wantCode)
			}
			if got.Error.Message == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestCalculateWrongMethod(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/v1/calculate", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != http.MethodPost {
		t.Errorf("Allow = %q, want POST", allow)
	}
	if got := decode[ErrorResponse](t, rec); got.Error.Code != "method_not_allowed" {
		t.Errorf("error code = %q, want method_not_allowed", got.Error.Code)
	}
}

func TestUnknownAPIPathReturnsJSON404(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/v1/nope", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if got := decode[ErrorResponse](t, rec); got.Error.Code != "not_found" {
		t.Errorf("error code = %q, want not_found", got.Error.Code)
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/healthz", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := decode[map[string]string](t, rec); got["status"] != "ok" {
		t.Errorf("body = %v, want status ok", got)
	}
}

func TestWriteCalcErrorHidesUnmappedErrors(t *testing.T) {
	rec := httptest.NewRecorder()
	writeCalcError(rec, http.ErrAbortHandler) // any error the table doesn't know
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	got := decode[ErrorResponse](t, rec)
	if got.Error.Code != "internal_error" || strings.Contains(got.Error.Message, "abort") {
		t.Errorf("response = %+v, want generic internal_error", got)
	}
}
