#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { openTerminals, arrangeWindows, listLayouts } from '../lib/terminal-opener.js';
import { startWatcher, stopWatcher, showStatus } from '../lib/ai-watcher.js';
import { labelWindow, labelAll, listWindows } from '../lib/terminal-label.js';
import { searchLogs, showTimeline, exportLog } from '../lib/logger.js';
import { showConfig, setConfigValue, resetConfig } from '../lib/config.js';
import { startFloat } from '../lib/float.js';
import { startPanel } from '../lib/panel.js';

const VERSION = '0.7.0';
const args = process.argv.slice(2);
const command = args[0];

// --version / -v
if (args.includes('--version') || args.includes('-v')) {
  console.log(`temine v${VERSION}`);
  process.exit(0);
}

// --help / -h（无命令时也显示帮助）
if (args.includes('--help') || args.includes('-h') || !command) {
  if (!command) {
    printHelp();
    process.exit(0);
  }
}

switch (command) {
  case 'open': {
    const count = parseInt(args[1]) || 2;
    const { values } = parseArgs({
      args: args.slice(2),
      options: {
        cols: { type: 'string', default: '0' },
        app: { type: 'string', default: '' },
        gap: { type: 'string', default: '0' },
      },
      strict: false,
    });
    await openTerminals(count, {
      cols: parseInt(values.cols) || 0,
      app: values.app || undefined,
      gap: parseInt(values.gap) || undefined,
    });
    break;
  }

  case 'arrange': {
    const sub = args[1];
    if (sub === 'layouts' || sub === 'list') {
      listLayouts();
      break;
    }
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        cols: { type: 'string', default: '0' },
        layout: { type: 'string', default: '' },
        app: { type: 'string', default: '' },
        gap: { type: 'string', default: '0' },
      },
      strict: false,
    });
    await arrangeWindows({
      cols: parseInt(values.cols) || 0,
      layout: values.layout || undefined,
      app: values.app || undefined,
      gap: parseInt(values.gap) || undefined,
    });
    break;
  }

  case 'label': {
    const windowIndex = parseInt(args[1]);
    const name = args.slice(2).join(' ');
    if (isNaN(windowIndex) || !name) {
      console.log('用法: temine label <窗口编号> <标签名>');
      console.log('示例: temine label 1 前端重构');
      console.log('      temine label 3 claude-api测试');
      console.log('\n标签名包含关键字会自动匹配图标:');
      console.log('  fe/frontend=🎨 be/backend=⚙️  api=🔌 test=🧪');
      console.log('  claude/ai=🤖 debug=🐛 deploy=🚀 docs=📝');
      console.log('\n运行 temine list 查看窗口编号');
    } else {
      await labelWindow(windowIndex, name);
    }
    break;
  }

  case 'label-all': {
    const names = args.slice(1);
    if (names.length === 0) {
      console.log('用法: temine label-all <名称1> <名称2> <名称3> ...');
      console.log('示例: temine label-all 前端重构 API开发 测试 监控');
      console.log('\n按窗口顺序依次命名，自动加编号和图标');
    } else {
      await labelAll(names);
    }
    break;
  }

  case 'list': {
    await listWindows();
    break;
  }

  case 'watch': {
    await startWatcher();
    break;
  }

  case 'status': {
    await showStatus();
    break;
  }

  case 'stop': {
    await stopWatcher();
    break;
  }

  case 'float': {
    await startFloat();
    break;
  }

  case 'panel': {
    const port = parseInt(args[1]) || 7890;
    await startPanel(port);
    break;
  }

  case 'app': {
    // 生成 macOS .app 快捷方式，可放入 Dock / Applications
    if (process.platform !== 'darwin') {
      console.log('❌ temine app 仅支持 macOS');
      break;
    }
    const appPort = parseInt(args[1]) || 7890;
    const appDir = args.includes('--global')
      ? '/Applications/Temine.app'
      : `${process.env.HOME}/Applications/Temine.app`;

    const { mkdirSync, writeFileSync, chmodSync, existsSync } = await import('node:fs');
    const contentsDir = `${appDir}/Contents`;
    const macosDir = `${contentsDir}/MacOS`;

    mkdirSync(macosDir, { recursive: true });

    // 查找 temine 的绝对路径
    const { execSync: ex } = await import('node:child_process');
    let teminePath;
    try { teminePath = ex('which temine', { encoding: 'utf8' }).trim(); } catch {
      teminePath = `${process.argv[1]}`;
    }

    // 生成启动脚本
    const launcher = `#!/bin/bash
# Temine Panel Launcher
PORT=${appPort}
URL="http://localhost:$PORT"
TEMINE="${teminePath}"

# 检查面板是否已运行
if ! curl -s --connect-timeout 1 "$URL" > /dev/null 2>&1; then
  # 后台启动面板服务
  nohup "$TEMINE" panel $PORT > /dev/null 2>&1 &
  # 等待服务就绪（最多5秒）
  for i in $(seq 1 50); do
    if curl -s --connect-timeout 1 "$URL" > /dev/null 2>&1; then break; fi
    sleep 0.1
  done
fi

# 用 Chrome/Edge app mode 打开，fallback 到默认浏览器
if open -a "Google Chrome" --args --app="$URL" 2>/dev/null; then
  exit 0
elif open -a "Microsoft Edge" --args --app="$URL" 2>/dev/null; then
  exit 0
else
  open "$URL"
fi
`;
    writeFileSync(`${macosDir}/Temine`, launcher);
    chmodSync(`${macosDir}/Temine`, 0o755);

    // 生成 Info.plist
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>Temine</string>
  <key>CFBundleIdentifier</key><string>com.temine.panel</string>
  <key>CFBundleName</key><string>Temine</string>
  <key>CFBundleVersion</key><string>0.8.0</string>
  <key>CFBundleShortVersionString</key><string>0.8.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>`;
    writeFileSync(`${contentsDir}/Info.plist`, plist);

    console.log(`\n✅ 已生成 Temine.app`);
    console.log(`   位置: ${appDir}`);
    console.log(`   端口: ${appPort}`);
    console.log(`\n   使用方式:`);
    console.log(`   • 双击打开，或拖到 Dock 固定`);
    console.log(`   • Spotlight 搜索 "Temine" 打开`);
    if (!appDir.startsWith('/Applications')) {
      console.log(`\n   💡 加 --global 可安装到 /Applications:`);
      console.log(`      sudo temine app --global`);
    }
    console.log('');
    break;
  }

  case 'config': {
    const sub = args[1];
    if (sub === 'set') {
      const key = args[2];
      const value = args[3];
      if (!key || value === undefined) {
        console.log('用法: temine config set <key> <value>');
        console.log('示例: temine config set watch.interval 500');
      } else {
        setConfigValue(key, value);
        console.log(`✅ 已设置 ${key} = ${value}`);
      }
    } else if (sub === 'reset') {
      resetConfig();
    } else {
      showConfig();
    }
    break;
  }

  case 'log': {
    const sub = args[1];
    if (sub === 'search') {
      const keyword = args.slice(2).join(' ');
      if (!keyword) {
        console.log('用法: temine log search <关键词>');
      } else {
        await searchLogs(keyword);
      }
    } else if (sub === 'show') {
      const windowId = args[2];
      const lines = parseInt(args[3]) || 50;
      await showTimeline(windowId, lines);
    } else if (sub === 'export') {
      const windowId = args[2];
      const outFile = args[3];
      await exportLog(windowId, outFile);
    } else if (sub === 'list') {
      await showTimeline(null, 0);
    } else {
      console.log(`
  用法:
    temine log list                      列出所有记录的会话
    temine log show <窗口ID> [行数]       查看某个窗口的输出记录
    temine log search <关键词>            搜索所有记录
    temine log export <窗口ID> [文件名]   导出记录到文件
`);
    }
    break;
  }

  case '--help':
  case '-h': {
    printHelp();
    break;
  }

  default: {
    console.log(`未知命令: ${command}`);
    console.log('运行 temine --help 查看帮助');
  }
}

function printHelp() {
  console.log(`
  Temine v${VERSION} - AI 编程终端管理工具

  终端管理:
    temine open <数量>                   打开多个终端并自动排列
      --cols <列数>                      指定列数（默认自动计算）
      --app <Terminal|iTerm>             终端应用
      --gap <间距>                       窗口间距像素
    temine arrange                       排布已有的终端窗口
      --cols <列数>                      指定列数
      --layout <预设>                    使用布局预设 (2x1/3x2/1+2 等)
    temine arrange layouts               查看所有布局预设

  标签:
    temine list                          列出所有终端窗口
    temine label <编号> <标签名>          给窗口命名（自动匹配图标）
    temine label-all <名1> <名2> ...     批量命名所有窗口

  AI 监控:
    temine watch                         启动 AI 状态监控
    temine status                        查看监控状态
    temine stop                          停止监控
    temine float                         终端内状态面板
    temine panel [端口]                   打开 Web 控制面板（默认 7890）
    temine app [端口] [--global]          生成 macOS .app 快捷方式到 Dock

  历史记录:
    temine log list                      列出记录的会话
    temine log show <ID> [行数]          查看输出历史
    temine log search <关键词>           搜索历史记录
    temine log export <ID> [文件]        导出记录

  配置:
    temine config                        查看配置
    temine config set <key> <val>        修改配置
    temine config reset                  重置默认配置

  示例:
    temine open 4                        打开 4 个终端
    temine arrange --layout 3x2          把已有窗口排成 3列2行
    temine arrange --cols 3              把已有窗口排成 3 列
    temine label 1 claude-frontend重构   给窗口1命名（自动加 ① 🎨）
    temine label-all 前端 API test 监控  一次性命名所有窗口
    temine watch                         启动监控
    temine panel                         打开 Web 控制面板
    temine app                           生成 Temine.app 放到 Dock
`);
}
