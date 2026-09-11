const state={me:null,vehicle:null,services:[],messages:[]};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const UI=window.VeraUI;
const icon=(name,cls='')=>UI?.icon(name,cls)||'';
const devClient=new URLSearchParams(location.search).get('client');

async function api(url,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(devClient)headers['X-VERA-Dev-Client']=devClient;
  const r=await fetch(url,{credentials:'same-origin',headers,...options});
  if(!r.ok){let m=`Error ${r.status}`;try{m=(await r.json()).detail||m}catch{}const e=new Error(m);e.status=r.status;throw e}
  return r.status===204?null:r.json();
}

const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function fmtDate(v){if(!v)return'—';const x=new Date(`${v}T00:00:00`);return Number.isNaN(x.getTime())?esc(v):new Intl.DateTimeFormat('es-AR').format(x)}
function fmtDateTime(v){if(!v)return'—';const x=new Date(v);return Number.isNaN(x.getTime())?esc(v):new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(x)}
const km=v=>v===null||v===undefined?'—':`${Number(v).toLocaleString('es-AR')} km`;
const vehicleName=v=>[v.brand,v.model].filter(Boolean).join(' ')||v.model||'Vehículo';

function pushCard(){return $('#enable-push')?.closest('.client-utility-card')}
function setPushCardHidden(hidden){const card=pushCard();if(card)card.classList.toggle('hidden',hidden)}
async function syncPushCard(){
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){setPushCardHidden(false);return}
  if(Notification.permission!=='granted'){setPushCardHidden(false);return}
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub){setPushCardHidden(false);return}
    setPushCardHidden(true);
    const j=sub.toJSON();
    if(j.endpoint&&j.keys?.p256dh&&j.keys?.auth){
      try{await api('/api/client/push/subscription',{method:'POST',body:JSON.stringify({endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})})}catch{}
    }
  }catch{setPushCardHidden(false)}
}
async function syncSystemUnread(count){
  const unread=Math.max(0,Number(count)||0);
  if(unread>0){
    if('setAppBadge'in navigator){try{await navigator.setAppBadge(unread)}catch{}}
    return;
  }
  if('serviceWorker'in navigator){
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg){
        const notifications=await reg.getNotifications();
        notifications.forEach(notification=>notification.close());
      }
    }catch{}
  }
  if('clearAppBadge'in navigator){try{await navigator.clearAppBadge()}catch{}}
}

