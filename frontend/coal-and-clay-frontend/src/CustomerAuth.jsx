import { useState, useRef, useEffect } from 'react';
import { api, saveSession } from './lib/api';
import {
  Flame, Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight,
  ShieldCheck, ChevronLeft, Check
} from 'lucide-react';

function Field({ icon: Icon, ...props }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={16} style={{
        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6E665A',
      }} />
      <input
        {...props}
        style={{
          width: '100%', background: '#1C1A17', border: '1px solid #3A352E', borderRadius: 10,
          padding: '13px 14px 13px 40px', color: '#EDE7DD', fontSize: 14, outline: 'none',
          transition: 'border-color 0.15s', ...props.style,
        }}
        onFocus={e => { e.target.style.borderColor = '#C68A3E'; props.onFocus?.(e); }}
        onBlur={e => { e.target.style.borderColor = '#3A352E'; props.onBlur?.(e); }}
      />
    </div>
  );
}

function PrimaryButton({ children, disabled, loading, ...props }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
        background: disabled || loading ? '#8A6A38' : '#C68A3E', color: '#1C1A17',
        fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8, opacity: disabled ? 0.6 : 1,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? (
        <span style={{
          width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(28,26,23,0.35)',
          borderTopColor: '#1C1A17', animation: 'spin 0.7s linear infinite',
        }} />
      ) : children}
    </button>
  );
}

function OtpInputs({ value, onChange }) {
  const refs = useRef([]);
  const setDigit = (i, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = value.split('');
    next[i] = val;
    const joined = next.join('').slice(0, 6);
    onChange(joined);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };
  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text) { onChange(text); e.preventDefault(); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }} onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          value={value[i] || ''}
          onChange={e => setDigit(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          inputMode="numeric"
          maxLength={1}
          className="mono"
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
            background: '#1C1A17', border: `1.5px solid ${value[i] ? '#C68A3E' : '#3A352E'}`,
            borderRadius: 10, color: '#EDE7DD', outline: 'none',
          }}
        />
      ))}
    </div>
  );
}

