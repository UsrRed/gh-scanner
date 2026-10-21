export const DEVICE_URL = 'https://github.com/login/device';

/** Extracts the one-time code and device URL from `gh auth login --web` output. */
export function parseDeviceOutput(text: string): { userCode: string | null; url: string | null } {
  const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(text) ?? /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(text);
  const url = /https:\/\/github\.com\/login\/device\b/.test(text) ? DEVICE_URL : null;
  return { userCode: code?.[1]?.toUpperCase() ?? null, url };
}
