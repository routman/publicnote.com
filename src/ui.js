import { state, subscribe, emit } from './state.js';
import { load, save } from './autosave.js';

let statusHover = false;

const els = {};

function renderStatus() {
  const s = state.status;
  els.spinner.style.display = s == 'busy' ? '' : 'none';
  els.checkmark.style.display = s == 'ok' && !statusHover ? '' : 'none';
  els.refresh.style.display = s == 'error' || (s == 'ok' && statusHover) ? '' : 'none';
  els.close.style.display = s == 'error' && !statusHover ? '' : 'none';
}

function renderContent() {
  const t = state.title;
  const lower = t.toLowerCase();
  els.home.style.display = t == '' ? '' : 'none';
  els.terms.style.display = t == 'terms' ? '' : 'none';
  els.suicide.style.display = lower == 'suicide' ? '' : 'none';
  els.about.style.display = t == 'about' ? '' : 'none';
  const noteVisible = !(t == '' || t == 'terms' || lower == 'suicide' || t == 'about');
  els.note.style.display = noteVisible ? '' : 'none';
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
  els.note = document.getElementById('note');
  els.spinner = document.getElementById('spinner');
  els.checkmark = document.getElementById('checkmark');
  els.refresh = document.querySelector('.refresh.icon');
  els.close = document.querySelector('.close.icon');
  els.eyeOpen = document.getElementById('eye-open');
  els.eyeClosed = document.getElementById('eye-closed');

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  els.title.addEventListener('input', function() {
    state.title = els.title.value;
    renderContent();
  });
  els.title.addEventListener('keyup', function() {
    clearTimeout(state.autoload);
    clearTimeout(state.autosave);
    if (state.title != '' && state.title != 'terms' && state.title != 'contact' && state.title.toLowerCase() != 'suicide') {
      load(state.title);
    } else {
      state.note = '';
      state.status = '';
      emit();
    }
  });

  els.note.addEventListener('input', function() {
    state.note = els.note.value;
  });
  els.note.addEventListener('keyup', function() {
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

  document.getElementById('theme-toggle').addEventListener('click', function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  document.getElementById('app').addEventListener('click', function(e) {
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

  els.title.focus();
}
