import { useCallback, useEffect, useState } from 'react';
import { api, setRequestListener } from './api.js';
import TaskForm from './TaskForm.jsx';
import TaskRow from './TaskRow.jsx';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];
const PAGE_SIZE = 5;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  // Show the latest 6 API calls at the bottom of the page.
  useEffect(() => {
    setRequestListener((entry) => setLog((prev) => [{ ...entry, id: crypto.randomUUID() }, ...prev].slice(0, 6)));
  }, []);

  // Re-fetch the list and the stats. Called after every change, so the screen always shows server state.
  const refresh = useCallback(async () => {
    try {
      const [list, counts] = await Promise.all([api.list({ status: filter, page, limit: PAGE_SIZE }), api.stats()]);
      setTasks(list);
      setStats(counts);
      setError('');
    } catch (err) {
      setError(`Could not load tasks: ${err.message}`);
    }
  }, [filter, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The API has no "total" field, so the page count is worked out from /stats.
  // The API also ignores page/limit when ?status= is set, so filtered views are a single list.
  const total = stats.todo + stats.in_progress + stats.done;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showPager = !filter && total > PAGE_SIZE;

  // If deleting the last task on a page leaves it empty, step back a page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const chooseFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  return (
    <main className="page">
      <header className="masthead">
        <h1>Task API</h1>
        <p className="summary">
          {total === 0 ? (
            'No tasks yet.'
          ) : (
            <>
              {stats.todo} to do, {stats.in_progress} in progress, {stats.done} done
              {stats.overdue > 0 && <>, <span className="overdue-note">{stats.overdue} overdue</span></>}.
            </>
          )}
        </p>
      </header>

      <TaskForm onCreate={async (task) => { await api.create(task); await refresh(); }} />

      <nav className="filters" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={filter === f.value ? 'filter active' : 'filter'}
            aria-pressed={filter === f.value}
            onClick={() => chooseFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {error && <p className="banner" role="alert">{error}</p>}

      {tasks.length === 0 && !error ? (
        <p className="empty">{filter ? 'No tasks with this status.' : 'Add a task above to get started.'}</p>
      ) : (
        <ul className="tasks">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onChange={refresh} />
          ))}
        </ul>
      )}

      {showPager && (
        <div className="pager">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= pageCount}>Next</button>
        </div>
      )}

      <section className="log" aria-live="polite">
        <h2>Requests</h2>
        {log.length === 0 ? (
          <p className="log-empty">API calls made by this page show up here.</p>
        ) : (
          <ol>
            {log.map((entry) => (
              <li key={entry.id}>
                <span className="log-method">{entry.method}</span>
                <span className="log-path">{entry.path}</span>
                <span className={`log-status s${String(entry.status)[0]}`}>{entry.status}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
