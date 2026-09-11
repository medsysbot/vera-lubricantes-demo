const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const UI = window.VeraUI;
const icon = (name, cls = '') => UI?.icon(name, cls) || '';

const state = {
  admin: null,
  clients: [],
  vehicles: [],
  serviceVehicle: null,
  services: [],
  qrUrl: ''
};

const F = [
  'service_date','mileage','next_change_km','oil','oil_type','oil_filter','fuel_filter',
  'air_filter','cabin_filter','spark_plugs','gearbox_oil','differential_oil','grease',
  'hydraulic_fluid','coolant','brake_fluid','tire_control','tire_rotation','battery','observations'
];

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try { message = (await response.json()).detail || message; } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
})[c]);
const dt = value => value ? new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '—';
const d = value => value ? new Intl.DateTimeFormat('es-AR').format(new Date(`${value}T00:00:00`)) : '—';
const km = value => value == null ? '—' : `${Number(value).toLocaleString('es-AR')} km`;
const n = value => String(value ?? '').trim() === '' ? null : Number(value);
const t = value => String(value ?? '').trim() || null;

function initials(name) {
  return String(name || 'V').split(/\s+/).filter(Boolean).slice(0,2).map(p => p[0]).join('').toUpperCase();
}

function loginView() {
  $('#admin-login').classList.remove('hidden');
  $('#admin-app').classList.add('hidden');
}

function appView() {
  $('#admin-login').classList.add('hidden');
  $('#admin-app').classList.remove('hidden');
  $('#admin-name').textContent = state.admin.display_name;
  go('dashboard');
}

async function boot() {
  try {
    state.admin = await api('/api/admin/me');
    appView();
  } catch {
    loginView();
  }
}

$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#admin-login-error').textContent = '';
  const button = event.submitter;
  UI.setBusy(button, true, 'Ingresando...');
  try {
    state.admin = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#admin-username').value,
        password: $('#admin-password').value
      })
    });
    UI.notify('Acceso administrativo iniciado correctamente.', 'success');
    appView();
  } catch (error) {
    $('#admin-login-error').textContent = error.message;
    UI.notify(error.message, 'error', { title: 'No se pudo iniciar sesión' });
  } finally {
    UI.setBusy(button, false);
  }
});

$('#admin-logout').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
  loginView();
});

async function go(name) {
  $$('[data-admin-view]').forEach(view => view.classList.toggle('active', view.dataset.adminView === name));
  $$('.admin-nav [data-admin-go]').forEach(button => button.classList.toggle('active', button.dataset.adminGo === name));
  try {
    if (name === 'dashboard') await dashboard();
    if (name === 'clients') await clients();
    if (name === 'vehicles') await vehicles();
    if (name === 'promotions') await promotions();
    if (name === 'messages') await messages();
    if (name === 'reminders') await reminders();
  } catch (error) {
    if (error.status === 401) loginView();
    else UI.notify(error.message, 'error');
  }
  window.scrollTo({ top: 0 });
  UI.decorateIcons(document);
}

async function dashboard(clientSearch = '') {
  const loading = UI.notify('Actualizando resumen administrativo...', 'loading');
  try {
    const [summary, clientList, promoList] = await Promise.all([
      api('/api/admin/dashboard'),
      api(`/api/admin/clients?search=${encodeURIComponent(clientSearch)}`),
      api('/api/admin/promotions')
    ]);

    const counts = summary.counts;
    const kpis = [
      ['users', 'Clientes activos', counts.clients],
      ['car', 'Vehículos activos', counts.vehicles],
      ['wrench', 'Servicios del mes', counts.services_month],
      ['bell', 'Recordatorios', counts.reminders]
    ];

    $('#dashboard-kpis').innerHTML = kpis.map(([iconName, label, value]) => `
      <article class="kpi-card glass-card">
        <span class="kpi-icon">${icon(iconName)}</span>
        <span class="kpi-copy"><strong>${value}</strong><span>${esc(label)}</span></span>
        <span class="kpi-chevron">${icon('chevron-right')}</span>
        <span class="kpi-foot"><span>Datos actuales</span><span class="kpi-line"></span></span>
      </article>`).join('');

    state.clients = clientList;
    $('#dashboard-client-list').innerHTML = clientList.slice(0,5).map(client => `
      <button class="dashboard-client-row" type="button" data-dashboard-client="${client.id}">
        <span class="client-initial">${esc(initials(client.full_name))}</span>
        <span><strong>${esc(client.full_name)}</strong><small>${esc(client.phone)} · ${client.vehicles.length} vehículo(s)</small></span>
        <span class="row-arrow">${icon('chevron-right')}</span>
      </button>`).join('') || '<div class="notice">No se encontraron clientes.</div>';

    $('#dashboard-promotions').innerHTML = promoList.slice(0,5).map(promo => `
      <div class="promotion-row">
        <strong>${esc(promo.title)}</strong>
        <span>${esc(promo.criterion_value)}</span>
        <span>${promo.recipients} destinatario(s)</span>
        <span class="promotion-state">Publicada</span>
      </div>`).join('') || '<div class="notice">Todavía no hay promociones publicadas.</div>';

    $('#activity-body').innerHTML = summary.activity.map(item => `
      <tr><td>${dt(item.created_at)}</td><td>${esc(item.action_type)}</td><td>${esc(item.description)}</td><td>${esc(item.reference || '—')}</td></tr>`
    ).join('') || '<tr><td colspan="4">Sin actividad</td></tr>';
  } finally {
    loading.close();
    UI.decorateIcons(document);
  }
}

