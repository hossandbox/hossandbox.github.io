import { useEffect, useRef, useState } from 'preact/hooks';
import {
  REMINDER_QUESTIONS,
  MIN_RECOVERY_QUESTIONS,
  MAX_DRIVER_NAME_LEN,
  driverInitials,
  sanitizeDriverName,
  isValidPin,
  type RecoveryInput,
} from './drivers.ts';
import {
  type DriverSummary,
  unlockDriverWithPin,
  registerDriver,
  completeLegacyDriverSetup,
  checkDriverRecoveryAnswers,
  resetDriverPinWithRecovery,
  lockDriverSession,
  changeDriverPin,
  renameDriver,
  updateDriverRecovery,
  removeDriverProfile,
  getPinCooldownRemainingMs,
  getRecoveryCooldownRemainingMs,
  formatCooldownWait,
} from './store.ts';

/** Verbatim non-ELD disclaimer shared by Startup Disclosure, New-Driver Registration, and Settings → About. */
export const CLOCK14_DISCLAIMER_TEXT =
  "Clock 14 — HOS What-If Planner. It is not an ELD, is not FMCSA-registered, and does not replace your record of duty status. Your official log and your carrier's ELD govern. Rules: 49 CFR 395.1(b)(1), (g), (o), 395.3; FMCSA HOS FAQ (Nov 2020). Property-carrying, US interstate drivers only — no passenger, Canada, Alaska or oilfield rules.";

function SvgIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON_LOCK = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z';
const ICON_PLUS = 'M12 5v14M5 12h14';
const ICON_BACK = 'M15 6l-6 6 6 6';
const ICON_NEXT = 'M9 6l6 6-6 6';
const ICON_SWITCH = 'M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16';
const ICON_USER = 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const ICON_KEY = 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4';
const ICON_BKSP = 'M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6';

/** Shared disclosure modal used both during new-driver registration and whenever an unacked state renders. */
export function DisclosureModal({ onAccept, closing = false }: { onAccept: () => void; closing?: boolean }) {
  return (
    <div
      class={`backdrop${closing ? ' is-closing' : ''}`}
      role={closing ? undefined : 'dialog'}
      aria-modal={closing ? undefined : 'true'}
      aria-labelledby={closing ? undefined : 'disclaimer-title'}
      inert={closing || undefined}
      aria-hidden={closing || undefined}
    >
      <div class="modal">
        <h2 id="disclaimer-title">Before you start</h2>
        <p class="small">{CLOCK14_DISCLAIMER_TEXT}</p>
        <button type="button" class="primary" onClick={onAccept}>Understood — don't show again</button>
      </div>
    </div>
  );
}

/** Tactile 4-dot PIN readout + 3x4 thumb-friendly keypad with full physical keyboard support. */
export function PinKeypad({
  value,
  onDigit,
  onBackspace,
  onClear,
  error,
  shakeKey = 0,
  disabled = false,
  label = 'PIN entry',
}: {
  value: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  error?: string | null;
  shakeKey?: number;
  disabled?: boolean;
  label?: string;
}) {
  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        onDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onBackspace();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onClear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, onDigit, onBackspace, onClear]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div class="pin-wrap" role="group" aria-label={label}>
      <div
        key={shakeKey}
        class={`pin-dots${shakeKey > 0 ? ' is-shake' : ''}`}
        aria-label={`${value.length} of 4 digits entered`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span key={i} class={`pin-dot${i < value.length ? ' on' : ''}`} aria-hidden="true" />
        ))}
      </div>
      {error && (
        <div class="pin-err warnbox small" role="alert" data-pin-error="1">
          {error}
        </div>
      )}
      <div class="pin-pad" data-pin-pad="1">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            class="pin-key mono"
            disabled={disabled}
            data-pin-digit={k}
            onClick={() => onDigit(k)}
          >
            {k}
          </button>
        ))}
        <button type="button" class="pin-key pin-key-util" disabled={disabled || value.length === 0} onClick={onClear} aria-label="Clear PIN">
          Clear
        </button>
        <button
          type="button"
          class="pin-key mono"
          disabled={disabled}
          data-pin-digit="0"
          onClick={() => onDigit('0')}
        >
          0
        </button>
        <button type="button" class="pin-key pin-key-util" disabled={disabled || value.length === 0} onClick={onBackspace} aria-label="Delete last digit">
          <SvgIcon d={ICON_BKSP} size={22} />
        </button>
      </div>
    </div>
  );
}

