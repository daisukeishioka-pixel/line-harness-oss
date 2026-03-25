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
          <label for="fTerms"><a href="/legal" target="_blank">利用規約</a>および<a href="/privacy" target="_blank">プライバシーポリシー</a>に同意します</label>
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
