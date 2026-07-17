import "./style.css";
import { Scene } from "@vectojs/core";
import {
  WorkspaceExplorer,
  CTRL_VIM_KEYS,
  PREVENT_CTRL_KEYS,
  fileIcon,
  type WorkspaceFsProvider,
} from "@vemjs/renderer-vecto";
import type { TreeNode } from "@vectojs/ui";
import type { PluginRegistry } from "@vemjs/plugin-api";
import { ConfigLoader, VemEditorState } from "@vemjs/core";
import { PluginPanel } from "./plugins/PluginPanel";
import {
  createOfficialPluginRegistry,
  activatePluginById,
} from "./plugins/officialPlugins";
import { HELP_TEXT, VEMRC_TEMPLATE } from "./help";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  readDir,
  readTextFile,
  writeTextFile,
  exists as fileExists,
} from "@tauri-apps/plugin-fs";

// Same editor as vem.run, running in a native window. The parts specific to
// this shell: XDG config/cache dirs, native file I/O (dialog + fs plugins
// instead of the browser's File System Access API, which WebKitGTK doesn't
// reliably support), and a small, honest subset of Vim's CLI flags.

interface VemDirs {
  config: string | null;
  cache: string | null;
  data: string | null;
}

interface StartupArgs {
  files: string[];
  line: number | null;
  ex_commands: string[];
  readonly: boolean;
  clean: boolean;
  vimrc_override: string | null;
}

const DESKTOP_PLUGIN_PANEL_WIDTH = 360;
const MIN_PLUGIN_PANEL_WIDTH = 320;
const PLUGIN_PANEL_BREAKPOINT = 1160;

const canvas = document.getElementById("vem-canvas") as HTMLCanvasElement;

