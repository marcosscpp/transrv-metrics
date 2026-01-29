/**
 * Testes do endpoint de métricas e novas tools
 * Execute com: npx tsx src/test-metrics.ts
 */

import dotenv from 'dotenv'
dotenv.config()

const MCP_BASE_URL = process.env.MCP_URL || 'http://localhost:3001'

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
}

interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
  data?: unknown
}

const results: TestResult[] = []

// Helper para testar endpoint
async function testEndpoint(
  name: string,
  url: string,
  validate?: (data: unknown) => boolean
): Promise<void> {
  const start = performance.now()
  try {
    const response = await fetch(url)
    const duration = performance.now() - start

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
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

// Calcular datas
function getDateRange(daysAgo: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysAgo)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

// ==========================================
// TESTES DO ENDPOINT /metrics
// ==========================================

async function testMetricsEndpoint() {
  log.header('TESTES DO ENDPOINT /metrics')

  const last7 = getDateRange(7)
  const last30 = getDateRange(30)
  const last90 = getDateRange(90)

  // Teste 1: Métricas sem filtros (usa padrão de 30 dias)
  await testEndpoint(
    'GET /metrics (sem filtros)',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return (
        d.period !== undefined &&
        d.summary !== undefined &&
        d.comparison !== undefined &&
        d.trends !== undefined &&
        d.distributions !== undefined &&
        d.rankings !== undefined
      )
    }
  )

  // Teste 2: Métricas com período de 7 dias
  await testEndpoint(
    'GET /metrics (7 dias)',
    `${MCP_BASE_URL}/metrics?start_date=${last7.start}&end_date=${last7.end}`,
    (data: unknown) => {
      const d = data as { period: { startDate: string; endDate: string } }
      return d.period.startDate === last7.start && d.period.endDate === last7.end
    }
  )

  // Teste 3: Métricas com período de 30 dias
  await testEndpoint(
    'GET /metrics (30 dias)',
    `${MCP_BASE_URL}/metrics?start_date=${last30.start}&end_date=${last30.end}`,
    (data: unknown) => {
      const d = data as { summary: { total: number } }
      return typeof d.summary.total === 'number'
    }
  )

  // Teste 4: Métricas com período de 90 dias
  await testEndpoint(
    'GET /metrics (90 dias)',
    `${MCP_BASE_URL}/metrics?start_date=${last90.start}&end_date=${last90.end}`
  )

  // Teste 5: Verificar estrutura do summary
  await testEndpoint(
    'Validar estrutura do summary',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as {
        summary: {
          total: number
          open: number
          closed: number
          closedWithoutSolution: number
          avgResolutionMinutes: number | null
          resolutionRate: number
          criticalOpen: number
          slaAtRisk: number
        }
      }
      const s = d.summary
      return (
        typeof s.total === 'number' &&
        typeof s.open === 'number' &&
        typeof s.closed === 'number' &&
        typeof s.closedWithoutSolution === 'number' &&
        typeof s.resolutionRate === 'number' &&
        typeof s.criticalOpen === 'number' &&
        typeof s.slaAtRisk === 'number'
      )
    }
  )

  // Teste 6: Verificar estrutura das distribuições
  await testEndpoint(
    'Validar estrutura das distributions',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as {
        distributions: {
          byStatus: unknown[]
          byGroup: unknown[]
          byAlertType: unknown[]
          byEscalation: unknown[]
          byHour: unknown[]
          byWeekday: unknown[]
          byDepartment: unknown[]
        }
      }
      const dist = d.distributions
      return (
        Array.isArray(dist.byStatus) &&
        Array.isArray(dist.byGroup) &&
        Array.isArray(dist.byAlertType) &&
        Array.isArray(dist.byEscalation) &&
        Array.isArray(dist.byHour) &&
        Array.isArray(dist.byWeekday) &&
        Array.isArray(dist.byDepartment)
      )
    }
  )

  // Teste 7: Verificar estrutura das trends
  await testEndpoint(
    'Validar estrutura das trends',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as { trends: Array<{ date: string; opened: number; closed: number }> }
      return Array.isArray(d.trends) && (d.trends.length === 0 || (
        d.trends[0].date !== undefined &&
        typeof d.trends[0].opened === 'number' &&
        typeof d.trends[0].closed === 'number'
      ))
    }
  )

  // Teste 8: Verificar estrutura dos rankings
  await testEndpoint(
    'Validar estrutura dos rankings',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as {
        rankings: {
          topEmployees: unknown[]
          fastestEmployees: unknown[]
          oldestOpenTickets: unknown[]
        }
      }
      return (
        Array.isArray(d.rankings.topEmployees) &&
        Array.isArray(d.rankings.fastestEmployees) &&
        Array.isArray(d.rankings.oldestOpenTickets)
      )
    }
  )

  // Teste 9: Verificar comparison
  await testEndpoint(
    'Validar comparação com período anterior',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as { comparison: { totalChange: number; closedChange: number } }
      return (
        typeof d.comparison.totalChange === 'number' &&
        typeof d.comparison.closedChange === 'number'
      )
    }
  )

  // Teste 10: Validar generatedAt
  await testEndpoint(
    'Validar timestamp de geração',
    `${MCP_BASE_URL}/metrics`,
    (data: unknown) => {
      const d = data as { generatedAt: string }
      return typeof d.generatedAt === 'string' && !isNaN(Date.parse(d.generatedAt))
    }
  )
}

