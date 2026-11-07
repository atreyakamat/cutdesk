import { expect, test, type Page } from "@playwright/test";

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

    await page.getByRole("button", { name: "Rectangle" }).click();
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);

    await expect(page.getByText(/1 object/)).toBeVisible();
  });

  test("undoes an edit with Ctrl+Z", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible(); // wait for hydration

    await page.getByRole("button", { name: "Rectangle" }).click();
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
    await page.getByRole("button", { name: "Rectangle" }).click();
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
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();
    await page.getByRole("button", { name: "Fill #FF8FA3" }).click();

    // Second shape, then select all and group. Assert on the status bar text
    // (the inspector heading also says "2 objects" when multiple are selected).
    await page.getByRole("button", { name: "Rectangle" }).click();
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
    await page.getByRole("button", { name: "Rectangle" }).click();
    const c = await matCentre(page);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText(/1 object/)).toBeVisible();

    await page.mouse.click(c.x, c.y, { button: "right" });
    await expect(page.getByRole("menu", { name: "Canvas actions" })).toBeVisible();
    await page.getByRole("menuitem", { name: /Duplicate/ }).click();
    await expect(page.getByText(/2 objects, 1 selected/)).toBeVisible();
  });

  test("exports the design as a PNG", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^0 objects$/)).toBeVisible();
    await page.getByRole("button", { name: "Rectangle" }).click();
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

  test("toggles dark mode and remembers it across a reload", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });
});
