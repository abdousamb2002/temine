/**
 * 终端内实时状态面板
 * 类似 htop 风格，持续刷新显示所有终端窗口的 AI 状态
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STATE_DIR = join(homedir(), '.temine');
const STATE_FILE = join(STATE_DIR, 'state.json');
const PID_FILE = join(STATE_DIR, 'watcher.pid');

const STATE_DISPLAY = {
  idle:             { icon: '⚪', label: '空闲',     color: '\x1b[37m' },     // 白
  running:          { icon: '🟢', label: '运行中',   color: '\x1b[32m' },     // 绿
  waiting_confirm:  { icon: '🔴', label: '等待确认', color: '\x1b[31;1m' },   // 红+粗
  error:            { icon: '❌', label: '错误',     color: '\x1b[31m' },     // 红
  completed:        { icon: '✅', label: '完成',     color: '\x1b[36m' },     // 青
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const BG_RED = '\x1b[41;37;1m';

/**
 * 检查 watcher 是否在运行
 */
function isWatcherRunning() {
  if (!existsSync(PID_FILE)) return false;
  const pid = readFileSync(PID_FILE, 'utf-8').trim();
  try {
    process.kill(parseInt(pid), 0);
    return parseInt(pid);
  } catch {
    return false;
  }
}

/**
 * 读取状态数据
 */
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 渲染面板
 */
function render(blinkOn) {
  const state = readState();
  const entries = Object.entries(state);
  const watcherPid = isWatcherRunning();
  const now = new Date().toLocaleString('zh-CN');

  // 计算面板宽度
  const width = 54;
  const hr = '─'.repeat(width);

  // 清屏 + 移动光标到左上角
  let output = '\x1b[2J\x1b[H';

  // 标题
  output += `${BOLD}╔${'═'.repeat(width)}╗${RESET}\n`;
  output += `${BOLD}║${RESET}  Temine 状态面板${' '.repeat(width - 18 - now.length)}${DIM}${now}${RESET}  ${BOLD}║${RESET}\n`;
  output += `${BOLD}╠${'═'.repeat(width)}╣${RESET}\n`;

  if (entries.length === 0) {
    output += `${BOLD}║${RESET}  暂无终端窗口${' '.repeat(width - 14)}${BOLD}║${RESET}\n`;
  } else {
    for (const [id, info] of entries) {
      const display = STATE_DISPLAY[info.state] || STATE_DISPLAY.idle;
      let name = (info.name || id).slice(0, 20).padEnd(20);
      let statusText = display.label;

      // 等待确认状态闪烁效果
      if (info.state === 'waiting_confirm') {
        if (blinkOn) {
          statusText = `${BG_RED} ⚡ ${statusText}! ${RESET}`;
        } else {
          statusText = `   ${display.color}${statusText}!${RESET} `;
        }
        const padding = width - 24 - 16;
        output += `${BOLD}║${RESET}  ${display.icon} ${display.color}${name}${RESET}  ${statusText}${' '.repeat(Math.max(0, padding))}${BOLD}║${RESET}\n`;
      } else {
        const line = `  ${display.icon} ${display.color}${name}${RESET}  ${statusText}`;
        // 计算实际可见字符宽度（去掉 ANSI 码）
        const visibleLen = `  ${display.icon} ${name}  ${display.label}`.length + 2; // icon 占 2 宽度
        const padding = width - visibleLen;
        output += `${BOLD}║${RESET}${line}${' '.repeat(Math.max(0, padding))}${BOLD}║${RESET}\n`;
      }
    }
  }

  // 底部状态栏
  output += `${BOLD}╠${'═'.repeat(width)}╣${RESET}\n`;

  const watcherStatus = watcherPid
    ? `${BOLD}监控: 🟢 运行中 (PID: ${watcherPid})${RESET}`
    : `${DIM}监控: ⚪ 未运行${RESET}`;
  const quitHint = `${DIM}按 q 退出${RESET}`;
  // 简单处理底部行
  const bottomText = watcherPid
    ? `  监控: 🟢 PID:${watcherPid}`
    : '  监控: ⚪ 未运行';
  const bottomPad = width - bottomText.length - 10;

  output += `${BOLD}║${RESET}${watcherStatus}${' '.repeat(Math.max(2, 10))}${quitHint}  ${BOLD}║${RESET}\n`;
  output += `${BOLD}╚${'═'.repeat(width)}╝${RESET}\n`;

  process.stdout.write(output);
}

/**
 * 启动悬浮状态面板
 */
export async function startFloat() {
  const watcherPid = isWatcherRunning();
  if (!watcherPid) {
    console.log('⚠️  监控未运行。建议先运行 temine watch 启动监控。');
    console.log('   面板将显示空状态，启动监控后自动刷新。\n');
  }

  // 隐藏光标
  process.stdout.write('\x1b[?25l');

  // 设置 raw mode 捕获按键
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
  }

  let blinkOn = true;

  // 渲染循环
  const renderTimer = setInterval(() => {
    blinkOn = !blinkOn;
    render(blinkOn);
  }, 500);

  // 初次渲染
  render(blinkOn);

  // 按键监听
  const cleanup = () => {
    clearInterval(renderTimer);
    // 显示光标
    process.stdout.write('\x1b[?25h');
    // 清屏
    process.stdout.write('\x1b[2J\x1b[H');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('👋 已退出状态面板');
    process.exit(0);
  };

  process.stdin.on('data', (key) => {
    if (key === 'q' || key === 'Q' || key === '\x03') { // q 或 Ctrl+C
      cleanup();
    }
  });

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
