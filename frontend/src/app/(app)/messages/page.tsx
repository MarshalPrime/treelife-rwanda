"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner } from "@/components/AppShell";
import { ApiError, api } from "@/lib/api";
import type {
  MessageAudience,
  MessageChannel,
  MessageHistoryPage,
  MessageRecipientGroup,
  MessageRecipientOption,
  MessageSent,
} from "@/lib/types";

const PAGE_SIZE = 20;

function audienceLabel(message: MessageSent) {
  if (message.audience === "individual") return message.recipient_name ?? "Specific people";
  if (message.audience === "field_officer") return "All agents";
  return message.districts.length ? `Farmers · ${message.districts.join(", ")}` : "All farmers";
}

export default function MessagesPage() {
  const [channel, setChannel] = useState<MessageChannel>("in_app");
  const [selectionMode, setSelectionMode] = useState<"groups" | "people">("groups");
  const [groups, setGroups] = useState<MessageRecipientGroup[]>([]);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [people, setPeople] = useState<MessageRecipientOption[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState<MessageHistoryPage>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [sort, setSort] = useState<"created_at" | "title" | "recipient_count">("created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadHistory(
    page = 1,
    query = appliedSearch,
    nextSort = sort,
    nextDirection = direction,
  ) {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: nextSort, direction: nextDirection });
    if (query) params.set("q", query);
    if (channelFilter) params.set("channel", channelFilter);
    if (audienceFilter) params.set("audience", audienceFilter);
    setHistory(await api<MessageHistoryPage>(`/messages?${params.toString()}`));
  }

  useEffect(() => {
    const params = new URLSearchParams({
      page: "1",
      page_size: String(PAGE_SIZE),
      sort: "created_at",
      direction: "desc",
    });
    Promise.all([
      api<MessageRecipientGroup[]>("/messages/groups"),
      api<MessageHistoryPage>(`/messages?${params.toString()}`),
    ])
      .then(([nextGroups, nextHistory]) => {
        setGroups(nextGroups);
        setHistory(nextHistory);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Messages could not be loaded."));
  }, []);

  useEffect(() => {
    if (selectionMode !== "people") return;
    let active = true;
    Promise.all([
      api<MessageRecipientOption[]>("/messages/recipients?role=field_officer"),
      api<MessageRecipientOption[]>("/messages/recipients?role=farmer"),
    ]).then(([agents, farmers]) => {
      if (active) setPeople([...agents, ...farmers].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Recipients could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [selectionMode]);

  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupKeys.includes(group.key)),
    [groups, selectedGroupKeys],
  );
  const selectedAudience: MessageAudience = selectionMode === "people"
    ? "individual"
    : selectedGroups.some((group) => group.role === "field_officer")
      ? "field_officer"
      : "farmer";
  const selectedDistricts = selectedGroups
    .filter((group) => group.role === "farmer" && group.district)
    .map((group) => group.district as string);
  const selectedPersonObjects = people.filter((person) => selectedPeople.includes(person.id));
  const filteredGroups = groups.filter((group) => group.label.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  const filteredPeople = people
    .filter((person) => person.full_name.toLowerCase().includes(peopleSearch.trim().toLowerCase()))
    .sort((a, b) => Number(selectedPeople.includes(b.id)) - Number(selectedPeople.includes(a.id)) || a.full_name.localeCompare(b.full_name))
    .slice(0, 12);
  const estimatedRecipients = selectionMode === "people"
    ? selectedPeople.length
    : selectedGroups.reduce((total, group) => total + group.recipient_count, 0);

  function toggleGroup(group: MessageRecipientGroup) {
    if (group.role === "field_officer" || group.district === null) {
      setSelectedGroupKeys((current) => current.includes(group.key) ? [] : [group.key]);
      return;
    }
    setSelectedGroupKeys((current) => {
      const withoutAllFarmers = current.filter((key) => key !== "farmer" && key !== "field_officer");
      return withoutAllFarmers.includes(group.key)
        ? withoutAllFarmers.filter((key) => key !== group.key)
        : [...withoutAllFarmers, group.key];
    });
  }

  function removeGroup(key: string) {
    setSelectedGroupKeys((current) => current.filter((item) => item !== key));
  }

  function togglePerson(id: string) {
    setSelectedPeople((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (channel === "sms") {
      setError("SMS delivery is not available yet. Choose In-app notification.");
      return;
    }
    if (!estimatedRecipients) {
      setError("Choose at least one recipient.");
      return;
    }
    setSaving(true);
    try {
      const sent = await api<MessageSent>("/messages", {
        method: "POST",
        body: JSON.stringify({
          channel,
          audience: selectedAudience,
          districts: selectedAudience === "farmer" ? selectedDistricts : [],
          recipient_user_ids: selectionMode === "people" ? selectedPeople : [],
          title,
          body,
        }),
      });
      setNotice(`Message sent to ${sent.recipient_count.toLocaleString()} recipient${sent.recipient_count === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
      await loadHistory(1, appliedSearch);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The message could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  function searchHistory(event: React.FormEvent) {
    event.preventDefault();
    setAppliedSearch(search.trim());
    loadHistory(1, search.trim()).catch((caught) => setError(caught instanceof Error ? caught.message : "History could not be loaded."));
  }

  function changeSort(nextSort: "created_at" | "title" | "recipient_count") {
    const nextDirection = sort === nextSort ? (direction === "asc" ? "desc" : "asc") : nextSort === "title" ? "asc" : "desc";
    setSort(nextSort);
    setDirection(nextDirection);
    loadHistory(1, appliedSearch, nextSort, nextDirection).catch((caught) => setError(caught instanceof Error ? caught.message : "History could not be loaded."));
  }

  const totalPages = Math.max(1, Math.ceil(history.total / history.page_size));

  return (
    <div className="page messages-page">
      <div className="page-head">
        <div><p className="lede">Updates for the people growing Rwanda</p><h1>Messages</h1></div>
        <span className="message-stat">{history.total.toLocaleString()} sent</span>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}
      <form className="card form message-composer" onSubmit={submit}>
        <div className="page-head"><div><h2>Compose a message</h2><p className="help">Pick a group or add specific people, just like selecting skills.</p></div></div>
        <label>Delivery
          <select value={channel} onChange={(event) => setChannel(event.target.value as MessageChannel)}>
            <option value="in_app">In-app notification</option>
            <option value="sms">SMS · coming soon</option>
          </select>
        </label>
        {channel === "sms" ? <Banner tone="warning">SMS will be connected later. In-app notification is available now.</Banner> : null}
        <div className="message-mode" role="tablist" aria-label="Recipient selection mode">
          <button className={selectionMode === "groups" ? "selected" : ""} type="button" onClick={() => setSelectionMode("groups")}>Groups</button>
          <button className={selectionMode === "people" ? "selected" : ""} type="button" onClick={() => setSelectionMode("people")}>Specific people</button>
        </div>
        {selectionMode === "groups" ? <div className="message-recipient-picker">
          <span className="field-label">Selected groups</span>
          <div className="message-selected-chips">
            {selectedGroups.length ? selectedGroups.map((group) => <span className="message-selected-chip" key={group.key}>{group.label} · {group.recipient_count.toLocaleString()}<button type="button" aria-label={`Remove ${group.label}`} onClick={() => removeGroup(group.key)}>×</button></span>) : <span className="help">Choose a group below.</span>}
          </div>
          <label className="field-label">Add a group
            <input className="message-picker-search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search groups…" aria-label="Search recipient groups" />
          </label>
          <div className="message-groups" aria-label="Recipient groups">
            {filteredGroups.map((group) => <button className={`message-group-chip${selectedGroupKeys.includes(group.key) ? " selected" : ""}`} key={group.key} type="button" onClick={() => toggleGroup(group)}>
              <span>{group.label}</span><b>{group.recipient_count.toLocaleString()}</b>
            </button>)}
            {!filteredGroups.length ? <span className="help">No groups match “{groupSearch}”.</span> : null}
          </div>
          <p className="help">District labels can be combined. “All farmers” and “All agents” are exclusive group choices.</p>
        </div> : <div className="message-recipient-picker">
          <span className="field-label">Selected people</span>
          <div className="message-selected-chips">
            {selectedPersonObjects.length ? selectedPersonObjects.map((person) => <span className="message-selected-chip" key={person.id}>{person.full_name}<button type="button" aria-label={`Remove ${person.full_name}`} onClick={() => togglePerson(person.id)}>×</button></span>) : <span className="help">Choose people below.</span>}
          </div>
          <label className="field-label">Add people
            <input className="message-picker-search" value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Search by name…" aria-label="Search people" />
          </label>
          {peopleSearch.trim() ? <div className="message-people-list">{filteredPeople.map((person) => <label className="message-person-option" key={person.id}><input type="checkbox" checked={selectedPeople.includes(person.id)} onChange={() => togglePerson(person.id)} /><span>{person.full_name}<small>{person.role === "farmer" ? "Farmer" : "Field officer"}</small></span></label>)}{!filteredPeople.length ? <span className="help">No people match “{peopleSearch}”.</span> : null}</div> : <p className="help">Type a name to find someone. Selected people stay above.</p>}
        </div>}
        <div className="message-audience-summary">{estimatedRecipients.toLocaleString()} recipient{estimatedRecipients === 1 ? "" : "s"} selected</div>
        <label>Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
        </label>
        <label>Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required />
        </label>
        <button className="primary" type="submit" disabled={saving || channel === "sms"}>{saving ? "Sending…" : "Send message"}</button>
      </form>
      <section className="card message-history-panel">
        <div className="page-head"><div><h2>Sent messages</h2><p className="help">Search and browse the archive without loading all messages.</p></div></div>
        <form className="message-search" onSubmit={searchHistory}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or message" aria-label="Search sent messages" />
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label="Filter by delivery"><option value="">All delivery</option><option value="in_app">In-app</option><option value="sms">SMS</option></select>
          <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)} aria-label="Filter by audience"><option value="">All audiences</option><option value="field_officer">Agents</option><option value="farmer">Farmers</option><option value="individual">Specific people</option></select>
          <button className="secondary" type="submit">Search</button>
        </form>
        <div className="message-table-wrap">
          <table className="message-table">
            <thead><tr>
              <th><button type="button" onClick={() => changeSort("title")}>Message {sort === "title" ? (direction === "asc" ? "↑" : "↓") : "↕"}</button></th>
              <th>Audience</th>
              <th><button type="button" onClick={() => changeSort("recipient_count")}>Recipients {sort === "recipient_count" ? (direction === "asc" ? "↑" : "↓") : "↕"}</button></th>
              <th>Delivery</th>
              <th><button type="button" onClick={() => changeSort("created_at")}>Sent {sort === "created_at" ? (direction === "asc" ? "↑" : "↓") : "↕"}</button></th>
            </tr></thead>
            <tbody>{history.items.map((message) => <tr key={message.id}>
              <td><strong>{message.title}</strong><span>{message.body}</span></td>
              <td>{audienceLabel(message)}</td>
              <td>{message.recipient_count.toLocaleString()}</td>
              <td><span className="message-channel-label">{message.channel === "sms" ? "SMS" : "In-app"}</span></td>
              <td>{new Date(message.created_at).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
          {!history.items.length ? <p className="message-table-empty">No sent messages match these filters.</p> : null}
        </div>
        <div className="message-pagination"><button className="ghost" type="button" disabled={history.page <= 1} onClick={() => loadHistory(history.page - 1)}>Previous</button><span>Page {history.page} of {totalPages}</span><button className="ghost" type="button" disabled={history.page >= totalPages} onClick={() => loadHistory(history.page + 1)}>Next</button></div>
      </section>
    </div>
  );
}
