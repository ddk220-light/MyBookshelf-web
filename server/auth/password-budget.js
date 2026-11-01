import { hashPassword, verifyPassword } from "better-auth/crypto";
import { AccountRequestError } from "../accounts/security.js";
// Per-process backpressure complements shared address/IP limits. At most two
// native password jobs run and eight wait; no unbounded memory-cost queue.
export function createPasswordBudget({
  concurrency = 2,
  queueLimit = 8,
  timeoutMs = 1000,
} = {}) {
  let active = 0;
  const waiting = [];
  const busy = () =>
    new AccountRequestError(
      503,
      "PASSWORD_BUSY",
      "Sign-in is busy. Try again shortly.",
    );
  const run = async (work) => {
    if (active >= concurrency) {
      if (waiting.length >= queueLimit) throw busy();
      await new Promise((resolve, reject) => {
        const item = {
          resolve: () => {
            clearTimeout(item.timer);
            resolve();
          },
        };
        item.timer = setTimeout(() => {
          const at = waiting.indexOf(item);
          if (at >= 0) waiting.splice(at, 1);
          reject(busy());
        }, timeoutMs);
        waiting.push(item);
      });
    } else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next.resolve();
      else active--;
    }
  };
  return {
    run,
    hash: (password) => run(() => hashPassword(password)),
    verify: (input) => run(() => verifyPassword(input)),
  };
}
export const passwordBudget = createPasswordBudget();
