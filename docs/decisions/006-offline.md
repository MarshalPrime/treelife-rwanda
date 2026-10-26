# Offline use

Field registration may happen with an unreliable connection. A failed create that includes `client_request_id` is stored in the browser's `localStorage` and sent again when the application loads or the browser reports that it is online.

What is implemented:

- The interface is usable on a narrow screen.
- Each create form keeps one `client_request_id` until that create succeeds.
- If the request fails because the server cannot be reached, the same body is kept on the device and the screen says how many submissions are waiting.
- When the connection returns, the signed-in session sends those creates. The API returns the original record if that id was already saved, so a retry does not create a second row.
- A validation failure is removed from the queue and shown as an error. A network failure stays in the queue.
- The queue behaviour is covered by a frontend unit test, and the request-id replay is covered by the API tests.

What is not implemented:

- Queuing edits, inspections that were already opened, or any request without a request id
- Sending the queue after the browser session has been signed out, because the token lives in `sessionStorage`
- Conflict detection when two officers edit one record
- A background service worker

The queue is a device-side retry for creates. It is not a full offline field database.
