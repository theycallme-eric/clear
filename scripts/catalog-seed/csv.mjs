/**
 * DATA-02 — readers for the two committed input formats.
 *
 * The seed's input is the read-only capture in
 * `docs/backend/snapshot/2026-09-18T162821Z/catalog/`, written by `psql \copy
 * … WITH (FORMAT csv, HEADER)`. That is RFC 4180 with Postgres' own spelling of
 * the values inside a field: array literals as `{a,b}` and `NULL` as an empty
 * unquoted field, which is why a general-purpose CSV reader is not enough on
 * its own and the two parsers live together here.
 *
 * Nothing in this file knows what a catalog is. It turns bytes into strings,
 * and `sources.mjs` decides what they mean.
 */

/**
 * @param {string} text Whole file contents, header row included.
 * @returns {Array<Record<string, string | null>>} One object per data row.
 *   An empty unquoted field is `null` (Postgres NULL); an empty *quoted*
 *   field is `''` (the empty string). The capture relies on that distinction
 *   — `regression` is legitimately null for most exercises, and DATA-02 must
 *   preserve a valid null rather than invent an empty string.
 */
export function parseCsv(text) {
  const rows = parseRows(text)
  if (rows.length === 0) return []

  const [header, ...body] = rows
  const columns = header.map((cell) => cell.value)

  return body.map((cells, index) => {
    if (cells.length !== columns.length) {
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} fields, expected ${columns.length}`,
      )
    }
    /** @type {Record<string, string | null>} */
    const row = {}
    columns.forEach((column, position) => {
      const cell = cells[position]
      row[column] = !cell.quoted && cell.value === '' ? null : cell.value
    })
    return row
  })
}

/**
 * @typedef {{ value: string, quoted: boolean }} Cell
 */

/**
 * RFC 4180 scan. A quote inside a quoted field is written `""`.
 *
 * @param {string} text
 * @returns {Cell[][]}
 */
function parseRows(text) {
  /** @type {Cell[][]} */
  const rows = []
  /** @type {Cell[]} */
  let row = []
  let value = ''
  let quoted = false
  let inQuotes = false

  const endField = () => {
    row.push({ value, quoted })
    value = ''
    quoted = false
  }
  const endRow = () => {
    endField()
    // A trailing newline produces one empty unquoted field; that is the end of
    // the file, not a row of NULLs.
    if (row.length === 1 && row[0].value === '' && !row[0].quoted) {
      row = []
      return
    }
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        value += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
      quoted = true
    } else if (character === ',') {
      endField()
    } else if (character === '\r') {
      // CRLF: the \n does the work.
    } else if (character === '\n') {
      endRow()
    } else {
      value += character
    }
  }

  if (inQuotes) throw new Error('CSV ended inside a quoted field')
  if (value !== '' || quoted || row.length > 0) endRow()

  return rows
}

/**
 * Parse a Postgres array literal — `{}`, `{a,b}`, `{"a,b","say ""hi"""}`.
 *
 * @param {string | null} literal
 * @returns {string[]} `null` and `{}` both yield `[]`. The catalog's array
 *   columns are `NOT NULL DEFAULT '{}'`, so the two are the same fact.
 */
export function parsePgArray(literal) {
  if (literal === null || literal === '') return []
  if (!literal.startsWith('{') || !literal.endsWith('}')) {
    throw new Error(`Not a Postgres array literal: ${literal}`)
  }

  const body = literal.slice(1, -1)
  if (body === '') return []

  /** @type {string[]} */
  const items = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]

    if (inQuotes) {
      if (character === '\\') {
        value += body[index + 1] ?? ''
        index += 1
      } else if (character === '"') {
        if (body[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        value += character
      }
      continue
    }

    if (character === '"') inQuotes = true
    else if (character === ',') {
      items.push(value)
      value = ''
    } else value += character
  }

  if (inQuotes) throw new Error(`Array literal ended inside a quote: ${literal}`)
  items.push(value)

  return items
}
