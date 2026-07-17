import { Button, Text, UIComponent } from "@vectojs/ui";
import type { IRenderer } from "@vectojs/core";
import { VemEditorState } from "@vemjs/core";
import type { PluginRegistry } from "@vemjs/plugin-api";
import { officialPlugins } from "./officialPlugins";

// Fallback colors for the brief window before an editor state (and its
// theme) exists — matches @vemjs/core's DEFAULT_THEME so there's no flash of
// mismatched color before the first render() picks up the live theme.
const FALLBACK_BG = "#000000";
const FALLBACK_FG = "#d0d0d0";
const FALLBACK_MUTED = "#767676";
const FALLBACK_ACCENT = "#5f87d7";

// Vim's own monospace stack (matches VemEditorEntity's editorFont) — Plugin
// Lab is chrome around the editor, not a separate web-app-styled surface, so
// it reads as part of the same Vim-flavored UI rather than a bolted-on panel.
const PANEL_FONT =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Monaco, monospace';

export class PluginPanel extends UIComponent {
  private titleText: Text;
  private subtitleText: Text;
  private statusText: Text;
  private demoButtons: Button[] = [];
  private getEditorState: () => VemEditorState | null;
  private getRegistry: () => PluginRegistry | null;
  private scratchState: VemEditorState | null = null;

  constructor(
    width: number,
    height: number,
    getEditorState: () => VemEditorState | null,
    getRegistry: () => PluginRegistry | null,
  ) {
    super();
    this.width = width;
    this.height = height;
    this.interactive = true;
    this.getEditorState = getEditorState;
    this.getRegistry = getRegistry;

    this.titleText = new Text("Plugin Lab", {
      font: `600 15px ${PANEL_FONT}`,
      color: FALLBACK_FG,
    }).setPosition(20, 24);

    this.subtitleText = new Text(
      "Official extensions are loaded into this playground.",
      {
        font: `12px ${PANEL_FONT}`,
        color: FALLBACK_MUTED,
        maxWidth: width - 40,
        lineHeight: 16,
      },
    ).setPosition(20, 50);

    this.statusText = new Text("Click a plugin to run a live smoke test.", {
      font: `12px ${PANEL_FONT}`,
      color: FALLBACK_ACCENT,
      maxWidth: width - 40,
      lineHeight: 16,
    }).setPosition(20, height - 46);

    this.add(this.titleText);
    this.add(this.subtitleText);
    this.add(this.statusText);

    officialPlugins.forEach((definition, index) => {
      const button = new Button("Run", {
        onClick: () => this.runDemo(definition.id),
        bg: "transparent",
        hoverBg: "rgba(255, 255, 255, 0.08)",
        color: FALLBACK_ACCENT,
        font: `12px ${PANEL_FONT}`,
        radius: 2,
      });
      button.width = 52;
      button.height = 24;
      button.setPosition(width - 72, 96 + index * 60);
      this.demoButtons.push(button);
      this.add(button);
    });

    const handleActivate = (event: {
      localX?: number;
      localY?: number;
      target?: unknown;
    }) => {
      if (event.target !== undefined && event.target !== this) return;

      const localX = event.localX;
      const localY = event.localY;
      if (localX === undefined || localY === undefined) return;
      if (localX < 16 || localX > this.width - 16) return;

      const index = Math.floor((localY - 82) / 60);
      const rowY = 82 + index * 60;
      const definition = officialPlugins[index];
      if (!definition || localY < rowY || localY > rowY + 48) return;

      this.runDemo(definition.id);
    };

    this.on("pointerdown", handleActivate);
    this.on("click", handleActivate);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const textWidth = Math.max(120, width - 40);
    this.subtitleText.setMaxWidth(textWidth);
    this.statusText.setMaxWidth(textWidth);
    this.statusText.setPosition(20, height - 46);
    this.demoButtons.forEach((button, index) => {
      button.setPosition(width - 72, 96 + index * 60);
    });
  }

  private setStatus(message: string): void {
    this.statusText.setText(message);
    this.scene?.markDirty();
  }

