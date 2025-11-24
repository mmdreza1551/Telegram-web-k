const views = document.querySelectorAll('[data-view]');
const steps = document.querySelectorAll('[data-step]');
const progressBar = document.querySelector('.progress__bar span');
const pill = document.getElementById('pill-status');
const phoneForm = document.getElementById('phone-form');
const phoneInput = document.getElementById('phone-input');
const codeForm = document.getElementById('code-form');
const otpInputs = Array.from(document.querySelectorAll('#otp-inputs input'));
const passwordForm = document.getElementById('password-form');
const passwordHint = document.getElementById('password-hint');
const codeTarget = document.getElementById('code-target');
const timer = document.getElementById('timer');
const resendButton = document.getElementById('resend');
const passwordInput = document.getElementById('password-input');
const sessionTokenElement = document.getElementById('session-token');

const state = {
  phone: '',
  sessionToken: '',
  requirePassword: false,
  expiresIn: 600,
  timerId: null
};

function setStep(step) {
  views.forEach((view) => view.classList.toggle('is-active', view.dataset.view === step));
  const activeIndex = Array.from(steps).findIndex((el) => el.dataset.step === step);
  steps.forEach((item, index) => {
    item.classList.toggle('is-active', index === activeIndex);
    item.classList.toggle('is-done', index < activeIndex);
  });

  const widths = {
    phone: '10%',
    code: '45%',
    password: '80%',
    success: '100%'
  };
  progressBar.style.width = widths[step] || '0%';
}

function showPill(text, tone = 'neutral') {
  pill.textContent = text;
  pill.style.background = tone === 'error' ? 'rgba(248, 113, 113, 0.14)' : 'rgba(45, 162, 239, 0.14)';
  pill.style.color = tone === 'error' ? '#fecdd3' : '#b8e6ff';
  pill.style.borderColor = tone === 'error' ? 'rgba(248, 113, 113, 0.25)' : 'rgba(45, 162, 239, 0.35)';
}

function shake(element) {
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
}

async function request(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'خطای ناشناخته رخ داد');
  }

  return res.json();
}

function startTimer(seconds) {
  clearInterval(state.timerId);
  let remaining = seconds;
  timer.textContent = `کد تا ${Math.ceil(remaining / 60)} دقیقه معتبر است`;

  state.timerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(state.timerId);
      timer.textContent = 'کد منقضی شد. ارسال مجدد کنید.';
      return;
    }
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timer.textContent = `کد تا ${mins}:${secs.toString().padStart(2, '0')} معتبر است`;
  }, 1000);
}

function fillOtp(value) {
  otpInputs.forEach((input, index) => {
    input.value = value[index] || '';
  });
  const lastFilled = otpInputs[Math.min(value.length, otpInputs.length - 1)];
  lastFilled?.focus();
}

phoneForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = `+98${phoneInput.value.replace(/\D/g, '')}`;

  try {
    showPill('در حال ارسال کد...');
    const data = await request('/api/send-code', { phone });
    state.phone = phone;
    state.sessionToken = data.sessionToken;
    state.requirePassword = data.requirePassword;
    state.expiresIn = data.expiresIn || 600;
    codeTarget.textContent = `کد به ${data.obfuscatedPhone} ارسال شد.`;
    startTimer(state.expiresIn);
    fillOtp(data.developmentCode || '');
    setStep('code');
    showPill('کد ارسال شد');
    otpInputs[0].focus();
  } catch (error) {
    showPill(error.message, 'error');
    shake(phoneForm);
  }
});

otpInputs.forEach((input, index) => {
  input.addEventListener('input', (event) => {
    const value = event.target.value.replace(/\D/g, '');
    event.target.value = value.slice(0, 1);
    if (value && otpInputs[index + 1]) {
      otpInputs[index + 1].focus();
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !event.target.value && otpInputs[index - 1]) {
      otpInputs[index - 1].focus();
    }
  });
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = otpInputs.map((input) => input.value).join('');

  if (code.length < 5) {
    showPill('کد را کامل وارد کنید', 'error');
    shake(codeForm);
    return;
  }

  try {
    showPill('در حال تایید کد...');
    const data = await request('/api/verify-code', { phone: state.phone, code });
    state.sessionToken = data.sessionToken;
    state.requirePassword = data.requirePassword;
    if (data.requirePassword) {
      passwordHint.textContent = `راهنما: ${data.passwordHint}`;
      setStep('password');
      passwordInput.focus();
      showPill('کد تایید شد. رمز دو مرحله‌ای را وارد کنید.');
    } else {
      sessionTokenElement.textContent = data.sessionToken;
      setStep('success');
      showPill('سشن ساخته شد');
    }
  } catch (error) {
    showPill(error.message, 'error');
    shake(codeForm);
  }
});

resendButton.addEventListener('click', async () => {
  if (!state.phone) return;
  try {
    showPill('ارسال مجدد کد...');
    const data = await request('/api/send-code', { phone: state.phone });
    state.sessionToken = data.sessionToken;
    state.requirePassword = data.requirePassword;
    state.expiresIn = data.expiresIn || 600;
    codeTarget.textContent = `کد جدید به ${data.obfuscatedPhone} ارسال شد.`;
    startTimer(state.expiresIn);
    fillOtp('');
    otpInputs[0].focus();
    showPill('کد جدید ارسال شد');
  } catch (error) {
    showPill(error.message, 'error');
    shake(codeForm);
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    showPill('در حال تایید رمز...');
    const data = await request('/api/verify-password', {
      phone: state.phone,
      password: passwordInput.value,
      sessionToken: state.sessionToken
    });
    sessionTokenElement.textContent = data.session.token;
    setStep('success');
    showPill('سشن ساخته شد');
  } catch (error) {
    showPill(error.message, 'error');
    shake(passwordForm);
  }
});

setStep('phone');
