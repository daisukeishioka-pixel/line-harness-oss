import { Hono } from 'hono';
import {
  getFriendByLineUserId,
  createUser,
  getUserByEmail,
  linkFriendToUser,
  upsertFriend,
  getEntryRouteByRefCode,
  recordRefTracking,
  addTagToFriend,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';

const liffRoutes = new Hono<Env>();

const DEFAULT_LIFF_ID = '2009595752-X90IWgrz';

// ─── 会員ページ共通CSS ──────────────────────────────────────────

function memberPageCSS(): string {
  return `
    :root { --green: #1a6b5a; --green-light: #e8f5f0; --gold: #d4a853; --bg: #f7f7f5; --card: #fff; --text: #333; --text-sub: #888; --border: #eee; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding-bottom: 80px; }
    .header-bar { background: var(--green); color: #fff; padding: 16px; text-align: center; }
    .header-bar h1 { font-size: 16px; font-weight: 700; }
    .header-bar p { font-size: 11px; opacity: 0.8; }
    .container { max-width: 480px; margin: 0 auto; padding: 12px; }
    .card { background: var(--card); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 12px; }
    .section-title { font-size: 14px; font-weight: 700; color: var(--green); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .empty { text-align: center; padding: 20px; color: var(--text-sub); font-size: 13px; }
    .btn { display: block; width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; text-align: center; font-family: inherit; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-sm { display: inline-block; width: auto; padding: 6px 14px; font-size: 12px; border-radius: 8px; }
    .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #eee; display: flex; z-index: 50; max-width: 100%; }
    .bottom-nav a { flex: 1; text-align: center; padding: 8px 4px; text-decoration: none; color: #aaa; font-size: 10px; font-weight: 600; transition: color 0.2s; }
    .bottom-nav a.active { color: var(--green); }
    .bottom-nav svg { display: block; margin: 0 auto 2px; width: 22px; height: 22px; }
    .content-card { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
    .content-card:last-child { border-bottom: none; }
    .content-thumb { width: 80px; height: 52px; border-radius: 6px; background: #e0e0e0; object-fit: cover; flex-shrink: 0; }
    .content-info { flex: 1; min-width: 0; }
    .content-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; line-height: 1.3; }
    .content-meta { font-size: 11px; color: var(--text-sub); }
    .schedule-item { padding: 10px 0; border-bottom: 1px solid var(--border); }
    .schedule-item:last-child { border-bottom: none; }
    .schedule-date { font-size: 11px; color: var(--gold); font-weight: 700; }
    .schedule-name { font-size: 13px; font-weight: 600; margin-top: 2px; }
    .news-item { padding: 10px 0; border-bottom: 1px solid var(--border); }
    .news-item:last-child { border-bottom: none; }
    .news-badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-bottom: 4px; }
    .news-title { font-size: 13px; font-weight: 600; }
    .news-date { font-size: 11px; color: var(--text-sub); margin-top: 2px; }
    .calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
    .cal-header { font-size: 10px; font-weight: 700; color: var(--text-sub); padding: 4px 0; }
    .cal-day { position: relative; padding: 6px 0; font-size: 12px; border-radius: 8px; cursor: pointer; }
    .cal-day.today { font-weight: 700; color: var(--green); }
    .cal-day .cal-dots { position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; }
    .cal-dot { width: 6px; height: 6px; border-radius: 50%; }
    .cal-dot.video { background: #ef4444; }
    .cal-dot.manual { background: #22c55e; }
    .cal-day.empty { color: transparent; cursor: default; }
    .memo-modal { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.4); display: none; justify-content: center; align-items: center; padding: 24px; }
    .memo-modal.show { display: flex; }
    .memo-box { background: #fff; border-radius: 16px; padding: 24px; width: 100%; max-width: 320px; }
    .memo-box h3 { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: var(--green); }
    .memo-box input { width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; margin-bottom: 12px; }
    .memo-box .memo-btns { display: flex; gap: 8px; }
    .memo-box .memo-btns button { flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .cal-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .cal-nav button { background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; color: var(--text-sub); }
    .cal-nav span { font-size: 14px; font-weight: 600; }
    .goal-display { background: var(--green-light); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--green); font-weight: 600; margin-top: 8px; }
    .goal-input { width: 100%; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; }
    .video-modal { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.85); display: none; flex-direction: column; }
    .video-modal.show { display: flex; }
    .video-modal-close { color: #fff; font-size: 28px; padding: 12px 16px; cursor: pointer; text-align: right; }
    .video-modal iframe { flex: 1; width: 100%; border: none; }
    .category-pills { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }
    .category-pills::-webkit-scrollbar { display: none; }
    .pill { flex-shrink: 0; padding: 5px 12px; border-radius: 14px; font-size: 11px; font-weight: 600; background: #f0f0f0; color: var(--text-sub); cursor: pointer; border: none; }
    .pill.active { background: var(--green); color: #fff; }
    .live-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #fff; }
    .live-upcoming { background: #2563eb; }
    .live-archive { background: #6b7280; }
  `;
}

function bottomNavHTML(activePage: string, workersUrl: string): string {
  const pages = [
    { key: 'home', label: 'ホーム', href: `${workersUrl}/liff/home`, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { key: 'live', label: 'Live', href: `${workersUrl}/liff/live`, icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { key: 'videos', label: '動画', href: `${workersUrl}/liff/videos`, icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'mypage', label: 'マイページ', href: `${workersUrl}/liff/mypage`, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];
  return `<nav class="bottom-nav">${pages.map(p =>
    `<a href="${p.href}" class="${p.key === activePage ? 'active' : ''}">` +
    `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p.icon}"/></svg>${p.label}</a>`
  ).join('')}</nav>`;
}

function liffInitScript(liffId: string, workersUrl: string): string {
  return `
    var LIFF_ID = '${liffId.replace(/'/g, "\\'")}';
    var API = '${workersUrl.replace(/'/g, "\\'")}';
    var friendId = null;

    function initLiff() {
      return liff.init({ liffId: LIFF_ID }).then(function() {
        if (!liff.isLoggedIn()) { liff.login(); return Promise.reject('login'); }
        return liff.getProfile();
      }).then(function(profile) {
        if (!profile) return Promise.reject('no profile');
        return fetch(API + '/api/liff/profile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineUserId: profile.userId }),
        }).then(function(r) { return r.json(); });
      }).then(function(data) {
        if (data && data.success && data.data) { friendId = data.data.id; return friendId; }
        return Promise.reject('friend not found');
      });
    }
    function fmtDate(iso) { if (!iso) return '-'; return new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' }); }
    function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  `;
}

// ─── LIFF マイページ エントリーポイント ──────────────────────────

/**
 * GET /liff — LIFF SDK を読み込み、プロフィール取得後にマイページへ遷移
 */
liffRoutes.get('/liff', (c) => {
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const workersUrl = new URL(c.req.url).origin;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>整体卒業サロン</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif; background: #f7f7f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #1a6b5a; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader p { font-size: 14px; color: #888; }
    .error { color: #e53e3e; font-size: 14px; text-align: center; padding: 24px; }
    .error button { margin-top: 12px; padding: 10px 24px; background: #1a6b5a; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="loader" id="loader">
    <div class="spinner"></div>
    <p>読み込み中...</p>
  </div>
  <div class="error" id="error" style="display:none">
    <p id="errorMsg">エラーが発生しました</p>
    <button onclick="location.reload()">再試行</button>
  </div>
  <script>
    var LIFF_ID = '${escapeHtml(liffId)}';
    var API_BASE = '${escapeHtml(workersUrl)}';

    function showError(msg) {
      document.getElementById('loader').style.display = 'none';
      document.getElementById('error').style.display = 'block';
      document.getElementById('errorMsg').textContent = msg || 'エラーが発生しました';
    }

    liff.init({ liffId: LIFF_ID })
      .then(function() {
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        return liff.getProfile();
      })
      .then(function(profile) {
        if (!profile) return;
        // LINE userId からfriendIdを取得してマイページへリダイレクト
        return fetch(API_BASE + '/api/liff/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineUserId: profile.userId }),
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success && data.data && data.data.id) {
            window.location.replace(API_BASE + '/api/membership/' + data.data.id);
          } else {
            showError('ユーザー情報が見つかりません。LINEで友だち追加してからお試しください。');
          }
        });
      })
      .catch(function(err) {
        console.error('LIFF error:', err);
        showError('LINEログインに失敗しました: ' + (err.message || err));
      });
  </script>
</body>
</html>`);
});

// ─── 入会フロー (/liff/signup) ───────────────────────────────────
// フォーム入力（顧客情報 + 利用規約同意）→ Stripe Checkout → 入会完了
// 回答済みの場合は自動でCheckoutにスキップ

