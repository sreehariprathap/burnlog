// components/PushEnableHelp.tsx
import { Smartphone } from 'lucide-react';

/** OS-specific "how to enable push" instructions, shown when a push send
 * fails (usually because the device never subscribed) — e.g. the admin
 * test-push tool. */
export function PushEnableHelp() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Smartphone className="w-4 h-4" />
        No device received it — here&apos;s how to enable push
      </p>
      <div>
        <p className="font-medium text-xs uppercase text-muted-foreground">iOS (Safari)</p>
        <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 mt-1">
          <li>Open this site in Safari — not Chrome (iOS only supports installs from Safari)</li>
          <li>Tap the Share icon, then &quot;Add to Home Screen&quot;</li>
          <li>Open the app from the home screen icon (not from a Safari tab)</li>
          <li>Allow notifications when prompted, or go to iOS Settings → this app → Notifications</li>
          <li>Requires iOS 16.4 or later</li>
        </ol>
      </div>
      <div>
        <p className="font-medium text-xs uppercase text-muted-foreground">Android (Chrome)</p>
        <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 mt-1">
          <li>Open this site in Chrome</li>
          <li>Tap the menu (⋮) → &quot;Add to Home screen&quot; or &quot;Install app&quot;</li>
          <li>If still blocked: Chrome menu → Settings → Site settings → Notifications, find this site, set to &quot;Allow&quot;</li>
          <li>Also check Android Settings → Apps → Chrome → Notifications is on</li>
        </ol>
      </div>
      <p className="text-xs text-muted-foreground/70">
        Note: this won&apos;t work inside the native iOS/Android app builds — only in a browser or a home-screen-installed PWA.
      </p>
    </div>
  );
}
