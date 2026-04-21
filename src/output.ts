const isTTY = !!process.stderr.isTTY;
const colorEnabled = !process.env.NO_COLOR && isTTY;

const BOLD = colorEnabled ? '\x1b[1m' : '';
const DIM = colorEnabled ? '\x1b[2m' : '';
const CYAN = colorEnabled ? '\x1b[36m' : '';
const GREEN = colorEnabled ? '\x1b[32m' : '';
const YELLOW = colorEnabled ? '\x1b[33m' : '';
const RED = colorEnabled ? '\x1b[31m' : '';
const MAGENTA = colorEnabled ? '\x1b[35m' : '';
const RESET = colorEnabled ? '\x1b[0m' : '';

export function info(msg: string) {
  console.error(`${CYAN}ℹ${RESET} ${msg}`);
}

export function success(msg: string) {
  console.error(`${GREEN}✓${RESET} ${msg}`);
}

export function warn(msg: string) {
  console.error(`${YELLOW}⚠${RESET} ${msg}`);
}

export function error(msg: string) {
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function thought(msg: string) {
  process.stderr.write(`${DIM}${MAGENTA}💭 ${msg}${RESET}\n`);
}

export function statusUpdate(msg: string) {
  process.stderr.write(`${DIM}${YELLOW}⟳ ${msg}${RESET}\n`);
}

export function interactionId(id: string) {
  console.error(`${BOLD}${CYAN}ID:${RESET} ${id}`);
}

export function createSpinner(msg: string) {
  if (!isTTY) {
    // Non-interactive: single line, no animation
    process.stderr.write(`${msg}\n`);
    return {
      update(_newMsg: string) {},
      stop(finalMsg?: string) {
        if (finalMsg) success(finalMsg);
      },
      fail(finalMsg?: string) {
        if (finalMsg) error(finalMsg);
      },
    };
  }

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let currentMsg = msg;
  const timer = setInterval(() => {
    process.stderr.write(`\r\x1b[K${CYAN}${frames[i]}${RESET} ${currentMsg}`);
    i = (i + 1) % frames.length;
  }, 80);

  return {
    update(newMsg: string) {
      currentMsg = newMsg;
    },
    stop(finalMsg?: string) {
      clearInterval(timer);
      process.stderr.write('\r\x1b[K');
      if (finalMsg) success(finalMsg);
    },
    fail(finalMsg?: string) {
      clearInterval(timer);
      process.stderr.write('\r\x1b[K');
      if (finalMsg) error(finalMsg);
    },
  };
}