liffRoutes.get('/liff/signup', (c) => {
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const workersUrl = new URL(c.req.url).origin;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>整体卒業サロン - 入会手続き</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root { --green: #1a6b5a; --green-light: #e8f5f0; --bg: #f7f7f5; --card: #fff; --text: #333; --text-sub: #888; --border: #e0e0e0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    .header { background: var(--green); color: #fff; padding: 20px 16px; text-align: center; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p { font-size: 12px; opacity: 0.8; margin-top: 4px; }
    .container { max-width: 480px; margin: 0 auto; padding: 16px; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 16px; }
    .step-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: var(--green); background: var(--green-light); margin-bottom: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
    .form-label .required { color: #e53e3e; font-size: 11px; margin-left: 4px; }
    .form-input, .form-select, .form-textarea { width: 100%; padding: 11px 12px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 15px; font-family: inherit; outline: none; transition: border-color 0.2s; -webkit-appearance: none; }
    .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--green); }
    .form-textarea { resize: vertical; min-height: 80px; }
    .form-select { background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 12px center; }
    .checkbox-group { display: flex; align-items: flex-start; gap: 10px; padding: 14px; background: #f9fafb; border-radius: 8px; border: 1.5px solid var(--border); }
    .checkbox-group input[type="checkbox"] { width: 20px; height: 20px; margin-top: 2px; flex-shrink: 0; accent-color: var(--green); }
    .checkbox-group label { font-size: 13px; line-height: 1.5; color: var(--text-sub); }
    .checkbox-group a { color: var(--green); text-decoration: underline; }
    .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; text-align: center; transition: opacity 0.15s; font-family: inherit; }
    .btn:active { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-green { background: var(--green); color: #fff; }
    .error-msg { color: #e53e3e; font-size: 12px; margin-top: 4px; display: none; }
    .loader { text-align: center; padding: 60px 20px; }
    .spinner { width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: var(--green); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader p { font-size: 13px; color: var(--text-sub); }
    .skip-msg { text-align: center; padding: 40px 20px; }
    .skip-msg p { font-size: 14px; color: var(--text-sub); margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>整体卒業サロン</h1>
    <p>入会手続き</p>
  </div>

  <div class="container">
    <!-- ローディング -->
    <div id="loading" class="loader">
      <div class="spinner"></div>
      <p>読み込み中...</p>
    </div>

    <!-- 回答済み → Checkoutへスキップ -->
    <div id="skipView" style="display:none" class="skip-msg">
      <div class="card">
        <p>登録情報を確認しました。<br>決済画面に移動します...</p>
        <div class="spinner" style="margin-top:16px"></div>
      </div>
    </div>

    <!-- フォーム -->
    <div id="formView" style="display:none">
      <div class="card">
        <span class="step-badge">STEP 1 / 2</span>
        <p style="font-size:14px;font-weight:600;margin-bottom:16px">お客様情報の入力</p>

        <div class="form-group">
          <label class="form-label">お名前 <span class="required">*必須</span></label>
          <input class="form-input" id="fName" type="text" placeholder="山田 太郎" autocomplete="name">
          <p class="error-msg" id="errName">お名前を入力してください</p>
        </div>

        <div class="form-group">
          <label class="form-label">メールアドレス <span class="required">*必須</span></label>
          <input class="form-input" id="fEmail" type="email" placeholder="example@email.com" autocomplete="email">
          <p class="error-msg" id="errEmail">正しいメールアドレスを入力してください</p>
        </div>

        <div class="form-group">
          <label class="form-label">電話番号</label>
          <input class="form-input" id="fPhone" type="tel" placeholder="090-1234-5678" autocomplete="tel">
        </div>

        <div class="form-group">
          <label class="form-label">お体のお悩み</label>
          <select class="form-select" id="fConcern">
            <option value="">選択してください</option>
            <option value="neck_shoulder">首・肩のこり</option>
            <option value="back">背中の痛み・猫背</option>
            <option value="waist">腰痛</option>
            <option value="pelvis">骨盤の歪み</option>
            <option value="whole_body">全身のだるさ・疲労</option>
            <option value="other">その他</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">サロンへの期待・ご質問（任意）</label>
          <textarea class="form-textarea" id="fMessage" placeholder="気になることがあればお書きください"></textarea>
        </div>
      </div>

      <div class="card">
        <span class="step-badge">STEP 2 / 2</span>
        <p style="font-size:14px;font-weight:600;margin-bottom:16px">利用規約への同意</p>

        <div class="checkbox-group" style="margin-bottom:12px">
          <input type="checkbox" id="fTerms">
          <label for="fTerms"><a href="https://seitai-graduation-salon.vercel.app/terms" target="_blank">利用規約</a>および<a href="https://seitai-graduation-salon.vercel.app/privacy" target="_blank">プライバシーポリシー</a>に同意します</label>
        </div>
        <p class="error-msg" id="errTerms">利用規約への同意が必要です</p>

        <button class="btn btn-green" id="submitBtn" onclick="handleSubmit()" style="margin-top:16px">
          決済画面へ進む
        </button>
      </div>
    </div>

    <!-- エラー -->
    <div id="errorView" style="display:none">
      <div class="card" style="text-align:center">
        <p id="errorMsg" style="color:#e53e3e;font-size:14px;margin-bottom:16px">エラーが発生しました</p>
        <button class="btn btn-green" onclick="location.reload()">再試行</button>
      </div>
    </div>
  </div>

  <script>
    var LIFF_ID = '${escapeHtml(liffId)}';
    var API = '${escapeHtml(workersUrl)}';
    var friendId = null;
    var lineUserId = null;

    function showView(id) {
      ['loading','formView','skipView','errorView'].forEach(function(v) {
        document.getElementById(v).style.display = v === id ? '' : 'none';
      });
    }

    function showError(msg) {
      document.getElementById('errorMsg').textContent = msg || 'エラーが発生しました';
      showView('errorView');
    }

    // LIFF初期化 → プロフィール取得 → 回答済みチェック
    liff.init({ liffId: LIFF_ID })
      .then(function() {
        if (!liff.isLoggedIn()) { liff.login(); return; }
        return liff.getProfile();
      })
      .then(function(profile) {
        if (!profile) return;
        lineUserId = profile.userId;

        // friendIdを取得
        return fetch(API + '/api/liff/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineUserId: profile.userId }),
        }).then(function(r) { return r.json(); });
      })
      .then(function(data) {
        if (!data || !data.success || !data.data) {
          showError('ユーザー情報が見つかりません。LINEで友だち追加してからお試しください。');
          return;
        }
        friendId = data.data.id;

        // 回答済みかチェック（metadataにsignup_completedがあるか）
        return fetch(API + '/api/liff/signup-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ friendId: friendId }),
        }).then(function(r) { return r.json(); });
      })
      .then(function(check) {
        if (!check) return;
        if (check.data && check.data.alreadySignedUp) {
          // 回答済み → 既に有料会員か確認
          if (check.data.isActive) {
            // 既に会員 → マイページへ
            window.location.replace(API + '/api/membership/' + friendId);
            return;
          }
          // 回答済みだが未決済 → Checkoutへスキップ
          showView('skipView');
          startCheckout();
        } else {
          // 未回答 → フォーム表示
          if (check.data && check.data.displayName) {
            document.getElementById('fName').value = check.data.displayName;
          }
          showView('formView');
        }
      })
      .catch(function(err) {
        console.error('Init error:', err);
        showError('LINEログインに失敗しました: ' + (err.message || err));
      });

    function handleSubmit() {
      // バリデーション
      var name = document.getElementById('fName').value.trim();
      var email = document.getElementById('fEmail').value.trim();
      var terms = document.getElementById('fTerms').checked;
      var valid = true;

      document.getElementById('errName').style.display = name ? 'none' : 'block';
      if (!name) valid = false;

      var emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
      document.getElementById('errEmail').style.display = emailOk ? 'none' : 'block';
      if (!emailOk) valid = false;

      document.getElementById('errTerms').style.display = terms ? 'none' : 'block';
      if (!terms) valid = false;

      if (!valid) return;

      var btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = '送信中...';

      // フォームデータ送信
      fetch(API + '/api/liff/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: friendId,
          name: name,
          email: email,
          phone: document.getElementById('fPhone').value.trim(),
          concern: document.getElementById('fConcern').value,
          message: document.getElementById('fMessage').value.trim(),
          termsAgreedAt: new Date().toISOString(),
        }),
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.success) {
          startCheckout();
        } else {
          btn.disabled = false;
          btn.textContent = '決済画面へ進む';
          alert(d.error || 'エラーが発生しました');
        }
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = '決済画面へ進む';
        alert('通信エラーが発生しました');
      });
    }

    function startCheckout() {
      fetch(API + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: friendId }),
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.success && d.data.url) {
          window.location.href = d.data.url;
        } else {
          showError(d.error || '決済セッションの作成に失敗しました');
        }
      })
      .catch(function() {
        showError('通信エラーが発生しました');
      });
    }
  </script>
