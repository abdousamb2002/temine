/**
 * 终端窗口打开与排布
 * 支持打开新窗口 + 排布已有窗口
 */

import { execSync } from 'node:child_process';
import { loadConfig } from './config.js';

/**
 * 获取屏幕尺寸
 */
function getScreenSize() {
  try {
    const script = `
      tell application "Finder"
        set screenBounds to bounds of window of desktop
        return (item 3 of screenBounds) & "," & (item 4 of screenBounds)
      end tell
    `;
    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' }).trim();
    const [width, height] = result.split(',').map(Number);
    return { width, height };
  } catch {
    return { width: 1920, height: 1080 };
  }
}

/**
 * 计算网格布局
 */
function calculateGrid(count, screenWidth, screenHeight, cols, gap, menuBarHeight = 25, dockHeight = 70) {
  if (!cols || cols <= 0) {
    // 智能列数：
    // 1-2 个窗口 -> 横排
    // 3 个 -> 3列1行
    // 4 个 -> 2列2行
    // 5-6 个 -> 3列2行
    // 7-9 个 -> 3列3行
    if (count <= 3) cols = count;
    else if (count <= 4) cols = 2;
    else if (count <= 6) cols = 3;
    else if (count <= 8) cols = 4;
    else cols = Math.ceil(Math.sqrt(count));
  }
  const rows = Math.ceil(count / cols);

  const availableWidth = screenWidth - gap * (cols + 1);
  const availableHeight = screenHeight - menuBarHeight - dockHeight - gap * (rows + 1);
  const cellWidth = Math.floor(availableWidth / cols);
  const cellHeight = Math.floor(availableHeight / rows);

  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    positions.push({
      x: gap + col * (cellWidth + gap),
      y: menuBarHeight + gap + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    });
  }
  return { positions, cols, rows };
}

// 布局预设
const LAYOUT_PRESETS = {
  '2x1': { cols: 2, desc: '2列1行（左右分屏）' },
  '1x2': { cols: 1, desc: '1列2行（上下分屏）' },
  '3x1': { cols: 3, desc: '3列1行' },
  '2x2': { cols: 2, desc: '2列2行' },
  '3x2': { cols: 3, desc: '3列2行' },
  '2x3': { cols: 2, desc: '2列3行' },
  '4x2': { cols: 4, desc: '4列2行' },
  '1+2':  { custom: 'topOneBottomTwo', desc: '上1下2（主+副）' },
};

/**
 * 计算 1+2 布局（上面一个大窗口，下面两个小窗口）
 */
function calculateTopOneBottomTwo(count, screenWidth, screenHeight, gap, menuBarHeight = 25, dockHeight = 70) {
  const availableWidth = screenWidth - gap * 2;
  const availableHeight = screenHeight - menuBarHeight - dockHeight - gap * 3;
  const topHeight = Math.floor(availableHeight * 0.55);
  const bottomHeight = availableHeight - topHeight;
  const bottomCols = Math.max(count - 1, 1);
  const bottomCellWidth = Math.floor((availableWidth - gap * (bottomCols - 1)) / bottomCols);

  const positions = [
    // 顶部大窗口
    { x: gap, y: menuBarHeight + gap, width: availableWidth, height: topHeight },
  ];

  // 底部小窗口
  for (let i = 0; i < count - 1; i++) {
    positions.push({
      x: gap + i * (bottomCellWidth + gap),
      y: menuBarHeight + gap + topHeight + gap,
      width: bottomCellWidth,
      height: bottomHeight,
    });
  }

  return { positions, cols: bottomCols, rows: 2 };
}

/**
 * 生成打开 Terminal.app 的 AppleScript
 */
function buildTerminalScript(positions) {
  const windowCommands = positions.map((pos, i) => {
    if (i === 0) {
      return `
    if (count of windows) = 0 then
      do script ""
    end if
    set bounds of window 1 to {${pos.x}, ${pos.y}, ${pos.x + pos.width}, ${pos.y + pos.height}}
    set custom title of tab 1 of window 1 to "终端 ${i + 1}"`;
    } else {
      return `
    do script ""
    delay 0.3
    set bounds of window 1 to {${pos.x}, ${pos.y}, ${pos.x + pos.width}, ${pos.y + pos.height}}
    set custom title of tab 1 of window 1 to "终端 ${i + 1}"`;
    }
  }).join('\n');

  return `
tell application "Terminal"
  activate
  ${windowCommands}
end tell
`;
}

/**
 * 生成打开 iTerm2 的 AppleScript
 */
function buildITermScript(positions) {
  const windowCommands = positions.map((pos, i) => {
    return `
    create window with default profile
    delay 0.3
    set bounds of current window to {${pos.x}, ${pos.y}, ${pos.x + pos.width}, ${pos.y + pos.height}}`;
  }).join('\n');

  return `
tell application "iTerm"
  activate
  ${windowCommands}
end tell
`;
}

