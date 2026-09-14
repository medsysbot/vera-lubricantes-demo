(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const FIELDS = ['service_date','mileage','next_change_km','oil','oil_type','oil_filter','fuel_filter','air_filter','cabin_filter','spark_plugs','gearbox_oil','differential_oil','grease','hydraulic_fluid','coolant','brake_fluid','tire_control','tire_rotation','battery','observations'];
  const SERVICE_LABELS = {
    service_date: 'Fecha',
    mileage: 'Kilómetros',
    next_change_km: 'Próximo cambio km',
    oil: 'Aceite',
    oil_type: 'Tipo de aceite',
    oil_filter: 'Filtro de aceite',
    fuel_filter: 'Filtro de combustible',
    air_filter: 'Filtro de aire',
    cabin_filter: 'Filtro de cabina',
    spark_plugs: 'Bujías',
    gearbox_oil: 'Aceite caja de vel.',
    differential_oil: 'Aceite diferencial',
    grease: 'Engrase',
    hydraulic_fluid: 'Líquido hidráulico',
    coolant: 'Líquido refrigerante',
    brake_fluid: 'Líquido de freno',
    tire_control: 'Control de neumáticos',
    tire_rotation: 'Rotación de neumáticos',
    battery: 'Batería',
    observations: 'Observaciones',
  };

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
  const displayValue = value => value == null || String(value).trim() === '' ? '—' : String(value);

  function notify(message, type = 'success', options = {}) {
    return window.VeraUI?.notify ? window.VeraUI.notify(message, type, options) : null;
  }

  async function confirmAction(options) {
    if (window.VeraUI?.confirmAction) return window.VeraUI.confirmAction(options);
    return window.confirm(options.message || options.title || 'Confirmar');
  }

  function ensureEditStyles() {
    if ($('#admin-edit-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-edit-styles';
    style.textContent = `
      #client-action-bar .selection-actions{
        flex-wrap:nowrap;
        overflow-x:auto;
        max-width:100%;
        padding-bottom:2px;
      }
      #client-action-bar .selection-actions .btn{
        flex:0 0 auto;
        white-space:nowrap;
        min-height:38px;
        padding:0 10px;
        font-size:.69rem;
      }
      .service-history-actions{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin:0 0 10px;
        padding:12px 0;
        border-bottom:1px solid rgba(137,159,180,.12);
      }
      .service-history-actions>span{color:var(--muted);font-size:.78rem}
      .service-history-actions .selection-actions{flex-wrap:nowrap}
      .service-entry.is-selected{background:rgba(217,162,76,.06)}
      .service-record-select{flex:0 0 auto}
      .service-detail-dialog{width:min(94vw,760px)}
      .service-detail-head{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:10px;
        margin:12px 0 18px;
      }
      .service-detail-head div,
      .service-detail-item{
        padding:12px 13px;
        border:1px solid rgba(137,159,180,.18);
        border-radius:10px;
        background:rgba(255,255,255,.025);
      }
      .service-detail-head small,
      .service-detail-item small{
        display:block;
        margin-bottom:5px;
        color:var(--muted);
        font-size:.68rem;
      }
      .service-detail-head strong,
      .service-detail-item strong{
        color:var(--text);
        font-size:.82rem;
        line-height:1.45;
        word-break:break-word;
      }
      .service-detail-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
      }
      .service-detail-item.wide{grid-column:1/-1}
      @media(max-width:860px){
        #client-action-bar .selection-actions{width:100%}
      }
      @media(max-width:560px){
        #client-action-bar .selection-actions .btn{flex:0 0 auto}
        .service-history-actions{align-items:flex-start;flex-direction:column}
        .service-history-actions .selection-actions{width:100%;overflow-x:auto}
        .service-history-actions .selection-actions .btn{flex:0 0 auto;white-space:nowrap}
        .service-detail-head,.service-detail-grid{grid-template-columns:1fr}
        .service-detail-item.wide{grid-column:auto}
      }
    `;
    document.head.appendChild(style);
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

  function ensureServiceViewUi() {
    if ($('#service-detail-dialog')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="service-detail-dialog" class="qr-dialog service-detail-dialog">
        <button class="dialog-close" id="close-service-detail" type="button">×</button>
        <p class="eyebrow">Historial</p>
        <h2>Detalle completo del servicio</h2>
        <div id="service-detail-content"></div>
        <div class="form-actions form-actions-end">
          <button class="btn" id="close-service-detail-bottom" type="button">Cerrar</button>
        </div>
      </dialog>`);
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
    const view = $('#view-selected-service');
    const correct = $('#correct-selected-service');
    const remove = $('#delete-selected-service');
    if (view) view.disabled = selected === null;
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
          <button class="btn" id="view-selected-service" type="button" disabled>Ver</button>
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

  function formatServiceValue(field, value) {
    if (field === 'service_date') {
      if (!value) return '—';
      return new Intl.DateTimeFormat('es-AR').format(new Date(`${value}T00:00:00`));
    }
    if (field === 'mileage' || field === 'next_change_km') {
      if (value == null || value === '') return '—';
      return `${Number(value).toLocaleString('es-AR')} km`;
    }
    return displayValue(value);
  }

  async function viewSelectedService() {
    const index = selectedServiceIndex();
    if (index === null) return;
    const busy = notify('Cargando servicio…', 'loading');
    try {
      const data = await currentVehicleData();
      const service = data.services[index];
      if (!service) throw new Error('Servicio no encontrado');
      busy?.close?.();
      const vehicleName = [data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' ') || data.vehicle.model || '—';
      $('#service-detail-content').innerHTML = `
        <div class="service-detail-head">
          <div><small>Cliente</small><strong>${esc(displayValue(data.vehicle.client_name))}</strong></div>
          <div><small>Patente</small><strong>${esc(displayValue(data.vehicle.plate))}</strong></div>
          <div><small>Vehículo</small><strong>${esc(displayValue(vehicleName))}</strong></div>
        </div>
        <div class="service-detail-grid">
          ${FIELDS.map(field => `<div class="service-detail-item${field === 'observations' ? ' wide' : ''}"><small>${esc(SERVICE_LABELS[field] || field)}</small><strong>${esc(formatServiceValue(field, service[field]))}</strong></div>`).join('')}
        </div>`;
      $('#service-detail-dialog').showModal();
    } catch (error) {
      busy?.close?.();
      notify(error.message, 'error');
    }
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
    ensureEditStyles();
    ensureClientEditUi();
    ensureServiceViewUi();

    document.addEventListener('click', event => {
      if (event.target.closest('#edit-selected-client')) openClientEdit();
      if (event.target.closest('#close-client-edit') || event.target.closest('#cancel-client-edit')) $('#client-edit-dialog')?.close();
      if (event.target.closest('#view-selected-service')) viewSelectedService();
      if (event.target.closest('#close-service-detail') || event.target.closest('#close-service-detail-bottom')) $('#service-detail-dialog')?.close();
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
