(function () {
  'use strict';

  // ── Constants ──
  const STORAGE_ITEMS = 'dt_items';
  const STORAGE_ENTRIES = 'dt_entries';
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ── State ──
  let items = [];
  let entries = {};
  let currentDate = todayStr();
  let editingItemId = null;
  let bpActiveItemId = null;
  let bpActiveDate = null;
  let analyticsPeriodDays = 30;

  // ── Helpers ──
  function todayStr() {
    return formatDate(new Date());
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseDate(str) {
    const parts = str.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function dayOfWeek(dateStr) {
    return parseDate(dateStr).getDay();
  }

  function prettyDate(dateStr) {
    const d = parseDate(dateStr);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
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

  // ── Storage ──
  function saveItems() {
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries));
  }

  function loadData() {
    try {
      const savedItems = localStorage.getItem(STORAGE_ITEMS);
      items = savedItems ? JSON.parse(savedItems) : getDefaultItems();
      if (!savedItems) saveItems();

      const savedEntries = localStorage.getItem(STORAGE_ENTRIES);
      entries = savedEntries ? JSON.parse(savedEntries) : {};
    } catch (e) {
      items = getDefaultItems();
      entries = {};
      saveItems();
      saveEntries();
    }
  }

  function getDefaultItems() {
    return [
      { id: generateId(), name: 'Supplementation', type: 'checkbox', schedule: 'daily',  weekDay: null, order: 0 },
      { id: generateId(), name: 'Fasting',          type: 'checkbox', schedule: 'daily',  weekDay: null, order: 1 },
      { id: generateId(), name: 'Treadmill walking',type: 'checkbox', schedule: 'daily',  weekDay: null, order: 2 },
      { id: generateId(), name: 'Night walk',        type: 'checkbox', schedule: 'daily',  weekDay: null, order: 3 },
      { id: generateId(), name: '3L of water',       type: 'checkbox', schedule: 'daily',  weekDay: null, order: 4 },
      { id: generateId(), name: 'Tension',           type: 'bp',       schedule: 'daily',  weekDay: null, order: 5 },
      { id: generateId(), name: 'Steps',             type: 'text',     schedule: 'daily',  weekDay: null, order: 6 },
      { id: generateId(), name: 'Weight',            type: 'text',     schedule: 'weekly', weekDay: 6,    order: 7 },
    ];
  }

  // ── Item helpers ──
  function getItemsForDate(dateStr) {
    const dow = dayOfWeek(dateStr);
    return items.filter(function (item) {
      if (item.schedule === 'daily') return true;
      if (item.schedule === 'weekly' && item.weekDay === dow) return true;
      return false;
    });
  }

  function getEntry(dateStr) {
    return entries[dateStr] || {};
  }

  function setEntryValue(dateStr, itemId, value) {
    if (!entries[dateStr]) entries[dateStr] = {};
    entries[dateStr][itemId] = value;
    saveEntries();
  }

  // ── BP helpers ──
  // Data: array of sessions → [{time: "HH:MM", readings: [{sys,dia,bpm}, ...]}, ...]
  function getBpSessions(dateStr, itemId) {
    var val = getEntry(dateStr)[itemId];
    return Array.isArray(val) ? val : [];
  }

  function saveBpSessions(dateStr, itemId, sessions) {
    setEntryValue(dateStr, itemId, sessions);
  }

  // ── Streak ──
  function getCompletionForDate(dateStr) {
    var dayItems = getItemsForDate(dateStr);
    var checkboxItems = dayItems.filter(function (i) { return i.type === 'checkbox'; });
    if (checkboxItems.length === 0) return { done: 0, total: 0, complete: true };
    var entry = getEntry(dateStr);
    var done = checkboxItems.filter(function (i) { return entry[i.id] === true; }).length;
    return { done: done, total: checkboxItems.length, complete: done === checkboxItems.length };
  }

  function getCurrentStreak() {
    var streak = 0;
    var date = todayStr();
    var todayComp = getCompletionForDate(date);
    if (!todayComp.complete || todayComp.total === 0) date = addDays(date, -1);
    for (var i = 0; i < 9999; i++) {
      var comp = getCompletionForDate(date);
      if (comp.total === 0) { date = addDays(date, -1); continue; }
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

    if (dayItems.length === 0) {
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
        var val = entry[item.id] || '';
        html += '<div class="checklist-item" data-id="' + item.id + '" data-type="text">';
        html += '<div class="text-input-wrapper">';
        html += '<div class="item-name">' + escapeHtml(item.name);
        if (item.schedule === 'weekly') html += ' <span class="item-schedule-badge">' + WEEKDAYS[item.weekDay].slice(0, 3) + '</span>';
        html += '</div>';
        html += '<input type="text" class="item-text-input' + (val ? ' has-value' : '') + '" value="' + escapeHtml(val) + '" placeholder="Enter ' + escapeHtml(item.name.toLowerCase()) + '...">';
        html += '</div></div>';
      }
    });
    container.innerHTML = html;

    // Checkbox clicks
    container.querySelectorAll('[data-type="checkbox"]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        setEntryValue(currentDate, id, !getEntry(currentDate)[id]);
        renderChecklist();
      });
    });

    // Text inputs
    container.querySelectorAll('.item-text-input').forEach(function (input) {
      var id = input.closest('.checklist-item').getAttribute('data-id');
      input.addEventListener('input', function () {
        setEntryValue(currentDate, id, input.value);
        input.classList.toggle('has-value', input.value.length > 0);
      });
    });

    // BP delete session
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
    var streakEl = document.getElementById('day-streak');
    if (streak > 0) {
      streakEl.innerHTML = '<span class="streak-count">' + streak + '</span> day streak 🔥';
    } else {
      streakEl.innerHTML = 'Complete all items to start a streak!';
    }
  }

  // ── Render: History ──
  function renderHistory() {
    var container = document.getElementById('history-list');
    var fromVal = document.getElementById('filter-from').value;
    var toVal = document.getElementById('filter-to').value;

    var allDates = Object.keys(entries).sort().reverse();

    var filtered = allDates.filter(function (d) {
      if (fromVal && d < fromVal) return false;
      if (toVal && d > toVal) return false;
      return true;
    });

    if (filtered.length === 0) {
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
      var totalTasks = comp.total + fillable.length;
      var doneTasks = comp.done + fillableDone;
      var pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

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
          if (sessions.length === 0) {
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

    container.querySelectorAll('.history-day-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var details = document.getElementById('hist-' + header.getAttribute('data-date'));
        details.classList.toggle('open');
      });
    });
  }

  // ── Render: Analytics ──
  function renderAnalytics() {
    var container = document.getElementById('analytics-content');
    var today = todayStr();
    var fromDate = analyticsPeriodDays > 0 ? addDays(today, -analyticsPeriodDays + 1) : null;

    // Collect dates in range that have entries
    var allDates = Object.keys(entries).sort();
    var rangeDates = allDates.filter(function (d) {
      return !fromDate || d >= fromDate;
    });

    if (rangeDates.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data yet for this period.</div></div>';
      return;
    }

    var html = '';

    // ── Checkbox completion rates ──
    var checkboxItems = items.filter(function (i) { return i.type === 'checkbox'; });
    if (checkboxItems.length > 0) {
      html += '<div class="analytics-section">';
      html += '<div class="analytics-title">Habits</div>';
      checkboxItems.forEach(function (item) {
        var applicable = rangeDates.filter(function (d) {
          return getItemsForDate(d).some(function (i) { return i.id === item.id; });
        });
        if (applicable.length === 0) return;
        var done = applicable.filter(function (d) { return getEntry(d)[item.id] === true; }).length;
        var pct = Math.round((done / applicable.length) * 100);
        html += '<div class="analytics-row">';
        html += '<span class="analytics-label">' + escapeHtml(item.name) + '</span>';
        html += '<div class="analytics-bar-wrap">';
        html += '<div class="analytics-bar" style="width:' + pct + '%"></div>';
        html += '</div>';
        html += '<span class="analytics-pct">' + pct + '%</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // ── Steps ──
    var stepsItem = items.find(function (i) { return i.name.toLowerCase().indexOf('step') !== -1 && i.type === 'text'; });
    if (stepsItem) {
      var stepValues = [];
      rangeDates.forEach(function (d) {
        var v = getEntry(d)[stepsItem.id];
        var n = parseInt(v);
        if (!isNaN(n) && n > 0) stepValues.push({ date: d, value: n });
      });
      if (stepValues.length > 0) {
        var total = stepValues.reduce(function (a, v) { return a + v.value; }, 0);
        var avg = Math.round(total / stepValues.length);
        var best = stepValues.reduce(function (a, v) { return v.value > a.value ? v : a; });
        html += '<div class="analytics-section">';
        html += '<div class="analytics-title">Steps</div>';
        html += '<div class="analytics-stats">';
        html += '<div class="stat-card"><div class="stat-value">' + avg.toLocaleString() + '</div><div class="stat-label">Avg / day</div></div>';
        html += '<div class="stat-card"><div class="stat-value">' + total.toLocaleString() + '</div><div class="stat-label">Total</div></div>';
        html += '<div class="stat-card"><div class="stat-value">' + best.value.toLocaleString() + '</div><div class="stat-label">Best day</div></div>';
        html += '</div></div>';
      }
    }

    // ── Tension ──
    var bpItem = items.find(function (i) { return i.type === 'bp'; });
    if (bpItem) {
      // Group sessions by approximate time slot: morning (before 14h) vs evening (14h+)
      var morningReadings = [], eveningReadings = [];
      rangeDates.forEach(function (d) {
        var sessions = getBpSessions(d, bpItem.id);
        sessions.forEach(function (s) {
          var hour = parseInt((s.time || '00:00').split(':')[0]);
          s.readings.forEach(function (r) {
            if (hour < 14) morningReadings.push(r);
            else eveningReadings.push(r);
          });
        });
      });

      function avgReadings(arr) {
        if (!arr.length) return null;
        var sum = arr.reduce(function (a, r) { return { sys: a.sys + r.sys, dia: a.dia + r.dia, bpm: a.bpm + r.bpm }; }, { sys: 0, dia: 0, bpm: 0 });
        return { sys: Math.round(sum.sys / arr.length), dia: Math.round(sum.dia / arr.length), bpm: Math.round(sum.bpm / arr.length) };
      }

      var mAvg = avgReadings(morningReadings);
      var eAvg = avgReadings(eveningReadings);

      if (mAvg || eAvg) {
        html += '<div class="analytics-section">';
        html += '<div class="analytics-title">Tension (avg)</div>';
        html += '<div class="analytics-bp-grid">';
        if (mAvg) {
          html += '<div class="analytics-bp-card">';
          html += '<div class="analytics-bp-slot">Morning</div>';
          html += '<div class="analytics-bp-values">';
          html += '<span class="bp-sys">' + mAvg.sys + '</span><span class="bp-sep">/</span><span class="bp-dia">' + mAvg.dia + '</span>';
          html += '</div>';
          html += '<div class="analytics-bp-bpm"><span class="bp-bpm">' + mAvg.bpm + '</span> <span class="bp-unit">bpm</span></div>';
          html += '<div class="analytics-bp-count">' + morningReadings.length + ' readings</div>';
          html += '</div>';
        }
        if (eAvg) {
          html += '<div class="analytics-bp-card">';
          html += '<div class="analytics-bp-slot">Evening</div>';
          html += '<div class="analytics-bp-values">';
          html += '<span class="bp-sys">' + eAvg.sys + '</span><span class="bp-sep">/</span><span class="bp-dia">' + eAvg.dia + '</span>';
          html += '</div>';
          html += '<div class="analytics-bp-bpm"><span class="bp-bpm">' + eAvg.bpm + '</span> <span class="bp-unit">bpm</span></div>';
          html += '<div class="analytics-bp-count">' + eveningReadings.length + ' readings</div>';
          html += '</div>';
        }
        html += '</div></div>';
      }
    }

    // ── Weight ──
    var weightItem = items.find(function (i) { return i.name.toLowerCase().indexOf('weight') !== -1 && i.type === 'text'; });
    if (weightItem) {
      var weightEntries = [];
      rangeDates.forEach(function (d) {
        var v = getEntry(d)[weightItem.id];
        if (v !== undefined && v !== null && v !== '') weightEntries.push({ date: d, value: v });
      });
      if (weightEntries.length > 0) {
        html += '<div class="analytics-section">';
        html += '<div class="analytics-title">Weight</div>';
        html += '<div class="analytics-weight-list">';
        weightEntries.slice(-8).reverse().forEach(function (w) {
          html += '<div class="analytics-weight-row">';
          html += '<span class="analytics-weight-date">' + prettyDate(w.date) + '</span>';
          html += '<span class="analytics-weight-val">' + escapeHtml(w.value) + '</span>';
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
    var html = '';

    items.sort(function (a, b) { return a.order - b.order; });

    items.forEach(function (item, idx) {
      var typeLabel = item.type === 'checkbox' ? 'Checkbox' : item.type === 'bp' ? 'Blood Pressure' : 'Text';
      var scheduleLabel = item.schedule === 'daily' ? 'Daily' : WEEKDAYS[item.weekDay] + 's only';

      html += '<div class="settings-item" data-id="' + item.id + '">';
      html += '<div class="settings-item-info">';
      html += '<div class="settings-item-name">' + escapeHtml(item.name) + '</div>';
      html += '<div class="settings-item-meta">' + typeLabel + ' · ' + scheduleLabel + '</div>';
      html += '</div>';
      html += '<div class="settings-item-actions">';
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

  function moveItem(itemId, direction) {
    var idx = items.findIndex(function (i) { return i.id === itemId; });
    if (idx < 0) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    var temp = items[idx]; items[idx] = items[newIdx]; items[newIdx] = temp;
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
    ['bp-r1-sys','bp-r1-dia','bp-r1-bpm','bp-r2-sys','bp-r2-dia','bp-r2-bpm','bp-r3-sys','bp-r3-dia','bp-r3-bpm'].forEach(function (cls) {
      document.querySelector('.' + cls).value = '';
    });
    document.getElementById('modal-bp').classList.remove('hidden');
    setTimeout(function () { document.querySelector('.bp-r1-sys').focus(); }, 100);
  }

  function closeBpModal() {
    bpActiveItemId = null;
    bpActiveDate = null;
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
    if (tabName === 'settings')   renderSettings();
  }

  // ── Export / Import ──
  function exportData() {
    var data = { items: items, entries: entries, exportDate: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'daily-tracker-backup-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.items && data.entries) {
          items = data.items;
          entries = data.entries;
          saveItems();
          saveEntries();
          renderAll();
          alert('Data imported successfully!');
        } else {
          alert('Invalid backup file.');
        }
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function renderAll() {
    renderHeader();
    renderChecklist();
  }

  // ── Init ──
  function init() {
    loadData();

    // Set default history filter: last 30 days to today
    document.getElementById('filter-to').value = todayStr();
    document.getElementById('filter-from').value = addDays(todayStr(), -29);

    renderAll();

    // Tabs
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });

    // Date navigation
    document.getElementById('btn-prev').addEventListener('click', function () {
      currentDate = addDays(currentDate, -1);
      renderAll();
    });
    document.getElementById('btn-next').addEventListener('click', function () {
      if (currentDate < todayStr()) { currentDate = addDays(currentDate, 1); renderAll(); }
    });

    // History filter
    document.getElementById('filter-from').addEventListener('change', renderHistory);
    document.getElementById('filter-to').addEventListener('change', renderHistory);

    // Analytics period buttons
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
      items.push({ id: generateId(), name: name, type: type, schedule: schedule, weekDay: weekDay, order: items.length });
      saveItems();
      document.getElementById('new-item-name').value = '';
      addForm.classList.add('hidden');
      renderSettings();
      renderChecklist();
    });

    // BP session modal
    document.getElementById('btn-bp-cancel').addEventListener('click', closeBpModal);
    document.getElementById('modal-bp').addEventListener('click', function (e) {
      if (e.target === this) closeBpModal();
    });
    document.getElementById('btn-bp-save').addEventListener('click', function () {
      if (!bpActiveItemId) return;
      var time = document.getElementById('bp-session-time').value;
      if (!time) { document.getElementById('bp-session-time').focus(); return; }
      var rowClasses = [
        { sys: 'bp-r1-sys', dia: 'bp-r1-dia', bpm: 'bp-r1-bpm' },
        { sys: 'bp-r2-sys', dia: 'bp-r2-dia', bpm: 'bp-r2-bpm' },
        { sys: 'bp-r3-sys', dia: 'bp-r3-dia', bpm: 'bp-r3-bpm' },
      ];
      var readings = [];
      for (var i = 0; i < rowClasses.length; i++) {
        var sys = parseInt(document.querySelector('.' + rowClasses[i].sys).value);
        var dia = parseInt(document.querySelector('.' + rowClasses[i].dia).value);
        var bpm = parseInt(document.querySelector('.' + rowClasses[i].bpm).value);
        if (!sys || !dia || !bpm) { document.querySelector('.' + rowClasses[i].sys).focus(); return; }
        readings.push({ sys: sys, dia: dia, bpm: bpm });
      }
      var sessions = getBpSessions(bpActiveDate, bpActiveItemId);
      sessions.push({ time: time, readings: readings });
      saveBpSessions(bpActiveDate, bpActiveItemId, sessions);
      closeBpModal();
      renderChecklist();
    });

    // Edit modal
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
