const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// In-memory OTP store: phone -> { code, expiresAt }
// Good enough for dev/demo. Swap for Redis (with TTL) in production.
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// POST /api/auth/signup { name, email, password, phone? }
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, passwordHash },
    });

    const token = signToken(user);
    res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    console.error('[auth/signup]', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ user: publicUser(user), token });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /api/auth/otp/send { phone }
// Stubbed: generates a 6-digit code and logs it instead of sending an SMS.
// To go live, swap the console.log below for a Twilio/MSG91 call — the
// rest of the flow (store + verify) doesn't need to change.
router.post('/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });

  // --- SMS PROVIDER HOOK ---
  // Twilio example:
  //   await twilioClient.messages.create({ to: phone, from: TWILIO_FROM, body: `Your Coal & Clay code is ${code}` });
  // MSG91 example:
  //   await axios.post('https://api.msg91.com/api/v5/otp', { mobile: phone, otp: code, ... });
  console.log(`[otp] code for ${phone}: ${code} (expires in ${OTP_TTL_MS / 1000}s)`);

  res.json({ message: 'OTP sent', expiresInSeconds: OTP_TTL_MS / 1000 });
});

// POST /api/auth/otp/verify { phone, code }
router.post('/otp/verify', async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });

  const entry = otpStore.get(phone);
  if (!entry) return res.status(400).json({ error: 'No OTP was requested for this number' });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP has expired, request a new one' });
  }
  if (entry.code !== String(code)) return res.status(400).json({ error: 'Incorrect OTP' });

  otpStore.delete(phone);

  // Find or create a lightweight account for this phone number so the
  // frontend can treat OTP login the same way as email/password login.
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: `Guest ${phone.slice(-4)}`,
        email: `${phone.replace(/\D/g, '')}@otp.coalandclay.local`,
        phone,
        passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
      },
    });
  }

  const token = signToken(user);
  res.json({ user: publicUser(user), token });
});

module.exports = router;
