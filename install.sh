#!/usr/bin/env bash
set -euo pipefail

# ── DeepSeek CLI Installer ─────────────────────────────────────────────────
REPO="https://github.com/Br1zent/deepseek-cli"
INSTALL_DIR="$HOME/.deepseek-cli-app"
BIN_DIR="$HOME/.local/bin"
BIN_NAME="deepseek"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}!${RESET} $*"; }
err()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

echo -e "${CYAN}"
echo "  ██████╗ ███████╗███████╗██████╗ ███████╗███████╗███████╗██╗  ██╗"
echo "  ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██║ ██╔╝"
echo "  ██║  ██║█████╗  █████╗  ██████╔╝███████╗█████╗  █████╗  █████╔╝ "
echo "  ██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ╚════██║██╔══╝  ██╔══╝  ██╔═██╗ "
echo "  ██████╔╝███████╗███████╗██║     ███████║███████╗███████╗██║  ██╗ "
echo "  ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝"
echo -e "${RESET}"
echo -e "${BOLD}  DeepSeek CLI — Installer${RESET}  |  author: t.me/Br1zent"
echo ""

# ── Check dependencies ─────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || err "Node.js не найден. Установи с https://nodejs.org (нужна версия ≥ 20)"
command -v git  >/dev/null 2>&1 || err "git не найден. Установи git и повтори."

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Требуется Node.js ≥ 20. Текущая версия: $(node -v)"
fi
ok "Node.js $(node -v)"

# ── Package manager ────────────────────────────────────────────────────────
if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
else
  err "npm или pnpm не найден"
fi
ok "Пакетный менеджер: $PM"

# ── Clone or update ────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Обновляю существующую установку в $INSTALL_DIR ..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Клонирую репозиторий в $INSTALL_DIR ..."
  rm -rf "$INSTALL_DIR"
  git clone --depth=1 "$REPO" "$INSTALL_DIR"
fi
ok "Репозиторий готов"

# ── Install dependencies & build ───────────────────────────────────────────
info "Устанавливаю зависимости ..."
cd "$INSTALL_DIR"
if [ "$PM" = "pnpm" ]; then
  pnpm install --frozen-lockfile --silent
else
  npm ci --silent
fi
ok "Зависимости установлены"

info "Собираю проект ..."
$PM run build --silent
ok "Сборка завершена"

# ── Install binary ─────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"

# Create wrapper script (more robust than symlink for npm/node path issues)
cat > "$BIN_DIR/$BIN_NAME" <<EOF
#!/usr/bin/env bash
exec node "$INSTALL_DIR/dist/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/$BIN_NAME"
ok "Бинарник установлен: $BIN_DIR/$BIN_NAME"

# ── PATH check ─────────────────────────────────────────────────────────────
SHELL_NAME=$(basename "${SHELL:-bash}")
RC_FILE=""
case "$SHELL_NAME" in
  zsh)  RC_FILE="$HOME/.zshrc" ;;
  bash) RC_FILE="$HOME/.bashrc" ;;
  fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
esac

if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  warn "$BIN_DIR не найден в PATH"
  if [ -n "$RC_FILE" ]; then
    EXPORT_LINE='export PATH="$HOME/.local/bin:$PATH"'
    if [ "$SHELL_NAME" = "fish" ]; then
      EXPORT_LINE='fish_add_path $HOME/.local/bin'
    fi
    echo "" >> "$RC_FILE"
    echo "# DeepSeek CLI" >> "$RC_FILE"
    echo "$EXPORT_LINE" >> "$RC_FILE"
    ok "Добавил PATH в $RC_FILE"
    warn "Выполни: source $RC_FILE  (или перезапусти терминал)"
  else
    warn "Добавь вручную в свой shell rc: export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✓ Установка завершена!${RESET}"
echo ""
echo -e "  Запусти:  ${CYAN}deepseek${RESET}"
echo -e "  Или сразу настрой ключ:"
echo -e "  ${CYAN}deepseek config set api-key <ключ>${RESET}"
echo -e "  ${CYAN}deepseek config set groq-key <ключ>${RESET}  ${YELLOW}(для Groq)${RESET}"
echo ""
