// Command server runs the calculator API
//
// Configuration (environment variables):
//
//	PORT to listen on (default 8080)
//
// With -healthcheck the binary instead probes its own /healthz and exits 0 or 1.
// Container images without a shell or curl use that for their health check.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/cors"

	"calculator/internal/api"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the local server's /healthz and exit")
	flag.Parse()

	if *healthcheck {
		if err := probe("http://127.0.0.1:" + getEnv("PORT", "8080")); err != nil {
			fmt.Fprintln(os.Stderr, "unhealthy:", err)
			os.Exit(1)
		}
		return
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              ":" + getEnv("PORT", "8080"),
		Handler:           api.Logging(newRouter(), logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

// newRouter mounts the API and, when staticDir is set, the single-page frontend.
// Unknown /api/ paths stay with the API so they return JSON 404s, never index.html.
func newRouter() http.Handler {
	apiHandler := api.NewHandler()
	mux := http.NewServeMux()
	mux.Handle("/api/", apiHandler)
	mux.Handle("/healthz", apiHandler)

	// Configure CORS
	c := cors.New(cors.Options{
		// AllowedOrigins: []string{"http://localhost:8080", "http://localhost:80", "http://localhost"},
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
	})

	return c.Handler(mux)
}

// probe reports whether the server at baseURL answers /healthz with 200 OK.
func probe(baseURL string) error {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(baseURL + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %s", resp.Status)
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
