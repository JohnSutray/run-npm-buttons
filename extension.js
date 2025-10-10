const vscode = require("vscode");
const path = require("path");

class NpmButtonsExtension {
  constructor() {
    this.HISTORY_KEY = "npmButtonsHistory";
    this.disposables = [];
    this.running = {};
    this.output = vscode.window.createOutputChannel("NPM Buttons Logs");
    this.rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    this.ctx = null;
    this.spinIcon = true;
  }

  // ----------------- Utilities -----------------

  log(msg, data) {
    this.output.appendLine(`[${new Date().toISOString()}] ${msg}`);
    if (data !== undefined) {
      this.output.appendLine(
        typeof data === "string" ? data : JSON.stringify(data, null, 2)
      );
    }
  }

  makeLabel(pkgDir, script) {
    return pkgDir === this.rootPath
      ? script
      : `${path.basename(pkgDir)}:${script}`;
  }

  getHistory() {
    return this.ctx.workspaceState.get(this.HISTORY_KEY, []);
  }

  async addToHistory(full) {
    const history = this.getHistory();
    if (!history.includes(full)) {
      history.push(full);
      await this.ctx.workspaceState.update(this.HISTORY_KEY, history);
      this.log("💾 Added to history", full);
    }
    return history;
  }

  async clearHistory() {
    await this.ctx.workspaceState.update(this.HISTORY_KEY, []);
    this.log("🗑 History cleared");
    this.refreshUI([]);
  }

  loadConfig() {
    const cfg = vscode.workspace.getConfiguration("runNpmButtons");
    this.spinIcon = cfg.get("spinIcon", true);
  }

  // ----------------- UI -----------------

  clearStatusBar() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  createStatusBarItem(label, full, isRunning) {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    
    const runningIcon = this.spinIcon ? "$(loading~spin)" : "$(primitive-square)"
    item.text = isRunning ? `${runningIcon} ${label}` : `$(play) ${label}`;
    item.command = { command: "npm-buttons.toggleScript", arguments: [full] };
    item.tooltip = isRunning ? `Stop ${label}` : `Launch ${label}`;
    item.show();
    this.disposables.push(item);
  }

  refreshUI(history) {
    this.clearStatusBar();
    history.forEach(full => {
      const [pkgDir, script] = full.split("::");
      const label = this.makeLabel(pkgDir, script);
      const isRunning = !!this.running[full];
      this.createStatusBarItem(label, full, isRunning);
    });
  }

  // ----------------- Task API -----------------

  createNpmTask(pkgDir, script) {
    const def = { type: "npm", script, path: pkgDir };
    return new vscode.Task(
      def,
      vscode.workspace.workspaceFolders[0],
      script,
      "npm",
      new vscode.ShellExecution("npm run " + script, { cwd: pkgDir })
    );
  }

  async toggleScript(full) {
    const [pkgDir, script] = full.split("::");

    if (this.running[full]) {
      this.running[full].terminate();
      this.log(`🛑 Terminated: ${full}`);
    } else {
      const task = this.createNpmTask(pkgDir, script);
      const exec = await vscode.tasks.executeTask(task);
      this.running[full] = exec;
      this.log(`▶ Started task: ${full}`);
      await this.addToHistory(full);
    }
    this.refreshUI(this.getHistory());
  }

  async onTaskStart(e) {
    const def = e.execution.task.definition;
    if (def.type === "npm" && def.script) {
      const pkgDir = def.path || this.rootPath;
      const full = `${pkgDir}::${def.script}`;
      this.running[full] = e.execution;
      this.log(`▶ Detected external start: ${full}`);

      await this.addToHistory(full);
      this.refreshUI(this.getHistory());
    }
  }

  onTaskEnd(e) {
    const def = e.execution.task.definition;
    if (def.type === "npm" && def.script) {
      const pkgDir = def.path || this.rootPath;
      const full = `${pkgDir}::${def.script}`;

      if (this.running[full]) {
        delete this.running[full];
        this.log(`⏹ Task finished: ${full} (exitCode=${e.exitCode})`);
      }
      this.refreshUI(this.getHistory());
    }
  }

  // ----------------- Lifecycle -----------------

  activate(context) {
    this.ctx = context;
    this.log("🚀 Extension activated");
    this.loadConfig()

    const history = this.getHistory();
    this.refreshUI(history);

    // 'toggle' command
    const cmd = vscode.commands.registerCommand(
      "npm-buttons.toggleScript",
      this.toggleScript.bind(this)
    );
    context.subscriptions.push(cmd);

    // 'reset history' command
    const resetCmd = vscode.commands.registerCommand(
      "npm-buttons.resetHistory",
      this.clearHistory.bind(this)
    );
    context.subscriptions.push(resetCmd);

    // task listeners
    vscode.tasks.onDidStartTaskProcess(this.onTaskStart.bind(this));
    vscode.tasks.onDidEndTaskProcess(this.onTaskEnd.bind(this));

    // configuration listener
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("runNpmButtons.spinIcon")) {
            this.loadConfig();
            this.refreshUI(this.getHistory());
        }
    })
  }

  deactivate() {
    this.clearStatusBar();
    Object.values(this.running).forEach(exec => exec.terminate());
    this.log("🛑 Extension deactivated");
  }
}

const instance = new NpmButtonsExtension();
function activate(context) { instance.activate(context); }
function deactivate() { instance.deactivate(); }
module.exports = { activate, deactivate };