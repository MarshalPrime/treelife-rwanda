# Offline use

Field registration may happen with an unreliable connection. This version does not queue submissions on the device and does not sync them later.

What is implemented:

- The interface is usable on a narrow screen.
- Each create form keeps one `client_request_id` for the life of that form.
- If the request fails because the server cannot be reached, the message tells the user to submit again.
- The API returns the original record when that id is sent a second time, including when the second body differs. The first write wins.
- The same rule is covered by the API tests.

What is not implemented:

- A local queue that survives closing the browser
- Automatic retry
- A visible sync status
- Conflict detection when two officers edit one record while disconnected
- Background sync when the network returns

A later design should store pending creates in the browser or a small device database, retry with the same request id, and show pending, sent, and failed states. Updates need a version or `updated_at` check so a stale edit does not silently overwrite a newer one. That work should be built only when it can be tested without a network, including a forced failure and a replay.

Until then, the application should be described as online, with duplicate protection on retry, not as an offline field tool.
