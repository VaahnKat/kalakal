// Sign-in with Google, sessions and the current user.
//
// Needs two secrets in Cloudflare (Workers & Pages → kalakal → Settings → Variables and Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   from Google Cloud Console (OAuth client, type "Web application")
//   ADMIN_EMAILS                             comma-separated emails that get the admin page
// Redirect URIs to register with Google: https://<your-domain>/auth/google/callback
//
// Sessions: a random id in an HttpOnly, SameSite=Lax cookie; the row lives in D1 for 30 days.
// Local development (env.DEV_LOGIN = "1") adds /auth/dev?email=...&name=... instead of Google.

import { db, newId, now } from "./db.js";
import { clean } from "./text.js";

const COOKIE = "kk_session";
const STATE = "kk_state";
const DAYS = 30;

export const googleReady = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, url, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === "https:" ? "; Secure" : ""}`;
}

const safeNext = (v) => (typeof v === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(v) ? v : "/me.html");

const isAdmin = (env, email) => !!email && String(env.ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(email.toLowerCase());

// The signed-in user for this request, or null
export async function currentUser(request, env) {
  if (!env.DB) return null;
  const sid = cookies(request)[COOKIE];
  if (!sid || sid.length < 20) return null;
  const DB = await db(env);
  const row = await DB.prepare(`SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).bind(sid).first();
  if (!row || row.expires_at < now() || row.status !== "active") return null;
  if (now() - (row.last_seen_at || 0) > 3600000) await DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now(), row.id).run();
  return { ...row, sessionId: sid, admin: isAdmin(env, row.email) };
}

export const publicUser = (u) => u && ({
  id: u.id, name: u.display_name || u.name, picture: u.picture, email: u.email,
  admin: !!u.admin, acceptedTerms: !!u.accepted_terms_at,
});

async function startSession(env, url, user, next) {
  const DB = await db(env);
  const sid = newId(40);
  await DB.batch([
    DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sid, user.id, now(), now() + DAYS * 86400000),
    DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(user.id, now()),
  ]);
  return new Response(null, { status: 302, headers: { Location: user.accepted_terms_at ? next : `/me.html?welcome=1&next=${encodeURIComponent(next)}`, "Set-Cookie": cookie(COOKIE, sid, url, DAYS * 86400), "Cache-Control": "no-store" } });
}

async function upsertUser(env, { googleId, email, name, picture }) {
  const DB = await db(env);
  const existing = await DB.prepare("SELECT * FROM users WHERE google_id = ?").bind(googleId).first();
  if (existing) {
    if (existing.status !== "active") return null;
    await DB.prepare("UPDATE users SET email = ?, name = ?, picture = ?, last_seen_at = ? WHERE id = ?").bind(email, name, picture, now(), existing.id).run();
    return { ...existing, email, name, picture };
  }
  const user = { id: newId(16), google_id: googleId, email, name, display_name: name, picture, created_at: now() };
  await DB.prepare("INSERT INTO users (id, google_id, email, name, display_name, picture, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(user.id, googleId, email, name, name, picture, now(), now()).run();
  return user;
}

const text = (msg, status = 400) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function handleAuth(request, env, url) {
  const redirectUri = `${url.origin}/auth/google/callback`;

  if (url.pathname === "/auth/google") {
    if (!googleReady(env)) return text("Sign-in isn't set up yet. Please try again later.", 503);
    const state = newId(24);
    const next = safeNext(url.searchParams.get("next"));
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
    return new Response(null, { status: 302, headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, "Set-Cookie": cookie(STATE, `${state}|${next}`, url, 600), "Cache-Control": "no-store" } });
  }

  if (url.pathname === "/auth/google/callback") {
    const [state, next] = (cookies(request)[STATE] || "").split("|");
    if (!state || state !== url.searchParams.get("state")) return text("Sign-in expired. Please go back and try again.");
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect(`${url.origin}/`, 302);
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    }).then((r) => r.json()).catch(() => ({}));
    if (!tok.access_token) return text("Google sign-in didn't complete. Please try again.");
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
    if (!info.sub || !info.email || info.email_verified === false) return text("We couldn't read your Google account. Please try again.");
    const user = await upsertUser(env, { googleId: `g:${info.sub}`, email: info.email, name: clean(info.name || info.email.split("@")[0], 40), picture: /^https:\/\//.test(info.picture || "") ? info.picture : null });
    if (!user) return text("This account has been suspended.", 403);
    return startSession(env, url, user, safeNext(next));
  }

  if (url.pathname === "/auth/dev" && env.DEV_LOGIN === "1") {
    const email = clean(url.searchParams.get("email") || "test@test.local", 80);
    const user = await upsertUser(env, { googleId: `dev:${email}`, email, name: clean(url.searchParams.get("name") || email.split("@")[0], 40), picture: null });
    if (!user) return text("Suspended", 403);
    return startSession(env, url, user, safeNext(url.searchParams.get("next") || "/me.html"));
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    const sid = cookies(request)[COOKIE];
    if (sid && env.DB) await (await db(env)).prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "Set-Cookie": cookie(COOKIE, "", url, 0) } });
  }

  return text("Not found", 404);
}
