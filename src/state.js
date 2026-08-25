export const state = {
  title: '',
  note: '',
  status: '',
  autosave: null,
  autoload: null,
  loading: false,
  version: 0,
  conflict: false
};

const listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
}

export function emit() {
  for (const fn of listeners) {
    fn();
  }
}
