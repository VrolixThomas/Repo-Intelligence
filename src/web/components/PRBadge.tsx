interface Props {
  state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED" | null;
  url?: string | null;
  title?: string | null;
  approvals?: number | null;
  compact?: boolean;
}

const stateConfig: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  OPEN: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    icon: "M10 1a1 1 0 011 1v2a1 1 0 11-2 0V3.414l-3.293 3.293a1 1 0 01-1.414-1.414L7.586 2H6a1 1 0 110-2h4zm-7 8a1 1 0 00-1 1v2a1 1 0 102 0v-.586l3.293 3.293a1 1 0 001.414-1.414L5.414 10H6a1 1 0 100-2H3z",
    label: "Open",
  },
  MERGED: {
    bg: "bg-green-50",
    text: "text-green-700",
    icon: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",
    label: "Merged",
  },
  DECLINED: {
    bg: "bg-red-50",
    text: "text-red-700",
    icon: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z",
    label: "Declined",
  },
  SUPERSEDED: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    icon: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z",
    label: "Superseded",
  },
};

export function PRBadge({ state, url, title, approvals, compact }: Props) {
  if (!state) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
        No PR
      </span>
    );
  }

  const cfg = stateConfig[state] ?? stateConfig.OPEN!;

  const badge = (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.text}`}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d={cfg.icon} clipRule="evenodd" />
      </svg>
      {compact ? cfg.label : (
        <>
          {cfg.label}
          {title && <span className="font-normal ml-1 truncate max-w-[180px]">{title}</span>}
          {approvals != null && approvals > 0 && (
            <span className="ml-1 opacity-75">{approvals} appr.</span>
          )}
        </>
      )}
    </span>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
        {badge}
      </a>
    );
  }

  return badge;
}