</body>
</html>`);
});

// ─── 入会チェックAPI ─────────────────────────────────────────────

liffRoutes.post('/api/liff/signup-check', async (c) => {
  try {
    const { friendId } = await c.req.json<{ friendId: string }>();
    const db = c.env.DB;

    const friend = await db
      .prepare(`SELECT display_name, metadata, subscription_status FROM friends WHERE id = ?`)
      .bind(friendId)
      .first<{ display_name: string | null; metadata: string | null; subscription_status: string | null }>();

    if (!friend) {
      return c.json({ success: true, data: { alreadySignedUp: false } });
    }

    const meta = friend.metadata ? JSON.parse(friend.metadata) : {};
    const isActive = friend.subscription_status === 'active' || friend.subscription_status === 'trialing';

    return c.json({
      success: true,
      data: {
        alreadySignedUp: !!meta.signup_completed,
        isActive,
        displayName: friend.display_name,
      },
    });
  } catch (err) {
    console.error('POST /api/liff/signup-check error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 入会フォームデータ保存API ───────────────────────────────────

liffRoutes.post('/api/liff/signup', async (c) => {
  try {
    const body = await c.req.json<{
      friendId: string;
      name: string;
      email: string;
      phone?: string;
      concern?: string;
      message?: string;
      termsAgreedAt: string;
    }>();
    const db = c.env.DB;

    // 既存metadataを取得してマージ
    const friend = await db
      .prepare(`SELECT metadata FROM friends WHERE id = ?`)
      .bind(body.friendId)
      .first<{ metadata: string | null }>();

    const existingMeta = friend?.metadata ? JSON.parse(friend.metadata) : {};
    const updatedMeta = {
      ...existingMeta,
      signup_completed: true,
      signup_name: body.name,
      signup_email: body.email,
      signup_phone: body.phone || null,
      signup_concern: body.concern || null,
      signup_message: body.message || null,
      terms_agreed_at: body.termsAgreedAt,
    };

    // friends テーブルを更新（display_name, metadata）
    const now = jstNow();
    await db
      .prepare(
        `UPDATE friends SET display_name = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(body.name, JSON.stringify(updatedMeta), now, body.friendId)
      .run();

    // users テーブルのemailも更新（存在する場合）
    const friendRow = await db
      .prepare(`SELECT user_id FROM friends WHERE id = ?`)
      .bind(body.friendId)
      .first<{ user_id: string | null }>();

    if (friendRow?.user_id && body.email) {
      await db
        .prepare(`UPDATE users SET email = ?, phone = ?, updated_at = ? WHERE id = ?`)
        .bind(body.email, body.phone || null, now, friendRow.user_id)
        .run();
    }

    return c.json({ success: true, data: { saved: true } });
  } catch (err) {
    console.error('POST /api/liff/signup error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 会員ホームページ (/liff/home) ──────────────────────────────

liffRoutes.get('/liff/home', (c) => {
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const w = new URL(c.req.url).origin;
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>ホーム - 整体卒業サロン</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>${memberPageCSS()}</style></head><body>
<div class="header-bar"><h1>整体卒業サロン</h1><p>ホーム</p></div>
<div class="container">
  <div class="card" id="calendarCard"><p class="section-title">&#x1f4c5; アクティビティカレンダー</p><div style="display:flex;gap:12px;font-size:11px;color:var(--text-sub);margin-bottom:8px"><span><span class="cal-dot video" style="display:inline-block;vertical-align:middle"></span> 動画視聴</span><span><span class="cal-dot manual" style="display:inline-block;vertical-align:middle"></span> 手動記録</span></div><div id="calArea"></div><div id="goalArea" style="margin-top:10px"></div></div>
  <div class="memo-modal" id="memoModal"><div class="memo-box"><h3 id="memoDate"></h3><input id="memoInput" placeholder="例: 朝ストレッチ、ヨガ30分"><div class="memo-btns"><button style="background:#f0f0f0;color:var(--text)" onclick="closeMemo()">キャンセル</button><button style="background:var(--green);color:#fff" onclick="saveMemo()">記録する</button></div></div></div>
  <div class="card" id="scheduleCard"><p class="section-title">&#x1f4e1; 次回Live配信</p><p class="empty">読み込み中...</p></div>
  <div class="card" id="newContentCard"><p class="section-title">&#x2728; 新着コンテンツ</p><p class="empty">読み込み中...</p></div>
  <div class="card" id="newsCard"><p class="section-title">&#x1f4e2; お知らせ</p><p class="empty">読み込み中...</p></div>
</div>
${bottomNavHTML('home', w)}
<div class="video-modal" id="videoModal"><div class="video-modal-close" onclick="closeVideo()">&times;</div><iframe id="videoFrame" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
<div class="memo-modal" id="newsModal"><div class="memo-box" style="max-width:360px;max-height:80vh;overflow-y:auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span class="news-badge" id="newsModalBadge"></span><button onclick="closeNewsModal()" style="background:none;border:none;font-size:20px;color:var(--text-sub);cursor:pointer">&times;</button></div><h3 id="newsModalTitle" style="font-size:16px;font-weight:700;margin-bottom:8px"></h3><p id="newsModalDate" style="font-size:11px;color:var(--text-sub);margin-bottom:12px"></p><div id="newsModalBody" style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap"></div></div></div>
<script>
${liffInitScript(liffId, w)}
var calYear, calMonth, activities = [], memoDate = '';

function renderCalendar() {
  var now = new Date();
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  var first = new Date(calYear, calMonth, 1);
  var last = new Date(calYear, calMonth + 1, 0);
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  // 日付ごとにアクティビティタイプを集計
  var dayInfo = {};
  activities.forEach(function(a) {
    var key = a.activity_date.slice(0,10);
    if (!dayInfo[key]) dayInfo[key] = { video: false, manual: false };
    if (a.activity_type === 'video_watch' || a.activity_type === 'live_attend') dayInfo[key].video = true;
    else dayInfo[key].manual = true;
  });

  var h = '<div class="cal-nav"><button onclick="changeMonth(-1)">&lt;</button><span>' + calYear + '年' + (calMonth+1) + '月</span><button onclick="changeMonth(1)">&gt;</button></div>';
  h += '<div class="calendar">';
  ['日','月','火','水','木','金','土'].forEach(function(d) { h += '<div class="cal-header">' + d + '</div>'; });
  for (var i = 0; i < first.getDay(); i++) h += '<div class="cal-day empty">.</div>';
  for (var d = 1; d <= last.getDate(); d++) {
    var ds = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var cls = 'cal-day';
    if (ds === todayStr) cls += ' today';
    var dots = '';
    if (dayInfo[ds]) {
      dots = '<div class="cal-dots">';
      if (dayInfo[ds].video) dots += '<div class="cal-dot video"></div>';
      if (dayInfo[ds].manual) dots += '<div class="cal-dot manual"></div>';
      dots += '</div>';
    }
    h += '<div class="' + cls + '" onclick="openMemo(\\'' + ds + '\\')">' + d + dots + '</div>';
  }
  h += '</div>';
  document.getElementById('calArea').innerHTML = h;
}

function changeMonth(delta) { calMonth += delta; if (calMonth < 0) { calMonth = 11; calYear--; } if (calMonth > 11) { calMonth = 0; calYear++; } loadActivities(); }

function openMemo(date) {
  memoDate = date;
  var parts = date.split('-');
  document.getElementById('memoDate').textContent = parts[1] + '月' + parseInt(parts[2]) + '日の記録';
  document.getElementById('memoInput').value = '';
  document.getElementById('memoModal').classList.add('show');
  document.getElementById('memoInput').focus();
}

function closeMemo() {
  document.getElementById('memoModal').classList.remove('show');
}

function saveMemo() {
  var note = document.getElementById('memoInput').value.trim();
  if (!note || !friendId) return;
  var btn = event.target; btn.disabled = true; btn.textContent = '記録中...';
  fetch(API + '/api/membership/' + friendId + '/activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activityType: 'manual', activityDate: memoDate, note: note }),
  }).then(function() { btn.disabled = false; btn.textContent = '記録する'; closeMemo(); loadActivities(); }).catch(function() { btn.disabled = false; btn.textContent = '記録する'; alert('記録に失敗しました'); });
}

function loadActivities() {
  if (!friendId) return;
  var monthKey = calYear + '-' + String(calMonth+1).padStart(2,'0');
  fetch(API + '/api/membership/' + friendId + '/activities?month=' + monthKey)
    .then(function(r) { return r.json(); })
    .then(function(res) { if (res.success) { activities = res.data; renderCalendar(); } });
}

function renderGoal(goal) {
  var el = document.getElementById('goalArea');
  var text = goal ? (goal.goal_text || goal.goalText || '') : '';
  if (text) {
    el.innerHTML = '<div class="goal-display">&#x1f3af; ' + esc(text) + '</div><button style="margin-top:6px;font-size:11px;color:var(--text-sub);background:none;border:none;cursor:pointer" onclick="editGoal()">目標を変更</button>';
  } else {
    el.innerHTML = '<input class="goal-input" id="goalInput" placeholder="今日の目標を設定（例: 毎日5分ストレッチ）"><button class="btn-sm btn-green" style="margin-top:6px" onclick="saveGoal()">設定</button>';
  }
}
function editGoal() {
  document.getElementById('goalArea').innerHTML = '<input class="goal-input" id="goalInput" placeholder="新しい目標"><button class="btn-sm btn-green" style="margin-top:6px" onclick="saveGoal()">保存</button>';
  document.getElementById('goalInput').focus();
}
function saveGoal() {
  var text = document.getElementById('goalInput').value.trim();
  if (!text || !friendId) return;
  var btn = event.target; btn.disabled = true; btn.textContent = '保存中...';
  fetch(API + '/api/membership/' + friendId + '/goals', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goalText: text }),
  }).then(function(r) { return r.json(); }).then(function(d) { if (d.success) renderGoal(d.data); else { btn.disabled = false; btn.textContent = '保存'; } }).catch(function() { btn.disabled = false; btn.textContent = '保存'; });
}

