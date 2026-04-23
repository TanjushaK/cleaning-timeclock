import { dbQuery } from '@/lib/server/pool'
import type { CompatResponse } from '@/lib/server/compat/types'

type FilterOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'is'

type Filter = {
  column: string
  op: FilterOp
  value: unknown
}

type OrderBy = {
  column: string
  ascending: boolean
  nullsFirst?: boolean
}

type SelectJoin = {
  alias: string
  table: string
  columns: string[]
}

type ParsedSelect = {
  raw: string
  all: boolean
  columns: string[]
  joins: SelectJoin[]
}

type QueryAction = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

const tableColumnsCache = new Map<string, Promise<Set<string>>>()
const tableExistsCache = new Map<string, Promise<boolean>>()

function compatError(message: string): { message: string } {
  return { message }
}

async function tableExists(table: string): Promise<boolean> {
  if (!tableExistsCache.has(table)) {
    tableExistsCache.set(
      table,
      dbQuery<{ exists: boolean }>(
        `select exists (
           select 1
             from information_schema.tables
            where table_schema = 'public'
              and table_name = $1
         ) as exists`,
        [table],
      ).then((result) => Boolean(result.rows[0]?.exists)),
    )
  }
  return tableExistsCache.get(table)!
}

async function getTableColumns(table: string): Promise<Set<string>> {
  if (!tableColumnsCache.has(table)) {
    tableColumnsCache.set(
      table,
      dbQuery<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name = $1`,
        [table],
      ).then((result) => new Set(result.rows.map((row) => String(row.column_name)))),
    )
  }
  return tableColumnsCache.get(table)!
}

function splitCsv(value: string): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0
  for (const ch of value) {
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function parseSelect(selectValue: string | undefined | null): ParsedSelect {
  const raw = String(selectValue || '*').trim() || '*'
  if (raw === '*') {
    return { raw, all: true, columns: [], joins: [] }
  }
  const columns: string[] = []
  const joins: SelectJoin[] = []
  for (const item of splitCsv(raw)) {
    const joinMatch = item.match(/^([a-zA-Z0-9_]+):([a-zA-Z0-9_]+)\((.+)\)$/)
    if (joinMatch) {
      joins.push({
        alias: joinMatch[1],
        table: joinMatch[2],
        columns: splitCsv(joinMatch[3]).map((part) => part.trim()).filter(Boolean),
      })
      continue
    }
    columns.push(item)
  }
  return { raw, all: false, columns, joins }
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}


function normalizeWriteValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return value
}

async function validateTableAndColumns(table: string, parsedSelect?: ParsedSelect, writeColumns?: string[]): Promise<{ error: { message: string } | null }> {
  if (!(await tableExists(table))) {
    return { error: compatError(`relation \"public.${table}\" does not exist`) }
  }
  const columns = await getTableColumns(table)
  if (parsedSelect && !parsedSelect.all) {
    for (const column of parsedSelect.columns) {
      if (!columns.has(column)) {
        return { error: compatError(`column \"${column}\" does not exist`) }
      }
    }
  }
  if (writeColumns) {
    for (const column of writeColumns) {
      if (!columns.has(column)) {
        return { error: compatError(`column \"${column}\" does not exist`) }
      }
    }
  }
  return { error: null }
}

function buildFilterSql(filters: Filter[], values: unknown[]): string {
  if (filters.length === 0) return ''
  const chunks: string[] = []
  for (const filter of filters) {
    const col = quoteIdent(filter.column)
    switch (filter.op) {
      case 'eq':
        values.push(filter.value)
        chunks.push(`${col} = $${values.length}`)
        break
      case 'neq':
        values.push(filter.value)
        chunks.push(`${col} <> $${values.length}`)
        break
      case 'lt':
        values.push(filter.value)
        chunks.push(`${col} < $${values.length}`)
        break
      case 'lte':
        values.push(filter.value)
        chunks.push(`${col} <= $${values.length}`)
        break
      case 'gt':
        values.push(filter.value)
        chunks.push(`${col} > $${values.length}`)
        break
      case 'gte':
        values.push(filter.value)
        chunks.push(`${col} >= $${values.length}`)
        break
      case 'in':
        values.push(filter.value)
        chunks.push(`${col} = any($${values.length})`)
        break
      case 'is':
        if (filter.value === null) {
          chunks.push(`${col} is null`)
        } else {
          values.push(filter.value)
          chunks.push(`${col} is not distinct from $${values.length}`)
        }
        break
      default:
        break
    }
  }
  return chunks.length ? ` where ${chunks.join(' and ')}` : ''
}

function buildOrderSql(orderBy: OrderBy[]): string {
  if (orderBy.length === 0) return ''
  return ` order by ${orderBy
    .map((item) => {
      const direction = item.ascending ? 'asc' : 'desc'
      const nulls = item.nullsFirst === undefined ? '' : item.nullsFirst ? ' nulls first' : ' nulls last'
      return `${quoteIdent(item.column)} ${direction}${nulls}`
    })
    .join(', ')}`
}

async function applyJoins(baseTable: string, rows: any[], joins: SelectJoin[]): Promise<any[]> {
  if (joins.length === 0 || rows.length === 0) return rows
  const result = rows.map((row) => ({ ...row }))
  for (const join of joins) {
    if (baseTable === 'jobs' && join.table === 'sites' && join.alias === 'site') {
      const siteIds = Array.from(new Set(result.map((row) => row.site_id).filter(Boolean)))
      if (siteIds.length === 0) {
        for (const row of result) row[join.alias] = null
        continue
      }
      const selectSql = join.columns.map(quoteIdent).join(', ')
      const joined = await dbQuery(`select ${selectSql}, id from ${quoteIdent(join.table)} where id = any($1)`, [siteIds])
      const byId = new Map(joined.rows.map((row: any) => [String(row.id), row]))
      for (const row of result) {
        row[join.alias] = row.site_id ? byId.get(String(row.site_id)) || null : null
      }
      continue
    }
    throw new Error(`Join not implemented for ${baseTable}.${join.alias}:${join.table}`)
  }
  return result
}

function rowCountData<T>(rows: T[]): CompatResponse<T[] | T | null> {
  return { data: rows as T[], error: null }
}

export class QueryBuilder<T = any> implements PromiseLike<CompatResponse<T[] | T | null>> {
  private action: QueryAction = 'select'
  private selectValue = '*'
  private filters: Filter[] = []
  private orderBy: OrderBy[] = []
  private limitValue: number | null = null
  private insertValue: Record<string, unknown>[] = []
  private updateValue: Record<string, unknown> = {}
  private upsertOnConflict: string | null = null
  private singleMode: 'single' | 'maybeSingle' | null = null

  constructor(private readonly table: string) {}

  select(value = '*'): this {
    if (this.action === 'select') {
      this.action = 'select'
    }
    this.selectValue = value
    return this
  }

  insert(value: Record<string, unknown> | Record<string, unknown>[]): this {
    this.action = 'insert'
    this.insertValue = Array.isArray(value) ? value : [value]
    return this
  }

  update(value: Record<string, unknown>): this {
    this.action = 'update'
    this.updateValue = value
    return this
  }

  delete(): this {
    this.action = 'delete'
    return this
  }

  upsert(value: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): this {
    this.action = 'upsert'
    this.insertValue = Array.isArray(value) ? value : [value]
    this.upsertOnConflict = options?.onConflict || null
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lt', value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lte', value })
    return this
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gt', value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gte', value })
    return this
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ column, op: 'in', value })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'is', value })
    return this
  }

  match(value: Record<string, unknown>): this {
    for (const [column, columnValue] of Object.entries(value)) {
      this.eq(column, columnValue)
    }
    return this
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderBy.push({
      column,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst,
    })
    return this
  }

  limit(value: number): this {
    this.limitValue = value
    return this
  }

  single(): this {
    this.singleMode = 'single'
    this.limitValue = 2
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle'
    this.limitValue = 2
    return this
  }

  async execute(): Promise<CompatResponse<any>> {
    try {
      const parsedSelect = parseSelect(this.selectValue)
      const validation = await validateTableAndColumns(
        this.table,
        this.action === 'select' || this.selectValue !== '*' ? parsedSelect : undefined,
        this.action === 'insert'
          ? this.insertValue.flatMap((row) => Object.keys(row))
          : this.action === 'update'
            ? Object.keys(this.updateValue)
            : this.action === 'upsert'
              ? this.insertValue.flatMap((row) => Object.keys(row))
              : undefined,
      )
      if (validation.error) return { data: null, error: validation.error }

      switch (this.action) {
        case 'select':
          return await this.executeSelect(parsedSelect)
        case 'insert':
          return await this.executeInsert(parsedSelect)
        case 'update':
          return await this.executeUpdate(parsedSelect)
        case 'delete':
          return await this.executeDelete()
        case 'upsert':
          return await this.executeUpsert(parsedSelect)
        default:
          return { data: null, error: compatError('Unsupported query action') }
      }
    } catch (error) {
      return { data: null, error: compatError(error instanceof Error ? error.message : 'Database error') }
    }
  }

  private async executeSelect(parsedSelect: ParsedSelect): Promise<CompatResponse<any>> {
    const values: unknown[] = []
    const selectSql = parsedSelect.all
      ? '*'
      : parsedSelect.columns.length
        ? parsedSelect.columns.map(quoteIdent).join(', ')
        : 'id'
    const whereSql = buildFilterSql(this.filters, values)
    const orderSql = buildOrderSql(this.orderBy)
    const limitSql = this.limitValue ? ` limit ${Math.max(1, this.limitValue)}` : ''
    const sql = `select ${selectSql} from ${quoteIdent(this.table)}${whereSql}${orderSql}${limitSql}`
    const result = await dbQuery(sql, values)
    let rows = result.rows
    rows = await applyJoins(this.table, rows, parsedSelect.joins)
    return this.shapeResult(rows)
  }

  private async executeInsert(parsedSelect: ParsedSelect): Promise<CompatResponse<any>> {
    if (this.insertValue.length === 0) return { data: null, error: compatError('Insert payload required') }
    const columns = Array.from(new Set(this.insertValue.flatMap((row) => Object.keys(row))))
    const values: unknown[] = []
    const valueRows = this.insertValue.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(normalizeWriteValue(row[column] ?? null))
        return `$${values.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    const returningSql = parsedSelect.all
      ? '*'
      : parsedSelect.columns.length
        ? parsedSelect.columns.map(quoteIdent).join(', ')
        : '*'
    const sql = `insert into ${quoteIdent(this.table)} (${columns.map(quoteIdent).join(', ')}) values ${valueRows.join(', ')} returning ${returningSql}`
    const result = await dbQuery(sql, values)
    return this.shapeResult(result.rows)
  }

  private async executeUpsert(parsedSelect: ParsedSelect): Promise<CompatResponse<any>> {
    if (this.insertValue.length === 0) return { data: null, error: compatError('Upsert payload required') }
    const conflict = this.upsertOnConflict || 'id'
    const columns = Array.from(new Set(this.insertValue.flatMap((row) => Object.keys(row))))
    const values: unknown[] = []
    const valueRows = this.insertValue.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(normalizeWriteValue(row[column] ?? null))
        return `$${values.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    const updateColumns = columns.filter((column) => column !== conflict)
    const returningSql = parsedSelect.all
      ? '*'
      : parsedSelect.columns.length
        ? parsedSelect.columns.map(quoteIdent).join(', ')
        : '*'
    const sql = `insert into ${quoteIdent(this.table)} (${columns.map(quoteIdent).join(', ')}) values ${valueRows.join(', ')} on conflict (${quoteIdent(conflict)}) do update set ${updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(', ')} returning ${returningSql}`
    const result = await dbQuery(sql, values)
    return this.shapeResult(result.rows)
  }

  private async executeUpdate(parsedSelect: ParsedSelect): Promise<CompatResponse<any>> {
    const writeColumns = Object.keys(this.updateValue)
    if (writeColumns.length === 0) return { data: null, error: compatError('Nothing to update') }
    const values: unknown[] = []
    const setSql = writeColumns
      .map((column) => {
        values.push(normalizeWriteValue(this.updateValue[column] ?? null))
        return `${quoteIdent(column)} = $${values.length}`
      })
      .join(', ')
    const whereSql = buildFilterSql(this.filters, values)
    const returningSql = parsedSelect.all
      ? '*'
      : parsedSelect.columns.length
        ? parsedSelect.columns.map(quoteIdent).join(', ')
        : '*'
    const sql = `update ${quoteIdent(this.table)} set ${setSql}${whereSql} returning ${returningSql}`
    const result = await dbQuery(sql, values)
    return this.shapeResult(result.rows)
  }

  private async executeDelete(): Promise<CompatResponse<any>> {
    const values: unknown[] = []
    const whereSql = buildFilterSql(this.filters, values)
    const sql = `delete from ${quoteIdent(this.table)}${whereSql}`
    await dbQuery(sql, values)
    return { data: null, error: null }
  }

  private shapeResult(rows: any[]): CompatResponse<any> {
    if (this.singleMode === 'single') {
      if (rows.length !== 1) return { data: null, error: compatError('JSON object requested, multiple (or no) rows returned') }
      return { data: rows[0], error: null }
    }
    if (this.singleMode === 'maybeSingle') {
      if (rows.length > 1) return { data: null, error: compatError('JSON object requested, multiple rows returned') }
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }

  then<TResult1 = CompatResponse<T[] | T | null>, TResult2 = never>(
    onfulfilled?: ((value: CompatResponse<T[] | T | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}