/** Reminder question selector pair used in registration, legacy upgrade, and settings updates. */
function RecoveryEditor({
  q1,
  q2,
  a1,
  a2,
  onQ1,
  onQ2,
  onA1,
  onA2,
}: {
  q1: string;
  q2: string;
  a1: string;
  a2: string;
  onQ1: (v: string) => void;
  onQ2: (v: string) => void;
  onA1: (v: string) => void;
  onA2: (v: string) => void;
}) {
  return (
    <div class="rec-fields">
      <label>
        Reminder question 1
        <select value={q1} data-rec-q="0" onChange={(e) => onQ1((e.target as HTMLSelectElement).value)}>
          {REMINDER_QUESTIONS.map((q) => (
            <option key={q.id} value={q.id}>{q.text}</option>
          ))}
        </select>
      </label>
      <label>
        Answer 1
        <input
          type="text"
          value={a1}
          maxLength={64}
          autoComplete="off"
          placeholder="Your answer"
          data-rec-a="0"
          onInput={(e) => onA1((e.target as HTMLInputElement).value)}
        />
      </label>
      <label>
        Reminder question 2
        <select value={q2} data-rec-q="1" onChange={(e) => onQ2((e.target as HTMLSelectElement).value)}>
          {REMINDER_QUESTIONS.map((q) => (
            <option key={q.id} value={q.id}>{q.text}</option>
          ))}
        </select>
      </label>
      <label>
        Answer 2
        <input
          type="text"
          value={a2}
          maxLength={64}
          autoComplete="off"
          placeholder="Your answer"
          data-rec-a="1"
          onInput={(e) => onA2((e.target as HTMLInputElement).value)}
        />
      </label>
    </div>
  );
}

function buildRecoveryInputs(q1: string, q2: string, a1: string, a2: string): RecoveryInput[] {
  const findText = (id: string) => REMINDER_QUESTIONS.find((q) => q.id === id)?.text ?? '';
  return [
    { qId: q1, question: findText(q1), answer: a1 },
    { qId: q2, question: findText(q2), answer: a2 },
  ];
}

type SplashView =
  | { kind: 'picker' }
  | { kind: 'pin'; driverId: string }
  | { kind: 'recovery'; driverId: string; step: 'questions' | 'new-pin' | 'confirm-pin' }
  | { kind: 'register'; step: 'name' | 'pin' | 'confirm-pin' | 'recovery' }
  | { kind: 'legacy-setup'; driverId: string; step: 'name' | 'pin' | 'confirm-pin' | 'recovery' };

/**
 * Full-screen startup splash & multi-driver gate.
 * Shown on EVERY launch — even when exactly one driver is registered (no straight-in shortcut).
 */
