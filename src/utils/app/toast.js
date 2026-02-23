const listeners = new Set();

export function showToast(message){
  listeners.forEach(fn => {
    try { fn(message); } catch (_) {}
  });
}

export function onToast(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}