// ==========================================
// TESTES DAS NOVAS TOOLS
// ==========================================

import { langchainTools } from './langchain-tools.js'
import { testConnection } from './database.js'

async function runTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = langchainTools.find(t => t.name === toolName)
  if (!tool) {
    throw new Error(`Ferramenta não encontrada: ${toolName}`)
  }
  const result = await tool.invoke(args)
  return JSON.parse(result)
}

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

async function testNewTools() {
  log.header('TESTES DAS NOVAS TOOLS')

  const last30 = getDateRange(30)

  // Teste: get_bottlenecks
  await testTool(
    'get_bottlenecks (padrão)',
    'get_bottlenecks',
    {},
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return (
        Array.isArray(d.overloaded_employees) &&
        Array.isArray(d.overloaded_groups) &&
        Array.isArray(d.problematic_alerts) &&
        Array.isArray(d.critical_stuck_tickets)
      )
    }
  )

  await testTool(
    'get_bottlenecks (threshold 2h)',
    'get_bottlenecks',
    { threshold_hours: 2 }
  )

  await testTool(
    'get_bottlenecks (threshold 8h)',
    'get_bottlenecks',
    { threshold_hours: 8 }
  )

  // Teste: get_ticket_patterns
  await testTool(
    'get_ticket_patterns (30 dias)',
    'get_ticket_patterns',
    { days: 30 },
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return (
        Array.isArray(d.by_hour) &&
        Array.isArray(d.by_weekday) &&
        Array.isArray(d.peak_hours) &&
        Array.isArray(d.busiest_days) &&
        Array.isArray(d.heatmap)
      )
    }
  )

  await testTool(
    'get_ticket_patterns (7 dias)',
    'get_ticket_patterns',
    { days: 7 }
  )

  await testTool(
    'get_ticket_patterns (90 dias)',
    'get_ticket_patterns',
    { days: 90 }
  )

  // Teste: get_department_metrics
  await testTool(
    'get_department_metrics (todo período)',
    'get_department_metrics',
    {},
    (data: unknown) => {
      const d = data as Record<string, unknown>
      return (
        Array.isArray(d.department_metrics) &&
        typeof d.top_employees_by_department === 'object' &&
        Array.isArray(d.inactive_departments)
      )
    }
  )

  await testTool(
    'get_department_metrics (últimos 30 dias)',
    'get_department_metrics',
    { start_date: last30.start, end_date: last30.end }
  )

  // Teste: get_chart_data (tickets_by_hour)
  await testTool(
    'get_chart_data (tickets_by_hour - bar)',
    'get_chart_data',
    { chart_type: 'bar', data_type: 'tickets_by_hour' },
    (data: unknown) => {
      const d = data as { _chart: boolean; type: string; title: string; data: unknown[] }
      return (
        d._chart === true &&
        d.type === 'bar' &&
        d.title === 'Tickets por Hora do Dia' &&
        Array.isArray(d.data)
      )
    }
  )

  await testTool(
    'get_chart_data (tickets_by_hour - line)',
    'get_chart_data',
    { chart_type: 'line', data_type: 'tickets_by_hour' }
  )
}

