(() => {
  const icon = (name, className = '') => window.VeraIcons?.icon(name, className) || '';
  let toastHost;
  let confirmDialog;

  function injectStyles() {
    if (document.getElementById('vera-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'vera-ui-styles';
    style.textContent = `
      .fa-svg{width:1em;height:1em;display:inline-block;vertical-align:-.125em;fill:currentColor;flex:0 0 auto}.is-spinning{animation:vera-spin .85s linear infinite}@keyframes vera-spin{to{transform:rotate(360deg)}}
      .admin-body .admin-nav button{display:flex;align-items:center;gap:13px;padding-left:16px}.admin-body .admin-nav button:before{display:none!important}.admin-body .nav-icon{display:grid;place-items:center;width:18px;color:#8190a0;font-size:.95rem}.admin-body .admin-nav button.active .nav-icon{color:#efc778}.admin-body .action-icon .fa-svg{width:1.05em;height:1.05em}.admin-body .search-icon{display:grid;place-items:center}.admin-body .btn .fa-svg,.admin-body .record-actions .fa-svg{width:.95em;height:.95em}
      .vera-toast-host{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;pointer-events:none;padding:24px;background:rgba(0,0,0,.18);backdrop-filter:blur(1.5px)}
      .vera-toast-host:empty{display:none}.vera-toast{pointer-events:auto;width:min(92vw,520px);display:grid;grid-template-columns:64px 1fr 30px;gap:18px;align-items:center;padding:24px 22px;border:1px solid rgba(217,162,76,.38);border-radius:18px;background:linear-gradient(145deg,rgba(13,29,43,.99),rgba(4,13,22,.995));color:#f6f3ec;box-shadow:0 30px 90px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.035);animation:vera-toast-in .2s ease-out}
      .vera-toast-icon{display:grid;place-items:center;width:60px;height:60px;border:1px solid rgba(217,162,76,.46);border-radius:50%;color:#efc778;background:rgba(217,162,76,.08);font-size:1.65rem}.vera-toast-success .vera-toast-icon{color:#78dbae;border-color:rgba(43,200,138,.4);background:rgba(43,200,138,.1)}.vera-toast-error .vera-toast-icon{color:#ff8e98;border-color:rgba(217,47,61,.48);background:rgba(217,47,61,.12)}.vera-toast-warning .vera-toast-icon{color:#f0c775}.vera-toast-copy strong,.vera-toast-copy span{display:block}.vera-toast-copy strong{font-family:Georgia,"Times New Roman",serif;font-size:1.35rem;font-weight:500}.vera-toast-copy span{margin-top:6px;color:#b4bdc6;font-size:.92rem;line-height:1.5}.vera-toast-close{align-self:start;border:0;background:transparent;color:#8b98a5;font-size:1.3rem;cursor:pointer;padding:0}.vera-toast.is-leaving{opacity:0;transform:scale(.97);transition:.18s}
      .vera-confirm{width:min(92vw,540px);border:1px solid rgba(217,162,76,.4);border-radius:19px;color:#f6f3ec;background:linear-gradient(145deg,#0d1d2b,#050f19);padding:28px;box-shadow:0 35px 100px rgba(0,0,0,.68)}.vera-confirm::backdrop{background:rgba(0,0,0,.78);backdrop-filter:blur(5px)}.vera-confirm-icon{display:grid;place-items:center;width:66px;height:66px;border:1px solid rgba(217,162,76,.48);border-radius:50%;color:#efc778;margin:0 auto 18px;font-size:1.75rem;background:rgba(217,162,76,.06)}.vera-confirm-copy{text-align:center}.vera-confirm .eyebrow{margin-bottom:8px}.vera-confirm h2{margin:0 0 9px;font-size:1.8rem}.vera-confirm-message{margin:0 auto;color:#aeb8c2;font-size:.94rem;line-height:1.55;max-width:440px}.vera-confirm-actions{display:flex;justify-content:center;gap:12px;margin-top:24px}.vera-confirm-actions .btn{min-width:145px}.vera-confirm-accept.danger{background:#8f2630;border-color:#c64a56;color:#fff}.is-busy{pointer-events:none;opacity:.78}@keyframes vera-toast-in{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
      @media(max-width:560px){.vera-toast{grid-template-columns:52px 1fr 22px;padding:20px 17px;gap:13px}.vera-toast-icon{width:50px;height:50px;font-size:1.35rem}.vera-toast-copy strong{font-size:1.16rem}.vera-toast-copy span{font-size:.84rem}.vera-confirm{padding:24px 18px}.vera-confirm-actions{display:grid}.vera-confirm-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureToastHost() {
    if (toastHost) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'vera-toast-host';
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function notify(message, type = 'info', options = {}) {
    const host = ensureToastHost();
    host.querySelectorAll('.vera-toast').forEach(item => item.remove());
    const map = {
      info: ['circle-info', 'Información'], success: ['circle-check', 'Listo'],
      warning: ['triangle-exclamation', 'Atención'], error: ['circle-xmark', 'Error'],
      loading: ['spinner', 'Procesando']
    };
    const [iconName, fallbackTitle] = map[type] || map.info;
    const toast = document.createElement('div');
    toast.className = `vera-toast vera-toast-${type}`;
    toast.innerHTML = `<span class="vera-toast-icon ${type === 'loading' ? 'is-spinning' : ''}">${icon(iconName)}</span><span class="vera-toast-copy"><strong>${escapeHtml(options.title || fallbackTitle)}</strong><span>${escapeHtml(message)}</span></span><button class="vera-toast-close" type="button" aria-label="Cerrar">×</button>`;
    host.appendChild(toast);
    const close = () => { if (!toast.isConnected) return; toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 180); };
    toast.querySelector('.vera-toast-close').addEventListener('click', close);
    if (type !== 'loading') setTimeout(close, options.duration || 2600);
    return { close, element: toast };
  }

  function ensureConfirmDialog() {
    if (confirmDialog) return confirmDialog;
    confirmDialog = document.createElement('dialog');
    confirmDialog.className = 'vera-confirm';
    confirmDialog.innerHTML = `<div class="vera-confirm-icon"></div><div class="vera-confirm-copy"><p class="eyebrow">Confirmación</p><h2 class="vera-confirm-title">Confirmar acción</h2><p class="vera-confirm-message"></p></div><div class="vera-confirm-actions"><button class="btn vera-confirm-cancel" type="button">Cancelar</button><button class="btn primary vera-confirm-accept" type="button">Confirmar</button></div>`;
    document.body.appendChild(confirmDialog);
    return confirmDialog;
  }

  function confirmAction({ title = 'Confirmar acción', message, confirmText = 'Confirmar', danger = false } = {}) {
    const dialog = ensureConfirmDialog();
    dialog.querySelector('.vera-confirm-icon').innerHTML = icon(danger ? 'triangle-exclamation' : 'circle-info');
    dialog.querySelector('.vera-confirm-title').textContent = title;
    dialog.querySelector('.vera-confirm-message').textContent = message || '';
    const accept = dialog.querySelector('.vera-confirm-accept');
    const cancel = dialog.querySelector('.vera-confirm-cancel');
    accept.textContent = confirmText;
    accept.classList.toggle('danger', danger);
    accept.classList.toggle('primary', !danger);
    dialog.showModal();
    return new Promise(resolve => {
      const finish = value => {
        accept.removeEventListener('click', yes); cancel.removeEventListener('click', no); dialog.removeEventListener('cancel', onCancel); dialog.close(); resolve(value);
      };
      const yes = () => finish(true), no = () => finish(false), onCancel = event => { event.preventDefault(); finish(false); };
      accept.addEventListener('click', yes); cancel.addEventListener('click', no); dialog.addEventListener('cancel', onCancel);
    });
  }

  function setBusy(button, busy, text = 'Procesando...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML; button.disabled = true; button.classList.add('is-busy');
      button.innerHTML = `${icon('spinner', 'is-spinning')}<span>${escapeHtml(text)}</span>`;
    } else {
      button.disabled = false; button.classList.remove('is-busy');
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  function decorateIcons(root = document) {
    root.querySelectorAll('[data-fa]').forEach(el => { el.innerHTML = icon(el.dataset.fa, el.dataset.faClass || ''); });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  injectStyles();
  window.VeraUI = { icon, notify, confirmAction, setBusy, decorateIcons };
  document.addEventListener('DOMContentLoaded', () => decorateIcons());
})();