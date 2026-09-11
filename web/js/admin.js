(() => {
  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  async function start() {
    await loadScript('/js/fa-solid-icons.js');
    await loadScript('/js/vera-ui.js');

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const UI = window.VeraUI;
    const icon = UI.icon;
    const state = {
      admin: null,
      clients: [],
      vehicles: [],
      serviceVehicle: null,
      services: [],
      qrUrl: '',
      selectedClientId: null,
      selectedVehicleId: null,
      promotionPreviewSignature: null,
      promotionPreviewCount: null,
    };
    const F = ['service_date','mileage','next_change_km','oil','oil_type','oil_filter','fuel_filter','air_filter','cabin_filter','spark_plugs','gearbox_oil','differential_oil','grease','hydraulic_fluid','coolant','brake_fluid','tire_control','tire_rotation','battery','observations'];

    async function api(u, o = {}) {
      const r = await fetch(u, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(o.headers || {}) }, ...o });
      if (!r.ok) {
        let m = `Error ${r.status}`;
        try { m = (await r.json()).detail || m; } catch {}
        const e = new Error(m); e.status = r.status; throw e;
      }
      return r.status === 204 ? null : r.json();
    }

    const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    const dt = v => v ? new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)) : '—';
    const dateOnly = v => v ? new Intl.DateTimeFormat('es-AR').format(new Date(v)) : '—';
    const d = v => v ? new Intl.DateTimeFormat('es-AR').format(new Date(`${v}T00:00:00`)) : '—';
    const km = v => v == null ? '—' : `${Number(v).toLocaleString('es-AR')} km`;
    const n = v => String(v ?? '').trim() === '' ? null : Number(v);
    const t = v => String(v ?? '').trim() || null;

    function promotionAudienceSignature() {
      const f = new FormData($('#promotion-form'));
      return JSON.stringify({ audience_scope: f.get('audience_scope'), criterion_value: String(f.get('criterion_value') || '').trim() });
    }

    function invalidatePromotionPreview() {
      state.promotionPreviewSignature = null;
      state.promotionPreviewCount = null;
      $('#promotion-preview').innerHTML = '<p class="muted">Calculá la audiencia antes de publicar.</p>';
    }

    function setPromotionScope(scope, invalidate = true) {
      const form = $('#promotion-form');
      form.elements.audience_scope.value = scope;
      $$('[data-promotion-scope]', form).forEach(button => button.classList.toggle('primary', button.dataset.promotionScope === scope));
      if (invalidate) invalidatePromotionPreview();
    }

    function setupPromotionForm() {
      const form = $('#promotion-form');
      const criterion = form.elements.criterion;
      const criterionLabel = criterion?.closest('label');
      if (criterionLabel) {
        criterionLabel.innerHTML = '<span>Destino</span><div class="form-actions"><button class="btn primary" type="button" data-promotion-scope="history">Automático según historial</button><button class="btn" type="button" data-promotion-scope="all">Todos los clientes</button></div><input type="hidden" name="audience_scope" value="history">';
      }
      form.addEventListener('input', e => {
        if (e.target.name === 'criterion_value') invalidatePromotionPreview();
      });
      form.addEventListener('click', e => {
        const button = e.target.closest('[data-promotion-scope]');
        if (button) setPromotionScope(button.dataset.promotionScope);
      });
    }

    function selectedPromotionIds() {
      return $$('[data-promotion-select]:checked', $('#published-promotions')).map(input => input.value);
    }

    function updatePromotionDeleteButton() {
      const button = $('#delete-promotions');
      if (!button) return;
      const count = selectedPromotionIds().length;
      button.disabled = count === 0;
      button.innerHTML = `${icon('trash-can')} Eliminar promociones${count ? ` (${count})` : ''}`;
      const label = $('#promotion-selection-count');
      if (label) label.textContent = `${count} promoción${count === 1 ? '' : 'es'} seleccionada${count === 1 ? '' : 's'}`;
    }

    function decorateStaticIcons() {
      const nav = { dashboard:'house', clients:'users', vehicles:'car', services:'wrench', promotions:'tags', messages:'comments', reminders:'bell' };
      $$('.admin-nav [data-admin-go]').forEach(b => {
        if (!b.querySelector('.nav-icon')) b.insertAdjacentHTML('afterbegin', `<span class="nav-icon">${icon(nav[b.dataset.adminGo])}</span>`);
      });
      const dashboardIcons = { 'new-client':'user-plus', 'new-service':'wrench', 'new-promotion':'tags' };
      $$('[data-dashboard-action]').forEach(b => {
        const holder = b.querySelector('.action-icon');
        const arrow = b.querySelector('.action-arrow');
        if (holder) holder.innerHTML = icon(dashboardIcons[b.dataset.dashboardAction] || 'circle-info');
        if (arrow) arrow.innerHTML = icon('arrow-right');
      });
      $$('.search-icon').forEach(x => x.innerHTML = icon('magnifying-glass'));
      const directIcons = [
        ['#dashboard-search-client','magnifying-glass'],['#toggle-new-client','user-plus'],['#search-clients','magnifying-glass'],
        ['#search-vehicles','magnifying-glass'],['#search-service-vehicle','magnifying-glass'],['#new-promotion','plus'],
        ['#preview-promotion','tags'],['#copy-qr-link','copy'],['#selected-vehicle-service','wrench'],['#selected-vehicle-delete','trash-can'],
      ];
      directIcons.forEach(([selector,name]) => {
        const b = $(selector); if (b && !b.querySelector('.fa-svg')) b.insertAdjacentHTML('afterbegin', icon(name));
      });
      const clientActionIcons = { add:'car', activation:'qrcode', pin_reset:'key', relink:'rotate', delete:'trash-can' };
      $$('[data-selected-client-action]').forEach(b => {
        if (!b.querySelector('.fa-svg')) b.insertAdjacentHTML('afterbegin', icon(clientActionIcons[b.dataset.selectedClientAction] || 'circle-info'));
      });
      $$('.mode-back').forEach(b => { if (!b.querySelector('.fa-svg')) b.insertAdjacentHTML('afterbegin', icon('arrow-left')); });
      updatePromotionDeleteButton();
    }

    function loginView(){ $('#admin-login').classList.remove('hidden'); $('#admin-app').classList.add('hidden'); }
    function appView(){ $('#admin-login').classList.add('hidden'); $('#admin-app').classList.remove('hidden'); $('#admin-name').textContent = state.admin.display_name; go('dashboard'); }
    async function boot(){ try { state.admin = await api('/api/admin/me'); appView(); } catch { loginView(); } }

    $('#admin-login-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#admin-login-error').textContent = '';
      const busy = UI.notify('Verificando credenciales…','loading',{title:'Ingresando'});
      try {
        state.admin = await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:$('#admin-username').value,password:$('#admin-password').value})});
        busy.close(); appView(); UI.notify('Acceso administrativo iniciado.','success');
      } catch (x) { busy.close(); $('#admin-login-error').textContent = x.message; UI.notify(x.message,'error',{title:'No se pudo ingresar'}); }
    });

    $('#admin-logout').addEventListener('click', async () => { try { await api('/api/admin/logout',{method:'POST'}); } catch {} loginView(); });

    function resetClientsView() {
      state.clients = [];
      state.selectedClientId = null;
      $('#clients-search-mode').classList.remove('hidden');
      $('#new-client-form').classList.add('hidden');
      $('#client-search').value = '';
      $('#client-results').innerHTML = `<div class="client-empty"><div>${icon('magnifying-glass')}<p>Ingresá un nombre, teléfono o patente para buscar un cliente.</p></div></div>`;
      updateClientActionBar();
    }

    function resetServiceSearch() {
      state.serviceVehicle = null;
      state.services = [];
      $('#service-search-mode').classList.remove('hidden');
      $('#service-editor').classList.add('hidden');
      $('#service-search').value = '';
      $('#service-search-results').innerHTML = `<div class="service-empty"><div>${icon('magnifying-glass')}<p>Buscá una patente o cliente para comenzar.</p></div></div>`;
    }

    function showPromotionList() {
      $('#promotion-list-mode').classList.remove('hidden');
      $('#promotion-create-mode').classList.add('hidden');
    }

    function showPromotionCreate() {
      $('#promotion-list-mode').classList.add('hidden');
      $('#promotion-create-mode').classList.remove('hidden');
      const form = $('#promotion-form');
      form.reset();
      setPromotionScope('history', false);
      invalidatePromotionPreview();
      window.scrollTo({top:0,behavior:'smooth'});
    }

    async function go(name){
      $$('[data-admin-view]').forEach(v => v.classList.toggle('active',v.dataset.adminView === name));
      $$('.admin-nav [data-admin-go]').forEach(b => b.classList.toggle('active',b.dataset.adminGo === name));
      try {
        if(name === 'dashboard') await dashboard();
        if(name === 'clients') resetClientsView();
        if(name === 'vehicles') await vehicles();
        if(name === 'services') resetServiceSearch();
        if(name === 'promotions'){ showPromotionList(); await promotions(); }
        if(name === 'messages') await messages();
        if(name === 'reminders') await reminders();
      } catch(e) { if(e.status === 401) loginView(); else UI.notify(e.message,'error'); }
      window.scrollTo({top:0});
    }

    document.addEventListener('click', e => { const b=e.target.closest('[data-admin-go]'); if(b) go(b.dataset.adminGo); });

    async function dashboard(){
      const x = await api('/api/admin/dashboard'), c = x.counts;
      const kpis = [
        ['Clientes',c.clients,'users'],['Vehículos',c.vehicles,'car'],['Servicios del mes',c.services_month,'wrench'],['Promociones',c.promotions,'tags'],['Recordatorios',c.reminders,'bell']
      ];
      $('#dashboard-kpis').innerHTML = kpis.map(([l,v,i]) => `<article class="kpi-card glass-card"><span class="kpi-accent">${icon(i)}</span><strong>${v}</strong><span>${l}</span></article>`).join('');
    }

    async function searchDashboardClient() {
      const q = $('#dashboard-client-search').value.trim();
      if (!q) { UI.notify('Ingresá un nombre, teléfono o patente.','error',{title:'Búsqueda vacía'}); return; }
      await go('clients');
      $('#client-search').value = q;
      await clients(q);
    }

    $('#dashboard-search-client').addEventListener('click', searchDashboardClient);
    $('#dashboard-client-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchDashboardClient(); } });
    document.addEventListener('click', async e => {
      const action = e.target.closest('[data-dashboard-action]')?.dataset.dashboardAction;
      if (!action) return;
      if (action === 'new-client') { await go('clients'); showNewClient(); }
      if (action === 'new-service') await go('services');
      if (action === 'new-promotion') { await go('promotions'); showPromotionCreate(); }
    });

    function clientEmpty(message) {
      $('#client-results').innerHTML = `<div class="client-empty"><div>${icon('magnifying-glass')}<p>${esc(message)}</p></div></div>`;
    }

    async function clients(q=''){
      const term = q.trim();
      state.selectedClientId = null;
      updateClientActionBar();
      if (!term) { state.clients=[]; clientEmpty('Ingresá un nombre, teléfono o patente para buscar un cliente.'); return; }
      state.clients = await api(`/api/admin/clients?search=${encodeURIComponent(term)}`);
      $('#client-results').innerHTML = state.clients.map(c => `<article class="select-record" data-client-record="${c.id}"><input class="record-select" type="checkbox" data-client-select value="${c.id}" aria-label="Seleccionar ${esc(c.full_name)}"><div class="select-record-main"><h3>${esc(c.full_name)}</h3><p>${esc(c.phone)}</p><div class="select-record-vehicles">${c.vehicles.map(v=>`<span class="vehicle-chip">${esc(v.plate)} · ${esc([v.brand,v.model].filter(Boolean).join(' '))}</span>`).join('')}</div></div><div class="select-record-meta"><strong>${c.vehicles.length}</strong> vehículo(s)</div></article>`).join('') || `<div class="client-empty"><div>${icon('circle-info')}<p>No se encontraron clientes para esa búsqueda.</p></div></div>`;
    }

    function updateClientActionBar() {
      const bar = $('#client-action-bar');
      const client = state.clients.find(c => String(c.id) === String(state.selectedClientId));
      bar.classList.toggle('hidden', !client);
      if (client) $('#selected-client-name').textContent = client.full_name;
      $$('.select-record[data-client-record]').forEach(card => card.classList.toggle('is-selected', String(card.dataset.clientRecord) === String(state.selectedClientId)));
    }

    function selectClient(id, selected = true) {
      $$('[data-client-select]').forEach(input => { input.checked = selected && String(input.value) === String(id); });
      state.selectedClientId = selected ? id : null;
      updateClientActionBar();
    }

    function showNewClient() {
      state.selectedClientId = null;
      updateClientActionBar();
      $('#clients-search-mode').classList.add('hidden');
      $('#new-client-form').classList.remove('hidden');
      $('#new-client-form').reset();
      $('#new-client-error').textContent = '';
      $('#new-client-form').querySelector('[name="full_name"]').focus();
    }

    function closeNewClient() {
      $('#new-client-form').classList.add('hidden');
      $('#clients-search-mode').classList.remove('hidden');
      $('#new-client-error').textContent = '';
    }

    $('#toggle-new-client').addEventListener('click', showNewClient);
    $('#close-new-client').addEventListener('click', closeNewClient);
    $('#cancel-new-client').addEventListener('click', closeNewClient);
    $('#search-clients').addEventListener('click', () => clients($('#client-search').value));
    $('#client-search').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); clients(e.currentTarget.value); } });

    document.addEventListener('change', e => {
      if (e.target.matches('[data-client-select]')) selectClient(e.target.value, e.target.checked);
      if (e.target.matches('[data-vehicle-select]')) selectVehicle(e.target.value, e.target.checked);
      if (e.target.matches('[data-promotion-select]')) updatePromotionDeleteButton();
    });

    document.addEventListener('click', e => {
      const clientCard = e.target.closest('[data-client-record]');
      if (clientCard && !e.target.closest('input,button,a')) selectClient(clientCard.dataset.clientRecord, true);
      const vehicleCard = e.target.closest('[data-vehicle-record]');
      if (vehicleCard && !e.target.closest('input,button,a')) selectVehicle(vehicleCard.dataset.vehicleRecord, true);
    });

    $('#new-client-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#new-client-error').textContent='';
      const f=new FormData(e.target), p={full_name:f.get('full_name'),phone:f.get('phone'),vehicle:{plate:f.get('plate'),brand:t(f.get('brand')),model:f.get('model'),description:t(f.get('description')),year:n(f.get('year')),current_mileage:n(f.get('current_mileage'))}};
      const busy=UI.notify('Guardando cliente y vehículo…','loading',{title:'Registrando'});
      try {
        const x=await api('/api/admin/clients',{method:'POST',body:JSON.stringify(p)});
        busy.close();
        e.target.reset();
        closeNewClient();
        const q = x.client.phone || x.client.full_name;
        $('#client-search').value = q;
        await clients(q);
        UI.notify('Cliente registrado correctamente.','success');
        await qr(x.client.id,'activation');
      } catch(x){ busy.close(); $('#new-client-error').textContent=x.message; UI.notify(x.message,'error'); }
    });

    document.addEventListener('click', async e => {
      const b=e.target.closest('[data-selected-client-action]'); if(!b) return;
      const id=state.selectedClientId, a=b.dataset.selectedClientAction;
      if(!id)return;
      try {
        if(a==='add'){ $('#add-vehicle-client-id').value=id; $('#vehicle-dialog').showModal(); }
        else if(a==='delete'){
          const ok=await UI.confirmAction({title:'Eliminar cliente',message:'Se eliminará completamente el cliente, sus vehículos, servicios y datos dependientes. Esta acción no se puede deshacer.',confirmText:'Eliminar cliente',danger:true});
          if(ok){ const busy=UI.notify('Eliminando cliente…','loading'); await api(`/api/admin/clients/${id}`,{method:'DELETE'}); busy.close(); state.selectedClientId=null; await clients($('#client-search').value); UI.notify('Cliente eliminado.','success'); }
        } else await qr(id,a);
      } catch(x){ UI.notify(x.message,'error'); }
    });

    async function qr(id,p){ const x=await api(`/api/admin/clients/${id}/access/qr`,{method:'POST',body:JSON.stringify({purpose:p})}); state.qrUrl=x.url; $('#qr-title').textContent=x.client_name; $('#qr-image').src=x.qr; $('#qr-expiry').textContent=`Válido hasta ${dt(x.expires_at)}`; $('#qr-dialog').showModal(); }
    $('#close-qr').onclick=()=>$('#qr-dialog').close();
    $('#copy-qr-link').onclick=async()=>{ try{ await navigator.clipboard?.writeText(state.qrUrl); UI.notify('Enlace QR copiado.','success'); }catch{ UI.notify('No se pudo copiar el enlace.','error'); } };
    $('#close-vehicle-dialog').onclick=()=>$('#vehicle-dialog').close();

    $('#add-vehicle-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#add-vehicle-error').textContent='';
      const f=new FormData(e.target),p={plate:f.get('plate'),brand:t(f.get('brand')),model:f.get('model'),description:t(f.get('description')),year:n(f.get('year')),current_mileage:n(f.get('current_mileage'))};
      const busy=UI.notify('Guardando vehículo…','loading');
      try{ await api(`/api/admin/clients/${$('#add-vehicle-client-id').value}/vehicles`,{method:'POST',body:JSON.stringify(p)}); busy.close(); e.target.reset(); $('#vehicle-dialog').close(); if($('#client-search').value.trim()) await clients($('#client-search').value); UI.notify('Vehículo agregado.','success'); }
      catch(x){ busy.close(); $('#add-vehicle-error').textContent=x.message; UI.notify(x.message,'error'); }
    });

    async function vehicles(q=''){
      state.vehicles=await api(`/api/admin/vehicles?search=${encodeURIComponent(q)}`);
      state.selectedVehicleId=null;
      renderVehicles('#vehicle-results',false);
      updateVehicleActionBar();
    }

    function renderVehicles(sel,service){
      if(service){
        $(sel).innerHTML=state.vehicles.map(v=>`<article class="select-record" data-sv="${v.id}" role="button" tabindex="0"><span class="vehicle-list-icon">${icon('car')}</span><div class="select-record-main"><h3>${esc(v.plate)} · ${esc([v.brand,v.model].filter(Boolean).join(' '))}</h3><p>${esc(v.client_name)} · ${esc(v.phone)}</p></div><div class="select-record-meta"><strong>${d(v.last_service_date)}</strong> último servicio</div></article>`).join('')||`<div class="service-empty"><div>${icon('circle-info')}<p>No se encontraron vehículos.</p></div></div>`;
        return;
      }
      $(sel).innerHTML=state.vehicles.map(v=>`<article class="select-record" data-vehicle-record="${v.id}"><input class="record-select" type="checkbox" data-vehicle-select value="${v.id}" aria-label="Seleccionar ${esc(v.plate)}"><span class="vehicle-list-icon">${icon('car')}</span><div class="select-record-main"><h3>${esc([v.brand,v.model].filter(Boolean).join(' ')) || esc(v.plate)}</h3><p><strong>${esc(v.plate)}</strong> · ${esc(v.client_name)}</p></div><div class="select-record-meta"><strong>${d(v.last_service_date)}</strong> último servicio<br>${km(v.current_mileage)}</div></article>`).join('')||`<div class="vehicle-empty"><div>${icon('circle-info')}<p>No se encontraron vehículos.</p></div></div>`;
    }

    function selectVehicle(id, selected=true){
      $$('[data-vehicle-select]').forEach(input => { input.checked = selected && String(input.value) === String(id); });
      state.selectedVehicleId = selected ? id : null;
      updateVehicleActionBar();
    }

    function updateVehicleActionBar(){
      const bar=$('#vehicle-action-bar');
      const vehicle=state.vehicles.find(v=>String(v.id)===String(state.selectedVehicleId));
      bar.classList.toggle('hidden',!vehicle);
      if(vehicle) $('#selected-vehicle-name').textContent=`${vehicle.plate} · ${[vehicle.brand,vehicle.model].filter(Boolean).join(' ')}`;
      $$('[data-vehicle-record]').forEach(card=>card.classList.toggle('is-selected',String(card.dataset.vehicleRecord)===String(state.selectedVehicleId)));
    }

    $('#search-vehicles').onclick=()=>vehicles($('#vehicle-search').value);
    $('#vehicle-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();vehicles(e.currentTarget.value)}});
    $('#selected-vehicle-service').addEventListener('click',async()=>{if(state.selectedVehicleId){const id=state.selectedVehicleId;await go('services');await serviceVehicle(id)}});
    $('#selected-vehicle-delete').addEventListener('click',async()=>{
      if(!state.selectedVehicleId)return;
      const id=state.selectedVehicleId;
      const ok=await UI.confirmAction({title:'Eliminar vehículo',message:'Se eliminará el vehículo y todo su historial de servicios. Esta acción no se puede deshacer.',confirmText:'Eliminar vehículo',danger:true});
      if(!ok)return;
      const busy=UI.notify('Eliminando vehículo…','loading');
      try{await api(`/api/admin/vehicles/${id}`,{method:'DELETE'});busy.close();await vehicles($('#vehicle-search').value);UI.notify('Vehículo eliminado.','success')}catch(x){busy.close();UI.notify(x.message,'error')}
    });

    $('#search-service-vehicle').onclick=async()=>{
      const q=$('#service-search').value.trim();
      if(!q){$('#service-search-results').innerHTML=`<div class="service-empty"><div>${icon('magnifying-glass')}<p>Ingresá una patente o cliente para buscar un vehículo.</p></div></div>`;return;}
      state.vehicles=await api(`/api/admin/vehicles?search=${encodeURIComponent(q)}`);
      renderVehicles('#service-search-results',true);
    };
    $('#service-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#search-service-vehicle').click()}});

    document.addEventListener('click', async e => {
      const sv=e.target.closest('[data-sv]'); if(sv) await serviceVehicle(sv.dataset.sv);
      const cs=e.target.closest('[data-cs]'); if(cs) correction(Number(cs.dataset.cs));
    });

    async function serviceVehicle(id){
      const x=await api(`/api/admin/vehicles/${id}`); state.serviceVehicle=x.vehicle; state.services=x.services; const f=$('#service-form'); f.reset(); $('#service-vehicle-id').value=id; $('#service-id').value=''; f.elements.service_date.value=new Date().toISOString().slice(0,10); f.elements.mileage.value=state.serviceVehicle.current_mileage??''; const l=state.services[0]; if(l){f.elements.next_change_km.value=l.next_change_km??'';f.elements.oil.value=l.oil??'';f.elements.oil_type.value=l.oil_type??''}
      $('#service-preloaded').innerHTML=`<div><small>Cliente</small><strong>${esc(state.serviceVehicle.client_name)}</strong></div><div><small>Patente</small><strong>${esc(state.serviceVehicle.plate)}</strong></div><div><small>Vehículo</small><strong>${esc(state.serviceVehicle.model)}</strong></div><div><small>Último servicio</small><strong>${l?`${d(l.service_date)} · ${km(l.mileage)}`:'Sin servicios'}</strong></div>`;
      $('#admin-service-history').innerHTML='<h2>Historial</h2>'+state.services.map((s,i)=>`<div class="service-entry"><strong>${d(s.service_date)} · ${km(s.mileage)}</strong> <button class="btn" data-cs="${i}">${icon('pen-to-square')} Corregir</button></div>`).join('');
      $('#service-search-mode').classList.add('hidden');
      $('#service-editor').classList.remove('hidden');
      $('#save-service').innerHTML=`${icon('floppy-disk')} Guardar`;
      window.scrollTo({top:0,behavior:'smooth'});
    }

    function correction(i){const s=state.services[i],f=$('#service-form');$('#service-id').value=s.id;F.forEach(k=>{if(f.elements[k])f.elements[k].value=s[k]??''});$('#save-service').innerHTML=`${icon('floppy-disk')} Guardar`;}
    function backToServiceSearch(){ $('#service-editor').classList.add('hidden'); $('#service-search-mode').classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); }
    $('#back-service-search').onclick=backToServiceSearch;
    $('#cancel-service').onclick=backToServiceSearch;
    $('#service-form').addEventListener('submit',async e=>{e.preventDefault();$('#service-error').textContent='';const form=new FormData(e.target),p={};F.forEach(k=>p[k]=['mileage','next_change_km'].includes(k)?n(form.get(k)):t(form.get(k)));p.service_date=form.get('service_date');const id=$('#service-id').value,v=$('#service-vehicle-id').value;const busy=UI.notify(id?'Guardando corrección…':'Registrando servicio…','loading');try{await api(id?`/api/admin/services/${id}`:`/api/admin/vehicles/${v}/services`,{method:id?'PUT':'POST',body:JSON.stringify(p)});busy.close();await serviceVehicle(v);UI.notify(id?'Corrección guardada correctamente.':'Servicio registrado correctamente.','success')}catch(x){busy.close();$('#service-error').textContent=x.message;UI.notify(x.message,'error')}});

    $('#new-promotion').addEventListener('click',showPromotionCreate);
    $('#cancel-promotion-create').addEventListener('click',()=>{showPromotionList();promotions()});
    function pp(){const f=new FormData($('#promotion-form'));return{title:f.get('title'),detail:f.get('detail'),audience_scope:f.get('audience_scope'),criterion_value:f.get('criterion_value')}}
    $('#preview-promotion').onclick=async()=>{try{const payload=pp(),x=await api('/api/admin/promotions/preview',{method:'POST',body:JSON.stringify(payload)});state.promotionPreviewSignature=promotionAudienceSignature();state.promotionPreviewCount=x.count;const label=payload.audience_scope==='all'?'clientes registrados':'clientes únicos coincidentes';$('#promotion-preview').innerHTML=`<div class="audience-number">${x.count}</div><p>${label}</p>`}catch(x){invalidatePromotionPreview();UI.notify(x.message,'error')}};
    $('#promotion-form').addEventListener('submit',async e=>{e.preventDefault();$('#promotion-error').textContent='';const payload=pp();if(state.promotionPreviewSignature!==promotionAudienceSignature()||state.promotionPreviewCount==null){UI.notify('Calculá nuevamente la audiencia antes de publicar.','error',{title:'Audiencia pendiente'});return}const all=payload.audience_scope==='all',count=state.promotionPreviewCount,message=all?`Esta promoción se enviará inmediatamente a TODOS los ${count} clientes registrados y quedará publicada.`:`Esta promoción se enviará inmediatamente a ${count} cliente(s) coincidente(s) con el historial y quedará publicada.`;const ok=await UI.confirmAction({title:'Publicar promoción',message,confirmText:'Publicar'});if(!ok)return;const busy=UI.notify('Publicando promoción…','loading');try{const x=await api('/api/admin/promotions',{method:'POST',body:JSON.stringify(payload)});busy.close();UI.notify(`Promoción publicada para ${x.recipients} cliente(s).`,'success');e.target.reset();setPromotionScope('history',false);invalidatePromotionPreview();showPromotionList();await promotions()}catch(x){busy.close();$('#promotion-error').textContent=x.message;UI.notify(x.message,'error')}});

    async function promotions(){
      const x=await api('/api/admin/promotions');
      $('#published-promotions').innerHTML=x.length?`<div class="promotion-table"><div class="promotion-row header"><span></span><span>Título</span><span>Ítem / condición</span><span>Enviada</span><span>Destinatarios</span></div>${x.map(p=>`<label class="promotion-row"><input class="record-select" type="checkbox" data-promotion-select value="${esc(p.id)}"><strong>${esc(p.title)}</strong><span class="promotion-audience">${esc(p.criterion_value)}</span><span>${dateOnly(p.published_at)}</span><span>${p.recipients}</span></label>`).join('')}</div>`:'<p>Sin promociones publicadas.</p>';
      updatePromotionDeleteButton();
    }

    $('#delete-promotions').addEventListener('click',async()=>{
      const ids=selectedPromotionIds();
      if(!ids.length)return;
      const ok=await UI.confirmAction({title:'Eliminar promociones',message:`Se eliminarán ${ids.length} promoción(es) del panel y de las bandejas de los clientes. Las notificaciones que Android o iOS ya mostraron pueden permanecer en el centro de notificaciones del dispositivo.`,confirmText:'Eliminar promociones',danger:true});
      if(!ok)return;
      const busy=UI.notify('Eliminando promociones…','loading');
      try{const x=await api('/api/admin/promotions',{method:'DELETE',body:JSON.stringify(ids)});busy.close();await promotions();UI.notify(`${x.deleted} promoción(es) eliminada(s).`,'success');}catch(x){busy.close();UI.notify(x.message,'error',{title:'No se pudieron eliminar las promociones'})}
    });

    async function messages(){
      const x=await api('/api/admin/messages');
      $('#admin-messages').innerHTML=x.map(m=>`<article class="admin-message-card"><span class="admin-message-icon">${icon(m.message_type==='promotion'?'tags':'comments')}</span><div class="admin-message-copy"><h3>${esc(m.client_name)}</h3><p><strong>${esc(m.title)}</strong>${m.body?` · ${esc(m.body)}`:''}</p></div><div class="admin-message-meta"><time>${dt(m.created_at)}</time><span class="${m.is_read?'':'unread'}">${m.is_read?'Leído':'No leído'}</span></div></article>`).join('')||`<div class="client-empty"><div>${icon('comments')}<p>Sin mensajes registrados.</p></div></div>`;
    }

    async function reminders(){const x=await api('/api/admin/reminders');$('#admin-reminders').innerHTML=x.map(r=>`<tr><td>${esc(r.client_name)}</td><td>${esc(r.plate)} · ${esc(r.model)}</td><td>${d(r.due_date)}</td><td>${dt(r.notify_at)}</td><td>${esc(r.status)}</td></tr>`).join('')||'<tr><td colspan="5">No hay recordatorios programados.</td></tr>'}

    setupPromotionForm();
    decorateStaticIcons();
    boot();
  }

  start().catch(error => console.error('VERA admin init error', error));
})();