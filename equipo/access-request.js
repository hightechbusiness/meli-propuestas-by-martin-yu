(() => {
  'use strict';
  const link = document.getElementById('request-gmail');
  const button = document.getElementById('request-copy');
  const status = document.getElementById('request-status');
  const fallback = document.getElementById('request-fallback');
  const text = document.getElementById('request-text');
  if (!link || !button || !status || !fallback || !text) return;

  let requestText;
  try {
    const address = new URL(link.href);
    if (address.origin !== 'https://mail.google.com' || address.pathname !== '/mail/') return;
    const to = address.searchParams.get('to');
    const subject = address.searchParams.get('su');
    const body = address.searchParams.get('body');
    if (!to || !subject || !body) return;
    requestText = `Para: ${to}\nAsunto: ${subject}\n\n${body}`;
  } catch { return; }

  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) throw new Error('Manual copy');
      await navigator.clipboard.writeText(requestText);
      fallback.hidden = true;
      status.textContent = 'Solicitud copiada. Pegala en tu correo, completá tus datos y enviala a Martin.';
    } catch {
      text.value = requestText;
      fallback.hidden = false;
      text.focus();
      text.select();
      status.textContent = 'El texto quedó seleccionado para que lo copies. Completá tus datos antes de enviarlo desde tu correo.';
    } finally {
      status.hidden = false;
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  });
})();
