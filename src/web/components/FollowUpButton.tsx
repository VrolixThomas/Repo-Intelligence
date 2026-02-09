import { useState } from "react";

interface Props {
  sessionId: string | null;
  ticketKey?: string;
  memberName?: string;
  runId?: number;
}

export function FollowUpButton({ sessionId, ticketKey, memberName, runId }: Props) {
  const [copied, setCopied] = useState(false);

  // Build the best available command
  let command: string;
  if (sessionId) {
    command = `bun run followup.ts --session ${sessionId}`;
  } else if (ticketKey) {
    command = `bun run followup.ts ${ticketKey}`;
  } else if (memberName) {
    command = `bun run followup.ts --member "${memberName}"`;
  } else if (runId) {
    command = `bun run followup.ts --run ${runId}`;
  } else {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const textarea = document.createElement("textarea");
      textarea.value = command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        title={command}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {copied ? "Copied!" : "Follow Up"}
      </button>
    </div>
  );
}
