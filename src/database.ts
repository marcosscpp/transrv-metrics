import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'transrv',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bREPLACE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bRENAME\b/i,
  /\bMODIFY\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bCALL\b/i,
]

function isSafeQuery(query: string): boolean {
  const normalizedQuery = query.trim()

  const allowedStarts = [/^\s*SELECT\b/i, /^\s*SHOW\b/i, /^\s*DESCRIBE\b/i, /^\s*DESC\b/i, /^\s*EXPLAIN\b/i]
  const startsWithAllowed = allowedStarts.some(pattern => pattern.test(normalizedQuery))

  if (!startsWithAllowed) {
    return false
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return false
    }
  }

  return true
}

export async function executeReadOnlyQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!isSafeQuery(query)) {
    throw new Error('OPERAÇÃO NÃO PERMITIDA: Apenas consultas de leitura (SELECT) são permitidas.')
  }

  const startTime = performance.now()

  console.log('\n┌─────────────────────────────────────────────────────────')
  console.log('│ 🔍 SQL QUERY')
  console.log('├─────────────────────────────────────────────────────────')
  console.log('│', query.replace(/\s+/g, ' ').trim())
  if (params.length > 0) {
    console.log('│ 📌 Params:', JSON.stringify(params))
  }

  const [rows] = await pool.execute(query, params)

  const endTime = performance.now()
  const duration = (endTime - startTime).toFixed(2)

  console.log('│ ✅ Rows:', Array.isArray(rows) ? rows.length : 0, `| ⏱️ ${duration}ms`)
  console.log('└─────────────────────────────────────────────────────────\n')

  return rows as T[]
}

export async function testConnection(): Promise<boolean> {
  try {
    await pool.execute('SELECT 1')
    return true
  } catch (error) {
    console.error('Erro ao conectar ao banco:', error)
    return false
  }
}

export { pool }
