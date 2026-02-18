#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="adelbot-dev"

echo "Building AdelBot dev environment images..."

echo "Building universal image..."
docker build -t "${PREFIX}-universal:latest" -f "${SCRIPT_DIR}/Dockerfile.universal" "${SCRIPT_DIR}"

echo "Building Python image..."
docker build -t "${PREFIX}-python:latest" -f "${SCRIPT_DIR}/Dockerfile.python" "${SCRIPT_DIR}"

echo "Building Node.js image..."
docker build -t "${PREFIX}-node:latest" -f "${SCRIPT_DIR}/Dockerfile.node" "${SCRIPT_DIR}"

echo ""
echo "All images built successfully:"
docker images | grep "${PREFIX}"
