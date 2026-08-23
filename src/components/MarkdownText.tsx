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

const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\((\S+)\)$/;
const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const ORDERED_PATTERN = /^\d+\.\s+(.*)$/;
const BULLET_PATTERN = /^[-*]\s+(.*)$/;

function isSafeImageUrl(url: string): boolean {
  return /^(https?:\/\/|\/)/i.test(url);
}

/**
 * Renders a small, safe markdown subset (no HTML injection -- everything goes through React
 * elements): "# " / "## " / "### " headings, **bold**, *italic*, "- " / "* " and "1. " lists, and
 * ![alt](url) images on their own line (for dropping a workout GIF inline in the text).
 */
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let orderedBuffer: string[] = [];
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

  function flushOrdered() {
    if (orderedBuffer.length === 0) return;
    const items = orderedBuffer;
    blocks.push(
      <ol key={`ol-${blockIndex}`} className="md-ordered">
        {items.map((line, i) => (
          <li key={i}>{parseInline(line, `o${blockIndex}-${i}`)}</li>
        ))}
      </ol>,
    );
    blockIndex += 1;
    orderedBuffer = [];
  }

  function flushLists() {
    flushBullets();
    flushOrdered();
  }

  lines.forEach((line, idx) => {
    const imageMatch = IMAGE_LINE_PATTERN.exec(line);
    if (imageMatch && isSafeImageUrl(imageMatch[2])) {
      flushLists();
      blocks.push(<img key={`img-${idx}`} className="md-image" src={imageMatch[2]} alt={imageMatch[1]} loading="lazy" />);
      return;
    }

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch) {
      flushLists();
      const level = headingMatch[1].length;
      const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3';
      blocks.push(
        <HeadingTag key={`h-${idx}`} className="md-heading">
          {parseInline(headingMatch[2], `h${idx}`)}
        </HeadingTag>,
      );
      return;
    }

    const bulletMatch = BULLET_PATTERN.exec(line);
    if (bulletMatch) {
      flushOrdered();
      bulletBuffer.push(bulletMatch[1]);
      return;
    }

    const orderedMatch = ORDERED_PATTERN.exec(line);
    if (orderedMatch) {
      flushBullets();
      orderedBuffer.push(orderedMatch[1]);
      return;
    }

    flushLists();
    blocks.push(
      <div key={`line-${idx}`} className="md-line">
        {line === '' ? ' ' : parseInline(line, `l${idx}`)}
      </div>,
    );
  });
  flushLists();

  return <>{blocks}</>;
}
