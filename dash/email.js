// Call the Netlify Resend function from the browser.
(function () {
  async function send({ to, subject, html, text }) {
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send email');
    return data;
  }

  window.PeekdEmail = { send };
})();
