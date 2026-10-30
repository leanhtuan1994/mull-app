const GB = 1024 ** 3;
const MB = 1024 ** 2;

const oneDecimal = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const upToOneDecimal = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** Vietnamese number style: "0,8", "2,5". */
export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

/** "1.7" → "1,7", "4" → "4". */
export function formatParams(billions: number): string {
  return upToOneDecimal.format(billions);
}

/** "2,5 GB", "396 MB", "0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= GB * 0.95) return `${oneDecimal.format(bytes / GB)} GB`;
  return `${whole.format(Math.max(0, bytes) / MB)} MB`;
}

export function formatGB(bytes: number): string {
  return `${oneDecimal.format(bytes / GB)} GB`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

export function formatInteger(value: number): string {
  return whole.format(value);
}
