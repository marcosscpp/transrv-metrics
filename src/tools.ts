import { executeReadOnlyQuery } from './database.js'

// Tipos para as respostas
interface TicketMetrics {
  total: number
  open: number
  closed: number
  closed_without_solution: number
}

interface TicketsByGroup {
  group_name: string
  total: number
  open: number
  closed: number
}

interface TicketsByAlert {
  alert_name: string
  alert_code: string
  total: number
}

interface TicketsByEscalation {
  escalation_level: number
  total: number
}

interface RecentTicket {
  id: number
  group_name: string
  alert_name: string
  status: string
  escalation_level: number
  created_at: Date
  closed_at: Date | null
}

interface EmployeePerformance {
  employee_name: string
  department_name: string
  tickets_closed: number
}

interface DailyTickets {
  date: string
  opened: number
  closed: number
}

// ===== FERRAMENTAS DE CONSULTA (APENAS LEITURA) =====

export const tools = {
  // Métricas gerais de tickets
  async getTicketMetrics(): Promise<TicketMetrics> {
    const [result] = await executeReadOnlyQuery<TicketMetrics>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as closed_without_solution
      FROM ticket
    `)
    return result
  },

  // Métricas de tickets por período
  async getTicketMetricsByPeriod(startDate: string, endDate: string): Promise<TicketMetrics> {
    const [result] = await executeReadOnlyQuery<TicketMetrics>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as closed_without_solution
      FROM ticket
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [startDate, endDate])
    return result
  },

  // Tickets por grupo
  async getTicketsByGroup(): Promise<TicketsByGroup[]> {
    return executeReadOnlyQuery<TicketsByGroup>(`
      SELECT
        wg.group_name,
        COUNT(*) as total,
        SUM(CASE WHEN t.status = 0 THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) as closed
      FROM ticket t
      JOIN wa_group wg ON t.wa_group_id = wg.id
      GROUP BY wg.id, wg.group_name
      ORDER BY total DESC
    `)
  },

  // Tickets por tipo de alerta
  async getTicketsByAlertType(): Promise<TicketsByAlert[]> {
    return executeReadOnlyQuery<TicketsByAlert>(`
      SELECT
        at.name as alert_name,
        at.code as alert_code,
        COUNT(*) as total
      FROM ticket t
      JOIN alert_term at ON t.alert_term_id = at.id
      GROUP BY at.id, at.name, at.code
      ORDER BY total DESC
    `)
  },

  // Tickets por nível de escalação
  async getTicketsByEscalationLevel(): Promise<TicketsByEscalation[]> {
    return executeReadOnlyQuery<TicketsByEscalation>(`
      SELECT
        current_escalation_level as escalation_level,
        COUNT(*) as total
      FROM ticket
      WHERE status = 0
      GROUP BY current_escalation_level
      ORDER BY current_escalation_level
    `)
  },

  // Tickets recentes
  async getRecentTickets(limit: number = 10): Promise<RecentTicket[]> {
    return executeReadOnlyQuery<RecentTicket>(`
      SELECT
        t.id,
        wg.group_name,
        at.name as alert_name,
        CASE t.status
          WHEN 0 THEN 'OPEN'
          WHEN 1 THEN 'CLOSED'
          WHEN 2 THEN 'CLOSED_WITHOUT_SOLUTION'
        END as status,
        t.current_escalation_level as escalation_level,
        t.created_at,
        t.closed_at
      FROM ticket t
      JOIN wa_group wg ON t.wa_group_id = wg.id
      JOIN alert_term at ON t.alert_term_id = at.id
      ORDER BY t.created_at DESC
      LIMIT ?
    `, [limit])
  },

  // Tickets abertos há mais tempo (críticos)
  async getOldestOpenTickets(limit: number = 10): Promise<RecentTicket[]> {
    return executeReadOnlyQuery<RecentTicket>(`
      SELECT
        t.id,
        wg.group_name,
        at.name as alert_name,
        'OPEN' as status,
        t.current_escalation_level as escalation_level,
        t.created_at,
        t.closed_at
      FROM ticket t
      JOIN wa_group wg ON t.wa_group_id = wg.id
      JOIN alert_term at ON t.alert_term_id = at.id
      WHERE t.status = 0
      ORDER BY t.created_at ASC
      LIMIT ?
    `, [limit])
  },

  // Performance dos funcionários
  async getEmployeePerformance(): Promise<EmployeePerformance[]> {
    return executeReadOnlyQuery<EmployeePerformance>(`
      SELECT
        e.name as employee_name,
        COALESCE(d.name, 'Sem Departamento') as department_name,
        COUNT(t.id) as tickets_closed
      FROM employee e
      LEFT JOIN department d ON e.department_id = d.id
      LEFT JOIN ticket t ON t.employee_close_id = e.id
      WHERE e.is_active = 1
      GROUP BY e.id, e.name, d.name
      ORDER BY tickets_closed DESC
    `)
  },

  // Tickets por dia (últimos N dias)
  async getDailyTickets(days: number = 30): Promise<DailyTickets[]> {
    return executeReadOnlyQuery<DailyTickets>(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as opened,
        SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END) as closed
      FROM ticket
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [days])
  },

  // Tempo médio de resolução
  async getAverageResolutionTime(): Promise<{ avg_hours: number }> {
    const [result] = await executeReadOnlyQuery<{ avg_hours: number }>(`
      SELECT
        AVG(TIMESTAMPDIFF(HOUR, created_at, closed_at)) as avg_hours
      FROM ticket
      WHERE status = 1 AND closed_at IS NOT NULL
    `)
    return result
  },

  // Grupos monitorados
  async getMonitoredGroups(): Promise<{ group_name: string; is_monitored: boolean; agent_name: string | null }[]> {
    return executeReadOnlyQuery(`
      SELECT
        wg.group_name,
        wg.is_monitored,
        a.name as agent_name
      FROM wa_group wg
      LEFT JOIN agent a ON wg.agent_id = a.id
      ORDER BY wg.group_name
    `)
  },

  // Alertas ativos
  async getActiveAlerts(): Promise<{ id: number; code: string; name: string; description: string }[]> {
    return executeReadOnlyQuery(`
      SELECT id, code, name, description
      FROM alert_term
      WHERE status = 'ACTIVE'
      ORDER BY name
    `)
  },

  // Contagem de funcionários por departamento
  async getEmployeesByDepartment(): Promise<{ department_name: string; total: number; active: number }[]> {
    return executeReadOnlyQuery(`
      SELECT
        COALESCE(d.name, 'Sem Departamento') as department_name,
        COUNT(*) as total,
        SUM(CASE WHEN e.is_active = 1 THEN 1 ELSE 0 END) as active
      FROM employee e
      LEFT JOIN department d ON e.department_id = d.id
      GROUP BY d.id, d.name
      ORDER BY total DESC
    `)
  },

  // Tickets abertos por hora do dia (para identificar picos)
  async getTicketsByHour(): Promise<{ hour: number; total: number }[]> {
    return executeReadOnlyQuery(`
      SELECT
        HOUR(created_at) as hour,
        COUNT(*) as total
      FROM ticket
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `)
  },

  // Notificações enviadas por nível
  async getNotificationsByLevel(): Promise<{ escalation_level: number; total: number }[]> {
    return executeReadOnlyQuery(`
      SELECT
        escalation_level,
        COUNT(*) as total
      FROM ticket_notification
      GROUP BY escalation_level
      ORDER BY escalation_level
    `)
  },
}

// Definição das ferramentas para o Claude
export const toolDefinitions = [
  {
    name: 'get_ticket_metrics',
    description: 'Obtém métricas gerais de tickets: total, abertos, fechados e fechados sem solução',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ticket_metrics_by_period',
    description: 'Obtém métricas de tickets filtradas por período',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_tickets_by_group',
    description: 'Obtém quantidade de tickets agrupados por grupo de WhatsApp',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tickets_by_alert_type',
    description: 'Obtém quantidade de tickets agrupados por tipo de alerta',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tickets_by_escalation_level',
    description: 'Obtém quantidade de tickets abertos por nível de escalação (1, 2 ou 3)',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_recent_tickets',
    description: 'Obtém os tickets mais recentes',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Quantidade de tickets (padrão: 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_oldest_open_tickets',
    description: 'Obtém os tickets abertos há mais tempo (críticos)',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Quantidade de tickets (padrão: 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_employee_performance',
    description: 'Obtém performance dos funcionários por quantidade de tickets fechados',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_daily_tickets',
    description: 'Obtém quantidade de tickets abertos e fechados por dia',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Quantidade de dias para analisar (padrão: 30)' },
      },
      required: [],
    },
  },
  {
    name: 'get_average_resolution_time',
    description: 'Obtém tempo médio de resolução de tickets em horas',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_monitored_groups',
    description: 'Obtém lista de grupos de WhatsApp e seu status de monitoramento',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_active_alerts',
    description: 'Obtém lista de tipos de alerta ativos no sistema',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_employees_by_department',
    description: 'Obtém contagem de funcionários por departamento',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_tickets_by_hour',
    description: 'Obtém distribuição de tickets por hora do dia (últimos 30 dias)',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_notifications_by_level',
    description: 'Obtém quantidade de notificações enviadas por nível de escalação',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

// Executor de ferramentas
export async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_ticket_metrics':
      return tools.getTicketMetrics()
    case 'get_ticket_metrics_by_period':
      return tools.getTicketMetricsByPeriod(input.start_date as string, input.end_date as string)
    case 'get_tickets_by_group':
      return tools.getTicketsByGroup()
    case 'get_tickets_by_alert_type':
      return tools.getTicketsByAlertType()
    case 'get_tickets_by_escalation_level':
      return tools.getTicketsByEscalationLevel()
    case 'get_recent_tickets':
      return tools.getRecentTickets(input.limit as number)
    case 'get_oldest_open_tickets':
      return tools.getOldestOpenTickets(input.limit as number)
    case 'get_employee_performance':
      return tools.getEmployeePerformance()
    case 'get_daily_tickets':
      return tools.getDailyTickets(input.days as number)
    case 'get_average_resolution_time':
      return tools.getAverageResolutionTime()
    case 'get_monitored_groups':
      return tools.getMonitoredGroups()
    case 'get_active_alerts':
      return tools.getActiveAlerts()
    case 'get_employees_by_department':
      return tools.getEmployeesByDepartment()
    case 'get_tickets_by_hour':
      return tools.getTicketsByHour()
    case 'get_notifications_by_level':
      return tools.getNotificationsByLevel()
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`)
  }
}
