/** Dev-only logger — all output is stripped in production builds */
export const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export const devWarn = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};

export const devError = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
};
