/** Metro HMR kills Expo on web (`/?platform=web` and `import "./analyze"` from the repo root). */
const ignore = /JSC-safe|Unable to resolve module \.\/(analyze|batch|settings|index|two|inventory|card)/;

function shouldIgnore(err) {
  const message = err && err.message ? err.message : String(err);
  return ignore.test(message);
}

function wrapListener(listener) {
  return function wrappedUncaught(err) {
    if (shouldIgnore(err)) {
      console.warn('[metro] ignored HMR error:', String(err && err.message ? err.message : err).split('\n')[0]);
      return;
    }
    return listener.call(this, err);
  };
}

const origOn = process.on.bind(process);
const origOnce = process.once.bind(process);
const origAdd = process.addListener.bind(process);
const origPrepend = process.prependListener ? process.prependListener.bind(process) : null;

process.on = function (event, listener) {
  if (event === 'uncaughtException' || event === 'unhandledRejection') {
    return origOn(event, wrapListener(listener));
  }
  return origOn(event, listener);
};
process.addListener = function (event, listener) {
  if (event === 'uncaughtException' || event === 'unhandledRejection') {
    return origAdd(event, wrapListener(listener));
  }
  return origAdd(event, listener);
};
process.once = function (event, listener) {
  if (event === 'uncaughtException' || event === 'unhandledRejection') {
    return origOnce(event, wrapListener(listener));
  }
  return origOnce(event, listener);
};
if (origPrepend) {
  process.prependListener = function (event, listener) {
    if (event === 'uncaughtException' || event === 'unhandledRejection') {
      return origPrepend(event, wrapListener(listener));
    }
    return origPrepend(event, listener);
  };
}

origOn('uncaughtException', wrapListener((err) => {
  console.error(err);
  process.exit(1);
}));
origOn('unhandledRejection', wrapListener((err) => {
  console.error(err);
  process.exit(1);
}));
