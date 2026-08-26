import { state, subscribe, emit } from './state.js';
import { load, save, pollServer, isNoteTitle } from './autosave.js';
import { adminActive } from './admin.js';

const POLL_MS = 10000;

let statusHover = false;

const els = {};

function renderStatus() {
  const s = state.status;
  const ahead = state.serverAhead;
  els.spinner.style.display = s == 'busy' ? '' : 'none';
  els.checkmark.style.display = s == 'ok' && !statusHover && !ahead ? '' : 'none';
  els.exclaim.style.display = s == 'ok' && !statusHover && ahead ? '' : 'none';
  els.refresh.style.display = s == 'error' || (s == 'ok' && statusHover) ? '' : 'none';
  els.close.style.display = s == 'error' && !statusHover ? '' : 'none';
}

function renderContent() {
  const t = state.title;
  const lower = t.toLowerCase();
  const admin = adminActive();
  els.home.style.display = admin ? 'none' : t == '' ? '' : 'none';
  els.terms.style.display = admin ? 'none' : t == 'terms' ? '' : 'none';
  els.suicide.style.display = admin ? 'none' : lower == 'suicide' ? '' : 'none';
  els.about.style.display = admin ? 'none' : t == 'about' ? '' : 'none';
  els.privacy.style.display = admin ? 'none' : t == 'privacy' ? '' : 'none';
  els.note.style.display = admin ? 'none' : isNoteTitle(t) ? '' : 'none';
  els.admin.style.display = admin ? '' : 'none';
}

function syncEditor() {
  if (els.note.value !== state.note) {
    els.note.value = state.note;
  }
  els.note.disabled = state.loading == true;
  els.note.classList.toggle('blur', state.loading);
}

function navigate(title) {
  state.title = title;
  els.title.value = title;
  renderContent();
}

function setEye(hidden) {
  els.eyeOpen.style.display = hidden ? 'none' : '';
  els.eyeClosed.style.display = hidden ? '' : 'none';
  els.title.type = hidden ? 'password' : 'text';
}

export function init() {
  els.title = document.getElementById('title-input');
  els.home = document.querySelector('.page.home');
  els.terms = document.querySelector('.page.terms');
  els.suicide = document.querySelector('.page.suicide');
  els.about = document.querySelector('.page.about');
  els.privacy = document.querySelector('.page.privacy');
  els.admin = document.querySelector('.page.admin');
  els.note = document.getElementById('note');
  els.spinner = document.getElementById('spinner');
  els.checkmark = document.getElementById('checkmark');
  els.refresh = document.querySelector('.refresh.icon');
  els.close = document.querySelector('.close.icon');
  els.eyeOpen = document.getElementById('eye-open');
  els.eyeClosed = document.getElementById('eye-closed');
  els.exclaim = document.getElementById('exclaim');

  els.title.addEventListener('input', function() {
    state.title = els.title.value;
    renderContent();
    clearTimeout(state.autoload);
    clearTimeout(state.autosave);
    if (state.title != '' && state.title != 'terms' && state.title != 'contact' && state.title != 'privacy' && state.title.toLowerCase() != 'suicide') {
      load(state.title);
    } else {
      state.note = '';
      state.status = '';
      emit();
    }
  });

  els.note.addEventListener('input', function() {
    state.note = els.note.value;
    save(state.title, state.note);
  });

  const status = document.getElementById('status');
  status.addEventListener('mouseover', function() {
    statusHover = true;
    renderStatus();
  });
  status.addEventListener('mouseleave', function() {
    statusHover = false;
    renderStatus();
  });
  status.addEventListener('click', function(e) {
    if (e.target.classList.contains('refresh')) {
      load(state.title);
    }
  });

  els.eyeOpen.addEventListener('click', function() {
    setEye(true);
  });
  els.eyeClosed.addEventListener('click', function() {
    setEye(false);
  });

    document.getElementById('app').addEventListener
('click', function(e) {
    const target = e.target.closest('[data-goto]');
    if (target) {
      navigate(target.getAttribute('data-goto'));
    }
  });

  const year = String(new Date().getFullYear());
  document.querySelectorAll('.year').forEach(function(el) {
    el.textContent = year;
  });

  subscribe(function() {
    renderStatus();
    renderContent();
    syncEditor();
  });

  renderStatus();
  renderContent();
  syncEditor();

  setInterval(function() {
    if (document.visibilityState === 'visible') {
      pollServer();
    }
  }, POLL_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      pollServer();
    }
  });

  els.title.focus();
}
