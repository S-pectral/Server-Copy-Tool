const chalk = require('chalk');
const gradient = require('gradient-string');
const figlet = require('figlet');

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

module.exports = { sleep, log, showBanner };
