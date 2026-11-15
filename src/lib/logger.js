const fmt = (lvl, args) => console[lvl === 'error' ? 'error' : 'log'](`[${new Date().toISOString()}] [${lvl.toUpperCase()}]`, ...args);
export const logger = {
  info: (...a) => fmt('info', a),
  warn: (...a) => fmt('warn', a),
  error: (...a) => fmt('error', a),
};
