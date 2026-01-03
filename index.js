const { Client } = require('discord.js-selfbot-v13');
const inquirer = require('inquirer');
const { showBanner, log } = require('./lib/utils');
const Cloner = require('./lib/cloner');

const client = new Client({ checkUpdate: false });

(async () => {
    showBanner();

    // 1. Login
    const { token } = await inquirer.prompt([{
        type: 'password',
        name: 'token',
        message: 'Enter your User Token:',
        mask: '*'
    }]);

    try {
        log.info('Logging in...');
        await client.login(token);
        log.success(`Logged in as: ${client.user.tag}`);
    } catch (e) {
        log.error('Invalid Token or Login Failed!');
        process.exit(1);
    }

    try {
        // 2. Select Source Server
        const guilds = client.guilds.cache.map(g => ({ name: g.name, value: g.id }));

        if (guilds.length === 0) {
            log.error("No servers found!");
            process.exit(1);
        }

        const { sourceId } = await inquirer.prompt([{
            type: 'list',
            name: 'sourceId',
            message: 'Select Source Server to Clone:',
            choices: guilds,
            loop: false
        }]);

        // 3. Target Server
        const { targetOption } = await inquirer.prompt([{
            type: 'list',
            name: 'targetOption',
            message: 'Target Server:',
            choices: [
                { name: '✨ Create New Server (Recommended)', value: 'create' },
                { name: '⚠️  Overwrite Existing Server', value: 'existing' }
            ]
        }]);

        let targetId;
        if (targetOption === 'create') {
            const { serverName } = await inquirer.prompt([{
                type: 'input',
                name: 'serverName',
                message: 'New Server Name:',
                default: `Cloned Server ${Math.floor(Math.random() * 1000)}`
            }]);
            log.info('Creating new server...');
            try {
                const newGuild = await client.guilds.create(serverName, { icon: null });
                if (!newGuild) throw new Error("Guild creation returned null/undefined.");
                targetId = newGuild.id;
                log.success(`Created server: ${newGuild.name}`);
            } catch (createError) {
                log.error(`Failed to create server: ${createError.message}`);
                process.exit(1);
            }
        } else {
            const { inputId } = await inquirer.prompt([{
                type: 'input',
                name: 'inputId',
                message: 'Enter Target ID (YOU MUST BE ADMIN):',
                validate: val => val.length > 15 ? true : "Invalid ID"
            }]);
            targetId = inputId;
        }

        // 4. Safe Mode
        const { delay } = await inquirer.prompt([{
            type: 'number',
            name: 'delay',
            message: 'Delay between actions in ms (Safe: 1000+):',
            default: 1500
        }]);

        // 5. Start
        log.info('Starting clone process...');
        const cloner = new Cloner(client, sourceId, targetId, delay);
        await cloner.start();

    } catch (e) {
        log.error(`An unexpected error occurred: ${e.message}`);
        console.error(e);
    }
})();

process.on('unhandledRejection', (reason, p) => {
    console.log(' [Anti-Crash] :: Unhandled Rejection/Catch');
    console.log(reason, p);
});
process.on("uncaughtException", (err, origin) => {
    console.log(" [Anti-Crash] :: Uncaught Exception/Catch");
    console.log(err, origin);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.log(" [Anti-Crash] :: Uncaught Exception/Catch (MONITOR)");
    console.log(err, origin);
});