/**
 * 打开多个终端窗口并排列
 */
export async function openTerminals(count, options = {}) {
  const config = loadConfig();
  const defaults = config.terminal || {};
  const { cols = 0, app = defaults.app || 'Terminal', gap = defaults.gap || 10 } = options;

  console.log(`正在打开 ${count} 个 ${app} 终端窗口...`);

  const screen = getScreenSize();
  console.log(`屏幕尺寸: ${screen.width} x ${screen.height}`);

  const layout = calculateGrid(count, screen.width, screen.height, cols, gap);
  console.log(`布局: ${layout.rows} 行 x ${layout.cols} 列`);

  let script;
  if (app.toLowerCase().includes('iterm')) {
    script = buildITermScript(layout.positions);
  } else {
    script = buildTerminalScript(layout.positions);
  }

  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    console.log(`✅ 已打开 ${count} 个终端窗口并排列完成`);
    console.log(`\n接下来你可以：`);
    console.log(`  temine label 1 项目名       给窗口打标签`);
    console.log(`  temine watch                启动 AI 状态监控`);
  } catch (err) {
    if (process.platform !== 'darwin') {
      console.error('❌ 此功能仅支持 macOS');
    } else {
      console.error('❌ 打开终端失败:', err.message);
    }
  }
}

/**
 * 排布已有终端窗口
 */
export async function arrangeWindows(options = {}) {
  if (process.platform !== 'darwin') {
    console.error('❌ 此功能仅支持 macOS');
    return;
  }

  const config = loadConfig();
  const defaults = config.terminal || {};
  const { cols = 0, layout: layoutPreset, app } = options;
  const gap = options.gap || defaults.gap || 10;
  const menuBarHeight = defaults.menuBarHeight || 25;
  const dockHeight = defaults.dockHeight || 70;

  // 检测终端应用
  const termApp = app || defaults.app || 'Terminal';
  const isITerm = termApp.toLowerCase().includes('iterm');
  const appName = isITerm ? 'iTerm' : 'Terminal';

  // 获取当前窗口数量
  const countScript = isITerm
    ? `tell application "iTerm" to return count of windows`
    : `tell application "Terminal" to return count of windows`;

  let windowCount;
  try {
    windowCount = parseInt(execSync(`osascript -e '${countScript}'`, { encoding: 'utf-8' }).trim());
  } catch {
    console.log(`❌ 无法获取 ${appName} 窗口信息`);
    return;
  }

  if (windowCount === 0) {
    console.log(`${appName} 没有打开的窗口`);
    return;
  }

  console.log(`找到 ${windowCount} 个 ${appName} 窗口，正在排布...`);

  const screen = getScreenSize();
  console.log(`屏幕尺寸: ${screen.width} x ${screen.height}`);

  // 计算布局
  let layoutResult;

  if (layoutPreset && LAYOUT_PRESETS[layoutPreset]) {
    const preset = LAYOUT_PRESETS[layoutPreset];
    if (preset.custom === 'topOneBottomTwo') {
      layoutResult = calculateTopOneBottomTwo(windowCount, screen.width, screen.height, gap, menuBarHeight, dockHeight);
    } else {
      layoutResult = calculateGrid(windowCount, screen.width, screen.height, preset.cols, gap, menuBarHeight, dockHeight);
    }
    console.log(`布局预设: ${layoutPreset} (${preset.desc})`);
  } else {
    layoutResult = calculateGrid(windowCount, screen.width, screen.height, cols, gap, menuBarHeight, dockHeight);
  }

  console.log(`布局: ${layoutResult.rows} 行 x ${layoutResult.cols} 列`);

  // 生成排布 AppleScript（不新建窗口，只移动已有窗口）
  const arrangeCommands = layoutResult.positions.slice(0, windowCount).map((pos, i) => {
    const winIndex = i + 1;
    return `    set bounds of window ${winIndex} to {${pos.x}, ${pos.y}, ${pos.x + pos.width}, ${pos.y + pos.height}}`;
  }).join('\n');

  const arrangeScript = `
tell application "${appName}"
  activate
${arrangeCommands}
end tell
`;

  try {
    execSync(`osascript -e '${arrangeScript.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 15000,
    });
    console.log(`✅ 已排布 ${windowCount} 个窗口`);
  } catch (err) {
    console.error('❌ 排布失败:', err.message);
  }
}

/**
 * 列出可用的布局预设
 */
export function listLayouts() {
  console.log('可用布局预设:\n');
  console.log('  名称    说明');
  console.log('  ──────  ────────────────────');
  for (const [name, preset] of Object.entries(LAYOUT_PRESETS)) {
    console.log(`  ${name.padEnd(6)}  ${preset.desc}`);
  }
  console.log(`\n使用: temine arrange --layout <名称>`);
  console.log('示例: temine arrange --layout 3x2');
  console.log('      temine arrange --layout 1+2');
}