function openVideo(url) { if (!url) return; var e = url; var yt = url.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([^&]+)/); if (yt) e = 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1'; document.getElementById('videoFrame').src = e; document.getElementById('videoModal').classList.add('show'); }
function closeVideo() { document.getElementById('videoFrame').src = ''; document.getElementById('videoModal').classList.remove('show'); }

// News data (グローバルスコープ - openNewsModalからアクセスするため)
var allNews = [];
var newsCats = { info: ['お知らせ','#1a6b5a','#e8f5f0'], event: ['イベント','#d4a853','#faf3e0'], update: ['更新','#2563eb','#eff6ff'], campaign: ['キャンペーン','#dc2626','#fef2f2'] };

// Init
initLiff().then(function() {
  // カレンダー: まず空で描画してからデータ取得
  var now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
  loadActivities();

  // Goal
  fetch(API + '/api/membership/' + friendId + '/goals').then(function(r) { return r.json(); }).then(function(d) { renderGoal(d.success ? d.data : null); });

  // Schedule
  fetch(API + '/api/membership/' + friendId + '/schedule').then(function(r) { return r.json(); }).then(function(res) {
    var el = document.getElementById('scheduleCard');
    if (!res.success || !res.data || !res.data.length) { el.innerHTML = '<p class="section-title">&#x1f4e1; 次回Live配信</p><p class="empty">予定なし</p>'; return; }
    var h = '<p class="section-title">&#x1f4e1; 次回Live配信</p>';
    res.data.slice(0,2).forEach(function(s) { h += '<div class="schedule-item"><div class="schedule-date">' + fmtDate(s.scheduledAt) + '</div><div class="schedule-name">' + esc(s.title) + '</div></div>'; });
    el.innerHTML = h;
  });

  // New Content (latest 3)
  fetch(API + '/api/membership/' + friendId + '/content').then(function(r) { return r.json(); }).then(function(res) {
    var el = document.getElementById('newContentCard');
    if (!res.success || !res.data || !res.data.items || !res.data.items.length) { el.innerHTML = '<p class="section-title">&#x2728; 新着コンテンツ</p><p class="empty">まだありません</p>'; return; }
    var h = '<p class="section-title">&#x2728; 新着コンテンツ</p>';
    res.data.items.slice(0,3).forEach(function(c) {
      h += '<div class="content-card" onclick="openVideo(\\'' + (c.videoUrl||'').replace(/'/g,'') + '\\')">' +
        '<img class="content-thumb" src="' + esc(c.thumbnailUrl||'') + '" onerror="this.style.background=&quot;#e0e0e0&quot;">' +
        '<div class="content-info"><div class="content-title">' + esc(c.title) + '</div><div class="content-meta">' + esc(c.category) + '</div></div></div>';
    });
    el.innerHTML = h;
  });

  // News
  fetch(API + '/api/membership/' + friendId + '/news?limit=5').then(function(r) { return r.json(); }).then(function(res) {
    var el = document.getElementById('newsCard');
    if (!res.success || !res.data || !res.data.length) { el.innerHTML = '<p class="section-title">&#x1f4e2; お知らせ</p><p class="empty">お知らせはありません</p>'; return; }
    allNews = res.data;
    var h = '<p class="section-title">&#x1f4e2; お知らせ</p>';
    res.data.forEach(function(n, i) { var cat = newsCats[n.category] || newsCats.info; h += '<div class="news-item" style="cursor:pointer" onclick="openNewsModal(' + i + ')"><span class="news-badge" style="color:' + cat[0] + ';background:' + cat[2] + '">' + cat[0] + '</span><div class="news-title">' + esc(n.title) + '</div><div class="news-date">' + fmtDate(n.publishedAt) + '</div></div>'; });
    el.innerHTML = h;
  });
}).catch(function(e) { if (e !== 'login') console.error(e); });

function openNewsModal(idx) {
  var n = allNews[idx]; if (!n) return;
  var cat = newsCats[n.category] || newsCats.info;
  document.getElementById('newsModalBadge').textContent = cat[0];
  document.getElementById('newsModalBadge').style.color = cat[0];
  document.getElementById('newsModalBadge').style.background = cat[2];
  document.getElementById('newsModalTitle').textContent = n.title;
  document.getElementById('newsModalDate').textContent = fmtDate(n.publishedAt);
  document.getElementById('newsModalBody').textContent = n.body;
  document.getElementById('newsModal').classList.add('show');
}
function closeNewsModal() { document.getElementById('newsModal').classList.remove('show'); }
</script></body></html>`);
});

// ─── Live配信ページ (/liff/live) ─────────────────────────────────

liffRoutes.get('/liff/live', (c) => {
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const w = new URL(c.req.url).origin;
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Live配信 - 整体卒業サロン</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>${memberPageCSS()}</style></head><body>
<div class="header-bar"><h1>整体卒業サロン</h1><p>Live配信</p></div>
<div class="container">
  <div class="card" id="upcomingCard"><p class="section-title">&#x1f4e1; 今後のLive配信</p><p class="empty">読み込み中...</p></div>
  <div class="card" id="archiveCard"><p class="section-title">&#x1f4fc; アーカイブ</p><p class="empty">読み込み中...</p></div>
</div>
${bottomNavHTML('live', w)}
<div class="video-modal" id="videoModal"><div class="video-modal-close" onclick="closeVideo()">&times;</div><iframe id="videoFrame" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
<script>
${liffInitScript(liffId, w)}
function openVideo(url) { if (!url) return; var e = url; var yt = url.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([^&]+)/); if (yt) e = 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1'; document.getElementById('videoFrame').src = e; document.getElementById('videoModal').classList.add('show'); }
function closeVideo() { document.getElementById('videoFrame').src = ''; document.getElementById('videoModal').classList.remove('show'); }

initLiff().then(function() {
  // Upcoming
  fetch(API + '/api/membership/' + friendId + '/schedule').then(function(r) { return r.json(); }).then(function(res) {
    var el = document.getElementById('upcomingCard');
    if (!res.success || !res.data || !res.data.length) { el.innerHTML = '<p class="section-title">&#x1f4e1; 今後のLive配信</p><p class="empty">現在予定はありません</p>'; return; }
    var h = '<p class="section-title">&#x1f4e1; 今後のLive配信</p>';
    res.data.forEach(function(s) {
      h += '<div class="schedule-item"><div style="display:flex;justify-content:space-between;align-items:center"><div><div class="schedule-date">' + fmtDate(s.scheduledAt) + '</div><div class="schedule-name">' + esc(s.title) + '</div></div>';
      if (s.liveUrl) h += '<a href="' + esc(s.liveUrl) + '" target="_blank" class="btn-sm btn-green" style="text-decoration:none">参加</a>';
      h += '</div>';
      if (s.description) h += '<div style="font-size:12px;color:var(--text-sub);margin-top:4px">' + esc(s.description) + '</div>';
      h += '</div>';
    });
    el.innerHTML = h;
  });

  // Archives (contents with category=archive)
  fetch(API + '/api/membership/' + friendId + '/content').then(function(r) { return r.json(); }).then(function(res) {
    var el = document.getElementById('archiveCard');
    if (!res.success || !res.data || !res.data.items) { el.innerHTML = '<p class="section-title">&#x1f4fc; アーカイブ</p><p class="empty">まだありません</p>'; return; }
    var archives = res.data.items.filter(function(c) { return c.category === 'archive'; });
    if (!archives.length) { el.innerHTML = '<p class="section-title">&#x1f4fc; アーカイブ</p><p class="empty">まだありません</p>'; return; }
    var h = '<p class="section-title">&#x1f4fc; アーカイブ</p>';
    archives.forEach(function(c) {
      h += '<div class="content-card" onclick="openVideo(\\'' + (c.videoUrl||'').replace(/'/g,'') + '\\')">' +
        '<img class="content-thumb" src="' + esc(c.thumbnailUrl||'') + '" onerror="this.style.background=&quot;#e0e0e0&quot;">' +
        '<div class="content-info"><div class="content-title">' + esc(c.title) + '</div></div></div>';
    });
    el.innerHTML = h;
  });
}).catch(function(e) { if (e !== 'login') console.error(e); });
</script></body></html>`);
});

