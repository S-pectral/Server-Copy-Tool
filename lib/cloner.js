const { sleep, log, ProgressBar } = require('./utils');
const fs = require('fs');
const path = require('path');

class Cloner {
    constructor(client, sourceId, targetId, delay = 1000, options = {}) {
        this.client = client;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.delay = delay;
        // Default options
        this.options = {
            settings: true,
            roles: true,
            channels: true,
            emojis: false,
            backup: false,
            restore: false,
            backupPath: './backups',
            ...options
        };
        this.progress = new ProgressBar();
        this.roleMap = new Map();
        this.channelMap = new Map();
    }

    async start() {
        if (this.options.restore) {
            await this.restore();
            return;
        }

        const source = this.client.guilds.cache.get(this.sourceId);
        if (!source) { log.error('Source guild not found!'); return; }

        if (this.options.backup) {
            await this.backup(source);
            return;
        }

        const target = this.client.guilds.cache.get(this.targetId);
        if (!target) { log.error('Target guild not found!'); return; }

        log.info(`Scraping data from: ${source.name}`);
        const data = await this.fetchGuildData(source);

        log.info(`Target server: ${target.name}`);
        await this.loadDataToGuild(target, data);

        log.success('Operation completed successfully!');
    }

    async fetchGuildData(guild) {
        const data = {
            name: guild.name,
            icon: guild.iconURL({ dynamic: true, format: 'png', size: 4096 }),
            banner: guild.bannerURL({ size: 4096 }),
            verificationLevel: guild.verificationLevel,
            explicitContentFilter: guild.explicitContentFilter,
            defaultMessageNotifications: guild.defaultMessageNotifications,
            afkTimeout: guild.afkTimeout,
            roles: [],
            channels: [],
            emojis: []
        };

        if (this.options.roles) {
            log.step('Fetching Roles...');
            data.roles = guild.roles.cache
                .filter(r => r.id !== guild.id && !r.managed)
                .sort((a, b) => a.position - b.position)
                .map(r => ({
                    name: r.name,
                    color: r.color,
                    hoist: r.hoist,
                    permissions: r.permissions.bitfield.toString(),
                    mentionable: r.mentionable,
                    position: r.position,
                    isEveryone: false
                }));
        }

        if (this.options.channels) {
            log.step('Fetching Channels...');
            const channels = guild.channels.cache.sort((a, b) => a.position - b.position);
            data.channels = channels.map(c => ({
                name: c.name,
                type: c.type,
                parent: c.parentId ? c.parent.name : null, // Store parent name for mapping
                topic: c.topic,
                nsfw: c.nsfw,
                bitrate: c.bitrate,
                userLimit: c.userLimit,
                position: c.position,
                rateLimitPerUser: c.rateLimitPerUser,
                permissionOverwrites: c.permissionOverwrites.cache.map(p => ({
                    id: p.id, // Will need mapping
                    type: p.type,
                    allow: p.allow.bitfield.toString(),
                    deny: p.deny.bitfield.toString(),
                    roleName: p.type === 'role' ? guild.roles.cache.get(p.id)?.name : null
                }))
            }));
        }

        if (this.options.emojis) {
            log.step('Fetching Emojis...');
            data.emojis = guild.emojis.cache.map(e => ({ name: e.name, url: e.url }));
        }

        return data;
    }

