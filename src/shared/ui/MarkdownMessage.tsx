import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Also used for incomplete streaming replies; HTML is never executed. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="message-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt || '图片'}</span>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
