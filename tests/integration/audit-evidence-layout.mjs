import assert from "node:assert/strict";

export const evidenceViewportWidths = [390, 768, 1024, 1074, 1100, 1200, 1279, 1280, 1440];

export async function assertEvidenceLayout(card, { preview = true } = {}) {
  const layout = await card.evaluate(row => {
    const box = element => element.getBoundingClientRect();
    const criterion = row.closest(".audit-item");
    const section = row.closest(".audit-evidence");
    const body = row.querySelector(".file-body");
    const info = row.querySelector(".audit-evidence-info");
    const thumbnail = row.querySelector(".audit-evidence-thumbnail");
    const actions = row.querySelector(".file-actions");
    const [download, remove] = actions.querySelectorAll("button");
    const save = criterion.querySelector(".audit-save");
    const criterionStyle = getComputedStyle(criterion);
    const usefulLeft = box(criterion).left + parseFloat(criterionStyle.paddingLeft);
    const usefulRight = box(criterion).right - parseFloat(criterionStyle.paddingRight);
    const fallback = row.querySelector(".audit-image-error");
    return {
      width: innerWidth,
      cardWidth: box(row).width,
      infoWidth: box(info).width,
      fullWidth: Math.abs(box(row).left - usefulLeft) <= 1 && Math.abs(box(row).right - usefulRight) <= 1,
      overflow: document.documentElement.scrollWidth > innerWidth ||
        [section, row, body, info, actions].some(element => element.scrollWidth > element.clientWidth + 1),
      narrow: box(section).width < 32 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      actionsBelow: box(actions).top >= box(body).bottom - 1,
      actionsBeside: box(actions).left >= box(body).right - 1,
      buttonsSideBySide: Math.abs(box(download).top - box(remove).top) <= 1 && box(download).right <= box(remove).left,
      thumbnail: thumbnail && [box(thumbnail).width, box(thumbnail).height],
      imageBesideInfo: thumbnail && box(thumbnail).right < box(info).left && box(info).top < box(thumbnail).bottom,
      saveAbove: !save.textContent.trim() || box(save).bottom <= box(section).top,
      fallbackBelow: fallback && box(fallback).top >= box(info).bottom,
    };
  });
  const context = `Viewport ${layout.width}px, cartão ${layout.cardWidth}px`;
  assert.ok(layout.fullWidth, `${context}: evidências devem ocupar a largura útil do critério`);
  assert.ok(!layout.overflow, `${context}: overflow horizontal`);
  assert.ok(layout.infoWidth >= 120, `${context}: espaço insuficiente para os metadados`);
  assert.ok(layout.buttonsSideBySide, `${context}: Baixar e Remover devem ficar lado a lado`);
  assert.ok(layout.saveAbove, `${context}: indicador de salvamento deve ficar acima do bloco`);
  assert.ok(layout.narrow ? layout.actionsBelow : layout.actionsBeside, `${context}: posição das ações deve seguir a largura do bloco`);
  if (preview) {
    assert.deepEqual(layout.thumbnail, [88, 72], context);
    assert.ok(layout.imageBesideInfo, `${context}: alinhar miniatura e metadados`);
  } else {
    assert.equal(layout.thumbnail, null, context);
    assert.ok(layout.fallbackBelow, `${context}: fallback deve ficar abaixo dos metadados`);
  }
  return layout;
}
