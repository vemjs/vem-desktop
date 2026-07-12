import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ConfigLoader, VemEditorState } from "@vemjs/core";

const presetsDir = join(import.meta.dir, "..", "presets");
const KNOWN_KEYS = new Set([
  "plugins",
  "keybindings",
  "theme",
  "layout",
  "clipboard",
]);

describe("bundled vemrc presets", () => {
  afterEach(() => {
    // loadConfigFromObject mutates VemEditorState's process-wide defaults.
    VemEditorState.resetDefaults();
  });

  const files = readdirSync(presetsDir).filter((f) =>
    f.endsWith(".vemrc.json"),
  );

  it("ships at least one preset", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} is valid JSON and loads without error`, async () => {
      const content = readFileSync(join(presetsDir, file), "utf8");
      const config = JSON.parse(content);

      for (const key of Object.keys(config)) {
        expect(KNOWN_KEYS.has(key)).toBe(true);
      }

      const editor = new VemEditorState("x");
      const loader = new ConfigLoader(editor);
      // No throw = the preset is a shape ConfigLoader accepts.
      await loader.loadConfigFromObject(config, { register: () => {} });

      if (config.layout?.lineNumbers) {
        expect(editor.layoutConfig.lineNumbers).toBe(config.layout.lineNumbers);
      }
      if (config.theme?.accent) {
        expect(editor.theme.accent).toBe(config.theme.accent);
      }
    });
  }
});
