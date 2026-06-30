"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Database,
  KeyRound,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import { SiteHeader } from "@/components/home/SiteHeader";
import {
  apiFetch,
  type AdminChatRoom,
  type AdminDeleteResult,
  type AdminJoker,
  type AdminSession,
  type AdminStats
} from "@/lib/api";

function friendlyError(message: string) {
  const known: Record<string, string> = {
    admin_credentials_not_configured: "管理员账号还没有配置，请先在 .env 中设置 ADMIN_USERNAME 和 ADMIN_PASSWORD。",
    invalid_admin_credentials: "管理员账号或密码不正确。",
    admin_login_required: "请先登录管理端。",
    admin_session_expired: "管理员登录已过期，请重新登录。",
    admin_session_invalid: "管理员登录状态无效，请重新登录。",
    super_admin_required: "只有本机最高管理员可以执行这个操作。",
    joker_not_found: "这个小丑已经不存在。",
    chat_message_not_found: "这条聊天消息已经不存在。"
  };
  return known[message] ?? message;
}

function jokerName(joker: AdminJoker) {
  return joker.nickname || `${joker.mbti} ${joker.social_energy} 小丑`;
}

const chatLocationLabels: Record<string, string> = {
  "academic-plaza": "教学楼广场",
  canteen: "食堂",
  library: "图书馆",
  "sports-field": "运动场",
  "central-garden": "中心花园",
  "clown-theater": "小丑剧场",
  "bus-stop": "校车站",
  dormitory: "宿舍区"
};

function chatRoomName(room: AdminChatRoom) {
  return room.location_id ? chatLocationLabels[room.location_id] ?? room.location_id : room.id;
}

