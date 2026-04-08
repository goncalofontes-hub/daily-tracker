(function () {
  'use strict';

  // ── Constants ──
  const STORAGE_ITEMS = 'dt_items';
  const STORAGE_ENTRIES = 'dt_entries';
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const BADGE_MILESTONES = [7, 10, 25, 50, 100, 200, 365];
  const BADGE_ICONS = ['⭐', '🔥', '💪', '🏆', '👑', '💎', '🌟'];

  // ── State ──
  let items = [];
  let entries = {};
  let currentDate = todayStr();
  let editingItemId = null;

  // ── Helpers ──
  function todayStr() {
    const d = new Date();
    return formatDate(d);
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

  function shortDate(dateStr) {
    const d = parseDate(dateStr);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
      if (savedItems) {
        items = JSON.parse(savedItems);
      } else {
        items = getDefaultItems();
        saveItems();
      }

      const savedEntries = localStorage.getItem(STORAGE_ENTRIES);
      if (savedEntries) {
        entries = JSON.parse(savedEntries);
      }
    } catch (e) {
      items = getDefaultItems();
      entries = {};
      saveItems();
      saveEntries();
    }
  }

  function getDefaultItems() {
    return [
      { id: generateId(), name: 'Fasting', type: 'checkbox', schedule: 'daily', weekDay: null, order: 0 },
      { id: generateId(), name: 'Supplementation', type: 'checkbox', schedule: 'daily', weekDay: null, order: 1 },
      { id: generateId(), name: 'Morning Walk', type: 'checkbox', schedule: 'daily', weekDay: null, order: 2 },
      { id: generateId(), name: 'Night Walk', type: 'checkbox', schedule: 'daily', weekDay: null, order: 3 },
      { id: generateId(), name: 'Tension', type: 'text', schedule: 'daily', weekDay: null, order: 4 },
      { id: generateId(), name: 'Weight', type: 'text', schedule: 'weekly', weekDay: 6, order: 5 },
    ];
  }

  // ── Which items are visible on a given date ──
  function getItemsForDate(dateStr) {
    const dow = dayOfWeek(dateStr);
    return items.filter(function (item) {
      if (item.schedule === 'daily') return true;
      if (item.schedule === 'weekly' && item.weekDay === dow) return true;
      return false;
    });
  }

  // ── Entry helpers ──
  function getEntry(dateStr) {
    return entries[dateStr] || {};
  }

  function setEntryValue(dateStr, itemId, value) {
    if (!entries[dateStr]) entries[dateStr] = {};
    entries[dateStr][itemId] = value;
    saveEntries();
  }

  // ── Streak calculation ──
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

    // Check if today is complete; if not, start from yesterday
    var todayCompletion = getCompletionForDate(date);
    if (!todayCompletion.complete || todayCompletion.total === 0) {
      date = addDays(date, -1);
    }

    while (true) {
      var comp = getCompletionForDate(date);
      if (comp.total === 0) {
        date = addDays(date, -1);
        continue;
      }
      if (comp.complete) {
        streak++;
        date = addDays(date, -1);
      } else {
        break;
      }
      if (streak > 9999) break; // safety
    }
    return streak;
  }

  // ── Item streak (consecutive days an item was completed) ──
  function getItemStreak(itemId) {
    var item = items.find(function (i) { return i.id === itemId; });
    if (!item) return 0;
    var streak = 0;
    var date = todayStr();

    // For checkbox items, check if marked; for text items, check if non-empty
    var isComplete = function (dateStr) {
      var entry = getEntry(dateStr);
      var val = entry[itemId];
      if (item.type === 'checkbox') return val === true;
      return val !== undefined && val !== null && val !== '';
    };

    var isApplicable = function (dateStr) {
      if (item.schedule === 'daily') return true;
      return item.weekDay === dayOfWeek(dateStr);
    };

    // Start from today or yesterday
    if (!isApplicable(date) || !isComplete(date)) {
      date = addDays(date, -1);
    }

    for (var i = 0; i < 9999; i++) {
      if (!isApplicable(date)) {
        date = addDays(date, -1);
        continue;
      }
      if (isComplete(date)) {
        streak++;
        date = addDays(date, -1);
      } else {
        break;
      }
    }
    return streak;
  }

  // ── Render: Header ──
  function renderHeader() {
    var d = parseDate(currentDate);
    var isToday = currentDate === todayStr();
    var main = WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    var sub = d.getFullYear().toString();

    var html = '<div class="date-main">' + main + '</div>';
    html += '<div class="date-sub">' + sub + '</div>';
    if (isToday) {
      html += '<div class="date-today">Today</div>';
    }
    document.getElementById('header-date').innerHTML = html;

    // Disable next button if on today
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
        if (item.schedule === 'weekly') {
          html += '<span class="item-schedule-badge">' + WEEKDAYS[item.weekDay].slice(0, 3) + '</span>';
        }
        html += '</div>';
      } else {
        var val = entry[item.id] || '';
        html += '<div class="checklist-item" data-id="' + item.id + '" data-type="text">';
        html += '<div class="text-input-wrapper">';
        html += '<div class="item-name">' + escapeHtml(item.name);
        if (item.schedule === 'weekly') {
          html += ' <span class="item-schedule-badge">' + WEEKDAYS[item.weekDay].slice(0, 3) + '</span>';
        }
        html += '</div>';
        html += '<input type="text" class="item-text-input' + (val ? ' has-value' : '') + '" value="' + escapeHtml(val) + '" placeholder="Enter ' + escapeHtml(item.name.toLowerCase()) + '...">';
        html += '</div>';
        html += '</div>';
      }
    });
    container.innerHTML = html;

    // Bind checkbox clicks
    container.querySelectorAll('[data-type="checkbox"]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        var current = getEntry(currentDate)[id] === true;
        setEntryValue(currentDate, id, !current);
        renderChecklist();
      });
    });

    // Bind text inputs
    container.querySelectorAll('.item-text-input').forEach(function (input) {
      var itemEl = input.closest('.checklist-item');
      var id = itemEl.getAttribute('data-id');
      input.addEventListener('input', function () {
        setEntryValue(currentDate, id, input.value);
        input.classList.toggle('has-value', input.value.length > 0);
      });
    });

    // Render streak
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
    // Get all dates with entries, sorted descending
    var dates = Object.keys(entries).sort().reverse();

    if (dates.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">No history yet.<br>Start tracking today!</div></div>';
      return;
    }

    var html = '';
    dates.forEach(function (dateStr) {
      var dayItems = getItemsForDate(dateStr);
      var entry = entries[dateStr];
      var comp = getCompletionForDate(dateStr);

      // Calculate score: checkboxes done + text fields filled
      var textItems = dayItems.filter(function (i) { return i.type === 'text'; });
      var textFilled = textItems.filter(function (i) {
        var v = entry[i.id];
        return v !== undefined && v !== null && v !== '';
      }).length;

      var totalTasks = comp.total + textItems.length;
      var doneTasks = comp.done + textFilled;
      var pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      html += '<div class="history-day">';
      html += '<div class="history-day-header" data-date="' + dateStr + '">';
      html += '<span class="history-day-date">' + prettyDate(dateStr) + '</span>';
      html += '<span class="history-day-score">' + pct + '%</span>';
      html += '</div>';
      html += '<div class="history-day-details" id="hist-' + dateStr + '">';

      dayItems.forEach(function (item) {
        var val = entry[item.id];
        html += '<div class="history-detail-item">';
        html += '<span>' + escapeHtml(item.name) + '</span>';
        if (item.type === 'checkbox') {
          html += '<span class="history-detail-value ' + (val ? 'done' : 'missed') + '">' + (val ? '✓' : '✗') + '</span>';
        } else {
          var displayVal = (val !== undefined && val !== null && val !== '') ? escapeHtml(val) : '—';
          html += '<span class="history-detail-value ' + (displayVal !== '—' ? 'done' : 'missed') + '">' + displayVal + '</span>';
        }
        html += '</div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;

    // Toggle details on header click
    container.querySelectorAll('.history-day-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var dateStr = header.getAttribute('data-date');
        var details = document.getElementById('hist-' + dateStr);
        details.classList.toggle('open');
      });
    });
  }

  // ── Render: Badges ──
  function renderBadges() {
    var container = document.getElementById('badges-list');
    var html = '';

    // Overall streak badges
    var overallStreak = getCurrentStreak();
    html += '<div class="badges-section"><h3>Overall Streak</h3>';
    BADGE_MILESTONES.forEach(function (milestone, idx) {
      var unlocked = overallStreak >= milestone;
      var progress = Math.min(overallStreak / milestone, 1);
      html += '<div class="badge-card' + (unlocked ? '' : ' locked') + '">';
      html += '<div class="badge-icon">' + BADGE_ICONS[idx] + '</div>';
      html += '<div class="badge-info">';
      html += '<div class="badge-title">' + milestone + ' Day Streak</div>';
      html += '<div class="badge-desc">' + (unlocked ? 'Unlocked!' : overallStreak + ' / ' + milestone + ' days') + '</div>';
      if (!unlocked) {
        html += '<div class="badge-progress"><div class="badge-progress-fill" style="width:' + (progress * 100) + '%"></div></div>';
      }
      html += '</div></div>';
    });
    html += '</div>';

    // Per-item badges
    items.forEach(function (item) {
      var streak = getItemStreak(item.id);
      if (streak === 0 && items.length > 6) return; // Skip items with no progress if there are many

      html += '<div class="badges-section"><h3>' + escapeHtml(item.name) + '</h3>';
      BADGE_MILESTONES.forEach(function (milestone, idx) {
        var unlocked = streak >= milestone;
        var progress = Math.min(streak / milestone, 1);
        html += '<div class="badge-card' + (unlocked ? '' : ' locked') + '">';
        html += '<div class="badge-icon">' + BADGE_ICONS[idx] + '</div>';
        html += '<div class="badge-info">';
        html += '<div class="badge-title">' + milestone + ' Days</div>';
        html += '<div class="badge-desc">' + (unlocked ? 'Unlocked!' : streak + ' / ' + milestone) + '</div>';
        if (!unlocked) {
          html += '<div class="badge-progress"><div class="badge-progress-fill" style="width:' + (progress * 100) + '%"></div></div>';
        }
        html += '</div></div>';
      });
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── Render: Settings ──
  function renderSettings() {
    var container = document.getElementById('settings-items');
    var html = '';

    items.sort(function (a, b) { return a.order - b.order; });

    items.forEach(function (item, idx) {
      var meta = item.type === 'checkbox' ? 'Checkbox' : 'Text';
      meta += ' · ';
      meta += item.schedule === 'daily' ? 'Daily' : WEEKDAYS[item.weekDay] + 's only';

      html += '<div class="settings-item" data-id="' + item.id + '">';
      html += '<div class="settings-item-info">';
      html += '<div class="settings-item-name">' + escapeHtml(item.name) + '</div>';
      html += '<div class="settings-item-meta">' + meta + '</div>';
      html += '</div>';
      html += '<div class="settings-item-actions">';
      if (idx > 0) {
        html += '<button class="btn-icon btn-move-up" data-id="' + item.id + '" title="Move up">↑</button>';
      }
      if (idx < items.length - 1) {
        html += '<button class="btn-icon btn-move-down" data-id="' + item.id + '" title="Move down">↓</button>';
      }
      html += '<button class="btn-icon btn-edit" data-id="' + item.id + '" title="Edit">✎</button>';
      html += '</div>';
      html += '</div>';
    });

    container.innerHTML = html;

    // Bind move buttons
    container.querySelectorAll('.btn-move-up').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        moveItem(btn.getAttribute('data-id'), -1);
      });
    });
    container.querySelectorAll('.btn-move-down').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        moveItem(btn.getAttribute('data-id'), 1);
      });
    });
    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openEditModal(btn.getAttribute('data-id'));
      });
    });
  }

  function moveItem(itemId, direction) {
    var idx = items.findIndex(function (i) { return i.id === itemId; });
    if (idx < 0) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    // Swap
    var temp = items[idx];
    items[idx] = items[newIdx];
    items[newIdx] = temp;
    // Update order
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
    if (item.schedule === 'weekly') {
      weekdaySelect.classList.remove('hidden');
      weekdaySelect.value = item.weekDay !== null ? item.weekDay : 6;
    } else {
      weekdaySelect.classList.add('hidden');
    }

    document.getElementById('modal-edit').classList.remove('hidden');
  }

  function closeEditModal() {
    editingItemId = null;
    document.getElementById('modal-edit').classList.add('hidden');
  }

  // ── Tabs ──
  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + tabName);
    });

    if (tabName === 'checklist') renderChecklist();
    if (tabName === 'history') renderHistory();
    if (tabName === 'badges') renderBadges();
    if (tabName === 'settings') renderSettings();
  }

  // ── Escape HTML ──
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // ── Render all ──
  function renderAll() {
    renderHeader();
    renderChecklist();
  }

  // ── Init ──
  function init() {
    loadData();
    renderAll();

    // Tab clicks
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(tab.getAttribute('data-tab'));
      });
    });

    // Date navigation
    document.getElementById('btn-prev').addEventListener('click', function () {
      currentDate = addDays(currentDate, -1);
      renderAll();
    });
    document.getElementById('btn-next').addEventListener('click', function () {
      if (currentDate < todayStr()) {
        currentDate = addDays(currentDate, 1);
        renderAll();
      }
    });

    // Add item form
    var addForm = document.getElementById('add-item-form');
    document.getElementById('btn-add-item').addEventListener('click', function () {
      addForm.classList.toggle('hidden');
      if (!addForm.classList.contains('hidden')) {
        document.getElementById('new-item-name').focus();
      }
    });

    document.getElementById('new-item-schedule').addEventListener('change', function () {
      var weekdaySelect = document.getElementById('new-item-weekday');
      weekdaySelect.classList.toggle('hidden', this.value !== 'weekly');
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

      items.push({
        id: generateId(),
        name: name,
        type: type,
        schedule: schedule,
        weekDay: weekDay,
        order: items.length
      });
      saveItems();

      document.getElementById('new-item-name').value = '';
      addForm.classList.add('hidden');
      renderSettings();
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

    // Close modal on backdrop click
    document.getElementById('modal-edit').addEventListener('click', function (e) {
      if (e.target === this) closeEditModal();
    });

    // Export / Import
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', function (e) {
      if (e.target.files[0]) {
        importData(e.target.files[0]);
      }
    });

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