async function main() {
  if (!canvas) return;

  const dirs = await invoke<VemDirs>("get_vem_dirs");
  const startupArgs = await invoke<StartupArgs>("get_startup_args");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const scene = new Scene(canvas);

  const playgroundRegistries = new WeakMap<VemEditorState, PluginRegistry>();
  // The real file list once a directory is open (WorkspaceExplorer fills the
  // active state on open; this snapshot covers states created afterwards).
  let workspaceProjectFiles: string[] | null = null;
  const seedProjectFiles = (state: VemEditorState) => {
    if (state.projectFiles.length > 0) return;
    state.projectFiles = workspaceProjectFiles ?? [];
  };

  const ensureRegistry = (state: VemEditorState): PluginRegistry => {
    seedProjectFiles(state);
    let registry = playgroundRegistries.get(state);
    if (!registry) {
      registry = createOfficialPluginRegistry(state, {
        // Telescope's find-files: really open the file (native fs read).
        openFile: async (path: string) => {
          await openFile(path);
          scene.markDirty();
        },
        // Git signs: `git diff -U0` via the Rust backend — a rejection
        // (no repo, untracked, git missing) is caught by the plugin and
        // rendered as "no signs".
        gitDiff: (fileUri: string) =>
          invoke<string>("git_diff_unified", { path: fileUri }),
      });
      playgroundRegistries.set(state, registry);
    }
    return registry;
  };

  // Every state — the boot buffer, each `:vsp`/`:sp` pane, CLI-opened files,
  // Plugin Lab's scratch — gets its plugins at construction. Before this
  // hook, only the buffer active at boot had a registry, so new panes
  // silently lost autopairs, trim-on-save, git signs, and telescope
  // (2026-07-16 audit, bug 1).
  VemEditorState.onDidCreateState((state) => {
    ensureRegistry(state);
  });

  const playgroundView = new WorkspaceExplorer(
    window.innerWidth,
    window.innerHeight,
    "",
  );

  // Vim parity: `:q` on the last tab quits the application (the web build
  // keeps the splash instead — a browser tab can't exit itself).
  playgroundView.getWorkspace().onLastTabClose(() => {
    void getCurrentWindow().close();
  });

  const getActivePlaygroundState = () =>
    playgroundView.getActiveEditorState() as VemEditorState | null;
  const getPlaygroundRegistry = () => {
    const activeState = getActivePlaygroundState();
    return activeState ? ensureRegistry(activeState) : null;
  };
  getPlaygroundRegistry();

  // --- Native file I/O: absolute-path save tracking per buffer state. The
  // browser build resolves a real save target via the File System Access
  // API's own handle; here the handle is the path string we opened with.
  const savePaths = new Map<VemEditorState, string>();

  const wireSave = (state: VemEditorState, path: string) => {
    savePaths.set(state, path);
    state.onSave(async () => {
      const target = savePaths.get(state);
      if (!target) {
        state.statusMessage = "E32: No file name";
        return;
      }
      if (startupArgs.readonly) {
        // Matches Vim's E45: the guarantee readonly actually gives is "won't
        // silently overwrite your file" — vem's core has no per-keystroke
        // write-protection yet, so this is enforced at the save boundary.
        state.statusMessage =
          "E45: 'readonly' option is set (add ! to override)";
        return;
      }
      try {
        await writeTextFile(target, state.getBuffer().getText());
      } catch (err) {
        state.statusMessage = `E212: Can't open file for writing: ${String(err)}`;
      }
    });
  };

  const openFile = async (path: string): Promise<string | null> => {
    let text: string;
    try {
      text = await readTextFile(path);
    } catch (err) {
      const activeState = getActivePlaygroundState();
      if (activeState)
        activeState.statusMessage = `E484: Can't open file ${path}: ${String(err)}`;
      return null;
    }
    const label = path.split(/[/\\]/).pop() ?? path;
    // openFileBuffer (not raw openBuffer): a still-untouched untitled tab is
    // replaced in place, so `vem test.py` opens exactly one tab, like Vim.
    const bufferId = playgroundView.openFileBuffer(text, label);
    const state = getActivePlaygroundState();
    if (state) wireSave(state, path);
    return bufferId;
  };

  // --- Sidebar "Dir"/"File" buttons: WebKitGTK has no File System Access
  // API (the renderer's default provider), so back them with Tauri's native
  // dialog + fs plugins instead of leaving them silently dead.
  const guardReadonlySave = async (path: string, content: string) => {
    if (startupArgs.readonly) {
      throw new Error("E45: 'readonly' option is set (add ! to override)");
    }
    await writeTextFile(path, content);
  };

  const buildDirNodes = async (dirPath: string): Promise<TreeNode[]> => {
    const entries = await readDir(dirPath);
    const nodes: TreeNode[] = entries.map((entry) => {
      const full = `${dirPath}/${entry.name}`;
      if (entry.isDirectory) {
        return {
          id: full,
          label: entry.name,
          icon: "📁",
          iconColor: "#e2b64a",
          children: async () => buildDirNodes(full),
        } as unknown as TreeNode;
      }
      const fi = fileIcon(entry.name);
      return {
        id: full,
        label: entry.name,
        icon: fi.icon,
        iconColor: fi.color,
      };
    });
    // Directories first, then files, both alphabetical — matching the web
    // provider's ordering so the tree feels identical across builds.
    nodes.sort((a, b) => {
      const aIsDir = a.icon === "📁";
      const bIsDir = b.icon === "📁";
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.label.localeCompare(b.label);
    });
    return nodes;
  };

  const tauriFsProvider: WorkspaceFsProvider = {
    async pickDirectory() {
      const dir = await openDialog({ directory: true, multiple: false });
      if (typeof dir !== "string") return null;
      return {
        nodes: await buildDirNodes(dir),
        readFile: (id: string) => readTextFile(id),
        saveFile: (id: string, content: string) =>
          guardReadonlySave(id, content),
      };
    },
    async pickFile() {
      const picked = await openDialog({ multiple: false, directory: false });
      if (typeof picked !== "string") return null;
      const content = await readTextFile(picked);
      const name = picked.split(/[/\\]/).pop() ?? picked;
      return {
        name,
        content,
        save: (text: string) => guardReadonlySave(picked, text),
      };
    },
  };
  playgroundView.setFileSystemProvider(tauriFsProvider);

  // WorkspaceExplorer fills the active state's projectFiles before firing
  // this callback — snapshot the list for states created afterwards (new
  // splits/tabs seed from it, so telescope's find-files works everywhere).
  playgroundView.onDidOpenDirectory(() => {
    workspaceProjectFiles = getActivePlaygroundState()?.projectFiles ?? null;
  });

  // `:e` (no arg) opens the native picker; `:e <path>` opens it directly —
  // matching Vim's :edit, backed by real dialog + fs instead of the File
  // System Access API the web build uses.
  const editCommand = async (arg: string) => {
    const path = arg.trim();
    if (path) {
      await openFile(path);
      scene.markDirty();
      return;
    }
    const picked = await openDialog({ multiple: false, directory: false });
    if (typeof picked === "string") {
      await openFile(picked);
      scene.markDirty();
    }
  };
  VemEditorState.registerGlobalExCommand("e", editCommand);
  VemEditorState.registerGlobalExCommand("edit", editCommand);

  // --- Ex commands (global, Vim semantics: every pane/tab state sees them)
  const openSplitWithText = (text: string) => {
    const layout = playgroundView.getWorkspace().getActiveLayout();
    if (!layout) return;
    layout.splitActivePane("horizontal", text);
    scene.markDirty();
  };
  VemEditorState.registerGlobalExCommand("help", () =>
    openSplitWithText(HELP_TEXT),
  );
  VemEditorState.registerGlobalExCommand("h", () =>
    openSplitWithText(HELP_TEXT),
  );
  VemEditorState.registerGlobalExCommand("docs", () =>
    openSplitWithText(HELP_TEXT),
  );
  VemEditorState.registerGlobalExCommand("config", () =>
    openSplitWithText(VEMRC_TEMPLATE),
  );

  let pluginPanelUserHidden = true;
  const toggleFileTree = () => {
    playgroundView.toggleSidebar();
    scene.markDirty();
  };
  const togglePluginLab = () => {
    pluginPanelUserHidden = !pluginPanelUserHidden;
    layoutEditor(window.innerWidth, window.innerHeight);
    scene.markDirty();
  };
  VemEditorState.registerGlobalExCommand("Explorer", toggleFileTree);
  VemEditorState.registerGlobalExCommand("tree", toggleFileTree);
  VemEditorState.registerGlobalExCommand("NERDTree", toggleFileTree);
  VemEditorState.registerGlobalExCommand("PluginLab", togglePluginLab);
  VemEditorState.registerGlobalExCommand("plugins", togglePluginLab);

  const activate = (id: string) => () => {
    const registry = getPlaygroundRegistry();
    if (registry) activatePluginById(registry, id);
    scene.markDirty();
  };
  VemEditorState.registerGlobalExCommand("Lualine", activate("lualine"));
  VemEditorState.registerGlobalExCommand("Treesitter", activate("treesitter"));
  VemEditorState.registerGlobalExCommand("syntax", activate("treesitter"));

  const pluginPanel = new PluginPanel(
    DESKTOP_PLUGIN_PANEL_WIDTH,
    window.innerHeight,
    getActivePlaygroundState,
    getPlaygroundRegistry,
  );

  const layoutEditor = (w: number, h: number) => {
    const panelWidth =
      w >= PLUGIN_PANEL_BREAKPOINT && !pluginPanelUserHidden
        ? Math.max(
            MIN_PLUGIN_PANEL_WIDTH,
            Math.min(DESKTOP_PLUGIN_PANEL_WIDTH, w * 0.24),
          )
        : 0;

    playgroundView.setPosition(0, 0);
    playgroundView.width = w - panelWidth;
    playgroundView.height = h;

    pluginPanel.setPosition(w - panelWidth, 0);
    pluginPanel.resize(panelWidth, h);

    if (panelWidth > 0 && !pluginPanel.parent) {
      scene.add(pluginPanel);
    } else if (panelWidth === 0 && pluginPanel.parent) {
      scene.remove(pluginPanel);
    }
  };

  playgroundView.setSidebarVisible(false);
  scene.add(playgroundView);
  layoutEditor(window.innerWidth, window.innerHeight);
  scene.start();

  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  // Vim mouse=a owns the right button (it extends/starts a selection); the
  // native WebKitGTK menu popping over the editor is never wanted. Bind on
  // window so the a11y projection overlay (which sits above the canvas and
  // receives the raw event) is covered too. (Ported from vem-website.)
  window.addEventListener("contextmenu", (e) => {
    if (
      e.target === canvas ||
      (e.target instanceof HTMLElement &&
        canvas.parentElement?.contains(e.target))
    ) {
      e.preventDefault();
    }
  });

  const engineOwnsKeys = (e: KeyboardEvent): boolean => {
    const t = e.target;
    return t instanceof HTMLElement && t !== canvas && t !== document.body;
  };

  const PREVENT_PLAIN = new Set([
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Tab",
    "Backspace",
    "/",
  ]);

  window.addEventListener("keydown", (e) => {
    if (engineOwnsKeys(e)) return;
    if (e.isComposing || e.key === "Process") return;

    const ctrl = e.ctrlKey || e.metaKey;
    let mappedKey = e.key;

    if (ctrl && !e.altKey) {
      const vimKey = CTRL_VIM_KEYS[e.key.toLowerCase()];
      if (vimKey) {
        mappedKey = vimKey;
        e.preventDefault();
      } else if (PREVENT_CTRL_KEYS.has(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      } else {
        return;
      }
    } else if (PREVENT_PLAIN.has(e.key)) {
      e.preventDefault();
    }

    const activeLayout = playgroundView.getWorkspace().getActiveLayout();
    const activeState = activeLayout?.getActiveState();
    if (activeState) {
      activeState.handleKey(mappedKey);
      activeLayout?.refreshActivePane();
    }
  });

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    layoutEditor(w, h);
    scene.resize(w, h);
    scene.markDirty();
  };
  window.addEventListener("resize", handleResize);
  handleResize();

  // --- Global config: unlike the web build (which only loads a .vemrc from
  // an opened project folder), the desktop build auto-loads one from the
  // XDG config dir on every boot — real local persistence, not per-session.
  const runExCommand = (state: VemEditorState, cmd: string) => {
    state.handleKey(":");
    state.setCommandText(cmd);
    state.handleKey("Enter");
  };

  const loadVemrc = async () => {
    if (startupArgs.clean) return;
    const path =
      startupArgs.vimrc_override ??
      (dirs.config ? `${dirs.config}/vemrc.json` : null);
    if (!path) return;
    try {
      if (!(await fileExists(path))) return;
      const content = await readTextFile(path);
      const activeState = getActivePlaygroundState();
      const registry = getPlaygroundRegistry();
      if (!activeState || !registry) return;
      const loader = new ConfigLoader(activeState);
      if (path.endsWith(".json")) {
        await loader.loadConfigFromObject(JSON.parse(content), registry);
      } else {
        await loader.loadConfigFromJsString(content, registry);
      }
    } catch (err) {
      const activeState = getActivePlaygroundState();
      if (activeState)
        activeState.statusMessage = `E5108: Error loading vemrc: ${String(err)}`;
      console.error("Failed to load vemrc:", err);
    }
  };
  await loadVemrc();

  // --- Startup args: open any files passed on the command line, jump to
  // +<lnum> on the first one, then run each -c <cmd> in order.
  if (startupArgs.files.length > 0) {
    let firstBufferId: string | null = null;
    for (const path of startupArgs.files) {
      const id = await openFile(path);
      if (firstBufferId === null) firstBufferId = id;
    }
    if (startupArgs.line !== null && firstBufferId) {
      // openBuffer always activates the newest tab — re-select the first
      // file argument before jumping, matching Vim's +<lnum> semantics.
      playgroundView.getWorkspace().switchToBuffer(firstBufferId);
      const target = playgroundView
        .getWorkspace()
        .getActiveLayout()
        ?.getActiveState();
      target?.setCursor(Math.max(0, startupArgs.line - 1), 0);
    }
    for (const cmd of startupArgs.ex_commands) {
      const state = playgroundView
        .getWorkspace()
        .getActiveLayout()
        ?.getActiveState();
      if (state) runExCommand(state, cmd);
    }
    scene.markDirty();
  }

  if (new URLSearchParams(window.location.search).has("debug")) {
    import("@vectojs/devtools").then(
      ({ attachDevtools, auditScene, captureSnapshot }) => {
        attachDevtools(scene);
        (window as unknown as Record<string, unknown>).__vem = {
          scene,
          audit: () => auditScene(scene),
          snapshot: () => captureSnapshot(scene),
          getActiveEditorState: getActivePlaygroundState,
          getWorkspace: () => playgroundView.getWorkspace(),
          getRegistry: getPlaygroundRegistry,
          dirs,
          startupArgs,
        };
      },
    );
  }
}

main();