// ─── 動画コンテンツページ (/liff/videos) ─────────────────────────

liffRoutes.get('/liff/videos', (c) => {
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const w = new URL(c.req.url).origin;
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>動画コンテンツ - 整体卒業サロン</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>${memberPageCSS()}</style></head><body>
<div class="header-bar"><h1>整体卒業サロン</h1><p>動画コンテンツ</p></div>
<div class="container">
  <div class="category-pills" id="pills"></div>
  <div class="card" id="videoList"><p class="empty">読み込み中...</p></div>
</div>
${bottomNavHTML('videos', w)}
<div class="video-modal" id="videoModal"><div class="video-modal-close" onclick="closeVideo()">&times;</div><iframe id="videoFrame" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
<script>
${liffInitScript(liffId, w)}
var allVideos = [], selectedCat = 'all';
var CATS = [{key:'all',label:'すべて'},{key:'neck_shoulder',label:'首・肩'},{key:'back_chest',label:'背中・胸'},{key:'pelvis_waist',label:'骨盤・腰'},{key:'morning_routine',label:'朝ルーティン'}];
var CAT_LABELS = {neck_shoulder:'首・肩',back_chest:'背中・胸',pelvis_waist:'骨盤・腰',morning_routine:'朝ルーティン',archive:'アーカイブ'};

function fmtDur(s) { if (!s) return ''; var m = Math.floor(s/60), ss = s%60; return m + ':' + (ss<10?'0':'') + ss; }
function renderPills() { var h = ''; CATS.forEach(function(c) { h += '<button class="pill' + (c.key===selectedCat?' active':'') + '" onclick="filterCat(\\'' + c.key + '\\')">' + c.label + '</button>'; }); document.getElementById('pills').innerHTML = h; }
function filterCat(cat) { selectedCat = cat; renderPills(); renderList(); }
function renderList() {
  var items = selectedCat === 'all' ? allVideos.filter(function(c){return c.category!=='archive';}) : allVideos.filter(function(c){return c.category===selectedCat;});
  var el = document.getElementById('videoList');
  if (!items.length) { el.innerHTML = '<p class="empty">コンテンツはまだありません</p>'; return; }
  var h = '';
  items.forEach(function(c) {
    h += '<div class="content-card" onclick="watchVideo(\\'' + c.id + '\\',\\'' + (c.videoUrl||'').replace(/'/g,'') + '\\')">' +
      '<img class="content-thumb" src="' + esc(c.thumbnailUrl||'') + '" onerror="this.style.background=&quot;#e0e0e0&quot;">' +
      '<div class="content-info"><div class="content-title">' + esc(c.title) + '</div><div class="content-meta">' + (CAT_LABELS[c.category]||c.category) + (c.duration?' ・ '+fmtDur(c.duration):'') + '</div></div></div>';
  });
  el.innerHTML = h;
}
function watchVideo(contentId, url) {
  openVideo(url);
  // Record activity
  if (friendId) {
    var now = new Date(); var ds = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    fetch(API + '/api/membership/' + friendId + '/activities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityType: 'video_watch', contentId: contentId, activityDate: ds }),
    });
  }
}
function openVideo(url) { if (!url) return; var e = url; var yt = url.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([^&]+)/); if (yt) e = 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1'; document.getElementById('videoFrame').src = e; document.getElementById('videoModal').classList.add('show'); }
function closeVideo() { document.getElementById('videoFrame').src = ''; document.getElementById('videoModal').classList.remove('show'); }

