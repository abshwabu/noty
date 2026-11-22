# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /src

# Install build dependencies
RUN apk add --no-cache ca-certificates git

# Cache module downloads
COPY go.mod go.sum ./
RUN GOTOOLCHAIN=local go mod download

# Copy source code
COPY . .

# Build static binary without CGO
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static'" \
    -o /bin/noty-sync \
    ./cmd/noty-sync

# Final stage
FROM alpine:3.20

WORKDIR /app

# Install runtime certificates and tzdata
RUN apk add --no-cache ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /bin/noty-sync /usr/local/bin/noty-sync

# Setup default directories
ENV DATA_DIR=/data
ENV PORT=8080

RUN mkdir -p /data

EXPOSE 8080

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/noty-sync"]
CMD ["serve", "--port", "8080", "--data-dir", "/data"]