$('#dashboard-client-search-btn').addEventListener('click', () => dashboard($('#dashboard-client-search').value));
$('#dashboard-client-search').addEventListener('keydown', event => {
  if (event.key === 'Enter') dashboard(event.target.value);
});
$('#dashboard-service-go').addEventListener('click', async () => {
  const value = $('#dashboard-service-search').value.trim();
  go('services');
  $('#service-search').value = value;
  if (value) $('#search-service-vehicle').click();
});

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-admin-go]');
  if (nav) {
    go(nav.dataset.adminGo);
    return;
  }

  const dashClient = event.target.closest('[data-dashboard-client]');
  if (dashClient) {
    go('clients');
    const client = state.clients.find(item => item.id === dashClient.dataset.dashboardClient);
    if (client) {
      $('#client-search').value = client.full_name;
      clients(client.full_name);
    }
    return;
  }

  const clientAction = event.target.closest('[data-ca]');
  if (clientAction) {
    const id = clientAction.dataset.id;
    const action = clientAction.dataset.ca;
    if (action === 'add') {
      $('#add-vehicle-client-id').value = id;
      $('#vehicle-dialog').showModal();
    } else if (action === 'delete') {
      const confirmed = await UI.confirmAction({
        title: 'Eliminar cliente',
        message: 'Se eliminará completamente el cliente, sus vehículos y sus datos dependientes. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar cliente',
        danger: true
      });
      if (!confirmed) return;
      const loading = UI.notify('Eliminando cliente...', 'loading');
      try {
        await api(`/api/admin/clients/${id}`, { method: 'DELETE' });
        UI.notify('Cliente eliminado correctamente.', 'success');
        await clients();
      } catch (error) {
        UI.notify(error.message, 'error');
      } finally {
        loading.close();
      }
    } else {
      await qr(id, action);
    }
    return;
  }

  const openService = event.target.closest('[data-os]');
  if (openService) {
    go('services');
    await serviceVehicle(openService.dataset.os);
    return;
  }

  const selectServiceVehicle = event.target.closest('[data-sv]');
  if (selectServiceVehicle) {
    await serviceVehicle(selectServiceVehicle.dataset.sv);
    return;
  }

  const deleteVehicle = event.target.closest('[data-dv]');
  if (deleteVehicle) {
    const confirmed = await UI.confirmAction({
      title: 'Eliminar vehículo',
      message: 'Se eliminará el vehículo y todo su historial de servicios. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar vehículo',
      danger: true
    });
    if (!confirmed) return;
    const loading = UI.notify('Eliminando vehículo...', 'loading');
    try {
      await api(`/api/admin/vehicles/${deleteVehicle.dataset.dv}`, { method: 'DELETE' });
      UI.notify('Vehículo eliminado correctamente.', 'success');
      await vehicles();
    } catch (error) {
      UI.notify(error.message, 'error');
    } finally {
      loading.close();
    }
    return;
  }

  const correctionButton = event.target.closest('[data-cs]');
  if (correctionButton) correction(Number(correctionButton.dataset.cs));
});

