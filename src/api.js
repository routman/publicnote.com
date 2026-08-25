const API_BASE = import.meta.env.PROD ? 'https://publicnote.com' : '';

export async function fetchNote(id, signal) {
  const response = await fetch(API_BASE + '/api/get2', {
    signal,
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({ id })
  });
  return response.json();
}

export async function fetchChallenge() {
  const response = await fetch(API_BASE + '/api/challenge', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-type': 'application/json'
    },
    body: '{}'
  });
  const json = await response.json();
  return JSON.parse(json.body);
}

export async function fetchSave(id, ct, extra) {
  const payload = { id, ct };
  if (extra && extra.challenge !== undefined) {
    payload.challenge = extra.challenge;
  }
  if (extra && extra.proof !== undefined) {
    payload.proof = extra.proof;
  }
  if (extra && extra.version !== undefined) {
    payload.version = extra.version;
  }
  // Returns the raw Response: callers need status codes, Retry-After, and
  // the version stamped on success.
  return fetch(API_BASE + '/api/save2', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}
