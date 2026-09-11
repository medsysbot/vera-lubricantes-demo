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
      #new-client-form:not(.hidden)+#client-results>.notice{display:none!important}
      .client-body .personal-card{display:none!important}

      .vera-toast-host{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;pointer-events:none;padding:24px}
      .vera-toast-host:empty{display:none}
      .vera-toast{width:min(88vw,560px);display:grid;grid-template-columns:58px minmax(0,1fr);align-items:center;gap:18px;padding:28px 30px;border:0;border-radius:14px;background:rgba(0,0,0,.82);backdrop-filter:blur(10px);color:#fff;box-shadow:0 20px 55px rgba(0,0,0,.35);animation:vera-toast-in .18s ease-out}
      .vera-toast-icon{display:grid;place-items:center;width:52px;height:52px;color:#efc778;font-size:1.8rem}
      .vera-toast-message{display:block;color:#fff;font-family:var(--sans,Arial,sans-serif);font-size:1.05rem;font-weight:700;line-height:1.42;letter-spacing:.005em}
      .vera-toast.is-leaving{opacity:0;transform:scale(.985);transition:.16s ease}

      .vera-confirm{width:min(88vw,560px);border:0;border-radius:14px;color:#fff;background:rgba(0,0,0,.88);padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.45)}
      .vera-confirm::backdrop{background:rgba(0,0,0,.42);backdrop-filter:blur(3px)}
      .vera-confirm-icon{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 16px;color:#efc778;font-size:2rem}
      .vera-confirm-copy{text-align:center}
      .vera-confirm-title{display:block;margin:0;color:#fff;font-family:var(--sans,Arial,sans-serif);font-size:1.08rem;font-weight:800;line-height:1.4}
      .vera-confirm-message{margin:8px auto 0;max-width:450px;color:#fff;font-size:.94rem;line-height:1.5}
      .vera-confirm-actions{display:flex;justify-content:center;gap:12px;margin-top:24px}
      .vera-confirm-actions .btn{min-width:145px}
      .vera-confirm-accept,.vera-confirm-accept.danger{background:#efc778;border-color:#efc778;color:#070707}
      .is-busy{pointer-events:none;opacity:.78}
      @keyframes vera-toast-in{from{opacity:0;transform:scale(.975) translateY(6px)}to{opacity:1;transform:none}}
      @media(max-width:560px){.vera-toast{grid-template-columns:50px minmax(0,1fr);gap:14px;padding:24px 22px}.vera-toast-icon{width:46px;height:46px;font-size:1.55rem}.vera-toast-message{font-size:.98rem}.vera-confirm{padding:26px 20px}.vera-confirm-actions{display:grid}.vera-confirm-actions .btn{width:100%}}
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
    if (type === 'loading') return { close() {}, element: null };

    const host = ensureToastHost();
    host.querySelectorAll('.vera-toast').forEach(item => item.remove());
    const icons = {
      info: 'circle-info',
      success: 'circle-check',
      warning: 'triangle-exclamation',
      error: 'circle-xmark'
    };
    const toast = document.createElement('div');
    toast.className = 'vera-toast';
    toast.innerHTML = `<span class="vera-toast-icon">${icon(icons[type] || icons.info)}</span><span class="vera-toast-message">${escapeHtml(message)}</span>`;
    host.appendChild(toast);

    const close = () => {
      if (!toast.isConnected) return;
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 160);
    };
    const duration = options.duration || (type === 'error' || type === 'warning' ? 3200 : 2200);
    setTimeout(close, duration);
    return { close, element: toast };
  }

  function ensureConfirmDialog() {
    if (confirmDialog) return confirmDialog;
    confirmDialog = document.createElement('dialog');
    confirmDialog.className = 'vera-confirm';
    confirmDialog.innerHTML = `<div class="vera-confirm-icon"></div><div class="vera-confirm-copy"><strong class="vera-confirm-title"></strong><p class="vera-confirm-message"></p></div><div class="vera-confirm-actions"><button class="btn vera-confirm-cancel" type="button">Cancelar</button><button class="btn vera-confirm-accept" type="button">Confirmar</button></div>`;
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
      const onCancel = event => { event.preventDefault(); finish(false); };
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
    root.querySelectorAll('[data-fa]').forEach(el => { el.innerHTML = icon(el.dataset.fa, el.dataset.faClass || ''); });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  injectStyles();
  window.VeraUI = { icon, notify, confirmAction, setBusy, decorateIcons };
  document.addEventListener('DOMContentLoaded', () => decorateIcons());
})();