async function clients(query = '') {
  state.clients = await api(`/api/admin/clients?search=${encodeURIComponent(query)}`);
  $('#client-results').innerHTML = state.clients.map(client => `
    <article class="record-card glass-card">
      <div class="record-head">
        <div><h3>${icon('user')} ${esc(client.full_name)}</h3><p>${esc(client.phone)}</p></div>
        <span>${client.vehicles.length} vehículo(s)</span>
      </div>
      ${client.vehicles.map(vehicle => `<p>${icon('car')} <strong>${esc(vehicle.plate)}</strong> · ${esc([vehicle.brand, vehicle.model].filter(Boolean).join(' '))}</p>`).join('')}
      <div class="record-actions">
        <button class="btn" data-ca="add" data-id="${client.id}">${icon('user-plus')} Agregar vehículo</button>
        <button class="btn" data-ca="activation" data-id="${client.id}">${icon('qrcode')} QR activación</button>
        <button class="btn" data-ca="pin_reset" data-id="${client.id}">${icon('key')} Restablecer PIN</button>
        <button class="btn" data-ca="relink" data-id="${client.id}">${icon('rotate')} Revincular VERA</button>
        <button class="btn danger" data-ca="delete" data-id="${client.id}">${icon('trash-can')} Eliminar cliente</button>
      </div>
    </article>`).join('') || '<div class="notice">No se encontraron clientes.</div>';
}

$('#toggle-new-client').onclick = () => $('#new-client-form').classList.toggle('hidden');
$('#search-clients').onclick = () => clients($('#client-search').value);

$('#new-client-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const form = new FormData(event.target);
  const payload = {
    full_name: form.get('full_name'),
    phone: form.get('phone'),
    vehicle: {
      plate: form.get('plate'),
      brand: t(form.get('brand')),
      model: form.get('model'),
      description: t(form.get('description')),
      year: n(form.get('year')),
      current_mileage: n(form.get('current_mileage'))
    }
  };
  $('#new-client-error').textContent = '';
  UI.setBusy(button, true, 'Guardando...');
  try {
    const result = await api('/api/admin/clients', { method: 'POST', body: JSON.stringify(payload) });
    event.target.reset();
    event.target.classList.add('hidden');
    UI.notify('Cliente y vehículo registrados correctamente.', 'success');
    await clients();
    await qr(result.client.id, 'activation');
  } catch (error) {
    $('#new-client-error').textContent = error.message;
    UI.notify(error.message, 'error', { title: 'No se pudo guardar el cliente' });
  } finally {
    UI.setBusy(button, false);
  }
});

async function qr(id, purpose) {
  const loading = UI.notify('Generando QR temporal...', 'loading');
  try {
    const result = await api(`/api/admin/clients/${id}/access/qr`, {
      method: 'POST',
      body: JSON.stringify({ purpose })
    });
    state.qrUrl = result.url;
    $('#qr-title').textContent = result.client_name;
    $('#qr-image').src = result.qr;
    $('#qr-expiry').textContent = `Válido hasta ${dt(result.expires_at)}`;
    $('#qr-dialog').showModal();
  } catch (error) {
    UI.notify(error.message, 'error', { title: 'No se pudo generar el QR' });
  } finally {
    loading.close();
  }
}

$('#close-qr').onclick = () => $('#qr-dialog').close();
$('#copy-qr-link').onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.qrUrl);
    UI.notify('Enlace temporal copiado.', 'success');
  } catch {
    UI.notify('No se pudo copiar el enlace.', 'error');
  }
};
$('#close-vehicle-dialog').onclick = () => $('#vehicle-dialog').close();

$('#add-vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const form = new FormData(event.target);
  const payload = {
    plate: form.get('plate'),
    brand: t(form.get('brand')),
    model: form.get('model'),
    description: t(form.get('description')),
    year: n(form.get('year')),
    current_mileage: n(form.get('current_mileage'))
  };
  UI.setBusy(button, true, 'Guardando...');
  try {
    await api(`/api/admin/clients/${$('#add-vehicle-client-id').value}/vehicles`, {
      method: 'POST', body: JSON.stringify(payload)
    });
    event.target.reset();
    $('#vehicle-dialog').close();
    UI.notify('Vehículo agregado correctamente.', 'success');
    await clients();
  } catch (error) {
    $('#add-vehicle-error').textContent = error.message;
    UI.notify(error.message, 'error');
  } finally {
    UI.setBusy(button, false);
  }
});

