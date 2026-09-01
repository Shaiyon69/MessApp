/**
 * The react-markdown + remark-gfm rendering path, split out so the ~110 kB
 * remark/micromark chain loads only when a message actually contains markup.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MARKDOWN_PLUGINS = [remarkGfm]

export default function MarkdownBody({ components, children }) {
  return <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={components}>{children}</ReactMarkdown>
}
