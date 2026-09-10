const adminViews = [...document.querySelectorAll('[data-admin-view]')];
const adminButtons = [...document.querySelectorAll('[data-admin-go]')];

function showAdminView(name) {
  const target = adminViews.find((view) => view.dataset.adminView === name);
  if (!target) return;

  adminViews.forEach((view) => view.classList.toggle('active', view === target));
  adminButtons.forEach((button) => {
    if (button.closest('.admin-nav')) {
      button.classList.toggle('active', button.dataset.adminGo === name);
    }
  });

  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', (event) => {
  const navigationButton = event.target.closest('[data-admin-go]');
  if (navigationButton) {
    event.preventDefault();
    showAdminView(navigationButton.dataset.adminGo);
    return;
  }

  const panelButton = event.target.closest('[data-toggle-panel]');
  if (panelButton) {
    const panel = document.getElementById(panelButton.dataset.togglePanel);
    panel?.classList.toggle('hidden');
  }
});
