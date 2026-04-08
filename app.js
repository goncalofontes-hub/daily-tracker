(function () {
  'use strict';

  // ── Constants ──
  const STORAGE_ITEMS    = 'dt_items';
  const STORAGE_ENTRIES  = 'dt_entries';
  const STORAGE_THEME    = 'dt_theme';
  const STORAGE_REMINDER = 'dt_reminder';
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ── State ──
  let items = [];
  let entries = {};
  let currentDate = todayStr();
  let editingItemId = null;
  let bpActiveItemId = null;
  let bpActiveDate = null;
  let analyticsPeriodDays = 30;

  // ── Helpers ──
  function todayStr() { return formatDate(new Date()); }

  function formatDate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function parseDate(str) {
    var p = str.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function dayOfWeek(dateStr) { return parseDate(dateStr).getDay(); }

  function prettyDate(dateStr) {
    var d = parseDate(dateStr);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function addDays(dateStr, n) {
    var d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatNumber(n) {
    return n.toLocaleString();
  }

  // ── Storage ──
  function saveItems()   { localStorage.setItem(STORAGE_ITEMS,   JSON.stringify(items));   }
  function saveEntries() { localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries)); }

  function loadData() {
    try {
      var si = localStorage.getItem(STORAGE_ITEMS);
      items = si ? JSON.parse(si) : getDefaultItems();
      if (!si) saveItems();

      // Migrate: ensure all items have goal property; set 10000 for Steps
      var migrated = false;
      items.forEach(function (item) {
        if (item.goal === undefined) {
          item.goal = (item.name.toLowerCase().indexOf('step') !== -1 && item.type === 'text') ? 10000 : null;
          migrated = true;
        }
      });
      if (migrated) saveItems();

      var se = localStorage.getItem(STORAGE_ENTRIES);
      entries = se ? JSON.parse(se) : {};
    } catch (e) {
      items = getDefaultItems();
      entries = {};
      saveItems();
      saveEntries();
    }
  }

  function getDefaultItems() {
    return [
      { id: generateId(), name: 'Supplementation',  type: 'checkbox', schedule: 'daily',  weekDay: null, order: 0, goal: null },
      { id: generateId(), name: 'Fasting',           type: 'checkbox', schedule: 'daily',  weekDay: null, order: 1, goal: null },
      { id: generateId(), name: 'Treadmill walking', type: 'checkbox', schedule: 'daily',  weekDay: null, order: 2, goal: null },
      { id: generateId(), name: 'Night walk',        type: 'checkbox', schedule: 'daily',  weekDay: null, order: 3, goal: null },
      { id: generateId(), name: '3L of water',       type: 'checkbox', schedule: 'daily',  weekDay: null, order: 4, goal: null },
      { id: generateId(), name: 'Tension',           type: 'bp',       schedule: 'daily',  weekDay: null, order: 5, goal: null },
      { id: generateId(), name: 'Steps',             type: 'text',     schedule: 'daily',  weekDay: null, order: 6, goal: 10000 },
      { id: generateId(), name: 'Weight',            type: 'text',     schedule: 'weekly', weekDay: 6,    order: 7, goal: null },
    ];
  }

  // ── Item helpers ──
  function getItemsForDate(dateStr) {
    var dow = dayOfWeek(dateStr);
    return items.filter(function (item) {
      if (item.schedule === 'daily') return true;
      return item.schedule === 'weekly' && item.weekDay === dow;
    });
  }

  function getEntry(dateStr)  { return entries[dateStr] || {}; }

  function setEntryValue(dateStr, itemId, value) {
    if (!entries[dateStr]) entries[dateStr] = {};
    entries[dateStr][itemId] = value;
    saveEntries();
  }

  // ── BP helpers ──
  function getBpSessions(dateStr, itemId) {
    var val = getEntry(dateStr)[itemId];
    return Array.isArray(val) ? val : [];
  }

  function saveBpSessions(dateStr, itemId, sessions) {
    setEntryValue(dateStr, itemId, sessions);
  }

  // ── Theme ──
  function loadTheme() {
    var theme = localStorage.getItem(STORAGE_THEME) || 'dark';
    applyTheme(theme);
    document.getElementById('theme-toggle').checked = theme === 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-color-meta').setAttribute(
      'content', theme === 'light' ? '#f4f6fb' : '#1a1a2e'
    );
    localStorage.setItem(STORAGE_THEME, theme);
  }

  // ── Reminders ──
  function loadReminderSettings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_REMINDER)) || { enabled: false, time: '21:00' }; }
    catch (e) { return { enabled: false, time: '21:00' }; }
  }

  function saveReminderSettings(settings) {
    localStorage.setItem(STORAGE_REMINDER, JSON.stringify(settings));
  }

  function scheduleReminder(time) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'SCHEDULE_REMINDER', time: time });
    });
  }

  function cancelReminder() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'CANCEL_REMINDER' });
    });
  }

  function initReminderUI() {
    var settings = loadReminderSettings();
    var toggle   = document.getElementById('reminder-toggle');
    var timeWrap = document.getElementById('reminder-time-wrap');
    var timeInput = document.getElementById('reminder-time');
    var permBtn  = document.getElementById('btn-notif-permission');

    toggle.checked = settings.enabled;
    timeInput.value = settings.time || '21:00';
    timeWrap.classList.toggle('hidden', !settings.enabled);

    // Show permission button if needed
    if (settings.enabled && Notification.permission === 'default') {
      permBtn.classList.remove('hidden');
    }

    toggle.addEventListener('change', function () {
      settings.enabled = toggle.checked;
      saveReminderSettings(settings);
      timeWrap.classList.toggle('hidden', !settings.enabled);

      if (settings.enabled) {
        if (Notification.permission === 'granted') {
          scheduleReminder(settings.time);
          permBtn.classList.add('hidden');
        } else if (Notification.permission === 'default') {
          permBtn.classList.remove('hidden');
        } else {
          // denied
          toggle.checked = false;
          settings.enabled = false;
          saveReminderSettings(settings);
          alert('Notifications are blocked. Please enable them in your browser/phone settings.');
        }
      } else {
        cancelReminder();
        permBtn.classList.add('hidden');
      }
    });

    timeInput.addEventListener('change', function () {
      settings.time = timeInput.value;
      saveReminderSettings(settings);
      if (settings.enabled && Notification.permission === 'granted') {
        scheduleReminder(settings.time);
      }
    });

    permBtn.addEventListener('click', function () {
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted') {
          permBtn.classList.add('hidden');
          scheduleReminder(settings.time);
        } else {
          alert('Notifications permission denied. You can change this in your browser settings.');
        }
      });
    });

    // Auto-schedule on startup if already granted and enabled
    if (settings.enabled && Notification.permission === 'granted') {
      scheduleReminder(settings.time);
    }
  }

  // ── Streak ──
  function getCompletionForDate(dateStr) {
    var dayItems = getItemsForDate(dateStr);
    var checkboxItems = dayItems.filter(function (i) { return i.type === 'checkbox'; });
    if (!checkboxItems.length) return { done: 0, total: 0, complete: true };
    var entry = getEntry(dateStr);
    var done = checkboxItems.filter(function (i) { return entry[i.id] === true; }).length;
    return { done: done, total: checkboxItems.length, complete: done === checkboxItems.length };
  }

  function getCurrentStreak() {
    var streak = 0;
    var date = todayStr();
    var todayComp = getCompletionForDate(date);
    if (!todayComp.complete || !todayComp.total) date = addDays(date, -1);
    for (var i = 0; i < 9999; i++) {
      var comp = getCompletionForDate(date);
      if (!comp.total) { date = addDays(date, -1); continue; }
      if (comp.complete) { streak++; date = addDays(date, -1); }
      else break;
    }
    return streak;
  }

  // ── Render: Header ──
  function renderHeader() {
    var d = parseDate(currentDate);
    var isToday = currentDate === todayStr();
    var html = '<div class="date-main">' + WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + '</div>';
    html += '<div class="date-sub">' + d.getFullYear() + '</div>';
    if (isToday) html += '<div class="date-today">Today</div>';
    document.getElementById('header-date').innerHTML = html;
    document.getElementById('btn-next').style.opacity = isToday ? '0.3' : '1';
    document.getElementById('btn-next').disabled = isToday;
  }

  // ── Render: Checklist ──
  function renderChecklist() {
    var container = document.getElementById('checklist-items');
    var dayItems = getItemsForDate(currentDate);
    var entry = getEntry(currentDate);

    if (!dayItems.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No items for this day.<br>Add items in Settings.</div></div>';
      document.getElementById('day-streak').innerHTML = '';
      return;
    }

    var html = '';
    dayItems.forEach(function (item) {

      if (item.type === 'checkbox') {
        var checked = entry[item.id] === true;
        html += '<div class="checklist-item' + (checked ? ' completed' : '') + '" data-id="' + item.id + '" data-type="checkbox">';
        html += '<div class="check-box' + (checked ? ' checked' : '') + '">' + (checked ? '✓' : '') + '</div>';
        html += '<div class="item-name">' + escapeHtml(item.name) + '</div>';
        if (item.schedule === 'weekly') html += '<span class="item-schedule-badge">' + WEEKDAYS[item.weekDay].slice(0, 3) + '</span>';
        html += '</div>';

      } else if (item.type === 'bp') {
        var sessions = getBpSessions(currentDate, item.id);
        html += '<div class="checklist-item bp-item" data-id="' + item.id + '" data-type="bp">';
        html += '<div class="bp-wrapper">';
        html += '<div class="bp-header"><span class="item-name">' + escapeHtml(item.name) + '</span></div>';
        sessions.forEach(function (session, idx) {
          html += '<div class="bp-session-card">';
          html += '<div class="bp-session-header"><span class="bp-session-time">' + escapeHtml(session.time) + '</span>';
          html += '<button class="bp-delete-btn" data-idx="' + idx + '">×</button></div>';
          session.readings.forEach(function (r, ri) {
            html += '<div class="bp-session-row">';
            html += '<span class="bp-session-num">' + (ri + 1) + '</span>';
            html += '<span class="bp-sys">' + r.sys + '</span><span class="bp-sep">/</span>';
            html += '<span class="bp-dia">' + r.dia + '</span><span class="bp-sep">·</span>';
            html += '<span class="bp-bpm">' + r.bpm + '</span><span class="bp-unit">bpm</span>';
            html += '</div>';
          });
          html += '</div>';
        });
        if (sessions.length < 2) {
          html += '<button class="bp-add-session-btn" data-id="' + item.id + '">+ Add Session <span class="bp-count">(' + sessions.length + '/2)</span></button>';
        }
        html += '</div></div>';

      } else {
        // text item — with optional goal progress bar
        var val = entry[item.id] || '';
        var numVal = parseFloat(val);
        var hasGoal = item.goal && !isNaN(numVal) && numVal > 0;
        var pct = hasGoal ? Math.min(Math.round((numVal / item.goal) * 100), 100) : 0;

        html += '<div class="checklist-item" data-id="' + item.id + '" data-type="text">';
        html += '<div class="text-input-wrapper">';
        html += '<div class="item-name">' + escapeHtml(item.name);
        if (item.schedule === 'weekly') html += ' <span class="item-schedule-badge">' + WEEKDAYS[item.weekDay].slice(0, 3) + '</span>';
        if (item.goal) html += ' <span class="item-goal-badge">goal: ' + formatNumber(item.goal) + '</span>';
        html += '</div>';
        html += '<input type="text" inputmode="numeric" class="item-text-input' + (val ? ' has-value' : '') + '" value="' + escapeHtml(val) + '" placeholder="Enter ' + escapeHtml(item.name.toLowerCase()) + '...">';
        if (item.goal) {
          html += '<div class="goal-bar-wrap">';
          html += '<div class="goal-bar" style="width:' + pct + '%"></div>';
          html += '</div>';
          html += '<div class="goal-label">' + (val ? formatNumber(numVal) + ' / ' + formatNumber(item.goal) + ' (' + pct + '%)' : '0 / ' + formatNumber(item.goal)) + '</div>';
        }
        html += '</div></div>';
      }
    });
    container.innerHTML = html;

    // Checkbox clicks
    container.querySelectorAll('[data-type="checkbox"]').forEach(function (el) {
      el.addEventListener('click', function () {
        setEntryValue(currentDate, el.getAttribute('data-id'), !getEntry(currentDate)[el.getAttribute('data-id')]);
        renderChecklist();
      });
    });

    // Text inputs
    container.querySelectorAll('.item-text-input').forEach(function (input) {
      var id = input.closest('.checklist-item').getAttribute('data-id');
      input.addEventListener('input', function () {
        setEntryValue(currentDate, id, input.value);
        input.classList.toggle('has-value', input.value.length > 0);
        // Live-update goal bar without full re-render
        var item = items.find(function (i) { return i.id === id; });
        if (item && item.goal) {
          var wrap = input.closest('.checklist-item');
          var bar = wrap.querySelector('.goal-bar');
          var label = wrap.querySelector('.goal-label');
          var n = parseFloat(input.value);
          var p = (!isNaN(n) && n > 0) ? Math.min(Math.round((n / item.goal) * 100), 100) : 0;
          if (bar) bar.style.width = p + '%';
          if (label) label.textContent = (!isNaN(n) && n > 0) ? formatNumber(n) + ' / ' + formatNumber(item.goal) + ' (' + p + '%)' : '0 / ' + formatNumber(item.goal);
        }
      });
    });

    // BP delete
    container.querySelectorAll('[data-type="bp"]').forEach(function (el) {
      var id = el.getAttribute('data-id');
      el.querySelectorAll('.bp-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var sessions = getBpSessions(currentDate, id);
          sessions.splice(parseInt(btn.getAttribute('data-idx')), 1);
          saveBpSessions(currentDate, id, sessions);
          renderChecklist();
        });
      });
    });

    // BP add session
    container.querySelectorAll('.bp-add-session-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openBpModal(btn.getAttribute('data-id'), currentDate);
      });
    });

    // Streak
    var streak = getCurrentStreak();
    document.getElementById('day-streak').innerHTML = streak > 0
      ? '<span class="streak-count">' + streak + '</span> day streak 🔥'
      : 'Complete all items to start a streak!';
  }

  // ── Render: History ──
  function renderHistory() {
    var container = document.getElementById('history-list');
    var fromVal = document.getElementById('filter-from').value;
    var toVal   = document.getElementById('filter-to').value;

    var filtered = Object.keys(entries).sort().reverse().filter(function (d) {
      if (fromVal && d < fromVal) return false;
      if (toVal   && d > toVal)   return false;
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">No entries in this range.</div></div>';
      return;
    }

    var html = '';
    filtered.forEach(function (dateStr) {
      var dayItems = getItemsForDate(dateStr);
      var entry = entries[dateStr];
      var comp = getCompletionForDate(dateStr);

      var fillable = dayItems.filter(function (i) { return i.type !== 'checkbox'; });
      var fillableDone = fillable.filter(function (i) {
        var v = entry[i.id];
        if (i.type === 'bp') return Array.isArray(v) && v.length > 0;
        return v !== undefined && v !== null && v !== '';
      }).length;
      var total = comp.total + fillable.length;
      var done = comp.done + fillableDone;
      var pct = total > 0 ? Math.round((done / total) * 100) : 0;

      html += '<div class="history-day">';
      html += '<div class="history-day-header" data-date="' + dateStr + '">';
      html += '<span class="history-day-date">' + prettyDate(dateStr) + '</span>';
      html += '<span class="history-day-score">' + pct + '%</span>';
      html += '</div>';
      html += '<div class="history-day-details" id="hist-' + dateStr + '">';

      dayItems.forEach(function (item) {
        var val = entry[item.id];
        html += '<div class="history-detail-item"><span>' + escapeHtml(item.name) + '</span>';
        if (item.type === 'checkbox') {
          html += '<span class="history-detail-value ' + (val ? 'done' : 'missed') + '">' + (val ? '✓' : '✗') + '</span>';
        } else if (item.type === 'bp') {
          var sessions = Array.isArray(val) ? val : [];
          if (!sessions.length) {
            html += '<span class="history-detail-value missed">—</span>';
          } else {
            html += '<span class="history-bp-sessions">';
            sessions.forEach(function (s) {
              var n = s.readings.length;
              var avg = s.readings.reduce(function (a, r) { return { sys: a.sys + r.sys, dia: a.dia + r.dia, bpm: a.bpm + r.bpm }; }, { sys: 0, dia: 0, bpm: 0 });
              html += '<span class="history-bp-entry"><span class="history-bp-time">' + s.time + '</span> ';
              html += Math.round(avg.sys / n) + '/' + Math.round(avg.dia / n) + ' <small>' + Math.round(avg.bpm / n) + 'bpm</small></span>';
            });
            html += '</span>';
          }
        } else {
          var dv = (val !== undefined && val !== null && val !== '') ? escapeHtml(val) : '—';
          html += '<span class="history-detail-value ' + (dv !== '—' ? 'done' : 'missed') + '">' + dv + '</span>';
        }
        html += '</div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;
    container.querySelectorAll('.history-day-header').forEach(function (h) {
      h.addEventListener('click', function () {
        document.getElementById('hist-' + h.getAttribute('data-date')).classList.toggle('open');
      });
    });
  }

  // ── Steps SVG chart ──
  function buildStepsChart(stepValues, goal) {
    var W = 340, H = 140;
    var padL = 44, padR = 12, padT = 12, padB = 28;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    var n = stepValues.length;
    // Only show up to 30 points to keep it readable; take last N
    var maxPoints = 30;
    var pts = n > maxPoints ? stepValues.slice(n - maxPoints) : stepValues;
    var count = pts.length;
    if (count < 2) return '';

    var maxVal = Math.max(goal, Math.max.apply(null, pts.map(function (p) { return p.value; })));
    // Round max up to nearest 2000
    maxVal = Math.ceil(maxVal / 2000) * 2000;

    function xOf(i) { return padL + (i / (count - 1)) * innerW; }
    function yOf(v) { return padT + innerH - (v / maxVal) * innerH; }

    // Goal line Y
    var goalY = yOf(goal);

    // Build polyline points for actual values (skip zeros as gaps)
    // Split into segments at zero values
    var segments = [];
    var current = [];
    pts.forEach(function (p, i) {
      if (p.value > 0) {
        current.push([xOf(i), yOf(p.value)]);
      } else {
        if (current.length > 1) segments.push(current);
        else if (current.length === 1) segments.push(current); // single point still draw dot
        current = [];
      }
    });
    if (current.length) segments.push(current);

    // Resolve CSS variables to actual colours for SVG compatibility
    var cs = getComputedStyle(document.documentElement);
    var cMuted  = cs.getPropertyValue('--text-muted').trim()  || '#555';
    var cDim    = cs.getPropertyValue('--text-dim').trim()    || '#888';
    var cPrimary= cs.getPropertyValue('--primary').trim()     || '#6c63ff';
    var cSuccess= cs.getPropertyValue('--success').trim()     || '#4ecdc4';
    var cWarn   = cs.getPropertyValue('--warning').trim()     || '#ffe66d';
    var cSurface= cs.getPropertyValue('--surface').trim()     || '#1a1a2e';

    var svg = '<svg class="steps-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

    // Grid lines
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = padT + innerH - f * innerH;
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="' + cMuted + '" stroke-width="0.5" stroke-dasharray="3,3"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="9" fill="' + cDim + '">' + (maxVal * f >= 1000 ? Math.round(maxVal * f / 1000) + 'k' : formatNumber(Math.round(maxVal * f))) + '</text>';
    });

    // X-axis bottom line
    svg += '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="' + cMuted + '" stroke-width="0.5"/>';

    // X labels
    [0, Math.floor((count - 1) / 2), count - 1].forEach(function (i) {
      var parsed = parseDate(pts[i].date);
      svg += '<text x="' + xOf(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="' + cDim + '">' + parsed.getDate() + ' ' + MONTHS[parsed.getMonth()] + '</text>';
    });

    // Goal line
    if (goal > 0) {
      svg += '<line x1="' + padL + '" y1="' + goalY + '" x2="' + (W - padR) + '" y2="' + goalY + '" stroke="' + cWarn + '" stroke-width="1" stroke-dasharray="5,3" opacity="0.7"/>';
      svg += '<text x="' + (W - padR - 2) + '" y="' + (goalY - 3) + '" text-anchor="end" font-size="8" fill="' + cWarn + '" opacity="0.9">goal</text>';
    }

    // Fill area under line
    segments.forEach(function (seg) {
      if (seg.length < 2) return;
      var bottom = padT + innerH;
      var fillPts = seg.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      var first = seg[0], last = seg[seg.length - 1];
      svg += '<polygon points="' + first[0] + ',' + bottom + ' ' + fillPts + ' ' + last[0] + ',' + bottom + '" fill="' + cPrimary + '" opacity="0.12"/>';
    });

    // Line segments
    segments.forEach(function (seg) {
      if (seg.length < 2) return;
      svg += '<polyline points="' + seg.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + cPrimary + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    });

    // Dots
    pts.forEach(function (p, i) {
      if (!p.value) return;
      var cx = xOf(i), cy = yOf(p.value);
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + (p.value >= goal ? cSuccess : cPrimary) + '" stroke="' + cSurface + '" stroke-width="1.5"/>';
    });

    svg += '</svg>';
    return svg;
  }

  // ── Weight SVG chart ──
  function buildWeightChart(weights) {
    var W = 340, H = 130;
    var padL = 44, padR = 12, padT = 12, padB = 28;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    var pts = weights;
    var count = pts.length;
    if (count < 2) return '';

    var values = pts.map(function (p) { return p.value; });
    var minVal = Math.min.apply(null, values);
    var maxVal = Math.max.apply(null, values);
    // Add a little padding so the line isn't flush against edges
    var range = maxVal - minVal || 1;
    var yMin = Math.floor((minVal - range * 0.2) * 2) / 2;
    var yMax = Math.ceil((maxVal  + range * 0.2) * 2) / 2;
    var yRange = yMax - yMin;

    function xOf(i) { return padL + (i / (count - 1)) * innerW; }
    function yOf(v) { return padT + innerH - ((v - yMin) / yRange) * innerH; }

    var cs = getComputedStyle(document.documentElement);
    var cMuted  = cs.getPropertyValue('--text-muted').trim()  || '#555';
    var cDim    = cs.getPropertyValue('--text-dim').trim()    || '#888';
    var cWarn   = cs.getPropertyValue('--warning').trim()     || '#ffe66d';
    var cSuccess= cs.getPropertyValue('--success').trim()     || '#4ecdc4';
    var cAccent = cs.getPropertyValue('--accent').trim()      || '#ff6b6b';
    var cSurface= cs.getPropertyValue('--surface').trim()     || '#1a1a2e';

    var svg = '<svg class="steps-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

    // Grid lines at min, mid, max
    [yMin, (yMin + yMax) / 2, yMax].forEach(function (v) {
      var y = yOf(v);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="' + cMuted + '" stroke-width="0.5" stroke-dasharray="3,3"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="9" fill="' + cMuted + '">' + Math.round(v * 10) / 10 + '</text>';
    });

    // X-axis line
    svg += '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="' + cMuted + '" stroke-width="0.5"/>';

    // X labels — first, middle, last
    [0, Math.floor((count - 1) / 2), count - 1].forEach(function (i) {
      var p = parseDate(pts[i].date);
      svg += '<text x="' + xOf(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="' + cDim + '">' + p.getDate() + ' ' + MONTHS[p.getMonth()] + '</text>';
    });

    // Fill under line
    var linePts = pts.map(function (p, i) { return xOf(i) + ',' + yOf(p.value); }).join(' ');
    var bottom = padT + innerH;
    svg += '<polygon points="' + xOf(0) + ',' + bottom + ' ' + linePts + ' ' + xOf(count - 1) + ',' + bottom + '" fill="' + cWarn + '" opacity="0.1"/>';

    // Line
    svg += '<polyline points="' + linePts + '" fill="none" stroke="' + cWarn + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    // Dots — colour by direction vs previous
    pts.forEach(function (p, i) {
      var cx = xOf(i), cy = yOf(p.value);
      var color = i === 0 ? cDim
                : p.value < pts[i - 1].value ? cSuccess
                : p.value > pts[i - 1].value ? cAccent
                : cDim;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="3.5" fill="' + color + '" stroke="' + cSurface + '" stroke-width="1.5"/>';
    });

    svg += '</svg>';
    return svg;
  }

  // ── Render: Analytics ──
  function renderAnalytics() {
    var container = document.getElementById('analytics-content');
    var today = todayStr();
    var fromDate = analyticsPeriodDays > 0 ? addDays(today, -analyticsPeriodDays + 1) : null;
    var rangeDates = Object.keys(entries).sort().filter(function (d) { return !fromDate || d >= fromDate; });

    if (!rangeDates.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data yet for this period.</div></div>';
      return;
    }

    var html = '';

    // ── Habits ──
    var checkboxItems = items.filter(function (i) { return i.type === 'checkbox'; });
    if (checkboxItems.length) {
      html += '<div class="analytics-section"><div class="analytics-title">Habits</div>';
      checkboxItems.forEach(function (item) {
        var applicable = rangeDates.filter(function (d) {
          return getItemsForDate(d).some(function (i) { return i.id === item.id; });
        });
        if (!applicable.length) return;
        var done = applicable.filter(function (d) { return getEntry(d)[item.id] === true; }).length;
        var pct = Math.round((done / applicable.length) * 100);
        html += '<div class="analytics-row">';
        html += '<span class="analytics-label">' + escapeHtml(item.name) + '</span>';
        html += '<div class="analytics-bar-wrap"><div class="analytics-bar" style="width:' + pct + '%"></div></div>';
        html += '<span class="analytics-pct">' + pct + '%</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // ── Steps ──
    var stepsItem = items.find(function (i) { return i.type === 'text' && i.name.toLowerCase().indexOf('step') !== -1; })
                  || items.find(function (i) { return i.type === 'text' && i.goal > 0; });
    if (stepsItem) {
      var stepValues = [];
      rangeDates.forEach(function (d) {
        var n = parseFloat(getEntry(d)[stepsItem.id]);
        stepValues.push({ date: d, value: (!isNaN(n) && n > 0) ? n : 0 });
      });
      var nonZero = stepValues.filter(function (v) { return v.value > 0; });
      if (nonZero.length) {
        var total = nonZero.reduce(function (a, v) { return a + v.value; }, 0);
        var avg = Math.round(total / nonZero.length);
        var best = nonZero.reduce(function (a, v) { return v.value > a.value ? v : a; });
        var stepGoal = stepsItem.goal || 0;
        var goalPct = stepGoal > 0 ? Math.min(Math.round((avg / stepGoal) * 100), 100) : 0;
        var titleSuffix = stepGoal > 0 ? ' — goal ' + formatNumber(stepGoal) : '';

        html += '<div class="analytics-section"><div class="analytics-title">' + escapeHtml(stepsItem.name) + titleSuffix + '</div>';

        // Stats row
        html += '<div class="analytics-stats">';
        html += '<div class="stat-card"><div class="stat-value">' + formatNumber(avg) + '</div><div class="stat-label">Avg / day</div></div>';
        html += '<div class="stat-card"><div class="stat-value">' + formatNumber(Math.round(total)) + '</div><div class="stat-label">Total</div></div>';
        html += '<div class="stat-card"><div class="stat-value">' + formatNumber(best.value) + '</div><div class="stat-label">Best day</div></div>';
        html += '</div>';

        // SVG line chart
        html += buildStepsChart(stepValues, stepGoal);

        html += '</div>';
      }
    }

    // ── Tension ──
    var bpItem = items.find(function (i) { return i.type === 'bp'; });
    if (bpItem) {
      var morningR = [], eveningR = [];
      rangeDates.forEach(function (d) {
        getBpSessions(d, bpItem.id).forEach(function (s) {
          var hour = parseInt((s.time || '00:00').split(':')[0]);
          s.readings.forEach(function (r) {
            (hour < 14 ? morningR : eveningR).push(r);
          });
        });
      });

      function avgR(arr) {
        if (!arr.length) return null;
        var sum = arr.reduce(function (a, r) { return { sys: a.sys + r.sys, dia: a.dia + r.dia, bpm: a.bpm + r.bpm }; }, { sys: 0, dia: 0, bpm: 0 });
        return { sys: Math.round(sum.sys / arr.length), dia: Math.round(sum.dia / arr.length), bpm: Math.round(sum.bpm / arr.length) };
      }

      var mA = avgR(morningR), eA = avgR(eveningR);
      if (mA || eA) {
        html += '<div class="analytics-section"><div class="analytics-title">Tension (avg)</div>';
        html += '<div class="analytics-bp-grid">';
        [{ label: 'Morning', avg: mA, count: morningR.length }, { label: 'Evening', avg: eA, count: eveningR.length }].forEach(function (slot) {
          if (!slot.avg) return;
          html += '<div class="analytics-bp-card">';
          html += '<div class="analytics-bp-slot">' + slot.label + '</div>';
          html += '<div class="analytics-bp-values"><span class="bp-sys">' + slot.avg.sys + '</span><span class="bp-sep">/</span><span class="bp-dia">' + slot.avg.dia + '</span></div>';
          html += '<div class="analytics-bp-bpm"><span class="bp-bpm">' + slot.avg.bpm + '</span> <span class="bp-unit">bpm</span></div>';
          html += '<div class="analytics-bp-count">' + slot.count + ' readings</div>';
          html += '</div>';
        });
        html += '</div></div>';
      }
    }

    // ── Weight ──
    var weightItem = items.find(function (i) { return i.type === 'text' && i.name.toLowerCase().indexOf('weight') !== -1; });
    if (weightItem) {
      var weights = [];
      rangeDates.forEach(function (d) {
        var v = getEntry(d)[weightItem.id];
        var n = parseFloat(v);
        if (!isNaN(n) && n > 0) weights.push({ date: d, value: n });
      });
      if (weights.length) {
        var wFirst = weights[0].value;
        var wLast  = weights[weights.length - 1].value;
        var wDiff  = Math.round((wLast - wFirst) * 10) / 10;
        var wDiffStr = (wDiff > 0 ? '+' : '') + wDiff + ' kg';
        var wDiffColor = wDiff < 0 ? 'var(--success)' : wDiff > 0 ? 'var(--accent)' : 'var(--text-dim)';

        html += '<div class="analytics-section">';
        html += '<div class="analytics-title-row">';
        html += '<span class="analytics-title">Weight</span>';
        if (weights.length > 1) {
          html += '<span class="analytics-weight-delta" style="color:' + wDiffColor + '">' + wDiffStr + '</span>';
        }
        html += '</div>';

        // Chart (only if 2+ points)
        if (weights.length >= 2) {
          html += buildWeightChart(weights);
        }

        // Recent list
        html += '<div class="analytics-weight-list" style="margin-top:10px">';
        weights.slice(-6).reverse().forEach(function (w) {
          html += '<div class="analytics-weight-row">';
          html += '<span class="analytics-weight-date">' + prettyDate(w.date) + '</span>';
          html += '<span class="analytics-weight-val">' + w.value + ' kg</span>';
          html += '</div>';
        });
        html += '</div></div>';
      }
    }

    container.innerHTML = html;
  }

  // ── Render: Settings ──
  function renderSettings() {
    var container = document.getElementById('settings-items');
    items.sort(function (a, b) { return a.order - b.order; });
    var html = '';
    items.forEach(function (item, idx) {
      var typeLabel = item.type === 'checkbox' ? 'Checkbox' : item.type === 'bp' ? 'Blood Pressure' : 'Text';
      var schedLabel = item.schedule === 'daily' ? 'Daily' : WEEKDAYS[item.weekDay] + 's only';
      var goalLabel = (item.goal && item.type === 'text') ? ' · Goal: ' + formatNumber(item.goal) : '';
      html += '<div class="settings-item">';
      html += '<div class="settings-item-info">';
      html += '<div class="settings-item-name">' + escapeHtml(item.name) + '</div>';
      html += '<div class="settings-item-meta">' + typeLabel + ' · ' + schedLabel + goalLabel + '</div>';
      html += '</div><div class="settings-item-actions">';
      if (idx > 0) html += '<button class="btn-icon btn-move-up" data-id="' + item.id + '">↑</button>';
      if (idx < items.length - 1) html += '<button class="btn-icon btn-move-down" data-id="' + item.id + '">↓</button>';
      html += '<button class="btn-icon btn-edit" data-id="' + item.id + '">✎</button>';
      html += '</div></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.btn-move-up').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); moveItem(btn.getAttribute('data-id'), -1); });
    });
    container.querySelectorAll('.btn-move-down').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); moveItem(btn.getAttribute('data-id'), 1); });
    });
    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openEditModal(btn.getAttribute('data-id')); });
    });
  }

  function moveItem(itemId, dir) {
    var idx = items.findIndex(function (i) { return i.id === itemId; });
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    var tmp = items[idx]; items[idx] = items[newIdx]; items[newIdx] = tmp;
    items.forEach(function (item, i) { item.order = i; });
    saveItems();
    renderSettings();
  }

  // ── Edit Modal ──
  function openEditModal(itemId) {
    editingItemId = itemId;
    var item = items.find(function (i) { return i.id === itemId; });
    if (!item) return;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-type').value = item.type;
    document.getElementById('edit-item-schedule').value = item.schedule;
    var goalInput = document.getElementById('edit-item-goal');
    goalInput.classList.toggle('hidden', item.type !== 'text');
    goalInput.value = item.goal || '';
    var weekdaySelect = document.getElementById('edit-item-weekday');
    weekdaySelect.classList.toggle('hidden', item.schedule !== 'weekly');
    if (item.schedule === 'weekly') weekdaySelect.value = item.weekDay !== null ? item.weekDay : 6;
    document.getElementById('modal-edit').classList.remove('hidden');
  }

  function closeEditModal() {
    editingItemId = null;
    document.getElementById('modal-edit').classList.add('hidden');
  }

  // ── BP Modal ──
  function openBpModal(itemId, dateStr) {
    bpActiveItemId = itemId;
    bpActiveDate = dateStr;
    var now = new Date();
    document.getElementById('bp-session-time').value =
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    ['bp-r1-sys','bp-r1-dia','bp-r1-bpm','bp-r2-sys','bp-r2-dia','bp-r2-bpm','bp-r3-sys','bp-r3-dia','bp-r3-bpm'].forEach(function (c) {
      document.querySelector('.' + c).value = '';
    });
    document.getElementById('modal-bp').classList.remove('hidden');
    setTimeout(function () { document.querySelector('.bp-r1-sys').focus(); }, 100);
  }

  function closeBpModal() {
    bpActiveItemId = null; bpActiveDate = null;
    document.getElementById('modal-bp').classList.add('hidden');
  }

  // ── Tab switching ──
  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + tabName);
    });
    if (tabName === 'checklist')  renderChecklist();
    if (tabName === 'history')    renderHistory();
    if (tabName === 'analytics')  renderAnalytics();
    if (tabName === 'settings')   { renderSettings(); initReminderUI(); }
  }

  // ── Export / Import ──
  function exportData() {
    var blob = new Blob([JSON.stringify({ items: items, entries: entries, exportDate: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'daily-tracker-backup-' + todayStr() + '.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.items && data.entries) {
          items = data.items; entries = data.entries;
          saveItems(); saveEntries(); renderAll();
          alert('Data imported successfully!');
        } else { alert('Invalid backup file.'); }
      } catch (err) { alert('Error: ' + err.message); }
    };
    reader.readAsText(file);
  }

  function renderAll() { renderHeader(); renderChecklist(); }

  // ── Init ──
  function init() {
    loadData();
    loadTheme();

    document.getElementById('filter-to').value   = todayStr();
    document.getElementById('filter-from').value = addDays(todayStr(), -29);

    renderAll();

    // Tabs
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });

    // Date nav — buttons
    document.getElementById('btn-prev').addEventListener('click', function () {
      currentDate = addDays(currentDate, -1); renderAll();
    });
    document.getElementById('btn-next').addEventListener('click', function () {
      if (currentDate < todayStr()) { currentDate = addDays(currentDate, 1); renderAll(); }
    });

    // Date nav — swipe on the checklist view
    var swipeStartX = null;
    var swipeStartY = null;
    var viewChecklist = document.getElementById('view-checklist');

    viewChecklist.addEventListener('touchstart', function (e) {
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    viewChecklist.addEventListener('touchend', function (e) {
      if (swipeStartX === null) return;
      var dx = e.changedTouches[0].clientX - swipeStartX;
      var dy = e.changedTouches[0].clientY - swipeStartY;
      // Only trigger if mostly horizontal (dx > dy) and long enough
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) {
          // Swipe left → next day
          if (currentDate < todayStr()) { currentDate = addDays(currentDate, 1); renderAll(); }
        } else {
          // Swipe right → previous day
          currentDate = addDays(currentDate, -1); renderAll();
        }
      }
      swipeStartX = null;
      swipeStartY = null;
    }, { passive: true });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('change', function () {
      applyTheme(this.checked ? 'light' : 'dark');
    });

    // History filter
    document.getElementById('filter-from').addEventListener('change', renderHistory);
    document.getElementById('filter-to').addEventListener('change', renderHistory);

    // Analytics period
    document.querySelectorAll('.period-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.period-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        analyticsPeriodDays = parseInt(btn.getAttribute('data-days'));
        renderAnalytics();
      });
    });

    // Add item form
    var addForm = document.getElementById('add-item-form');
    document.getElementById('btn-add-item').addEventListener('click', function () {
      addForm.classList.toggle('hidden');
      if (!addForm.classList.contains('hidden')) document.getElementById('new-item-name').focus();
    });
    document.getElementById('new-item-type').addEventListener('change', function () {
      document.getElementById('new-item-goal').classList.toggle('hidden', this.value !== 'text');
    });
    document.getElementById('new-item-schedule').addEventListener('change', function () {
      document.getElementById('new-item-weekday').classList.toggle('hidden', this.value !== 'weekly');
    });
    document.getElementById('btn-cancel-item').addEventListener('click', function () {
      addForm.classList.add('hidden');
      document.getElementById('new-item-name').value = '';
    });
    document.getElementById('btn-save-item').addEventListener('click', function () {
      var name = document.getElementById('new-item-name').value.trim();
      if (!name) return;
      var type = document.getElementById('new-item-type').value;
      var schedule = document.getElementById('new-item-schedule').value;
      var weekDay = schedule === 'weekly' ? parseInt(document.getElementById('new-item-weekday').value) : null;
      var goalVal = parseInt(document.getElementById('new-item-goal').value);
      var goal = (type === 'text' && !isNaN(goalVal) && goalVal > 0) ? goalVal : null;
      items.push({ id: generateId(), name: name, type: type, schedule: schedule, weekDay: weekDay, order: items.length, goal: goal });
      saveItems();
      document.getElementById('new-item-name').value = '';
      document.getElementById('new-item-goal').value = '';
      addForm.classList.add('hidden');
      renderSettings();
      renderChecklist();
    });

    // BP modal
    document.getElementById('btn-bp-cancel').addEventListener('click', closeBpModal);
    document.getElementById('modal-bp').addEventListener('click', function (e) { if (e.target === this) closeBpModal(); });
    document.getElementById('btn-bp-save').addEventListener('click', function () {
      if (!bpActiveItemId) return;
      var time = document.getElementById('bp-session-time').value;
      if (!time) { document.getElementById('bp-session-time').focus(); return; }
      var rows = [
        ['bp-r1-sys','bp-r1-dia','bp-r1-bpm'],
        ['bp-r2-sys','bp-r2-dia','bp-r2-bpm'],
        ['bp-r3-sys','bp-r3-dia','bp-r3-bpm'],
      ];
      var readings = [];
      for (var i = 0; i < rows.length; i++) {
        var sys = parseInt(document.querySelector('.' + rows[i][0]).value);
        var dia = parseInt(document.querySelector('.' + rows[i][1]).value);
        var bpm = parseInt(document.querySelector('.' + rows[i][2]).value);
        if (!sys || !dia || !bpm) { document.querySelector('.' + rows[i][0]).focus(); return; }
        readings.push({ sys: sys, dia: dia, bpm: bpm });
      }
      var sessions = getBpSessions(bpActiveDate, bpActiveItemId);
      sessions.push({ time: time, readings: readings });
      saveBpSessions(bpActiveDate, bpActiveItemId, sessions);
      closeBpModal();
      renderChecklist();
    });

    // Edit modal
    document.getElementById('edit-item-type').addEventListener('change', function () {
      document.getElementById('edit-item-goal').classList.toggle('hidden', this.value !== 'text');
    });
    document.getElementById('edit-item-schedule').addEventListener('change', function () {
      document.getElementById('edit-item-weekday').classList.toggle('hidden', this.value !== 'weekly');
    });
    document.getElementById('btn-edit-save').addEventListener('click', function () {
      if (!editingItemId) return;
      var item = items.find(function (i) { return i.id === editingItemId; });
      if (!item) return;
      var name = document.getElementById('edit-item-name').value.trim();
      if (!name) return;
      item.name = name;
      item.type = document.getElementById('edit-item-type').value;
      item.schedule = document.getElementById('edit-item-schedule').value;
      item.weekDay = item.schedule === 'weekly' ? parseInt(document.getElementById('edit-item-weekday').value) : null;
      var gv = parseInt(document.getElementById('edit-item-goal').value);
      item.goal = (item.type === 'text' && !isNaN(gv) && gv > 0) ? gv : null;
      saveItems();
      closeEditModal();
      renderSettings();
      renderChecklist();
    });
    document.getElementById('btn-edit-delete').addEventListener('click', function () {
      if (!editingItemId) return;
      if (confirm('Delete this item? Historical data for it will be kept.')) {
        items = items.filter(function (i) { return i.id !== editingItemId; });
        items.forEach(function (item, i) { item.order = i; });
        saveItems();
        closeEditModal();
        renderSettings();
        renderChecklist();
      }
    });
    document.getElementById('btn-edit-cancel').addEventListener('click', closeEditModal);
    document.getElementById('modal-edit').addEventListener('click', function (e) { if (e.target === this) closeEditModal(); });

    // Update button
    document.getElementById('btn-update').addEventListener('click', function () {
      var statusEl = document.getElementById('update-status');
      statusEl.textContent = 'Checking...';
      statusEl.className = 'update-status';

      if (!('serviceWorker' in navigator)) {
        statusEl.textContent = 'Service worker not supported.';
        return;
      }

      // Unregister SW + clear caches → forces fresh download on reload
      Promise.all([
        navigator.serviceWorker.getRegistration().then(function (reg) {
          return reg ? reg.unregister() : true;
        }),
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        })
      ]).then(function () {
        statusEl.textContent = 'Updated! Reloading...';
        setTimeout(function () { location.reload(); }, 800);
      }).catch(function () {
        statusEl.textContent = 'Error updating. Try again.';
      });
    });

    // Export / Import
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', function () { document.getElementById('import-file').click(); });
    document.getElementById('import-file').addEventListener('change', function (e) { if (e.target.files[0]) importData(e.target.files[0]); });

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
