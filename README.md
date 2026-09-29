# The Untested API: submission

My submission for the take-home in [ASSIGNMENT.md](./ASSIGNMENT.md). I added tests to a small Express task API,
found and reported its bugs, fixed some of them, and added a `PATCH /tasks/:id/assign` endpoint.

- **Live demo:** https://untested-task-api-4k1h.onrender.com (React UI and API on one server; the API is under `/tasks`)
- **Repository:** https://github.com/zacktiger/untested-api-submission

> The live instance is on Render's free tier. It sleeps after ~15 minutes idle, so the first request can take
> ~30 seconds. The data is in memory, so it resets whenever the server restarts or wakes up.

## What's in here

| Part | Where |
|------|-------|
| Day 1: tests (78, 98.8% statement coverage) | [`task-api/tests/`](./task-api/tests) |
| Day 2, Part A: bug report (8 bugs) | [BUG_REPORT.md](./BUG_REPORT.md) |
| Day 2, Part B: bug fix | pagination; also two small one-line fixes (see below) |
| Day 2, Part C: assign endpoint | `task-api/src/routes/tasks.js`, [`tests/assign.test.js`](./task-api/tests/assign.test.js) |
| Extra: React frontend to try the API | [`client/`](./client) |

The commit history follows the same order: tests first, then one commit per fix, then the feature.

## Running it

Needs Node.js 18+.

```bash
# API only (as in the brief)
cd task-api
npm install
npm start            # http://localhost:3000
npm test
npm run coverage

# Frontend in dev mode (second terminal): Vite on :5173 forwards /tasks to the API on :3000
cd client
npm install
npm run dev          # http://localhost:5173

# Production-style: build the frontend, then one server serves both
npm run build        # from the repo root
npm start            # http://localhost:3000
```

## Day 1: tests

There are three test files. Each one resets the in-memory store before every test, so no test depends on
another.

- `taskService.test.js`: **unit tests.** They call the service functions directly: create defaults, filtering,
  pagination, stats (including overdue), update, remove, complete.
- `tasks.api.test.js`: **integration tests.** They send real HTTP requests to every route with Supertest: happy
  paths, 400s for each validation rule, 404s for unknown ids, `DELETE` twice, the 500 handler, and the
  `/stats` vs `/:id` route order.
- `assign.test.js`: tests for the new endpoint (below).

The tests check **behaviour** (what the API returns) and not implementation details. The one exception is the
500 test, which has to force an internal error.

**Known bugs as tests.** Each open bug has a test that describes the *correct* behaviour, marked
`test.failing(...)`. Jest expects those tests to fail, so the suite stays green. When someone fixes one of those
bugs, Jest flags the test as "unexpectedly passing", which reminds them to turn it into a normal test.

### Coverage

```
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.81 |       97 |   96.66 |    98.7 |
  app.js         |   88.88 |    66.66 |      50 |   88.88 | 27-28
  tasks.js       |     100 |      100 |     100 |     100 |
  taskService.js |     100 |    94.73 |     100 |     100 | 25
  validators.js  |     100 |      100 |     100 |     100 |

Tests:       78 passed, 78 total
```

`app.js` lines 27-28 are `app.listen(...)`, which only runs when the file is started directly and never in
tests. `taskService.js:25` is the branch for a task with an invalid status, which only happens because of bug #5.

## Day 2

### Part A: bug report

Full details, with file and line, why each bug happens, how I found it, and the fix, are in
**[BUG_REPORT.md](./BUG_REPORT.md)**. Summary:

1. **Pagination skips the first page:** `offset = page * limit` with 1-based pages. **Fixed.**
2. **Status filter matches partial words:** `includes` instead of `===`, so `?status=do` returns todo and done. **Fixed.**
3. **Completing a task resets priority to medium.** **Fixed.**
4. `PUT` spreads the whole body onto the task, so a client can overwrite `id` / `createdAt`.
5. Validators use truthiness (`body.status && ...`), so `""` and `null` skip validation. `null` used to cause a 500 on filtering.
6. Malformed JSON returns 500 instead of 400.
7. `status` and `completedAt` can get out of sync through `PUT`.
8. The original README listed the wrong status values.

### Part B: the fix

I picked **pagination (#1)** as the main fix. It's the one a real client hits first, and it fails quietly: the
first page of tasks never shows up and nothing errors.

- `getPaginated` now uses `(page - 1) * limit`.
- The route clamps `page` and `limit` to at least 1. After the fix a negative page would give a negative offset,
  and `Array.slice` reads negative numbers from the end of the array, so the page would show the wrong tasks.
- The two tests that were `test.failing` now pass normally. I added tests for page 2, non-numeric input, and
  zero/negative pages.

I also fixed #2 and #3. Each was a one-line change with no design question, and each had a failing test ready.
I left #4 to #7 open on purpose: fixing them changes the API contract (what `PUT` accepts, whether `null` is
allowed), and I'd want to agree those changes with the team first.

### Part C: `PATCH /tasks/:id/assign`

```
PATCH /tasks/:id/assign
Body: { "assignee": "Alice" }   -> assign
      { "assignee": null }      -> un-assign
```

