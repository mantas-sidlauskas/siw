(function () {
  'use strict';

  var API = '/plugins/siw';

  var pageListEl = document.getElementById('pageList');
  var addPageButton = document.getElementById('addPage');
  var messageEl = document.getElementById('message');
  var componentListEl = document.getElementById('componentList');
  var addComponentButton = document.getElementById('addComponent');
  var componentFormEl = document.getElementById('componentForm');
  var previewWrapEl = document.getElementById('previewWrap');
  var previewImageEl = document.getElementById('previewImage');
  var rawJsonToggleButton = document.getElementById('rawJsonToggle');
  var rawJsonPanelEl = document.getElementById('rawJsonPanel');
  var structuredPanelEl = document.getElementById('structuredPanel');
  var rawJsonTextEl = document.getElementById('rawJsonText');
  var rawJsonApplyButton = document.getElementById('rawJsonApply');

  var state = {
    pages: [],
    selectedPageIndex: -1,
    selectedComponentIndex: -1,
  };

  var previewDebounceTimer = null;
  var previewObjectUrl = null;

  var DEFAULT_COMPONENT_BY_TYPE = {
    numeric: function (id) { return { id: id, type: 'numeric', width: 240, height: 120, format: 'png', path: '', unit: '', decimals: 1, label: '' }; },
    windTrend: function (id) { return { id: id, type: 'windTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    windSpeedTrend: function (id) { return { id: id, type: 'windSpeedTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    windDirectionTrend: function (id) { return { id: id, type: 'windDirectionTrend', width: 480, height: 200, format: 'png', windowMinutes: 30 }; },
    maneuverScore: function (id) { return { id: id, type: 'maneuverScore', width: 300, height: 200, format: 'png', windowMinutes: 30 }; },
  };

  var COMMON_FIELDS = ['id', 'type', 'width', 'height', 'format'];
  var TYPE_SPECIFIC_FIELDS = {
    numeric: ['path', 'unit', 'decimals', 'conversion', 'label'],
    windTrend: ['windowMinutes'],
    windSpeedTrend: ['windowMinutes'],
    windDirectionTrend: ['windowMinutes'],
    maneuverScore: ['windowMinutes'],
  };
  var FIELD_LABELS = {
    id: 'ID', type: 'Type', width: 'Width (px)', height: 'Height (px)', format: 'Format',
    path: 'SignalK path', unit: 'Unit', decimals: 'Decimals', conversion: 'Conversion', label: 'Label',
    windowMinutes: 'Window (minutes)',
  };

  function showError(message) {
    messageEl.textContent = message || '';
    messageEl.classList.add('text-danger');
  }

  function showMessage(message) {
    messageEl.classList.remove('text-danger');
    messageEl.textContent = message || '';
  }

  function selectedPage() {
    return state.pages[state.selectedPageIndex] || null;
  }

  function renderPageList() {
    pageListEl.innerHTML = '';
    state.pages.forEach(function (page, index) {
      var li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center justify-content-between' + (index === state.selectedPageIndex ? ' active-item' : '');

      var titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'form-control form-control-sm me-2';
      titleInput.value = page.title || '';
      titleInput.placeholder = '(untitled page)';
      titleInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
      titleInput.addEventListener('input', function () {
        page.title = titleInput.value;
      });

      var controls = document.createElement('div');
      controls.className = 'd-flex gap-1';

      var upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'btn btn-sm btn-outline-secondary';
      upButton.textContent = '↑';
      upButton.disabled = index === 0;
      upButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        movePage(index, -1);
      });

      var downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'btn btn-sm btn-outline-secondary';
      downButton.textContent = '↓';
      downButton.disabled = index === state.pages.length - 1;
      downButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        movePage(index, 1);
      });

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-outline-danger';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removePage(index);
      });

      controls.appendChild(upButton);
      controls.appendChild(downButton);
      controls.appendChild(removeButton);

      li.appendChild(titleInput);
      li.appendChild(controls);
      li.addEventListener('click', function () {
        selectPage(index);
      });

      pageListEl.appendChild(li);
    });
  }

  function selectPage(index) {
    state.selectedPageIndex = index;
    state.selectedComponentIndex = -1;
    renderAll();
  }

  function addPage() {
    state.pages.push({ title: '', components: [] });
    state.selectedPageIndex = state.pages.length - 1;
    state.selectedComponentIndex = -1;
    renderAll();
  }

  function removePage(index) {
    state.pages.splice(index, 1);
    if (state.selectedPageIndex === index) {
      state.selectedPageIndex = -1;
      state.selectedComponentIndex = -1;
    } else if (state.selectedPageIndex > index) {
      state.selectedPageIndex -= 1;
    }
    renderAll();
  }

  function movePage(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= state.pages.length) return;
    var tmp = state.pages[index];
    state.pages[index] = state.pages[target];
    state.pages[target] = tmp;
    if (state.selectedPageIndex === index) state.selectedPageIndex = target;
    else if (state.selectedPageIndex === target) state.selectedPageIndex = index;
    renderAll();
  }

  function selectedComponent() {
    var page = selectedPage();
    if (!page) return null;
    return page.components[state.selectedComponentIndex] || null;
  }

  function renderComponentList() {
    componentListEl.innerHTML = '';
    var page = selectedPage();
    addComponentButton.disabled = !page;
    if (!page) return;

    page.components.forEach(function (component, index) {
      var li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center justify-content-between' + (index === state.selectedComponentIndex ? ' active-item' : '');

      var label = document.createElement('span');
      label.textContent = (component.id || '(no id)') + ' — ' + component.type;

      var controls = document.createElement('div');
      controls.className = 'd-flex gap-1';

      var upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'btn btn-sm btn-outline-secondary';
      upButton.textContent = '↑';
      upButton.disabled = index === 0;
      upButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        moveComponent(index, -1);
      });

      var downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'btn btn-sm btn-outline-secondary';
      downButton.textContent = '↓';
      downButton.disabled = index === page.components.length - 1;
      downButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        moveComponent(index, 1);
      });

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-outline-danger';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        removeComponent(index);
      });

      controls.appendChild(upButton);
      controls.appendChild(downButton);
      controls.appendChild(removeButton);

      li.appendChild(label);
      li.appendChild(controls);
      li.addEventListener('click', function () {
        selectComponent(index);
      });

      componentListEl.appendChild(li);
    });
  }

  function selectComponent(index) {
    state.selectedComponentIndex = index;
    renderAll();
    schedulePreview();
  }

  function addComponent() {
    var page = selectedPage();
    if (!page) return;
    var id = 'component-' + Date.now();
    page.components.push(DEFAULT_COMPONENT_BY_TYPE.numeric(id));
    state.selectedComponentIndex = page.components.length - 1;
    renderAll();
    schedulePreview();
  }

  function removeComponent(index) {
    var page = selectedPage();
    if (!page) return;
    page.components.splice(index, 1);
    if (state.selectedComponentIndex === index) {
      state.selectedComponentIndex = -1;
    } else if (state.selectedComponentIndex > index) {
      state.selectedComponentIndex -= 1;
    }
    renderAll();
  }

  function moveComponent(index, delta) {
    var page = selectedPage();
    if (!page) return;
    var target = index + delta;
    if (target < 0 || target >= page.components.length) return;
    var tmp = page.components[index];
    page.components[index] = page.components[target];
    page.components[target] = tmp;
    if (state.selectedComponentIndex === index) state.selectedComponentIndex = target;
    else if (state.selectedComponentIndex === target) state.selectedComponentIndex = index;
    renderAll();
  }

  function fieldInput(component, field) {
    var wrap = document.createElement('div');
    wrap.className = 'mb-2';

    var label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = FIELD_LABELS[field] || field;
    wrap.appendChild(label);

    var input;
    if (field === 'type') {
      input = document.createElement('select');
      input.className = 'form-select';
      Object.keys(DEFAULT_COMPONENT_BY_TYPE).forEach(function (typeName) {
        var option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        if (typeName === component.type) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        var page = selectedPage();
        var defaults = DEFAULT_COMPONENT_BY_TYPE[input.value](component.id);
        page.components[state.selectedComponentIndex] = defaults;
        renderAll();
        schedulePreview();
      });
    } else if (field === 'format') {
      input = document.createElement('select');
      input.className = 'form-select';
      ['png', 'jpeg', 'svg'].forEach(function (formatName) {
        var option = document.createElement('option');
        option.value = formatName;
        option.textContent = formatName;
        if (formatName === component.format) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        component.format = input.value;
        schedulePreview();
      });
    } else if (field === 'conversion') {
      input = document.createElement('select');
      input.className = 'form-select';
      ['', 'mpsToKnots'].forEach(function (conversionName) {
        var option = document.createElement('option');
        option.value = conversionName;
        option.textContent = conversionName || '(none)';
        if (conversionName === (component.conversion || '')) option.selected = true;
        input.appendChild(option);
      });
      input.addEventListener('change', function () {
        component.conversion = input.value || undefined;
        schedulePreview();
      });
    } else if (field === 'width' || field === 'height' || field === 'decimals' || field === 'windowMinutes') {
      // Never the "id" field (that's always text, handled below), so no
      // need to refresh the sidebar label here.
      input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control';
      input.value = component[field] === undefined ? '' : component[field];
      input.addEventListener('input', function () {
        component[field] = input.value === '' ? undefined : Number(input.value);
        schedulePreview();
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.value = component[field] === undefined ? '' : component[field];
      input.addEventListener('input', function () {
        component[field] = input.value;
        if (field === 'id') renderComponentList();
        schedulePreview();
      });
    }

    wrap.appendChild(input);
    return wrap;
  }

  function renderComponentForm() {
    componentFormEl.innerHTML = '';
    var component = selectedComponent();
    if (!component) {
      componentFormEl.textContent = 'Select or add a component to edit it.';
      previewWrapEl.hidden = true;
      return;
    }

    var fields = COMMON_FIELDS.concat(TYPE_SPECIFIC_FIELDS[component.type] || []);
    fields.forEach(function (field) {
      componentFormEl.appendChild(fieldInput(component, field));
    });
  }

  // Debounced so a field being typed into doesn't fire a request per
  // keystroke. A 400 (the component is momentarily invalid mid-edit - an
  // empty width, an unrecognized path) is expected and frequent while
  // typing: hide the preview quietly rather than calling showError(), which
  // would otherwise flash on nearly every keystroke.
  function schedulePreview() {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updatePreview, 500);
  }

  function updatePreview() {
    var component = selectedComponent();
    if (!component) {
      previewWrapEl.hidden = true;
      return;
    }
    fetch(API + '/admin/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(component),
    })
      .then(function (res) {
        if (!res.ok) {
          previewWrapEl.hidden = true;
          return null;
        }
        return res.blob();
      })
      .then(function (blob) {
        if (!blob) return;
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(blob);
        previewImageEl.src = previewObjectUrl;
        previewWrapEl.hidden = false;
      })
      .catch(function () {
        previewWrapEl.hidden = true;
      });
  }

  // Tasks 6-9 extend this with form, preview, save, and raw-JSON rendering -
  // calling renderAll() always re-renders everything currently wired, so
  // each task just adds its own render*() call here.
  function renderAll() {
    renderPageList();
    renderComponentList();
    renderComponentForm();
  }

  function save() {
    if (!rawJsonPanelEl.hidden) {
      applyRawJson();
      if (!rawJsonPanelEl.hidden) return; // invalid JSON - applyRawJson already showed the error, don't save stale state
    }
    fetch(API + '/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: state.pages }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          if (result.body.errors) {
            var summary = result.body.errors
              .map(function (e) {
                return 'page ' + (e.page + 1) + ', component "' + (e.id || '?') + '": ' + e.message;
              })
              .join('; ');
            showError('Save failed - ' + summary);
          } else {
            showError('Save failed - ' + (result.body.message || 'unknown error'));
          }
          return;
        }
        showMessage('Saved.');
      })
      .catch(function (err) {
        showError('Save failed - ' + err.message);
      });
  }

  function toggleRawJson() {
    var showingRaw = !rawJsonPanelEl.hidden;
    if (showingRaw) {
      rawJsonPanelEl.hidden = true;
      structuredPanelEl.hidden = false;
    } else {
      rawJsonTextEl.value = JSON.stringify({ pages: state.pages }, null, 2);
      rawJsonPanelEl.hidden = false;
      structuredPanelEl.hidden = true;
    }
  }

  function applyRawJson() {
    var parsed;
    try {
      parsed = JSON.parse(rawJsonTextEl.value);
    } catch (err) {
      showError('Raw JSON is not valid JSON: ' + err.message);
      return;
    }
    if (!parsed || !Array.isArray(parsed.pages)) {
      showError('Raw JSON must be an object with a "pages" array');
      return;
    }
    state.pages = parsed.pages;
    state.selectedPageIndex = state.pages.length > 0 ? 0 : -1;
    state.selectedComponentIndex = -1;
    rawJsonPanelEl.hidden = true;
    structuredPanelEl.hidden = false;
    renderAll();
    showMessage('Raw JSON applied - review and Save to persist it.');
  }

  function loadConfig() {
    fetch(API + '/admin/config')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load config (' + res.status + ')');
        return res.json();
      })
      .then(function (body) {
        state.pages = body.pages;
        state.selectedPageIndex = state.pages.length > 0 ? 0 : -1;
        renderAll();
        if (body.skipped && body.skipped.length > 0) {
          showError(
            body.skipped.length +
              ' component(s) in components.json are invalid and are not shown here - saving now would remove them. Fix components.json directly to recover them, or re-add them via this editor before saving.',
          );
        }
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  addPageButton.addEventListener('click', addPage);
  addComponentButton.addEventListener('click', addComponent);
  document.getElementById('saveButton').addEventListener('click', save);
  rawJsonToggleButton.addEventListener('click', toggleRawJson);
  rawJsonApplyButton.addEventListener('click', applyRawJson);

  loadConfig();
})();
