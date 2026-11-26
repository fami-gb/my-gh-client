// 外部URLを開く。PWAでは新しいタブ、APK化（Capacitor）後は外部ブラウザに差し替える。
export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
