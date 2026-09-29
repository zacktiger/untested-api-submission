import { useState } from 'react';
import { api } from './api.js';

const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// One task. Every button maps to one API call; after it succeeds the parent re-fetches the list.
// Errors (e.g. the 409 from assigning a taken task) are shown on the row they belong to.
export default function TaskRow({ task, onChange }) {
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [name, setName] = useState('');

  const run = async (action) => {
    try {
      await action();
      setError('');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  };

  const assign = (e) => {
    e.preventDefault();
    run(async () => {
      await api.assign(task.id, name);
      setAssigning(false);
      setName('');
    });
  };

  const overdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date();

  return (
    <li className={`task status-${task.status}`}>
      <div className="task-main">
        <h3>{task.title}</h3>
        {task.description && <p className="task-desc">{task.description}</p>}
        <p className="task-meta">
          <span className={`priority p-${task.priority}`}>{task.priority} priority</span>
          {task.dueDate && (
            <span className={overdue ? 'due overdue' : 'due'}>
              {overdue ? 'Overdue since' : 'Due'} {formatDate(task.dueDate)}
            </span>
          )}
          {task.completedAt && <span>Completed {formatDate(task.completedAt)}</span>}
        </p>
      </div>

      <div className="task-side">
        {/* The assignee "name tag". Clicking the x sends { assignee: null }. */}
        {task.assignee ? (
          <span className="tag">
            {task.assignee}
            <button className="tag-x" aria-label={`Unassign ${task.assignee}`} onClick={() => run(() => api.assign(task.id, null))}>
              ×
            </button>
          </span>
        ) : null}

        {assigning ? (
          <form className="assign" onSubmit={assign}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Assignee name" />
            <button className="primary small">Assign</button>
            <button type="button" className="small" onClick={() => { setAssigning(false); setError(''); }}>Cancel</button>
          </form>
        ) : (
          <button className="small" onClick={() => setAssigning(true)}>
            {task.assignee ? 'Reassign' : 'Assign'}
          </button>
        )}

        <label className="status-select">
          <span className="visually-hidden">Status</span>
          <select value={task.status} onChange={(e) => run(() => api.update(task.id, { status: e.target.value }))}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        {task.status !== 'done' && (
          <button className="small done-btn" onClick={() => run(() => api.complete(task.id))}>Complete</button>
        )}
        <button className="small danger" onClick={() => run(() => api.remove(task.id))}>Delete</button>
      </div>

      {error && <p className="row-error" role="alert">{error}</p>}
    </li>
  );
}
