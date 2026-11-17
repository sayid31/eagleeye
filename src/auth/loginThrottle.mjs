// src/auth/loginThrottle.mjs
/**
 * Per-account sign-in throttle storage (plan/auth/03 §Throttle). Counters are
 * incremented ATOMICALLY in SQL (`failedLoginCount = failedLoginCount + 1`
 * via the adapter's `incrementOne`), so ten concurrent wrong passwords count
 * ten. Unknown emails are counted too, by keyed hash in `login_throttle`, so a
 * throttled answer does not reveal whether an account exists.
 *
 * @module auth/loginThrottle
 */

import { isThrottled, throttleDelayMs } from './accountPolicy.mjs';
import { LOGIN_THROTTLE_MODEL } from './authSchema.mjs';
import { hashEmail } from './loginLog.mjs';
import { normalizeEmail } from './authRoles.mjs';

const byId = (id) => [{ field: 'id', value: id }];

/**
 * @param {object} deps
 * @param {() => Promise<object>} deps.getContext Resolves Better Auth's `$context`.
 * @param {string} deps.secret For the email hash.
 * @param {() => number} [deps.now]
 */
export function createLoginThrottle({ getContext, secret, now = () => Date.now() }) {
  async function lookup(email) {
    const ctx = await getContext();
    const found = await ctx.internalAdapter.findUserByEmail(normalizeEmail(email));
    return { ctx, user: found?.user ?? null, emailHash: hashEmail(email, secret) };
  }

  async function throttleRow(ctx, emailHash) {
    return ctx.adapter.findOne({ model: LOGIN_THROTTLE_MODEL, where: [{ field: 'emailHash', value: emailHash }] });
  }

  /**
   * @param {string} email
   * @returns {Promise<{throttled: boolean, userId: string | null, emailHash: string}>}
   */
  async function check(email) {
    const { ctx, user, emailHash } = await lookup(email);
    const until = user ? user.throttleUntil : (await throttleRow(ctx, emailHash))?.throttleUntil;
    return { throttled: isThrottled(until, now()), userId: user?.id ?? null, emailHash };
  }

  /**
   * Count one failed password and start the delay once over the threshold.
   * @param {string} email
   * @returns {Promise<{failures: number, throttleUntil: Date | null, userId: string | null, emailHash: string}>}
   */
  async function recordFailure(email) {
    const { ctx, user, emailHash } = await lookup(email);
    let failures;
    let where;
    if (user) {
      const updated = await ctx.adapter.incrementOne({ model: 'user', where: byId(user.id), increment: { failedLoginCount: 1 } });
      failures = Number(updated?.failedLoginCount ?? 0);
      where = { model: 'user', where: [...byId(user.id), { field: 'failedLoginCount', value: failures }] };
    } else {
      const keyed = [{ field: 'emailHash', value: emailHash }];
      if (!await throttleRow(ctx, emailHash)) {
        try {
          await ctx.adapter.create({ model: LOGIN_THROTTLE_MODEL, data: { emailHash, failedCount: 0, updatedAt: new Date(now()) } });
        } catch (error) {
          // A concurrent attempt created the row first (unique emailHash); anything else is real.
          if (!await throttleRow(ctx, emailHash)) throw new Error(`login_throttle insert failed: ${error.message}`);
        }
      }
      const updated = await ctx.adapter.incrementOne({ model: LOGIN_THROTTLE_MODEL, where: keyed, increment: { failedCount: 1 }, set: { updatedAt: new Date(now()) } });
      failures = Number(updated?.failedCount ?? 0);
      where = { model: LOGIN_THROTTLE_MODEL, where: [...keyed, { field: 'failedCount', value: failures }] };
    }
    const delay = throttleDelayMs(failures);
    const throttleUntil = delay ? new Date(now() + delay) : null;
    // Guarded by the count just written: a concurrent later failure sets its own (longer) delay.
    if (throttleUntil) await ctx.adapter.update({ ...where, update: { throttleUntil } });
    return { failures, throttleUntil, userId: user?.id ?? null, emailHash };
  }

  /**
   * Reset an account's counter (successful sign-in, admin password reset, `auth:unlock`).
   * @param {string} userId
   */
  async function clearUser(userId) {
    const ctx = await getContext();
    await ctx.adapter.update({ model: 'user', where: byId(userId), update: { failedLoginCount: 0, throttleUntil: null } });
  }

  /**
   * Reset the unknown-email counter for an address (`auth:unlock`).
   * @param {string} email
   */
  async function clearEmail(email) {
    const ctx = await getContext();
    await ctx.adapter.deleteMany({ model: LOGIN_THROTTLE_MODEL, where: [{ field: 'emailHash', value: hashEmail(email, secret) }] });
  }

  return { check, recordFailure, clearUser, clearEmail };
}
