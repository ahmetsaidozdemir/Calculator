package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

func TestgetEnv(t *testing.T) {
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
	url := down.URL
	down.Close()
	if err := probe(url); err == nil {
		t.Error("probe(stopped server) = nil, want an error")
	}
}
