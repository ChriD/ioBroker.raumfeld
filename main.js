'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
//const { Raumkernel } = require('D:\\Projects\\Raumfeld\\node-raumkernel');
const { Raumkernel } = require('node-raumkernel');

// Load your modules here, e.g.:
// const fs = require("fs");

class Raumfeld extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'raumfeld',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.raumkernel = new Raumkernel();
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

        this.raumkernel.settings.raumfeldHost = '0.0.0.0';
        //this.raumkernel.createLogger(5);
        this.raumkernel.init();

        this.raumkernel.on('systemReady', (_ready) => {
            this.log.info(`System ready: ${_ready}`);
        });

        this.raumkernel.on('zoneCreated', (_zoneUDN) => {
            this.log.info(`Zone created: ${_zoneUDN}`);
        });

        this.raumkernel.on('zoneRemoved', (_zoneUDN) => {
            this.log.info(`Zone deleted: ${_zoneUDN}`);
        });

        this.raumkernel.on('roomAddedToZone', (_zoneUDN, _roomUDN) => {
            this.log.info(`Room ${_roomUDN} added to zone ${_zoneUDN}`);
        });

        this.raumkernel.on('roomRemovedFromZone', (_zoneUDN, _roomUDN) => {
            this.log.info(`Room ${_roomUDN} removed from zone ${_zoneUDN}`);
        });

        this.raumkernel.on('rendererMediaItemDataChanged', (_mediaRenderer, _mediaItemData) => {
            this.log.info(`Renderer: ${_mediaRenderer.id},  item: ${JSON.stringify(_mediaItemData)}`);
        });

        this.raumkernel.on('combinedZoneStateChanged', (_combinedStateData) => {
            this.log.info(`Combinded state: ${JSON.stringify(_combinedStateData)}`);
        });

        this.raumkernel.on('zoneConfigurationChanged', (_zoneConfiguration) => {
            this.log.info(`Zone configuration: ${JSON.stringify(_zoneConfiguration)}`);
        });


    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Raumfeld(options);
} else {
    // otherwise start the instance directly
    new Raumfeld();
}