initLiff().then(function() {
  renderPills();
  fetch(API + '/api/membership/' + friendId + '/content').then(function(r) { return r.json(); }).then(function(res) {
    if (res.success && res.data && res.data.items) { allVideos = res.data.items; }
    renderList();
  });
}).catch(function(e) { if (e !== 'login') console.error(e); });
</script></body></html>`);
});

// ─── マイページ (/liff/mypage) ───────────────────────────────────

liffRoutes.get('/liff/mypage', (c) => {
  const w = new URL(c.req.url).origin;
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>マイページ - 整体卒業サロン</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>${memberPageCSS()}
  .profile-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .profile-header img { width: 48px; height: 48px; border-radius: 50%; }
  .profile-name { font-size: 16px; font-weight: 700; }
  .profile-sub { font-size: 12px; color: var(--text-sub); }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 16px; font-size: 12px; font-weight: 700; color: #fff; }
  .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: var(--text-sub); }
  .info-value { font-weight: 600; }
  .btn-outline { background: var(--card); color: #e53e3e; border: 1.5px solid #e53e3e; }
  .btn-secondary { background: #f0f0f0; color: var(--text); }
  .invoice-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .invoice-row:last-child { border-bottom: none; }
</style></head><body>
<div class="header-bar"><h1>整体卒業サロン</h1><p>マイページ</p></div>
<div class="container">
  <div id="loading"><p class="empty">読み込み中...</p></div>
  <div id="profileCard" style="display:none" class="card"></div>
  <div id="statusCard" style="display:none" class="card"></div>
  <div id="planCard" style="display:none" class="card"></div>
  <div id="invoiceCard" style="display:none" class="card"></div>
  <div id="actionsCard" style="display:none" class="card"></div>
</div>
${bottomNavHTML('mypage', w)}
<script>
${liffInitScript(liffId, w)}
var STATUS_MAP = {
  active: { label: 'アクティブ', color: '#1a6b5a' },
  trialing: { label: 'アクティブ', color: '#1a6b5a' },
  paused: { label: '休会中', color: '#d4a853' },
  cancel_scheduled: { label: '退会予定', color: '#ef4444' },
  incomplete: { label: '入金待ち', color: '#3b82f6' },
  past_due: { label: '支払い未完了', color: '#f59e0b' },
  canceled: { label: '解約済み', color: '#999' }
};
function isMember(s) { return s === 'active' || s === 'trialing' || s === 'paused' || s === 'cancel_scheduled'; }

var profileName = '', profilePic = '';

initLiff().then(function() {
  // LINEプロフィール取得
  return liff.getProfile();
}).then(function(profile) {
  profileName = profile.displayName;
  profilePic = profile.pictureUrl || '';

  // 会員ステータス取得
  return fetch(API + '/api/membership/' + friendId, {
    headers: { 'Accept': 'application/json' }
  }).then(function(r) { return r.json(); });
}).then(function(res) {
  document.getElementById('loading').style.display = 'none';

  if (!res.success) { document.getElementById('loading').innerHTML = '<p class="empty">データの取得に失敗しました</p>'; document.getElementById('loading').style.display = ''; return; }
  var d = res.data;
  var s = d.subscriptionStatus || 'none';
  var info = STATUS_MAP[s] || { label: '未登録', color: '#999' };

  // プロフィール
  var pc = document.getElementById('profileCard'); pc.style.display = '';
  pc.innerHTML = '<div class="profile-header">' +
    (profilePic ? '<img src="' + esc(profilePic) + '">' : '<div style="width:48px;height:48px;border-radius:50%;background:#e0e0e0;display:flex;align-items:center;justify-content:center;font-size:18px;color:#999">' + esc(profileName[0] || '?') + '</div>') +
    '<div><div class="profile-name">' + esc(profileName) + '</div><div class="profile-sub">整体卒業サロン</div></div></div>';

  // ステータスバッジ
  var sc = document.getElementById('statusCard'); sc.style.display = '';
  var sh = '<div style="text-align:center"><span class="status-badge" style="background:' + info.color + '">' + info.label + '</span></div>';
  if (isMember(s)) {
    sh += '<div class="info-row"><span class="info-label">プラン</span><span class="info-value">月額 2,980円</span></div>';
    sh += '<div class="info-row"><span class="info-label">' + (s === 'cancel_scheduled' ? '利用可能期限' : '次回請求日') + '</span><span class="info-value">' + fmtDate(d.currentPeriodEnd) + '</span></div>';
  }
  if (s === 'paused') sh += '<p style="font-size:12px;color:#92400e;margin-top:10px;text-align:center">現在休会中です。課金は停止されています。</p>';
  if (s === 'cancel_scheduled') sh += '<p style="font-size:12px;color:#ef4444;margin-top:10px;text-align:center">退会予定です。' + fmtDate(d.currentPeriodEnd) + 'まで利用できます。</p>';
  if (!isMember(s) && s !== 'incomplete' && s !== 'past_due') {
    sh += '<div style="margin-top:16px;text-align:center"><p style="font-size:13px;color:var(--text-sub);margin-bottom:12px">月額 2,980円（税込）</p>';
    sh += '<button class="btn btn-green" onclick="location.href=\\'' + API + '/liff/signup\\'">メンバーシップに登録する</button></div>';
  }
  sc.innerHTML = sh;

  // プラン情報
  if (isMember(s) || s === 'past_due') {
    var plc = document.getElementById('planCard'); plc.style.display = '';
    plc.innerHTML = '<p class="section-title">&#x1f4cb; プラン情報</p>' +
      '<a href="https://liff.line.me/2009595752-X90IWgrz?page=mypage" class="btn btn-secondary" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px">領収書を発行する</a>' +
      '<button class="btn btn-secondary" onclick="openPortal()">お支払い方法を変更する</button>';
  }

  // 支払い履歴
  if (d.stripeCustomerId) {
    fetch(API + '/api/membership/' + friendId + '/invoices').then(function(r) { return r.json(); }).then(function(inv) {
      var ic = document.getElementById('invoiceCard'); ic.style.display = '';
      if (!inv.success || !inv.data || !inv.data.length) { ic.innerHTML = '<p class="section-title">&#x1f4b3; 支払い履歴</p><p class="empty">支払い履歴はありません</p>'; return; }
      var h = '<p class="section-title">&#x1f4b3; 支払い履歴</p>';
      inv.data.forEach(function(i) { h += '<div class="invoice-row"><div>' + fmtDate(i.createdAt) + '</div><div style="display:flex;align-items:center;gap:8px"><strong>&yen;' + (i.amount/100).toLocaleString() + '</strong>' + (i.receiptUrl ? '<a href="' + i.receiptUrl + '" target="_blank" style="color:var(--green);font-size:11px">領収書</a>' : '') + '</div></div>'; });
      ic.innerHTML = h;
    });
  }

  // アカウント管理
  if (isMember(s) || s === 'past_due') {
    var ac = document.getElementById('actionsCard'); ac.style.display = '';
    var ah = '<p class="section-title">&#x2699;&#xfe0f; アカウント管理</p>';
    if (s === 'active') ah += '<button class="btn btn-secondary" style="margin-bottom:8px" onclick="doAction(\\'/pause\\',this,\\'休会する\\',\\'休会しますか？課金が停止されます。\\')">休会する</button><button class="btn btn-outline" onclick="doAction(\\'/cancel\\',this,\\'退会する\\',\\'退会しますか？現在の請求期間末まで利用できます。\\')">退会する</button>';
    else if (s === 'paused') ah += '<button class="btn btn-green" style="margin-bottom:8px" onclick="doAction(\\'/resume\\',this,\\'復帰する\\',null)">復帰する</button><button class="btn btn-outline" onclick="doAction(\\'/cancel\\',this,\\'退会する\\',\\'退会しますか？\\')">退会する</button>';
    else if (s === 'cancel_scheduled') ah += '<button class="btn btn-green" onclick="undoCancel()">退会をキャンセルする</button>';
    else if (s === 'past_due') ah += '<button class="btn btn-secondary" onclick="openPortal()">お支払い方法を更新する</button>';
    ac.innerHTML = ah;
  }
}).catch(function(e) { if (e !== 'login') { document.getElementById('loading').innerHTML = '<p class="empty">エラーが発生しました</p>'; console.error(e); } });

function openPortal() {
  var btn = event.target; btn.disabled = true; btn.textContent = '処理中...';
  fetch(API + '/api/membership/' + friendId + '/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function(r) { return r.json(); }).then(function(d) { if (d.success && d.data.url) window.location.href = d.data.url; else { alert(d.error || 'エラー'); btn.disabled = false; btn.textContent = 'お支払い方法を変更する'; } });
}
function doAction(path, btn, label, msg) {
  if (msg && !confirm(msg)) return;
  btn.disabled = true; btn.textContent = '処理中...';
  fetch(API + '/api/membership/' + friendId + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function(r) { return r.json(); }).then(function(d) { if (d.success) location.reload(); else { alert(d.error || 'エラー'); btn.disabled = false; btn.textContent = label; } });
}
function undoCancel() {
  var btn = event.target; btn.disabled = true; btn.textContent = '処理中...';
  fetch(API + '/api/membership/' + friendId + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undo: true }) })
    .then(function(r) { return r.json(); }).then(function(d) { if (d.success) location.reload(); else { alert(d.error || 'エラー'); btn.disabled = false; btn.textContent = '退会をキャンセルする'; } });
}
</script></body></html>`);
});

// ─── Short Link Landing Page (/r/:ref) ──────────────────────────
// X（Twitter）等のアプリ内ブラウザからLIFFを直接開けないため、
// このページを中継してLINEアプリで開く。SNS集客用。

