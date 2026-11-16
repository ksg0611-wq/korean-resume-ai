import React from 'react';
import Link from 'next/link';
import type { MdBlock } from '@/lib/blogMarkdown';

export interface BlogInternalLink {
  phrase: string;
  href: string;
}

/** 내부 링크 문구는 문서 전체에서 첫 등장 1회만 링크로 연결 (본문 문구는 변경하지 않음) */
export function createLinkState(): Set<string> {
  return new Set<string>();
}

function renderPlainWithLinks(
  text: string,
  links: BlogInternalLink[],
  used: Set<string>,
  keyPrefix: string
): React.ReactNode[] {
  const unescaped = text.replace(/\\([~*_`>#\-\\])/g, '$1');
  let nodes: React.ReactNode[] = [unescaped];

  links.forEach((link, li) => {
    if (used.has(link.phrase)) return;
    const next: React.ReactNode[] = [];
    let applied = false;
    nodes.forEach((node, ni) => {
      if (applied || typeof node !== 'string') {
        next.push(node);
        return;
      }
      const idx = node.indexOf(link.phrase);
      if (idx < 0) {
        next.push(node);
        return;
      }
      applied = true;
      used.add(link.phrase);
      if (idx > 0) next.push(node.slice(0, idx));
      next.push(
        <Link
          key={`${keyPrefix}-l${li}-${ni}`}
          href={link.href}
          className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
        >
          {link.phrase}
        </Link>
      );
      const rest = node.slice(idx + link.phrase.length);
      if (rest) next.push(rest);
    });
    nodes = next;
  });

  return nodes;
}

function renderInline(
  text: string,
  links: BlogInternalLink[],
  used: Set<string>,
  keyPrefix: string
): React.ReactNode {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        ...renderPlainWithLinks(text.slice(last, m.index), links, used, `${keyPrefix}-t${n}`)
      );
    }
    out.push(
      <strong key={`${keyPrefix}-b${n}`} className="font-bold text-gray-900">
        {renderPlainWithLinks(m[1], links, used, `${keyPrefix}-bi${n}`)}
      </strong>
    );
    last = m.index + m[0].length;
    n++;
  }
  if (last < text.length) {
    out.push(...renderPlainWithLinks(text.slice(last), links, used, `${keyPrefix}-t${n}`));
  }

  return out.map((node, idx) =>
    typeof node === 'string' ? <React.Fragment key={`${keyPrefix}-s${idx}`}>{node}</React.Fragment> : node
  );
}

export default function BlogMarkdown({
  blocks,
  links = [],
  used,
  keyPrefix = 'md',
}: {
  blocks: MdBlock[];
  links?: BlogInternalLink[];
  used: Set<string>;
  keyPrefix?: string;
}) {
  return (
    <div className="space-y-5 text-gray-700 leading-loose text-lg">
      {blocks.map((block, bi) => {
        const key = `${keyPrefix}-${bi}`;
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={key} className="text-2xl font-bold text-gray-900 mt-10 mb-2 leading-snug">
                {renderInline(block.text, links, used, key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} className="text-xl font-bold text-gray-900 mt-8 mb-1 leading-snug">
                {renderInline(block.text, links, used, key)}
              </h3>
            );
          case 'p':
            return (
              <p key={key} className="whitespace-pre-line">
                {renderInline(block.text, links, used, key)}
              </p>
            );
          case 'ul':
            return (
              <ul key={key} className="list-disc pl-6 space-y-2">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`}>{renderInline(item, links, used, `${key}-${ii}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="list-decimal pl-6 space-y-2">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`}>{renderInline(item, links, used, `${key}-${ii}`)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-4 border-blue-300 bg-blue-50/60 text-gray-800 px-5 py-4 rounded-r-xl whitespace-pre-line"
              >
                {renderInline(block.text, links, used, key)}
              </blockquote>
            );
          case 'table':
            return (
              <div key={key} className="overflow-x-auto">
                <table className="w-full border-collapse text-base">
                  <thead>
                    <tr>
                      {block.header.map((cell, ci) => (
                        <th
                          key={`${key}-h${ci}`}
                          className="border border-gray-200 bg-gray-50 px-4 py-2.5 text-left font-bold text-gray-900"
                        >
                          {renderInline(cell, links, used, `${key}-h${ci}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={`${key}-r${ri}`}>
                        {row.map((cell, ci) => (
                          <td key={`${key}-r${ri}c${ci}`} className="border border-gray-200 px-4 py-2.5 align-top">
                            {renderInline(cell, links, used, `${key}-r${ri}c${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