async function vehicles(query = '') {
  state.vehicles = await api(`/api/admin/vehicles?search=${encodeURIComponent(query)}`);
  renderVehicles('#vehicle-results', false);
}

function renderVehicles(selector, serviceMode) {
  $(selector).innerHTML = state.vehicles.map(vehicle => `
    <article class="record-card glass-card">
      <div class="record-head">
        <div><h3>${icon('car')} ${esc(vehicle.plate)} · ${esc([vehicle.brand, vehicle.model].filter(Boolean).join(' '))}</h3><p>${esc(vehicle.client_name)} · ${esc(vehicle.phone)}</p></div>
        <strong>${km(vehicle.current_mileage)}</strong>
      </div>
      <p>Último servicio: ${d(vehicle.last_service_date)}</p>
      <div class="record-actions">
        ${serviceMode
          ? `<button class="btn primary" data-sv="${vehicle.id}">${icon('wrench')} Seleccionar</button>`
          : `<button class="btn" data-os="${vehicle.id}">${icon('wrench')} Nuevo servicio / historial</button><button class="btn danger" data-dv="${vehicle.id}">${icon('trash-can')} Eliminar vehículo</button>`}
      </div>
    </article>`).join('') || '<div class="notice">No se encontraron vehículos.</div>';
}

$('#search-vehicles').onclick = () => vehicles($('#vehicle-search').value);
$('#search-service-vehicle').onclick = async event => {
  UI.setBusy(event.currentTarget, true, 'Buscando...');
  try {
    state.vehicles = await api(`/api/admin/vehicles?search=${encodeURIComponent($('#service-search').value)}`);
    renderVehicles('#service-search-results', true);
  } catch (error) {
    UI.notify(error.message, 'error');
  } finally {
    UI.setBusy(event.currentTarget, false);
  }
};

async function serviceVehicle(id) {
  const loading = UI.notify('Cargando datos del vehículo...', 'loading');
  try {
    const result = await api(`/api/admin/vehicles/${id}`);
    state.serviceVehicle = result.vehicle;
    state.services = result.services;
    const form = $('#service-form');
    form.reset();
    $('#service-vehicle-id').value = id;
    $('#service-id').value = '';
    form.elements.service_date.value = new Date().toISOString().slice(0, 10);
    form.elements.mileage.value = state.serviceVehicle.current_mileage ?? '';
    const latest = state.services[0];
    if (latest) {
      form.elements.next_change_km.value = latest.next_change_km ?? '';
      form.elements.oil.value = latest.oil ?? '';
      form.elements.oil_type.value = latest.oil_type ?? '';
    }
    $('#service-preloaded').innerHTML = `
      <div><small>Cliente</small><strong>${esc(state.serviceVehicle.client_name)}</strong></div>
      <div><small>Patente</small><strong>${esc(state.serviceVehicle.plate)}</strong></div>
      <div><small>Vehículo</small><strong>${esc(state.serviceVehicle.model)}</strong></div>
      <div><small>Último servicio</small><strong>${latest ? `${d(latest.service_date)} · ${km(latest.mileage)}` : 'Sin servicios'}</strong></div>`;
    $('#admin-service-history').innerHTML = '<h2>Historial</h2>' + state.services.map((service, index) => `
      <div class="service-entry"><strong>${d(service.service_date)} · ${km(service.mileage)}</strong><button class="btn" data-cs="${index}">${icon('pen-to-square')} Corregir</button></div>`).join('');
    $('#service-editor').classList.remove('hidden');
  } catch (error) {
    UI.notify(error.message, 'error');
  } finally {
    loading.close();
  }
}

function correction(index) {
  const service = state.services[index];
  const form = $('#service-form');
  $('#service-id').value = service.id;
  F.forEach(key => { if (form.elements[key]) form.elements[key].value = service[key] ?? ''; });
  $('#save-service').innerHTML = `${icon('floppy-disk')} Guardar corrección`;
  UI.notify('Servicio cargado para corrección.', 'info');
}

