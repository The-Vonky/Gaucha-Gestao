import assert from "node:assert/strict";

// Read rendered bounds in Chromium, including label areas around native radios.
// Only operational targets are checked; inline prose links retain their density.
export async function qualityTouchTargets(page, label) {
  // Modal entry scales the rendered bounds. Wait for actual finite animations,
  // never a guessed delay; upload progress animations continue independently.
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation =>
      animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
  const result = await page.evaluate(() => {
    const selectors = [
      "button.small", ".row-actions button", ".notice-body button",
      ".audit-evidence button", ".response", ".breadcrumb a", ".crumbs a",
      ".unit-card-link", ".unit-card-continue", ".unit-filters button", ".quality-return", ".audit-tabs a", ".audit-more-toggle", ".audit-evidence-toggle",
      ".audit-recent-list a", ".audit-plan-main a", ".audit-panel-head .button-link",
      ".ap-result .check", ".menu a", ".logout", ".mobile-menu", ".topbar-brand",
    ];
    const visible = element => element.getClientRects().length &&
      getComputedStyle(element).visibility !== "hidden";
    const targets = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))]
      .filter(visible);
    const failures = targets.flatMap(element => {
      const rect = element.getBoundingClientRect();
      return rect.height < 44 || rect.width < 44
        ? [`${element.className || element.tagName}: ${element.textContent.trim()} (${rect.width}×${rect.height})`] : [];
    });
    const groups = [...document.querySelectorAll(".actions, .row-actions, .file-actions, .audit-overview-file")].filter(visible);
    const badGroups = groups.flatMap(group => {
      const children = [...group.children].filter(visible).map(element => element.getBoundingClientRect());
      const outside = children.some(rect => rect.left < 0 || rect.right > innerWidth + 1);
      const overlap = children.some((rect, index) => children.slice(index + 1).some(other =>
        Math.min(rect.right, other.right) > Math.max(rect.left, other.left) + 1 &&
        Math.min(rect.bottom, other.bottom) > Math.max(rect.top, other.top) + 1));
      return outside || overlap ? [group.className] : [];
    });
    return { coarse: matchMedia("(pointer: coarse)").matches, narrow: innerWidth < 1024,
      count: targets.length, failures, badGroups,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(result.coarse || result.narrow, `${label}: no touch media condition`);
  assert.ok(result.count > 0, `${label}: no rendered targets`);
  assert.deepEqual(result.failures, [], `${label}: undersized targets`);
  assert.deepEqual(result.badGroups, [], `${label}: overlapping/overflowing actions`);
  assert.equal(result.overflow, false, `${label}: horizontal overflow`);
}