export function StartupSplash({ drivers }: { drivers: DriverSummary[] }) {
  const [view, setView] = useState<SplashView>({ kind: 'picker' });

  // PIN unlock state
  const [pinBuf, setPinBuf] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0);

  // Registration & legacy-upgrade wizard state
  const [regName, setRegName] = useState('');
  const [regDiscAcked, setRegDiscAcked] = useState(false);
  const [showRegDisc, setShowRegDisc] = useState(false);
  const [regDiscClosing, setRegDiscClosing] = useState(false);
  const [regPinFirst, setRegPinFirst] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [regQ1, setRegQ1] = useState(REMINDER_QUESTIONS[0].id);
  const [regQ2, setRegQ2] = useState(REMINDER_QUESTIONS[1].id);
  const [regA1, setRegA1] = useState('');
  const [regA2, setRegA2] = useState('');
  const [wizardErr, setWizardErr] = useState<string | null>(null);

  // Recovery flow state
  const [recAnswers, setRecAnswers] = useState<string[]>([]);
  const [recNewPin, setRecNewPin] = useState('');
  const [recConfirmPin, setRecConfirmPin] = useState('');
  const [recErr, setRecErr] = useState<string | null>(null);

  const discTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (discTimerRef.current) clearTimeout(discTimerRef.current); }, []);

  const selectedDriver = ('driverId' in view ? drivers.find((d) => d.id === view.driverId) : null) ?? null;

  // Live per-driver cooldown readout (PIN & recovery): ticks once per second only while locked out.
  const pinCooldownMs = view.kind === 'pin' && selectedDriver ? getPinCooldownRemainingMs(selectedDriver.id) : 0;
  const recCooldownMs = view.kind === 'recovery' && view.step === 'questions' && selectedDriver
    ? getRecoveryCooldownRemainingMs(selectedDriver.id)
    : 0;
  const activeCooldownMs = Math.max(pinCooldownMs, recCooldownMs);

  useEffect(() => {
    if (activeCooldownMs <= 0) return;
    const delay = Math.min(1000, activeCooldownMs);
    const id = setTimeout(() => setCooldownTick((t) => t + 1), delay);
    return () => clearTimeout(id);
  }, [activeCooldownMs, cooldownTick]);

  const pinDisplayErr = pinCooldownMs > 0
    ? `Too many wrong PINs. Wait ${formatCooldownWait(pinCooldownMs)} before trying again.`
    : pinErr;
  const recDisplayErr = recCooldownMs > 0
    ? `Too many wrong answers. Wait ${formatCooldownWait(recCooldownMs)} before trying again.`
    : recErr;

  // If the selected driver was removed externally, return cleanly to the picker.
  useEffect(() => {
    if ('driverId' in view && !selectedDriver) setView({ kind: 'picker' });
  }, [view, selectedDriver]);

  const resetAllTransient = () => {
    setPinBuf('');
    setPinErr(null);
    setWizardErr(null);
    setRecErr(null);
    setRegPinFirst('');
    setRegPinConfirm('');
    setRecNewPin('');
    setRecConfirmPin('');
    setShowRegDisc(false);
    setRegDiscClosing(false);
  };

  const openPicker = () => {
    resetAllTransient();
    setView({ kind: 'picker' });
  };

  const onPickDriver = (d: DriverSummary) => {
    resetAllTransient();
    if (d.needsSetup) {
      setRegName(d.name);
      setRegDiscAcked(d.disclaimerAcked);
      setRegQ1(REMINDER_QUESTIONS[0].id);
      setRegQ2(REMINDER_QUESTIONS[1].id);
      setRegA1('');
      setRegA2('');
      setView({ kind: 'legacy-setup', driverId: d.id, step: 'name' });
      return;
    }
    setView({ kind: 'pin', driverId: d.id });
  };

  const startAddDriver = () => {
    resetAllTransient();
    setRegName('');
    setRegDiscAcked(false);
    setRegQ1(REMINDER_QUESTIONS[0].id);
    setRegQ2(REMINDER_QUESTIONS[1].id);
    setRegA1('');
    setRegA2('');
    setView({ kind: 'register', step: 'name' });
  };

  /* ---- PIN unlock handlers ---- */
  const onUnlockDigit = (d: string) => {
    if (view.kind !== 'pin') return;
    if (getPinCooldownRemainingMs(view.driverId) > 0) {
      setCooldownTick((t) => t + 1);
      return;
    }
    setPinErr(null);
    const next = (pinBuf + d).slice(0, 4);
    setPinBuf(next);
    if (next.length === 4) {
      const res = unlockDriverWithPin(view.driverId, next);
      if (!res.ok) {
        setPinErr(res.cooldownMs ? null : res.error);
        setPinBuf('');
        setShakeKey((k) => k + 1);
        if (res.cooldownMs) setCooldownTick((t) => t + 1);
      }
    }
  };

  /* ---- Recovery handlers ---- */
  const startRecovery = () => {
    if (!selectedDriver) return;
    setRecAnswers(selectedDriver.recoveryQuestions.map(() => ''));
    setRecNewPin('');
    setRecConfirmPin('');
    setRecErr(null);
    setView({ kind: 'recovery', driverId: selectedDriver.id, step: 'questions' });
  };

  const submitRecoveryAnswers = (e: Event) => {
    e.preventDefault();
    if (view.kind !== 'recovery') return;
    const res = checkDriverRecoveryAnswers(view.driverId, recAnswers);
    if (!res.ok) {
      setRecErr(res.cooldownMs ? null : res.error);
      if (res.cooldownMs) setCooldownTick((t) => t + 1);
      return;
    }
    setRecErr(null);
    setRecNewPin('');
    setRecConfirmPin('');
    setView({ kind: 'recovery', driverId: view.driverId, step: 'new-pin' });
  };

  const onRecoveryPinDigit = (d: string) => {
    if (view.kind !== 'recovery') return;
    setRecErr(null);
    if (view.step === 'new-pin') {
      const next = (recNewPin + d).slice(0, 4);
      setRecNewPin(next);
      if (next.length === 4) {
        setRecConfirmPin('');
        setView({ kind: 'recovery', driverId: view.driverId, step: 'confirm-pin' });
      }
    } else if (view.step === 'confirm-pin') {
      const next = (recConfirmPin + d).slice(0, 4);
      setRecConfirmPin(next);
      if (next.length === 4) {
        if (next !== recNewPin) {
          setRecErr("Those PINs didn't match — enter your new PIN again.");
          setRecConfirmPin('');
          setShakeKey((k) => k + 1);
          return;
        }
        const res = resetDriverPinWithRecovery(view.driverId, recAnswers, next);
        if (!res.ok) {
          setRecErr(res.error);
          setRecConfirmPin('');
          setShakeKey((k) => k + 1);
        }
      }
    }
  };

  /* ---- Registration & Legacy-Setup wizard handlers ---- */
  const isLegacy = view.kind === 'legacy-setup';

  const submitWizardName = (e: Event) => {
    e.preventDefault();
    if (view.kind !== 'register' && view.kind !== 'legacy-setup') return;
    const clean = sanitizeDriverName(regName);
    if (!clean) {
      setWizardErr('Enter your name to continue.');
      return;
    }
    const excludeId = view.kind === 'legacy-setup' ? view.driverId : undefined;
    if (drivers.some((d) => d.id !== excludeId && d.name.toLowerCase() === clean.toLowerCase())) {
      setWizardErr(`There is already a driver named "${clean}" on this phone.`);
      return;
    }
    setRegName(clean);
    setWizardErr(null);
    // New drivers MUST always see and accept the disclosure popup themselves.
    // Migrated legacy drivers see it only if their saved record had not already accepted it.
    if (view.kind === 'register' || !regDiscAcked) {
      setRegDiscClosing(false);
      setShowRegDisc(true);
      return;
    }
    setRegPinFirst('');
    setRegPinConfirm('');
    setView({ ...view, step: 'pin' });
  };

  const acceptRegistrationDisclosure = () => {
    setRegDiscAcked(true);
    const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const advance = () => {
      setShowRegDisc(false);
      setRegDiscClosing(false);
      setRegPinFirst('');
      setRegPinConfirm('');
      setView((cur) => (cur.kind === 'register' || cur.kind === 'legacy-setup' ? { ...cur, step: 'pin' } : cur));
    };
    if (reduced) {
      advance();
      return;
    }
    setRegDiscClosing(true);
    if (discTimerRef.current) clearTimeout(discTimerRef.current);
    discTimerRef.current = setTimeout(advance, 200);
  };

  const onWizardPinDigit = (d: string) => {
    if (view.kind !== 'register' && view.kind !== 'legacy-setup') return;
    setWizardErr(null);
    if (view.step === 'pin') {
      const next = (regPinFirst + d).slice(0, 4);
      setRegPinFirst(next);
      if (next.length === 4) {
        setRegPinConfirm('');
        setView({ ...view, step: 'confirm-pin' });
      }
    } else if (view.step === 'confirm-pin') {
      const next = (regPinConfirm + d).slice(0, 4);
      setRegPinConfirm(next);
      if (next.length === 4) {
        if (next !== regPinFirst) {
          setWizardErr("Those PINs didn't match — enter the 4 digits again.");
          setRegPinConfirm('');
          setShakeKey((k) => k + 1);
          return;
        }
        setWizardErr(null);
        setView({ ...view, step: 'recovery' });
      }
    }
  };

  const submitWizardFinish = (e: Event) => {
    e.preventDefault();
    if (view.kind !== 'register' && view.kind !== 'legacy-setup') return;
    const recovery = buildRecoveryInputs(regQ1, regQ2, regA1, regA2);
    const res = view.kind === 'register'
      ? registerDriver({ name: regName, pin: regPinFirst, recovery, disclaimerAcked: regDiscAcked })
      : completeLegacyDriverSetup(view.driverId, { name: regName, pin: regPinFirst, recovery, disclaimerAcked: regDiscAcked });
    if (!res.ok) {
      setWizardErr(res.error);
      return;
    }
    setWizardErr(null);
  };

  const wizardStepNumber = () => {
    if (view.kind !== 'register' && view.kind !== 'legacy-setup') return 1;
    if (view.step === 'name') return 1;
    if (view.step === 'pin') return 2;
    if (view.step === 'confirm-pin') return 3;
    return 4;
  };

  return (
    <div class="app splash-app" data-splash-screen="1" data-splash-view={view.kind} aria-label="Clock 14">
      <div class="splash-shell" inert={showRegDisc && !regDiscClosing ? true : undefined}>
        {view.kind === 'picker' && (
          <div class="splash-picker">
            <div class="splash-body">
              {drivers.length > 0 ? (
                <section class="splash-drivers" aria-label="Registered drivers">
                  <div class="splash-sec-head">Who's in the seat?</div>
                  <div class="driver-list" data-driver-list="1">
                    {drivers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        class={`driver-tile${d.needsSetup ? ' needs-setup' : ''}`}
                        data-driver-id={d.id}
                        data-driver-name={d.name}
                        onClick={() => onPickDriver(d)}
                      >
                        <span class="driver-avatar" aria-hidden="true">{driverInitials(d.name)}</span>
                        <span class="driver-tile-info">
                          <b>{d.name}</b>
                          <span class="muted small">
                            {d.needsSetup
                              ? 'Your existing logs are ready · Set PIN & recovery'
                              : d.isLastActive
                                ? 'Last active · 4-digit PIN'
                                : '4-digit PIN'}
                          </span>
                        </span>
                        {d.needsSetup
                          ? <span class="driver-setup-tag">Finish setup</span>
                          : <span class="driver-tile-trail" aria-hidden="true"><SvgIcon d={ICON_LOCK} size={18} /></span>}
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section class="card splash-empty" data-driver-empty="1">
                  <p class="splash-empty-title"><b>No drivers on this phone yet</b></p>
                  <p class="muted small">Set up your profile with a 4-digit PIN. Each driver gets their own logs, carrier-day rules, plans, and exports.</p>
                </section>
              )}

              <button
                type="button"
                class={`${drivers.length === 0 ? 'primary ' : ''}wide splash-add-btn`}
                data-add-driver="1"
                onClick={startAddDriver}
              >
                <SvgIcon d={ICON_PLUS} size={20} /> Add a driver
              </button>
            </div>
          </div>
        )}

        {view.kind === 'pin' && selectedDriver && (
          <div class="splash-flow" data-pin-screen="1">
            <div class="splash-flow-head">
              <button type="button" class="back" onClick={openPicker}><SvgIcon d={ICON_BACK} size={20} /> All drivers</button>
            </div>
            <div class="splash-driver-banner">
              <span class="driver-avatar driver-avatar-lg" aria-hidden="true">{driverInitials(selectedDriver.name)}</span>
              <h1 class="splash-flow-title">{selectedDriver.name}</h1>
              <p class="muted small">Enter your 4-digit PIN</p>
            </div>
            <PinKeypad
              value={pinBuf}
              error={pinDisplayErr}
              shakeKey={shakeKey}
              disabled={pinCooldownMs > 0}
              label={`PIN for ${selectedDriver.name}`}
              onDigit={onUnlockDigit}
              onBackspace={() => { setPinErr(null); setPinBuf((p) => p.slice(0, -1)); }}
              onClear={() => { setPinErr(null); setPinBuf(''); }}
            />
            <div class="splash-flow-foot">
              <button type="button" class="link splash-forgot" data-forgot-pin="1" onClick={startRecovery}>
                Forgot PIN?
              </button>
            </div>
          </div>
        )}

        {view.kind === 'recovery' && selectedDriver && (
          <div class="splash-flow" data-recovery-screen="1">
            <div class="splash-flow-head">
              <button
                type="button"
                class="back"
                onClick={() => {
                  setRecErr(null);
                  if (view.step === 'questions') setView({ kind: 'pin', driverId: selectedDriver.id });
                  else if (view.step === 'new-pin') setView({ kind: 'recovery', driverId: selectedDriver.id, step: 'questions' });
                  else { setRecConfirmPin(''); setView({ kind: 'recovery', driverId: selectedDriver.id, step: 'new-pin' }); }
                }}
              >
                <SvgIcon d={ICON_BACK} size={20} /> {view.step === 'questions' ? 'Back to PIN' : 'Back'}
              </button>
            </div>

            {view.step === 'questions' && (
              <form class="splash-form" onSubmit={submitRecoveryAnswers}>
                <h1 class="splash-flow-title">Reset PIN for {selectedDriver.name}</h1>
                <p class="muted small">Answer your reminder questions to set a new 4-digit PIN. Your logs and settings stay right where they are.</p>
                <div class="card">
                  {selectedDriver.recoveryQuestions.map((q, idx) => (
                    <label key={q.qId}>
                      {q.question}
                      <input
                        type="text"
                        autoComplete="off"
                        value={recAnswers[idx] ?? ''}
                        data-recovery-answer={String(idx)}
                        placeholder="Your answer"
                        onInput={(e) => {
                          const v = (e.target as HTMLInputElement).value;
                          setRecAnswers((prev) => prev.map((x, j) => (j === idx ? v : x)));
                          setRecErr(null);
                        }}
                      />
                    </label>
                  ))}
                  {recDisplayErr && <div class="warnbox small" role="alert" data-recovery-error="1" style="margin-top:10px">{recDisplayErr}</div>}
                </div>
                <button type="submit" class="primary wide" data-recovery-submit="1" disabled={recCooldownMs > 0}>Check answers</button>
              </form>
            )}

            {view.step === 'new-pin' && (
              <>
                <div class="splash-driver-banner">
                  <span class="driver-avatar driver-avatar-lg" aria-hidden="true">{driverInitials(selectedDriver.name)}</span>
                  <h1 class="splash-flow-title">Pick a new 4-digit PIN</h1>
                  <p class="muted small">Answers verified. Choose a new PIN for {selectedDriver.name}.</p>
                </div>
                <PinKeypad
                  value={recNewPin}
                  error={recErr}
                  shakeKey={shakeKey}
                  label="New 4-digit PIN"
                  onDigit={onRecoveryPinDigit}
                  onBackspace={() => { setRecErr(null); setRecNewPin((p) => p.slice(0, -1)); }}
                  onClear={() => { setRecErr(null); setRecNewPin(''); }}
                />
              </>
            )}

            {view.step === 'confirm-pin' && (
              <>
                <div class="splash-driver-banner">
                  <span class="driver-avatar driver-avatar-lg" aria-hidden="true">{driverInitials(selectedDriver.name)}</span>
                  <h1 class="splash-flow-title">Confirm your new PIN</h1>
                  <p class="muted small">Tap those same 4 digits one more time.</p>
                </div>
                <PinKeypad
                  value={recConfirmPin}
                  error={recErr}
                  shakeKey={shakeKey}
                  label="Confirm new 4-digit PIN"
                  onDigit={onRecoveryPinDigit}
                  onBackspace={() => { setRecErr(null); setRecConfirmPin((p) => p.slice(0, -1)); }}
                  onClear={() => { setRecErr(null); setRecConfirmPin(''); }}
                />
                <div class="splash-flow-foot">
                  <button type="button" class="link" onClick={() => { setRecNewPin(''); setRecConfirmPin(''); setRecErr(null); setView({ kind: 'recovery', driverId: selectedDriver.id, step: 'new-pin' }); }}>
                    Pick a different PIN
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {(view.kind === 'register' || view.kind === 'legacy-setup') && (
          <div class="splash-flow" data-register-screen={view.kind}>
            <div class="splash-flow-head">
              <button
                type="button"
                class="back"
                onClick={() => {
                  setWizardErr(null);
                  if (view.step === 'name') openPicker();
                  else if (view.step === 'pin') setView({ ...view, step: 'name' });
                  else if (view.step === 'confirm-pin') { setRegPinFirst(''); setRegPinConfirm(''); setView({ ...view, step: 'pin' }); }
                  else { setRegPinConfirm(''); setView({ ...view, step: 'confirm-pin' }); }
                }}
              >
                <SvgIcon d={ICON_BACK} size={20} /> {view.step === 'name' ? 'Cancel' : 'Back'}
              </button>
              <span class="splash-step-pill mono">Step {wizardStepNumber()} of 4</span>
            </div>

            {view.step === 'name' && (
              <form class="splash-form" onSubmit={submitWizardName}>
                <h1 class="splash-flow-title">{isLegacy ? 'Welcome back' : "Who's climbing in?"}</h1>
                <p class="muted small">
                  {isLegacy
                    ? 'Your existing logs, settings, and plans are safe. Name your profile, then set a 4-digit PIN and recovery questions.'
                    : 'Your name keeps your logs, carrier-day rules, plans, and exports separate on this phone.'}
                </p>
                {isLegacy && (
                  <div class="card good splash-legacy-note">
                    <b>Zero data lost.</b> Everything already saved on this phone moves straight into your driver profile.
                  </div>
                )}
                <div class="card">
                  <label>
                    Driver name
                    <input
                      type="text"
                      maxLength={MAX_DRIVER_NAME_LEN}
                      autoComplete="off"
                      placeholder="e.g. Marcus"
                      value={regName}
                      data-reg-name="1"
                      onInput={(e) => { setRegName((e.target as HTMLInputElement).value); setWizardErr(null); }}
                    />
                  </label>
                  {wizardErr && <div class="warnbox small" role="alert" style="margin-top:10px">{wizardErr}</div>}
                </div>
                <button type="submit" class="primary wide" data-reg-next="1">
                  {view.kind === 'register' || !regDiscAcked ? 'Next: read the notice' : 'Next: set your PIN'}
                </button>
              </form>
            )}

            {view.step === 'pin' && (
              <>
                <div class="splash-driver-banner">
                  <span class="driver-avatar driver-avatar-lg" aria-hidden="true">{driverInitials(regName)}</span>
                  <h1 class="splash-flow-title">Pick a 4-digit PIN</h1>
                  <p class="muted small">Keeps {regName}'s logs and plans private on a shared phone.</p>
                </div>
                <PinKeypad
                  value={regPinFirst}
                  error={wizardErr}
                  shakeKey={shakeKey}
                  label="Choose a 4-digit PIN"
                  onDigit={onWizardPinDigit}
                  onBackspace={() => { setWizardErr(null); setRegPinFirst((p) => p.slice(0, -1)); }}
                  onClear={() => { setWizardErr(null); setRegPinFirst(''); }}
                />
              </>
            )}

            {view.step === 'confirm-pin' && (
              <>
                <div class="splash-driver-banner">
                  <span class="driver-avatar driver-avatar-lg" aria-hidden="true">{driverInitials(regName)}</span>
                  <h1 class="splash-flow-title">Confirm your PIN</h1>
                  <p class="muted small">Tap those same 4 digits one more time.</p>
                </div>
                <PinKeypad
                  value={regPinConfirm}
                  error={wizardErr}
                  shakeKey={shakeKey}
                  label="Confirm 4-digit PIN"
                  onDigit={onWizardPinDigit}
                  onBackspace={() => { setWizardErr(null); setRegPinConfirm((p) => p.slice(0, -1)); }}
                  onClear={() => { setWizardErr(null); setRegPinConfirm(''); }}
                />
                <div class="splash-flow-foot">
                  <button type="button" class="link" onClick={() => { setRegPinFirst(''); setRegPinConfirm(''); setWizardErr(null); setView({ ...view, step: 'pin' }); }}>
                    Pick a different PIN
                  </button>
                </div>
              </>
            )}

            {view.step === 'recovery' && (
              <form class="splash-form" onSubmit={submitWizardFinish}>
                <h1 class="splash-flow-title">Set up PIN recovery</h1>
                <p class="muted small">Pick {MIN_RECOVERY_QUESTIONS} reminder questions in case you forget your PIN. Everything stays hashed on this phone.</p>
                <div class="card">
                  <RecoveryEditor
                    q1={regQ1}
                    q2={regQ2}
                    a1={regA1}
                    a2={regA2}
                    onQ1={(v) => { setRegQ1(v); setWizardErr(null); }}
                    onQ2={(v) => { setRegQ2(v); setWizardErr(null); }}
                    onA1={(v) => { setRegA1(v); setWizardErr(null); }}
                    onA2={(v) => { setRegA2(v); setWizardErr(null); }}
                  />
                  {wizardErr && <div class="warnbox small" role="alert" style="margin-top:10px">{wizardErr}</div>}
                </div>
                <button type="submit" class="primary wide" data-reg-finish="1">
                  Finish &amp; open Clock 14
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {showRegDisc && (
        <DisclosureModal closing={regDiscClosing} onAccept={acceptRegistrationDisclosure} />
      )}
    </div>
  );
}

/** Compact one-tap driver strip on Now (and Settings header pill) for clear active-driver visibility and switching. */
export function ActiveDriverStrip({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  if (!name) return null;
  return (
    <button
      type="button"
      class="driver-strip"
      data-driver-strip="1"
      aria-label={`Signed in as ${name}. Tap to switch driver`}
      onClick={onSwitch}
    >
      <span class="driver-strip-left">
        <span class="driver-avatar driver-avatar-sm" aria-hidden="true">{driverInitials(name)}</span>
        <span class="driver-strip-name">
          <span class="muted small">Driver</span>{' '}
          <b>{name}</b>
        </span>
      </span>
      <span class="driver-strip-act">
        <SvgIcon d={ICON_SWITCH} size={16} />
        <span>Switch</span>
      </span>
    </button>
  );
}

/** Top card in Settings for managing the signed-in driver: switch, rename, change PIN, update recovery, or remove profile. */
export function DriverSettingsCard({ driverId, driverName }: { driverId: string | null; driverName: string }) {
  const [panel, setPanel] = useState<'none' | 'rename' | 'pin' | 'recovery' | 'remove'>('none');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState(driverName);
  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [q1, setQ1] = useState(REMINDER_QUESTIONS[0].id);
  const [q2, setQ2] = useState(REMINDER_QUESTIONS[1].id);
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');

  if (!driverId || !driverName) return null;

  const openPanel = (next: typeof panel) => {
    setPanel((cur) => (cur === next ? 'none' : next));
    setMsg(null);
    setErr(null);
    setNameInput(driverName);
    setCurPin('');
    setNewPin('');
    setConfirmPin('');
    setA1('');
    setA2('');
  };

  const doRename = (e: Event) => {
    e.preventDefault();
    const res = renameDriver(driverId, nameInput);
    if (!res.ok) { setErr(res.error); return; }
    setErr(null);
    setMsg('Driver name updated.');
    setPanel('none');
  };

  const doChangePin = (e: Event) => {
    e.preventDefault();
    if (!isValidPin(newPin)) { setErr('New PIN must be 4 digits.'); return; }
    if (newPin !== confirmPin) { setErr("New PINs didn't match."); return; }
    const res = changeDriverPin(driverId, curPin, newPin);
    if (!res.ok) { setErr(res.error); return; }
    setErr(null);
    setMsg('PIN updated.');
    setPanel('none');
  };

  const doUpdateRecovery = (e: Event) => {
    e.preventDefault();
    const res = updateDriverRecovery(driverId, curPin, buildRecoveryInputs(q1, q2, a1, a2));
    if (!res.ok) { setErr(res.error); return; }
    setErr(null);
    setMsg('Recovery questions updated.');
    setPanel('none');
  };

  const doRemove = (e: Event) => {
    e.preventDefault();
    const res = removeDriverProfile(driverId, curPin);
    if (!res.ok) { setErr(res.error); return; }
  };

  return (
    <section class="card driver-settings-card" data-driver-settings="1">
      <h2>Driver</h2>
      <div class="driver-card-id">
        <span class="driver-avatar" aria-hidden="true">{driverInitials(driverName)}</span>
        <div class="driver-card-meta">
          <b>{driverName}</b>
          <span class="muted small">Signed in · logs, settings &amp; plans stay separate</span>
        </div>
      </div>

      <button type="button" class="primary wide" data-switch-driver="1" onClick={() => lockDriverSession()}>
        <SvgIcon d={ICON_SWITCH} size={18} /> Switch driver
      </button>

      <div class="driver-card-actions">
        <button type="button" class="rowbtn" onClick={() => openPanel('pin')}>
          <span><b>Change PIN</b><br /><span class="muted small">Update your 4-digit unlock code</span></span>
          <SvgIcon d={ICON_KEY} size={18} />
        </button>
        <button type="button" class="rowbtn" onClick={() => openPanel('rename')}>
          <span><b>Rename driver</b><br /><span class="muted small">Change how your name appears on this phone and exports</span></span>
          <SvgIcon d={ICON_USER} size={18} />
        </button>
        <button type="button" class="rowbtn" onClick={() => openPanel('recovery')}>
          <span><b>Update recovery questions</b><br /><span class="muted small">Change the reminder questions used if you forget your PIN</span></span>
          <SvgIcon d={ICON_NEXT} size={18} />
        </button>
      </div>

      {msg && <p class="ok small" style="margin-top:8px">{msg}</p>}

      {panel === 'rename' && (
        <form class="driver-subform" onSubmit={doRename}>
          <label>
            Driver name
            <input type="text" maxLength={MAX_DRIVER_NAME_LEN} value={nameInput} onInput={(e) => setNameInput((e.target as HTMLInputElement).value)} />
          </label>
          {err && <div class="warnbox small" role="alert">{err}</div>}
          <div class="row">
            <button type="submit" class="primary">Save name</button>
            <button type="button" onClick={() => setPanel('none')}>Cancel</button>
          </div>
        </form>
      )}

      {panel === 'pin' && (
        <form class="driver-subform" onSubmit={doChangePin}>
          <label>
            Current 4-digit PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={curPin} onInput={(e) => setCurPin((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          <label>
            New 4-digit PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={newPin} onInput={(e) => setNewPin((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          <label>
            Confirm new PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={confirmPin} onInput={(e) => setConfirmPin((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {err && <div class="warnbox small" role="alert">{err}</div>}
          <div class="row">
            <button type="submit" class="primary">Update PIN</button>
            <button type="button" onClick={() => setPanel('none')}>Cancel</button>
          </div>
        </form>
      )}

      {panel === 'recovery' && (
        <form class="driver-subform" onSubmit={doUpdateRecovery}>
          <label>
            Current 4-digit PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={curPin} onInput={(e) => setCurPin((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          <RecoveryEditor q1={q1} q2={q2} a1={a1} a2={a2} onQ1={setQ1} onQ2={setQ2} onA1={setA1} onA2={setA2} />
          {err && <div class="warnbox small" role="alert">{err}</div>}
          <div class="row">
            <button type="submit" class="primary">Save questions</button>
            <button type="button" onClick={() => setPanel('none')}>Cancel</button>
          </div>
        </form>
      )}

      <button type="button" class="danger" onClick={() => openPanel('remove')}>Remove this driver</button>
      {panel === 'remove' && (
        <form class="driver-subform" onSubmit={doRemove}>
          <p class="small"><b>This deletes {driverName}'s logs, settings, and plans from this phone.</b> Other drivers on this phone are not affected.</p>
          <label>
            Enter {driverName}'s PIN to confirm
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={curPin} onInput={(e) => setCurPin((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {err && <div class="warnbox small" role="alert">{err}</div>}
          <div class="row">
            <button type="submit" class="danger">Delete {driverName}</button>
            <button type="button" onClick={() => setPanel('none')}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
