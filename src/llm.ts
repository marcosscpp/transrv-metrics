import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import dotenv from 'dotenv'

dotenv.config()

export type LLMProvider = 'anthropic' | 'openai'

interface LLMConfig {
  provider: LLMProvider
  model?: string
  temperature?: number
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
}

export function createLLM(config?: Partial<LLMConfig>): BaseChatModel {
  const provider = (config?.provider || process.env.LLM_PROVIDER || 'anthropic') as LLMProvider
  const temperature = config?.temperature ?? 0.1

  switch (provider) {
    case 'anthropic': {
      const model = config?.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic
      return new ChatAnthropic({
        model,
        temperature,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        maxTokens: 4096,
      })
    }

    case 'openai': {
      const model = config?.model || process.env.OPENAI_MODEL || DEFAULT_MODELS.openai
      return new ChatOpenAI({
        model,
        temperature,
        openAIApiKey: process.env.OPENAI_API_KEY,
      })
    }

    default:
      throw new Error(`Provedor LLM não suportado: ${provider}`)
  }
}

export function getAvailableProviders(): { provider: LLMProvider; available: boolean; model: string }[] {
  return [
    {
      provider: 'anthropic',
      available: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'sk-ant-your-api-key-here',
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic,
    },
    {
      provider: 'openai',
      available: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-api-key-here',
      model: process.env.OPENAI_MODEL || DEFAULT_MODELS.openai,
    },
  ]
}

export function getCurrentProvider(): LLMProvider {
  return (process.env.LLM_PROVIDER || 'anthropic') as LLMProvider
}
