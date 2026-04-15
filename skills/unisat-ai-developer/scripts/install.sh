#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd -P)"
SKILL_NAME="unisat-ai-developer"
SKILL_DIR="$ROOT_DIR/skills/$SKILL_NAME"
CC_SWITCH_SKILLS_DIR="$HOME/.cc-switch/skills"
CODEX_SKILLS_DIR="$HOME/.codex/skills"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
LOCAL_BIN_DIR="$HOME/.local/bin"

ensure_dir() {
  mkdir -p "$1"
}

install_link() {
  local link_path="$1"
  local target_path="$2"
  ln -sfn "$target_path" "$link_path"
  echo "link $link_path -> $target_path"
}

write_wrapper() {
  local file_path="$1"
  local target_script="$2"

  cat >"$file_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export UNISAT_DEV_DOCS_DIR="\${UNISAT_DEV_DOCS_DIR:-$ROOT_DIR/../unisat-dev-docs}"
export OPENAPI_SWAGGER_DIR="\${OPENAPI_SWAGGER_DIR:-$ROOT_DIR/../openapi-swagger}"
cd "$ROOT_DIR"
exec node "$target_script" "\$@"
EOF
  chmod +x "$file_path"
  echo "write $file_path"
}

ensure_dir "$CC_SWITCH_SKILLS_DIR"
ensure_dir "$CODEX_SKILLS_DIR"
ensure_dir "$CLAUDE_SKILLS_DIR"
ensure_dir "$LOCAL_BIN_DIR"

install_link "$CC_SWITCH_SKILLS_DIR/$SKILL_NAME" "$SKILL_DIR"
install_link "$CODEX_SKILLS_DIR/$SKILL_NAME" "$CC_SWITCH_SKILLS_DIR/$SKILL_NAME"
install_link "$CLAUDE_SKILLS_DIR/$SKILL_NAME" "$SKILL_DIR"

write_wrapper "$LOCAL_BIN_DIR/unisat-ai-cli" "$ROOT_DIR/packages/cli/bin/unisat-ai.js"
write_wrapper "$LOCAL_BIN_DIR/unisat-ai-mcp-server" "$ROOT_DIR/packages/mcp-server/bin/server.js"

echo
echo "installed skill: $SKILL_NAME"
echo "installed commands:"
echo "- $LOCAL_BIN_DIR/unisat-ai-cli"
echo "- $LOCAL_BIN_DIR/unisat-ai-mcp-server"
echo
echo "next steps:"
echo "1. Ensure $LOCAL_BIN_DIR is in PATH"
echo "2. Run: bash \"$SKILL_DIR/scripts/doctor.sh\""
echo "3. MCP config snippet:"
echo
cat <<EOF
{
  "mcpServers": {
    "unisat-ai": {
      "command": "unisat-ai-mcp-server"
    }
  }
}
EOF