// ==========================================
// MAIN
// ==========================================

async function runAllTests() {
  console.log('\n')
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║       TESTES DE MÉTRICAS - TransRV MCP Server              ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  // Verificar conexão com banco
  log.header('VERIFICANDO CONEXÃO')
  const dbConnected = await testConnection()
  if (!dbConnected) {
    log.error('Não foi possível conectar ao banco de dados!')
    process.exit(1)
  }
  log.success('Conexão com banco de dados OK')

  // Verificar se servidor está rodando
  try {
    const healthResponse = await fetch(`${MCP_BASE_URL}/health`)
    if (!healthResponse.ok) {
      throw new Error('Servidor não está respondendo')
    }
    log.success(`Servidor MCP rodando em ${MCP_BASE_URL}`)
  } catch {
    log.warn(`Servidor MCP não encontrado em ${MCP_BASE_URL}`)
    log.info('Apenas testes de tools serão executados')
  }

  // Executar testes do endpoint
  try {
    await testMetricsEndpoint()
  } catch (e) {
    log.warn('Testes de endpoint ignorados - servidor não disponível')
  }

  // Executar testes das tools
  await testNewTools()

  // ==========================================
  // RESUMO
  // ==========================================
  log.header('RESUMO DOS TESTES')

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length
  const avgDuration = total > 0 ? results.reduce((acc, r) => acc + r.duration, 0) / total : 0

  console.log('')
  console.log(`  Total de testes: ${total}`)
  console.log(`  ${colors.green}Passou: ${passed}${colors.reset}`)
  console.log(`  ${colors.red}Falhou: ${failed}${colors.reset}`)
  console.log(`  Tempo médio: ${avgDuration.toFixed(0)}ms`)
  console.log('')

  if (failed > 0) {
    log.header('TESTES QUE FALHARAM')
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ${colors.red}✗ ${r.name}${colors.reset}`)
        if (r.error) {
          console.log(`    ${colors.dim}${r.error}${colors.reset}`)
        }
      })
  }

  // Mostrar exemplos de dados
  log.header('EXEMPLOS DE DADOS')

  const metricsResult = results.find(r => r.name === 'GET /metrics (sem filtros)')
  if (metricsResult?.data) {
    const d = metricsResult.data as { summary: unknown }
    console.log('\n📊 Summary das Métricas:')
    console.log(JSON.stringify(d.summary, null, 2))
  }

  const bottlenecksResult = results.find(r => r.name === 'get_bottlenecks (padrão)')
  if (bottlenecksResult?.data) {
    const d = bottlenecksResult.data as {
      critical_stuck_tickets: unknown[]
      problematic_alerts: unknown[]
    }
    if (d.critical_stuck_tickets.length > 0) {
      console.log('\n🚨 Tickets Críticos Parados:')
      console.log(JSON.stringify(d.critical_stuck_tickets.slice(0, 3), null, 2))
    }
    if (d.problematic_alerts.length > 0) {
      console.log('\n⚠️ Alertas Problemáticos:')
      console.log(JSON.stringify(d.problematic_alerts.slice(0, 3), null, 2))
    }
  }

  const patternsResult = results.find(r => r.name === 'get_ticket_patterns (30 dias)')
  if (patternsResult?.data) {
    const d = patternsResult.data as { peak_hours: unknown[] }
    console.log('\n⏰ Horários de Pico:')
    console.log(JSON.stringify(d.peak_hours, null, 2))
  }

  console.log('\n')
  process.exit(failed > 0 ? 1 : 0)
}

runAllTests().catch(error => {
  console.error('Erro fatal:', error)
  process.exit(1)
})
