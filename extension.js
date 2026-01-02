const vscode = require('vscode');
const path = require('path');

const NpmRunButtonsCommands = {
  HISTORY_ITEM_CLICK: 'npm-buttons.historyItemClick',
  TOGGLE_SCRIPT: 'npm-buttons.toggleScript',
  RESET_HISTORY: 'npm-buttons.resetHistory',
  DELETE_HISTORY_ITEM: 'npm-buttons.deleteHistoryItem',
};

const NpmRunButtonsConfig = {
  SPIN_ICON: 'runNpmButtons.spinIcon',
};

const EXTENSION_NAME = 'Run NPM Buttons';

class HistoryItem extends vscode.TreeItem {
  constructor({ full, label, description, isRunning, spinIcon }) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.full = full;
    this.description = description;
    this.tooltip = `Double click to ${isRunning ? 'stop' : 'start'} ${full} script`;
    this.contextValue = 'npmHistoryItem';

    const iconId = isRunning
      ? (spinIcon ? 'loading~spin' : 'primitive-square')
      : 'play';

    this.iconPath = new vscode.ThemeIcon(iconId);

    this.command = {
      command: NpmRunButtonsCommands.HISTORY_ITEM_CLICK,
      arguments: [this.full],
      title: 'Select NPM Script',
    };
  }
}

class HistoryTreeProvider {
  constructor(extInstance) {
    this.ext = extInstance;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const history = this.ext.getHistory();
    return history.map(full => {
      const [pkgDir, script] = full.split('::');
      const label = this.ext.makeLabel(pkgDir, script);
      const description = this.ext.formatRelativePath(pkgDir);
      const isRunning = !!this.ext.running[full];

      return new HistoryItem({
        full,
        label,
        description,
        isRunning,
        spinIcon: this.ext.spinIcon,
      });
    });
  }
}

class NpmButtonsExtension {
  constructor() {
    this.HISTORY_KEY = 'npmButtonsHistory';
    this.disposables = [];
    this.running = {};
    this.output = vscode.window.createOutputChannel(EXTENSION_NAME);
    this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.ctx = null;
    this.spinIcon = true;

    this.historyProvider = null;
    this.lastClick = { full: null, time: 0 };
    this.doubleClickDelay = 350;
  }

  // ----------------- RUN HISTORY PANEL VIEW -----------

  async onHistoryItemClick(full) {
    const now = Date.now();

    if (this.lastClick.full === full && now - this.lastClick.time < this.doubleClickDelay) {
      this.lastClick = { full: null, time: 0 };
      await this.toggleScript(full);
    } else {
      this.lastClick = { full, time: now };
    }
  }

  initHistoryView() {
    this.historyProvider = new HistoryTreeProvider(this);

    this.historyView = vscode.window.createTreeView('npmButtonsHistoryView', {
      treeDataProvider: this.historyProvider,
    });

    return [
      vscode.commands.registerCommand(
        NpmRunButtonsCommands.HISTORY_ITEM_CLICK,
        this.onHistoryItemClick.bind(this),
      ),
      this.historyView,
    ];
  }

  async deleteHistoryItem(itemOrFull) {
    const full = typeof itemOrFull === 'string' ? itemOrFull : itemOrFull.full;
    const history = this.getHistory().filter(x => x !== full);
    await this.setHistory(history);
    this.log('❌ Deleted from history', full);
    this.refreshUI();
  }

  // ----------------- Package manager -----------

