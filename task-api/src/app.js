const path = require('path');
const fs = require('fs');
const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());
app.use('/tasks', taskRoutes);

// Serve the React frontend (client/) once it has been built with `npm run build`.
// This keeps deployment to a single server and a single URL: the page and the API share an origin,
// so no CORS setup is needed. During development Vite serves the page instead (see client/vite.config.js).
const clientBuild = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
