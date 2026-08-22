import type { ReactNode } from 'react';

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*/g;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${i++}`}>{match[2]}</em>);
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Renders a small, safe markdown subset (no HTML injection — everything goes through React
 * elements): **bold**, *italic*, and "- " / "* " bullet lines grouped into a <ul>.
 */
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let blockIndex = 0;

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    const bullets = bulletBuffer;
    blocks.push(
      <ul key={`ul-${blockIndex}`} className="md-bullets">
        {bullets.map((line, i) => (
          <li key={i}>{parseInline(line, `b${blockIndex}-${i}`)}</li>
        ))}
      </ul>,
    );
    blockIndex += 1;
    bulletBuffer = [];
  }

  lines.forEach((line, idx) => {
    const bulletMatch = /^[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      return;
    }
    flushBullets();
    blocks.push(
      <div key={`line-${idx}`} className="md-line">
        {line === '' ? ' ' : parseInline(line, `l${idx}`)}
      </div>,
    );
  });
  flushBullets();

  return <>{blocks}</>;
}