  async detectPackageManager(pkgDirUri) {
    const workspaceRoot = this.rootPath;

    this.log('workspaceRoot', workspaceRoot);

    let current = pkgDirUri;

    while (true) {
      this.log('detectPackageManager in folder current:', current);
      const currentAsUri = vscode.Uri.file(current);
      const entries = await vscode.workspace.fs.readDirectory(currentAsUri);
      const names = new Set(entries.map(([name]) => name));

      this.log('detectPackageManager in folder', {
        current,
        names: [...names],
      });

      if (names.has('yarn.lock')) return 'yarn';
      if (names.has('pnpm-lock.yaml')) return 'pnpm';
      if (names.has('bun.lockb')) return 'bun';
      if (names.has('package-lock.json')) return 'npm';

      if (names.has('package.json')) {
        try {
          const raw = await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(currentAsUri, 'package.json'),
          );
          const pkg = JSON.parse(new TextDecoder().decode(raw));
          if (pkg.packageManager?.startsWith('yarn')) return 'yarn';
          if (pkg.packageManager?.startsWith('pnpm')) return 'pnpm';
          if (pkg.packageManager?.startsWith('bun')) return 'bun';
          if (pkg.packageManager?.startsWith('npm')) return 'npm';
        } catch (e) {
          this.log(`Error during detecting package manager: ${e.message}\n${e.stack}`);
        }
      }

      if (workspaceRoot && path.resolve(current) === path.resolve(workspaceRoot)) {
        break;
      }

      const parent = path.dirname(current);

      if (parent === current) break;
      current = parent;
    }

