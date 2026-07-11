import type { VemEditorState } from "@vemjs/core";
import { PluginRegistry, type VemPlugin } from "@vemjs/plugin-api";
import { AutopairsPlugin } from "@vemjs/plugin-autopairs";
import { GitPlugin } from "@vemjs/plugin-git";
import { LayoutCustomizerPlugin } from "@vemjs/plugin-layout-customizer";
import { LualinePlugin } from "@vemjs/plugin-lualine";
import { TelescopePlugin } from "@vemjs/plugin-telescope";
import { TreesitterPlugin } from "@vemjs/plugin-treesitter";
import { TrimWhitespacePlugin } from "@vemjs/plugin-trim-whitespace";

export interface OfficialPluginDefinition {
  id: string;
  label: string;
  summary: string;
  demoCommand?: string;
  plugin: VemPlugin;
  /**
   * When true the plugin is NOT active on boot — it changes the editor's
   * appearance (statusline, syntax colors), so like Vim it is opt-in
   * (`:Lualine`, `:Treesitter` / `:syntax on`). Neutral plugins stay on.
   */
  deferred?: boolean;
}

export const officialPlugins: OfficialPluginDefinition[] = [
  {
    id: "autopairs",
    label: "Autopairs",
    summary: "Closes brackets, quotes, and template strings while typing.",
    plugin: AutopairsPlugin,
  },
  {
    id: "git",
    label: "Git Signs",
    summary: "Projects add/change/delete indicators into the editor gutter.",
    plugin: GitPlugin,
  },
  {
    id: "layout-customizer",
    label: "Layout Customizer",
    summary: "Cycles sidebars, status bars, and editor themes.",
    demoCommand: "layout.toggleSidebar",
    plugin: LayoutCustomizerPlugin,
  },
  {
    id: "lualine",
    label: "Lualine",
    summary: "Adds a rich Vim-style statusline with mode, file, and position.",
    plugin: LualinePlugin,
    deferred: true,
  },
  {
    id: "telescope",
    label: "Telescope",
    summary: "Provides file finder and command palette floating pickers.",
    demoCommand: "telescope.findFiles",
    plugin: TelescopePlugin,
  },
  {
    id: "treesitter",
    label: "Treesitter",
    summary: "Applies token-aware syntax highlighting spans to editor text.",
    plugin: TreesitterPlugin,
    deferred: true,
  },
  {
    id: "trim-whitespace",
    label: "Trim Whitespace",
    summary: "Removes trailing whitespace on save.",
    plugin: TrimWhitespacePlugin,
  },
];

export function registerOfficialPlugins(registry: PluginRegistry): void {
  for (const definition of officialPlugins) {
    if (definition.deferred) continue; // opt-in via :Lualine / :Treesitter
    registry.register(definition.plugin);
  }
}

/** Activate a plugin by id on demand (idempotent enough for re-invocation). */
export function activatePluginById(
  registry: PluginRegistry,
  id: string,
): boolean {
  const def = officialPlugins.find((d) => d.id === id);
  if (!def) return false;
  registry.register(def.plugin);
  return true;
}

export function createOfficialPluginRegistry(
  editorState: VemEditorState,
): PluginRegistry {
  const registry = new PluginRegistry(editorState);
  registerOfficialPlugins(registry);
  return registry;
}
