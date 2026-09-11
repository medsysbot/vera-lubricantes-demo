(() => {
  const icon = (name, className = '') => window.VeraIcons?.icon(name, className) || '';
  let toastHost;
  let confirmDialog;

  function injectStyles() {
    if (document.getElementById('vera-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'vera-ui-styles';
    style.textContent = `
      .fa-svg{width:1em;height:1em;display:inline-block;vertical-align:-.125em;fill:currentColor}.is-spinning{animation:vera-spin .85s linear infinite}@keyframes vera-spin{to{transform:rotate(360deg)}}
      .vera-toast-host{position:fixed;right:18px;top:18px;z-index:9999;display:grid;gap:10px;width:min(390px,calc(100vw - 30px))}.vera-toast{display:grid;grid-template-columns:36px 1fr 24px;gap:11px;align-items:start;padding:13px 13px 13px 12px;border:1px solid rgba(137,159,180,.28);border-radius:12px;background:rgba(5,16,27,.97);color:#f6f3ec;box-shadow:0 20px 55px rgba(0,0,0,.42);animation:vera-toast-in .18s ease-out}.vera-toast-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;color:#efc778;background:rgba(217,162,76,.09)}.vera-toast-success .vera-toast-icon{color:#78dbae;background:rgba(43,200,138,.1)}.vera-toast-error .vera-toast-icon{color:#ff8e98;background:rgba(217,47,61,.12)}.vera-toast-warning .vera-toast-icon{color:#f0c775}.vera-toast-copy strong,.vera-toast-copy span{display:block}.vera-toast-copy strong{font-size:.75rem}.vera-toast-copy span{margin-top:3px;color:#aeb8c2;font-size:.7rem;line-height:1.4}.vera-toast-close{border:0;background:transparent;color:#718091;font-size:1rem;cursor:pointer}.vera-toast.is-leaving{opacity:0;transform:translateX(10px);transition:.18s}.vera-confirm{width:min(92vw,430px);border:1px solid rgba(217,162,76,.3);border-radius:16px;color:#f6f3ec;background:#07131f;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.55)}.vera-confirm::backdrop{background:rgba(0,0,0,.76);backdrop-filter:blur(4px)}.vera-confirm-icon{display:grid;place-items:center;width:46px;height:46px;border:1px solid rgba(217,162,76,.4);border-radius:50%;color:#efc778;margin-bottom:14px}.vera-confirm h2{margin:0 0 7px}.vera-confirm-message{margin:0;color:#9ca8b5;font-size:.82rem;line-height:1.5}.vera-confirm-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.vera-confirm-accept.danger{background:#8f2630;border-color:#c64a56;color:#fff}.is-busy{pointer-events:none;opacity:.75}@keyframes vera-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@media(max-width:560px){.vera-confirm-actions{display:grid}}
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
    const close = () => { toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 180); };
    toast.querySelector('.vera-toast-close').addEventListener('click', close);
    if (type !== 'loading') setTimeout(close, options.duration || 4200);
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
