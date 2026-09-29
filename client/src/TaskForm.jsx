import { useState } from 'react';

const EMPTY = { title: '', description: '', priority: 'medium', dueDate: '' };

// Form for POST /tasks. Validation is left to the API on purpose, so its 400 messages show up here as-is.
export default function TaskForm({ onCreate }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreate({
        title: form.title,
        description: form.description,
        priority: form.priority,
        // <input type="date"> gives "2026-10-01"; send null when empty (the API's default).
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      });
      setForm(EMPTY);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="new-task" onSubmit={submit}>
      <label className="field grow">
        <span>Title</span>
        <input value={form.title} onChange={set('title')} placeholder="What needs doing?" />
      </label>
      <label className="field grow">
        <span>Description</span>
        <input value={form.description} onChange={set('description')} placeholder="Optional" />
      </label>
      <label className="field">
        <span>Priority</span>
        <select value={form.priority} onChange={set('priority')}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className="field">
        <span>Due</span>
        <input type="date" value={form.dueDate} onChange={set('dueDate')} />
      </label>
      <button className="primary" disabled={saving}>Add task</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
