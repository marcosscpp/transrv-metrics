import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { executeReadOnlyQuery } from './database.js'

/**
 * Ferramentas LangChain para consulta de dados de tickets
 * TODAS as queries são READ-ONLY (apenas SELECT)
 *
 * Convenções de status:
 * - 0 = Aberto
 * - 1 = Fechado (resolvido)
 * - 2 = Fechado sem solução
 */

export const langchainTools = [

  // ============================================================
  // MÉTRICAS GERAIS
  // ============================================================

  /**
   * Retorna contagem total de tickets por status
   * Query simples sem filtros para visão geral rápida
   */
  new DynamicStructuredTool({
    name: 'get_ticket_metrics',
    description: 'Métricas gerais de tickets: total, abertos, fechados e sem solução.',
    schema: z.object({}),
    func: async () => {
      // Conta tickets agrupando por status usando CASE WHEN
      const [result] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as closed_without_solution
        FROM ticket
      `)
      return JSON.stringify(result)
    },
  }),

  /**
   * Métricas específicas do dia atual
   * Usa CURDATE() para filtrar apenas tickets criados hoje
   */
  new DynamicStructuredTool({
    name: 'get_tickets_today',
    description: 'Estatísticas de tickets do dia de hoje.',
    schema: z.object({}),
    func: async () => {
      // DATE(created_at) = CURDATE() compara apenas a parte da data
      const [result] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total_today,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open_today,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed_today,
          SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as closed_without_solution_today
        FROM ticket
        WHERE DATE(created_at) = CURDATE()
      `)
      return JSON.stringify(result)
    },
  }),

  /**
   * Ferramenta principal para métricas com filtros flexíveis
   * Permite combinar filtros de período, grupo e tipo de alerta
   * Inclui tempo médio de resolução calculado com TIMESTAMPDIFF
   */
  new DynamicStructuredTool({
    name: 'get_ticket_metrics_filtered',
    description: 'Métricas de tickets com filtros por período, grupo e tipo de alerta. Inclui tempo médio de resolução.',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('Data final (YYYY-MM-DD)'),
      group_name: z.string().optional().describe('Nome do grupo de WhatsApp'),
      alert_type: z.string().optional().describe('Código ou nome do tipo de alerta'),
    }),
    func: async ({ start_date, end_date, group_name, alert_type }) => {
      // Monta condições dinamicamente baseado nos filtros fornecidos
      const conditions: string[] = []
      const params: unknown[] = []

      if (start_date && end_date) {
        // BETWEEN inclui início e fim, adiciona hora final para pegar o dia inteiro
        conditions.push('t.created_at BETWEEN ? AND ?')
        params.push(start_date, end_date + ' 23:59:59')
      }

      if (group_name) {
        // LIKE com % permite busca parcial do nome
        conditions.push('wg.group_name LIKE ?')
        params.push(`%${group_name}%`)
      }

      if (alert_type) {
        // Busca tanto no código quanto no nome do alerta
        conditions.push('(at.code LIKE ? OR at.name LIKE ?)')
        params.push(`%${alert_type}%`, `%${alert_type}%`)
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // TIMESTAMPDIFF calcula diferença entre datas em minutos/horas
      // AVG só considera tickets fechados (status=1) com closed_at preenchido
      const [result] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN t.status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN t.status = 2 THEN 1 ELSE 0 END) as closed_without_solution,
          ROUND(AVG(CASE WHEN t.status = 1 AND t.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at) END), 2) as avg_resolution_minutes
        FROM ticket t
        LEFT JOIN wa_group wg ON t.wa_group_id = wg.id
        LEFT JOIN alert_term at ON t.alert_term_id = at.id
        ${whereClause}
      `, params)

      return JSON.stringify({ ...(result as Record<string, any>), filters_applied: { start_date, end_date, group_name, alert_type } })
    },
  }),

  // ============================================================
  // AGRUPAMENTOS
  // ============================================================

  /**
   * Métricas agrupadas por grupo de WhatsApp
   * GROUP BY agrupa resultados por grupo, ORDER BY ordena por total
   */
  new DynamicStructuredTool({
    name: 'get_metrics_by_group',
    description: 'Métricas agrupadas por grupo de WhatsApp com tempo médio de resolução.',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('Data final (YYYY-MM-DD)'),
    }),
    func: async ({ start_date, end_date }) => {
      const conditions: string[] = []
      const params: unknown[] = []

      if (start_date && end_date) {
        conditions.push('t.created_at BETWEEN ? AND ?')
        params.push(start_date, end_date + ' 23:59:59')
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // JOIN com wa_group para obter nome do grupo
      // GROUP BY agrupa as métricas por grupo
      const result = await executeReadOnlyQuery(`
        SELECT
          wg.group_name,
          COUNT(*) as total,
          SUM(CASE WHEN t.status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) as closed,
          ROUND(AVG(CASE WHEN t.status = 1 AND t.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at) END), 2) as avg_resolution_minutes
        FROM ticket t
        JOIN wa_group wg ON t.wa_group_id = wg.id
        ${whereClause}
        GROUP BY wg.id, wg.group_name
        ORDER BY total DESC
      `, params)

      return JSON.stringify(result)
    },
  }),

  /**
   * Métricas agrupadas por tipo de alerta
   * Permite identificar quais tipos de alerta são mais frequentes
   */
  new DynamicStructuredTool({
    name: 'get_metrics_by_alert_type',
    description: 'Métricas agrupadas por tipo de alerta.',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('Data final (YYYY-MM-DD)'),
    }),
    func: async ({ start_date, end_date }) => {
      const conditions: string[] = []
      const params: unknown[] = []

      if (start_date && end_date) {
        conditions.push('t.created_at BETWEEN ? AND ?')
        params.push(start_date, end_date + ' 23:59:59')
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // JOIN com alert_term para obter nome e código do alerta
      const result = await executeReadOnlyQuery(`
        SELECT
          at.name as alert_name,
          at.code as alert_code,
          COUNT(*) as total,
          SUM(CASE WHEN t.status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) as closed,
          ROUND(AVG(CASE WHEN t.status = 1 AND t.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at) END), 2) as avg_resolution_minutes
        FROM ticket t
        JOIN alert_term at ON t.alert_term_id = at.id
        ${whereClause}
        GROUP BY at.id, at.name, at.code
        ORDER BY total DESC
      `, params)

      return JSON.stringify(result)
    },
  }),

  /**
   * Tickets agrupados por nível de escalação
   * Níveis: 1=Normal, 2=Atenção, 3=Crítico
   */
  new DynamicStructuredTool({
    name: 'get_tickets_by_escalation',
    description: 'Tickets agrupados por nível de escalação (1=Normal, 2=Atenção, 3=Crítico).',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('Data final (YYYY-MM-DD)'),
      only_open: z.boolean().optional().default(false).describe('Mostrar apenas abertos'),
    }),
    func: async ({ start_date, end_date, only_open }) => {
      const conditions: string[] = []
      const params: unknown[] = []

      if (start_date && end_date) {
        conditions.push('created_at BETWEEN ? AND ?')
        params.push(start_date, end_date + ' 23:59:59')
      }

      if (only_open) {
        conditions.push('status = 0')
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // CASE transforma o número do nível em texto legível
      const result = await executeReadOnlyQuery(`
        SELECT
          current_escalation_level as level,
          CASE current_escalation_level
            WHEN 1 THEN 'Normal'
            WHEN 2 THEN 'Atenção'
            WHEN 3 THEN 'Crítico'
          END as level_name,
          COUNT(*) as total,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed
        FROM ticket
        ${whereClause}
        GROUP BY current_escalation_level
        ORDER BY current_escalation_level
      `, params)

      return JSON.stringify(result)
    },
  }),

  // ============================================================
  // ANÁLISE TEMPORAL
  // ============================================================

  /**
   * Compara métricas entre dois períodos
   * Útil para análise de tendências (semana vs semana, mês vs mês)
   */
  new DynamicStructuredTool({
    name: 'compare_periods',
    description: 'Compara métricas entre dois períodos diferentes.',
    schema: z.object({
      period1_start: z.string().describe('Início do período 1 (YYYY-MM-DD)'),
      period1_end: z.string().describe('Fim do período 1 (YYYY-MM-DD)'),
      period2_start: z.string().describe('Início do período 2 (YYYY-MM-DD)'),
      period2_end: z.string().describe('Fim do período 2 (YYYY-MM-DD)'),
    }),
    func: async ({ period1_start, period1_end, period2_start, period2_end }) => {
      // Executa a mesma query para cada período
      const [period1] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
          ROUND(AVG(CASE WHEN status = 1 AND closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, closed_at) END), 2) as avg_resolution_minutes
        FROM ticket
        WHERE created_at BETWEEN ? AND ?
      `, [period1_start, period1_end + ' 23:59:59'])

      const [period2] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as closed,
          ROUND(AVG(CASE WHEN status = 1 AND closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, closed_at) END), 2) as avg_resolution_minutes
        FROM ticket
        WHERE created_at BETWEEN ? AND ?
      `, [period2_start, period2_end + ' 23:59:59'])

      const p1 = period1 as Record<string, number>
      const p2 = period2 as Record<string, number>

      // Calcula variação percentual entre os períodos
      const calcVariation = (v1: number, v2: number) => {
        if (v1 === 0) return v2 > 0 ? 100 : 0
        return Math.round(((v2 - v1) / v1) * 100)
      }

      return JSON.stringify({
        period1: { range: `${period1_start} a ${period1_end}`, ...(period1 as Record<string, any>) },
        period2: { range: `${period2_start} a ${period2_end}`, ...(period2 as Record<string, any>) },
        variation: {
          total_percent: calcVariation(p1.total, p2.total),
          closed_percent: calcVariation(p1.closed, p2.closed),
        }
      })
    },
  }),

  /**
   * Métricas dia a dia para análise de tendências
   * DATE() extrai apenas a parte da data para agrupar
   */
  new DynamicStructuredTool({
    name: 'get_daily_metrics',
    description: 'Métricas por dia para análise de tendências.',
    schema: z.object({
      days: z.number().optional().default(30).describe('Quantidade de dias'),
    }),
    func: async ({ days }) => {
      // DATE_SUB subtrai N dias da data atual
      const result = await executeReadOnlyQuery(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_opened,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as total_closed,
          ROUND(AVG(CASE WHEN status = 1 AND closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, closed_at) END), 2) as avg_resolution_minutes
        FROM ticket
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [days])

      return JSON.stringify(result)
    },
  }),

  /**
   * Distribuição de tickets por hora do dia
   * HOUR() extrai a hora de um datetime
   */
  new DynamicStructuredTool({
    name: 'get_peak_hours',
    description: 'Distribuição de tickets por hora do dia (formato texto/tabela).',
    schema: z.object({
      days: z.number().optional().default(30).describe('Dias para analisar'),
    }),
    func: async ({ days }) => {
      // HOUR() retorna 0-23, window function calcula percentual
      const result = await executeReadOnlyQuery(`
        SELECT
          HOUR(created_at) as hour,
          COUNT(*) as total,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
        FROM ticket
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY HOUR(created_at)
        ORDER BY hour
      `, [days])

      return JSON.stringify(result)
    },
  }),

  // ============================================================
  // TICKETS ESPECÍFICOS
  // ============================================================

  /**
   * Lista os tickets mais recentes
   * ORDER BY DESC traz os mais novos primeiro
   */
  new DynamicStructuredTool({
    name: 'get_recent_tickets',
    description: 'Lista os tickets mais recentes.',
    schema: z.object({
      limit: z.number().optional().default(10).describe('Quantidade'),
    }),
    func: async ({ limit }) => {
      // JOINs para trazer nomes do grupo e tipo de alerta
      const result = await executeReadOnlyQuery(`
        SELECT
          t.id,
          wg.group_name,
          at.name as alert_name,
          CASE t.status WHEN 0 THEN 'Aberto' WHEN 1 THEN 'Fechado' WHEN 2 THEN 'Sem Solução' END as status,
          t.current_escalation_level,
          t.created_at
        FROM ticket t
        JOIN wa_group wg ON t.wa_group_id = wg.id
        JOIN alert_term at ON t.alert_term_id = at.id
        ORDER BY t.created_at DESC
        LIMIT ${Number(limit)}
      `)
      return JSON.stringify(result)
    },
  }),

  /**
   * Tickets abertos há mais tempo (precisam de atenção)
   * ORDER BY ASC com status=0 mostra os mais antigos abertos
   */
  new DynamicStructuredTool({
    name: 'get_oldest_open_tickets',
    description: 'Tickets abertos há mais tempo.',
    schema: z.object({
      limit: z.number().optional().default(10).describe('Quantidade'),
    }),
    func: async ({ limit }) => {
      // TIMESTAMPDIFF calcula há quanto tempo está aberto
      const result = await executeReadOnlyQuery(`
        SELECT
          t.id,
          wg.group_name,
          at.name as alert_name,
          t.current_escalation_level,
          t.created_at,
          TIMESTAMPDIFF(HOUR, t.created_at, NOW()) as hours_open
        FROM ticket t
        JOIN wa_group wg ON t.wa_group_id = wg.id
        JOIN alert_term at ON t.alert_term_id = at.id
        WHERE t.status = 0
        ORDER BY t.created_at ASC
        LIMIT ${Number(limit)}
      `)
      return JSON.stringify(result)
    },
  }),

  // ============================================================
  // LISTAGENS AUXILIARES
  // ============================================================

  /**
   * Lista grupos disponíveis com contagem de tickets
   */
  new DynamicStructuredTool({
    name: 'list_groups',
    description: 'Lista grupos de WhatsApp disponíveis.',
    schema: z.object({}),
    func: async () => {
      // LEFT JOIN para incluir grupos sem tickets
      const result = await executeReadOnlyQuery(`
        SELECT wg.group_name, COUNT(t.id) as total_tickets
        FROM wa_group wg
        LEFT JOIN ticket t ON t.wa_group_id = wg.id
        GROUP BY wg.id, wg.group_name
        ORDER BY total_tickets DESC
      `)
      return JSON.stringify(result)
    },
  }),

  /**
   * Lista tipos de alerta ativos com contagem
   */
  new DynamicStructuredTool({
    name: 'list_alert_types',
    description: 'Lista tipos de alerta disponíveis.',
    schema: z.object({}),
    func: async () => {
      const result = await executeReadOnlyQuery(`
        SELECT at.code, at.name, COUNT(t.id) as total_tickets
        FROM alert_term at
        LEFT JOIN ticket t ON t.alert_term_id = at.id
        WHERE at.status = 'ACTIVE'
        GROUP BY at.id, at.code, at.name
        ORDER BY total_tickets DESC
      `)
      return JSON.stringify(result)
    },
  }),

  /**
   * Lista funcionários ativos com tickets fechados
   */
  new DynamicStructuredTool({
    name: 'list_employees',
    description: 'Lista funcionários ativos.',
    schema: z.object({}),
    func: async () => {
      // COALESCE retorna 'Sem Departamento' se d.name for NULL
      const result = await executeReadOnlyQuery(`
        SELECT
          e.name,
          COALESCE(d.name, 'Sem Departamento') as department,
          COUNT(t.id) as tickets_closed
        FROM employee e
        LEFT JOIN department d ON e.department_id = d.id
        LEFT JOIN ticket t ON t.employee_close_id = e.id AND t.status = 1
        WHERE e.is_active = 1
        GROUP BY e.id, e.name, d.name
        ORDER BY e.name
      `)
      return JSON.stringify(result)
    },
  }),

  // ============================================================
  // ANÁLISE DE FUNCIONÁRIOS
  // ============================================================

  /**
   * Detalhes completos de um funcionário específico
   * Múltiplas queries para obter informações detalhadas
   */
  new DynamicStructuredTool({
    name: 'get_employee_details',
    description: 'Detalhes completos de um funcionário específico.',
    schema: z.object({
      employee_name: z.string().describe('Nome do funcionário'),
      start_date: z.string().optional().describe('Data inicial'),
      end_date: z.string().optional().describe('Data final'),
    }),
    func: async ({ employee_name, start_date, end_date }) => {
      const dateCondition = start_date && end_date
        ? `AND t.closed_at BETWEEN '${start_date}' AND '${end_date} 23:59:59'`
        : ''

      // Busca funcionário pelo nome (busca parcial com LIKE)
      const [employee] = await executeReadOnlyQuery(`
        SELECT e.id, e.name, COALESCE(d.name, 'Sem Departamento') as department
        FROM employee e
        LEFT JOIN department d ON e.department_id = d.id
        WHERE e.name LIKE ?
        LIMIT 1
      `, [`%${employee_name}%`])

      if (!employee) return JSON.stringify({ error: 'Funcionário não encontrado' })

      const emp = employee as { id: number; name: string }

      // Métricas de resolução
      const [metrics] = await executeReadOnlyQuery(`
        SELECT
          COUNT(*) as total_closed,
          ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 2) as avg_resolution_minutes,
          ROUND(MIN(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 2) as fastest_minutes,
          ROUND(MAX(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 2) as slowest_minutes
        FROM ticket t
        WHERE t.employee_close_id = ? AND t.status = 1 ${dateCondition}
      `, [emp.id])

      return JSON.stringify({ employee, metrics })
    },
  }),

  /**
   * Ranking de funcionários por desempenho
   * Pode ordenar por quantidade ou velocidade
   */
  new DynamicStructuredTool({
    name: 'get_employee_ranking',
    description: 'Ranking de funcionários por desempenho. Sem datas = todo o período.',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (opcional)'),
      end_date: z.string().optional().describe('Data final (opcional)'),
      order_by: z.enum(['tickets', 'speed']).optional().default('tickets').describe('Ordenar por tickets ou speed'),
      limit: z.number().optional().default(10).describe('Quantidade'),
    }),
    func: async ({ start_date, end_date, order_by, limit }) => {
      const dateCondition = start_date && end_date
        ? `AND t.closed_at BETWEEN '${start_date}' AND '${end_date} 23:59:59'`
        : ''

      // ASC para speed (menor é melhor), DESC para tickets (maior é melhor)
      const orderClause = order_by === 'speed'
        ? 'ORDER BY avg_resolution_minutes ASC'
        : 'ORDER BY tickets_closed DESC'

      // INNER JOIN garante que só aparecem funcionários com tickets fechados
      const result = await executeReadOnlyQuery(`
        SELECT
          e.name as employee_name,
          COALESCE(d.name, 'Sem Departamento') as department,
          COUNT(t.id) as tickets_closed,
          ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 2) as avg_resolution_minutes
        FROM employee e
        LEFT JOIN department d ON e.department_id = d.id
        INNER JOIN ticket t ON t.employee_close_id = e.id
        WHERE e.is_active = 1 AND t.status = 1 AND t.closed_at IS NOT NULL ${dateCondition}
        GROUP BY e.id, e.name, d.name
        HAVING tickets_closed > 0
        ${orderClause}
        LIMIT ${Number(limit)}
      `)

      return JSON.stringify({
        ranking: result,
        ordered_by: order_by === 'speed' ? 'Mais rápidos' : 'Mais tickets fechados',
        period: start_date && end_date ? { start_date, end_date } : 'todo o período'
      })
    },
  }),

  // ============================================================
  // GRÁFICOS
  // ============================================================

  /**
   * Gera dados estruturados para visualização em gráfico
   * O frontend detecta o JSON e renderiza automaticamente
   */
  new DynamicStructuredTool({
    name: 'get_chart_data',
    description: `OBRIGATÓRIO para gráficos! Gera dados para visualização gráfica.
    Use quando o usuário pedir "gráfico", "chart" ou "visualização".
    Inclua o JSON retornado em um bloco \`\`\`chart na resposta.`,
    schema: z.object({
      chart_type: z.enum(['bar', 'line', 'pie', 'area']).describe('Tipo de gráfico'),
      data_type: z.enum([
        'tickets_by_group',
        'tickets_by_alert',
        'tickets_by_status',
        'tickets_by_hour',
        'tickets_by_day',
        'employee_ranking'
      ]).describe('Tipo de dados'),
      limit: z.number().optional().default(10).describe('Limite de itens'),
    }),
    func: async ({ chart_type, data_type, limit }) => {
      let data: unknown[] = []
      let title = ''

      switch (data_type) {
        case 'tickets_by_group':
          title = 'Tickets por Grupo'
          data = await executeReadOnlyQuery(`
            SELECT wg.group_name as name, COUNT(*) as value
            FROM ticket t
            JOIN wa_group wg ON t.wa_group_id = wg.id
            GROUP BY wg.id, wg.group_name
            ORDER BY value DESC
            LIMIT ${Number(limit)}
          `)
          break

        case 'tickets_by_alert':
          title = 'Tickets por Tipo de Alerta'
          data = await executeReadOnlyQuery(`
            SELECT at.name as name, COUNT(*) as value
            FROM ticket t
            JOIN alert_term at ON t.alert_term_id = at.id
            GROUP BY at.id, at.name
            ORDER BY value DESC
            LIMIT ${Number(limit)}
          `)
          break

        case 'tickets_by_status':
          title = 'Tickets por Status'
          data = await executeReadOnlyQuery(`
            SELECT
              CASE status WHEN 0 THEN 'Aberto' WHEN 1 THEN 'Fechado' WHEN 2 THEN 'Sem Solução' END as name,
              COUNT(*) as value
            FROM ticket
            GROUP BY status
            ORDER BY value DESC
          `)
          break

        case 'tickets_by_hour':
          title = 'Tickets por Hora do Dia'
          data = await executeReadOnlyQuery(`
            SELECT CONCAT(hour_num, 'h') as name, total as value
            FROM (
              SELECT HOUR(created_at) as hour_num, COUNT(*) as total
              FROM ticket
              WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
              GROUP BY HOUR(created_at)
            ) as hourly
            ORDER BY hour_num
          `)
          break

        case 'tickets_by_day':
          title = 'Tickets por Dia'
          data = await executeReadOnlyQuery(`
            SELECT DATE_FORMAT(created_at, '%d/%m') as name, COUNT(*) as value
            FROM ticket
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
          `)
          break

        case 'employee_ranking':
          title = 'Ranking de Funcionários'
          data = await executeReadOnlyQuery(`
            SELECT e.name as name, COUNT(t.id) as value
            FROM employee e
            INNER JOIN ticket t ON t.employee_close_id = e.id
            WHERE t.status = 1 AND e.is_active = 1
            GROUP BY e.id, e.name
            ORDER BY value DESC
            LIMIT ${Number(limit)}
          `)
          break
      }

      // Formato especial que o frontend detecta para renderizar gráfico
      return JSON.stringify({
        _chart: true,
        type: chart_type,
        title,
        data
      })
    },
  }),

  // ============================================================
  // ANÁLISES AVANÇADAS
  // ============================================================

  /**
   * Identifica gargalos no sistema
   * Funcionários/grupos sobrecarregados ou com performance abaixo do esperado
   */
  new DynamicStructuredTool({
    name: 'get_bottlenecks',
    description: 'Identifica gargalos: funcionários/grupos sobrecarregados, tickets parados há muito tempo, e alertas com baixa taxa de resolução.',
    schema: z.object({
      threshold_hours: z.number().optional().default(4).describe('Horas para considerar ticket "parado"'),
    }),
    func: async ({ threshold_hours }) => {
      // Funcionários com muitos tickets abertos atribuídos
      const overloadedEmployees = await executeReadOnlyQuery(`
        SELECT
          e.name as employee_name,
          COUNT(t.id) as open_tickets,
          MIN(TIMESTAMPDIFF(HOUR, t.created_at, NOW())) as oldest_hours
        FROM employee e
        INNER JOIN ticket t ON t.employee_open_id = e.id OR t.employee_close_id = e.id
        WHERE t.status = 0 AND e.is_active = 1
        GROUP BY e.id, e.name
        HAVING open_tickets >= 5
        ORDER BY open_tickets DESC
        LIMIT 10
      `)

      // Grupos com mais tickets parados
      const overloadedGroups = await executeReadOnlyQuery(`
        SELECT
          wg.group_name,
          COUNT(*) as open_tickets,
          SUM(CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, NOW()) > ${threshold_hours} THEN 1 ELSE 0 END) as stuck_tickets,
          MAX(TIMESTAMPDIFF(HOUR, t.created_at, NOW())) as oldest_hours
        FROM ticket t
        JOIN wa_group wg ON t.wa_group_id = wg.id
        WHERE t.status = 0
        GROUP BY wg.id, wg.group_name
        HAVING open_tickets >= 3
        ORDER BY stuck_tickets DESC, oldest_hours DESC
        LIMIT 10
      `)

      // Tipos de alerta com baixa taxa de resolução
      const problematicAlerts = await executeReadOnlyQuery(`
        SELECT
          at.name as alert_name,
          at.code as alert_code,
          COUNT(*) as total,
          SUM(CASE WHEN t.status = 0 THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) as closed,
          ROUND(SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as resolution_rate,
          ROUND(AVG(CASE WHEN t.status = 1 AND t.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at) END), 0) as avg_resolution_minutes
        FROM ticket t
        JOIN alert_term at ON t.alert_term_id = at.id
        WHERE t.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY at.id, at.name, at.code
        HAVING total >= 5 AND resolution_rate < 70
        ORDER BY resolution_rate ASC
        LIMIT 10
      `)

      // Tickets críticos parados
      const criticalStuck = await executeReadOnlyQuery(`
        SELECT
          t.id,
          wg.group_name,
          at.name as alert_name,
          TIMESTAMPDIFF(HOUR, t.created_at, NOW()) as hours_open,
          t.current_escalation_level
        FROM ticket t
        JOIN wa_group wg ON t.wa_group_id = wg.id
        JOIN alert_term at ON t.alert_term_id = at.id
        WHERE t.status = 0
          AND t.current_escalation_level >= 2
          AND TIMESTAMPDIFF(HOUR, t.created_at, NOW()) > ${threshold_hours}
        ORDER BY t.current_escalation_level DESC, hours_open DESC
        LIMIT 10
      `)

      return JSON.stringify({
        overloaded_employees: overloadedEmployees,
        overloaded_groups: overloadedGroups,
        problematic_alerts: problematicAlerts,
        critical_stuck_tickets: criticalStuck,
        threshold_hours,
      })
    },
  }),

  /**
   * Analisa padrões de tickets
   * Horários de pico, dias problemáticos, sazonalidade
   */
  new DynamicStructuredTool({
    name: 'get_ticket_patterns',
    description: 'Analisa padrões: horários de pico, dias da semana mais movimentados, distribuição ao longo do dia.',
    schema: z.object({
      days: z.number().optional().default(30).describe('Dias para análise'),
    }),
    func: async ({ days }) => {
      // Distribuição por hora do dia
      const byHour = await executeReadOnlyQuery(`
        SELECT hour, total, ROUND(total * 100.0 / (SELECT COUNT(*) FROM ticket WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)), 1) as percentage
        FROM (
          SELECT HOUR(created_at) as hour, COUNT(*) as total
          FROM ticket
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
          GROUP BY HOUR(created_at)
        ) as hourly
        ORDER BY hour
      `)

      // Distribuição por dia da semana
      const byWeekday = await executeReadOnlyQuery(`
        SELECT
          day_num,
          CASE day_num
            WHEN 1 THEN 'Domingo'
            WHEN 2 THEN 'Segunda'
            WHEN 3 THEN 'Terça'
            WHEN 4 THEN 'Quarta'
            WHEN 5 THEN 'Quinta'
            WHEN 6 THEN 'Sexta'
            WHEN 7 THEN 'Sábado'
          END as day_name,
          total,
          avg_resolution_minutes
        FROM (
          SELECT
            DAYOFWEEK(created_at) as day_num,
            COUNT(*) as total,
            ROUND(AVG(CASE WHEN status = 1 AND closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(MINUTE, created_at, closed_at) END), 0) as avg_resolution_minutes
          FROM ticket
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
          GROUP BY DAYOFWEEK(created_at)
        ) as daily
        ORDER BY day_num
      `)

      // Horários de pico (top 5)
      const peakHours = await executeReadOnlyQuery(`
        SELECT hour, total
        FROM (
          SELECT HOUR(created_at) as hour, COUNT(*) as total
          FROM ticket
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
          GROUP BY HOUR(created_at)
        ) as hourly
        ORDER BY total DESC
        LIMIT 5
      `)

      // Dias com mais volume
      const busiestDays = await executeReadOnlyQuery(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as still_open
        FROM ticket
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
        GROUP BY DATE(created_at)
        ORDER BY total DESC
        LIMIT 10
      `)

      // Combinação hora + dia da semana (heatmap data)
      const heatmap = await executeReadOnlyQuery(`
        SELECT
          DAYOFWEEK(created_at) as day,
          HOUR(created_at) as hour,
          COUNT(*) as total
        FROM ticket
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
        GROUP BY DAYOFWEEK(created_at), HOUR(created_at)
        ORDER BY day, hour
      `)

      return JSON.stringify({
        by_hour: byHour,
        by_weekday: byWeekday,
        peak_hours: peakHours,
        busiest_days: busiestDays,
        heatmap,
        analysis_period_days: days,
      })
    },
  }),

  /**
   * Métricas por departamento
   * Performance de cada departamento na resolução de tickets
   */
  new DynamicStructuredTool({
    name: 'get_department_metrics',
    description: 'Métricas de performance por departamento: tickets resolvidos, tempo médio, ranking de funcionários por departamento.',
    schema: z.object({
      start_date: z.string().optional().describe('Data inicial (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('Data final (YYYY-MM-DD)'),
    }),
    func: async ({ start_date, end_date }) => {
      const dateCondition = start_date && end_date
        ? `AND t.closed_at BETWEEN '${start_date}' AND '${end_date} 23:59:59'`
        : ''

      // Métricas por departamento
      const departmentMetrics = await executeReadOnlyQuery(`
        SELECT
          COALESCE(d.name, 'Sem Departamento') as department,
          COUNT(DISTINCT e.id) as employee_count,
          COUNT(t.id) as tickets_closed,
          ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 0) as avg_resolution_minutes,
          MIN(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)) as fastest_minutes,
          MAX(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)) as slowest_minutes
        FROM employee e
        LEFT JOIN department d ON e.department_id = d.id
        INNER JOIN ticket t ON t.employee_close_id = e.id
        WHERE t.status = 1 AND t.closed_at IS NOT NULL ${dateCondition}
        GROUP BY d.id, d.name
        ORDER BY tickets_closed DESC
      `)

      // Top funcionário de cada departamento
      const topByDepartment = await executeReadOnlyQuery(`
        SELECT
          COALESCE(d.name, 'Sem Departamento') as department,
          e.name as employee_name,
          COUNT(t.id) as tickets_closed,
          ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)), 0) as avg_resolution_minutes
        FROM employee e
        LEFT JOIN department d ON e.department_id = d.id
        INNER JOIN ticket t ON t.employee_close_id = e.id
        WHERE t.status = 1 AND t.closed_at IS NOT NULL ${dateCondition}
        GROUP BY d.id, d.name, e.id, e.name
        ORDER BY d.name, tickets_closed DESC
      `)

      // Agrupar top por departamento
      const topByDept: Record<string, unknown[]> = {}
      for (const row of topByDepartment as Array<{ department: string }>) {
        if (!topByDept[row.department]) {
          topByDept[row.department] = []
        }
        if (topByDept[row.department].length < 3) {
          topByDept[row.department].push(row)
        }
      }

      // Departamentos sem tickets resolvidos
      const inactiveDepartments = await executeReadOnlyQuery(`
        SELECT
          d.name as department,
          COUNT(e.id) as employee_count
        FROM department d
        LEFT JOIN employee e ON e.department_id = d.id AND e.is_active = 1
        WHERE d.id NOT IN (
          SELECT DISTINCT d2.id
          FROM department d2
          INNER JOIN employee e2 ON e2.department_id = d2.id
          INNER JOIN ticket t ON t.employee_close_id = e2.id
          WHERE t.status = 1 ${dateCondition}
        )
        GROUP BY d.id, d.name
        HAVING employee_count > 0
      `)

      return JSON.stringify({
        department_metrics: departmentMetrics,
        top_employees_by_department: topByDept,
        inactive_departments: inactiveDepartments,
        period: start_date && end_date ? { start_date, end_date } : 'todo o período',
      })
    },
  }),

]
