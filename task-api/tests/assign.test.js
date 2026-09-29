// Tests for the new PATCH /tasks/:id/assign endpoint (Part C).
// Rules being tested (reasoning in README.md -> "The assign endpoint"):
//   - assignee must be a non-empty string (trimmed), max 100 chars   -> else 400
//   - assignee: null un-assigns the task                              -> 200
//   - unknown task id                                                  -> 404
//   - task already assigned to someone else                            -> 409
//   - assigning the same person again is a no-op                       -> 200
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

const createTask = async (body = {}) => (await request(app).post('/tasks').send({ title: 'Task', ...body })).body;
const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

describe('PATCH /tasks/:id/assign', () => {
  test('new tasks start unassigned', async () => {
    const task = await createTask();

    expect(task.assignee).toBeNull();
  });

  test('assigns the task and returns the updated task', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'Alice' });
  });

  test('the assignment is saved', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const [saved] = (await request(app).get('/tasks')).body;

    expect(saved.assignee).toBe('Alice');
  });

  test('trims surrounding whitespace from the name', async () => {
    const task = await createTask();

    const res = await assign(task.id, { assignee: '  Alice  ' });

    expect(res.body.assignee).toBe('Alice');
  });

  test('does not touch any other field', async () => {
    const task = await createTask({ priority: 'high', status: 'in_progress' });

    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.body).toEqual({ ...task, assignee: 'Alice' });
  });

  test('returns 404 for an unknown task', async () => {
    const res = await assign('does-not-exist', { assignee: 'Alice' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  describe('validation', () => {
    test.each([
      ['missing assignee', {}],
      ['empty string', { assignee: '' }],
      ['only whitespace', { assignee: '   ' }],
      ['a number', { assignee: 42 }],
      ['an object', { assignee: { name: 'Alice' } }],
      ['longer than 100 characters', { assignee: 'a'.repeat(101) }],
    ])('rejects %s with 400', async (_label, body) => {
      const task = await createTask();

      const res = await assign(task.id, body);

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.any(String));
    });

    test('a rejected request leaves the task unchanged', async () => {
      const task = await createTask();
      await assign(task.id, { assignee: '' });

      const [saved] = (await request(app).get('/tasks')).body;

      expect(saved.assignee).toBeNull();
    });

    test('accepts a name of exactly 100 characters', async () => {
      const task = await createTask();

      const res = await assign(task.id, { assignee: 'a'.repeat(100) });

      expect(res.status).toBe(200);
    });
  });

  describe('when the task is already assigned', () => {
    test('assigning someone else returns 409 and keeps the current assignee', async () => {
      const task = await createTask();
      await assign(task.id, { assignee: 'Alice' });

      const res = await assign(task.id, { assignee: 'Bob' });
      const [saved] = (await request(app).get('/tasks')).body;

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Alice/);
      expect(saved.assignee).toBe('Alice');
    });

    test('assigning the same person again is fine (idempotent)', async () => {
      const task = await createTask();
      await assign(task.id, { assignee: 'Alice' });

      const res = await assign(task.id, { assignee: 'Alice' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Alice');
    });

    test('assignee: null un-assigns, after which someone else can take it', async () => {
      const task = await createTask();
      await assign(task.id, { assignee: 'Alice' });

      const unassigned = await assign(task.id, { assignee: null });
      const reassigned = await assign(task.id, { assignee: 'Bob' });

      expect(unassigned.status).toBe(200);
      expect(unassigned.body.assignee).toBeNull();
      expect(reassigned.body.assignee).toBe('Bob');
    });
  });
});

describe('taskService.assignTask', () => {
  test('sets the assignee and returns the updated task', () => {
    const task = taskService.create({ title: 'Task' });

    expect(taskService.assignTask(task.id, 'Alice')).toMatchObject({ id: task.id, assignee: 'Alice' });
    expect(taskService.findById(task.id).assignee).toBe('Alice');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('nope', 'Alice')).toBeNull();
  });
});
