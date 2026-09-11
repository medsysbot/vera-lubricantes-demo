const state={me:null,vehicle:null,services:[],messages:[],messageSending:false,messageDeleting:false};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const UI=window.VeraUI;
const icon=(name,cls='')=>UI?.icon(name,cls)||'';
const devClient=new URLSearchParams(location.search).get('client');
let messagePressTimer=null,messagePressStart=null,suppressMessageClickUntil=0;

async function api(url,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(devClient)headers['X-VERA-Dev-Client']=devClient;
  const r=await fetch(url,{credentials:'same-origin',headers,...options});
  if(!r.ok){let m=`Error ${r.status}`;try{m=(await r.json()).detail||m}catch{}if(Array.isArray(m))m=m.map(item=>item.msg||'Datos inválidos').join('. ');const e=new Error(m);e.status=r.status;throw e}
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
  $('#client-message-form').reset();
  $('#client-message-error').textContent='';
  $('#message-list').innerHTML='';
  state.messages=[];
  updateClientMessageSelection();
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
function promotionContent(m,detail=false){
  if(m.message_type!=='promotion')return `<h3>${esc(m.title)}</h3><p>${esc(m.body)}</p>`;
  const item=m.promotion_item?`<div class="promotion-item">${esc(m.promotion_item)}</div>`:'';
  return `${item}<div class="promotion-title">${esc(m.title)}</div><p class="promotion-detail">${esc(m.body)}</p>`;
}
function clientMessageStatus(m){
  if(m.sender_role==='client')return m.is_read?'Leído por el lubricentro':'Enviado · Sin leer por el lubricentro';
  return m.is_read?'Leído':'Sin leer';
}
function selectedClientMessageIds(){
  return $$('[data-client-message-select]:checked',$('#message-list')).map(input=>input.value);
}
function updateClientMessageSelection(){
  const count=selectedClientMessageIds().length;
  $('#client-message-selection-count').textContent=`${count} mensaje${count===1?'':'s'} seleccionado${count===1?'':'s'}`;
  $('#delete-client-messages').disabled=count===0;
}
function renderMessageList(){
  $('#client-message-selection').classList.remove('hidden');
  const ms=state.messages;
  $('#message-list').innerHTML=ms.length?ms.map(m=>`<article class="message-card selectable ${m.sender_role==='admin'&&!m.is_read?'unread':''}">
    <label class="message-selection-label"><input class="message-select" type="checkbox" data-client-message-select value="${esc(m.id)}"><span>Seleccionar ${esc(m.title)}</span></label>
    <span class="message-icon">${icon(messageIcon(m.message_type))}</span>
    <button class="message-open" type="button" data-message-id="${esc(m.id)}"><span class="message-tag">${m.sender_role==='client'?'Para el lubricentro':messageLabel(m.message_type)}</span>${promotionContent(m)}<time>${fmtDateTime(m.created_at)}</time><span class="message-read-status">${clientMessageStatus(m)}</span></button>
  </article>`).join(''):`<div class="client-empty glass-card">${icon('circle-info')}<p>No tenés mensajes por el momento.</p></div>`;
  updateClientMessageSelection();
  UI.decorateIcons(document);
}
function renderMessageDetail(m){
  if(!m){renderMessageList();return}
  $('#client-message-selection').classList.add('hidden');
  $('#message-list').innerHTML=`<button type="button" class="link-button" data-message-back>&larr; Volver a mensajes</button><article class="message-card message-detail-card"><span class="message-icon">${icon(messageIcon(m.message_type))}</span><div class="message-copy"><span class="message-tag">${m.sender_role==='client'?'Para el lubricentro':messageLabel(m.message_type)}</span>${promotionContent(m,true)}<time>${icon('circle-info')} ${fmtDateTime(m.created_at)}</time><div class="message-read-status">${clientMessageStatus(m)}</div></div></article><div class="message-detail-actions">${m.sender_role==='admin'?`<button class="btn" type="button" data-client-reply="${esc(m.id)}">${icon('comments')} Responder</button>`:''}<button class="btn danger" type="button" data-client-delete="${esc(m.id)}">${icon('trash-can')} Eliminar</button></div>`;
  UI.decorateIcons(document);
}
function updateUnreadState(){
  const unread=state.me?.unread_messages||0;
  $('#message-badge').textContent=unread;
  void syncSystemUnread(unread);
}
async function refreshUnreadState(){
  state.me=await api('/api/client/me');
  updateUnreadState();
}
async function openMessage(id){
  const m=state.messages.find(item=>String(item.id)===String(id));
  if(!m||m.reading)return;
  if(m.sender_role==='admin'&&!m.is_read){
    m.reading=true;
    try{
      const result=await api(`/api/client/messages/${encodeURIComponent(m.id)}/read`,{method:'POST'});
      m.is_read=true;m.read_at=result.read_at;
      if(state.me)state.me.unread_messages=Math.max(0,state.me.unread_messages-1);
      updateUnreadState();
    }catch(x){UI.notify(x.message,'error',{title:'No se pudo registrar la lectura'})}
    finally{delete m.reading}
  }
  renderMessageDetail(m);
}
async function deleteClientMessages(ids){
  if(!ids.length||state.messageDeleting)return;
  state.messageDeleting=true;
  const button=$('#delete-client-messages');
  try{
    const ok=await UI.confirmAction({title:'Eliminar mensajes',message:`Se eliminarán ${ids.length} mensaje(s) de tu bandeja. El lubricentro conservará su copia.`,confirmText:'Eliminar',danger:true});
    if(!ok)return;
    UI.setBusy(button,true,'Eliminando…');
    const result=await api('/api/client/messages',{method:'DELETE',body:JSON.stringify({ids})});
    state.messages=state.messages.filter(item=>!ids.includes(item.id));
    renderMessageList();
    UI.notify(`${result.deleted} mensaje(s) eliminado(s) de tu bandeja.`,'success');
    try{await refreshUnreadState()}catch{UI.notify('Se eliminaron los mensajes. Pulsá Actualizar para renovar el contador.','warning')}
  }catch(e){UI.notify(e.message,'error',{title:'No se pudo eliminar'})}
  finally{state.messageDeleting=false;UI.setBusy(button,false);updateClientMessageSelection()}
}
async function deleteMessage(id){return deleteClientMessages([id])}
function cancelMessagePress(){
  if(messagePressTimer){clearTimeout(messagePressTimer);messagePressTimer=null}
  messagePressStart=null;
}
async function loadMessages(){
  const loading=UI.notify('Actualizando mensajes...','loading',{title:'Mensajes VERA'});
  try{
    const [messages,me]=await Promise.all([api('/api/client/messages'),api('/api/client/me')]);
    state.messages=messages;state.me=me;
    updateUnreadState();
    renderMessageList();
  }finally{loading.close()}
}

$('#message-list').addEventListener('change',updateClientMessageSelection);
$('#delete-client-messages').addEventListener('click',()=>deleteClientMessages(selectedClientMessageIds()));
$('#refresh-client-messages').addEventListener('click',async e=>{
  const button=e.currentTarget;UI.setBusy(button,true,'Actualizando…');
  try{await loadMessages()}catch(x){UI.notify(x.message,'error')}
  finally{UI.setBusy(button,false)}
});
$('#client-message-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(state.messageSending)return;
  const form=e.currentTarget,button=$('#send-client-message'),error=$('#client-message-error');
  error.textContent='';
  const payload={title:form.elements.title.value.trim(),body:form.elements.body.value.trim()};
  if(!payload.title||!payload.body){error.textContent='Completá el asunto y el mensaje.';return}
  state.messageSending=true;UI.setBusy(button,true,'Enviando…');
  try{
    await api('/api/client/messages',{method:'POST',body:JSON.stringify(payload)});
    form.reset();UI.notify('Mensaje enviado al lubricentro.','success');
    try{await loadMessages()}catch{UI.notify('El mensaje se envió. Pulsá Actualizar para cargar el historial.','warning')}
  }catch(x){error.textContent=x.message;UI.notify(x.message,'error',{title:'No se pudo enviar'})}
  finally{state.messageSending=false;UI.setBusy(button,false)}
});

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

