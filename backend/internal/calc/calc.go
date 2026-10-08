// Package calc implements the calculator's arithmetic.
//
// It is deliberately free of I/O and HTTP concerns
// Every rule (operand counts, edge cases, rounding) can be unit-tested directly
package calc

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

// Significant decimal digits for rounding error correction.
const significantDigits = 15

// Possible Errors.
// Match them with errors.Is
var (
	ErrUnknownOperation  = errors.New("unknown operation")
	ErrMissingOperand    = errors.New("missing operand")
	ErrUnexpectedOperand = errors.New("unexpected operand")
	ErrDivisionByZero    = errors.New("cannot divide by zero")
	ErrNegativeSqrt      = errors.New("cannot take the square root of a negative number")
	ErrNotReal           = errors.New("result is not a real number")
	ErrOutOfRange        = errors.New("result is too large to represent")
)

type operation struct {
	arity int // number of operands: may be 1 or 2
	apply func(a, b float64) (float64, error)
}

// Supported operations.
var operations = map[string]operation{
	"add":      {arity: 2, apply: func(a, b float64) (float64, error) { return a + b, nil }},
	"subtract": {arity: 2, apply: func(a, b float64) (float64, error) { return a - b, nil }},
	"multiply": {arity: 2, apply: func(a, b float64) (float64, error) { return a * b, nil }},
	"divide":   {arity: 2, apply: divide},
	"power":    {arity: 2, apply: power},
	"sqrt":     {arity: 1, apply: sqrt},
	"percent":  {arity: 2, apply: func(a, b float64) (float64, error) { return a / 100 * b, nil }},
}

// Evaluate applies the named operation.
// Binary operations need both a and b;
// Unary operations (sqrt) need a and reject b.
// Pointers distinguish "absent" from a legitimate zero.
func Evaluate(name string, a, b *float64) (float64, error) {
	op, ok := operations[name]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, name)
	}
	if a == nil {
		return 0, fmt.Errorf("%w: a is required", ErrMissingOperand)
	}

	var first, second float64

	first = *a

	switch {
	case op.arity == 2 && b == nil:
		return 0, fmt.Errorf("%w: b is required for %s", ErrMissingOperand, name)
	case op.arity == 1 && b != nil:
		return 0, fmt.Errorf("%w: b is not allowed for %s", ErrUnexpectedOperand, name)
	case b != nil:
		second = *b
	}

	result, err := op.apply(first, second)
	if err != nil {
		return 0, err
	}
	return normalize(result)
}

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return a / b, nil
}

func power(a, b float64) (float64, error) {
	if a == 0 && b < 0 {
		return 0, ErrDivisionByZero // 0^-n is 1/0^n
	}
	return math.Pow(a, b), nil
}

func sqrt(a, _ float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return math.Sqrt(a), nil
}

// Normalize
// Rejects results JSON cannot represent (NaN, ±Inf)
// Folds -0 into 0
// Rounds away floating-point noise.
func normalize(x float64) (float64, error) {
	switch {
	case math.IsNaN(x):
		return 0, ErrNotReal
	case math.IsInf(x, 0):
		return 0, ErrOutOfRange
	case x == 0:
		return 0, nil
	}
	rounded, err := strconv.ParseFloat(strconv.FormatFloat(x, 'g', significantDigits, 64), 64)
	if err != nil {
		return 0, ErrOutOfRange
	}
	return rounded, nil
}
