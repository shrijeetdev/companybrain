import type { ReactNode } from 'react';

/** Markdown-light → React (no HTML injection): paragraphs, - lists, **bold**, *italic*, `code`, [links](https://…), bare URLs, @mentions. */
export function renderInline(text: string, mention?: (name: string) => boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+|@[\p{L}][\p{L}\d_.-]*)/gu;
  let i = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(text.slice(i, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      out.push(<a key={k++} href={m[2]} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else if (tok.startsWith('http')) out.push(<a key={k++} href={tok} target="_blank" rel="noopener noreferrer">{tok.replace(/^https?:\/\//, '')}</a>);
    else if (tok.startsWith('@')) out.push(!mention || mention(tok.slice(1)) ? <span key={k++} className="mention">{tok}</span> : tok);
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    i = m.index + tok.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { blocks.push(<p key={blocks.length}>{renderInline(para.join(' '))}</p>); para = []; }
    if (list.length) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{renderInline(l)}</li>)}</ul>); list = []; }
  };
  for (const line of lines) {
    const li = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (li) { if (para.length) { const p = para; para = []; blocks.push(<p key={blocks.length}>{renderInline(p.join(' '))}</p>); } list.push(li[1]!); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return <>{blocks}</>;
}
