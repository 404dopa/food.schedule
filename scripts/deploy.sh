#!/bin/bash
# ==============================================================================
# Bayti Kitchen - Production VPS Deployment Script
# ==============================================================================

set -e

echo "=========================================================="
echo " Starting Bayti Kitchen VPS Deployment"
echo "=========================================================="

# Check if docker and docker-compose are available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo "Notice: Please review and adjust database credentials in .env if needed."
fi

echo "Pulling base images and building containers..."
docker compose pull || true
docker compose build --no-cache

echo "Starting services in background..."
docker compose up -d

echo "Waiting for backend health check..."
TIMEOUT=60
COUNTER=0
until docker compose exec -T backend curl -sf http://localhost:8080/health > /dev/null; do
    sleep 2
    COUNTER=$((COUNTER + 2))
    if [ $COUNTER -ge $TIMEOUT ]; then
        echo "Error: Backend did not pass health check within $TIMEOUT seconds."
        docker compose logs backend
        exit 1
    fi
    echo -n "."
done

echo ""
echo "=========================================================="
echo " Bayti Kitchen deployed successfully!"
echo " Web Application running on: http://localhost (Port 80)"
echo " Backend REST API running on: http://localhost:8080"
echo "=========================================================="
