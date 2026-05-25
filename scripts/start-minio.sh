#!/bin/bash
set -e

CONTAINER_NAME=minio

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon is not running. Please start Docker Desktop first."
  open -a Docker 2>/dev/null && echo "Attempting to launch Docker Desktop..." || true
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "MinIO container already exists, starting..."
  docker start $CONTAINER_NAME
else
  echo "Creating MinIO container..."
  docker run -d \
    --name $CONTAINER_NAME \
    -p 9000:9000 \
    -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    -v ~/minio-data:/data \
    minio/minio server /data --console-address ":9001"
fi

echo "MinIO running — API: http://localhost:9000  Console: http://localhost:9001"
