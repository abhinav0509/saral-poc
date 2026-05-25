import { Lock, RefreshCw } from "lucide-react";

/**
 * Browser-chrome mock for patient web pages.
 * Renders a fake URL bar with lock icon + reload, so the patient
 * web pages feel like real websites opened from WhatsApp links
 * (vs the staff app which has a native app shell).
 *
 * On a real phone, the user's actual Safari/Chrome address bar
 * covers ours — this is mostly cosmetic for desktop preview &
 * design polish.
 */
export function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="bg-surface-sunken border-b border-border-subtle">
      <div className="px-4 pt-2 pb-2">
        <div className="flex items-center gap-2 bg-surface-canvas border border-border-default rounded-full px-3 h-9">
          <Lock size={14} className="text-text-success flex-none" />
          <span className="text-label-sm text-text-secondary truncate flex-1">
            {url}
          </span>
          <RefreshCw size={14} className="text-text-secondary flex-none" />
        </div>
      </div>
    </div>
  );
}
