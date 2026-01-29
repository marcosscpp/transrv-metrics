/**
 * Testes das ferramentas de métricas do MCP Server
 * Execute com: npx tsx src/test-tools.ts
 */

import { langchainTools } from './langchain-tools.js'
import { testConnection } from './database.js'
import dotenv from 'dotenv'

dotenv.config()

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}`),
  subheader: (msg: string) => console.log(`\n${colors.dim}--- ${msg} ---${colors.reset}`),
}

interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
  data?: unknown
}

const results: TestResult[] = []

// Helper para executar uma ferramenta
async function runTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = langchainTools.find(t => t.name === toolName)
  if (!tool) {
    throw new Error(`Ferramenta não encontrada: ${toolName}`)
  }
  const result = await tool.invoke(args)
  return JSON.parse(result)
}

// Helper para testar uma ferramenta
async function testTool(
  name: string,
  toolName: string,
  args: Record<string, unknown> = {},
  validate?: (data: unknown) => boolean
): Promise<void> {
  const start = performance.now()
  try {
    const data = await runTool(toolName, args)
    const duration = performance.now() - start

    let passed = true
    if (validate) {
      passed = validate(data)
    }

    results.push({ name, passed, duration, data })

    if (passed) {
      log.success(`${name} (${duration.toFixed(0)}ms)`)
    } else {
      log.error(`${name} - Validação falhou`)
    }
  } catch (error) {
    const duration = performance.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    results.push({ name, passed: false, duration, error: errorMsg })
    log.error(`${name} - ${errorMsg}`)
  }
}

// Calcular datas para testes
function getDateRange(daysAgo: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysAgo)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function getLastWeek(): { start: string; end: string } {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - dayOfWeek - 1)
  const lastMonday = new Date(lastSunday)
  lastMonday.setDate(lastSunday.getDate() - 6)
  return {
    start: lastMonday.toISOString().split('T')[0],
    end: lastSunday.toISOString().split('T')[0],
  }
}

function getThisWeek(): { start: string; end: string } {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return {
    start: monday.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  }
}

// ==========================================
// TESTES
// ==========================================

async function runTests() {
  console.log('\n')
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║         TESTES DAS FERRAMENTAS MCP - TransRV               ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  // Verificar conexão com banco
  log.header('VERIFICANDO CONEXÃO')
  const dbConnected = await testConnection()
  if (!dbConnected) {
    log.error('Não foi possível conectar ao banco de dados!')
    log.warn('Verifique as variáveis de ambiente no arquivo .env')
    process.exit(1)
  }
  log.success('Conexão com banco de dados estabelecida')

  // Datas para testes
  const last7Days = getDateRange(7)
  const last30Days = getDateRange(30)
  const lastWeek = getLastWeek()
  const thisWeek = getThisWeek()

  // ==========================================
  // MÉTRICAS GERAIS
  // ==========================================
  log.header('MÉTRICAS GERAIS')

  await testTool(
    'Métricas gerais de tickets',
    'get_ticket_metrics',
    {},
    (data: unknown) => {
      const d = data as Record<string, number>
      return d.total !== undefined && d.open !== undefined && d.closed !== undefined
    }
  )

  await testTool(
    'Tickets de hoje',
    'get_tickets_today',
    {},
    (data: unknown) => {
      const d = data as Record<string, number>
      return d.total_today !== undefined
    }
  )

  // ==========================================
  // MÉTRICAS COM FILTROS
  // ==========================================
  log.header('MÉTRICAS COM FILTROS COMBINADOS')

  await testTool(
    'Métricas filtradas - últimos 7 dias',
    'get_ticket_metrics_filtered',
    { start_date: last7Days.start, end_date: last7Days.end },
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return d.total !== undefined && d.avg_resolution_minutes !== undefined
    }
  )

  await testTool(
    'Métricas filtradas - últimos 30 dias',
    'get_ticket_metrics_filtered',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  await testTool(
    'Métricas filtradas - sem filtro (todos)',
    'get_ticket_metrics_filtered',
    {}
  )

  // ==========================================
  // TEMPO DE RESOLUÇÃO
  // ==========================================
  log.header('TEMPO MÉDIO DE RESOLUÇÃO')

  await testTool(
    'Tempo de resolução - geral',
    'get_resolution_time_filtered',
    {},
    (data: unknown) => {
      const d = data as Record<string, number>
      return d.avg_minutes !== undefined || d.total_resolved === 0
    }
  )

  await testTool(
    'Tempo de resolução - últimos 7 dias',
    'get_resolution_time_filtered',
    { start_date: last7Days.start, end_date: last7Days.end }
  )

  await testTool(
    'Tempo de resolução - últimos 30 dias',
    'get_resolution_time_filtered',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  // ==========================================
  // AGRUPAMENTOS POR GRUPO
  // ==========================================
  log.header('MÉTRICAS POR GRUPO')

  await testTool(
    'Métricas por grupo - geral',
    'get_metrics_by_group',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Métricas por grupo - últimos 30 dias',
    'get_metrics_by_group',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  // ==========================================
  // AGRUPAMENTOS POR TIPO DE ALERTA
  // ==========================================
  log.header('MÉTRICAS POR TIPO DE ALERTA')

  await testTool(
    'Métricas por tipo de alerta - geral',
    'get_metrics_by_alert_type',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Métricas por tipo de alerta - últimos 30 dias',
    'get_metrics_by_alert_type',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  // ==========================================
  // COMPARATIVO DE PERÍODOS
  // ==========================================
  log.header('COMPARATIVO DE PERÍODOS')

  await testTool(
    'Comparar semana atual vs semana passada',
    'compare_periods',
    {
      period1_start: lastWeek.start,
      period1_end: lastWeek.end,
      period2_start: thisWeek.start,
      period2_end: thisWeek.end,
    },
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return d.period1 !== undefined && d.period2 !== undefined && d.variation !== undefined
    }
  )

  // ==========================================
  // MÉTRICAS DIÁRIAS
  // ==========================================
  log.header('MÉTRICAS DIÁRIAS')

  await testTool(
    'Métricas diárias - últimos 7 dias',
    'get_daily_metrics',
    { days: 7 },
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Métricas diárias - últimos 30 dias',
    'get_daily_metrics',
    { days: 30 }
  )

  // ==========================================
  // PERFORMANCE DE FUNCIONÁRIOS
  // ==========================================
  log.header('PERFORMANCE DE FUNCIONÁRIOS')

  await testTool(
    'Performance de funcionários - geral',
    'get_employee_performance_filtered',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Performance de funcionários - últimos 30 dias',
    'get_employee_performance_filtered',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  // ==========================================
  // HORÁRIOS DE PICO
  // ==========================================
  log.header('HORÁRIOS DE PICO')

  await testTool(
    'Horários de pico - últimos 30 dias',
    'get_peak_hours',
    { days: 30 },
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Horários de pico por dia da semana',
    'get_peak_hours_by_weekday',
    { days: 30 }
  )

  // ==========================================
  // TICKETS POR ESCALAÇÃO
  // ==========================================
  log.header('TICKETS POR ESCALAÇÃO')

  await testTool(
    'Tickets por escalação - geral',
    'get_tickets_by_escalation',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Tickets por escalação - apenas abertos',
    'get_tickets_by_escalation',
    { only_open: true }
  )

  await testTool(
    'Tickets por escalação - últimos 30 dias',
    'get_tickets_by_escalation',
    { start_date: last30Days.start, end_date: last30Days.end }
  )

  // ==========================================
  // TICKETS RECENTES E ANTIGOS
  // ==========================================
  log.header('TICKETS RECENTES E ANTIGOS')

  await testTool(
    'Tickets mais recentes (10)',
    'get_recent_tickets',
    { limit: 10 },
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Tickets abertos há mais tempo (10)',
    'get_oldest_open_tickets',
    { limit: 10 }
  )

  // ==========================================
  // LISTAGENS AUXILIARES
  // ==========================================
  log.header('LISTAGENS AUXILIARES')

  await testTool(
    'Listar grupos',
    'list_groups',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Listar tipos de alerta',
    'list_alert_types',
    {},
    (data: unknown) => Array.isArray(data)
  )

  await testTool(
    'Listar funcionários',
    'list_employees',
    {},
    (data: unknown) => Array.isArray(data)
  )

  // ==========================================
  // RESUMO
  // ==========================================
  log.header('RESUMO DOS TESTES')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length
  const avgDuration = results.reduce((acc, r) => acc + r.duration, 0) / total

  console.log('')
  console.log(`  Total de testes: ${total}`)
  console.log(`  ${colors.green}Passou: ${passed}${colors.reset}`)
  console.log(`  ${colors.red}Falhou: ${failed}${colors.reset}`)
  console.log(`  Tempo médio: ${avgDuration.toFixed(0)}ms`)
  console.log('')

  if (failed > 0) {
    log.subheader('TESTES QUE FALHARAM')
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ${colors.red}✗ ${r.name}${colors.reset}`)
        if (r.error) {
          console.log(`    ${colors.dim}${r.error}${colors.reset}`)
        }
      })
  }

  // Mostrar algumas métricas de exemplo
  log.header('EXEMPLO DE DADOS RETORNADOS')

  const metricsResult = results.find(r => r.name === 'Métricas gerais de tickets')
  if (metricsResult?.data) {
    console.log('\n📊 Métricas Gerais:')
    console.log(JSON.stringify(metricsResult.data, null, 2))
  }

  const byGroupResult = results.find(r => r.name === 'Métricas por grupo - geral')
  if (byGroupResult?.data && Array.isArray(byGroupResult.data) && byGroupResult.data.length > 0) {
    console.log('\n📊 Top 3 Grupos (por total de tickets):')
    console.log(JSON.stringify(byGroupResult.data.slice(0, 3), null, 2))
  }

  const byAlertResult = results.find(r => r.name === 'Métricas por tipo de alerta - geral')
  if (byAlertResult?.data && Array.isArray(byAlertResult.data) && byAlertResult.data.length > 0) {
    console.log('\n📊 Top 3 Tipos de Alerta (por total):')
    console.log(JSON.stringify(byAlertResult.data.slice(0, 3), null, 2))
  }

  const compareResult = results.find(r => r.name === 'Comparar semana atual vs semana passada')
  if (compareResult?.data) {
    console.log('\n📊 Comparativo Semanal:')
    console.log(JSON.stringify(compareResult.data, null, 2))
  }

  console.log('\n')

  // Exit code baseado nos resultados
  process.exit(failed > 0 ? 1 : 0)
}

// Executar testes
runTests().catch(error => {
  console.error('Erro fatal:', error)
  process.exit(1)
})