    async backup(source) {
        log.info(`Creating backup of ${source.name}...`);
        const data = await this.fetchGuildData(source);

        if (!fs.existsSync(this.options.backupPath)) fs.mkdirSync(this.options.backupPath);

        const fileName = `${source.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        const filePath = path.join(this.options.backupPath, fileName);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
        log.success(`Backup saved to: ${filePath}`);
    }

    async restore() {
        const filePath = this.sourceId; // hidden hack: sourceId is filepath in restore mode
        if (!fs.existsSync(filePath)) { log.error('Backup file not found!'); return; }

        const target = this.client.guilds.cache.get(this.targetId);
        if (!target) { log.error('Target guild not found!'); return; }

        log.info(`Restoring from backup: ${filePath}`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        await this.loadDataToGuild(target, data);
        log.success('Restore completed!');
    }

    async loadDataToGuild(target, data) {
        // 1. Settings
        if (this.options.settings) {
            log.step('updating server settings...');
            try {
                if (data.icon) await target.setIcon(data.icon).catch(() => { });
                if (data.banner) await target.setBanner(data.banner).catch(() => { });
                await target.edit({
                    verificationLevel: data.verificationLevel,
                    explicitContentFilter: data.explicitContentFilter,
                    defaultMessageNotifications: data.defaultMessageNotifications,
                    afkTimeout: data.afkTimeout
                }).catch(e => log.warn(`Settings update partial fail: ${e.message}`));
                log.sub('Settings updated.');
            } catch (e) { log.error(`Settings update failed: ${e.message}`); }
        }

        // 2. Cleanup
        if (this.options.roles || this.options.channels) {
            await this.clearTarget(target);
        }

        // 3. Roles
        if (this.options.roles && data.roles.length > 0) {
            log.step('Cloning Roles...');
            this.progress.start(data.roles.length, 0, 'Creating Roles');

            const rolesToPosition = [];

            for (const roleData of data.roles) {
                try {
                    const newRole = await target.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: BigInt(roleData.permissions),
                        mentionable: roleData.mentionable,
                        // position: roleData.position,
                        reason: 'Server Cloner - Restore'
                    });
                    this.roleMap.set(roleData.name, newRole.id); // Map by Name!
                    rolesToPosition.push({ role: newRole.id, position: roleData.position });

                    this.progress.increment();
                    await sleep(this.delay);
                } catch (e) { }
            }
            this.progress.stop();

            // Fix Hierarchy
            log.step('Fixing Role Hierarchy...');
            try {
                await target.roles.setPositions(rolesToPosition);
                log.success('Role hierarchy fixed.');
            } catch (e) {
                log.warn(`Failed to set role positions: ${e.message}`);
            }

            log.success(`Roles created.`);
        }

        // 4. Channels
        if (this.options.channels && data.channels.length > 0) {
            log.step('Cloning Channels...');

            const categories = data.channels.filter(c => c.type === 'GUILD_CATEGORY');
            const others = data.channels.filter(c => c.type !== 'GUILD_CATEGORY');

            this.progress.start(categories.length + others.length, 0, 'Creating Channels');

            // Categories
            for (const cat of categories) {
                try {
                    const newCat = await target.channels.create(cat.name, {
                        type: cat.type,
                        permissionOverwrites: this.mapPermissions(cat.permissionOverwrites, target)
                    });
                    this.channelMap.set(cat.name, newCat.id); // Map by Name
                    this.progress.increment();
                    await sleep(this.delay);
                } catch (e) { }
            }

            // Others
            for (const chan of others) {
                try {
                    // Find parent by name
                    const parentId = chan.parent ? this.channelMap.get(chan.parent) : null;

                    await target.channels.create(chan.name, {
                        type: chan.type === 'GUILD_NEWS' ? 'GUILD_TEXT' : chan.type, // Fallback
                        parent: parentId,
                        topic: chan.topic,
                        nsfw: chan.nsfw,
                        bitrate: chan.bitrate,
                        userLimit: chan.userLimit,
                        rateLimitPerUser: chan.rateLimitPerUser,
                        permissionOverwrites: this.mapPermissions(chan.permissionOverwrites, target)
                    });
                    this.progress.increment();
                    await sleep(this.delay);
                } catch (e) { }
            }
            this.progress.stop();
            log.success('Channels created.');
        }

        // 5. Emojis
        if (this.options.emojis && data.emojis.length > 0) {
            log.step('Cloning Emojis...');
            this.progress.start(data.emojis.length, 0, 'Uploading Emojis');
            for (const emoji of data.emojis) {
                try {
                    await target.emojis.create(emoji.url, emoji.name);
                    this.progress.increment();
                    await sleep(this.delay * 1.5);
                } catch (e) { }
            }
            this.progress.stop();
        }
    }

    mapPermissions(overwrites, target) {
        if (!overwrites) return [];
        return overwrites.filter(o => o.type === 'role' && this.roleMap.has(o.roleName)).map(o => ({
            id: this.roleMap.get(o.roleName),
            allow: BigInt(o.allow),
            deny: BigInt(o.deny)
        }));
    }

    async clearTarget(target) {
        log.step('Cleaning target server...');
        const channels = target.channels.cache.filter(c => c.deletable);
        const roles = target.roles.cache.filter(r => r.editable && r.id !== target.id && !r.managed);

        this.progress.start(channels.size + roles.size, 0, 'Deleting items');

        for (const [id, c] of channels) {
            try { await c.delete(); this.progress.increment(); await sleep(200); } catch (e) { }
        }
        for (const [id, r] of roles) {
            try { await r.delete(); this.progress.increment(); await sleep(200); } catch (e) { }
        }
        this.progress.stop();
    }
}

module.exports = Cloner;