function showMain(){
  $('#login-view').classList.remove('active');
  $('#app-view').classList.add('active');
  showView('vehicles');
  UI.decorateIcons(document);
  syncPushCard();
}
function showLogin(){
  $('#app-view').classList.remove('active');
  $('#login-view').classList.add('active');
  $('#client-pin').value='';
}
function showView(name){
  $$('[data-view]').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $$('.client-nav [data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name||(name==='vehicle'&&b.dataset.go==='vehicles')));
  window.scrollTo({top:0,behavior:'auto'});
  UI.decorateIcons(document);
}

async function loadMe(){
  state.me=await api('/api/client/me');
  $('#client-greeting').textContent=`${state.me.full_name} · ${state.me.phone}`;
  $('#message-badge').textContent=state.me.unread_messages||0;
  void syncSystemUnread(state.me.unread_messages||0);
  renderVehicles();
}

function renderVehicles(){
  const h=$('#vehicle-list'),vs=state.me?.vehicles||[];
  if(!vs.length){h.innerHTML=`<div class="client-empty glass-card">${icon('circle-info')}<p>No hay vehículos asociados a esta cuenta.</p></div>`;return}
  h.innerHTML=vs.map(v=>`<button class="vehicle-card ${state.vehicle?.vehicle?.id===v.id?'is-selected':''}" type="button" data-vehicle-id="${esc(v.id)}"><span class="vehicle-card-icon">${icon('car')}</span><span class="vehicle-card-copy"><strong>${esc(v.plate)}</strong><small>${esc(vehicleName(v))}</small><small class="vehicle-status">${v.last_service_date?`Último servicio ${fmtDate(v.last_service_date)}`:'Sin servicios registrados'}</small></span><span class="chevron">${icon('chevron-right')}</span></button>`).join('');
}

async function selectVehicle(id){
  const loading=UI.notify('Cargando vehículo...','loading',{title:'VERA'});
  try{
    state.vehicle=await api(`/api/client/vehicles/${encodeURIComponent(id)}`);
    state.services=[];
    renderVehicles();
    renderVehicle();
    showView('vehicle');
  }finally{loading.close()}
}

function renderVehicle(){
  if(!state.vehicle)return;
  const v=state.vehicle.vehicle,s=state.vehicle.latest_service;
  $('#vehicle-overview').innerHTML=`<div class="vehicle-overview-top"><span class="vehicle-emblem">${icon('car')}</span><div class="vehicle-identity"><p class="eyebrow">Vehículo seleccionado</p><h2>${esc(v.plate)}</h2><p>${esc(vehicleName(v))}</p></div></div><div class="vehicle-meta-premium"><div><span class="meta-icon">${icon('car')}</span><strong>${esc(v.year||'—')}</strong><small>Año</small></div><div><span class="meta-icon">${icon('wrench')}</span><strong>${km(v.current_mileage)}</strong><small>Kilometraje</small></div><div><span class="meta-icon">${icon('oil-can')}</span><strong>${s?fmtDate(s.service_date):'Sin registro'}</strong><small>Último servicio</small></div></div>`;
  $('#service-status').innerHTML=`<button type="button" class="status-card status-card-action" data-go="detail"><h3>${icon('oil-can')} Último servicio</h3><strong>${s?fmtDate(s.service_date):'Sin registro'}</strong><span class="status-sub">${s?km(s.mileage):'Todavía no hay servicios cargados'}</span></button><article class="status-card"><h3>${icon('wrench')} Próximo cambio</h3><strong>${s?.next_change_km?km(s.next_change_km):'Sin definir'}</strong><span class="status-sub">Según el último servicio registrado</span></article>`;
  $('#personal-card').innerHTML=`<span class="personal-icon">${icon('user')}</span><div><h3>Datos del titular</h3><strong>${esc(state.vehicle.client.full_name)}</strong><p class="muted">${esc(state.vehicle.client.phone)}</p></div><span>${icon('chevron-right')}</span>`;
}

function renderHistoryVehicle(){
  const v=state.vehicle?.vehicle;if(!v)return;
  $('#history-vehicle-card').innerHTML=`<span class="vehicle-mini-icon">${icon('car')}</span><div><small>Vehículo</small><strong>${esc(v.plate)}</strong><p>${esc(vehicleName(v))}</p></div><span class="chevron">${icon('chevron-right')}</span>`;
}

async function loadHistory(){
  if(!state.vehicle){UI.notify('Seleccioná primero el vehículo cuyo historial querés consultar.','info',{title:'Elegí un vehículo'});showView('vehicles');return false}
  const loading=UI.notify('Cargando historial...','loading',{title:'Historial VERA'});
  try{
    state.services=await api(`/api/client/vehicles/${encodeURIComponent(state.vehicle.vehicle.id)}/services`);
    renderHistoryVehicle();
    const h=$('#history-list');
    h.innerHTML=state.services.length?state.services.map((s,i)=>`<article class="timeline-item ${i===0?'is-latest':''}"><div class="timeline-kicker">${i===0?'Último servicio':'Servicio registrado'}</div><div class="timeline-main"><strong>${icon('wrench')} ${fmtDate(s.service_date)}</strong><strong>${icon('car')} ${km(s.mileage)}</strong><button class="link-button" data-service-index="${i}">Ver detalle ${icon('chevron-right')}</button></div><div class="timeline-detail">${s.oil?`<p>${icon('oil-can')} Aceite: ${esc(s.oil)}</p>`:''}${s.next_change_km?`<p>${icon('wrench')} Próximo cambio: ${km(s.next_change_km)}</p>`:''}${s.observations?`<p>${icon('comments')} ${esc(s.observations)}</p>`:''}</div></article>`).join(''):`<div class="client-empty glass-card">${icon('circle-info')}<p>Todavía no hay servicios registrados para este vehículo.</p></div>`;
    return true;
  }finally{loading.close()}
}

function fieldIcon(label){
  if(label.includes('Aceite')||label==='Tipo')return'oil-can';
  if(label.includes('Filtro'))return'circle-info';
  if(label.includes('Bujías'))return'wrench';
  if(label.includes('Líquido')||label.includes('Refrigerante'))return'circle-info';
  if(label.includes('neumáticos'))return'car';
  if(label.includes('Batería'))return'circle-info';
  if(label.includes('Observaciones'))return'comments';
  return'wrench';
}
function renderServiceDetail(s){
  if(!state.vehicle){showView('vehicles');return}
  const v=state.vehicle.vehicle;
  $('#service-vehicle-card').innerHTML=`<span class="vehicle-mini-icon">${icon('car')}</span><div><small>Vehículo</small><strong>${esc(v.plate)}</strong><p>${esc(vehicleName(v))}</p></div><span class="chevron">${icon('chevron-right')}</span>`;
  if(!s){$('#service-detail').innerHTML=`<div class="client-empty glass-card">${icon('circle-info')}<p>No hay un servicio registrado para este vehículo.</p></div>`;return}
  const summary=`<div class="service-summary"><div><span>${icon('wrench')} Fecha</span><strong>${fmtDate(s.service_date)}</strong></div><div><span>${icon('car')} Kilómetros</span><strong>${km(s.mileage)}</strong></div></div>`;
  const f=[['Próximo cambio km',km(s.next_change_km)],['Aceite',s.oil],['Tipo',s.oil_type],['Filtro de aceite',s.oil_filter],['Filtro de combustible',s.fuel_filter],['Filtro de aire',s.air_filter],['Filtro de cabina',s.cabin_filter],['Bujías',s.spark_plugs],['Aceite caja de vel.',s.gearbox_oil],['Aceite diferencial',s.differential_oil],['Engrase',s.grease],['Líquido hidráulico',s.hydraulic_fluid],['Líquido refrigerante',s.coolant],['Líquido de freno',s.brake_fluid],['Control de neumáticos',s.tire_control],['Rotación de neumáticos',s.tire_rotation],['Batería',s.battery],['Observaciones',s.observations]];
  const rows=f.filter(([,v])=>v!==null&&v!==undefined&&v!==''&&v!=='—').map(([l,v])=>`<div class="detail-row"><span class="detail-row-icon">${icon(fieldIcon(l))}</span><span class="label">${esc(l)}</span><strong>${l.includes('km')?v:esc(v)}</strong><span class="check">${icon('circle-check')}</span></div>`).join('');
  $('#service-detail').innerHTML=summary+`<article class="detail-list"><div class="detail-section-title">Servicio realizado</div>${rows||`<div class="client-empty">${icon('circle-info')}<p>El servicio no tiene detalles adicionales cargados.</p></div>`}</article>`;
}

function messageLabel(type){return type==='promotion'?'Promoción':type==='reminder'?'Recordatorio':'Mensaje VERA'}
function messageIcon(type){return type==='promotion'?'tag':type==='reminder'?'bell':'comments'}
function renderMessageList(){
  const ms=state.messages;
  $('#message-list').innerHTML=ms.length?ms.map(m=>`<article class="message-card ${m.is_read?'':'unread'}" data-message-id="${esc(m.id)}"><span class="message-icon">${icon(messageIcon(m.message_type))}</span><div class="message-copy"><span class="message-tag">${messageLabel(m.message_type)}</span><h3>${esc(m.title)}</h3><p>${esc(m.body)}</p><time>${icon('circle-info')} ${fmtDateTime(m.created_at)}</time></div><span class="message-chevron">${icon('chevron-right')}</span></article>`).join(''):`<div class="client-empty glass-card">${icon('circle-info')}<p>No tenés mensajes por el momento.</p></div>`;
}
function renderMessageDetail(m){
  if(!m){renderMessageList();return}
  $('#message-list').innerHTML=`<button type="button" class="link-button" data-message-back>&larr; Volver a mensajes</button><article class="message-card"><span class="message-icon">${icon(messageIcon(m.message_type))}</span><div class="message-copy"><span class="message-tag">${messageLabel(m.message_type)}</span><h3>${esc(m.title)}</h3><p>${esc(m.body)}</p><time>${icon('circle-info')} ${fmtDateTime(m.created_at)}</time></div></article>`;
  UI.decorateIcons(document);
}
async function openMessage(id){
  const m=state.messages.find(item=>String(item.id)===String(id));
  if(!m)return;
  if(!m.is_read){
    try{
      await api(`/api/client/messages/${encodeURIComponent(m.id)}/read`,{method:'POST'});
      m.is_read=true;
      const unread=state.messages.filter(item=>!item.is_read).length;
      $('#message-badge').textContent=unread;
      if(state.me)state.me.unread_messages=unread;
      void syncSystemUnread(unread);
    }catch{}
  }
  renderMessageDetail(m);
}
async function loadMessages(){
  const loading=UI.notify('Actualizando mensajes...','loading',{title:'Mensajes VERA'});
  try{
    state.messages=await api('/api/client/messages');
    const unread=state.messages.filter(m=>!m.is_read).length;
    $('#message-badge').textContent=unread;
    if(state.me)state.me.unread_messages=unread;
    void syncSystemUnread(unread);
    renderMessageList();
  }finally{loading.close()}
}

async function enablePush(){
  const b=$('#enable-push');UI.setBusy(b,true,'Activando...');
  try{
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Este navegador no admite Web Push');
    const c=await api('/api/client/push/config');
    if(!c.enabled||!c.public_key)throw new Error('Web Push todavía no está configurado');
    if(await Notification.requestPermission()!=='granted')throw new Error('Permiso no concedido');
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(c.public_key)});
    const j=sub.toJSON();
    await api('/api/client/push/subscription',{method:'POST',body:JSON.stringify({endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})});
    setPushCardHidden(true);
    UI.notify('Notificaciones VERA activadas.','success');
  }catch(e){UI.notify(e.message,'error',{title:'No se pudieron activar las notificaciones'})}
  finally{UI.setBusy(b,false)}
}
function urlBase64ToUint8Array(s){const p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b);return Uint8Array.from([...r].map(c=>c.charCodeAt(0)))}

