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
  // Returns the raw Response: callers need status codes and Retry-After.
  return fetch(API_BASE + '/api/save2', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

// Phase-6 admin API. Server envelopes: {"body":"<json>"} for object results
// and a plain-string body ("forbidden", "read-only", "blocked", ...). data is
// the parsed body object when available, else null. Network failure ->
// {ok:false, status:0, data:null}.
export async function adminPost(name, payload) {
  let response;
  try {
    response = await fetch(API_BASE + '/api/admin/' + name, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify(payload === undefined ? {} : payload)
    });
  } catch (error) {
    return { ok: false, status: 0, data: null };
  }
  let json = null;
  try {
    json = await response.json();
  } catch (error) {
    json = null;
  }
  let data = null;
  if (json && typeof json.body === 'string') {
    try {
      const parsed = JSON.parse(json.body);
      if (parsed !== null && typeof parsed === 'object') {
        data = parsed;
      }
    } catch (error) {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data: data };
}
