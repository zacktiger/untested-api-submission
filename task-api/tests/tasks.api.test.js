// Integration tests: send real HTTP requests to the Express app with Supertest.
// The app is imported (not started), so no port is opened.
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// The app logs the stack of every 500. Some bug tests trigger 500s on purpose,
// so keep the test output clean.
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => console.error.mockRestore());

// Create a task through the API and return the response body.
const createTask = async (body = {}) => {
  const res = await request(app).post('/tasks').send({ title: 'Task', ...body });
  return res.body;
};

describe('POST /tasks', () => {
  test('creates a task and returns 201 with the full task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo', completedAt: null });
    expect(res.body.id).toBeDefined();
  });

  test.each([
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['unknown status', { title: 'x', status: 'finished' }],
    ['unknown priority', { title: 'x', priority: 'urgent' }],
    ['unparseable dueDate', { title: 'x', dueDate: 'not a date' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app).post('/tasks').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('ignores fields that are not part of a task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', id: 'chosen-by-client', isAdmin: true });

    expect(res.body.id).not.toBe('chosen-by-client');
    expect(res.body.isAdmin).toBeUndefined();
  });

  // BUG #5: `if (body.status && ...)` skips validation for falsy values, so "" is stored.
  test.failing('rejects an empty-string status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: '' });

    expect(res.status).toBe(400);
  });

  // BUG #6: the error handler turns every error into 500, including body-parser's 400.
  test.failing('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/tasks').set('Content-Type', 'application/json').send('{bad json');

    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'A' });
    await createTask({ title: 'B' });

    const res = await request(app).get('/tasks');

    expect(res.body.map((t) => t.title)).toEqual(['A', 'B']);
  });

  test('filters by exact status', async () => {
    await createTask({ title: 'A', status: 'todo' });
    await createTask({ title: 'B', status: 'in_progress' });

    const res = await request(app).get('/tasks?status=in_progress');

    expect(res.body.map((t) => t.title)).toEqual(['B']);
  });

  // BUG #2: ?status=do matches both "todo" and "done".
  test.failing('does not match a partial status', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'done' });

    const res = await request(app).get('/tasks?status=do');

    expect(res.body).toEqual([]);
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (const title of ['A', 'B', 'C', 'D', 'E']) await createTask({ title });
    });

    // Regression tests for BUG #1 (fixed): page=1 used to return the second page.
    test('page=1 returns the first page', async () => {
      const res = await request(app).get('/tasks?page=1&limit=2');

      expect(res.body.map((t) => t.title)).toEqual(['A', 'B']);
    });

    test('limit alone defaults to page 1', async () => {
      const res = await request(app).get('/tasks?limit=3');

      expect(res.body.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    });

    test('page=2 returns the next slice', async () => {
      const res = await request(app).get('/tasks?page=2&limit=2');

      expect(res.body.map((t) => t.title)).toEqual(['C', 'D']);
    });

    test('non-numeric page and limit fall back to page 1, limit 10', async () => {
      const res = await request(app).get('/tasks?page=abc&limit=xyz');

      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    test('zero or negative page is treated as page 1', async () => {
      const zero = await request(app).get('/tasks?page=0&limit=2');
      const negative = await request(app).get('/tasks?page=-3&limit=2');

      expect(zero.body.map((t) => t.title)).toEqual(['A', 'B']);
      expect(negative.body.map((t) => t.title)).toEqual(['A', 'B']);
    });
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts per status and the overdue count', async () => {
    await createTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not mistaken for a task id', async () => {
    // "/stats" is registered before "/:id" routes; this guards that order.
    const res = await request(app).get('/tasks/stats');

    expect(res.body).not.toHaveProperty('error');
  });
});

describe('PUT /tasks/:id', () => {
  test('updates the given fields and returns the task', async () => {
    const task = await createTask({ description: 'old' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'New', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'New', status: 'in_progress', description: 'old' });
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });

    expect(res.status).toBe(404);
  });

  test.each([
    ['blank title', { title: '' }],
    ['unknown status', { status: 'finished' }],
    ['unknown priority', { priority: 'urgent' }],
    ['unparseable dueDate', { dueDate: 'soon' }],
  ])('rejects %s with 400', async (_label, body) => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send(body);

    expect(res.status).toBe(400);
  });

  // BUG #4: the body is spread straight onto the stored task.
  test.failing('cannot change the task id', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ id: 'hacked' });

    expect(res.body.id).toBe(task.id);
  });

  // BUG #5: status: null passes validation, then GET ?status= crashes on null.includes().
  test.failing('rejects status: null instead of breaking the status filter', async () => {
    const task = await createTask();
    await request(app).put(`/tasks/${task.id}`).send({ status: null });

    const res = await request(app).get('/tasks?status=todo');

    expect(res.status).toBe(200);
  });

  // BUG #7: marking done via PUT leaves completedAt null.
  test.failing('setting status to done also sets completedAt', async () => {
    const task = await createTask();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });

    expect(res.body.completedAt).not.toBeNull();
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes the task and returns 204 with no body', async () => {
    const task = await createTask();

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/does-not-exist');

    expect(res.status).toBe(404);
  });

  test('returns 404 when deleting the same task twice', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks the task done and sets completedAt', async () => {
    const task = await createTask();

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/complete');

    expect(res.status).toBe(404);
  });

  // BUG #3: priority silently becomes "medium".
  test.failing('keeps the original priority', async () => {
    const task = await createTask({ priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body.priority).toBe('high');
  });
});

describe('error handling', () => {
  test('unexpected errors return a generic 500 without leaking details', async () => {
    const spy = jest.spyOn(taskService, 'getAll').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
