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
    const state = { admin: null, clients: [], vehicles: [], serviceVehicle: null, services: [], qrUrl: '', promotionPreviewSignature: null, promotionPreviewCount: null };
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
      const value = form.elements.criterion_value;
      const valueLabel = value?.closest('label');
      if (valueLabel) {
        valueLabel.innerHTML = '<span>Ítem o condición</span><input class="text-input" name="criterion_value" placeholder="Ej. 20W50, batería, Visa 6 cuotas sin interés, pago con cheque..." required>';
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
    }

    function decorateStaticIcons() {
      const nav = { dashboard:'house', clients:'users', vehicles:'car', services:'wrench', promotions:'tags', messages:'comments', reminders:'bell' };
      $$('.admin-nav [data-admin-go]').forEach(b => {
        if (!b.querySelector('.nav-icon')) b.insertAdjacentHTML('afterbegin', `<span class="nav-icon">${icon(nav[b.dataset.adminGo])}</span>`);
      });
      const actions = ['user-plus','wrench','tags'];
      $$('.admin-action-card').forEach((b, i) => {
        const holder = b.querySelector('.action-icon');
        const arrow = b.querySelector('.action-arrow');
        if (holder) holder.innerHTML = icon(actions[i] || 'circle-info');
        if (arrow) arrow.innerHTML = icon('chevron-right');
      });
      $$('.search-icon').forEach(x => x.innerHTML = icon('magnifying-glass'));
      const staticButtons = [
        ['#toggle-new-client','user-plus'],['#search-clients','magnifying-glass'],['#search-vehicles','magnifying-glass'],
        ['#search-service-vehicle','magnifying-glass'],['#preview-promotion','tags'],['#copy-qr-link','copy']
      ];
      staticButtons.forEach(([selector,name]) => {
        const b = $(selector); if (b && !b.querySelector('.fa-svg')) b.insertAdjacentHTML('afterbegin', icon(name));
      });
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

    async function go(name){
      $$('[data-admin-view]').forEach(v => v.classList.toggle('active',v.dataset.adminView === name));
      $$('.admin-nav [data-admin-go]').forEach(b => b.classList.toggle('active',b.dataset.adminGo === name));
      try {
        if(name === 'dashboard') await dashboard();
        if(name === 'clients') await clients();
        if(name === 'vehicles') await vehicles();
        if(name === 'promotions') await promotions();
        if(name === 'messages') await messages();
        if(name === 'reminders') await reminders();
      } catch(e) { if(e.status === 401) loginView(); else UI.notify(e.message,'error'); }
      window.scrollTo({top:0});
    }

    document.addEventListener('click', e => { const b=e.target.closest('[data-admin-go]'); if(b) go(b.dataset.adminGo); });

    async function dashboard(){
      const x = await api('/api/admin/dashboard'), c = x.counts;
      const kpis = [
        ['Clientes',c.clients,'users'],['Vehículos',c.vehicles,'car'],['Servicios del mes',c.services_month,'wrench'],['Recordatorios',c.reminders,'bell'],['Promociones',c.promotions,'tags']
      ];
      $('#dashboard-kpis').innerHTML = kpis.map(([l,v,i]) => `<article class="kpi-card glass-card"><span class="kpi-accent">${icon(i)}</span><strong>${v}</strong><span>${l}</span></article>`).join('');
      $('#activity-body').innerHTML = x.activity.map(a => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.action_type)}</td><td>${esc(a.description)}</td><td>${esc(a.reference||'—')}</td></tr>`).join('') || '<tr><td colspan="4">Sin actividad</td></tr>';
    }

    async function clients(q=''){
      state.clients = await api(`/api/admin/clients?search=${encodeURIComponent(q)}`);
      $('#client-results').innerHTML = state.clients.map(c => `<article class="record-card glass-card"><div class="record-head"><div><h3>${esc(c.full_name)}</h3><p>${esc(c.phone)}</p></div><span>${c.vehicles.length} vehículo(s)</span></div>${c.vehicles.map(v=>`<p><strong>${esc(v.plate)}</strong> · ${esc([v.brand,v.model].filter(Boolean).join(' '))}</p>`).join('')}<div class="record-actions"><button class="btn" data-ca="add" data-id="${c.id}">${icon('car')} Agregar vehículo</button><button class="btn" data-ca="activation" data-id="${c.id}">${icon('qrcode')} QR activación</button><button class="btn" data-ca="pin_reset" data-id="${c.id}">${icon('key')} Restablecer PIN</button><button class="btn" data-ca="relink" data-id="${c.id}">${icon('rotate')} Revincular VERA</button><button class="btn danger" data-ca="delete" data-id="${c.id}">${icon('trash-can')} Eliminar cliente</button></div></article>`).join('') || '<div class="notice">No se encontraron clientes.</div>';
    }

    $('#toggle-new-client').onclick = () => $('#new-client-form').classList.toggle('hidden');
    $('#search-clients').onclick = () => clients($('#client-search').value);
    $('#new-client-form').addEventListener('submit', async e => {
      e.preventDefault(); $('#new-client-error').textContent='';
      const f=new FormData(e.target), p={full_name:f.get('full_name'),phone:f.get('phone'),vehicle:{plate:f.get('plate'),brand:t(f.get('brand')),model:f.get('model'),description:t(f.get('description')),year:n(f.get('year')),current_mileage:n(f.get('current_mileage'))}};
      const busy=UI.notify('Guardando cliente y vehículo…','loading',{title:'Registrando'});
      try { const x=await api('/api/admin/clients',{method:'POST',body:JSON.stringify(p)}); busy.close(); e.target.reset(); e.target.classList.add('hidden'); await clients(); UI.notify('Cliente registrado correctamente.','success'); await qr(x.client.id,'activation'); }
      catch(x){ busy.close(); $('#new-client-error').textContent=x.message; UI.notify(x.message,'error'); }
    });

    document.addEventListener('click', async e => {
      const b=e.target.closest('[data-ca]'); if(!b) return;
      const id=b.dataset.id, a=b.dataset.ca;
      try {
        if(a==='add'){ $('#add-vehicle-client-id').value=id; $('#vehicle-dialog').showModal(); }
        else if(a==='delete'){
          const ok=await UI.confirmAction({title:'Eliminar cliente',message:'Se eliminará completamente el cliente, sus vehículos, servicios y datos dependientes. Esta acción no se puede deshacer.',confirmText:'Eliminar cliente',danger:true});
          if(ok){ const busy=UI.notify('Eliminando cliente…','loading'); await api(`/api/admin/clients/${id}`,{method:'DELETE'}); busy.close(); await clients(); UI.notify('Cliente eliminado.','success'); }
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
      try{ await api(`/api/admin/clients/${$('#add-vehicle-client-id').value}/vehicles`,{method:'POST',body:JSON.stringify(p)}); busy.close(); e.target.reset(); $('#vehicle-dialog').close(); await clients(); UI.notify('Vehículo agregado.','success'); }
      catch(x){ busy.close(); $('#add-vehicle-error').textContent=x.message; UI.notify(x.message,'error'); }
    });

    async function vehicles(q=''){ state.vehicles=await api(`/api/admin/vehicles?search=${encodeURIComponent(q)}`); renderVehicles('#vehicle-results',false); }
    function renderVehicles(sel,service){ $(sel).innerHTML=state.vehicles.map(v=>`<article class="record-card glass-card"><div class="record-head"><div><h3>${esc(v.plate)} · ${esc([v.brand,v.model].filter(Boolean).join(' '))}</h3><p>${esc(v.client_name)} · ${esc(v.phone)}</p></div><strong>${km(v.current_mileage)}</strong></div><p>Último servicio: ${d(v.last_service_date)}</p><div class="record-actions">${service?`<button class="btn primary" data-sv="${v.id}">${icon('car')} Seleccionar</button>`:`<button class="btn" data-os="${v.id}">${icon('wrench')} Nuevo servicio / historial</button><button class="btn danger" data-dv="${v.id}">${icon('trash-can')} Eliminar vehículo</button>`}</div></article>`).join('')||'<div class="notice">No se encontraron vehículos.</div>'; }
    $('#search-vehicles').onclick=()=>vehicles($('#vehicle-search').value);
    $('#search-service-vehicle').onclick=async()=>{ state.vehicles=await api(`/api/admin/vehicles?search=${encodeURIComponent($('#service-search').value)}`); renderVehicles('#service-search-results',true); };

    document.addEventListener('click', async e => {
      const os=e.target.closest('[data-os]'); if(os){ go('services'); await serviceVehicle(os.dataset.os); }
      const sv=e.target.closest('[data-sv]'); if(sv) await serviceVehicle(sv.dataset.sv);
      const dv=e.target.closest('[data-dv]');
      if(dv){ const ok=await UI.confirmAction({title:'Eliminar vehículo',message:'Se eliminará el vehículo y todo su historial de servicios. Esta acción no se puede deshacer.',confirmText:'Eliminar vehículo',danger:true}); if(ok){ const busy=UI.notify('Eliminando vehículo…','loading'); try{await api(`/api/admin/vehicles/${dv.dataset.dv}`,{method:'DELETE'});busy.close();await vehicles();UI.notify('Vehículo eliminado.','success')}catch(x){busy.close();UI.notify(x.message,'error')} } }
      const cs=e.target.closest('[data-cs]'); if(cs) correction(Number(cs.dataset.cs));
    });

    async function serviceVehicle(id){
      const x=await api(`/api/admin/vehicles/${id}`); state.serviceVehicle=x.vehicle; state.services=x.services; const f=$('#service-form'); f.reset(); $('#service-vehicle-id').value=id; $('#service-id').value=''; f.elements.service_date.value=new Date().toISOString().slice(0,10); f.elements.mileage.value=state.serviceVehicle.current_mileage??''; const l=state.services[0]; if(l){f.elements.next_change_km.value=l.next_change_km??'';f.elements.oil.value=l.oil??'';f.elements.oil_type.value=l.oil_type??''}
      $('#service-preloaded').innerHTML=`<div><small>Cliente</small><strong>${esc(state.serviceVehicle.client_name)}</strong></div><div><small>Patente</small><strong>${esc(state.serviceVehicle.plate)}</strong></div><div><small>Vehículo</small><strong>${esc(state.serviceVehicle.model)}</strong></div><div><small>Último servicio</small><strong>${l?`${d(l.service_date)} · ${km(l.mileage)}`:'Sin servicios'}</strong></div>`;
      $('#admin-service-history').innerHTML='<h2>Historial</h2>'+state.services.map((s,i)=>`<div class="service-entry"><strong>${d(s.service_date)} · ${km(s.mileage)}</strong> <button class="btn" data-cs="${i}">${icon('pen-to-square')} Corregir</button></div>`).join(''); $('#service-editor').classList.remove('hidden');
      $('#save-service').innerHTML=`${icon('floppy-disk')} Guardar`;
    }
    function correction(i){const s=state.services[i],f=$('#service-form');$('#service-id').value=s.id;F.forEach(k=>{if(f.elements[k])f.elements[k].value=s[k]??''});$('#save-service').innerHTML=`${icon('floppy-disk')} Guardar`;}
    $('#cancel-service').onclick=()=>$('#service-editor').classList.add('hidden');
    $('#service-form').addEventListener('submit',async e=>{e.preventDefault();$('#service-error').textContent='';const form=new FormData(e.target),p={};F.forEach(k=>p[k]=['mileage','next_change_km'].includes(k)?n(form.get(k)):t(form.get(k)));p.service_date=form.get('service_date');const id=$('#service-id').value,v=$('#service-vehicle-id').value;const busy=UI.notify(id?'Guardando corrección…':'Registrando servicio…','loading');try{await api(id?`/api/admin/services/${id}`:`/api/admin/vehicles/${v}/services`,{method:id?'PUT':'POST',body:JSON.stringify(p)});busy.close();await serviceVehicle(v);UI.notify(id?'Corrección guardada correctamente.':'Servicio registrado correctamente.','success')}catch(x){busy.close();$('#service-error').textContent=x.message;UI.notify(x.message,'error')}});

    function pp(){const f=new FormData($('#promotion-form'));return{title:f.get('title'),detail:f.get('detail'),audience_scope:f.get('audience_scope'),criterion_value:f.get('criterion_value')}}
    $('#preview-promotion').onclick=async()=>{try{const payload=pp(),x=await api('/api/admin/promotions/preview',{method:'POST',body:JSON.stringify(payload)});state.promotionPreviewSignature=promotionAudienceSignature();state.promotionPreviewCount=x.count;const label=payload.audience_scope==='all'?'clientes registrados':'clientes únicos coincidentes';$('#promotion-preview').innerHTML=`<div class="audience-number">${x.count}</div><p>${label}</p>`}catch(x){invalidatePromotionPreview();UI.notify(x.message,'error')}};
    $('#promotion-form').addEventListener('submit',async e=>{e.preventDefault();$('#promotion-error').textContent='';const payload=pp();if(state.promotionPreviewSignature!==promotionAudienceSignature()||state.promotionPreviewCount==null){UI.notify('Calculá nuevamente la audiencia antes de publicar.','error',{title:'Audiencia pendiente'});return}const all=payload.audience_scope==='all',count=state.promotionPreviewCount,message=all?`Esta promoción se enviará inmediatamente a TODOS los ${count} clientes registrados y quedará publicada.`:`Esta promoción se enviará inmediatamente a ${count} cliente(s) coincidente(s) con el historial y quedará publicada.`;const ok=await UI.confirmAction({title:'Publicar promoción',message,confirmText:'Publicar'});if(!ok)return;const busy=UI.notify('Publicando promoción…','loading');try{const x=await api('/api/admin/promotions',{method:'POST',body:JSON.stringify(payload)});busy.close();UI.notify(`Promoción publicada para ${x.recipients} cliente(s).`,'success');e.target.reset();setPromotionScope('history',false);invalidatePromotionPreview();await promotions()}catch(x){busy.close();$('#promotion-error').textContent=x.message;UI.notify(x.message,'error')}});
    async function promotions(){
      const x=await api('/api/admin/promotions');
      $('#published-promotions').innerHTML=x.map(p=>`<article class="record-card glass-card"><div class="record-head"><label><input type="checkbox" data-promotion-select value="${esc(p.id)}"> <strong>${esc(p.title)}</strong></label><span>${p.recipients} destinatarios</span></div><p>${p.audience_scope==='all'?'Todos los clientes':'Historial automático'} · ${esc(p.criterion_value)}</p></article>`).join('')||'<p>Sin promociones publicadas.</p>';
      updatePromotionDeleteButton();
    }
    document.addEventListener('change',e=>{if(e.target.matches('[data-promotion-select]'))updatePromotionDeleteButton()});
    $('#delete-promotions').addEventListener('click',async()=>{
      const ids=selectedPromotionIds();
      if(!ids.length)return;
      const ok=await UI.confirmAction({title:'Eliminar promociones',message:`Se eliminarán ${ids.length} promoción(es) del panel y de las bandejas de los clientes. Las notificaciones que Android o iOS ya mostraron pueden permanecer en el centro de notificaciones del dispositivo.`,confirmText:'Eliminar promociones',danger:true});
      if(!ok)return;
      const busy=UI.notify('Eliminando promociones…','loading');
      try{
        const x=await api('/api/admin/promotions',{method:'DELETE',body:JSON.stringify(ids)});
        busy.close();
        await promotions();
        UI.notify(`${x.deleted} promoción(es) eliminada(s).`,'success');
      }catch(x){busy.close();UI.notify(x.message,'error',{title:'No se pudieron eliminar las promociones'})}
    });
    async function messages(){const x=await api('/api/admin/messages');$('#admin-messages').innerHTML=x.map(m=>`<tr><td>${dt(m.created_at)}</td><td>${esc(m.client_name)}</td><td>${esc(m.message_type)}</td><td>${esc(m.title)}</td><td>${m.is_read?'Leído':'No leído'}</td></tr>`).join('')||'<tr><td colspan="5">Sin mensajes.</td></tr>'}
    async function reminders(){const x=await api('/api/admin/reminders');$('#admin-reminders').innerHTML=x.map(r=>`<tr><td>${esc(r.client_name)}</td><td>${esc(r.plate)} · ${esc(r.model)}</td><td>${d(r.due_date)}</td><td>${dt(r.notify_at)}</td><td>${esc(r.status)}</td></tr>`).join('')||'<tr><td colspan="5">No hay recordatorios programados.</td></tr>'}

    setupPromotionForm();
    decorateStaticIcons();
    boot();
  }

  start().catch(error => console.error('VERA admin init error', error));
})();