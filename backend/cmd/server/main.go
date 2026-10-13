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
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/cors"

	"calculator/internal/api"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := realMain(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop() // os.Exit skips deferred calls, so release the signal handler explicitly
	os.Exit(code)
}

// realMain is main with its inputs passed in so tests can drive it.
// It returns the process exit code instead of calling os.Exit.
func realMain(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.SetOutput(stderr)
	healthcheck := fs.Bool("healthcheck", false, "probe the local server's /healthz and exit")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}

	port := getEnv("PORT", "8080")

	if *healthcheck {
		if err := probe("http://127.0.0.1:" + port); err != nil {
			fmt.Fprintln(stderr, "unhealthy:", err)
			return 1
		}
		return 0
	}

	logger := slog.New(slog.NewTextHandler(stdout, nil))
	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		logger.Error("server failed", "error", err)
		return 1
	}
	if err := run(ctx, logger, ln); err != nil {
		logger.Error("server failed", "error", err)
		return 1
	}
	return 0
}

// run serves the API on ln until ctx is cancelled, then shuts down gracefully.
// A nil return means a clean shutdown.
func run(ctx context.Context, logger *slog.Logger, ln net.Listener) error {
	srv := newServer(api.Logging(newRouter(), logger))

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", ln.Addr().String())
		errCh <- srv.Serve(ln)
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

// newServer wraps h in an http.Server with timeouts on every phase of a request.
func newServer(h http.Handler) *http.Server {
	return &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// newRouter mounts the API routes and wraps them in CORS handling.
// Unknown /api/ paths stay with the API so they return JSON 404s.
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