$('#client-login-form').addEventListener('submit',async e=>{
  e.preventDefault();$('#client-login-error').textContent='';const b=e.submitter;UI.setBusy(b,true,'Ingresando...');
  try{await api('/api/client/login',{method:'POST',body:JSON.stringify({pin:$('#client-pin').value})});await loadMe();UI.notify('Acceso correcto.','success');showMain()}
  catch(x){$('#client-login-error').textContent=x.message;UI.notify(x.message,'error',{title:'No se pudo ingresar'})}
  finally{UI.setBusy(b,false)}
});
$('#forgot-pin').addEventListener('click',()=>$('#pin-help').classList.toggle('hidden'));
$('#client-logout').addEventListener('click',async()=>{try{await api('/api/client/logout',{method:'POST'})}catch{}state.me=null;state.vehicle=null;state.services=[];state.messages=[];showLogin()});
$('#enable-push').addEventListener('click',enablePush);

document.addEventListener('click',async e=>{
  const v=e.target.closest('[data-vehicle-id]');
  if(v){try{await selectVehicle(v.dataset.vehicleId)}catch(x){UI.notify(x.message,'error')}return}
  const s=e.target.closest('[data-service-index]');
  if(s){renderServiceDetail(state.services[Number(s.dataset.serviceIndex)]);showView('detail');return}
  const m=e.target.closest('[data-message-id]');
  if(m){await openMessage(m.dataset.messageId);return}
  const mb=e.target.closest('[data-message-back]');
  if(mb){renderMessageList();return}
  const n=e.target.closest('[data-go]');if(!n)return;
  const target=n.dataset.go;
  if(target==='vehicles'){showView('vehicles');return}
  if(target==='vehicle'){if(state.vehicle)showView('vehicle');else showView('vehicles');return}
  if(target==='history'){const ok=await loadHistory().catch(x=>{UI.notify(x.message,'error');return false});if(ok)showView('history');return}
  if(target==='detail'){
    if(!state.vehicle){UI.notify('Seleccioná primero un vehículo.','info',{title:'Elegí un vehículo'});showView('vehicles');return}
    if(!state.services.length)await loadHistory().catch(()=>false);
    renderServiceDetail(state.services[0]||state.vehicle?.latest_service);showView('detail');return;
  }
  if(target==='messages'){try{await loadMessages();showView('messages')}catch(x){UI.notify(x.message,'error')}return}
});

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>UI.notify('No se pudo registrar el modo PWA.','warning')));

(async()=>{try{await loadMe();showMain()}catch{showLogin()}})();
