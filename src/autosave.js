import { state, emit } from './state.js';
import { noteId, encryptNote, decryptNote } from './crypto.js';
import { fetchNote, fetchSave, fetchChallenge } from './api.js';
import { solvePowAsync } from './pow.js';

let controller = null;

export function isNoteTitle(t) {
  return !(t == '' || t == 'terms' || t.toLowerCase() == 'suicide' || t == 'about' || t == 'privacy');
}

export function load(title) {
  if (controller != null) {
    controller.abort();
  }
  state.status = 'busy';
  state.loading = true;
  state.serverAhead = false;
  emit();
  state.autoload = setTimeout(function() {
    const id = noteId(title);
    controller = new AbortController();
    fetchNote(id, controller.signal)
      .then(function(json) {
        if (json.body === undefined) {
          state.note = '';
          state.lastCt = null;
        } else {
          const d = JSON.parse(json.body);
          state.note = decryptNote(d.ct, title);
          state.lastCt = d.ct;
        }
        state.serverAhead = false;
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

// One autosave cycle: fetch a challenge, grind the PoW, submit the save.
// `retriesLeft` covers a single challenge-expiry (the 15 s window can lapse
// while a slow device grinds).
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
      proof
    });
    const json = await response.json();

    if (response.status === 200 && json.body === 'successfully saved') {
      state.lastCt = ct;
      state.serverAhead = false;
      state.status = 'ok';
      emit();
      return;
    }
    if (response.status === 401 && json.body === 'challenge expired' && retriesLeft > 0) {
      attemptSave(title, note, retriesLeft - 1);
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

export function pollServer() {
  if (!isNoteTitle(state.title) || state.loading || state.status === 'busy') {
    return;
  }
  const title = state.title;
  const id = noteId(title);
  fetchNote(id)
    .then(function(json) {
      if (state.title !== title || state.loading || state.status === 'busy') {
        return;
      }
      if (json.body === undefined) {
        state.serverAhead = state.lastCt !== null;
      } else {
        const d = JSON.parse(json.body);
        state.serverAhead = d.ct !== state.lastCt;
      }
      emit();
    })
    .catch(function() {});
}
