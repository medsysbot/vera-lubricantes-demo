(() => {
  const icon = (name, className = '') => window.VeraIcons?.icon(name, className) || '';
  let toastHost;
  let confirmDialog;

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
      info: ['circle-info', 'Información'],
      success: ['circle-check', 'Listo'],
      warning: ['triangle-exclamation', 'Atención'],
      error: ['circle-xmark', 'Error'],
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
    confirmDialog.innerHTML = `
      <div class="vera-confirm-icon"></div>
      <div class="vera-confirm-copy">
        <p class="eyebrow">Confirmación</p>
        <h2 class="vera-confirm-title">Confirmar acción</h2>
        <p class="vera-confirm-message"></p>
      </div>
      <div class="vera-confirm-actions">
        <button class="btn vera-confirm-cancel" type="button">Cancelar</button>
        <button class="btn primary vera-confirm-accept" type="button">Confirmar</button>
      </div>`;
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
        accept.removeEventListener('click', yes);
        cancel.removeEventListener('click', no);
        dialog.removeEventListener('cancel', onCancel);
        dialog.close();
        resolve(value);
      };
      const yes = () => finish(true);
      const no = () => finish(false);
      const onCancel = e => { e.preventDefault(); finish(false); };
      accept.addEventListener('click', yes);
      cancel.addEventListener('click', no);
      dialog.addEventListener('cancel', onCancel);
    });
  }

  function setBusy(button, busy, text = 'Procesando...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-busy');
      button.innerHTML = `${icon('spinner', 'is-spinning')}<span>${escapeHtml(text)}</span>`;
    } else {
      button.disabled = false;
      button.classList.remove('is-busy');
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  function decorateIcons(root = document) {
    root.querySelectorAll('[data-fa]').forEach(el => {
      el.innerHTML = icon(el.dataset.fa, el.dataset.faClass || '');
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  window.VeraUI = { icon, notify, confirmAction, setBusy, decorateIcons };
  document.addEventListener('DOMContentLoaded', () => decorateIcons());
})();
