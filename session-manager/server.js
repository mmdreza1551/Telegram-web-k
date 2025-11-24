import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pendingCodes = new Map();

const passwordProfiles = [
  { rule: /42$/, password: 'telegram42', hint: 'رمز عبور به عدد ۴۲ ختم می‌شود.' },
  { rule: /7$/, password: 'cloudpass', hint: 'یک کلمه انگلیسی مرتبط با ابر + pass' }
];

const defaultPassword = 'miniapp-pass';

function normalizePhone(phone = '') {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function chooseProfile(phone) {
  return passwordProfiles.find((profile) => profile.rule.test(phone)) || null;
}

function obfuscate(phone) {
  return phone.replace(/(\+?\d{2})(\d+)(\d{2})/, (_, start, middle, end) => {
    return `${start}${'•'.repeat(Math.max(middle.length, 3))}${end}`;
  });
}

app.post('/api/send-code', (req, res) => {
  const rawPhone = req.body?.phone ?? '';
  const phone = normalizePhone(rawPhone);

  if (!/^\+?\d{10,15}$/.test(phone)) {
    return res.status(400).json({ error: 'شماره وارد شده معتبر نیست.' });
  }

  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const profile = chooseProfile(phone);
  const requirePassword = Boolean(profile);
  const passwordHint = profile?.hint || 'ترکیبی از حروف و اعداد';
  const password = profile?.password || defaultPassword;
  const sessionToken = crypto.randomUUID();

  pendingCodes.set(phone, {
    code,
    expiresAt,
    requirePassword,
    passwordHint,
    password,
    sessionToken
  });

  res.json({
    message: 'کد ارسال شد',
    obfuscatedPhone: obfuscate(phone),
    expiresIn: 600,
    requirePassword,
    sessionToken,
    developmentCode: code
  });
});

app.post('/api/verify-code', (req, res) => {
  const rawPhone = req.body?.phone ?? '';
  const code = String(req.body?.code ?? '');
  const phone = normalizePhone(rawPhone);
  const pending = pendingCodes.get(phone);

  if (!pending) {
    return res.status(404).json({ error: 'برای این شماره کدی فعال نیست.' });
  }

  if (pending.expiresAt < Date.now()) {
    pendingCodes.delete(phone);
    return res.status(410).json({ error: 'کد منقضی شده است. دوباره تلاش کنید.' });
  }

  if (pending.code !== code) {
    return res.status(401).json({ error: 'کد اشتباه است.' });
  }

  res.json({
    verified: true,
    requirePassword: pending.requirePassword,
    sessionToken: pending.sessionToken,
    passwordHint: pending.passwordHint
  });
});

app.post('/api/verify-password', (req, res) => {
  const rawPhone = req.body?.phone ?? '';
  const password = req.body?.password ?? '';
  const token = req.body?.sessionToken ?? '';
  const phone = normalizePhone(rawPhone);
  const pending = pendingCodes.get(phone);

  if (!pending || pending.sessionToken !== token) {
    return res.status(404).json({ error: 'نشست معتبر یافت نشد.' });
  }

  if (pending.password !== password) {
    return res.status(401).json({ error: 'رمز دو مرحله‌ای اشتباه است.' });
  }

  res.json({
    authorized: true,
    session: {
      phone,
      token,
      createdAt: new Date().toISOString()
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Session manager listening on http://localhost:${port}`);
});
