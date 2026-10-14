package main

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func serve(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func TestRouter(t *testing.T) {
	router := newRouter()
	if rec := serve(router, http.MethodGet, "/", ""); rec.Code != http.StatusNotFound {
		t.Errorf("GET / = %d, want 404 when no frontend is configured", rec.Code)
	}
	if rec := serve(router, http.MethodGet, "/healthz", ""); rec.Code != http.StatusOK {
		t.Errorf("GET /healthz = %d, want 200", rec.Code)
	}
}

func TestGetEnv(t *testing.T) {
	t.Setenv("CALC_TEST_VAR", "")
	if got := getEnv("CALC_TEST_VAR", "fallback"); got != "fallback" {
		t.Errorf("empty var: got %q, want fallback", got)
	}
	t.Setenv("CALC_TEST_VAR", "set")
	if got := getEnv("CALC_TEST_VAR", "fallback"); got != "set" {
		t.Errorf("set var: got %q, want set", got)
	}
}

func TestProbe(t *testing.T) {
	healthy := httptest.NewServer(newRouter())
	defer healthy.Close()
	if err := probe(healthy.URL); err != nil {
		t.Errorf("probe(healthy server) = %v, want nil", err)
	}

	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer broken.Close()
	if err := probe(broken.URL); err == nil {
		t.Error("probe(server returning 500) = nil, want an error")
	}

	down := httptest.NewServer(http.NotFoundHandler())
	downURL := down.URL
	down.Close()
	if err := probe(downURL); err == nil {
		t.Error("probe(stopped server) = nil, want an error")
	}
}

// --- helpers for the tests below ---

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// portOf returns the port of a URL such as http://127.0.0.1:54321.
func portOf(t *testing.T, rawURL string) string {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse %q: %v", rawURL, err)
	}
	return u.Port()
}

// freePort returns a port that was free a moment ago.
func freePort(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	return portOf(t, "http://"+ln.Addr().String())
}

// waitHealthy polls baseURL/healthz until it answers 200 or five seconds pass.
func waitHealthy(t *testing.T, baseURL string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		err := probe(baseURL)
		if err == nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("server never became healthy: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// await receives from ch or fails the test after five seconds.
func await[T any](t *testing.T, ch <-chan T, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for %s", what)
		var zero T
		return zero
	}
}

// --- newServer ---

func TestNewServerSetsEveryTimeout(t *testing.T) {
	srv := newServer(http.NotFoundHandler())
	timeouts := map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	}
	for name, d := range timeouts {
		if d <= 0 {
			t.Errorf("%s = %v, want a positive timeout", name, d)
		}
	}
}

// --- run ---

func TestRunServesThenShutsDownOnCancel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- run(ctx, discardLogger(), ln) }()

	waitHealthy(t, "http://"+ln.Addr().String())

	cancel()
	if err := await(t, done, "run to return after cancel"); err != nil {
		t.Errorf("run after cancel = %v, want nil (clean shutdown)", err)
	}
}

func TestRunReturnsServeError(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	ln.Close() // Serve fails immediately on a closed listener.

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := run(ctx, discardLogger(), ln); err == nil {
		t.Error("run(closed listener) = nil, want an error")
	}
}

// --- runApplication ---

func TestRealMainServesUntilCancelled(t *testing.T) {
	port := freePort(t)
	t.Setenv("PORT", port)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan int, 1)
	go func() { done <- runApplication(ctx, nil, io.Discard, io.Discard) }()

	waitHealthy(t, "http://127.0.0.1:"+port)

	cancel()
	if code := await(t, done, "runApplication to return after cancel"); code != 0 {
		t.Errorf("exit code = %d, want 0", code)
	}
}

func TestRealMainPortInUse(t *testing.T) {
	busy, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer busy.Close()
	t.Setenv("PORT", portOf(t, "http://"+busy.Addr().String()))

	var stdout bytes.Buffer
	if code := runApplication(context.Background(), nil, &stdout, io.Discard); code != 1 {
		t.Errorf("exit code = %d, want 1 when the port is taken", code)
	}
	if !strings.Contains(stdout.String(), "server failed") {
		t.Errorf("log output = %q, want it to mention \"server failed\"", stdout.String())
	}
}

func TestRealMainHealthcheck(t *testing.T) {
	srv := httptest.NewServer(newRouter())
	t.Setenv("PORT", portOf(t, srv.URL))

	var stderr bytes.Buffer
	if code := runApplication(context.Background(), []string{"-healthcheck"}, io.Discard, &stderr); code != 0 {
		t.Errorf("healthy: exit code = %d, want 0; stderr: %s", code, stderr.String())
	}

	srv.Close()
	stderr.Reset()
	if code := runApplication(context.Background(), []string{"-healthcheck"}, io.Discard, &stderr); code != 1 {
		t.Errorf("server down: exit code = %d, want 1", code)
	}
	if !strings.Contains(stderr.String(), "unhealthy") {
		t.Errorf("stderr = %q, want it to mention \"unhealthy\"", stderr.String())
	}
}

func TestRealMainFlagHandling(t *testing.T) {
	var stderr bytes.Buffer
	if code := runApplication(context.Background(), []string{"-bogus"}, io.Discard, &stderr); code != 2 {
		t.Errorf("unknown flag: exit code = %d, want 2", code)
	}
	if stderr.Len() == 0 {
		t.Error("unknown flag: expected a message on stderr")
	}

	if code := runApplication(context.Background(), []string{"-h"}, io.Discard, io.Discard); code != 0 {
		t.Errorf("-h: exit code = %d, want 0", code)
	}
}
