/**
 * Hidden terminal prompt for the auth CLI: the password is typed into the
 * TTY with echo off — never taken from argv (shell history, `ps`) or a pipe.
 */

/**
 * @param {string} label
 * @param {{input?: NodeJS.ReadStream, output?: NodeJS.WriteStream}} [streams]
 * @returns {Promise<string>}
 */
export function promptHidden(label, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) return Promise.reject(new Error('this command needs an interactive terminal (the password is never read from a pipe or argv)'));
  return new Promise((resolve, reject) => {
    let value = '';
    // Echo off BEFORE the label appears: nothing typed after the prompt can be echoed.
    input.setRawMode(true);
    output.write(label);
    input.resume();
    input.setEncoding('utf8');
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') return finish(new Error('cancelled'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
      return undefined;
    }
    input.on('data', onData);
  });
}

/**
 * `--email <address>` from argv.
 * @param {string[]} argv
 * @returns {string | null}
 */
export function emailArgument(argv) {
  const at = argv.indexOf('--email');
  const value = at >= 0 ? argv[at + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}
