const { sleep, log } = require('./utils');

class Cloner {
    constructor(client, sourceGuildId, targetGuildId, delay = 1000) {
        this.client = client;
        this.sourceGuildId = sourceGuildId;
        this.targetGuildId = targetGuildId;
        this.delay = delay;
    }

    async start() {
        const source = this.client.guilds.cache.get(this.sourceGuildId);
        const target = this.client.guilds.cache.get(this.targetGuildId);

        if (!source || !target) {
            log.error('Source or Target guild not found!');
            return;
        }

        log.info(`Scraping data from: ${source.name}`);
        log.info(`Target server: ${target.name} (Existing data will be wiped!)`);

        // 1. Clear Target Server
        await this.clearTarget(target);

        // 2. Clone Roles
        await this.cloneRoles(source, target);

        // 3. Clone Channels
        await this.cloneChannels(source, target);

        // 4. Clone Emojis (Optional/Riskier)
        await this.cloneEmojis(source, target);

        log.success('Cloning process completed!');
    }

    async clearTarget(target) {
        log.step('Clearing target server data...');

        // Delete channels
        const channels = target.channels.cache.filter(c => c.deletable);
        for (const [id, channel] of channels) {
            try {
                await channel.delete();
                log.sub(`Deleted channel: ${channel.name}`);
                await sleep(this.delay / 2); // Fast delete
            } catch (e) { }
        }

        // Delete roles (except managed/everyone)
        const roles = target.roles.cache.filter(r => r.editable && r.id !== target.id && !r.managed);
        for (const [id, role] of roles) {
            try {
                await role.delete();
                log.sub(`Deleted role: ${role.name}`);
                await sleep(this.delay / 2);
            } catch (e) { }
        }

        log.success('Server cleared.');
    }

    async cloneRoles(source, target) {
        log.step('Cloning Roles...');
        const roles = source.roles.cache
            .filter(r => r.id !== source.id && !r.managed)
            .sort((a, b) => a.position - b.position); // Low to High for creation

        const roleMap = new Map(); // Map Source ID -> Target ID

        for (const [id, role] of roles) {
            try {
                const newRole = await target.roles.create({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    permissions: role.permissions.bitfield,
                    mentionable: role.mentionable,
                    position: role.position,
                    reason: 'Server Cloner'
                });
                roleMap.set(role.id, newRole.id);
                log.sub(`Created role: ${newRole.name}`);
                await sleep(this.delay);
            } catch (e) {
                log.error(`Failed to create role ${role.name}: ${e.message}`);
            }
        }
        this.roleMap = roleMap;
        log.success(`Cloned ${roleMap.size} roles.`);
    }

    async cloneChannels(source, target) {
        log.step('Cloning Channels...');

        // Get all channels and sort by position
        const channels = source.channels.cache.sort((a, b) => a.position - b.position);

        // Separate categories and others
        const categories = channels.filter(c => c.type === 'GUILD_CATEGORY');
        const others = channels.filter(c => c.type !== 'GUILD_CATEGORY');

        const channelMap = new Map(); // Source ID -> Target ID

        // 1. Create Categories first
        for (const [id, channel] of categories) {
            try {
                const newChannel = await target.channels.create(channel.name, {
                    type: channel.type,
                    position: channel.position,
                    permissionOverwrites: this.mapPermissions(channel.permissionOverwrites.cache, target)
                });
                channelMap.set(channel.id, newChannel.id);
                log.sub(`Created Category: ${newChannel.name}`);
                await sleep(this.delay);
            } catch (e) { log.error(`Error creating category ${channel.name}: ${e.message}`); }
        }

        // 2. Create other channels
        for (const [id, channel] of others) {
            try {
                // If invalid type for target (e.g. store channels), skip or fallback
                if (!['GUILD_TEXT', 'GUILD_VOICE', 'GUILD_NEWS'].includes(channel.type)) continue;

                const parentId = channel.parentId ? channelMap.get(channel.parentId) : null;

                const newChannel = await target.channels.create(channel.name, {
                    type: channel.type,
                    parent: parentId,
                    topic: channel.topic,
                    nsfw: channel.nsfw,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    position: channel.position,
                    permissionOverwrites: this.mapPermissions(channel.permissionOverwrites.cache, target)
                });
                log.sub(`Created Channel: ${newChannel.name}`);
                await sleep(this.delay);
            } catch (e) { log.error(`Error creating channel ${channel.name}: ${e.message}`); }
        }
        log.success('Channels cloned.');
    }

    async cloneEmojis(source, target) {
        log.step('Cloning Emojis (Experimental)...');
        const emojis = source.emojis.cache;
        for (const [id, emoji] of emojis) {
            try {
                await target.emojis.create(emoji.url, emoji.name);
                log.sub(`Created Emoji: ${emoji.name}`);
                await sleep(this.delay * 1.5); // Higher delay for emojis
            } catch (e) {
                // Ignore emoji errors commonly due to limits
            }
        }
    }

    mapPermissions(overwrites, targetGuild) {
        // Maps source permission overwrites to target guild Roles/Members
        // Note: We only map roles for now as members might not exist
        return overwrites.filter(o => o.type === 'role' && this.roleMap.has(o.id)).map(o => {
            return {
                id: this.roleMap.get(o.id),
                allow: o.allow,
                deny: o.deny
            };
        });
    }
}

module.exports = Cloner;
