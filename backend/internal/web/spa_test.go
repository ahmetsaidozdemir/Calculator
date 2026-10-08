package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newSPA(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	write := func(name, content string) {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", "<h1>app</h1>")
	write("assets/app.js", "console.log('hi')")
	return SPA(dir)
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestSPAServesExistingFiles(t *testing.T) {
	rec := get(newSPA(t), "/assets/app.js")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "console.log") {
		t.Errorf("got %d %q, want the JS file", rec.Code, rec.Body.String())
	}
}

func TestSPAServesIndexAtRoot(t *testing.T) {
	rec := get(newSPA(t), "/")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<h1>app</h1>") {
		t.Errorf("got %d %q, want index.html", rec.Code, rec.Body.String())
	}
}

func TestSPAFallsBackToIndexForUnknownRoutes(t *testing.T) {
	for _, p := range []string{"/history", "/a/b/c", "/assets"} {
		rec := get(newSPA(t), p)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<h1>app</h1>") {
			t.Errorf("GET %s = %d %q, want index.html fallback", p, rec.Code, rec.Body.String())
		}
	}
}

func TestSPADoesNotEscapeTheStaticDirectory(t *testing.T) {
	rec := get(newSPA(t), "/../../etc/passwd")
	if strings.Contains(rec.Body.String(), "root:") {
		t.Error("path traversal leaked a file outside the static directory")
	}
}
