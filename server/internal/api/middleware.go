package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
	"github.com/noty/sync-server/internal/auth"
	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/models"
)

type contextKey string

const (
	UserContextKey   contextKey = "auth_user"
	DeviceContextKey contextKey = "auth_device"
)

// responseWriterInterceptor captures HTTP status code for logging
type responseWriterInterceptor struct {
	http.ResponseWriter
	statusCode int
	bytes      int64
}

func (w *responseWriterInterceptor) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseWriterInterceptor) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.bytes += int64(n)
	return n, err
}

// LoggingMiddleware logs request metadata with structured slog
func LoggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wi := &responseWriterInterceptor{ResponseWriter: w, statusCode: http.StatusOK}

			next.ServeHTTP(wi, r)

			latency := time.Since(start)
			logger.Info("http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", wi.statusCode,
				"bytes", wi.bytes,
				"latency_ms", latency.Milliseconds(),
				"remote_addr", r.RemoteAddr,
			)
		})
	}
}

// MaxBytesMiddleware restricts max incoming request payload size
func MaxBytesMiddleware(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// IPRateLimiter provides per-IP token bucket rate limiting
type IPRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	rate     rate.Limit
	burst    int
}

// NewIPRateLimiter creates an IP rate limiter
func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	limiter := &IPRateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rate:     r,
		burst:    b,
	}

	// Periodically cleanup inactive limiters
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			limiter.mu.Lock()
			limiter.limiters = make(map[string]*rate.Limiter)
			limiter.mu.Unlock()
		}
	}()

	return limiter
}

func (l *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	lim, exists := l.limiters[ip]
	if !exists {
		lim = rate.NewLimiter(l.rate, l.burst)
		l.limiters[ip] = lim
	}
	return lim
}

// RateLimitMiddleware enforces rate limiting per remote IP
func RateLimitMiddleware(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if colonIdx := strings.LastIndex(ip, ":"); colonIdx != -1 {
				ip = ip[:colonIdx]
			}

			if !limiter.GetLimiter(ip).Allow() {
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// AuthMiddleware validates the Bearer device token
func AuthMiddleware(database *db.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				http.Error(w, `{"error":"invalid authorization header format"}`, http.StatusUnauthorized)
				return
			}

			token := parts[1]
			tokenHash := auth.HashToken(token)

			dev, user, err := database.GetDeviceByTokenHash(tokenHash)
			if err != nil {
				if err == db.ErrDeviceRevoked {
					http.Error(w, `{"error":"device revoked"}`, http.StatusUnauthorized)
					return
				}
				http.Error(w, `{"error":"invalid or unknown device token"}`, http.StatusUnauthorized)
				return
			}

			// Update device last seen asynchronously
			go func(deviceID string) {
				_ = database.UpdateDeviceLastSeen(deviceID)
			}(dev.ID)

			ctx := context.WithValue(r.Context(), UserContextKey, user)
			ctx = context.WithValue(ctx, DeviceContextKey, dev)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserFromContext extracts the authenticated User
func GetUserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(UserContextKey).(*models.User)
	return u
}

// GetDeviceFromContext extracts the authenticated Device
func GetDeviceFromContext(ctx context.Context) *models.Device {
	d, _ := ctx.Value(DeviceContextKey).(*models.Device)
	return d
}
