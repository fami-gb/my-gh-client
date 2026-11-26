export function relativeTime(iso: string, now = Date.now()) {
  const sec = Math.round((now - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "今";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}
