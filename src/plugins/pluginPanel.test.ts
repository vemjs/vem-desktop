import { describe, expect, it } from "bun:test";
import { PluginPanel } from "./PluginPanel";

describe("PluginPanel responsive layout", () => {
  it("keeps controls in bounds even after hidden-state resize", () => {
    const panel = new PluginPanel(
      360,
      700,
      () => null,
      () => null,
    );

    panel.resize(0, 500);
    expect(
      (panel as unknown as { subtitleText: { maxWidth: number } }).subtitleText
        .maxWidth,
    ).toBe(120);

    panel.resize(320, 500);
    const buttons = (
      panel as unknown as {
        demoButtons: Array<{ x: number; width: number }>;
      }
    ).demoButtons;

    for (const button of buttons) {
      expect(button.x + button.width).toBeLessThanOrEqual(320);
    }
  });
});
