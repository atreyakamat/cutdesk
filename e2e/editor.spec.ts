import { expect, test, type Page } from "@playwright/test";

/** Click a tool in the left Tools rail — scoped so gallery items can't clash. */
async function pickTool(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Tools" }).getByRole("button", { name }).click();
}

/** Centre of the cutting-mat canvas, in viewport pixels. */
async function matCentre(page: Page) {
  const stage = page.locator(".konvajs-content canvas").first();
  const box = await stage.boundingBox();
  if (!box) throw new Error("canvas not found");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("CutDesk editor", () => {
  test("loads without uncaught errors and starts empty", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page).toHaveTitle(/CutDesk/i);
    // Konva renders the mat as a <canvas>; its Stage aria-label isn't a DOM label.
    await expect(page.locator(".konvajs-content canvas").first()).toBeVisible();
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("draws a rectangle with the shape tool", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();

    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);

    await expect(page.getByText(/1 object/)).toBeVisible();
  });

  test("undoes an edit with Ctrl+Z", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible(); // wait for hydration

    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await page.keyboard.press("Control+z");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
  });

  test("drags a shape (snapping path) without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    // Drag the shape; this runs the snapping/alignment-guide code path.
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y + 30, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByText(/1 object/)).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("adds a second page via the page bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByRole("button", { name: "Page 2" })).toBeVisible();
    await expect(page.getByText(/^0 objects$/)).toBeVisible(); // the new page is empty
  });

  test("applies a fill and groups shapes without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    const c = await matCentre(page);

    // First shape, then recolour it from the Fill swatches in the inspector.
    await pickTool(page, "Rectangle");
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();
    await page.getByRole("button", { name: "Fill #FF8FA3" }).click();

    // Second shape, then select all and group. Assert on the status bar text
    // (the inspector heading also says "2 objects" when multiple are selected).
    await pickTool(page, "Rectangle");
    await page.mouse.click(c.x + 90, c.y + 50);
    await expect(page.getByText(/2 objects, 1 selected/)).toBeVisible();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+g");
    await expect(page.getByText(/2 objects, 2 selected/)).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("right-click opens the context menu and duplicates", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await page.mouse.click(c.x, c.y, { button: "right" });
    await expect(page.getByRole("menu", { name: "Canvas actions" })).toBeVisible();
    await page.getByRole("menuitem", { name: /Duplicate/ }).click();
    await expect(page.getByText(/2 objects, 1 selected/)).toBeVisible();
  });

  test("duplicates via the floating selection toolbar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await pickTool(page, "Select");
    await page.mouse.click(c.x, c.y);
    const toolbar = page.getByRole("toolbar", { name: "Selection actions" });
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByText(/2 objects/)).toBeVisible();
  });

  test("opens the keyboard-shortcut help with ?", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible(); // hydrated
    await page.keyboard.press("Shift+/"); // "?"
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();
  });

  test("shows the autosave 'Saved' indicator after an edit", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("saves a style preset and shows it as a swatch", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await page.getByRole("button", { name: "Fill #FF8FA3" }).click();
    await page.getByRole("button", { name: "Save style" }).click();
    await expect(page.getByRole("button", { name: /Apply fill #FF8FA3/i })).toBeVisible();
  });

  test("toggles rulers on and off", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await page.getByRole("button", { name: "Show rulers" }).click();
    await expect(page.getByLabel(/Horizontal ruler/)).toBeVisible();
    await page.getByRole("button", { name: "Hide rulers" }).click();
    await expect(page.getByLabel(/Horizontal ruler/)).toBeHidden();
  });

  test("exports the design as a PNG", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await page.getByRole("button", { name: "Export menu" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "PNG image" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });

  test("unions two shapes into one via the Combine buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await pickTool(page, "Rectangle");
    await page.mouse.click(c.x + 25, c.y + 25);
    await page.keyboard.press("Control+a");
    await expect(page.getByText(/2 objects, 2 selected/)).toBeVisible();
    await page.getByRole("button", { name: "Union" }).click();
    await expect(page.getByText(/^1 object/)).toBeVisible();
  });

  test("adds an outline around a shape", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click(); // the outline "Add" button
    await expect(page.getByText(/2 objects/)).toBeVisible();
  });

  test("curves text with the Curve slider without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await page.getByRole("navigation", { name: "Tools" }).getByRole("button", { name: "Text", exact: true }).click(); // the tool, not a panel chip
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    const slider = page.getByLabel("Curve text along an arc");
    await expect(slider).toBeVisible();
    await slider.fill("90");
    await expect(page.getByText(/1 object/)).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("arranges shapes to fit without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await pickTool(page, "Rectangle");
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await pickTool(page, "Rectangle");
    await page.mouse.click(c.x + 60, c.y + 40);
    await page.keyboard.press("Control+a");
    await expect(page.getByText(/2 objects, 2 selected/)).toBeVisible();
    await page.getByRole("button", { name: "Arrange to fit" }).click();
    await expect(page.getByText(/2 objects, 2 selected/)).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("toggles dark mode and remembers it across a reload", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("adds a shape from the Elements panel and toggles workspace mode", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByRole("complementary", { name: "Elements library" });
    await expect(panel).toBeVisible(); // Design mode by default
    await panel.getByRole("button", { name: "Heart" }).click();
    await expect(page.getByText(/1 object/)).toBeVisible();

    // Switching to Cut mode puts away the Elements panel.
    await page.getByRole("radio", { name: "Cut" }).click();
    await expect(panel).toBeHidden();
  });
});
