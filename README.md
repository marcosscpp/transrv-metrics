# 🚀 TransRV - Sistema Inteligente de Gestão de Tickets

> Plataforma completa de gerenciamento de tickets com análise de dados em tempo real, integração com WhatsApp e assistente de IA para insights automatizados.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

---

## 📋 Sobre o Projeto

**TransRV** é uma solução enterprise completa para gestão de tickets e monitoramento operacional, desenvolvida para empresas que precisam de controle total sobre seus processos de atendimento e análise de performance em tempo real.

O sistema integra **monitoramento de grupos WhatsApp**, **gestão de funcionários**, **análise de métricas avançadas** e um **assistente de IA** que fornece insights automáticos sobre tendências, gargalos e oportunidades de melhoria.

### 🎯 Principais Diferenciais

- **Dashboard de Métricas Avançado**: Visualizações interativas com KPIs em tempo real, tendências históricas e análises comparativas
- **Assistente de IA Integrado**: Chat inteligente que responde perguntas sobre dados usando Claude (Anthropic) ou GPT-4 (OpenAI)
- **Monitoramento em Tempo Real**: WebSockets para atualizações instantâneas de tickets e notificações
- **Sistema de Escalação Inteligente**: Gestão automática de níveis de prioridade (Normal, Atenção, Crítico)
- **Análise de Performance**: Rankings de funcionários, métricas por departamento e identificação de gargalos
- **Integração WhatsApp**: Monitoramento de grupos e gestão de contatos

---

## 🏗️ Arquitetura

### Frontend
- **React 18** com TypeScript
- **Vite** para build otimizado
- **Tailwind CSS** com design system customizado
- **Zustand** para gerenciamento de estado
- **React Query** para cache e sincronização de dados
- **Recharts** para visualizações de dados
- **Material Symbols** para ícones

### Backend
- **Fastify** - Framework web de alta performance
- **LangChain** - Integração com LLMs (Claude/GPT-4)
- **MySQL** - Banco de dados relacional
- **TypeScript** - Type safety end-to-end
- **Docker** - Containerização para deploy

### Infraestrutura
- **Render** - Deploy automatizado com Docker
- **WebSockets** - Comunicação em tempo real
- **RESTful API** - Arquitetura de microserviços

---

## ✨ Funcionalidades Principais

### 📊 Dashboard de Métricas
- **KPIs em Tempo Real**: Volume total, taxa de resolução, tempo médio, tickets críticos
- **Gráficos Interativos**: Tendências diárias, distribuições por status, grupo, alerta e escalação
- **Análises Temporais**: Horários de pico, padrões por dia da semana, comparação entre períodos
- **Rankings**: Top funcionários, mais rápidos, tickets críticos abertos
- **Performance por Departamento**: Métricas detalhadas com tempo médio de resolução

### 🤖 Assistente de IA (Insights)
- Chat conversacional para análise de dados
- Respostas automáticas sobre métricas e tendências
- Geração de gráficos sob demanda
- Identificação de gargalos e padrões
- Suporte a múltiplos provedores (Claude/GPT-4)

### 🎫 Gestão de Tickets
- Monitoramento em tempo real via WebSocket
- Sistema de status (Aberto, Fechado, Sem Solução)
- Escalação automática por tempo de abertura
- Filtros avançados e busca inteligente
- Histórico completo de interações

### 👥 Gestão de Funcionários
- Cadastro e controle de acesso
- Vinculação de alertas e grupos WhatsApp
- Análise de performance individual
- Rankings e comparações entre equipes

### 📱 Integração WhatsApp
- Monitoramento de grupos
- Gestão de contatos
- Alertas automáticos

### 🔔 Sistema de Notificações
- Notificações em tempo real
- Alertas sonoros configuráveis
- Badge de contagem de notificações
- Histórico de eventos

---

## 🛠️ Stack Tecnológica

### Frontend
```json
{
  "react": "^18.x",
  "typescript": "^5.x",
  "vite": "^5.x",
  "tailwindcss": "^4.x",
  "@tanstack/react-query": "^5.x",
  "zustand": "^4.x",
  "recharts": "^2.x",
  "react-router-dom": "^6.x"
}
```

### Backend
```json
{
  "fastify": "^5.x",
  "@langchain/core": "^0.3.x",
  "@langchain/anthropic": "^0.3.x",
  "@langchain/openai": "^0.5.x",
  "mysql2": "^3.x",
  "zod": "^3.x"
}
```

---

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 20+
- MySQL 8+
- Docker (opcional, para deploy)

### Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/transv.git
cd transv
```

2. **Configure o Frontend**
```bash
npm install
cp .env.example .env
# Configure as variáveis de ambiente
npm run dev
```

3. **Configure a API**
```bash
cd api
npm install
cp .env.example .env
# Configure DB_HOST, DB_USER, DB_PASSWORD, etc.
npm run dev
```

### Variáveis de Ambiente

**Frontend** (`.env`):
```env
VITE_API_URL=http://localhost:3001
```

**Backend** (`api/.env`):
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=transrv
MCP_PORT=3001
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

## 📦 Deploy

### Render (Recomendado)

O projeto está configurado para deploy automático no Render:

1. Conecte seu repositório GitHub
2. Configure como **Web Service** com **Docker**
3. Defina `Root Directory` como `api`
4. Adicione as variáveis de ambiente
5. Deploy automático a cada push

Veja `api/render.yaml` para configuração detalhada.

### Docker

```bash
cd api
docker build -t transrv-api .
docker run -p 3001:3001 --env-file .env transrv-api
```

---

## 📈 Métricas e Performance

- **Tempo de Resposta API**: < 200ms (p95)
- **Build Frontend**: < 30s
- **Bundle Size**: Otimizado com code splitting
- **Lighthouse Score**: 90+ em todas as métricas

---

## 🔒 Segurança

- Autenticação JWT
- Validação de queries SQL (apenas SELECT)
- CORS configurado
- Sanitização de inputs
- Rate limiting nos endpoints

---

## 📚 Documentação da API

### Endpoints Principais

- `GET /health` - Status do servidor
- `POST /chat` - Chat com IA
- `GET /metrics` - Métricas completas
- `GET /metrics/summary` - KPIs principais
- `GET /metrics/trends` - Tendências temporais
- `GET /metrics/distributions/*` - Distribuições diversas
- `GET /metrics/rankings/*` - Rankings e análises

---

## 🤝 Contribuindo

Este é um projeto privado, mas sugestões são bem-vindas!

---


## 👨‍💻 Desenvolvido por

**Marcos Paulo Reis**  
Desenvolvedor Full Stack | TypeScript | React | Node.js

---

## 🔗 Links Úteis

- [Documentação da API](./api/README.md)
- [Guia de Deploy](./api/RENDER_DEPLOY.md)
- [Design System](./src/style.css)

---

<div align="center">
  <p>Feito com ❤️ usando TypeScript, React e Node.js</p>
  <p>⭐ Se este projeto foi útil, considere dar uma estrela!</p>
</div>
