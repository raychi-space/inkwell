export type ProviderIdentity = { name: string; baseUrl: string }

const brands = [
  { id: 'openai', label: 'OpenAI', icon: 'openai', hosts: ['openai.com'], name: /\bopenai\b/i },
  {
    id: 'anthropic',
    label: 'Anthropic',
    icon: 'anthropic',
    hosts: ['anthropic.com'],
    name: /\b(?:anthropic|claude)\b/i,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    icon: 'deepseek-color',
    hosts: ['deepseek.com'],
    name: /\bdeepseek\b|深度求索/i,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    icon: 'gemini-color',
    hosts: ['generativelanguage.googleapis.com'],
    name: /\bgemini\b/i,
  },
  {
    id: 'qwen',
    label: 'Qwen',
    icon: 'qwen-color',
    hosts: ['dashscope.aliyuncs.com'],
    name: /\bqwen\b|通义千问/i,
  },
  {
    id: 'zhipu',
    label: '智谱',
    icon: 'zhipu-color',
    hosts: ['bigmodel.cn'],
    name: /\bzhipu\b|智谱/i,
  },
  {
    id: 'moonshot',
    label: 'Moonshot',
    icon: 'moonshot',
    hosts: ['moonshot.cn', 'moonshot.ai'],
    name: /\b(?:moonshot|kimi)\b|月之暗面/i,
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    icon: 'siliconcloud-color',
    hosts: ['siliconflow.cn', 'siliconflow.com'],
    name: /\bsiliconflow\b|硅基流动/i,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    icon: 'openrouter',
    hosts: ['openrouter.ai'],
    name: /\bopenrouter\b/i,
  },
  { id: 'groq', label: 'Groq', icon: 'groq', hosts: ['groq.com'], name: /\bgroq\b/i },
  {
    id: 'mistral',
    label: 'Mistral',
    icon: 'mistral-color',
    hosts: ['mistral.ai'],
    name: /\bmistral\b/i,
  },
  { id: 'ollama', label: 'Ollama', icon: 'ollama', hosts: ['ollama.com'], name: /\bollama\b/i },
] as const

// The connection's host takes priority over its display name. A model ID or
// OpenAI-compatible protocol is not evidence that the connection is OpenAI.
export function providerBrand(provider?: ProviderIdentity) {
  if (!provider) return undefined
  let host = ''
  try {
    host = new URL(provider.baseUrl).hostname.toLowerCase()
  } catch {
    /* Incomplete form input. */
  }
  const byHost = brands.find((brand) =>
    brand.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  )
  if (byHost) return byHost
  // Named local connections and proxies can still identify their brand. Do not
  // guess when multiple brands occur in the name (e.g. a multi-provider gateway).
  const byName = brands.filter((brand) => brand.name.test(provider.name))
  return byName.length === 1 ? byName[0] : undefined
}
