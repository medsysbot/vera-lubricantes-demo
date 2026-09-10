const clientViews = [...document.querySelectorAll('[data-client-view]')];
const clientNav = document.getElementById('client-bottom-nav');
const pinInputs = [...document.querySelectorAll('.pin-digit')];

function showClientView(name) {
  const target = clientViews.find((view) => view.dataset.clientView === name);
  if (!target) return;

  clientViews.forEach((view) => view.classList.toggle('active', view === target));

  const showNav = name !== 'pin';
  clientNav.classList.toggle('hidden', !showNav);

  clientNav.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.clientGo === name);
  });

  window.scrollTo({ top: 0, behavior: 'auto' });
}

document.addEventListener('click', (event) => {
  const navigationButton = event.target.closest('[data-client-go]');
  if (navigationButton) {
    event.preventDefault();
    showClientView(navigationButton.dataset.clientGo);
  }
});

pinInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value && pinInputs[index + 1]) pinInputs[index + 1].focus();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !input.value && pinInputs[index - 1]) {
      pinInputs[index - 1].focus();
    }
  });
});

document.getElementById('show-pin-help')?.addEventListener('click', () => {
  document.getElementById('pin-help')?.classList.toggle('hidden');
});
