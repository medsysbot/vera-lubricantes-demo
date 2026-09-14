(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const FIELDS = ['service_date','mileage','next_change_km','oil','oil_type','oil_filter','fuel_filter','air_filter','cabin_filter','spark_plugs','gearbox_oil','differential_oil','grease','hydraulic_fluid','coolant','brake_fluid','tire_control','tire_rotation','battery','observations'];

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try { message = (await response.json()).detail || message; } catch {}
      if (Array.isArray(message)) message = message.map(item => item.msg || 'Datos inválidos').join('. ');
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const nullableNumber = value => String(value ?? '').trim() === '' ? null : Number(value);
  const nullableText = value => String(value ?? '').trim() || null;

  function notify(message, type = 'success', options = {}) {
    return window.VeraUI?.notify ? window.VeraUI.notify(message, type, options) : null;
  }

  async function confirmAction(options) {
    if (window.VeraUI?.confirmAction) return window.VeraUI.confirmAction(options);
    return window.confirm(options.message || options.title || 'Confirmar');
  }

  function ensureClientEditUi() {
    const actions = $('#client-action-bar .selection-actions');
    if (actions && !$('#edit-selected-client')) {
      const button = document.createElement('button');
      button.className = 'btn primary';
      button.id = 'edit-selected-client';
      button.type = 'button';
      button.textContent = 'Editar datos';
      actions.prepend(button);
    }

    if (!$('#client-edit-dialog')) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog id="client-edit-dialog" class="qr-dialog client-edit-dialog">
          <button class="dialog-close" id="close-client-edit" type="button">×</button>
          <p class="eyebrow">Cliente</p>
          <h2>Editar datos</h2>
          <form id="client-edit-form">
            <input type="hidden" name="client_id">
            <div class="form-grid">
              <label>Nombre y apellido<input class="text-input" name="full_name" required></label>
              <label>Teléfono<input class="text-input" name="phone" required></label>
            </div>
            <div id="client-edit-vehicles"></div>
            <div class="form-actions form-actions-end">
              <button class="btn" id="cancel-client-edit" type="button">Cancelar</button>
              <button class="btn primary" type="submit">Guardar</button>
            </div>
            <p class="error-text" id="client-edit-error"></p>
          </form>
        </dialog>`);
    }
  }

  function selectedClientId() {
    return $('[data-client-select]:checked')?.value || null;
  }

  function vehicleEditor(vehicle, index) {
    return `
      <section class="client-edit-vehicle" data-edit-vehicle="${esc(vehicle.id)}">
        <h3>Vehículo ${index + 1}</h3>
        <input type="hidden" name="vehicle_id" value="${esc(vehicle.id)}">
        <div class="form-grid">
          <label>Patente<input class="text-input" name="plate" value="${esc(vehicle.plate)}" required></label>
          <label>Marca<input class="text-input" name="brand" value="${esc(vehicle.brand || '')}"></label>
          <label>Modelo<input class="text-input" name="model" value="${esc(vehicle.model)}" required></label>
          <label>Descripción<input class="text-input" name="description" value="${esc(vehicle.description || '')}"></label>
          <label>Año<input class="text-input" name="year" type="number" min="1900" max="2200" value="${esc(vehicle.year ?? '')}"></label>
          <label>Kilometraje registrado<input class="text-input" name="current_mileage" type="number" min="0" value="${esc(vehicle.current_mileage ?? '')}"></label>
        </div>
      </section>`;
  }

  async function openClientEdit() {
    const id = selectedClientId();
    if (!id) return;
    const busy = notify('Cargando datos del cliente…', 'loading');
    try {
      const data = await api(`/api/admin/clients/${id}/profile`);
      busy?.close?.();
      const form = $('#client-edit-form');
      form.elements.client_id.value = id;
      form.elements.full_name.value = data.client.full_name || '';
      form.elements.phone.value = data.client.phone || '';
      $('#client-edit-vehicles').innerHTML = data.vehicles.map(vehicleEditor).join('');
      $('#client-edit-error').textContent = '';
      $('#client-edit-dialog').showModal();
    } catch (error) {
      busy?.close?.();
      notify(error.message, 'error');
    }
  }

  async function saveClientEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.client_id.value;
    const vehicles = $$('[data-edit-vehicle]', form).map(section => ({
      id: section.dataset.editVehicle,
      plate: $('[name="plate"]', section).value,
      brand: nullableText($('[name="brand"]', section).value),
      model: $('[name="model"]', section).value,
      description: nullableText($('[name="description"]', section).value),
      year: nullableNumber($('[name="year"]', section).value),
      current_mileage: nullableNumber($('[name="current_mileage"]', section).value),
    }));
    const payload = {
      full_name: form.elements.full_name.value,
      phone: form.elements.phone.value,
      vehicles,
    };
    const busy = notify('Guardando datos…', 'loading');
    try {
      await api(`/api/admin/clients/${id}/profile`, { method: 'PUT', body: JSON.stringify(payload) });
      busy?.close?.();
      $('#client-edit-dialog').close();
      const search = $('#client-search');
      if (search?.value.trim()) $('#search-clients')?.click();
      notify('Datos del cliente actualizados correctamente.', 'success');
    } catch (error) {
      busy?.close?.();
      $('#client-edit-error').textContent = error.message;
      notify(error.message, 'error');
    }
  }

  function selectedServiceIndex() {
    const selected = $('[data-service-select]:checked');
    return selected ? Number(selected.value) : null;
  }

  function updateServiceActionState() {
    const selected = selectedServiceIndex();
    const correct = $('#correct-selected-service');
    const remove = $('#delete-selected-service');
    if (correct) correct.disabled = selected === null;
    if (remove) remove.disabled = selected === null;
    $$('[data-service-record]').forEach(row => row.classList.toggle('is-selected', Number(row.dataset.serviceRecord) === selected));
  }

  function convertServiceHistory() {
    const history = $('#admin-service-history');
    if (!history || history.dataset.selectionReady === '1') return;
    const oldButtons = $$('[data-cs]', history);
    if (!oldButtons.length) {
      if (history.querySelector('h2') && !history.querySelector('.service-entry')) {
        history.insertAdjacentHTML('beforeend', '<p class="muted">Sin servicios registrados.</p>');
        history.dataset.selectionReady = '1';
      }
      return;
    }
    oldButtons.forEach(button => {
      const row = button.closest('.service-entry');
      const index = button.dataset.cs;
      if (!row) return;
      row.dataset.serviceRecord = index;
      button.replaceWith(Object.assign(document.createElement('input'), {
        type: 'checkbox',
        value: index,
        className: 'record-select service-record-select',
      }));
      row.querySelector('input').setAttribute('data-service-select', '');
      row.querySelector('input').setAttribute('aria-label', `Seleccionar servicio ${Number(index) + 1}`);
    });
    history.insertAdjacentHTML('afterbegin', `
      <div class="service-history-actions">
        <span>Seleccioná un servicio</span>
        <div class="selection-actions">
          <button class="btn" id="correct-selected-service" type="button" disabled>Corregir</button>
          <button class="btn danger" id="delete-selected-service" type="button" disabled>Eliminar</button>
        </div>
      </div>`);
    history.dataset.selectionReady = '1';
    updateServiceActionState();
  }

  async function currentVehicleData() {
    const vehicleId = $('#service-vehicle-id')?.value;
    if (!vehicleId) throw new Error('No hay un vehículo seleccionado');
    return api(`/api/admin/vehicles/${vehicleId}`);
  }

  async function correctSelectedService() {
    const index = selectedServiceIndex();
    if (index === null) return;
    try {
      const data = await currentVehicleData();
      const service = data.services[index];
      if (!service) throw new Error('Servicio no encontrado');
      const form = $('#service-form');
      $('#service-id').value = service.id;
      FIELDS.forEach(field => {
        if (form.elements[field]) form.elements[field].value = service[field] ?? '';
      });
      $('#save-service').textContent = 'Guardar';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function deleteSelectedService() {
    const index = selectedServiceIndex();
    if (index === null) return;
    let data;
    try { data = await currentVehicleData(); } catch (error) { notify(error.message, 'error'); return; }
    const service = data.services[index];
    if (!service) { notify('Servicio no encontrado', 'error'); return; }
    const ok = await confirmAction({
      title: 'Eliminar servicio',
      message: 'Se eliminará el servicio seleccionado del historial. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar servicio',
      danger: true,
    });
    if (!ok) return;
    const busy = notify('Eliminando servicio…', 'loading');
    try {
      await api(`/api/admin/services/${service.id}`, { method: 'DELETE' });
      busy?.close?.();
      const vehicleId = $('#service-vehicle-id').value;
      const refreshed = await api(`/api/admin/vehicles/${vehicleId}`);
      const last = refreshed.services[0];
      $('#service-preloaded').innerHTML = `<div><small>Cliente</small><strong>${esc(refreshed.vehicle.client_name)}</strong></div><div><small>Patente</small><strong>${esc(refreshed.vehicle.plate)}</strong></div><div><small>Vehículo</small><strong>${esc(refreshed.vehicle.model)}</strong></div><div><small>Último servicio</small><strong>${last ? `${new Intl.DateTimeFormat('es-AR').format(new Date(`${last.service_date}T00:00:00`))} · ${Number(last.mileage).toLocaleString('es-AR')} km` : 'Sin servicios'}</strong></div>`;
      const history = $('#admin-service-history');
      history.dataset.selectionReady = '';
      history.innerHTML = '<h2>Historial</h2>' + refreshed.services.map((item, i) => `<div class="service-entry"><strong>${new Intl.DateTimeFormat('es-AR').format(new Date(`${item.service_date}T00:00:00`))} · ${Number(item.mileage).toLocaleString('es-AR')} km</strong> <button class="btn" data-cs="${i}">Corregir</button></div>`).join('');
      convertServiceHistory();
      $('#service-id').value = '';
      notify('Servicio eliminado correctamente.', 'success');
    } catch (error) {
      busy?.close?.();
      notify(error.message, 'error');
    }
  }

  function init() {
    ensureClientEditUi();

    document.addEventListener('click', event => {
      if (event.target.closest('#edit-selected-client')) openClientEdit();
      if (event.target.closest('#close-client-edit') || event.target.closest('#cancel-client-edit')) $('#client-edit-dialog')?.close();
      if (event.target.closest('#correct-selected-service')) correctSelectedService();
      if (event.target.closest('#delete-selected-service')) deleteSelectedService();
    });

    document.addEventListener('change', event => {
      if (event.target.matches('[data-service-select]')) {
        $$('[data-service-select]').forEach(input => { if (input !== event.target) input.checked = false; });
        updateServiceActionState();
      }
    });

    $('#client-edit-form')?.addEventListener('submit', saveClientEdit);

    const history = $('#admin-service-history');
    if (history) {
      new MutationObserver(() => {
        if (!history.querySelector('[data-cs]')) return;
        history.dataset.selectionReady = '';
        queueMicrotask(convertServiceHistory);
      }).observe(history, { childList: true, subtree: false });
      convertServiceHistory();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
