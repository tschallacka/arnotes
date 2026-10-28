// Server-side Markdown ⇄ task-HTML conversion.
//
// Task descriptions and comments are stored as the HTML the Tiptap editor
// produces, but agents speak Markdown, so every MCP board tool converts on
// the way in and out. The browser utilities in `app/utils/markdown.ts` do the
// same job with the native DOM; here Turndown's DOM implementation stands in
// for it.
import { marked } from 'marked'
import TurndownService from 'turndown'
// The package ships its type declaration under the module name `domino` rather
// than the scoped name it is published under, so the import is typed here.
// @ts-expect-error -- see above
import dominoUntyped from '@mixmark-io/domino'

const domino = dominoUntyped as {
  createDocument(html?: string, force?: boolean): Document
}

function parseFragment(html: string) {
  return domino.createDocument(`<body>${html}</body>`, true)
}

function createTurndownService(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })

  td.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      const rows = Array.from((node as HTMLTableElement).rows)
      const [headerRow, ...bodyRows] = rows
      if (!headerRow) return ''

      const toCellText = (cell: HTMLTableCellElement) => cell.textContent?.trim().replace(/\|/g, '\\|') ?? ''
      const toRow = (row: HTMLTableRowElement) => `| ${Array.from(row.cells).map(toCellText).join(' | ')} |`
      const toSeparator = (cell: HTMLTableCellElement) => {
        switch (cell.style.textAlign) {
          case 'left': return ':---'
          case 'center': return ':---:'
          case 'right': return '---:'
          default: return '---'
        }
      }

      const header = toRow(headerRow)
      const separator = `| ${Array.from(headerRow.cells).map(toSeparator).join(' | ')} |`
      const body = bodyRows.map(toRow)

      return `\n\n${[header, separator, ...body].join('\n')}\n\n`
    }
  })

  td.addRule('taskItem', {
    filter(node) {
      return node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem'
    },
    replacement(_content, node) {
      const el = node as HTMLElement
      const checked = el.getAttribute('data-checked') === 'true'
      // The item wraps its text in a label/checkbox pair Turndown would render
      // as noise, so only the content block is converted — through Turndown
      // again, so bold, links and code inside a checklist item survive.
      const body = el.querySelector('div, p')
      const inner = body
        ? createTurndownService().turndown(body.innerHTML).replace(/\s*\n+\s*/g, ' ').trim()
        : (el.textContent ?? '').trim()
      return `- [${checked ? 'x' : ' '}] ${inner}\n`
    }
  })

  td.addRule('fencedCode', {
    filter(node) {
      return node.nodeName === 'PRE' && !!node.firstChild && (node.firstChild as HTMLElement).nodeName === 'CODE'
    },
    replacement(_content, node) {
      const code = (node as HTMLElement).querySelector('code')
      const lang = (code?.className ?? '').match(/language-(\w+)/)?.[1] ?? ''
      return `\n\`\`\`${lang}\n${code?.textContent ?? ''}\n\`\`\`\n\n`
    }
  })

  td.addRule('highlight', {
    filter: ['mark'],
    replacement: content => content
  })

  return td
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Markdown → the HTML shape Tiptap round-trips, including its task-list markup. */
export function markdownToHtml(text: string): string {
  if (!text) return ''
  const raw = marked.parse(text, { async: false, gfm: true }) as string
  const doc = parseFragment(raw)

  for (const li of Array.from(doc.querySelectorAll('ul > li'))) {
    const input = li.querySelector('input[type="checkbox"]')
    if (!input) continue
    const checked = input.hasAttribute('checked')
    li.closest('ul')!.setAttribute('data-type', 'taskList')
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', String(checked))
    input.remove()
    const content = li.innerHTML.trim()
    li.innerHTML = `<label><input type="checkbox"${checked ? ' checked' : ''}></label><div><p>${content}</p></div>`
  }

  return doc.body.innerHTML
}

/** Task HTML → Markdown, matching what the browser export produces. */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  return normalizeMarkdown(createTurndownService().turndown(html))
}

// `textContent` runs adjacent blocks together, which would join a heading to the
// paragraph below it into one word. Closing block tags become spaces first.
const CLOSING_BLOCK_TAG = /<\/(?:h[1-6]|p|div|li|ul|ol|tr|td|th|blockquote|pre|section|article)>/gi

/** Plain text of a task's HTML body, used for matching search terms without HTML noise. */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const spaced = html.replace(CLOSING_BLOCK_TAG, match => `${match} `)
  return (parseFragment(spaced).body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
