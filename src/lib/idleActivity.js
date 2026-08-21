export const shouldIgnoreIdleActivity = target => Boolean(
  target?.closest?.('[data-idle-ignore="true"]'),
);
