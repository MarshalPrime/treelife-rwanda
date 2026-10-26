# Offline synchronization

Full offline synchronization is not part of this version. [decisions/006-offline.md](decisions/006-offline.md) records the boundary.

The next design, when it is built and tested, should cover:

- a queue of unsent creates and updates
- retry with the same `client_request_id`
- a sync state the user can see: pending, sent, or failed
- a conflict rule when the server copy changed after the device last read it
- no second record when the same submission is delivered twice

The current create endpoints already implement the duplicate rule on the server. The form reuses its request id after a network error. Closing the page discards that id and any unsent values.
