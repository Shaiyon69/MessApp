/**
 * Fenced code block renderer for message markdown. Split out of MessageElements
 * so the Prism highlighter is lazy-loaded on the first message containing a code
 * block instead of shipping in the boot bundle. Uses PrismLight with an explicit
 * language set — the full `Prism` entry point pulls all ~300 refractor languages.
 * Unregistered languages render unhighlighted rather than throwing.
 */
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'

const LANGUAGES = {
  bash, c, cpp, csharp, css, diff, go, java, javascript, json, jsx, kotlin,
  markup, python, ruby, rust, sql, swift, tsx, typescript, yaml,
}

const ALIASES = {
  html: 'markup', xml: 'markup', svg: 'markup',
  js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby', rs: 'rust',
  sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml', 'c++': 'cpp', cs: 'csharp',
}

for (const [name, definition] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, definition)
}
for (const [alias, target] of Object.entries(ALIASES)) {
  SyntaxHighlighter.registerLanguage(alias, LANGUAGES[target])
}

export default function CodeBlock({ language, className, children, ...props }) {
  return (
    <SyntaxHighlighter style={vscDarkPlus} language={language} PreTag="div" className={className} {...props}>
      {children}
    </SyntaxHighlighter>
  )
}