    return 'npm';
  }

  buildRunCommand(manager, script) {
    switch (manager) {
      case 'yarn':
        return `yarn ${script}`;
      case 'pnpm':
        return `pnpm run ${script}`;
      case 'bun':
        return `bun run ${script}`;
      case 'npm':
      default:
        return `npm run ${script}`;
    }
  }

  // ----------------- Utilities -----------------

  log(msg, data) {
    this.output.appendLine(`[${new Date().toISOString()}] ${msg}${typeof data === 'string' ? `: ${data}` : ''}`);
    if (data !== undefined && typeof data !== 'string') {
      this.output.appendLine(
        JSON.stringify(data, null, 2),
      );
    }
  }

  makeLabel(pkgDir, script) {
    const base = path.basename(pkgDir);

    if (path.resolve(pkgDir) === path.resolve(this.rootPath)) {
      return script;
    }

    return `${base}:${script}`;
  }

  formatRelativePath(pkgDir) {
    try {
      if (!this.rootPath) return pkgDir;

      const rel = path.relative(this.rootPath, pkgDir);

      if (!rel || rel.startsWith('..')) {
        return pkgDir;
      }

      return (rel === '' ? '.' : rel).replace(/\\/g, '/');
    } catch {
      return pkgDir;
    }
  }

  getHistory() {
    return this.ctx.workspaceState.get(this.HISTORY_KEY, []);
  }

  async setHistory(history) {
    await this.ctx.workspaceState.update(this.HISTORY_KEY, history);
  }

  async addToHistory(full) {
    const history = this.getHistory();
    if (!history.includes(full)) {
      history.push(full);
      await this.setHistory(history);
      this.log('💾 Added to history', full);
    }
    return history;
  }

  async clearHistory() {
    await this.setHistory([]);
    this.log('🗑 History cleared');
    this.refreshUI();
  }

  loadConfig() {
    const cfg = vscode.workspace.getConfiguration('runNpmButtons');
    this.spinIcon = cfg.get('spinIcon', true);
  }

  // ----------------- UI -----------------

  clearStatusBar() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  createStatusBarItem(label, full, isRunning) {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );

    const runningIcon = this.spinIcon ? '$(loading~spin)' : '$(primitive-square)';
    item.text = isRunning ? `${runningIcon} ${label}` : `$(play) ${label}`;
    item.command = {
      command: NpmRunButtonsCommands.TOGGLE_SCRIPT,
      arguments: [full],
    };
    item.tooltip = isRunning
      ? `Stop ${label}`
      : `Launch ${label}`;

    item.show();
    this.disposables.push(item);
  }

  refreshUI() {
    this.clearStatusBar();

    this.getHistory().forEach(full => {
      const [pkgDir, script] = full.split('::');
      const label = this.makeLabel(pkgDir, script);
      const isRunning = !!this.running[full];
      this.createStatusBarItem(label, full, isRunning);
    });

    this.historyProvider.refresh();
  }

  // ----------------- Task API -----------------

  async createNpmTask(pkgDir, script) {
    this.log('createNpmTask', pkgDir, script);
    const def = { type: 'npm', script, path: pkgDir };
    const manager = await this.detectPackageManager(pkgDir);
    this.log('manager', manager);
    const command = this.buildRunCommand(manager, script);
    this.log('command', command);

    return new vscode.Task(
      def,
      vscode.workspace.workspaceFolders[0],
      script,
      'npm',
      new vscode.ShellExecution(command, { cwd: pkgDir }),
    );
  }

  async toggleScript(full) {
    this.log('toggleScript', full);
    try {
      let [pkgDir, script] = full.split('::');

      if (!path.isAbsolute(pkgDir)) {
        pkgDir = path.join(this.rootPath, pkgDir);
      }

      if (this.running[full]) {
        this.running[full].terminate();
        this.log(`🛑 Terminated: ${full}`);
      } else {
        const task = await this.createNpmTask(pkgDir, script);
        this.running[full] = await vscode.tasks.executeTask(task);
        this.log(`▶ Started task: ${full}`);
        await this.addToHistory(`${pkgDir}::${script}`);
      }

      this.refreshUI();
    } catch (error) {
      this.log(`toggleScript error ${error.message}\n${error.stack}`);
    }
  }

  async onTaskStart(e) {
    const def = e.execution.task.definition;
    if (def.type === 'npm' && def.script) {
      const pkgDir = def.path ? path.resolve(this.rootPath, def.path) : this.rootPath;
      const full = `${pkgDir}::${def.script}`;
      this.running[full] = e.execution;
      this.log(`▶ Detected external start: ${full}`);

      await this.addToHistory(full);
      this.refreshUI();
    }
  }

  onTaskEnd(e) {
    const def = e.execution.task.definition;
    if (def.type === 'npm' && def.script) {
      const pkgDir = def.path ? path.resolve(this.rootPath, def.path) : this.rootPath;
      const full = `${pkgDir}::${def.script}`;

      if (this.running[full]) {
        delete this.running[full];
        this.log(`⏹ Task finished: ${full} (exitCode=${e.exitCode})`);
      }

      this.refreshUI();
    }
  }

  // ----------------- Lifecycle -----------------

  activate(context) {
    this.ctx = context;
    this.log('🚀 Extension activated');
    this.loadConfig();

    this.ctx.subscriptions.push(
      ...this.initHistoryView(),
      ...this.initSubscriptions(),
    );

    this.refreshUI();
  }

  initSubscriptions() {
    return [
      vscode.commands.registerCommand(
        NpmRunButtonsCommands.TOGGLE_SCRIPT,
        this.toggleScript.bind(this),
      ),
      vscode.commands.registerCommand(
        NpmRunButtonsCommands.RESET_HISTORY,
        this.clearHistory.bind(this),
      ),
      vscode.commands.registerCommand(
        NpmRunButtonsCommands.DELETE_HISTORY_ITEM,
        this.deleteHistoryItem.bind(this),
      ),
      vscode.tasks.onDidStartTaskProcess(this.onTaskStart.bind(this)),
      vscode.tasks.onDidEndTaskProcess(this.onTaskEnd.bind(this)),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(NpmRunButtonsConfig.SPIN_ICON)) {
          this.log('Configuration changed: runNpmButtons.spinIcon');
          this.loadConfig();
          this.refreshUI();
        }
      }),
    ];
  }

  deactivate() {
    this.clearStatusBar();
    Object.values(this.running).forEach(exec => exec.terminate());
    this.log('🛑 Extension deactivated');
  }
}

const instance = new NpmButtonsExtension();

module.exports = {
  activate(context) {
    instance.activate(context);
  },
  deactivate() {
    instance.deactivate();
  },
};