export default function CustomerAuth({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [method, setMethod] = useState('email'); // 'email' | 'phone'
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [authed, setAuthed] = useState(null); // { name, via }

  // shared/signup fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // phone/otp
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const resetFeedback = () => setErrors({});

  const switchMode = (m) => {
    setMode(m); resetFeedback(); setOtpSent(false); setOtp('');
  };
  const switchMethod = (m) => {
    setMethod(m); resetFeedback(); setOtpSent(false); setOtp('');
  };

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePhone = (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ''));

  const handleSignup = async () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Enter your name';
    if (!validateEmail(email)) errs.email = 'Enter a valid email';
    if (password.length < 6) errs.password = 'At least 6 characters';
    if (confirmPw !== password) errs.confirmPw = 'Passwords don\u2019t match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const { user, token } = await api.signup({ name: name.trim(), email, password });
      saveSession(user, token);
      setLoading(false);
      const authedUser = { name: user.name, via: 'account created' };
      setAuthed(authedUser);
      onAuthed?.(authedUser);
    } catch (err) {
      setLoading(false);
      setErrors({ form: err.message });
    }
  };

  const handleEmailSignin = async () => {
    const errs = {};
    if (!validateEmail(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Enter your password';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const { user, token } = await api.login({ email, password });
      saveSession(user, token);
      setLoading(false);
      const authedUser = { name: user.name, via: 'signed in' };
      setAuthed(authedUser);
      onAuthed?.(authedUser);
    } catch (err) {
      setLoading(false);
      setErrors({ form: err.message });
    }
  };

  const handleSendOtp = async () => {
    if (!validatePhone(phone)) { setErrors({ phone: 'Enter a valid 10-digit number' }); return; }
    setErrors({});
    setLoading(true);
    try {
      await api.sendOtp(phone);
      setLoading(false);
      setOtpSent(true);
      setResendIn(30);
    } catch (err) {
      setLoading(false);
      setErrors({ phone: err.message });
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setErrors({ otp: 'Enter the 6-digit code' }); return; }
    setErrors({});
    setLoading(true);
    try {
      const { user, token } = await api.verifyOtp(phone, otp);
      saveSession(user, token);
      setLoading(false);
      const authedUser = { name: user.name, via: 'signed in' };
      setAuthed(authedUser);
      onAuthed?.(authedUser);
    } catch (err) {
      setLoading(false);
      setErrors({ otp: err.message });
    }
  };

  if (authed) {
    return (
      <Shell>
        <div className="fade-in" style={{ textAlign: 'center', padding: '30px 4px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'rgba(122,155,87,0.15)',
            border: '1.5px solid #7A9B57', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <Check size={26} color="#7A9B57" />
          </div>
          <h2 className="display" style={{ fontSize: 18, marginBottom: 8 }}>Welcome, {authed.name}</h2>
          <p style={{ color: '#A79E8E', fontSize: 13.5, marginBottom: 26 }}>
            You\u2019re {authed.via}. Taking you to the menu\u2026
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Sign in / Sign up toggle */}
      <div style={{
        display: 'flex', background: '#1C1A17', border: '1px solid #3A352E', borderRadius: 12,
        padding: 4, marginBottom: 22,
      }}>
        {['signin', 'signup'].map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className="display"
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', fontSize: 12.5,
              fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              background: mode === m ? '#C68A3E' : 'transparent',
              color: mode === m ? '#1C1A17' : '#A79E8E',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {mode === 'signup' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LabeledField label="Full name" error={errors.name}>
            <Field icon={User} placeholder="Anshu Sharma" value={name} onChange={e => setName(e.target.value)} />
          </LabeledField>
          <LabeledField label="Email address" error={errors.email}>
            <Field icon={Mail} type="email" placeholder="anshu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </LabeledField>
          <LabeledField label="Password" error={errors.password}>
            <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="At least 6 characters" />
          </LabeledField>
          <LabeledField label="Confirm password" error={errors.confirmPw}>
            <PasswordField value={confirmPw} onChange={setConfirmPw} show={showPw} setShow={setShowPw} placeholder="Re-enter password" />
          </LabeledField>
          <div style={{ marginTop: 6 }}>
            <PrimaryButton onClick={handleSignup} loading={loading}>
              Create account <ArrowRight size={16} />
            </PrimaryButton>
          </div>
          <p style={{ fontSize: 11.5, color: '#6E665A', textAlign: 'center', marginTop: 2 }}>
            By continuing you agree to Coal &amp; Clay\u2019s terms and privacy policy.
          </p>
        </div>
      )}

      {mode === 'signin' && (
        <div className="fade-in">
          {/* Method toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[{ id: 'email', label: 'Email', icon: Mail }, { id: 'phone', label: 'Phone OTP', icon: Phone }].map(opt => (
              <button
                key={opt.id}
                onClick={() => switchMethod(opt.id)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '9px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${method === opt.id ? '#C68A3E' : '#3A352E'}`,
                  background: method === opt.id ? 'rgba(198,138,62,0.12)' : 'transparent',
                  color: method === opt.id ? '#E8C685' : '#A79E8E',
                }}
              >
                <opt.icon size={14} />
                {opt.label}
              </button>
            ))}
          </div>

          {method === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LabeledField label="Email address" error={errors.email}>
                <Field icon={Mail} type="email" placeholder="anshu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </LabeledField>
              <LabeledField label="Password" error={errors.password}>
                <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} placeholder="Your password" />
              </LabeledField>
              <div style={{ textAlign: 'right', marginTop: -6 }}>
                <button style={{ background: 'none', border: 'none', color: '#C68A3E', fontSize: 12, fontWeight: 600, padding: 0 }}>
                  Forgot password?
                </button>
              </div>
              <PrimaryButton onClick={handleEmailSignin} loading={loading}>
                Sign in <ArrowRight size={16} />
              </PrimaryButton>
            </div>
          )}

          {method === 'phone' && !otpSent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LabeledField label="Phone number" error={errors.phone}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 10,
                    border: '1px solid #3A352E', background: '#1C1A17', color: '#A79E8E', fontSize: 14,
                  }} className="mono">+91</div>
                  <div style={{ flex: 1 }}>
                    <Field icon={Phone} type="tel" placeholder="98765 43210" value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                  </div>
                </div>
              </LabeledField>
              <PrimaryButton onClick={handleSendOtp} loading={loading}>
                Send OTP <ArrowRight size={16} />
              </PrimaryButton>
            </div>
          )}

          {method === 'phone' && otpSent && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button
                onClick={() => { setOtpSent(false); setOtp(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#A79E8E', fontSize: 12, padding: 0, alignSelf: 'flex-start' }}
              >
                <ChevronLeft size={14} /> Change number
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShieldCheck size={15} color="#7A9B57" />
                  <span style={{ fontSize: 13, color: '#EDE7DD' }}>
                    Code sent to <span className="mono">+91 {phone}</span>
                  </span>
                </div>
                {errors.otp && <div style={{ fontSize: 11.5, color: '#E08D7C', marginTop: 2 }}>{errors.otp}</div>}
              </div>
              <OtpInputs value={otp} onChange={setOtp} />
              <PrimaryButton onClick={handleVerifyOtp} loading={loading}>
                Verify &amp; sign in <ArrowRight size={16} />
              </PrimaryButton>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#6E665A' }}>
                {resendIn > 0 ? (
                  <span>Resend code in <span className="mono">0:{String(resendIn).padStart(2, '0')}</span></span>
                ) : (
                  <button onClick={handleSendOtp} style={{ background: 'none', border: 'none', color: '#C68A3E', fontWeight: 600, fontSize: 12, padding: 0 }}>
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function LabeledField({ label, error, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, color: '#A79E8E', marginBottom: 6, fontWeight: 600, letterSpacing: '0.02em' }}>
        {label}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, color: '#E08D7C', marginTop: 5 }}>{error}</div>}
    </div>
  );
}

function PasswordField({ value, onChange, show, setShow, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <Field icon={Lock} type={show ? 'text' : 'password'} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)} style={{ paddingRight: 40 }} />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#6E665A', display: 'flex', padding: 0,
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#1C1A17', color: '#EDE7DD', fontFamily: "'Inter', sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        .display { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        button { font-family: inherit; cursor: pointer; }
        input { font-family: inherit; }
        input::placeholder { color: #6E665A; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
        .fade-in { animation: fadeIn 0.25s ease-out; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, background: '#262320', border: '1px solid #C68A3E',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C68A3E', marginBottom: 12,
          }}>
            <Flame size={24} />
          </div>
          <div className="display" style={{ fontSize: 22, fontWeight: 700 }}>Coal &amp; Clay</div>
          <div className="mono" style={{ fontSize: 11, color: '#A79E8E', marginTop: 4 }}>Jaipur, Rajasthan</div>
        </div>

        <div style={{ background: '#262320', border: '1px solid #3A352E', borderRadius: 16, padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}