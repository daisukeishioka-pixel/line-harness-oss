/**
 * LIFF Membership Page — 整体卒業サロン マイページ
 *
 * Flow:
 * 1. LIFF init → get LINE profile (userId)
 * 2. Call /api/liff/membership with lineUserId to get friend + subscription data
 * 3. Show membership status (active/past_due/canceled/none)
 * 4. Active: show next billing date, content list, cancel button
 * 5. Not active: show join button → /api/checkout → Stripe Checkout
 *
 * URL: https://liff.line.me/{LIFF_ID}?page=membership
 */

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
};

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8787';

interface MembershipData {
  friendId: string;
  displayName: string | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  isActive: boolean;
}

interface MembershipState {
  profile: { userId: string; displayName: string; pictureUrl?: string } | null;
  membership: MembershipData | null;
  loading: boolean;
  actionLoading: boolean;
}

const state: MembershipState = {
  profile: null,
  membership: null,
  loading: true,
  actionLoading: false,
};

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function apiCall(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

// ========== Styles ==========

function injectStyles(): void {
  if (document.getElementById('membership-styles')) return;
  const style = document.createElement('style');
  style.id = 'membership-styles';
  style.textContent = `
    .mp { max-width: 480px; margin: 0 auto; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .mp-header {
      background: linear-gradient(135deg, #06C755, #04a848);
      border-radius: 12px;
      padding: 28px 24px;
      color: #fff;
      text-align: center;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(6,199,85,0.25);
    }
    .mp-header h1 { font-size: 20px; margin-bottom: 4px; }
    .mp-header .sub { font-size: 13px; opacity: 0.85; }

    .mp-profile {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #fff;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .mp-profile img { width: 48px; height: 48px; border-radius: 50%; }
    .mp-profile-info { flex: 1; }
    .mp-profile-name { font-size: 16px; font-weight: 700; }
    .mp-profile-id { font-size: 11px; color: #999; margin-top: 2px; }

    .mp-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
    }
    .mp-badge-active { background: #06C755; }
    .mp-badge-past_due { background: #f59e0b; }
    .mp-badge-canceled { background: #999; }
    .mp-badge-none { background: #ddd; color: #666; }

    .mp-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }

    .mp-section-title {
      font-size: 15px;
      font-weight: 700;
      color: #333;
      margin-bottom: 12px;
    }

    .mp-info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    .mp-info-row:last-child { border-bottom: none; }
    .mp-info-label { color: #999; }
    .mp-info-value { font-weight: 600; color: #333; }

    .mp-btn {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: opacity 0.15s;
      font-family: inherit;
    }
    .mp-btn:active { opacity: 0.85; }
    .mp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .mp-btn-primary { background: #06C755; color: #fff; }
    .mp-btn-danger { background: #fff; color: #e53e3e; border: 1.5px solid #e53e3e; }
    .mp-btn-secondary { background: #f5f5f5; color: #333; border: 1.5px solid #ddd; }

    .mp-content-list { list-style: none; padding: 0; margin: 0; }
    .mp-content-list li {
      padding: 14px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mp-content-list li:last-child { border-bottom: none; }
    .mp-content-icon { font-size: 20px; flex-shrink: 0; }
    .mp-content-text { flex: 1; }
    .mp-content-text a { color: #06C755; text-decoration: none; font-weight: 600; }
    .mp-content-text p { font-size: 12px; color: #999; margin-top: 2px; }

    .mp-join {
      text-align: center;
      padding: 8px 0;
    }
    .mp-join .mp-price {
      font-size: 28px;
      font-weight: 800;
      color: #333;
      margin-bottom: 4px;
    }
    .mp-join .mp-price-sub {
      font-size: 13px;
      color: #999;
      margin-bottom: 20px;
    }
    .mp-join .mp-features {
      text-align: left;
      margin-bottom: 20px;
    }
    .mp-join .mp-features li {
      font-size: 14px;
      color: #333;
      padding: 6px 0;
      list-style: none;
    }
    .mp-join .mp-features li::before {
      content: '\\2713';
      color: #06C755;
      font-weight: 700;
      margin-right: 8px;
    }

    .mp-warning {
      background: #fef3c7;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      color: #92400e;
      margin-bottom: 16px;
      text-align: center;
    }

    .mp-footer {
      text-align: center;
      padding: 8px 0 16px;
      font-size: 11px;
      color: #bbb;
    }
  `;
  document.head.appendChild(style);
}

// ========== Rendering ==========

function formatDateJa(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function render(): void {
  injectStyles();
  const app = getApp();

  if (state.loading) {
    app.innerHTML = `
      <div class="mp">
        <div class="mp-header">
          <h1>整体卒業サロン</h1>
          <p class="sub">マイページ</p>
        </div>
        <div class="mp-card" style="text-align:center;padding:40px 20px;">
          <div class="loading-spinner"></div>
          <p style="margin-top:12px;color:#718096;font-size:14px;">読み込み中...</p>
        </div>
      </div>
    `;
    return;
  }

  const { profile, membership } = state;
  if (!profile) {
    app.innerHTML = `
      <div class="mp">
        <div class="mp-card" style="text-align:center;">
          <h2 style="color:#e53e3e;">エラー</h2>
          <p class="error" style="font-size:14px;color:#666;">プロフィールの取得に失敗しました。</p>
        </div>
      </div>
    `;
    return;
  }

  const isActive = membership?.isActive ?? false;
  const isPastDue = membership?.subscriptionStatus === 'past_due';
  const isCanceled = membership?.subscriptionStatus === 'canceled';
  const hasSubscription = isActive || isPastDue;

  const statusLabel = isActive ? 'アクティブ' : isPastDue ? '支払い未完了' : isCanceled ? '解約済み' : '未加入';
  const badgeClass = isActive ? 'active' : isPastDue ? 'past_due' : isCanceled ? 'canceled' : 'none';

  const nextBilling = membership?.currentPeriodEnd
    ? formatDateJa(membership.currentPeriodEnd)
    : '-';

  let html = `<div class="mp">`;

  // Header
  html += `
    <div class="mp-header">
      <h1>整体卒業サロン</h1>
      <p class="sub">メンバーシップ マイページ</p>
    </div>
  `;

  // Profile card
  html += `
    <div class="mp-profile">
      ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="" />` : '<div style="width:48px;height:48px;border-radius:50%;background:#e0e0e0;"></div>'}
      <div class="mp-profile-info">
        <div class="mp-profile-name">${escapeHtml(profile.displayName)} さん</div>
      </div>
      <span class="mp-badge mp-badge-${badgeClass}">${statusLabel}</span>
    </div>
  `;

  // Past due warning
  if (isPastDue) {
    html += `
      <div class="mp-warning">
        お支払いに問題があります。下のボタンからお支払い方法を更新してください。
      </div>
    `;
  }

  // Active membership info
  if (isActive) {
    html += `
      <div class="mp-card">
        <p class="mp-section-title">メンバーシップ情報</p>
        <div class="mp-info-row">
          <span class="mp-info-label">プラン</span>
          <span class="mp-info-value">月額 2,980円</span>
        </div>
        <div class="mp-info-row">
          <span class="mp-info-label">次回請求日</span>
          <span class="mp-info-value">${nextBilling}</span>
        </div>
        <div class="mp-info-row">
          <span class="mp-info-label">ステータス</span>
          <span class="mp-info-value" style="color:#06C755;">アクティブ</span>
        </div>
      </div>
    `;
  }

  // Content list (active members only)
  if (isActive) {
    html += `
      <div class="mp-card">
        <p class="mp-section-title">コンテンツ</p>
        <ul class="mp-content-list">
          <li>
            <span class="mp-content-icon">&#127909;</span>
            <div class="mp-content-text">
              <a href="#">セルフケア動画ライブラリ</a>
              <p>自宅でできるエクササイズ動画</p>
            </div>
          </li>
          <li>
            <span class="mp-content-icon">&#128240;</span>
            <div class="mp-content-text">
              <a href="#">月刊ニュースレター</a>
              <p>最新の健康情報をお届け</p>
            </div>
          </li>
          <li>
            <span class="mp-content-icon">&#128172;</span>
            <div class="mp-content-text">
              <a href="#">メンバー限定Q&amp;A</a>
              <p>専門家に直接質問できます</p>
            </div>
          </li>
          <li>
            <span class="mp-content-icon">&#128197;</span>
            <div class="mp-content-text">
              <a href="#">オンライン相談予約</a>
              <p>1対1のオンライン相談</p>
            </div>
          </li>
        </ul>
      </div>
    `;
  }

  // Join section (for non-subscribers)
  if (!isActive && !isPastDue) {
    html += `
      <div class="mp-card">
        <div class="mp-join">
          <p class="mp-section-title">サロンに参加しませんか？</p>
          <p class="mp-price">2,980<span style="font-size:16px;font-weight:400;">円/月</span></p>
          <p class="mp-price-sub">税込 ・ いつでも解約可能</p>
          <ul class="mp-features">
            <li>セルフケア動画が見放題</li>
            <li>月刊ニュースレター配信</li>
            <li>メンバー限定Q&amp;Aに参加</li>
            <li>オンライン相談が予約可能</li>
          </ul>
          <button class="mp-btn mp-btn-primary" id="joinBtn">メンバーシップに登録する</button>
        </div>
      </div>
    `;
  }

  // Manage / Cancel button
  if (hasSubscription) {
    html += `
      <div class="mp-card" style="text-align:center;">
        <button class="mp-btn mp-btn-danger" id="portalBtn">
          ${isPastDue ? '支払い方法を更新する' : 'プランを管理・解約する'}
        </button>
      </div>
    `;
  }

  // Footer
  html += `
    <div class="mp-footer">
      整体卒業サロン
    </div>
  `;

  html += `</div>`;
  app.innerHTML = html;
  attachEvents();
}

// ========== Event Handlers ==========

function attachEvents(): void {
  const joinBtn = document.getElementById('joinBtn');
  joinBtn?.addEventListener('click', () => startCheckout());

  const portalBtn = document.getElementById('portalBtn');
  portalBtn?.addEventListener('click', () => openPortal());
}

async function startCheckout(): Promise<void> {
  if (state.actionLoading || !state.membership?.friendId) return;
  state.actionLoading = true;

  const btn = document.getElementById('joinBtn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '処理中...';
  }

  try {
    const res = await apiCall('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ friendId: state.membership.friendId }),
    });
    const data = await res.json() as { success: boolean; data?: { url: string }; error?: string };

    if (data.success && data.data?.url) {
      window.location.href = data.data.url;
    } else {
      alert(data.error || 'エラーが発生しました');
      state.actionLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'メンバーシップに登録する';
      }
    }
  } catch {
    alert('通信エラーが発生しました');
    state.actionLoading = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'メンバーシップに登録する';
    }
  }
}

async function openPortal(): Promise<void> {
  if (state.actionLoading || !state.membership?.friendId) return;
  state.actionLoading = true;

  const btn = document.getElementById('portalBtn') as HTMLButtonElement | null;
  const originalText = btn?.textContent ?? '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '処理中...';
  }

  try {
    const res = await apiCall(`/api/membership/${state.membership.friendId}/portal`, {
      method: 'POST',
    });
    const data = await res.json() as { success: boolean; data?: { url: string }; error?: string };

    if (data.success && data.data?.url) {
      window.location.href = data.data.url;
    } else {
      alert(data.error || 'エラーが発生しました');
      state.actionLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  } catch {
    alert('通信エラーが発生しました');
    state.actionLoading = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// ========== Init ==========

export async function initMembership(): Promise<void> {
  injectStyles();
  render(); // show loading

  try {
    const profile = await liff.getProfile();
    state.profile = profile;

    // Fetch membership data using lineUserId
    const res = await apiCall('/api/liff/membership', {
      method: 'POST',
      body: JSON.stringify({ lineUserId: profile.userId }),
    });

    if (res.ok) {
      const json = await res.json() as { success: boolean; data?: MembershipData };
      if (json.success && json.data) {
        state.membership = json.data;
      }
    }

    // If membership lookup failed but we can still show the page (as non-member)
    if (!state.membership) {
      // Try to at least get the friendId via profile endpoint
      const profileRes = await apiCall('/api/liff/profile', {
        method: 'POST',
        body: JSON.stringify({ lineUserId: profile.userId }),
      });
      if (profileRes.ok) {
        const pJson = await profileRes.json() as { success: boolean; data?: { id: string } };
        if (pJson.success && pJson.data) {
          state.membership = {
            friendId: pJson.data.id,
            displayName: profile.displayName,
            subscriptionStatus: null,
            subscriptionId: null,
            currentPeriodEnd: null,
            isActive: false,
          };
        }
      }
    }

    state.loading = false;
    render();
  } catch (err) {
    state.loading = false;
    state.profile = null;
    render();
    console.error('initMembership error:', err);
  }
}
