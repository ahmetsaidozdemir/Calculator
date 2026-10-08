package calc

import (
	"errors"
	"math"
	"testing"
)

func ptr(v float64) *float64 { return &v }

func TestEvaluate(t *testing.T) {
	tests := []struct {
		name string
		op   string
		a, b *float64
		want float64
	}{
		{"add", "add", ptr(1), ptr(2), 3},
		{"add negatives", "add", ptr(-1.5), ptr(-2.5), -4},
		{"subtract", "subtract", ptr(5), ptr(8), -3},
		{"multiply", "multiply", ptr(6), ptr(7), 42},
		{"multiply by zero", "multiply", ptr(5), ptr(0), 0},
		{"divide", "divide", ptr(1), ptr(4), 0.25},
		{"divide zero numerator", "divide", ptr(0), ptr(5), 0},
		{"power", "power", ptr(2), ptr(10), 1024},
		{"power negative exponent", "power", ptr(2), ptr(-2), 0.25},
		{"power fractional exponent", "power", ptr(9), ptr(0.5), 3},
		{"power of negative base, integer exponent", "power", ptr(-2), ptr(3), -8},
		{"zero to the zero", "power", ptr(0), ptr(0), 1},
		{"sqrt", "sqrt", ptr(9), nil, 3},
		{"sqrt zero", "sqrt", ptr(0), nil, 0},
		{"percent", "percent", ptr(15), ptr(200), 30},
		{"percent over 100", "percent", ptr(150), ptr(80), 120},

		// Floating-point noise is rounded away.
		{"0.1 + 0.2", "add", ptr(0.1), ptr(0.2), 0.3},
		{"1.1 * 1.1", "multiply", ptr(1.1), ptr(1.1), 1.21},
		{"4.35 * 100", "multiply", ptr(4.35), ptr(100), 435},
		{"1/3 * 3 survives a round trip", "multiply", ptr(1.0 / 3.0), ptr(3), 1},
		// Large integers stay exact below 1e15.
		{"large integer addition", "add", ptr(123456789012345), ptr(1), 123456789012346},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Evaluate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Evaluate() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("Evaluate() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestEvaluateErrors(t *testing.T) {
	tests := []struct {
		name    string
		op      string
		a, b    *float64
		wantErr error
	}{
		{"divide by zero", "divide", ptr(1), ptr(0), ErrDivisionByZero},
		{"divide zero by zero", "divide", ptr(0), ptr(0), ErrDivisionByZero},
		{"zero to a negative power", "power", ptr(0), ptr(-1), ErrDivisionByZero},
		{"sqrt of negative", "sqrt", ptr(-4), nil, ErrNegativeSqrt},
		{"even root of negative via power", "power", ptr(-8), ptr(0.5), ErrNotReal},
		{"multiply overflow", "multiply", ptr(math.MaxFloat64), ptr(10), ErrOutOfRange},
		{"add overflow", "add", ptr(math.MaxFloat64), ptr(math.MaxFloat64), ErrOutOfRange},
		{"power overflow", "power", ptr(10), ptr(400), ErrOutOfRange},
		{"unknown operation", "modulo", ptr(1), ptr(2), ErrUnknownOperation},
		{"empty operation", "", ptr(1), ptr(2), ErrUnknownOperation},
		{"missing a", "add", nil, ptr(2), ErrMissingOperand},
		{"missing b for binary operation", "add", ptr(1), nil, ErrMissingOperand},
		{"missing a for unary operation", "sqrt", nil, nil, ErrMissingOperand},
		{"b given to unary operation", "sqrt", ptr(4), ptr(1), ErrUnexpectedOperand},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Evaluate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("Evaluate() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestEvaluateNeverReturnsNegativeZero(t *testing.T) {
	got, err := Evaluate("multiply", ptr(0), ptr(-1))
	if err != nil {
		t.Fatal(err)
	}
	if got != 0 || math.Signbit(got) {
		t.Errorf("Evaluate() = %v (signbit=%v), want +0", got, math.Signbit(got))
	}
}

func TestEvaluateErrorMessagesNameTheProblem(t *testing.T) {
	_, err := Evaluate("modulo", ptr(1), ptr(2))
	if got, want := err.Error(), `unknown operation: "modulo"`; got != want {
		t.Errorf("error message = %q, want %q", got, want)
	}
}
