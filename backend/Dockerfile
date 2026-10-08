# --- Build: static binary, standard library only -------------------------------
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# --- Run: tiny non-root image with no shell -----------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
ENV PORT=8080
EXPOSE 8080

# No curl in distroless, so the binary probes itself.
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 CMD ["/server", "-healthcheck"]
ENTRYPOINT ["/server"]
