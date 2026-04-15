#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd -P)"
LOCAL_BIN_DIR="$HOME/.local/bin"

export UNISAT_DEV_DOCS_DIR="${UNISAT_DEV_DOCS_DIR:-$ROOT_DIR/../unisat-dev-docs}"
export OPENAPI_SWAGGER_DIR="${OPENAPI_SWAGGER_DIR:-$ROOT_DIR/../openapi-swagger}"

echo "repo: $ROOT_DIR"
echo "unisat dev docs: $UNISAT_DEV_DOCS_DIR"
echo "openapi swagger: $OPENAPI_SWAGGER_DIR"
echo "cli launcher: $LOCAL_BIN_DIR/unisat-ai-cli"
echo "mcp launcher: $LOCAL_BIN_DIR/unisat-ai-mcp-server"

[ -x "$LOCAL_BIN_DIR/unisat-ai-cli" ] || { echo "missing cli launcher"; exit 1; }
[ -x "$LOCAL_BIN_DIR/unisat-ai-mcp-server" ] || { echo "missing mcp launcher"; exit 1; }

cd "$ROOT_DIR"
node scripts/doctor.mjs
node scripts/smoke.mjs
