{
  description = "Vem — a canvas-native Vim editor powered by VectoJS, running natively via Tauri";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        version = (builtins.fromJSON (builtins.readFile ./src-tauri/tauri.conf.json)).version;

        # Frontend build output published as a release asset (vem-dist.tar.gz) by
        # .github/workflows/release.yml, so packaging doesn't need network access
        # inside the Nix build sandbox to run `bun install`. Update `distHash`
        # after every release: `nix store prefetch-file --hash-type sha256 <url>`.
        frontendDist = pkgs.fetchurl {
          url = "https://github.com/vemjs/vem-desktop/releases/download/v${version}/vem-dist.tar.gz";
          hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        };

        runtimeDeps = with pkgs; [
          webkitgtk_4_1
          gtk3
          libayatana-appindicator
          librsvg
          openssl
        ];
      in
      {
        packages.default = pkgs.rustPlatform.buildRustPackage {
          pname = "vem";
          inherit version;
          src = ./.;

          cargoLock.lockFile = ./src-tauri/Cargo.lock;
          cargoRoot = "src-tauri";
          buildAndTestSubdir = "src-tauri";

          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook3
            cargo-tauri
          ];
          buildInputs = runtimeDeps;

          preBuild = ''
            mkdir -p dist
            tar -xzf ${frontendDist} -C dist
          '';

          postInstall = ''
            install -Dm755 target/*/release/vem $out/bin/vem
          '';

          meta = with pkgs.lib; {
            description = "A next-generation Vim editor powered by VectoJS, running natively via Tauri";
            homepage = "https://vem.run";
            license = licenses.mit;
            mainProgram = "vem";
            platforms = platforms.linux;
          };
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            rustc
            cargo
            cargo-tauri
            pkg-config
            nodejs
          ] ++ runtimeDeps;

          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath runtimeDeps;
        };
      }
    );
}
