import { Button, Text, UIComponent } from "@vectojs/ui";
import type { IRenderer } from "@vectojs/core";
import { VemEditorState } from "@vemjs/core";
import type { PluginRegistry } from "@vemjs/plugin-api";
import { officialPlugins } from "./officialPlugins";

const PANEL_BG = "#07110f";
const PANEL_CARD = "#0d1b18";
const PANEL_STROKE = "#1d3b35";
const TEXT_MAIN = "#edf7f3";
const TEXT_MUTED = "#8ba69d";
const ACCENT = "#2dd4bf";
const AMBER = "#f4b860";

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
      font: "700 20px Outfit, sans-serif",
      color: TEXT_MAIN,
    }).setPosition(24, 24);

    this.subtitleText = new Text(
      "Official extensions are loaded into this playground.",
      {
        font: "13px Outfit, sans-serif",
        color: TEXT_MUTED,
        maxWidth: width - 48,
        lineHeight: 18,
      },
    ).setPosition(24, 54);

    this.statusText = new Text("Click a plugin to run a live smoke test.", {
      font: "12px JetBrains Mono, monospace",
      color: AMBER,
      maxWidth: width - 48,
      lineHeight: 17,
    }).setPosition(24, height - 54);

    this.add(this.titleText);
    this.add(this.subtitleText);
    this.add(this.statusText);

    officialPlugins.forEach((definition, index) => {
      const button = new Button("Run", {
        onClick: () => this.runDemo(definition.id),
        bg: "rgba(45, 212, 191, 0.12)",
        hoverBg: "rgba(45, 212, 191, 0.24)",
        color: ACCENT,
        font: "700 12px Outfit, sans-serif",
        radius: 999,
      });
      button.width = 64;
      button.height = 28;
      button.setPosition(width - 88, 108 + index * 64);
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
      if (localX < 18 || localX > this.width - 18) return;

      const index = Math.floor((localY - 94) / 64);
      const rowY = 94 + index * 64;
      const definition = officialPlugins[index];
      if (!definition || localY < rowY || localY > rowY + 52) return;

      this.runDemo(definition.id);
    };

    this.on("pointerdown", handleActivate);
    this.on("click", handleActivate);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const textWidth = Math.max(120, width - 48);
    this.subtitleText.setMaxWidth(textWidth);
    this.statusText.setMaxWidth(textWidth);
    this.statusText.setPosition(24, height - 54);
    this.demoButtons.forEach((button, index) => {
      button.setPosition(width - 88, 108 + index * 64);
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
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill(PANEL_BG);

    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(0, this.height);
    r.closePath();
    r.stroke(PANEL_STROKE, 1.5);

    for (let i = 0; i < officialPlugins.length; i++) {
      const definition = officialPlugins[i];
      const y = 94 + i * 64;

      r.beginPath();
      r.roundRect(18, y, this.width - 36, 52, 12);
      r.closePath();
      r.fill(PANEL_CARD);
      r.stroke("rgba(45, 212, 191, 0.14)", 1);

      const textWidth = this.width - 150;
      r.fillText(
        definition.label,
        32,
        y + 21,
        "700 13px Outfit, sans-serif",
        TEXT_MAIN,
      );
      r.fillText(
        this.clipText(definition.summary, textWidth),
        32,
        y + 39,
        "11px Outfit, sans-serif",
        TEXT_MUTED,
      );
    }

    r.beginPath();
    r.roundRect(18, this.height - 72, this.width - 36, 48, 12);
    r.closePath();
    r.fill("rgba(244, 184, 96, 0.08)");
    r.stroke("rgba(244, 184, 96, 0.22)", 1);
  }
}
