import { adminPost } from './api.js';
import { noteId } from './crypto.js';

const POLL_MS = 5000;
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const POS_INT_RE = /^[1-9][0-9]*$/;

let els = {};
let statsInFlight = false;
let auditInFlight = false;

export function adminActive() {
  const path = window.location.pathname;
  return path === '/admin' || path.indexOf('/admin/') === 0;
}

function showError(text) {
  els.error.textContent = text;
}

function clearError() {
  els.error.textContent = '';
}

function formatUptime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];
  if (days > 0) {
    parts.push(days + 'd');
  }
  if (hours > 0) {
    parts.push(hours + 'h');
  }
  parts.push(minutes + 'm');
  return parts.join(' ');
}

function validIp(text) {
  if (!IP_RE.test(text)) {
    return false;
  }
  const parts = text.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (Number(parts[i]) > 255) {
      return false;
    }
  }
  return true;
}

function renderAudit(entries) {
  els.audit.textContent = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const parts = [
      e.at === undefined || e.at === null ? '' : String(e.at),
      e.ip === undefined || e.ip === null ? '' : String(e.ip),
      e.action === undefined || e.action === null ? '' : String(e.action),
      e.status === undefined || e.status === null ? '' : String(e.status)
    ];
    if (e.detail !== undefined && e.detail !== null) {
      parts.push(String(e.detail));
    }
    const row = document.createElement('div');
    row.className = 'auditrow';
    row.textContent = parts.join('  ');
    els.audit.appendChild(row);
  }
}

async function refreshAudit() {
  if (auditInFlight) {
    return;
  }
  auditInFlight = true;
  const r = await adminPost('audit', { n: 50 });
  auditInFlight = false;
  if (!r.ok || !Array.isArray(r.data)) {
    return;
  }
  renderAudit(r.data);
}

async function refreshStats() {
  if (statsInFlight) {
    return;
  }
  statsInFlight = true;
  const r = await adminPost('stats');
  statsInFlight = false;
  if (!r.ok) {
    if (r.status === 403) {
      showError('admin api http 403 (this host is not on an allowed network)');
    } else {
      showError('http ' + r.status);
    }
    return;
  }
  const s = r.data;
  els.notes.textContent = String(s.notes);
  els.writes.textContent = String(s.writes60s);
  els.powk.textContent = String(s.powK);
  els.readonlySpan.textContent = s.readonly === true ? 'ON' : 'off';
  els.blocked.textContent = s.blockedIps && s.blockedIps.length > 0 ? s.blockedIps.join(', ') : 'none';
  els.toggle.checked = s.readonly === true;
  if (s.freeDiskKb === null || s.freeDiskKb === undefined) {
    els.disk.textContent = 'n/a';
  } else {
    els.disk.textContent = Math.round(s.freeDiskKb / 1024) + ' MiB';
  }
  els.uptime.textContent = formatUptime(s.uptimeS);
}

async function prefillLimits() {
  const r = await adminPost('limits');
  if (!r.ok || r.data === null) {
    return;
  }
  const cfg = r.data;
  els.limitIp.value = cfg.perIp && cfg.perIp.maxWrites !== undefined ? String(cfg.perIp.maxWrites) : '';
  els.limitNote.value = cfg.perNote && cfg.perNote.maxWrites !== undefined ? String(cfg.perNote.maxWrites) : '';
  els.limitCt.value = cfg.maxCtChars !== undefined ? String(cfg.maxCtChars) : '';
}

async function toggleReadonly() {
  const on = els.toggle.checked;
  const r = await adminPost('readonly', { on: on });
  if (!r.ok) {
    els.toggle.checked = !on;
    showError('http ' + r.status);
    return;
  }
  clearError();
  refreshStats();
}

async function blockOrUnblock(unblock) {
  const ip = els.blockIp.value.trim();
  if (!validIp(ip)) {
    showError('invalid ip');
    return;
  }
  const r = await adminPost(unblock ? 'unblock' : 'block', { ip: ip });
  if (!r.ok) {
    showError('http ' + r.status);
    return;
  }
  clearError();
  refreshStats();
}

function showPurgeId() {
  const title = els.purgeTitle.value;
  els.purgeId.textContent = title === '' ? '' : noteId(title);
}

async function purgeNote() {
  const title = els.purgeTitle.value;
  if (title === '') {
    showError('title required');
    return;
  }
  const r = await adminPost('purge', { title: title });
  if (!r.ok) {
    showError('http ' + r.status);
    return;
  }
  clearError();
  if (r.data && r.data.id !== undefined) {
    els.purgeId.textContent = String(r.data.id);
  }
  refreshStats();
}

async function applyLimits() {
  const raw = [els.limitIp.value, els.limitNote.value, els.limitCt.value];
  const values = [];
  for (let i = 0; i < raw.length; i++) {
    const text = raw[i].trim();
    values.push(text === '' ? null : text);
  }
  let any = false;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) {
      any = true;
      if (!POS_INT_RE.test(values[i])) {
        showError('limit values must be positive integers');
        return;
      }
    }
  }
  if (!any) {
    showError('http 400');
    return;
  }
  const patch = {};
  if (values[0] !== null) {
    patch.perIp = { maxWrites: Number(values[0]) };
  }
  if (values[1] !== null) {
    patch.perNote = { maxWrites: Number(values[1]) };
  }
  if (values[2] !== null) {
    patch.maxCtChars = Number(values[2]);
  }
  const r = await adminPost('set-limits', patch);
  if (!r.ok) {
    showError('http ' + r.status);
    return;
  }
  clearError();
  prefillLimits();
  refreshStats();
}

export function initAdmin() {
  if (!adminActive()) {
    return;
  }
  els.error = document.getElementById('admin-error');
  els.notes = document.getElementById('admin-notes');
  els.writes = document.getElementById('admin-writes');
  els.powk = document.getElementById('admin-powk');
  els.readonlySpan = document.getElementById('admin-readonly');
  els.blocked = document.getElementById('admin-blocked');
  els.disk = document.getElementById('admin-disk');
  els.uptime = document.getElementById('admin-uptime');
  els.audit = document.getElementById('admin-audit');
  els.toggle = document.getElementById('admin-readonly-toggle');
  els.blockIp = document.getElementById('admin-block-ip');
  els.purgeTitle = document.getElementById('admin-purge-title');
  els.purgeId = document.getElementById('admin-purge-id');
  els.limitIp = document.getElementById('admin-limit-ip');
  els.limitNote = document.getElementById('admin-limit-note');
  els.limitCt = document.getElementById('admin-limit-ct');

  els.toggle.addEventListener('change', function() {
    toggleReadonly();
  });
  document.getElementById('admin-block-btn').addEventListener('click', function() {
    blockOrUnblock(false);
  });
  document.getElementById('admin-unblock-btn').addEventListener('click', function() {
    blockOrUnblock(true);
  });
  els.purgeTitle.addEventListener('input', showPurgeId);
  document.getElementById('admin-purge-btn').addEventListener('click', function() {
    purgeNote();
  });
  document.getElementById('admin-limits-btn').addEventListener('click', function() {
    applyLimits();
  });
  document.getElementById('admin-audit-btn').addEventListener('click', function() {
    refreshAudit();
  });

  prefillLimits();
  refreshStats();
  setInterval(function() {
    if (document.visibilityState === 'visible') {
      refreshStats();
    }
  }, POLL_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      refreshStats();
    }
  });
}