liffRoutes.get('/r/:ref', (c) => {
  const ref = c.req.param('ref');
  const liffId = (c.env as unknown as Record<string, string | undefined>).LIFF_ID || DEFAULT_LIFF_ID;
  const liffUrl = `https://liff.line.me/${liffId}?ref=${encodeURIComponent(ref)}`;
  const lineAddUrl = `https://line.me/R/ti/p/@${(c.env as unknown as Record<string, string | undefined>).LINE_CHANNEL_ID || ''}`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>整体卒業サロン</title>
  <meta property="og:title" content="整体卒業サロン - 体の不調を自分で解消">
  <meta property="og:description" content="セルフケア動画見放題・週1 Live配信・コミュニティ参加。月額2,980円">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif; background: linear-gradient(135deg, #e8f5f0 0%, #f7f7f5 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border-radius: 20px; padding: 32px 24px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .logo { width: 64px; height: 64px; background: #1a6b5a; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: 700; margin: 0 auto 16px; }
    h1 { font-size: 20px; color: #333; margin-bottom: 8px; }
    .desc { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
    .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; text-decoration: none; margin-bottom: 10px; transition: opacity 0.15s; }
    .btn:active { opacity: 0.85; }
    .btn-line { background: #06C755; color: #fff; }
    .btn-web { background: #f0f0f0; color: #333; font-size: 14px; }
    .note { font-size: 11px; color: #aaa; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">卒</div>
    <h1>整体卒業サロン</h1>
    <p class="desc">体の不調を自分で解消できるようになる<br>オンラインサロン</p>
    <a class="btn btn-line" href="${escapeHtml(liffUrl)}">LINEで開く 💬</a>
    <a class="btn btn-web" href="${escapeHtml(liffUrl)}">ブラウザで開く</a>
    <p class="note">LINEアプリが開きます。<br>友だち追加がまだの方は自動で追加されます。</p>
  </div>
</body>
</html>`);
});

// ─── LINE Login OAuth (bot_prompt=aggressive) ───────────────────

/**
 * GET /auth/line — redirect to LINE Login with bot_prompt=aggressive
 *
 * This is THE friend-add URL. Put this on LPs, SNS, ads.
 * Query params:
 *   ?ref=xxx     — attribution tracking
 *   ?redirect=url — redirect after completion
 *   ?gclid=xxx   — Google Ads click ID
 *   ?fbclid=xxx  — Meta Ads click ID
 *   ?utm_source=xxx, utm_medium, utm_campaign, utm_content, utm_term — UTM params
 */
liffRoutes.get('/auth/line', (c) => {
  const ref = c.req.query('ref') || '';
  const redirect = c.req.query('redirect') || '';
  const gclid = c.req.query('gclid') || '';
  const fbclid = c.req.query('fbclid') || '';
  const utmSource = c.req.query('utm_source') || '';
  const utmMedium = c.req.query('utm_medium') || '';
  const utmCampaign = c.req.query('utm_campaign') || '';
  const liffUrl = c.env.LIFF_URL;
  const channelId = c.env.LINE_LOGIN_CHANNEL_ID;
  const baseUrl = new URL(c.req.url).origin;
  const callbackUrl = `${baseUrl}/auth/callback`;

  // Build LIFF URL with ref + ad params (for mobile → LINE app)
  const liffParams = new URLSearchParams();
  if (ref) liffParams.set('ref', ref);
  if (redirect) liffParams.set('redirect', redirect);
  if (gclid) liffParams.set('gclid', gclid);
  if (fbclid) liffParams.set('fbclid', fbclid);
  if (utmSource) liffParams.set('utm_source', utmSource);
  const liffTarget = liffParams.toString()
    ? `${liffUrl}?${liffParams.toString()}`
    : liffUrl;

  // Build OAuth URL (for desktop fallback)
  // Pack all tracking params into state so they survive the OAuth redirect
  const state = JSON.stringify({ ref, redirect, gclid, fbclid, utmSource, utmMedium, utmCampaign });
  const encodedState = btoa(state);
  const loginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('client_id', channelId);
  loginUrl.searchParams.set('redirect_uri', callbackUrl);
  loginUrl.searchParams.set('scope', 'profile openid');
  loginUrl.searchParams.set('bot_prompt', 'aggressive');
  loginUrl.searchParams.set('state', encodedState);

  // Serve landing page that opens LINE app on mobile
  return c.html(authLandingPage(liffTarget, loginUrl.toString()));
});

/**
 * GET /auth/callback — LINE Login callback
 *
 * Exchanges code for tokens, extracts sub (UUID), links friend.
 */
liffRoutes.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state') || '';
  const error = c.req.query('error');

  // Parse state (contains ref, redirect, and ad click IDs)
  let ref = '';
  let redirect = '';
  let gclid = '';
  let fbclid = '';
  let utmSource = '';
  let utmMedium = '';
  let utmCampaign = '';
  try {
    const parsed = JSON.parse(atob(stateParam));
    ref = parsed.ref || '';
    redirect = parsed.redirect || '';
    gclid = parsed.gclid || '';
    fbclid = parsed.fbclid || '';
    utmSource = parsed.utmSource || '';
    utmMedium = parsed.utmMedium || '';
    utmCampaign = parsed.utmCampaign || '';
  } catch {
    // ignore
  }

  if (error || !code) {
    return c.html(errorPage(error || 'Authorization failed'));
  }

  try {
    const baseUrl = new URL(c.req.url).origin;
    const callbackUrl = `${baseUrl}/auth/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: c.env.LINE_LOGIN_CHANNEL_ID,
        client_secret: c.env.LINE_LOGIN_CHANNEL_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Token exchange failed:', errText);
      return c.html(errorPage('Token exchange failed'));
    }

    const tokens = await tokenRes.json<{
      access_token: string;
      id_token: string;
      token_type: string;
    }>();

    // Verify ID token to get sub
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: tokens.id_token,
        client_id: c.env.LINE_LOGIN_CHANNEL_ID,
      }),
    });

    if (!verifyRes.ok) {
      return c.html(errorPage('ID token verification failed'));
    }

    const verified = await verifyRes.json<{
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    }>();

    // Get profile via access token
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    let displayName = verified.name || 'Unknown';
    let pictureUrl: string | null = null;
    if (profileRes.ok) {
      const profile = await profileRes.json<{
        userId: string;
        displayName: string;
        pictureUrl?: string;
      }>();
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl || null;
    }

    const db = c.env.DB;
    const lineUserId = verified.sub;

    // Upsert friend (may not exist yet if webhook hasn't fired)
    const friend = await upsertFriend(db, {
      lineUserId,
      displayName,
      pictureUrl,
      statusMessage: null,
    });

    // Create or find user → link
    let userId: string | null = null;

    // Check if already linked
    const existingUserId = (friend as unknown as Record<string, unknown>).user_id as string | null;
    if (existingUserId) {
      userId = existingUserId;
    } else {
      // Try to find by email
      if (verified.email) {
        const existingUser = await getUserByEmail(db, verified.email);
        if (existingUser) userId = existingUser.id;
      }

      // Create new user
      if (!userId) {
        const newUser = await createUser(db, {
          email: verified.email || null,
          displayName,
        });
        userId = newUser.id;
      }

      // Link friend to user
      await linkFriendToUser(db, friend.id, userId);
    }

    // Attribution tracking
    if (ref) {
      // Save ref_code on the friend record (first touch wins — only set if not already set)
      await db
        .prepare(`UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL`)
        .bind(ref, friend.id)
        .run();

      // Look up entry route config
      const route = await getEntryRouteByRefCode(db, ref);

      // Persist tracking event
      await recordRefTracking(db, {
        refCode: ref,
        friendId: friend.id,
        entryRouteId: route?.id ?? null,
        sourceUrl: null,
      });

      if (route) {
        // Auto-tag the friend
        if (route.tag_id) {
          await addTagToFriend(db, friend.id, route.tag_id);
        }
        // Auto-enroll in scenario (scenario_id stored; enrollment handled by scenario engine)
        // Future: call enrollFriendInScenario(db, friend.id, route.scenario_id) here
      }
    }

    // Save ad click IDs + UTM to friend metadata (for future ad API postback)
    const adMeta: Record<string, string> = {};
    if (gclid) adMeta.gclid = gclid;
    if (fbclid) adMeta.fbclid = fbclid;
    if (utmSource) adMeta.utm_source = utmSource;
    if (utmMedium) adMeta.utm_medium = utmMedium;
    if (utmCampaign) adMeta.utm_campaign = utmCampaign;

    if (Object.keys(adMeta).length > 0) {
      const existingMeta = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friend.id)
        .first<{ metadata: string }>();
      const merged = { ...JSON.parse(existingMeta?.metadata || '{}'), ...adMeta };
      await db
        .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), jstNow(), friend.id)
        .run();
    }

    // Redirect or show completion
    if (redirect) {
      return c.redirect(redirect);
    }

    return c.html(completionPage(displayName, pictureUrl, ref));

  } catch (err) {
    console.error('Auth callback error:', err);
    return c.html(errorPage('Internal error'));
  }
});

// ─── Existing LIFF endpoints ────────────────────────────────────

