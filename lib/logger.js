/**
 * 终端输入输出记录 + 搜索
 *
 * 数据存储在 ~/.temine/logs/ 目录下
 * 每个窗口一个日志文件：<窗口ID>.log
 * 同时维护一个索引文件：index.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const STATE_DIR = join(homedir(), '.temine');
const LOGS_DIR = join(STATE_DIR, 'logs');
const INDEX_FILE = join(LOGS_DIR, 'index.json');

function ensureDir() {
  try { mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
}

function loadIndex() {
  try {
    return JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveIndex(index) {
  ensureDir();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * 记录一次终端快照（由 watcher 调用）
 */
export function recordSnapshot(windowId, windowName, content, label) {
  ensureDir();

  const safeId = String(windowId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const logFile = join(LOGS_DIR, `${safeId}.log`);

  // 更新索引
  const index = loadIndex();
  const now = Date.now();
  if (!index[safeId]) {
    index[safeId] = {
      id: safeId,
      windowName,
      label: label || windowName,
      createdAt: now,
      updatedAt: now,
      logFile: `${safeId}.log`,
    };
  }
  index[safeId].updatedAt = now;
  index[safeId].windowName = windowName;
  if (label) index[safeId].label = label;
  saveIndex(index);

  // 追加内容差异到日志文件（只记录新增内容）
  let previousContent = '';
  if (existsSync(logFile)) {
    // 读取上次保存的最后位置标记
    const markerFile = join(LOGS_DIR, `${safeId}.marker`);
    try {
      previousContent = readFileSync(markerFile, 'utf-8');
    } catch {}
  }

  // 找出新增内容
  let newContent = content;
  if (previousContent && content.startsWith(previousContent)) {
    newContent = content.slice(previousContent.length);
  } else if (previousContent && content.includes(previousContent.slice(-200))) {
    // 部分重叠
    const overlap = previousContent.slice(-200);
    const idx = content.indexOf(overlap);
    if (idx >= 0) {
      newContent = content.slice(idx + overlap.length);
    }
  }

  if (newContent.trim()) {
    const timestamp = new Date().toISOString();
    const entry = `\n--- [${timestamp}] ---\n${newContent}`;
    appendFileSync(logFile, entry);
  }

  // 保存当前内容作为下次的参照
  const markerFile = join(LOGS_DIR, `${safeId}.marker`);
  // 只保留最后 5000 字符作为比对标记
  const marker = content.length > 5000 ? content.slice(-5000) : content;
  writeFileSync(markerFile, marker);
}

/**
 * 搜索所有日志
 */
export async function searchLogs(keyword) {
  ensureDir();
  const index = loadIndex();
  const entries = Object.values(index);

  if (entries.length === 0) {
    console.log('暂无记录。先运行 temine watch 开始记录。');
    return;
  }

  console.log(`搜索 "${keyword}"...\n`);

  let totalMatches = 0;

  for (const entry of entries) {
    const logFile = join(LOGS_DIR, entry.logFile);
    if (!existsSync(logFile)) continue;

    const content = readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(keyword.toLowerCase())) {
        // 取匹配行前后各 1 行作上下文
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length - 1, i + 1);
        const context = lines.slice(start, end + 1).join('\n');
        matches.push({ line: i + 1, context });
      }
    }

    if (matches.length > 0) {
      const label = entry.label || entry.windowName || entry.id;
      console.log(`📁 ${label} (ID: ${entry.id}) - ${matches.length} 处匹配`);
      console.log('─'.repeat(60));

      for (const m of matches.slice(0, 10)) {
        // 高亮关键词
        const highlighted = m.context.replace(
          new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          (match) => `\x1b[43m\x1b[30m${match}\x1b[0m`
        );
        console.log(`  行 ${m.line}:`);
        console.log(`  ${highlighted}`);
        console.log();
      }

      if (matches.length > 10) {
        console.log(`  ... 还有 ${matches.length - 10} 处匹配\n`);
      }

      totalMatches += matches.length;
    }
  }

  if (totalMatches === 0) {
    console.log('未找到匹配结果');
  } else {
    console.log(`共找到 ${totalMatches} 处匹配`);
  }
}

/**
 * 显示时间线 / 列出会话
 */
export async function showTimeline(windowId, lines) {
  ensureDir();
  const index = loadIndex();

  // 没有指定 windowId：列出所有会话
  if (!windowId) {
    const entries = Object.values(index);
    if (entries.length === 0) {
      console.log('暂无记录。先运行 temine watch 开始记录。');
      return;
    }

    console.log('记录的会话:\n');
    console.log('  ID              标签            最后更新');
    console.log('  ──────────────  ──────────────  ────────────────────');

    for (const entry of entries.sort((a, b) => b.updatedAt - a.updatedAt)) {
      const label = (entry.label || '').padEnd(14);
      const time = new Date(entry.updatedAt).toLocaleString('zh-CN');
      console.log(`  ${entry.id.padEnd(14)}  ${label}  ${time}`);
    }

    console.log(`\n用 temine log show <ID> 查看详细输出`);
    return;
  }

  // 显示指定窗口的日志
  const entry = index[windowId];
  if (!entry) {
    console.log(`未找到 ID 为 "${windowId}" 的会话`);
    console.log('运行 temine log list 查看可用会话');
    return;
  }

  const logFile = join(LOGS_DIR, entry.logFile);
  if (!existsSync(logFile)) {
    console.log('日志文件不存在');
    return;
  }

  const content = readFileSync(logFile, 'utf-8');
  const allLines = content.split('\n');

  const label = entry.label || entry.windowName || entry.id;
  console.log(`📁 ${label} (ID: ${entry.id})`);
  console.log(`   创建: ${new Date(entry.createdAt).toLocaleString('zh-CN')}`);
  console.log(`   更新: ${new Date(entry.updatedAt).toLocaleString('zh-CN')}`);
  console.log('─'.repeat(60));

  // 显示最后 N 行
  const displayLines = lines > 0 ? allLines.slice(-lines) : allLines;
  console.log(displayLines.join('\n'));
}

/**
 * 导出日志到文件
 */
export async function exportLog(windowId, outFile) {
  ensureDir();
  const index = loadIndex();

  if (!windowId) {
    console.log('用法: temine log export <窗口ID> [输出文件]');
    return;
  }

  const entry = index[windowId];
  if (!entry) {
    console.log(`未找到 ID 为 "${windowId}" 的会话`);
    return;
  }

  const logFile = join(LOGS_DIR, entry.logFile);
  if (!existsSync(logFile)) {
    console.log('日志文件不存在');
    return;
  }

  const content = readFileSync(logFile, 'utf-8');
  const outputPath = outFile || `temine-${windowId}-${Date.now()}.log`;

  writeFileSync(outputPath, content);
  console.log(`✅ 已导出到 ${outputPath} (${(content.length / 1024).toFixed(1)} KB)`);
}
