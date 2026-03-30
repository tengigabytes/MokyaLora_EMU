#!/usr/bin/env bash
# build_wasm.sh — Build mie_core.wasm from firmware MIE sources
#
# Usage:
#   ./build_wasm.sh [--debug]
#
# Requirements:
#   - emsdk installed: ~/emsdk  (or set EMSDK env var)
#   - git submodule MokyaLora initialised
#
# Output: mokya-twin/wasm/mie_core.wasm

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
EMSDK_DIR="${EMSDK:-$HOME/emsdk}"
FIRMWARE_BRANCH="origin/claude/new-dev-branch-Sblzm"
SUBMODULE_DIR="$REPO_ROOT/MokyaLora"
MIE_SRC="$REPO_ROOT/MokyaLora/firmware/mie"
BUILD_DIR="$REPO_ROOT/build/wasm"
BUILD_TYPE="Release"

# ── Parse args ────────────────────────────────────────────────────────────────
if [[ "$1" == "--debug" ]]; then
  BUILD_TYPE="Debug"
  BUILD_DIR="$REPO_ROOT/build/wasm-debug"
fi

# ── Activate emsdk ────────────────────────────────────────────────────────────
if [[ -z "$EMCC" ]] && ! command -v emcc &>/dev/null; then
  if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
    echo "ERROR: emsdk not found at $EMSDK_DIR"
    echo "  Install: git clone https://github.com/emscripten-core/emsdk ~/emsdk"
    echo "           cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$EMSDK_DIR/emsdk_env.sh" --quiet 2>/dev/null || true
fi

echo "[build_wasm] emcc: $(emcc --version | head -1)"

# ── Ensure submodule is initialised ──────────────────────────────────────────
cd "$REPO_ROOT"
if [[ ! -f "$SUBMODULE_DIR/.git" ]] && [[ ! -d "$SUBMODULE_DIR/.git" ]]; then
  echo "[build_wasm] Initialising MokyaLora submodule..."
  git submodule update --init MokyaLora
fi

# ── Check out firmware claude branch sources in submodule ────────────────────
cd "$SUBMODULE_DIR"
git fetch origin --quiet

# Verify the required source files exist on the claude branch
REQUIRED="firmware/mie/src/mie_c_api.cpp"
if ! git show "$FIRMWARE_BRANCH:$REQUIRED" &>/dev/null; then
  echo "ERROR: $REQUIRED not found on $FIRMWARE_BRANCH"
  exit 1
fi

# Use a worktree so we don't disturb the pinned submodule HEAD
WORKTREE_DIR="$REPO_ROOT/build/mie-src"
rm -rf "$WORKTREE_DIR"
git worktree add --detach "$WORKTREE_DIR" "$FIRMWARE_BRANCH" --quiet
MIE_SRC="$WORKTREE_DIR/firmware/mie"
echo "[build_wasm] MIE sources: $MIE_SRC"

# ── Configure ─────────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
rm -rf "$BUILD_DIR"
emcmake cmake \
  -S mokya-twin/wasm-build \
  -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
  -DMIE_SRC="$MIE_SRC"

# ── Build ─────────────────────────────────────────────────────────────────────
cmake --build "$BUILD_DIR" --parallel

# ── Cleanup worktree ──────────────────────────────────────────────────────────
cd "$SUBMODULE_DIR"
git worktree remove "$WORKTREE_DIR" --force
cd "$REPO_ROOT"

# ── Report ────────────────────────────────────────────────────────────────────
WASM_OUT="$REPO_ROOT/mokya-twin/wasm/mie_core.wasm"
if [[ -f "$WASM_OUT" ]]; then
  SIZE=$(du -sh "$WASM_OUT" | cut -f1)
  echo "[build_wasm] ✓ Done: $WASM_OUT ($SIZE)"
else
  echo "[build_wasm] ERROR: expected output not found: $WASM_OUT"
  exit 1
fi
