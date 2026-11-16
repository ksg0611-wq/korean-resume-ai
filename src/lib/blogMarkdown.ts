/**
 * 블로그 마크다운 본문 파서 (신규 글 전용, 외부 의존성 없음)
 * - 지원 문법: ### 소제목, 목록(- / 1.), 표, 인용문(>), **굵게**, \~ 이스케이프
 * - 본문 문구는 수정하지 않고 렌더링 방식만 결정합니다.
 */

export type MdBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] };

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdownBlocks(content: string): MdBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 소제목: 본문 최상위 섹션(###)은 문서 구조상 h2, ####는 h3
    if (line.startsWith('#### ')) {
      blocks.push({ type: 'h3', text: line.slice(5).trim() });
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h2', text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      i++;
      continue;
    }

    // 표
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // 인용문
    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        parts.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: parts.join('\n').trim() });
      continue;
    }

    // 순서 없는 목록
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(lines[i].slice(2).trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // 순서 있는 목록
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // 문단 (연속된 일반 줄은 한 문단)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,4} |>|- |\d+\. |\|)/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }

  return blocks;
}

export interface BlogFaqItem {
  question: string;
  answer: string;
}

export function stripMarkdownInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\\([~*_`>#\-\\])/g, '$1');
}

/** '자주 묻는 질문' 섹션의 **질문** 답변 문단을 Q&A로 추출 (본문과 동일 원문 사용) */
export function extractFaq(content: string): BlogFaqItem[] {
  const blocks = parseMarkdownBlocks(content);
  const start = blocks.findIndex((b) => b.type === 'h2' && b.text === '자주 묻는 질문');
  if (start < 0) return [];

  const items: BlogFaqItem[] = [];
  for (let idx = start + 1; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.type === 'h2' || block.type === 'h3') break;
    if (block.type !== 'p') continue;
    const m = block.text.match(/^\*\*(.+?)\*\*\s*([\s\S]+)$/);
    if (!m) continue;
    items.push({
      question: stripMarkdownInline(m[1]).trim(),
      answer: stripMarkdownInline(m[2]).trim(),
    });
  }
  return items;
}
