/**
 * LIFF マイページ — お支払い履歴・領収書
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string; statusMessage?: string }>;
  getIDToken(): string | null;
  getFriendship(): Promise<{ friendFlag: boolean }>;
  isInClient(): boolean;
  closeWindow(): void;
  openWindow(params: { url: string; external: boolean }): void;
};

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8787';

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt_url: string | null;
  period_start: number;
  period_end: number;
  created: number;
  description: string;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'jpy') {
    return `¥${amount.toLocaleString()}`;
  }
  return `¥${(amount / 100).toLocaleString()}`;
}

function renderPaymentHistory(invoices: Invoice[]): string {
  if (invoices.length === 0) {
    return '<p class="no-payments">お支払い履歴はまだありません</p>';
  }

  return invoices.map((inv) => {
    const dateStr = formatDate(inv.created);
    const amountStr = formatAmount(inv.amount, inv.currency);
    const receiptBtn = inv.receipt_url
      ? `<a href="${escapeHtml(inv.receipt_url)}" class="receipt-btn" data-url="${escapeHtml(inv.receipt_url)}">領収書を表示 →</a>`
      : '';

    return `
      <div class="payment-card">
        <p class="payment-date">${dateStr}</p>
        <p class="payment-amount">${amountStr}</p>
        <p class="payment-status">✓ 支払い済み</p>
        ${receiptBtn}
      </div>
    `;
  }).join('');
}

async function loadPaymentHistory(lineUserId: string): Promise<void> {
  const list = document.getElementById('payment-list');
  if (!list) return;

  try {
    const res = await fetch(`${API_URL}/api/liff/payment-history/${encodeURIComponent(lineUserId)}`);
    const data = await res.json() as { success: boolean; data: Invoice[] };

    list.innerHTML = renderPaymentHistory(data.data || []);

    // liff.openWindow() でLINE内ブラウザで領収書を開く
    list.querySelectorAll('.receipt-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = (btn as HTMLElement).dataset.url;
        if (url) {
          if (liff.isInClient()) {
            liff.openWindow({ url, external: true });
          } else {
            window.open(url, '_blank');
          }
        }
      });
    });
  } catch {
    list.innerHTML = '<p class="no-payments">履歴の読み込みに失敗しました</p>';
  }
}

export async function initMypage(): Promise<void> {
  const container = document.getElementById('app')!;

  // プロフィール取得
  const profile = await liff.getProfile();

  container.innerHTML = `
    <div class="mypage">
      <div class="card mypage-header">
        <div class="profile">
          ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="" />` : ''}
          <p class="name">${escapeHtml(profile.displayName)} さん</p>
        </div>
      </div>

      <section class="payment-history">
        <h2>お支払い履歴</h2>
        <div id="payment-list">
          <div class="payment-loading">
            <div class="loading-spinner"></div>
            <p class="loading-text">読み込み中...</p>
          </div>
        </div>
      </section>
    </div>
  `;

  await loadPaymentHistory(profile.userId);
}