| Situation | Response |
|-----------|----------|
| Valid name, task unassigned | `200` + updated task |
| Same name as current assignee | `200` (no change, safe to retry) |
| Different name while already assigned | `409 Conflict`, says who has it |
| `null` | `200`, `assignee` becomes `null` |
| Missing key, `""`, only spaces, not a string, over 100 chars | `400` |
| Unknown task id | `404` |

**Design decisions**

- **Empty string gets a 400, not "un-assign".** An empty string is more likely a bug in the client (an empty form
  field) than a deliberate action. Un-assigning uses an explicit `null`, so it can't happen by accident.
- **Names are trimmed.** `"  Alice "` and `"Alice"` are the same person, so both are stored as `"Alice"`. That also
  keeps the "same person" check below reliable.
- **Already assigned to someone else: 409.** Overwriting would let two people who click "assign to me" at the
  same time silently take the task from each other, and the first one would never find out. With a 409 the
  takeover is explicit: un-assign, then assign. The error message names the current assignee so the client can
  show it.
- **Same person again: 200.** Retrying a request (after a network timeout, for example) shouldn't fail.
- **Check order is 400, then 404, then 409.** That matches the existing `PUT` route (validate the body first).
- **New tasks start with `assignee: null`**, so every task has the same shape and clients don't need to handle a
  missing key.
- **Max 100 characters.** This keeps someone from storing a huge string in memory; 100 is plenty for a name.
- **Where the logic lives:** input rules in `validators.js` (like the other validators), the 404/409 decisions in
  the route (they are HTTP responses), and the actual write in `taskService.assignTask`.

**Trade-off I'm aware of:** because of bug #4, `PUT /tasks/:id { "assignee": "Bob" }` still skips the 409 rule.
Fixing #4 with an allow-list that leaves out `assignee` would close that gap.

## Frontend (extra)

A small React + Vite app in `client/` so the API can be tried from a browser. Every control maps to exactly one
endpoint (create, filter, page, change status via `PUT`, complete, delete, assign/un-assign). A **request log** at
the bottom shows each call and its status code. For example, trying to reassign a taken task shows the `409`
and the API's message on that row.

It has no separate state library or router. `App.jsx` holds the state and re-fetches from the API after every
change, so the screen always shows what the server has.

In production Express serves the built files from `client/dist`, so the page and the API are on the same origin.
That means one deploy, one URL, and no CORS setup.

## Project structure

```
task-api/
  src/
    app.js                  Express setup; also serves the React build if it exists
    routes/tasks.js         Route handlers (+ the new /assign route)
    services/taskService.js In-memory store and business logic
    utils/validators.js     Input validation (+ validateAssignTask)
  tests/
    taskService.test.js     Unit tests
    tasks.api.test.js       Integration tests for all original routes
    assign.test.js          Tests for the new endpoint
client/
  src/App.jsx               Page, filters, pagination, request log
  src/TaskRow.jsx           One task with its actions
  src/TaskForm.jsx          Create form
  src/api.js                The only place that calls fetch()
BUG_REPORT.md
render.yaml                 Deploy config (one free web service)
package.json                Root build/start scripts used by the deploy
```

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tasks` | List all tasks. Supports `?status=` or `?page=&limit=` (1-based) |
| `POST` | `/tasks` | Create a task (`title` required) |
| `PUT` | `/tasks/:id` | Update the given fields |
| `DELETE` | `/tasks/:id` | Delete (204) |
| `PATCH` | `/tasks/:id/complete` | Mark done, set `completedAt` |
| `PATCH` | `/tasks/:id/assign` | Assign or un-assign (new) |
| `GET` | `/tasks/stats` | Counts per status + overdue count |

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 or null",
  "assignee": "string or null",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

## Notes

**What I'd test next**

- Status filter and pagination used together. Right now `status` silently wins, and I'd want to decide what
  *should* happen and then pin it down with a test.
- Date edge cases for `overdue`: a due date of exactly "now", time zones, and loose strings like `"2024"` that
  `Date.parse` accepts.
- Concurrency on assign: two assign requests at the same time. Node runs one handler at a time, so it's safe
  today, but it wouldn't be with a real database without a conditional update.
- Large inputs: very long titles and descriptions, and huge `limit` values.
- Frontend tests with React Testing Library (the request log and the 409 message).

**What surprised me**

- How much the bugs hid each other. Bug #5 (`null` status accepted) only *showed up* as a crash because of bug #2
  (`includes`). After fixing #2 the crash disappeared but the bad data didn't. The failing test caught that, and
  I rewrote it to check the real cause.
- `completeTask` resetting priority looks like leftover code from something else. It's the kind of bug no user
  would report, because they wouldn't connect it to clicking "complete".
- The README and the code disagreed on the status values.

**What I'd ask before shipping to production**

- Should `PUT` really be a full replace (as documented) or a partial update (as built)? And which fields can a
  client change?
- Can anyone reassign a task, or only the current assignee or a manager? This needs auth, which doesn't exist yet.
- Should assignees be real user ids instead of free-text names? Free text means "Alice" and "alice" are two
  different people.
- Where will the data live? Everything is lost on restart, and with more than one server each one would have its
  own separate task list.
- Is there a rate limit, or a limit on the number of tasks? Right now any client can grow the in-memory array
  until the process runs out of memory.
