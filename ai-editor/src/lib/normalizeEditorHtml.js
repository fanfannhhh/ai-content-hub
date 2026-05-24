/**
 * Strip inline text colors from saved HTML so dark-theme UI colors do not bleed into the paper.
 * @param {string} html
 * @returns {string}
 */
const LEGACY_PAGE_BREAK_DIV =
  /<div[^>]*(?:class="[^"]*page-break[^"]*"|data-page-break)[^>]*>\s*<\/div>/gi

const PAGE_BREAK_HR =
  '<hr class="page-break" style="page-break-after: always;">'

export function normalizeEditorHtml(html) {
  if (!html?.trim()) {
    return '<p></p>'
  }

  let input = html.replace(LEGACY_PAGE_BREAK_DIV, PAGE_BREAK_HR)

  if (typeof DOMParser === 'undefined') {
    return input
    return input
      .replace(/\sstyle="[^"]*"/gi, (style) =>
        /color\s*:/i.test(style) ? '' : style,
      )
      .replace(/\sstyle='[^']*'/gi, (style) =>
        /color\s*:/i.test(style) ? '' : style,
      )
  }

  const doc = new DOMParser().parseFromString(input, 'text/html')
  doc.body.querySelectorAll('[style]').forEach((el) => {
    el.style.removeProperty('color')
    el.style.removeProperty('-webkit-text-fill-color')
    if (!el.getAttribute('style')?.trim()) {
      el.removeAttribute('style')
    }
  })
  doc.body.querySelectorAll('font[color]').forEach((el) => {
    el.removeAttribute('color')
  })
  return doc.body.innerHTML || '<p></p>'
}
