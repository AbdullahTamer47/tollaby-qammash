function runBackgroundTask(task, label = 'background task') {
  const promise = Promise.resolve()
    .then(task)
    .catch(err => {
      console.error(`${label} failed:`, err);
    });

  try {
    const { waitUntil } = require('@vercel/functions');
    waitUntil(promise);
  } catch {
    // Outside Vercel, the promise still runs on the normal Node event loop.
  }

  return promise;
}

module.exports = { runBackgroundTask };