document.addEventListener('pointerdown',e=>{
  const card=e.target.closest('[data-message-id]');
  if(!card||(e.pointerType==='mouse'&&e.button!==0))return;
  cancelMessagePress();
  messagePressStart={id:card.dataset.messageId,x:e.clientX,y:e.clientY};
  messagePressTimer=setTimeout(()=>{
    const id=messagePressStart?.id;
    suppressMessageClickUntil=Date.now()+1200;
    cancelMessagePress();
    if(id)void deleteMessage(id);
  },650);
});
document.addEventListener('pointermove',e=>{
  if(!messagePressStart)return;
  if(Math.hypot(e.clientX-messagePressStart.x,e.clientY-messagePressStart.y)>12)cancelMessagePress();
});
document.addEventListener('pointerup',cancelMessagePress);
document.addEventListener('pointercancel',cancelMessagePress);
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-message-id]'))e.preventDefault()});

document.addEventListener('click',async e=>{
  const v=e.target.closest('[data-vehicle-id]');
  if(v){try{await selectVehicle(v.dataset.vehicleId)}catch(x){UI.notify(x.message,'error')}return}
  const s=e.target.closest('[data-service-index]');
  if(s){renderServiceDetail(state.services[Number(s.dataset.serviceIndex)]);showView('detail');return}
  const reply=e.target.closest('[data-client-reply]');
  if(reply){
    const message=state.messages.find(item=>item.id===reply.dataset.clientReply);
    if(message){const form=$('#client-message-form');if(!form.elements.title.value.trim())form.elements.title.value=message.title;form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.body.focus({preventScroll:true})}
    return;
  }
  const remove=e.target.closest('[data-client-delete]');
  if(remove){await deleteMessage(remove.dataset.clientDelete);return}
  const m=e.target.closest('[data-message-id]');
  if(m){if(Date.now()<suppressMessageClickUntil){e.preventDefault();return}await openMessage(m.dataset.messageId);return}
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
