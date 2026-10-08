package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func serve(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	return rec
}

func TestRouterWithFrontend(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>app</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	router := newRouter(dir)

	t.Run("API still works", func(t *testing.T) {
		rec := serve(router, http.MethodPost, "/api/v1/calculate", `{"operation":"add","a":1,"b":2}`)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"result":3`) {
			t.Errorf("got %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("health check", func(t *testing.T) {
		if rec := serve(router, http.MethodGet, "/healthz", ""); rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", rec.Code)
		}
	})
	t.Run("frontend served at root", func(t *testing.T) {
		rec := serve(router, http.MethodGet, "/", "")
		if !strings.Contains(rec.Body.String(), "<h1>app</h1>") {
			t.Errorf("body = %q, want index.html", rec.Body.String())
		}
	})
	t.Run("unknown API path is JSON 404, not index.html", func(t *testing.T) {
		rec := serve(router, http.MethodGet, "/api/v1/missing", "")
		if rec.Code != http.StatusNotFound || strings.Contains(rec.Body.String(), "<h1>") {
			t.Errorf("got %d %q, want JSON 404", rec.Code, rec.Body.String())
		}
	})
}

func TestRouterWithoutFrontend(t *testing.T) {
	router := newRouter("")
	if rec := serve(router, http.MethodGet, "/", ""); rec.Code != http.StatusNotFound {
		t.Errorf("GET / = %d, want 404 when no frontend is configured", rec.Code)
	}
	if rec := serve(router, http.MethodGet, "/healthz", ""); rec.Code != http.StatusOK {
		t.Errorf("GET /healthz = %d, want 200", rec.Code)
	}
}

func TestEnvOr(t *testing.T) {
	t.Setenv("CALC_TEST_VAR", "")
	if got := envOr("CALC_TEST_VAR", "fallback"); got != "fallback" {
		t.Errorf("empty var: got %q, want fallback", got)
	}
	t.Setenv("CALC_TEST_VAR", "set")
	if got := envOr("CALC_TEST_VAR", "fallback"); got != "set" {
		t.Errorf("set var: got %q, want set", got)
	}
}

func TestProbe(t *testing.T) {
	healthy := httptest.NewServer(newRouter(""))
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
