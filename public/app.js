(() => {
  'use strict';

  let PRICE = 1299; // ₹ per person, GST inclusive; replaced by /api/config — the server sets the real amount
  const MAX_QTY = 4;
  const SESSION_START = new Date('2026-10-10T08:30:00+05:30');
  const SESSION_END = new Date('2026-10-10T11:00:00+05:30');
  const ROLES = ['Founder', 'Co-founder', 'Operator', 'Investor'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const inr = n => '₹' + n.toLocaleString('en-IN');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { step: 0, role: ROLES[0], qty: 1, method: 'upi', booking: null, leadId: null, lead: null };
  const checkout = $('#checkout');
  const form = $('#detailsForm');
  let lastOpener = null;

  /* ---------- Marquee ---------- */
  (function buildMarquee() {
    const words = ['Recover.', 'Refocus.', 'Rebuild.', 'Breathe.', 'Plunge.', 'Reset.'];
    const set = () => {
      const el = document.createElement('div');
      el.className = 'marquee__set';
      [...words, ...words].forEach((w, i) => {
        const item = document.createElement('span');
        item.className = 'marquee__item' + (i % 3 === 1 ? ' marquee__item--ice' : '');
        item.append(w);
        const ring = document.createElement('span');
        ring.className = 'marquee__ring';
        item.append(ring);
        el.append(item);
      });
      return el;
    };
    $('#marquee').append(set(), set());
  })();

  /* ---------- Countdown ---------- */
  function renderCountdown() {
    const diff = Math.max(0, SESSION_START - Date.now());
    const pad = n => String(n).padStart(2, '0');
    const units = [
      [Math.floor(diff / 864e5), 'D', 'DAYS'],
      [Math.floor(diff / 36e5) % 24, 'H', 'HRS'],
      [Math.floor(diff / 6e4) % 60, 'M', 'MIN'],
      [Math.floor(diff / 1e3) % 60, 'S', 'SEC'],
    ];
    const show = diff > 0;
    $$('[data-countdown="inline"]').forEach(el => {
      el.innerHTML = show ? units.map(([v, k]) => `<span>${pad(v)}${k}</span>`).join('') : '';
    });
    $$('[data-countdown="tiles"]').forEach(el => {
      el.innerHTML = show ? units.map(([v, , k]) => `<div class="cd-tile"><div class="cd-tile__v">${pad(v)}</div><div class="cd-tile__k">${k}</div></div>`).join('') : '';
    });
  }
  renderCountdown();
  setInterval(renderCountdown, 1000);

  /* ---------- Scroll reveal ---------- */
  (function setupReveal() {
    const els = $$('[data-reveal]');
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    els.forEach((el, i) => {
      el.style.opacity = 0;
      el.style.transform = 'translateY(32px)';
      const d = (i % 4) * 0.08;
      el.style.transition = `opacity .9s cubic-bezier(.2,.7,.2,1) ${d}s, transform .9s cubic-bezier(.2,.7,.2,1) ${d}s, box-shadow .3s`;
    });
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.opacity = 1;
      e.target.style.transform = 'none';
      io.unobserve(e.target);
    }), { threshold: 0.12 });
    els.forEach(el => io.observe(el));
  })();

  /* ---------- Mobile register bar ---------- */
  const onScroll = () => document.body.classList.toggle('show-bar', window.scrollY > 520);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Checkout: rendering ---------- */
  const total = () => PRICE * state.qty;
  const gst = () => Math.round(total() - total() / 1.18);
  const values = () => ({
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.replace(/\D/g, ''),
    company: form.elements.company.value.trim(),
    role: state.role,
    qty: state.qty,
    waiver: form.elements.waiver.checked,
  });

  function bind(key, text) {
    $$(`[data-bind="${key}"]`, checkout).forEach(el => { el.textContent = text; });
  }

  function renderSummary() {
    $('#qty').textContent = state.qty;
    $('[data-qty="-1"]').disabled = state.qty <= 1;
    $('[data-qty="1"]').disabled = state.qty >= MAX_QTY;
    bind('qty', state.qty);
    bind('total', inr(total()));
    bind('gst', inr(gst()));
    $('#payLabel').textContent = 'PAY ' + inr(total());
  }

  function renderRoles() {
    const wrap = $('#roles');
    wrap.innerHTML = '';
    ROLES.forEach(r => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(r === state.role));
      b.textContent = r;
      b.addEventListener('click', () => { state.role = r; renderRoles(); });
      wrap.append(b);
    });
  }

  function renderMethod() {
    $$('.tab', checkout).forEach(t => t.setAttribute('aria-selected', String(t.dataset.method === state.method)));
    $$('[data-panel]', checkout).forEach(p => { p.hidden = p.dataset.panel !== state.method; });
  }

  function setStep(step) {
    state.step = step;
    const view = { 1: 'details', 2: 'payment', 3: 'processing', 4: 'done' }[step];
    $('[data-view="flow"]').hidden = !(step === 1 || step === 2);
    $('[data-view="details"]').hidden = view !== 'details';
    $('[data-view="payment"]').hidden = view !== 'payment';
    $('[data-view="processing"]').hidden = view !== 'processing';
    $('[data-view="done"]').hidden = view !== 'done';
    $$('.step', checkout).forEach(s => s.classList.toggle('is-on', step >= Number(s.dataset.step)));
    checkout.scrollTop = 0;
  }

  function showErrors(errors) {
    ['name', 'email', 'phone', 'waiver'].forEach(k => {
      const msg = errors[k] || '';
      $(`[data-err="${k}"]`, form).textContent = msg;
      if (k === 'phone') $('.phone', form).classList.toggle('is-invalid', !!msg);
      else if (k !== 'waiver') form.elements[k].setAttribute('aria-invalid', String(!!msg));
    });
  }

  function validate(v) {
    const e = {};
    if (!v.name) e.name = 'Please enter your name';
    if (!EMAIL_RE.test(v.email)) e.email = 'Enter a valid email';
    if (v.phone.length !== 10) e.phone = 'Enter a 10-digit mobile number';
    if (!v.waiver) e.waiver = 'Please confirm to continue';
    return e;
  }

  function payError(msg) {
    const el = $('#payError');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function setPaying(on) {
    const btn = $('#payBtn');
    btn.disabled = on;
    $('#payLabel').textContent = on ? 'OPENING SECURE CHECKOUT…' : 'PAY ' + inr(total());
  }

  /* ---------- Checkout: open / close ---------- */
  function open(opener, { auto = false } = {}) {
    lastOpener = opener || document.activeElement;
    checkout.hidden = false;
    document.body.classList.add('locked');
    if (state.step === 0 || state.step === 4) { state.booking = null; setStep(1); }
    else setStep(state.step);
    // When it opens by itself, don't focus a text field: on phones that would pop up the keyboard.
    const target = auto ? $('.checkout__panel', checkout) : state.step === 1 ? form.elements.name : $('#payBtn');
    setTimeout(() => target.focus({ preventScroll: true }), 50);
  }

  function close() {
    if (state.step === 3) return; // never abandon a payment that is being confirmed
    checkout.hidden = true;
    document.body.classList.remove('locked');
    if (state.step === 4) { form.reset(); state.qty = 1; state.role = ROLES[0]; state.leadId = null; state.lead = null; renderRoles(); renderSummary(); setStep(0); }
    lastOpener && lastOpener.focus && lastOpener.focus({ preventScroll: true });
  }

  $$('[data-open-checkout]').forEach(b => b.addEventListener('click', () => open(b)));
  $$('[data-close]', checkout).forEach(b => b.addEventListener('click', close));
  checkout.addEventListener('click', e => { if (e.target === checkout) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !checkout.hidden) close(); });

  /* ---------- Step 1: details ---------- */
  // Accept a pasted "+91 98450 12345" or "098450-12345" by dropping the country/trunk prefix.
  form.elements.phone.addEventListener('input', e => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    e.target.value = d.slice(0, 10);
  });
  ['name', 'email', 'phone'].forEach(k => form.elements[k].addEventListener('input', () => {
    $(`[data-err="${k}"]`, form).textContent = '';
    if (k === 'phone') $('.phone', form).classList.remove('is-invalid');
    else form.elements[k].removeAttribute('aria-invalid');
  }));
  form.elements.waiver.addEventListener('change', () => { $('[data-err="waiver"]', form).textContent = ''; });
  $$('[data-qty]', form).forEach(b => b.addEventListener('click', () => {
    state.qty = Math.min(MAX_QTY, Math.max(1, state.qty + Number(b.dataset.qty)));
    renderSummary();
  }));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = values();
    const errors = validate(v);
    showErrors(errors);
    if (Object.keys(errors).length) {
      const first = ['name', 'email', 'phone'].find(k => errors[k]);
      (first ? form.elements[first] : form.elements.waiver).focus();
      return;
    }
    bind('name', v.name);
    bind('nameUpper', v.name.toUpperCase());
    payError('');
    setStep(2);
    // Save the lead in the background; the Pay step waits for it only to reuse the same lead id.
    // Chained so a quick edit-and-continue reuses the first lead id instead of making a second row.
    state.lead = Promise.resolve(state.lead)
      .then(() => postJson('/api/leads', { ...v, leadId: state.leadId }))
      .then(r => { state.leadId = r.leadId; })
      .catch(() => {});
  });

  /* ---------- Step 2: payment ---------- */
  $$('.tab', checkout).forEach(t => t.addEventListener('click', () => { state.method = t.dataset.method; renderMethod(); }));
  $('[data-back]', checkout).addEventListener('click', () => setStep(1));

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.data = data; throw err; }
    return data;
  }

  $('#payBtn').addEventListener('click', async () => {
    payError('');
    if (typeof window.Razorpay !== 'function') {
      payError('The payment window could not load. Check your connection or disable content blockers, then try again.');
      return;
    }
    const v = values();
    setPaying(true);
    let order;
    try {
      await state.lead;
      order = await postJson('/api/orders', { ...v, leadId: state.leadId });
    } catch (err) {
      setPaying(false);
      if (err.data && err.data.errors && Object.keys(err.data.errors).length) { showErrors(err.data.errors); setStep(1); return; }
      payError(err.message);
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'MINARAA × Startup Park',
      description: `Founders, Reset Your Energy · ${v.qty} pass${v.qty > 1 ? 'es' : ''}`,
      image: new URL('assets/minaraa-lotus.png', location.href).href,
      prefill: { name: v.name, email: v.email, contact: '+91' + v.phone, method: state.method },
      notes: { booking_id: order.bookingId },
      theme: { color: '#2F5BFF' },
      handler: confirmPayment,
      modal: {
        ondismiss: () => { setPaying(false); if (state.step === 2) payError('Payment window closed — you have not been charged. You can try again.'); },
      },
    });
    rzp.on('payment.failed', r => {
      const reason = r && r.error && (r.error.description || r.error.reason);
      payError((reason ? reason + ' ' : 'Payment failed. ') + 'Please try again or choose another method.');
    });
    rzp.open();
  });

  /* ---------- Step 3 → 4: confirm ---------- */
  async function confirmPayment(resp) {
    setPaying(false);
    setStep(3);
    try {
      const booking = await postJson('/api/payments/verify', {
        orderId: resp.razorpay_order_id,
        paymentId: resp.razorpay_payment_id,
        signature: resp.razorpay_signature,
      });
      state.booking = booking;
      bind('name', booking.name);
      bind('firstName', booking.name.split(/\s+/)[0]);
      bind('email', booking.email);
      $('#doneEmailed').hidden = !booking.emailed;
      $('#doneNotEmailed').hidden = booking.emailed;
      bind('qty', booking.qty);
      bind('total', inr(booking.amount / 100));
      bind('bookingId', booking.bookingId);
      $('#ticketQr').innerHTML = booking.qrSvg; // SVG generated by our server from the booking id
      setStep(4);
    } catch (err) {
      setStep(2);
      payError(err.message + (resp && resp.razorpay_payment_id ? ` (Payment ID: ${resp.razorpay_payment_id})` : ''));
    }
  }

  /* ---------- Step 4: pass actions ---------- */
  $('#addCal').addEventListener('click', () => {
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const id = state.booking ? state.booking.bookingId : 'MNR-1010';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MINARAA x Startup Park//Founders Reset//EN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${id}@minaraa-startuppark`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(SESSION_START)}`,
      `DTEND:${fmt(SESSION_END)}`,
      'SUMMARY:Founders\\, Reset Your Energy — MINARAA × Startup Park',
      `DESCRIPTION:Booking ${id}. Bring swimwear\\, a towel and a change of clothes.`,
      'LOCATION:iQue Startup Park\\, Hosur Road\\, near Madiwala\\, Bengaluru',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'founders-reset-your-energy.ics';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#printPass').addEventListener('click', () => window.print());

  renderRoles();
  renderMethod();
  renderSummary();
  fetch('/api/config').then(r => r.json()).then(c => {
    if (Number.isInteger(c.pricePaise) && c.pricePaise / 100 !== PRICE) { PRICE = c.pricePaise / 100; renderSummary(); }
  }).catch(() => {});

  // The registration form opens as soon as the page loads; closing it reveals the landing page.
  open(null, { auto: true });
})();
