// Every call to the backend goes through `call`, so there is one place that:
//   1. sends JSON,
//   2. turns a non-2xx response into a thrown Error carrying the API's own message,
//   3. reports each request to the on-screen request log (via `onRequest`).

let onRequest = () => {};
export const setRequestListener = (fn) => {
  onRequest = fn;
};

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  onRequest({ method, path, status: res.status });

  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Mirrors the routes in task-api/src/routes/tasks.js.
export const api = {
  list: ({ status, page, limit }) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    else {
      params.set('page', page);
      params.set('limit', limit);
    }
    return call('GET', `/tasks?${params}`);
  },
  stats: () => call('GET', '/tasks/stats'),
  create: (task) => call('POST', '/tasks', task),
  update: (id, fields) => call('PUT', `/tasks/${id}`, fields),
  remove: (id) => call('DELETE', `/tasks/${id}`),
  complete: (id) => call('PATCH', `/tasks/${id}/complete`),
  assign: (id, assignee) => call('PATCH', `/tasks/${id}/assign`, { assignee }),
};
