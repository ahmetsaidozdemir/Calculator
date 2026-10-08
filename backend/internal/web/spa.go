// Package web serves the built single-page frontend.
package web

import (
	"net/http"
	"path"
	"path/filepath"
)

// SPA serves static files from dir and falls back to index.html for any path
// that is not an existing file, so client-side routes survive a page reload.
func SPA(dir string) http.Handler {
	fsys := http.Dir(dir)
	files := http.FileServer(fsys)
	index := filepath.Join(dir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// path.Clean on a rooted path removes any ".." so requests cannot escape dir.
		if f, err := fsys.Open(path.Clean("/" + r.URL.Path)); err == nil {
			info, statErr := f.Stat()
			_ = f.Close()
			if statErr == nil && !info.IsDir() {
				files.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, index)
	})
}
