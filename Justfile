default:
    @just --list

verify:
    @echo "=== Running quality gates ==="
    @bun test src
    @cd src-tauri && cargo test
    @cd src-tauri && cargo clippy --all-targets -- -D warnings
    @cd src-tauri && cargo fmt --check
    @bun run lint
    @bun run format:check

build:
    @echo "=== Building release bundle ==="
    @bun run tauri build

# Installs the release `vem` binary to ~/.local/bin so it's a bare `vem` on
# PATH — `cargo build --release` alone only produces
# src-tauri/target/release/vem, it doesn't put it anywhere a shell finds it.
install: build
    @mkdir -p ~/.local/bin
    @cp src-tauri/target/release/vem ~/.local/bin/vem
    @echo "Installed vem to ~/.local/bin/vem — make sure that's on your PATH."
