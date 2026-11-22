"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { NotificationItem, NotificationList } from "@/lib/types";

export default function NotificationsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<NotificationList>({ items: [], unread_count: 0 });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setData(await api<NotificationList>("/notifications"));
  }

  useEffect(() => {
    load().catch((caught) => setError(caught instanceof Error ? caught.message : t("notes.loadError")));
  }, [t]);

  async function markRead(notification: NotificationItem) {
    try {
      await api<void>(`/notifications/${notification.message_id}/read`, { method: "POST" });
      setData((current) => ({
        ...current,
        unread_count: notification.read_at ? current.unread_count : Math.max(0, current.unread_count - 1),
        items: current.items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
      }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("notes.readError"));
    }
  }

  async function markAllRead() {
    try {
      await api<void>("/notifications/read-all", { method: "POST" });
      setData((current) => ({ unread_count: 0, items: current.items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })) }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("notes.allError"));
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><p className="lede">{t("notes.lede")}</p><h1>{t("notes.title")}</h1></div>{data.unread_count ? <button className="secondary" type="button" onClick={markAllRead}>{t("notes.markAll")}</button> : null}</div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {data.items.length ? <div className="notification-list">{data.items.map((notification) => <article className={`card notification-item${notification.read_at ? " read" : ""}`} key={notification.id}>
        <div className="page-head"><div><p className="help">{t("notes.from", { name: notification.sender_name })} · {new Date(notification.created_at).toLocaleString()}</p><h2>{notification.title}</h2></div>{notification.read_at ? null : <button className="ghost" type="button" onClick={() => markRead(notification)}>{t("notes.mark")}</button>}</div>
        <p className="notification-body">{notification.body}</p>
      </article>)}</div> : <div className="card"><h2>{t("notes.emptyTitle")}</h2><p className="help">{t("notes.emptyBody")}</p></div>}
    </div>
  );
}
