/**
 * URL自動トラッキング
 * メッセージ内のURLを自動でトラッキングリンクに変換
 */

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * テキスト内のURLをトラッキングリンクに変換
 * 自サイト（workers.dev, liff.line.me）のURLは変換しない
 */
export function autoTrackUrls(text: string, workersUrl: string, friendId?: string): string {
  return text.replace(URL_REGEX, (url) => {
    // 自サイトのURLは変換しない
    if (url.includes('workers.dev') || url.includes('liff.line.me') || url.includes('line.me/R/')) {
      return url;
    }
    const trackUrl = `${workersUrl}/t/${encodeURIComponent(url)}`;
    return friendId ? `${trackUrl}?fid=${friendId}` : trackUrl;
  });
}

/**
 * メッセージオブジェクトのURL自動トラッキング
 */
export function trackMessageUrls(
  message: { type: string; text?: string; [key: string]: unknown },
  workersUrl: string,
  friendId?: string,
): typeof message {
  if (message.type === 'text' && message.text) {
    return { ...message, text: autoTrackUrls(message.text, workersUrl, friendId) };
  }
  // Flex メッセージの場合はcontents内のURLを変換
  if (message.type === 'flex' && message.contents) {
    const contents = JSON.parse(JSON.stringify(message.contents)); // deep clone
    trackFlexUrls(contents, workersUrl, friendId);
    return { ...message, contents };
  }
  return message;
}

function trackFlexUrls(node: unknown, workersUrl: string, friendId?: string): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  // action.uri のトラッキング
  if (obj.action && typeof obj.action === 'object') {
    const action = obj.action as Record<string, unknown>;
    if (action.type === 'uri' && typeof action.uri === 'string') {
      if (!action.uri.includes('workers.dev') && !action.uri.includes('liff.line.me') && !action.uri.includes('line.me/R/')) {
        action.uri = `${workersUrl}/t/${encodeURIComponent(action.uri)}${friendId ? `?fid=${friendId}` : ''}`;
      }
    }
  }

  // 再帰的に子要素を処理
  if (Array.isArray(obj.contents)) {
    (obj.contents as unknown[]).forEach(c => trackFlexUrls(c, workersUrl, friendId));
  }
  if (obj.body) trackFlexUrls(obj.body, workersUrl, friendId);
  if (obj.header) trackFlexUrls(obj.header, workersUrl, friendId);
  if (obj.footer) trackFlexUrls(obj.footer, workersUrl, friendId);
}