// POST /api/liff/profile - get friend by LINE userId (public, no auth)
liffRoutes.post('/api/liff/profile', async (c) => {
  try {
    const body = await c.req.json<{ lineUserId: string }>();
    if (!body.lineUserId) {
      return c.json({ success: false, error: 'lineUserId is required' }, 400);
    }

    const friend = await getFriendByLineUserId(c.env.DB, body.lineUserId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: friend.id,
        displayName: friend.display_name,
        isFollowing: Boolean(friend.is_following),
        userId: (friend as unknown as Record<string, unknown>).user_id ?? null,
      },
    });
  } catch (err) {
    console.error('POST /api/liff/profile error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/membership - get membership/subscription status by lineUserId (public)
liffRoutes.post('/api/liff/membership', async (c) => {
  try {
    const body = await c.req.json<{ lineUserId: string }>();
    if (!body.lineUserId) {
      return c.json({ success: false, error: 'lineUserId is required' }, 400);
    }

    const friend = await c.env.DB
      .prepare(
        `SELECT id, display_name, subscription_status, subscription_id, current_period_end, stripe_customer_id
         FROM friends WHERE line_user_id = ?`,
      )
      .bind(body.lineUserId)
      .first<{
        id: string;
        display_name: string | null;
        subscription_status: string | null;
        subscription_id: string | null;
        current_period_end: string | null;
        stripe_customer_id: string | null;
      }>();

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        friendId: friend.id,
        displayName: friend.display_name,
        subscriptionStatus: friend.subscription_status,
        subscriptionId: friend.subscription_id,
        currentPeriodEnd: friend.current_period_end,
        isActive: friend.subscription_status === 'active' || friend.subscription_status === 'trialing',
      },
    });
  } catch (err) {
    console.error('POST /api/liff/membership error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/link - link friend to user UUID (public, verified via LINE ID token)
liffRoutes.post('/api/liff/link', async (c) => {
  try {
    const body = await c.req.json<{
      idToken: string;
      displayName?: string | null;
    }>();

    if (!body.idToken) {
      return c.json({ success: false, error: 'idToken is required' }, 400);
    }

    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: body.idToken,
        client_id: c.env.LINE_CHANNEL_ID,
      }),
    });

    if (!verifyRes.ok) {
      return c.json({ success: false, error: 'Invalid ID token' }, 401);
    }

    const verified = await verifyRes.json<{ sub: string; email?: string; name?: string }>();
    const lineUserId = verified.sub;
    const email = verified.email || null;

    const db = c.env.DB;
    const friend = await getFriendByLineUserId(db, lineUserId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    if ((friend as unknown as Record<string, unknown>).user_id) {
      return c.json({
        success: true,
        data: { userId: (friend as unknown as Record<string, unknown>).user_id, alreadyLinked: true },
      });
    }

    let userId: string | null = null;
    if (email) {
      const existingUser = await getUserByEmail(db, email);
      if (existingUser) userId = existingUser.id;
    }

    if (!userId) {
      const newUser = await createUser(db, {
        email,
        displayName: body.displayName || verified.name,
      });
      userId = newUser.id;
    }

    await linkFriendToUser(db, friend.id, userId);

    return c.json({
      success: true,
      data: { userId, alreadyLinked: false },
    });
  } catch (err) {
    console.error('POST /api/liff/link error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Attribution Analytics ──────────────────────────────────────

/**
 * GET /api/analytics/ref-summary — ref code analytics summary
 */
liffRoutes.get('/api/analytics/ref-summary', async (c) => {
  try {
    const db = c.env.DB;

    const rows = await db
      .prepare(
        `SELECT
          er.ref_code,
          er.name,
          COUNT(DISTINCT rt.friend_id) as friend_count,
          COUNT(rt.id) as click_count,
          MAX(rt.created_at) as latest_at
        FROM entry_routes er
        LEFT JOIN ref_tracking rt ON er.ref_code = rt.ref_code
        GROUP BY er.ref_code, er.name
        ORDER BY friend_count DESC`,
      )
      .all<{
        ref_code: string;
        name: string;
        friend_count: number;
        click_count: number;
        latest_at: string | null;
      }>();

    const totalFriendsRes = await db
      .prepare(`SELECT COUNT(*) as count FROM friends`)
      .first<{ count: number }>();

    const friendsWithRefRes = await db
      .prepare(`SELECT COUNT(*) as count FROM friends WHERE ref_code IS NOT NULL AND ref_code != ''`)
      .first<{ count: number }>();

    const totalFriends = totalFriendsRes?.count ?? 0;
    const friendsWithRef = friendsWithRefRes?.count ?? 0;

    return c.json({
      success: true,
      data: {
        routes: (rows.results ?? []).map((r) => ({
          refCode: r.ref_code,
          name: r.name,
          friendCount: r.friend_count,
          clickCount: r.click_count,
          latestAt: r.latest_at,
        })),
        totalFriends,
        friendsWithRef,
        friendsWithoutRef: totalFriends - friendsWithRef,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/ref-summary error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/analytics/ref/:refCode — detailed friend list for a single ref code
 */
liffRoutes.get('/api/analytics/ref/:refCode', async (c) => {
  try {
    const db = c.env.DB;
    const refCode = c.req.param('refCode');

    const routeRow = await db
      .prepare(`SELECT ref_code, name FROM entry_routes WHERE ref_code = ?`)
      .bind(refCode)
      .first<{ ref_code: string; name: string }>();

    if (!routeRow) {
      return c.json({ success: false, error: 'Entry route not found' }, 404);
    }

    const friends = await db
      .prepare(
        `SELECT
          f.id,
          f.display_name,
          f.ref_code,
          rt.created_at as tracked_at
        FROM friends f
        LEFT JOIN ref_tracking rt ON f.id = rt.friend_id AND rt.ref_code = ?
        WHERE f.ref_code = ?
        ORDER BY rt.created_at DESC`,
      )
      .bind(refCode, refCode)
      .all<{
        id: string;
        display_name: string;
        ref_code: string | null;
        tracked_at: string | null;
      }>();

    return c.json({
      success: true,
      data: {
        refCode: routeRow.ref_code,
        name: routeRow.name,
        friends: (friends.results ?? []).map((f) => ({
          id: f.id,
          displayName: f.display_name,
          trackedAt: f.tracked_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/ref/:refCode error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/links/wrap - wrap a URL with LIFF redirect proxy
liffRoutes.post('/api/links/wrap', async (c) => {
  try {
    const body = await c.req.json<{ url: string; ref?: string }>();
    if (!body.url) {
      return c.json({ success: false, error: 'url is required' }, 400);
    }

    const liffUrl = c.env.LIFF_URL;
    if (!liffUrl) {
      return c.json({ success: false, error: 'LIFF_URL not configured' }, 500);
    }

    const params = new URLSearchParams({ redirect: body.url });
    if (body.ref) {
      params.set('ref', body.ref);
    }

    const wrappedUrl = `${liffUrl}?${params.toString()}`;
    return c.json({ success: true, data: { url: wrappedUrl } });
  } catch (err) {
    console.error('POST /api/links/wrap error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── HTML Templates ─────────────────────────────────────────────

function authLandingPage(liffUrl: string, oauthUrl: string): string {
  // Extract LIFF ID from URL like https://liff.line.me/YOUR_LIFF_ID?ref=test
  const liffIdMatch = liffUrl.match(/liff\.line\.me\/([^?]+)/);
  const liffId = liffIdMatch ? liffIdMatch[1] : '';
  // Query string part (e.g., ?ref=test)
  const qsIndex = liffUrl.indexOf('?');
  const liffQs = qsIndex >= 0 ? liffUrl.slice(qsIndex) : '';

  // line:// scheme to force open LINE app with LIFF
  const lineSchemeUrl = `https://line.me/R/app/${liffId}${liffQs}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LINE で開く</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #06C755; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); text-align: center; max-width: 400px; width: 90%; }
    .line-icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 20px; color: #333; margin-bottom: 8px; }
    .sub { font-size: 14px; color: #999; margin-bottom: 24px; }
    .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; text-decoration: none; text-align: center; cursor: pointer; transition: opacity 0.15s; font-family: inherit; }
    .btn:active { opacity: 0.85; }
    .btn-line { background: #06C755; color: #fff; margin-bottom: 12px; }
    .btn-web { background: #f5f5f5; color: #666; font-size: 13px; padding: 12px; }
    .loading { margin-top: 16px; font-size: 13px; color: #999; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="line-icon">💬</div>
    <h2>LINEで開く</h2>
    <p class="sub">LINEアプリが起動します</p>
    <a href="${escapeHtml(lineSchemeUrl)}" class="btn btn-line" id="openBtn">LINEアプリで開く</a>
    <a href="${escapeHtml(oauthUrl)}" class="btn btn-web" id="pcBtn">PCの方・LINEが開かない方</a>
    <p class="loading hidden" id="loading">LINEアプリを起動中...</p>
  </div>
  <script>
    var lineUrl = '${escapeHtml(lineSchemeUrl)}';
    var ua = navigator.userAgent.toLowerCase();
    var isMobile = /iphone|ipad|android/.test(ua);
    var isLine = /line\\//.test(ua);
    var isIOS = /iphone|ipad/.test(ua);
    var isAndroid = /android/.test(ua);

    if (isLine) {
      // Already in LINE — go to LIFF directly
      window.location.href = '${escapeHtml(liffUrl)}';
    } else if (isMobile) {
      // Mobile browser — try to open LINE app
      document.getElementById('loading').classList.remove('hidden');
      document.getElementById('openBtn').classList.add('hidden');

      // Use line.me/R/app/ which is a Universal Link (iOS) / App Link (Android)
      // This opens LINE app directly without showing browser login
      setTimeout(function() {
        window.location.href = lineUrl;
      }, 100);

      // Fallback: if LINE app doesn't open within 2s, show the button
      setTimeout(function() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('openBtn').classList.remove('hidden');
        document.getElementById('openBtn').textContent = 'もう一度試す';
      }, 2500);
    }
  </script>
</body>
</html>`;
}

function completionPage(displayName: string, pictureUrl: string | null, ref: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登録完了</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .check { width: 64px; height: 64px; border-radius: 50%; background: #06C755; color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 16px; }
    h2 { font-size: 20px; color: #06C755; margin-bottom: 16px; }
    .profile { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 16px 0; }
    .profile img { width: 48px; height: 48px; border-radius: 50%; }
    .profile .name { font-size: 16px; font-weight: 600; }
    .message { font-size: 14px; color: #666; line-height: 1.6; margin-top: 12px; }
    .ref { display: inline-block; margin-top: 12px; padding: 4px 12px; background: #f0f0f0; border-radius: 12px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h2>登録完了！</h2>
    <div class="profile">
      ${pictureUrl ? `<img src="${pictureUrl}" alt="">` : ''}
      <p class="name">${escapeHtml(displayName)} さん</p>
    </div>
    <p class="message">ありがとうございます！<br>これからお役立ち情報をお届けします。<br>このページは閉じて大丈夫です。</p>
    ${ref ? `<p class="ref">${escapeHtml(ref)}</p>` : ''}
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>エラー</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    h2 { font-size: 18px; color: #e53e3e; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <h2>エラー</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { liffRoutes };