$('#cancel-service').onclick = () => $('#service-editor').classList.add('hidden');
$('#service-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const form = new FormData(event.target);
  const payload = {};
  F.forEach(key => payload[key] = ['mileage','next_change_km'].includes(key) ? n(form.get(key)) : t(form.get(key)));
  payload.service_date = form.get('service_date');
  const serviceId = $('#service-id').value;
  const vehicleId = $('#service-vehicle-id').value;
  UI.setBusy(button, true, serviceId ? 'Corrigiendo...' : 'Guardando...');
  try {
    await api(serviceId ? `/api/admin/services/${serviceId}` : `/api/admin/vehicles/${vehicleId}/services`, {
      method: serviceId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    UI.notify(serviceId ? 'Corrección guardada correctamente.' : 'Servicio registrado correctamente.', 'success');
    $('#save-service').innerHTML = `${icon('floppy-disk')} Guardar servicio`;
    await serviceVehicle(vehicleId);
  } catch (error) {
    $('#service-error').textContent = error.message;
    UI.notify(error.message, 'error', { title: 'No se pudo guardar el servicio' });
  } finally {
    UI.setBusy(button, false);
  }
});

function promotionPayload() {
  const form = new FormData($('#promotion-form'));
  const [source, field] = String(form.get('criterion')).split(':');
  return {
    title: form.get('title'),
    detail: form.get('detail'),
    criterion_source: source,
    criterion_field: field,
    criterion_value: form.get('criterion_value')
  };
}

$('#preview-promotion').onclick = async event => {
  UI.setBusy(event.currentTarget, true, 'Calculando...');
  try {
    const result = await api('/api/admin/promotions/preview', {
      method: 'POST', body: JSON.stringify(promotionPayload())
    });
    $('#promotion-preview').innerHTML = `<div class="audience-number">${result.count}</div><p>clientes únicos coincidentes</p>`;
    UI.notify(`Audiencia calculada: ${result.count} cliente(s).`, 'info');
  } catch (error) {
    UI.notify(error.message, 'error');
  } finally {
    UI.setBusy(event.currentTarget, false);
  }
};

$('#promotion-form').addEventListener('submit', async event => {
  event.preventDefault();
  const confirmed = await UI.confirmAction({
    title: 'Publicar promoción',
    message: 'La promoción se publicará inmediatamente para la audiencia calculada con los registros reales.',
    confirmText: 'Publicar promoción'
  });
  if (!confirmed) return;
  const button = event.submitter;
  UI.setBusy(button, true, 'Publicando...');
  try {
    const result = await api('/api/admin/promotions', {
      method: 'POST', body: JSON.stringify(promotionPayload())
    });
    UI.notify(`Promoción publicada para ${result.recipients} cliente(s).`, 'success');
    event.target.reset();
    await promotions();
  } catch (error) {
    $('#promotion-error').textContent = error.message;
    UI.notify(error.message, 'error', { title: 'No se pudo publicar' });
  } finally {
    UI.setBusy(button, false);
  }
});

async function promotions() {
  const list = await api('/api/admin/promotions');
  $('#published-promotions').innerHTML = list.map(promo => `
    <div class="promotion-row"><strong>${esc(promo.title)}</strong><span>${esc(promo.criterion_field)} = ${esc(promo.criterion_value)}</span><span>${promo.recipients} destinatario(s)</span><span class="promotion-state">Publicada</span></div>`
  ).join('') || '<p>Sin promociones publicadas.</p>';
}

async function messages() {
  const list = await api('/api/admin/messages');
  $('#admin-messages').innerHTML = list.map(message => `
    <tr><td>${dt(message.created_at)}</td><td>${esc(message.client_name)}</td><td>${esc(message.message_type)}</td><td>${esc(message.title)}</td><td>${message.is_read ? 'Leído' : 'No leído'}</td></tr>`
  ).join('') || '<tr><td colspan="5">Sin mensajes.</td></tr>';
}

async function reminders() {
  const list = await api('/api/admin/reminders');
  $('#admin-reminders').innerHTML = list.map(reminder => `
    <tr><td>${esc(reminder.client_name)}</td><td>${esc(reminder.plate)} · ${esc(reminder.model)}</td><td>${d(reminder.due_date)}</td><td>${dt(reminder.notify_at)}</td><td>${esc(reminder.status)}</td></tr>`
  ).join('') || '<tr><td colspan="5">No hay recordatorios programados.</td></tr>';
}

boot();
