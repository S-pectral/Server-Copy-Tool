const chalk = require('chalk');
const gradient = require('gradient-string');
const figlet = require('figlet');

const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

const CONFIG_PATH = path.join(__dirname, '../config.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = {
    info: (msg) => console.log(`${chalk.blue('[INFO]')} ${msg}`),
    success: (msg) => console.log(`${chalk.green('[SUCCESS]')} ${msg}`),
    warn: (msg) => console.log(`${chalk.yellow('[WARN]')} ${msg}`),
    error: (msg) => console.log(`${chalk.red('[ERROR]')} ${msg}`),
    step: (msg) => console.log(`${chalk.cyan('➜')} ${msg}`),
    sub: (msg) => console.log(`${chalk.gray('  └')} ${msg}`)
};

const showBanner = () => {
    console.clear();
    console.log(gradient.passion(figlet.textSync('Server Cloner', { horizontalLayout: 'full' })));
    console.log(chalk.gray('          --- Discord Server Cloner & Automation System ---\n'));
    console.log(chalk.hex('#FF8800')('            [!] Use responsibly. Strictly for educational purposes.'));
    console.log(chalk.dim('                                  Made by Spectral.\n'));
};

const loadConfig = () => {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (e) { return {}; }
    }
    return {};
};

const saveConfig = (data) => {
    const current = loadConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...data }, null, 4));
};

class ProgressBar {
    constructor() {
        this.bar = new cliProgress.SingleBar({
            format: ' {bar} | {percentage}% | {value}/{total} | {msg}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });
    }

    start(total, startValue = 0, msg = 'Starting...') {
        this.bar.start(total, startValue, { msg });
    }

    update(value, msg) {
        this.bar.update(value, { msg });
    }

    increment(amount = 1, msg) {
        this.bar.increment(amount, { msg });
    }

    stop() {
        this.bar.stop();
    }
}

module.exports = { sleep, log, showBanner, loadConfig, saveConfig, ProgressBar };
