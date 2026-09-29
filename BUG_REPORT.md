# Bug report

Line numbers point at the **original** code (commit `2b32db7`), so they still make sense after the fixes.

Every bug here was found by a test. The fixed ones now have regression tests. The open ones are
written as `test.failing(...)`: Jest runs them and expects them to fail. When someone fixes the bug,
Jest reports "this test passed unexpectedly", which tells them to turn it into a normal test.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Pagination skips the first page | High | **Fixed** (Part B) |
| 2 | Status filter matches partial words | Medium | **Fixed** |
| 3 | Completing a task resets its priority to `medium` | Medium | **Fixed** |
| 4 | `PUT` lets the client overwrite `id`, `createdAt`, `completedAt` | High | Open |
| 5 | Empty or `null` status/priority skip validation | Medium | Open |
| 6 | Malformed JSON returns 500 instead of 400 | Low | Open |
| 7 | `status` and `completedAt` can disagree | Low | Open |
| 8 | README documents the wrong status values | Low | Fixed in README |

---

## 1. Pagination skips the first page (fixed)

- **Where:** `src/services/taskService.js:12`, `getPaginated`: `const offset = page * limit;`
- **Expected:** `GET /tasks?page=1&limit=2` returns tasks 1 and 2.
- **Actual:** it returns tasks 3 and 4. Page 1 behaves like page 2, and the real first page can't be reached
  (`page=0` is turned into `1` by `parseInt(page) || 1` in the route).
- **Why:** the route treats pages as 1-based (it defaults to 1), but the service computes the offset as if they
  were 0-based.
- **Found by:** unit test `getPaginated › page 1 returns the first limit tasks` and the API test
  `pagination › page=1 returns the first page`.
- **Fix:** `const offset = (page - 1) * limit;`. I also clamp `page` and `limit` to at least 1 in the route,
  because after the fix a negative page would give a negative offset, and `Array.slice` with negative numbers
  counts from the end of the array (so it would return tasks from the last page).
- **Why I picked this one for Part B:** it's the bug a user of the API hits first. Any client that paginates
  never shows its first page of tasks, and nothing errors, so it's easy to miss.

## 2. Status filter matches partial words (fixed)

- **Where:** `src/services/taskService.js:9`, `getByStatus`: `t.status.includes(status)`
- **Expected:** `?status=do` returns nothing, because `do` is not a status.
- **Actual:** it returns every `todo` **and** `done` task. `String.includes` checks for a substring, not equality.
- **Found by:** `getByStatus › does not match on a partial status` and the matching API test.
- **Fix:** `t.status === status`. A nice side effect: this also stopped the 500 crash described in #5.

## 3. Completing a task resets its priority (fixed)

- **Where:** `src/services/taskService.js:69`, `completeTask` sets `priority: 'medium'`.
- **Expected:** `PATCH /tasks/:id/complete` changes only `status` and `completedAt`.
- **Actual:** a `high` priority task comes back as `medium`. The original priority is lost for good.
- **Found by:** `completeTask › does not change the priority` (unit) and `keeps the original priority` (API).
- **Fix:** delete that line.

## 4. `PUT` can overwrite fields the server should own (open)

- **Where:** `src/services/taskService.js:50`, `update`: `{ ...tasks[index], ...fields }`
- **Expected:** a client can change `title`, `description`, `status`, `priority`, `dueDate`. It can't change `id`
  or `createdAt`.
- **Actual:** `PUT /tasks/:id` with `{ "id": "hacked" }` changes the id. After that the task can't be found by its old
  id any more. Any other key is saved too (`{ "isAdmin": true }` ends up on the task).
- **Why:** the whole request body is spread onto the stored task, and the validator only checks the keys it knows.
- **Found by:** `update › cannot overwrite id or createdAt` and `PUT › cannot change the task id`.
- **Fix:** copy only allowed keys, e.g.
  `const allowed = ['title','description','status','priority','dueDate']` and pick those from `fields`.
  I left this open because it also decides whether `PUT` can change `assignee` (right now it can, which skips the
  409 rule in the new endpoint). I'd like to agree that behaviour with the team first.
- **Related:** the README calls `PUT` a "full update", but it behaves like a partial update (PATCH).

## 5. Empty or `null` status/priority skip validation (open)

- **Where:** `src/utils/validators.js:8, 11, 24, 27`: `if (body.status && !VALID_STATUSES.includes(...))`
- **Expected:** `{ "status": "" }` or `{ "status": null }` is rejected with 400.
- **Actual:** the check starts with `body.status &&`, so any falsy value skips it and gets saved. On create, the
  default (`status = 'todo'`) doesn't help because JavaScript defaults only apply to `undefined`, not `""` or `null`.
- **Impact:** before fix #2, a task with `status: null` made **every** `GET /tasks?status=...` return 500, because
  `null.includes(...)` throws. After fix #2 it no longer crashes, but the task still has an invalid status and is
  not counted in `/tasks/stats`.
- **Found by:** `rejects an empty-string status` and `rejects status: null`.
- **Fix:** check `body.status !== undefined` instead of truthiness. `dueDate` must keep accepting `null`
  (it means "no due date"), so it needs its own rule.

## 6. Malformed JSON returns 500 (open)

- **Where:** `src/app.js:11`, the error handler always sends 500.
- **Expected:** a body like `{bad json` is a client mistake, so 400.
- **Actual:** `express.json()` throws an error that already has `status: 400`, but the handler ignores it and sends
  500. It also logs a full stack trace for every bad request.
- **Found by:** `returns 400 for malformed JSON`.
- **Fix:** `res.status(err.status || 500)`, and only use the generic message when it really is a 500.

## 7. `status` and `completedAt` can disagree (open)

- **Where:** `update` in `taskService.js` doesn't look at `status`.
- **Actual:** `PUT { "status": "done" }` leaves `completedAt: null`. Moving a done task back to `todo` keeps its old
  `completedAt`. Also, completing an already-completed task overwrites the original `completedAt`.
- **Found by:** `setting status to done also sets completedAt`.
- **Fix:** in `update`, set `completedAt` when status becomes `done` and clear it when it leaves `done`. Or only allow
  finishing a task through `/complete`.

## 8. README documents the wrong status values

The original README lists statuses as `pending | in-progress | completed`, but the code uses
`todo | in_progress | done` (ASSIGNMENT.md has the right ones). A client written from the README gets a 400 on every
create with a status. I fixed this in the new README.

---

## Smaller things I noticed (not bugs, but worth a conversation)

- `?status=` and `?page=` can't be combined: when `status` is set, pagination is silently ignored.
- The list endpoint returns a bare array with no total, so a client can't tell how many pages there are.
  (The frontend works it out from `/tasks/stats`.)
- `dueDate` accepts anything `Date.parse` understands (e.g. `"2024"` or `"March 7"`), not only ISO strings.
- `description` isn't validated at all, so it can be a number or an object.
- Titles aren't trimmed, so `"  Buy milk  "` is stored with the spaces.
