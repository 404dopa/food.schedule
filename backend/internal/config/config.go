package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DBType      string // "sqlite" or "postgres"
	DatabaseURL string // Full connection URI (e.g. from Railway DATABASE_URL)
	DBHost      string
	DBPort      string
	DBUser      string
	DBPassword  string
	DBName      string
	DBSSLMode   string
	DBFile      string
	JWTSecret   string
	CorsOrigin  string
	Environment string
	UploadDir   string // Directory for uploaded images (mounted as persistent Volume)
	StaticDir   string // Directory for frontend SPA build (e.g. dist)
}

func LoadConfig() *Config {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_PUBLIC_URL")
	}

	dbType := os.Getenv("DB_TYPE")
	if dbType == "" {
		// Auto-detect PostgreSQL when DATABASE_URL or PGHOST is present (common in Railway/cloud)
		if databaseURL != "" || os.Getenv("PGHOST") != "" {
			dbType = "postgres"
		} else {
			dbType = "sqlite"
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbFile := os.Getenv("DB_FILE")
	if dbFile == "" {
		dbFile = "bayti_kitchen.db"
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "uploads"
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "dist"
	}

	sslMode := os.Getenv("DB_SSLMODE")
	if sslMode == "" {
		sslMode = "disable"
	}

	return &Config{
		Port:        port,
		DBType:      dbType,
		DatabaseURL: databaseURL,
		DBHost:      getEnvDefault("DB_HOST", getEnvDefault("PGHOST", "localhost")),
		DBPort:      getEnvDefault("DB_PORT", getEnvDefault("PGPORT", "5432")),
		DBUser:      getEnvDefault("DB_USER", getEnvDefault("PGUSER", "postgres")),
		DBPassword:  getEnvDefault("DB_PASSWORD", getEnvDefault("PGPASSWORD", "postgres")),
		DBName:      getEnvDefault("DB_NAME", getEnvDefault("PGDATABASE", "bayti_kitchen")),
		DBSSLMode:   sslMode,
		DBFile:      dbFile,
		JWTSecret:   getEnvDefault("JWT_SECRET", "bayti-kitchen-secret-key-2026"),
		CorsOrigin:  getEnvDefault("CORS_ORIGIN", "*"),
		Environment: getEnvDefault("APP_ENV", "development"),
		UploadDir:   uploadDir,
		StaticDir:   staticDir,
	}
}

func getEnvDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
