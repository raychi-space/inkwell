import { useState } from 'react'
import {
  Bot,
  PenLine,
  NotebookPen,
  BookOpen,
  Languages,
  Code,
  Search,
  Lightbulb,
  Sparkles,
  Brain,
  GraduationCap,
  ChartNoAxesCombined,
  Palette,
  Camera,
  Music,
  Globe,
  Compass,
  Rocket,
  Coffee,
  Leaf,
  Heart,
  ShieldCheck,
  Terminal,
  WandSparkles,
} from 'lucide-react'

const icons = [
  { id: 'lucide:bot', label: '通用助手', component: Bot },
  { id: 'lucide:pen-line', label: '写作', component: PenLine },
  { id: 'lucide:notebook-pen', label: '笔记', component: NotebookPen },
  { id: 'lucide:book-open', label: '阅读', component: BookOpen },
  { id: 'lucide:languages', label: '翻译', component: Languages },
  { id: 'lucide:code', label: '编程', component: Code },
  { id: 'lucide:search', label: '研究', component: Search },
  { id: 'lucide:lightbulb', label: '灵感', component: Lightbulb },
  { id: 'lucide:sparkles', label: '创意', component: Sparkles },
  { id: 'lucide:brain', label: '思考', component: Brain },
  { id: 'lucide:graduation-cap', label: '学习', component: GraduationCap },
  { id: 'lucide:chart-no-axes-combined', label: '分析', component: ChartNoAxesCombined },
  { id: 'lucide:palette', label: '设计', component: Palette },
  { id: 'lucide:camera', label: '摄影', component: Camera },
  { id: 'lucide:music', label: '音乐', component: Music },
  { id: 'lucide:globe', label: '探索', component: Globe },
  { id: 'lucide:compass', label: '规划', component: Compass },
  { id: 'lucide:rocket', label: '行动', component: Rocket },
  { id: 'lucide:coffee', label: '闲聊', component: Coffee },
  { id: 'lucide:leaf', label: '生活', component: Leaf },
  { id: 'lucide:heart', label: '陪伴', component: Heart },
  { id: 'lucide:shield-check', label: '审校', component: ShieldCheck },
  { id: 'lucide:terminal', label: '开发', component: Terminal },
  { id: 'lucide:wand-sparkles', label: '润色', component: WandSparkles },
]
const emojis = [
  { id: 'emoji:robot', label: '机器人', emoji: '🤖' },
  { id: 'emoji:writing', label: '书写', emoji: '✍️' },
  { id: 'emoji:memo', label: '备忘', emoji: '📝' },
  { id: 'emoji:books', label: '书籍', emoji: '📚' },
  { id: 'emoji:fox', label: '狐狸', emoji: '🦊' },
  { id: 'emoji:cat', label: '猫咪', emoji: '🐱' },
  { id: 'emoji:owl', label: '猫头鹰', emoji: '🦉' },
  { id: 'emoji:seedling', label: '幼苗', emoji: '🌱' },
  { id: 'emoji:sun', label: '阳光', emoji: '☀️' },
  { id: 'emoji:moon', label: '月亮', emoji: '🌙' },
  { id: 'emoji:rainbow', label: '彩虹', emoji: '🌈' },
  { id: 'emoji:target', label: '目标', emoji: '🎯' },
]

export function AssistantAvatar({ icon, size = 22 }: { icon?: string; size?: number }) {
  const emoji = emojis.find((item) => item.id === icon)
  const Component = (icons.find((item) => item.id === icon) ?? icons[0]).component
  return (
    <span
      className="assistant-avatar"
      data-assistant-icon={emoji?.id ?? (icons.find((item) => item.id === icon) ?? icons[0]).id}
      aria-hidden="true"
      style={{ fontSize: size }}
    >
      {emoji ? emoji.emoji : <Component size={size} strokeWidth={1.8} />}
    </span>
  )
}

export function AssistantIconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'icons' | 'emoji'>('icons')
  const label = [...icons, ...emojis].find((item) => item.id === value)?.label ?? '通用助手'
  const choices = (kind === 'icons' ? icons : emojis).filter((item) =>
    (item.label + item.id).toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <details className="assistant-icon-picker">
      <summary>
        <AssistantAvatar icon={value} />
        <span>助手图标 · {label}</span>
        <span className="icon-picker-change">更换</span>
      </summary>
      <div className="icon-picker-panel">
        <div className="icon-picker-tabs" role="group" aria-label="图标类型">
          <button
            type="button"
            aria-pressed={kind === 'icons'}
            onClick={() => {
              setKind('icons')
              setQuery('')
            }}
          >
            线条图标
          </button>
          <button
            type="button"
            aria-pressed={kind === 'emoji'}
            onClick={() => {
              setKind('emoji')
              setQuery('')
            }}
          >
            Emoji
          </button>
        </div>
        <input
          aria-label="搜索助手图标"
          placeholder="搜索图标，如写作、编程…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="assistant-icon-grid" role="group" aria-label="助手图标库">
          {choices.map((item) => (
            <button
              type="button"
              key={item.id}
              title={item.label}
              aria-label={item.label}
              aria-pressed={value === item.id}
              onClick={() => onChange(item.id)}
            >
              <AssistantAvatar icon={item.id} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        {!choices.length && <p role="status">没有匹配的图标，请换个关键词。</p>}
      </div>
    </details>
  )
}
