// Unit tests: call taskService functions directly, no HTTP involved.
// The store is a module-level array, so we wipe it before every test.
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// Small helper so each test only spells out the fields it cares about.
const make = (overrides = {}) => taskService.create({ title: 'Task', ...overrides });

describe('create', () => {
  test('fills in defaults for optional fields', () => {
    const task = make();

    expect(task).toMatchObject({
      title: 'Task',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(typeof task.id).toBe('string');
    expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
  });

  test('keeps the values it is given', () => {
    const task = make({ description: 'd', status: 'in_progress', priority: 'high', dueDate: '2030-01-01T00:00:00.000Z' });

    expect(task).toMatchObject({ description: 'd', status: 'in_progress', priority: 'high', dueDate: '2030-01-01T00:00:00.000Z' });
  });

  test('gives every task a unique id', () => {
    expect(make().id).not.toBe(make().id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns every task in insertion order', () => {
    make({ title: 'A' });
    make({ title: 'B' });

    expect(taskService.getAll().map((t) => t.title)).toEqual(['A', 'B']);
  });

  test('getAll returns a copy, so mutating it does not touch the store', () => {
    make();
    taskService.getAll().pop();

    expect(taskService.getAll()).toHaveLength(1);
  });

  test('findById returns the task, or undefined for an unknown id', () => {
    const task = make();

    expect(taskService.findById(task.id)).toEqual(task);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with that status', () => {
    make({ title: 'A', status: 'todo' });
    make({ title: 'B', status: 'done' });

    expect(taskService.getByStatus('done').map((t) => t.title)).toEqual(['B']);
  });

  // Regression test for BUG #2 (fixed): used String.includes, so partial words matched.
  test('does not match on a partial status', () => {
    make({ status: 'todo' });
    make({ status: 'done' });

    // "do" is a substring of both "todo" and "done"
    expect(taskService.getByStatus('do')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    ['A', 'B', 'C', 'D', 'E'].forEach((title) => make({ title }));
  });

  // Regression tests for BUG #1 (fixed): page 1 used to skip the first page.
  test('page 1 returns the first `limit` tasks', () => {
    expect(taskService.getPaginated(1, 2).map((t) => t.title)).toEqual(['A', 'B']);
  });

  test('last page returns the remainder', () => {
    expect(taskService.getPaginated(3, 2).map((t) => t.title)).toEqual(['E']);
  });

  test('a page past the end is empty', () => {
    expect(taskService.getPaginated(10, 2)).toEqual([]);
  });
});

describe('getStats', () => {
  test('counts tasks per status', () => {
    make({ status: 'todo' });
    make({ status: 'todo' });
    make({ status: 'in_progress' });
    make({ status: 'done' });

    expect(taskService.getStats()).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 0 });
  });

  test('overdue = past due date and not done', () => {
    const past = '2000-01-01T00:00:00.000Z';
    make({ dueDate: past }); // overdue
    make({ dueDate: past, status: 'done' }); // done, so not overdue
    make({ dueDate: '2999-01-01T00:00:00.000Z' }); // future
    make(); // no due date

    expect(taskService.getStats().overdue).toBe(1);
  });

  test('returns all zeros for an empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('update', () => {
  test('merges the given fields and keeps the rest', () => {
    const task = make({ description: 'keep me' });
    const updated = taskService.update(task.id, { title: 'New' });

    expect(updated).toMatchObject({ id: task.id, title: 'New', description: 'keep me' });
    expect(taskService.findById(task.id).title).toBe('New');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  // BUG #4 (see BUG_REPORT.md): every field in the body is copied onto the task, including id.
  test.failing('cannot overwrite id or createdAt', () => {
    const task = make();
    const updated = taskService.update(task.id, { id: 'hacked', createdAt: 'yesterday' });

    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
  });
});

describe('remove', () => {
  test('deletes the task and returns true', () => {
    const task = make();

    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  test('returns false for an unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  test('sets status to done and stamps completedAt', () => {
    const task = make();
    const done = taskService.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(Number.isNaN(Date.parse(done.completedAt))).toBe(false);
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  // Regression test for BUG #3 (fixed): completeTask used to hard-code priority: 'medium'.
  test('does not change the priority', () => {
    const task = make({ priority: 'high' });

    expect(taskService.completeTask(task.id).priority).toBe('high');
  });
});