  // Demos that inject keystrokes or trigger commands like `:w` must not run
  // against the user's live document: doing so silently changes their mode,
  // edits their real buffer, and (for `:w`) can trigger a real save. Those
  // demos run against this isolated scratch state instead.
  private getScratchState(): VemEditorState {
    if (!this.scratchState) {
      this.scratchState = new VemEditorState('const demo = "Vem";');
    }
    return this.scratchState;
  }

  private runDemo(pluginId: string): void {
    const editor = this.getEditorState();
    const registry = this.getRegistry();
    if (!editor || !registry) {
      this.setStatus("No active editor state is available.");
      return;
    }

    if (pluginId === "autopairs") {
      const scratch = this.getScratchState();
      scratch.setMode("INSERT");
      scratch.handleKey("(");
      this.setStatus(`Autopairs inserted: ${scratch.getText().slice(0, 8)}`);
      return;
    }

    if (pluginId === "git") {
      const count = editor.gutterDecorations.size;
      this.setStatus(`Git signs active: ${count} gutter decorations.`);
      return;
    }

    if (pluginId === "layout-customizer") {
      registry.executeCommand("layout.toggleSidebar");
      this.setStatus(
        `Sidebar moved to: ${editor.layoutConfig.sidebarPosition}.`,
      );
      return;
    }

    if (pluginId === "lualine") {
      const nextLine = Math.min(1, editor.getBuffer().getLineCount() - 1);
      editor.setCursor(nextLine, 0);
      this.setStatus(
        `Lualine refreshed: ${editor.statuslineLayout.left[0]?.text ?? "ready"}.`,
      );
      return;
    }

    if (pluginId === "telescope") {
      registry.executeCommand("telescope.findFiles");
      this.setStatus("Telescope opened the file picker popup.");
      return;
    }

    if (pluginId === "treesitter") {
      const spans = editor.highlightLine?.('const demo = "Vem";', 0) ?? [];
      this.setStatus(`Treesitter emitted ${spans.length} syntax spans.`);
      return;
    }

    if (pluginId === "trim-whitespace") {
      const scratch = this.getScratchState();
      scratch.setMode("NORMAL");
      scratch.getBuffer().setLine(0, `${scratch.getBuffer().getLine(0)}   `);
      scratch.handleKey(":");
      scratch.handleKey("w");
      scratch.handleKey("Enter");
      this.setStatus("Trim whitespace ran on :w save.");
    }
  }

  private clipText(text: string, maxPixels: number): string {
    const maxChars = Math.max(12, Math.floor(maxPixels / 6.5));
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}...` : text;
  }

  public render(r: IRenderer): void {
    // Pull live theme colors so Plugin Lab follows the user's own theme
    // (e.g. a Catppuccin vemrc) instead of a fixed teal/emerald palette baked
    // in separately from the rest of the app.
    const theme = this.getEditorState()?.theme;
    const bg = theme?.sidebarBg ?? FALLBACK_BG;
    const fg = theme?.fg ?? FALLBACK_FG;
    const muted = theme?.gutterFg ?? FALLBACK_MUTED;
    const accent = theme?.accent ?? FALLBACK_ACCENT;
    const stroke = fg + "1a";

    this.titleText.color = fg;
    this.subtitleText.color = muted;
    this.statusText.color = accent;
    for (const button of this.demoButtons) {
      button.color = accent;
    }

    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill(bg);

    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(0, this.height);
    r.closePath();
    r.stroke(stroke, 1);

    for (let i = 0; i < officialPlugins.length; i++) {
      const definition = officialPlugins[i];
      const y = 82 + i * 60;

      // A thin bottom rule between rows, not a card — sharp corners, no
      // fill, matching Vim's flat list style (e.g. :ls, netrw) rather than
      // a web-app card grid.
      r.beginPath();
      r.moveTo(16, y + 48);
      r.lineTo(this.width - 16, y + 48);
      r.closePath();
      r.stroke(stroke, 1);

      const textWidth = this.width - 130;
      r.fillText(definition.label, 16, y + 18, `600 12px ${PANEL_FONT}`, fg);
      r.fillText(
        this.clipText(definition.summary, textWidth),
        16,
        y + 34,
        `11px ${PANEL_FONT}`,
        muted,
      );
    }

    r.beginPath();
    r.moveTo(16, this.height - 60);
    r.lineTo(this.width - 16, this.height - 60);
    r.closePath();
    r.stroke(stroke, 1);
  }
}
