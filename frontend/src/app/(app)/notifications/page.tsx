"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import type { NotificationItem, NotificationList } from "@/lib/types";

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationList>({ items: [], unread_count: 0 });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setData(await api<NotificationList>("/notifications"));
  }

  useEffect(() => {
    load().catch((caught) => setError(caught instanceof Error ? caught.message : "Notifications could not be loaded."));
  }, []);

  async function markRead(notification: NotificationItem) {
    try {
      await api<void>(`/notifications/${notification.message_id}/read`, { method: "POST" });
      setData((current) => ({
        ...current,
        unread_count: notification.read_at ? current.unread_count : Math.max(0, current.unread_count - 1),
        items: current.items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
      }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The notification could not be marked read.");
    }
  }

  async function markAllRead() {
    try {
      await api<void>("/notifications/read-all", { method: "POST" });
      setData((current) => ({ unread_count: 0, items: current.items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })) }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Notifications could not be marked read.");
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><p className="lede">Updates from TreeLife</p><h1>Notifications</h1></div>{data.unread_count ? <button className="secondary" type="button" onClick={markAllRead}>Mark all read</button> : null}</div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {data.items.length ? <div className="notification-list">{data.items.map((notification) => <article className={`card notification-item${notification.read_at ? " read" : ""}`} key={notification.id}>
        <div className="page-head"><div><p className="help">From {notification.sender_name} · {new Date(notification.created_at).toLocaleString()}</p><h2>{notification.title}</h2></div>{notification.read_at ? null : <button className="ghost" type="button" onClick={() => markRead(notification)}>Mark read</button>}</div>
        <p className="notification-body">{notification.body}</p>
      </article>)}</div> : <div className="card"><h2>You are all caught up</h2><p className="help">New updates and visit notices will appear here.</p></div>}
    </div>
  );
}
