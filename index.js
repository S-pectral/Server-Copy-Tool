const { Client } = require('discord.js-selfbot-v13');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const { showBanner, log, loadConfig, saveConfig } = require('./lib/utils');
const Cloner = require('./lib/cloner');

const client = new Client({ checkUpdate: false });

(async () => {
    showBanner();

    // 1. Authentication
    let config = loadConfig();
    let token = config.token;

    if (!token) {
        const result = await inquirer.prompt([{
            type: 'password',
            name: 'token',
            message: 'Enter your User Token:',
            mask: '*'
        }]);
        token = result.token;

        const { save } = await inquirer.prompt([{
            type: 'confirm',
            name: 'save',
            message: 'Save token for future use?',
            default: true
        }]);

        if (save) saveConfig({ token });
    } else {
        log.info('Token loaded from config!');
    }

    try {
        log.info('Logging in...');
        await client.login(token);
        log.success(`Logged in as: ${client.user.tag}`);
    } catch (e) {
        log.error('Invalid Token or Login Failed!');
        process.exit(1);
    }

    // 2. Main Menu
    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
            { name: '🚀 Clone Server (Direct Copy)', value: 'clone' },
            { name: '💾 Backup Server', value: 'backup' },
            { name: '♻️  Restore Server', value: 'restore' },
            { name: '❌ Exit', value: 'exit' }
        ]
    }]);

    if (action === 'exit') process.exit(0);

    // Helpers
    const getGuilds = () => client.guilds.cache.map(g => ({ name: g.name, value: g.id }));
    const commonOptions = async () => {
        const { type } = await inquirer.prompt([{
            type: 'list',
            name: 'type',
            message: 'Clone Type:',
            choices: [
                { name: 'Full Clone (Recommended)', value: 'full' },
                { name: 'Custom / Selective', value: 'custom' }
            ]
        }]);

        if (type === 'full') return { settings: true, roles: true, channels: true, emojis: true };

        return await inquirer.prompt([{
            type: 'checkbox',
            name: 'selection',
            message: 'Select what to clone:',
            choices: [
                { name: 'Server Settings (Icon, Banner, etc.)', value: 'settings', checked: true },
                { name: 'Roles', value: 'roles', checked: true },
                { name: 'Channels', value: 'channels', checked: true },
                { name: 'Emojis', value: 'emojis', checked: false }
            ]
        }]).then(a => {
            return {
                settings: a.selection.includes('settings'),
                roles: a.selection.includes('roles'),
                channels: a.selection.includes('channels'),
                emojis: a.selection.includes('emojis')
            };
        });
    };

    /** Logic **/

    if (action === 'clone') {
        if (getGuilds().length === 0) { log.error('No servers found.'); process.exit(1); }

        const { sourceId } = await inquirer.prompt([{
            type: 'list',
            name: 'sourceId',
            message: 'Select Source Server:',
            choices: getGuilds(),
            loop: false
        }]);

        const { targetOption } = await inquirer.prompt([{
            type: 'list',
            name: 'targetOption',
            message: 'Target Server:',
            choices: [
                { name: '✨ Create New Server', value: 'create' },
                { name: '⚠️  Overwrite Existing Server', value: 'existing' }
            ]
        }]);

        let targetId;
        if (targetOption === 'create') {
            const { name } = await inquirer.prompt([{ type: 'input', name: 'name', message: 'New Server Name:', default: 'Spectral Clone' }]);
            const guild = await client.guilds.create(name, { icon: null });
            targetId = guild.id;
        } else {
            const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Target Server ID:' }]);
            targetId = id;
        }

        const options = await commonOptions();
        const cloner = new Cloner(client, sourceId, targetId, 1000, options);
        await cloner.start();
    }

    else if (action === 'backup') {
        const { sourceId } = await inquirer.prompt([{
            type: 'list',
            name: 'sourceId',
            message: 'Select Server to Backup:',
            choices: getGuilds(),
            loop: false
        }]);

        const options = await commonOptions();
        // Backup usually implies wanting everything, but customization is fine.
        const cloner = new Cloner(client, sourceId, null, 1000, { ...options, backup: true });
        await cloner.start();
    }

    else if (action === 'restore') {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            log.error("No 'backups' folder found.");
            process.exit(1);
        }

        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            log.error("No backup files found.");
            process.exit(1);
        }

        const { file } = await inquirer.prompt([{
            type: 'list',
            name: 'file',
            message: 'Select Backup File:',
            choices: files
        }]);

        const { targetOption } = await inquirer.prompt([{
            type: 'list',
            name: 'targetOption',
            message: 'Restore to:',
            choices: [
                { name: '✨ Create New Server', value: 'create' },
                { name: '⚠️  Overwrite Existing Server', value: 'existing' }
            ]
        }]);

        let targetId;
        if (targetOption === 'create') {
            const { name } = await inquirer.prompt([{ type: 'input', name: 'name', message: 'New Server Name:', default: file.replace('.json', '') }]);
            const guild = await client.guilds.create(name, { icon: null });
            targetId = guild.id;
        } else {
            const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Target Server ID:' }]);
            targetId = id;
        }

        const backupPath = path.join(backupDir, file);
        // sourceId is hijacked for file path in restore mode
        const cloner = new Cloner(client, backupPath, targetId, 1000, { restore: true, settings: true, roles: true, channels: true, emojis: true });
        // NOTE: Restore currently assumes "Full Restore" of whatever is in the JSON.
        // We could technically filter theJSON, but cloner.restore() reads the file. 
        // Let's rely on the file content for now.
        await cloner.start();
    }

})();

process.on('unhandledRejection', (reason, p) => { });
process.on("uncaughtException", (err, origin) => { });
process.on('uncaughtExceptionMonitor', (err, origin) => { });
