#!/usr/bin/env bash
set -euo pipefail

# ── DeepSeek CLI Uninstaller ───────────────────────────────────────────────
INSTALL_DIR="$HOME/.deepseek-cli-app"
BIN_DIR="$HOME/.local/bin"
BIN_NAME="deepseek"
CONFIG_DIR="$HOME/.deepseek-cli"

RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}!${RESET} $*"; }

echo -e "${BOLD}DeepSeek CLI — Uninstaller${RESET}"
echo ""

# ── Confirm ────────────────────────────────────────────────────────────────
read -r -p "$(echo -e "${YELLOW}Удалить DeepSeek CLI? [y/N]:${RESET} ")" confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Отмена."
  exit 0
fi

# ── Remove binary ──────────────────────────────────────────────────────────
if [ -f "$BIN_DIR/$BIN_NAME" ]; then
  rm -f "$BIN_DIR/$BIN_NAME"
  ok "Удалён бинарник: $BIN_DIR/$BIN_NAME"
else
  warn "Бинарник не найден: $BIN_DIR/$BIN_NAME"
fi

# ── Remove app directory ───────────────────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  ok "Удалена директория: $INSTALL_DIR"
else
  warn "Директория не найдена: $INSTALL_DIR"
fi

# ── Config & sessions ──────────────────────────────────────────────────────
if [ -d "$CONFIG_DIR" ]; then
  read -r -p "$(echo -e "${YELLOW}Удалить конфиг и историю сессий ($CONFIG_DIR)? [y/N]:${RESET} ")" del_config
  if [[ "$del_config" =~ ^[Yy]$ ]]; then
    rm -rf "$CONFIG_DIR"
    ok "Удалена конфигурация: $CONFIG_DIR"
  else
    ok "Конфигурация сохранена: $CONFIG_DIR"
  fi
fi

# ── Clean up PATH lines in shell rc ───────────────────────────────────────
SHELL_NAME=$(basename "${SHELL:-bash}")
RC_FILE=""
case "$SHELL_NAME" in
  zsh)  RC_FILE="$HOME/.zshrc" ;;
  bash) RC_FILE="$HOME/.bashrc" ;;
esac

if [ -n "$RC_FILE" ] && [ -f "$RC_FILE" ] && grep -q "DeepSeek CLI" "$RC_FILE"; then
  # Remove the two lines added by install.sh
  sed -i'' '/# DeepSeek CLI/d' "$RC_FILE" 2>/dev/null || true
  ok "Убрал запись PATH из $RC_FILE"
fi

echo ""
echo -e "${GREEN}${BOLD}✓ DeepSeek CLI удалён.${RESET}"
echo ""
