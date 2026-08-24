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

export async function fetchSave(id, ct) {
  const response = await fetch(API_BASE + '/api/save2', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({ id, ct })
  });
  return response.json();
}
