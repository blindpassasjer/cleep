import { useState } from 'react';
import type { LinkPreview } from '../types';

interface Props {
  preview: LinkPreview;
  compact?: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreviewCard({ preview, compact }: Props) {
  const [imageBroken, setImageBroken] = useState(false);
  const [faviconBroken, setFaviconBroken] = useState(false);
  const host = preview.siteName || hostOf(preview.url);
  const showThumb = preview.image && !imageBroken;
  const showFavicon = preview.favicon && !faviconBroken;

  return (
    <a
      className={`link-preview-card ${compact ? 'compact' : ''}`}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
    >
      {showThumb ? (
        <img className="link-preview-thumb" src={preview.image!} alt="" loading="lazy" onError={() => setImageBroken(true)} />
      ) : showFavicon ? (
        <img
          className="link-preview-favicon"
          src={preview.favicon!}
          alt=""
          loading="lazy"
          onError={() => setFaviconBroken(true)}
        />
      ) : null}
      <span className="link-preview-text">
        <span className="link-preview-title">{preview.title || host}</span>
        <span className="link-preview-domain">{host}</span>
      </span>
    </a>
  );
}
