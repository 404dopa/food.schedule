# Multi-stage Dockerfile for Bayti Kitchen (Frontend + Backend Unified)
# Optimized for Railway, Docker, or any cloud container platform

# ── Stage 1: Build Frontend (Vite + React) ───────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build Backend (Go) ──────────────────────────────────────────────
FROM golang:1.27-alpine AS backend-builder
WORKDIR /app/backend

RUN apk add --no-cache git ca-certificates tzdata

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/bayti-server ./cmd/server

# ── Stage 3: Minimal Production Image ────────────────────────────────────────
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata curl

# Copy backend binary
COPY --from=backend-builder /app/bayti-server /app/bayti-server

# Copy frontend built assets
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Create uploads directory (mount point for persistent Volume)
RUN mkdir -p /app/uploads

ENV PORT=8080
ENV APP_ENV=production
ENV UPLOAD_DIR=/app/uploads
ENV STATIC_DIR=/app/dist
ENV TZ=Asia/Baghdad

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["/app/bayti-server"]
