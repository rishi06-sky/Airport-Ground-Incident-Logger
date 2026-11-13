import { test, expect } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
async function login(page, role) {
  await page.goto("/");
  await page.getByLabel("Work email").fill(`${role}@agil.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
}
test("staff submits real report, sees details, uses simulator; supervisor resolves it", async ({
  page,
  browser,
}) => {
  await login(page, "staff");
  await page.getByRole("link", { name: "New incident", exact: true }).click();
  await page.getByLabel("Contact details").fill("fictional.staff@agil.test");
  await page
    .getByLabel("Aircraft registration", { exact: true })
    .fill("VT-ABC");
  await page.getByLabel("Incident code", { exact: true }).fill("GND123");
  await page
    .getByLabel("Incident description")
    .fill(
      "Foreign object debris near aircraft. Browser workflow verification.",
    );
  await page.getByRole("button", { name: "Validate & classify" }).click();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Submit incident", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Incident recorded" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View incident" }).click();
  await expect(page).toHaveURL(/incidents\/AGIL-/);
  const id = new URL(page.url()).pathname.split("/").pop();
  await expect(
    page.getByRole("heading", { name: id, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Assigned", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: "docs/incident-desktop.png", fullPage: true });
  const context = await browser.newContext();
  const supervisor = await context.newPage();
  await login(supervisor, "supervisor");
  await supervisor
    .getByRole("link", { name: "My assignments", exact: true })
    .click();
  await expect(
    supervisor.getByRole("heading", { name: "My assignments", exact: true }),
  ).toBeVisible();
  await supervisor.goto(`/incidents/${id}`);
  await supervisor.getByRole("button", { name: "Mark In Progress" }).click();
  await expect(
    supervisor.getByRole("button", { name: "Mark Resolved" }),
  ).toBeVisible();
  await supervisor.getByRole("button", { name: "Mark Resolved" }).click();
  await expect(
    supervisor.getByText("Resolved", { exact: true }).first(),
  ).toBeVisible();
  await context.close();
  await page.getByRole("link", { name: "DFA simulator", exact: true }).click();
  await page.getByRole("button", { name: "Run validators" }).click();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});
test("admin dashboards and mobile navigation render without browser errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin");
  await page.screenshot({ path: "docs/dashboard-desktop.png", fullPage: true });
  for (const [link, heading] of [
    ["Dispatch & teams", "Dispatch & handling teams"],
    ["Analytics", "Incident analytics"],
    ["Safety center", "Safety center"],
    ["Administration", "Administration"],
  ]) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Operations overview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page
    .getByRole("link", { name: "Incident reports", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Incident reports" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/reports-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
