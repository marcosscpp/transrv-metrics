# TransRV MCP Server

Servidor MCP (Model Context Protocol) para consulta de dados de chamados via chat com IA.

Suporta múltiplos provedores de LLM: **Anthropic (Claude)** e **OpenAI (GPT)**.

## Configuração

1. Preencha o arquivo `.env` com as credenciais:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=transrv

# Porta do servidor
MCP_PORT=3001

# Provedor padrão: anthropic | openai
LLM_PROVIDER=anthropic

# API Keys (preencha as que for usar)
ANTHROPIC_API_KEY=sk-ant-sua-api-key
OPENAI_API_KEY=sk-sua-openai-api-key

# Modelos (opcional)
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# OPENAI_MODEL=gpt-4o
```

2. Instale as dependências:

```bash
cd api
npm install
```

3. Inicie o servidor:

```bash
npm run dev
```

## Endpoints

### `GET /health`
Verifica status do servidor, conexão com banco e provedores disponíveis.

### `GET /providers`
Lista provedores de LLM disponíveis e qual está ativo.

### `POST /chat`
Endpoint principal para chat.

```json
{
  "messages": [
    { "role": "user", "content": "Quantos tickets estão abertos?" }
  ],
  "provider": "anthropic"  // opcional: anthropic | openai
}
```

**Resposta:**
```json
{
  "response": "Atualmente existem 42 tickets abertos...",
  "provider": "anthropic"
}
```

### `GET /tools`
Lista todas as ferramentas de consulta disponíveis.

## Provedores Suportados

| Provedor | Modelos | Variável de Ambiente |
|----------|---------|---------------------|
| Anthropic | claude-sonnet-4-20250514 (padrão) | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o (padrão) | `OPENAI_API_KEY` |

## Ferramentas Disponíveis

- `get_ticket_metrics` - Métricas gerais de tickets
- `get_ticket_metrics_by_period` - Métricas por período
- `get_tickets_by_group` - Tickets por grupo WhatsApp
- `get_tickets_by_alert_type` - Tickets por tipo de alerta
- `get_tickets_by_escalation_level` - Tickets por nível de escalação
- `get_recent_tickets` - Tickets mais recentes
- `get_oldest_open_tickets` - Tickets abertos há mais tempo
- `get_employee_performance` - Performance dos funcionários
- `get_daily_tickets` - Tickets por dia
- `get_average_resolution_time` - Tempo médio de resolução
- `get_monitored_groups` - Grupos monitorados
- `get_active_alerts` - Alertas ativos
- `get_employees_by_department` - Funcionários por departamento
- `get_tickets_by_hour` - Distribuição por hora
- `get_notifications_by_level` - Notificações por nível
- `get_tickets_today` - Estatísticas do dia

## Segurança

Este servidor é **APENAS LEITURA**:
- Todas as queries são validadas
- Bloqueado: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE
- Permitido: SELECT, SHOW, DESCRIBE, EXPLAIN

## Exemplos de Perguntas

- "Quantos tickets estão abertos?"
- "Qual o tempo médio de resolução?"
- "Quais grupos têm mais tickets?"
- "Mostre os tickets mais antigos que ainda estão abertos"
- "Qual funcionário fechou mais tickets?"
- "Quantos tickets foram abertos hoje?"
- "Em que horário temos mais tickets?"
