#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"

bash "$ROOT_DIR/skills/unisat-ai-developer/scripts/install.sh"
