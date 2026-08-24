import { state, emit } from './state.js';
import { noteId, encryptNote, decryptNote } from './crypto.js';
import { fetchNote, fetchSave } from './api.js';

let controller = null;

export function load(title) {
  if (controller != null) {
    controller.abort();
  }
  state.status = 'busy';
  state.loading = true;
  emit();
  state.autoload = setTimeout(function() {
    const id = noteId(title);
    controller = new AbortController();
    fetchNote(id, controller.signal)
      .then(function(json) {
        if (json.body === undefined) {
          state.note = '';
        } else {
          const d = JSON.parse(json.body);
          state.note = decryptNote(d.ct, title);
        }
        state.status = 'ok';
        state.loading = false;
        controller = null;
        emit();
      })
      .catch(function(error) {
        if (error.toString().search('AbortError') < 0) {
          console.log('error: ' + error);
          state.status = 'error';
          emit();
        }
      });
  }, 300);
}

export function save(title, note) {
  state.status = 'busy';
  emit();
  clearTimeout(state.autosave);
  state.autosave = setTimeout(function() {
    if (note.length >= 100000) {
      state.status = 'error';
      state.autosave = null;
      emit();
    } else {
      const id = noteId(title);
      const ct = encryptNote(note, title);
      fetchSave(id, ct)
        .then(function(json) {
          if (json.body == 'successfully saved') {
            state.status = 'ok';
          } else {
            state.status = 'error';
          }
          emit();
        })
        .catch(function(error) {
          console.log('error saving: ' + error);
          state.status = 'error';
          emit();
        });
      state.autosave = null;
    }
  }, 2000);
}
