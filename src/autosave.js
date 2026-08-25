import { state, emit } from './state.js';
import { noteId, encryptNote, decryptNote } from './crypto.js';
import { fetchNote, fetchSave, fetchChallenge } from './api.js';
import { solvePowAsync } from './pow.js';

let controller = null;

export function load(title) {
  if (controller != null) {
    controller.abort();
  }
  state.version = 0;
  state.conflict = false;
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
          state.version = typeof d.version === 'number' ? d.version : 0;
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
      attemptSave(title, note, 1);
      state.autosave = null;
    }
  }, 2000);
}

// One autosave cycle: fetch a challenge, grind the PoW, submit with the
// version this client last saw. `retriesLeft` covers a single challenge-
// expiry (the 15 s window can lapse while a slow device grinds).
async function attemptSave(title, note, retriesLeft) {
  try {
    const id = noteId(title);
    const ct = encryptNote(note, title);

    let challenge;
    try {
      challenge = await fetchChallenge();
    } catch (error) {
      console.log('error fetching challenge: ' + error);
      failSave();
      return;
    }

    const proof = await solvePowAsync(challenge);
    if (proof === null) {
      console.log('error: proof of work failed');
      failSave();
      return;
    }

    const response = await fetchSave(id, ct, {
      challenge: challenge.nonce,
      proof,
      version: state.version
    });
    const json = await response.json();

    if (response.status === 200 && json.body === 'successfully saved') {
      state.version = typeof json.version === 'number' ? json.version : state.version + 1;
      state.conflict = false;
      state.status = 'ok';
      emit();
      return;
    }
    if (response.status === 401 && json.body === 'challenge expired' && retriesLeft > 0) {
      attemptSave(title, note, retriesLeft - 1);
      return;
    }
    if (response.status === 409) {
      state.version = typeof json.version === 'number' ? json.version : state.version;
      state.conflict = true;
      failSave();
      return;
    }
    console.log('save rejected (' + response.status + '): ' + json.body);
    failSave();
  } catch (error) {
    console.log('error saving: ' + error);
    failSave();
  }
}

function failSave() {
  state.status = 'error';
  emit();
}