function messageSenderName(message: AdminChatRoom["recent_messages"][number]) {
  return message.sender?.nickname || message.sender?.id || message.sender_id;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [jokers, setJokers] = useState<AdminJoker[]>([]);
  const [chatRooms, setChatRooms] = useState<AdminChatRoom[]>([]);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "小丑", value: stats.joker_count, icon: Users },
      { label: "用户会话", value: stats.user_session_count, icon: ShieldCheck },
      { label: "气球", value: stats.balloon_count, icon: Activity },
      { label: "待接力", value: stats.pending_balloon_count, icon: AlertTriangle },
      { label: "互动", value: stats.heal_action_count, icon: AppWindow },
      { label: "事件", value: stats.event_count, icon: Database },
      { label: "聊天室", value: stats.chat_room_count, icon: MessageSquare },
      { label: "聊天消息", value: stats.chat_message_count, icon: Database }
    ];
  }, [stats]);

  async function loadAdminData(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const [nextStats, nextJokers, nextChatRooms] = await Promise.all([
        apiFetch<AdminStats>("/api/admin/stats"),
        apiFetch<AdminJoker[]>("/api/admin/jokers"),
        apiFetch<AdminChatRoom[]>("/api/admin/chat/rooms")
      ]);
      setStats(nextStats);
      setJokers(nextJokers);
      setChatRooms(nextChatRooms);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "管理端数据加载失败"));
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const current = await apiFetch<AdminSession>("/api/admin/me");
        if (cancelled) return;
        setSession(current);
        await loadAdminData(false);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const nextSession = await apiFetch<AdminSession>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setSession(nextSession);
      setPassword("");
      setNotice(nextSession.is_super_admin ? "已作为本机最高管理员登录。" : "已作为管理员登录。");
      await loadAdminData(false);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "登录失败"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch<{ ok: boolean }>("/api/admin/logout", { method: "POST" });
    } finally {
      setSession(null);
      setStats(null);
      setJokers([]);
      setChatRooms([]);
      setNotice(null);
      setLoading(false);
    }
  }

  async function handleDeleteChatMessage(messageId: string) {
    const confirmed = window.confirm("确认删除这条聊天消息？");
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<Record<string, number>>(`/api/admin/chat/messages/${messageId}`, {
        method: "DELETE"
      });
      setNotice("已删除聊天消息。");
      await loadAdminData(false);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "删除聊天消息失败"));
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleDeleteJoker(joker: AdminJoker) {
    const confirmed = window.confirm(`确认删除「${jokerName(joker)}」？关联气球、互动、事件和头像任务都会一起清理。`);
    if (!confirmed) return;

    setDeletingId(joker.id);
    setError(null);
    setNotice(null);
    try {
      const deleted = await apiFetch<AdminDeleteResult>(`/api/admin/jokers/${joker.id}`, {
        method: "DELETE"
      });
      setNotice(`已删除 ${deleted.joker_id}，清理 ${deleted.deleted_counts.jokers} 个小丑记录。`);
      await loadAdminData(false);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "删除失败"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="app-shell module-page park-admin-page">
      <SiteHeader />

      <section className="admin-shell" aria-label="系统管理端">
        {checking ? (
          <section className="pixel-panel admin-loading-panel">
            <RefreshCw size={22} aria-hidden />
            <strong>正在检查管理员登录状态</strong>
          </section>
        ) : !session ? (
          <section className="pixel-panel admin-login-panel">
            <div className="section-title">
              <div>
                <span className="pixel-kicker">ADMIN LOGIN</span>
                <h1>管理端登录</h1>
              </div>
              <KeyRound size={28} aria-hidden />
            </div>

            <form className="admin-login-form" onSubmit={handleLogin}>
              <label className="field">
                <span>管理员账号</span>
                <input
                  value={username}
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                />
              </label>
              <label className="field">
                <span>管理员密码</span>
                <input
                  value={password}
                  type="password"
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入 .env 中配置的密码"
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading || !username || !password}>
                <ShieldCheck size={17} aria-hidden />
                {loading ? "登录中" : "进入管理端"}
              </button>
            </form>

            <div className="admin-login-note">
              <strong>本机最高管理员</strong>
              <span>默认只把 127.0.0.1、::1、localhost 登录成功的管理员提升为最高管理员。</span>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </section>
        ) : (
          <div className="admin-console">
            <section className="pixel-panel admin-console-header">
              <div>
                <span className="pixel-kicker">SYSTEM OPS</span>
                <h1>系统管理控制台</h1>
                <p>
                  {session.username} / {session.is_super_admin ? "本机最高管理员" : "管理员"} / {session.host ?? "unknown"}
                </p>
              </div>
              <div className="admin-console-actions">
                <span className="admin-role-pill" data-super={session.is_super_admin}>
                  <ShieldCheck size={16} aria-hidden />
                  {session.is_super_admin ? "SUPER ADMIN" : "ADMIN"}
                </span>
                <Link className="secondary-button" href="/park">
                  <AppWindow size={16} aria-hidden />
                  应用端
                </Link>
                <button className="secondary-button" type="button" disabled={refreshing} onClick={() => void loadAdminData()}>
                  <RefreshCw size={16} aria-hidden />
                  {refreshing ? "刷新中" : "刷新"}
                </button>
                <button className="secondary-button" type="button" disabled={loading} onClick={() => void handleLogout()}>
                  <LogOut size={16} aria-hidden />
                  退出
                </button>
              </div>
            </section>

            {notice ? <p className="admin-banner admin-banner--ok">{notice}</p> : null}
            {error ? <p className="error">{error}</p> : null}

            <section className="admin-stats-grid" aria-label="系统数据概览">
              {statCards.map((item) => {
                const Icon = item.icon;
                return (
                  <article className="admin-stat-tile" key={item.label}>
                    <Icon size={18} aria-hidden />
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                );
              })}
            </section>

            <section className="admin-management-grid">
              <article className="pixel-panel admin-table-panel">
                <div className="section-title">
                  <div>
                    <span className="pixel-kicker">CLOWNS</span>
                    <h2>小丑管理</h2>
                  </div>
                </div>

                <div className="admin-table-scroll">
                  <table className="admin-joker-table">
                    <thead>
                      <tr>
                        <th>小丑</th>
                        <th>属性</th>
                        <th>能量</th>
                        <th>关联</th>
                        <th>更新时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jokers.map((joker) => (
                        <tr key={joker.id}>
                          <td>
                            <strong>{jokerName(joker)}</strong>
                            <span>{joker.id}</span>
                          </td>
                          <td>
                            <strong>{joker.mbti} / {joker.constellation}</strong>
                            <span>{joker.social_energy} / {joker.avatar_status ?? "unknown"}</span>
                          </td>
                          <td>{joker.energy_score}</td>
                          <td>
                            <span>{joker.balloon_count} 气球</span>
                            <span>{joker.action_count} 互动</span>
                            <span>{joker.event_count} 事件</span>
                          </td>
                          <td>{formatDate(joker.updated_at)}</td>
                          <td>
                            <button
                              className="admin-danger-button"
                              type="button"
                              disabled={!session.is_super_admin || deletingId === joker.id}
                              title={session.is_super_admin ? "删除小丑" : "只有本机最高管理员可以删除"}
                              onClick={() => void handleDeleteJoker(joker)}
                            >
                              <Trash2 size={15} aria-hidden />
                              {deletingId === joker.id ? "删除中" : "删除"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {jokers.length === 0 ? <div className="admin-empty">当前没有小丑数据。</div> : null}
                </div>
              </article>

              <article className="pixel-panel admin-table-panel admin-chat-panel">
                <div className="section-title">
                  <div>
                    <span className="pixel-kicker">CHAT</span>
                    <h2>聊天管理</h2>
                  </div>
                </div>

                <div className="admin-chat-room-list">
                  {chatRooms.map((room) => (
                    <section className="admin-chat-room" key={room.id}>
                      <header>
                        <div>
                          <strong>{chatRoomName(room)}</strong>
                          <span>{room.message_count} 条消息 · {room.last_message_at ? formatDate(room.last_message_at) : "暂无消息"}</span>
                        </div>
                        <small>{room.location_id ?? room.id}</small>
                      </header>
                      <div className="admin-chat-message-list">
                        {room.recent_messages.length === 0 ? (
                          <div className="admin-empty">这个公共池还没有消息。</div>
                        ) : (
                          room.recent_messages.map((message) => (
                            <div className="admin-chat-message-row" key={message.id}>
                              <div>
                                <strong>{messageSenderName(message)}</strong>
                                <span>{message.content_safe || ""}</span>
                                <small>{formatDate(message.created_at)}</small>
                              </div>
                              <button
                                className="admin-danger-button"
                                type="button"
                                disabled={!session.is_super_admin || deletingMessageId === message.id}
                                title={session.is_super_admin ? "删除消息" : "只有本机最高管理员可以删除"}
                                onClick={() => void handleDeleteChatMessage(message.id)}
                              >
                                <Trash2 size={15} aria-hidden />
                                {deletingMessageId === message.id ? "删除中" : "删除"}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  ))}
                  {chatRooms.length === 0 ? <div className="admin-empty">当前没有公共聊天室。</div> : null}
                </div>
              </article>

              <aside className="pixel-panel admin-system-panel">
                <div className="section-title">
                  <div>
                    <span className="pixel-kicker">SYSTEM</span>
                    <h2>系统域</h2>
                  </div>
                </div>
                <div className="admin-system-list">
                  <span>
                    <strong>{stats?.healed_balloon_count ?? 0}</strong>
                    已治愈气球
                  </span>
                  <span>
                    <strong>{stats?.avatar_job_count ?? 0}</strong>
                    头像任务
                  </span>
                  <span>
                    <strong>{stats?.media_asset_count ?? 0}</strong>
                    媒体资产
                  </span>
                  <span>
                    <strong>{stats?.moderation_log_count ?? 0}</strong>
                    审核记录
                  </span>
                </div>
                <div className="admin-guard-note" data-super={session.is_super_admin}>
                  <AlertTriangle size={18} aria-hidden />
                  <span>
                    {session.is_super_admin
                      ? "当前设备拥有最高管理员权限，可以执行删除。"
                      : "当前设备不是最高管理员，只能查看系统数据。"}
                  </span>
                </div>
              </aside>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
