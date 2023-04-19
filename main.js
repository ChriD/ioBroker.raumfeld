'use strict';

const utils = require('@iobroker/adapter-core');
const { Raumkernel } = require('node-raumkernel');

const DATATYPE = {
    BOOLEAN: 'boolean',
    NUMBER: 'number',
    STRING: 'string',
    JSON: 'json',
};

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
        this.raumkernel.settings.localAddress = this.config.localInterface ? this.config.localInterface : '';
        this.log.debug(`Using interface: ${this.raumkernel.settings.localAddress}`);

        this.raumkernel.createLogger(5);

        this.raumkernel.logger.on('log', (_logData) => {
            // TODO: logs types
            this.log.info(`${_logData.logType}: ${_logData.log}`);
        })

        this.raumkernel.on('systemReady', (_ready) => {
            this.log.info(`System ready: ${_ready}`);
        });

        this.raumkernel.on('zoneCreated', (_zoneUDN) => {
           // this.log.info(`Zone created: ${_zoneUDN}`);
        });

        this.raumkernel.on('zoneRemoved', (_zoneUDN) => {
            //this.log.info(`Zone deleted: ${_zoneUDN}`);
        });

        this.raumkernel.on('roomAddedToZone', (_zoneUDN, _roomUDN) => {
            //this.log.info(`Room ${_roomUDN} added to zone ${_zoneUDN}`);
        });

        this.raumkernel.on('roomRemovedFromZone', (_zoneUDN, _roomUDN) => {
            //this.log.info(`Room ${_roomUDN} removed from zone ${_zoneUDN}`);
        });

        this.raumkernel.on('rendererMediaItemDataChanged', (_mediaRenderer, _mediaItemData) => {
           // this.log.info(`Renderer: ${_mediaRenderer.id},  item: ${JSON.stringify(_mediaItemData)}`);
        });

        this.raumkernel.on('combinedZoneStateChanged', (_combinedStateData) => {
            //this.log.info(`Combinded state: ${JSON.stringify(_combinedStateData)}`);
            this.updateRoomInformation(_combinedStateData);
        });

        this.raumkernel.on('zoneConfigurationChanged', (_zoneConfiguration) => {
           // this.log.info(`Zone configuration: ${JSON.stringify(_zoneConfiguration)}`);
        });


        this.raumkernel.init();
    }

    /**
     * conversion method for any value to the type given in the parameters
     * currently only 'string' and 'number' is a valid type
     * @param  {any} _value the value ehich should be converted
     * @param  {String} _type the type the value should be converted to
     * @return {any} _value converted to the given _type
     */
    convertValue(_value, _type)
    {
        let converted;

        if(_value === null)
            return _value;

        switch(_type)
        {
            case DATATYPE.STRING:
                converted = _value.toString();
                break;
            case DATATYPE.NUMBER:
                converted = Number(_value);
                break;
            default:
                converted = _value;
        }
        return converted;
    }


    /**
     * a special helper method to easily add objects
     * @param  {String} _id the object id
     * @param  {String} _name the object name
     * @param  {String} _type the object type (e.g. device, channel, state, ...)
     * @param  {Object} _common the common description of the object which will be created
     * @return {Promise}
     */
    async createObjectNotExists(_id, _name, _type, _common = null, _forceOverwrite = false)
    {
        const commonObject = _common ? _common : {};
        commonObject.name = _name;

        const objectContainer = {
            type: _type,
            common: commonObject,
            native: {},
        };

        if(_forceOverwrite) {
            await this.setObjectAsync(_id, objectContainer);
        }
        else {
            await this.setObjectNotExistsAsync(_id, objectContainer);
        }
    }

    /**
     * a special helper method to easily add/remove and change values of states
     * @param  {String} _id the state id
     * @param  {String} _name the state name
     * @param  {String} _stateType the state type (e.g. number, string, ...) If this value is set, the object will be a state
     * @param  {any} _stateValue the value of the state
     * @param  {Boolean} _deleteStateOnNullValue indicates if passing a null value should delete the state and its object
     * @param  {Boolean} _allowSetValue indicates if the given value will be set (mainly used for syncing the state object with admin)
     * @return {Promise}
     */
    async createOrUpdateState(_id, _name, _stateType, _stateRole, _stateValue, _deleteStateOnNullValue = true, _allowSetValue = true)
    {
        const commonObject = {
            type: _stateType,
            role: _stateRole ? _stateRole : 'state',
            read: true,
            write: true
        };
        await this.createObjectNotExists(_id, _name, 'state', commonObject);

        if(_allowSetValue)
        {
            if(_deleteStateOnNullValue && _stateValue === null)
            {
                this.log.debug(`Delete state: ${_id}`);
                await this.delStateAsync(_id);
                await this.delObjectAsync(_id);
            }
            else
            {
                this.log.debug(`Set state value: ${_id} : ${_stateValue}`);
                await this.setStateAsync(_id, { val: this.convertValue(_stateValue, _stateType), ack: true });
            }
        }
    }


    /**
     * creates/deletes/updates a channel for each room and adds infodata to it
     * @param {Object} _combinedStateData
     */
    async updateRoomInformation(_combinedStateData)
    {
        // go through all existing rooms and create the objects for them if they are not exists
        if(_combinedStateData.availableRooms && _combinedStateData.availableRooms.length)
        {
            for(let roomIdx=0; roomIdx<_combinedStateData.availableRooms.length; roomIdx)
            {
                const roomObject = _combinedStateData.availableRooms[roomIdx];
                this.log.debug(`RoomObject : ${roomObject}`);
                await this.createObjectNotExists('rooms.' + roomObject.name, roomObject.name, 'device', null);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.name', 'name', DATATYPE.STRING, '', roomObject.name);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.powerState', 'powerState', DATATYPE.STRING, '', roomObject.powerState);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.udn', 'udn', DATATYPE.STRING, '', roomObject.udn);
            }
        }

        if(_combinedStateData.unassignedRooms && _combinedStateData.unassignedRooms.length)
        {
            for(let roomIdx=0; roomIdx<_combinedStateData.unassignedRooms.length; roomIdx)
            {
                const roomObject = _combinedStateData.unassignedRooms[roomIdx];
                await this.createObjectNotExists('rooms.' + roomObject.name, roomObject.name, 'device', null);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.name', 'name', DATATYPE.STRING, '', roomObject.name);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.powerState', 'powerState', DATATYPE.STRING, '', roomObject.powerState);
                await this.createOrUpdateState('rooms.' + + roomObject.name + '.udn', 'udn', DATATYPE.STRING, '', roomObject.udn);
            }
        }

        // delete the ones not mentioned in the list
        // TODO:
        /*
            const deviceObjects = await this.getDevicesAsync();
            for (const deviceObject of deviceObjects)
            {
                const deviceId = (deviceObject._id).split('.').pop();
                if(_deviceIds.includes(deviceId) == false)
                {
                    await this.delStateAsync(deviceObject._id);
                    await this.delObjectAsync(deviceObject._id, {recursive: true});
                }
            }
        */
    }

    /*
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId, _deviceDescription.name, 'device', null, true);
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId + '.settings', 'settings', 'channel');
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId + '.settings.channel', 'channel', 'channel');
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId + '.values', 'values', 'channel');
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId + '.values.channel', 'channel', 'channel');
    await this.createObjectNotExists('lights.' + _deviceDescription.deviceId + '.control', 'values', 'channel');
    */

/*
    {

        "zones":[
           {
              "rooms":[
                 {
                    "renderers":[
                       {
                          "udn":"uuid:5b2bdeef-0959-47b3-bee4-940b5e0ee4ba",
                          "name":"Connector Schlafzimmer"
                       }
                    ],
                    "udn":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef",
                    "name":"Schlafzimmer",
                    "powerState":"ACTIVE"
                 }
              ],
              "udn":"uuid:3ef64539-f2d0-4075-8942-5e2f30cf81a7",
              "name":"Schlafzimmer",
              "isZone":true,
              "mediaItem":{
                 "class":"object.item.audioItem.audioBroadcast.radio",
                 "section":"RadioTime",
                 "name":"Station",
                 "durability":"120",
                 "childCount":null,
                 "parentID":"0/Favorites/MostPlayed",
                 "id":"0/Favorites/MostPlayed/45131",
                 "restricted":"1",
                 "refID":"0/RadioTime/Search/s-s25217",
                 "title":"Rock Antenne",
                 "description":null,
                 "artist":null,
                 "albumArtURI":"https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000",
                 "genre":null,
                 "album":null,
                 "date":null,
                 "creator":null,
                 "originalTrackNumber":null,
                 "bitrate":"128",
                 "protocolInfo":"http-get:*:audio/x-mpegurl:*",
                 "signalStrength":null,
                 "ebrowse":"http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&formats=mp3%2Cogg%2Caac&serial=bc%3A6a%3A29%3A85%3A0e%3A3a&id=s25217&c=ebrowse"
              },
              "rendererState":{
                 "Mute":0,
                 "InstanceID":0,
                 "CurrentTrackMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:pv=\"http://www.pv.com/pvns/\" lang=\"en\"><item parentID=\"0/Favorites/MostPlayed\" id=\"0/Favorites/MostPlayed/45131\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\"><raumfeld:name>Station</raumfeld:name><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:section>RadioTime</raumfeld:section><raumfeld:durability>120</raumfeld:durability><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><dc:title>Rock Antenne</dc:title><upnp:albumArtURI dlna:profileID=\"JPEG_TN\">https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><res bitrate=\"128\" protocolInfo=\"http-get:*:audio/x-mpegurl:*\">http://opml.radiotime.com/Tune.ashx?id=e123075877&amp;sid=s25217&amp;formats=mp3,ogg,aac&amp;partnerId=7aJ9pvV5&amp;serial=bc:6a:29:85:0e:3a</res></item></DIDL-Lite>\n",
                 "CurrentRecordQualityMode":"NOT_IMPLEMENTED",
                 "AbsoluteTimePosition":"00:00:00",
                 "SecondsUntilSleep":"0",
                 "CurrentTrack":"1",
                 "AVTransportURIMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:pv=\"http://www.pv.com/pvns/\"><item parentID=\"0/Favorites/MostPlayed\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\" id=\"0/Favorites/MostPlayed/45131\"><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><raumfeld:section>RadioTime</raumfeld:section><dc:title>Rock Antenne</dc:title><upnp:albumArtURI>https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><raumfeld:durability>120</raumfeld:durability><raumfeld:name>Station</raumfeld:name><raumfeld:durability>120</raumfeld:durability></item></DIDL-Lite>\n",
                 "PossiblePlaybackStorageMedia":"NETWORK",
                 "TransportPlaySpeed":"1",
                 "CurrentTrackDuration":"00:00:00",
                 "PossibleRecordQualityModes":"NOT_IMPLEMENTED",
                 "Bitrate":"0",
                 "PossibleRecordStorageMedia":"NONE",
                 "AVTransportURI":"dlna-playsingle://uuid%3Af27c27d7-0d31-44a1-b9d1-b16653c1569f?sid=urn%3Aupnp-org%3AserviceId%3AContentDirectory&iid=0%2FFavorites%2FMostPlayed%2F45131",
                 "RelativeTimePosition":"00:00:00",
                 "RelativeCounterPosition":"1",
                 "CurrentPlayMode":"NORMAL",
                 "TransportState":"STOPPED",
                 "AbsoluteCounterPosition":"1",
                 "CurrentTransportActions":"Play",
                 "RoomStates":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef=STOPPED",
                 "ContentType":"",
                 "NumberOfTracks":"1",
                 "SleepTimerActive":"0",
                 "TransportStatus":"OK",
                 "CurrentTrackURI":"https://stream.rockantenne.de/rockantenne/stream/mp3?aw_0_1st.playerid=tunein.com",
                 "rooms":{
                    "uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef":{
                       "roomUDN":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef",
                       "TransportState":"STOPPED",
                       "name":"Schlafzimmer",
                       "PowerState":"ACTIVE",
                       "online":true,
                       "Volume":"60",
                       "Mute":"0"
                    }
                 },
                 "RoomVolumes":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef=60",
                 "Volume":"60",
                 "RoomMutes":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef=0"
              }
           },
           {
              "rooms":[
                 {
                    "renderers":[
                       {
                          "udn":"uuid:bf905eb0-635d-40f7-8fdc-d888940503d2",
                          "name":"Speaker Büro",
                          "mediaItem":{
                             
                          },
                          "rendererState":{
                             "InstanceID":0,
                             "LowDB":"4.2",
                             "Mute":"0",
                             "MidDB":"1.2",
                             "Volume":"50",
                             "Balance":"0",
                             "HighDB":"3",
                             "SettingValue":"0",
                             "AVTransportURIMetaData":"",
                             "CurrentTrackDuration":"NOT_IMPLEMENTED",
                             "AVTransportURI":"",
                             "CurrentPlayMode":"NORMAL",
                             "TransportState":"NO_MEDIA_PRESENT",
                             "OwnsAudioResource":"1",
                             "CurrentTransportActions":"",
                             "TransportStatus":"OK"
                          }
                       }
                    ],
                    "udn":"uuid:b22644b8-a540-496f-b5bc-563f4ce4f202",
                    "name":"Büro"
                 }
              ],
              "udn":"uuid:4969d280-74a0-46f9-a09d-8d0910ba0757",
              "name":"Büro",
              "isZone":true,
              "mediaItem":{
                 
              },
              "rendererState":{
                 
              }
           },
           {
              "rooms":[
                 {
                    "renderers":[
                       {
                          "udn":"uuid:30e3c8cd-1ce0-4842-89d0-63ea58858cd8",
                          "name":"Connector Küche"
                       }
                    ],
                    "udn":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88",
                    "name":"Küche",
                    "powerState":"ACTIVE"
                 }
              ],
              "udn":"uuid:679c7145-d944-4c5a-88b1-7705ad27197f",
              "name":"Küche",
              "isZone":true,
              "mediaItem":{
                 "class":"object.item.audioItem.audioBroadcast.radio",
                 "section":"RadioTime",
                 "name":"Station",
                 "durability":"120",
                 "childCount":null,
                 "parentID":"0/Favorites/RecentlyPlayed",
                 "id":"0/Favorites/RecentlyPlayed/19997",
                 "restricted":"1",
                 "refID":"0/RadioTime/Search/s-s25217",
                 "title":"Rock Antenne",
                 "description":null,
                 "artist":null,
                 "albumArtURI":"https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000",
                 "genre":null,
                 "album":null,
                 "date":null,
                 "creator":null,
                 "originalTrackNumber":null,
                 "bitrate":"128",
                 "protocolInfo":"http-get:*:audio/x-mpegurl:*",
                 "signalStrength":null,
                 "ebrowse":"http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&formats=mp3%2Cogg%2Caac&serial=bc%3A6a%3A29%3A85%3A0e%3A3a&id=s25217&c=ebrowse"
              },
              "rendererState":{
                 "Mute":0,
                 "InstanceID":0,
                 "CurrentTrackMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:pv=\"http://www.pv.com/pvns/\" lang=\"en\"><item parentID=\"0/Favorites/RecentlyPlayed\" id=\"0/Favorites/RecentlyPlayed/19997\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\"><raumfeld:name>Station</raumfeld:name><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:section>RadioTime</raumfeld:section><raumfeld:durability>120</raumfeld:durability><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><dc:title>Rock Antenne</dc:title><upnp:albumArtURI dlna:profileID=\"JPEG_TN\">https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><res bitrate=\"128\" protocolInfo=\"http-get:*:audio/x-mpegurl:*\">http://opml.radiotime.com/Tune.ashx?id=e123075877&amp;sid=s25217&amp;formats=mp3,ogg,aac&amp;partnerId=7aJ9pvV5&amp;serial=bc:6a:29:85:0e:3a</res></item></DIDL-Lite>\n",
                 "CurrentRecordQualityMode":"NOT_IMPLEMENTED",
                 "AbsoluteTimePosition":"00:00:00",
                 "SecondsUntilSleep":"0",
                 "CurrentTrack":"1",
                 "AVTransportURIMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:pv=\"http://www.pv.com/pvns/\"><item parentID=\"0/Favorites/RecentlyPlayed\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\" id=\"0/Favorites/RecentlyPlayed/19997\"><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><raumfeld:section>RadioTime</raumfeld:section><dc:title>Rock Antenne</dc:title><upnp:albumArtURI>https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><raumfeld:durability>120</raumfeld:durability><raumfeld:name>Station</raumfeld:name><raumfeld:durability>120</raumfeld:durability></item></DIDL-Lite>\n",
                 "PossiblePlaybackStorageMedia":"NETWORK",
                 "TransportPlaySpeed":"1",
                 "CurrentTrackDuration":"00:00:00",
                 "PossibleRecordQualityModes":"NOT_IMPLEMENTED",
                 "Bitrate":"0",
                 "PossibleRecordStorageMedia":"NONE",
                 "AVTransportURI":"dlna-playsingle://uuid%3Af27c27d7-0d31-44a1-b9d1-b16653c1569f?sid=urn%3Aupnp-org%3AserviceId%3AContentDirectory&iid=0%2FFavorites%2FRecentlyPlayed%2F19997",
                 "RelativeTimePosition":"00:00:00",
                 "RelativeCounterPosition":"1",
                 "CurrentPlayMode":"NORMAL",
                 "TransportState":"STOPPED",
                 "AbsoluteCounterPosition":"1",
                 "CurrentTransportActions":"Play",
                 "RoomStates":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88=STOPPED",
                 "ContentType":"",
                 "NumberOfTracks":"1",
                 "SleepTimerActive":"0",
                 "TransportStatus":"OK",
                 "CurrentTrackURI":"https://stream.rockantenne.de/rockantenne/stream/mp3?aw_0_1st.playerid=tunein.com",
                 "rooms":{
                    "uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88":{
                       "roomUDN":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88",
                       "TransportState":"STOPPED",
                       "name":"Küche",
                       "PowerState":"ACTIVE",
                       "online":true,
                       "Volume":"30",
                       "Mute":"0"
                    }
                 },
                 "RoomVolumes":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88=30",
                 "Volume":"30",
                 "RoomMutes":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88=0"
              }
           },
           {
              "rooms":[
                 {
                    "renderers":[
                       {
                          "udn":"uuid:19f951a5-a33c-4f05-aa42-6ea0bdc25dd4",
                          "name":"Connector Wohnzimmer #2"
                       }
                    ],
                    "udn":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98",
                    "name":"Wohnzimmer"
                 }
              ],
              "udn":"uuid:a6357988-5396-4477-adee-3cfe0cb17437",
              "name":"Wohnzimmer",
              "isZone":true,
              "mediaItem":{
                 "class":"object.item.audioItem.musicTrack",
                 "section":"Napster",
                 "name":"Track",
                 "durability":"1800",
                 "childCount":null,
                 "parentID":"0/Favorites/RecentlyPlayed",
                 "restricted":"1",
                 "refID":"0/Napster/ImportedFavorites/Track/Tra.57957268",
                 "id":"0/Favorites/RecentlyPlayed/44865",
                 "title":"Fürstenfeld",
                 "description":null,
                 "artist":"S.T.S.",
                 "genre":null,
                 "album":"Überdosis G'fühl",
                 "date":null,
                 "creator":null,
                 "originalTrackNumber":"5",
                 "duration":"0:05:27.000",
                 "protocolInfo":"rhapsody-track:*:audio/rhapsody-track:*"
              },
              "rendererState":{
                 "Mute":0,
                 "InstanceID":0,
                 "CurrentTrackMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:pv=\"http://www.pv.com/pvns/\"><item parentID=\"0/Favorites/RecentlyPlayed\" restricted=\"1\" refID=\"0/Napster/ImportedFavorites/Track/Tra.57957268\" id=\"0/Favorites/RecentlyPlayed/44865\"><upnp:class>object.item.audioItem.musicTrack</upnp:class><upnp:originalTrackNumber>5</upnp:originalTrackNumber><raumfeld:section>Napster</raumfeld:section><upnp:albumArtURI>http://10.0.0.201:47366/raumfeldImage?albumId=Alb.57957263&amp;album=%C3%9Cberdosis%20G%27f%C3%BChl&amp;artist=S.T.S.&amp;service=Napster</upnp:albumArtURI><upnp:album>&#xDC;berdosis G'f&#xFC;hl</upnp:album><dc:title>F&#xFC;rstenfeld</dc:title><upnp:artist>S.T.S.</upnp:artist><raumfeld:durability>1800</raumfeld:durability><raumfeld:name>Track</raumfeld:name><res duration=\"0:05:27.000\" protocolInfo=\"rhapsody-track:*:audio/rhapsody-track:*\">rhapsody-track://Tra.57957268?service=Napster</res><raumfeld:durability>1800</raumfeld:durability></item></DIDL-Lite>\n",
                 "CurrentRecordQualityMode":"NOT_IMPLEMENTED",
                 "AbsoluteTimePosition":"00:00:00",
                 "SecondsUntilSleep":"0",
                 "CurrentTrack":"1",
                 "AVTransportURIMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:pv=\"http://www.pv.com/pvns/\"><item parentID=\"0/Favorites/RecentlyPlayed\" restricted=\"1\" refID=\"0/Napster/ImportedFavorites/Track/Tra.57957268\" id=\"0/Favorites/RecentlyPlayed/44865\"><upnp:class>object.item.audioItem.musicTrack</upnp:class><upnp:originalTrackNumber>5</upnp:originalTrackNumber><raumfeld:section>Napster</raumfeld:section><upnp:albumArtURI>http://10.0.0.201:47366/raumfeldImage?albumId=Alb.57957263&amp;album=%C3%9Cberdosis%20G%27f%C3%BChl&amp;artist=S.T.S.&amp;service=Napster</upnp:albumArtURI><upnp:album>&#xDC;berdosis G'f&#xFC;hl</upnp:album><dc:title>F&#xFC;rstenfeld</dc:title><upnp:artist>S.T.S.</upnp:artist><raumfeld:durability>1800</raumfeld:durability><raumfeld:name>Track</raumfeld:name><res duration=\"0:05:27.000\" protocolInfo=\"rhapsody-track:*:audio/rhapsody-track:*\">rhapsody-track://Tra.57957268?service=Napster</res><raumfeld:durability>1800</raumfeld:durability></item></DIDL-Lite>\n",
                 "PossiblePlaybackStorageMedia":"NETWORK",
                 "TransportPlaySpeed":"1",
                 "CurrentTrackDuration":"00:00:00",
                 "PossibleRecordQualityModes":"NOT_IMPLEMENTED",
                 "Bitrate":"0",
                 "PossibleRecordStorageMedia":"NONE",
                 "AVTransportURI":"rhapsody-track://Tra.57957268?service=Napster",
                 "RelativeTimePosition":"00:00:00",
                 "RelativeCounterPosition":"1",
                 "CurrentPlayMode":"NORMAL",
                 "TransportState":"STOPPED",
                 "AbsoluteCounterPosition":"1",
                 "CurrentTransportActions":"Play,Previous,Seek,RepeatTrack,Repeat",
                 "RoomStates":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98=STOPPED",
                 "ContentType":"",
                 "NumberOfTracks":"1",
                 "SleepTimerActive":"0",
                 "TransportStatus":"OK",
                 "CurrentTrackURI":"https://rhapsodyev.hs.llnwd.net/v2/s/3/5/3/4/1/940714353.m4a?e=1678994629&h=a0b32a18923da789e313a1f637d6098b",
                 "rooms":{
                    "uuid:22353503-d6b3-4f49-ae08-aa291ca83b98":{
                       "roomUDN":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98",
                       "TransportState":"STOPPED",
                       "name":"Wohnzimmer",
                       "online":true,
                       "Volume":"34",
                       "Mute":"0"
                    }
                 },
                 "RoomVolumes":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98=34",
                 "Volume":"34",
                 "RoomMutes":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98=0"
              }
           },
           {
              "rooms":[
                 {
                    "renderers":[
                       {
                          "udn":"uuid:4ad34600-394a-415c-b762-70c3f30e939f",
                          "name":"Connector Balkon"
                       }
                    ],
                    "udn":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d",
                    "name":"Balkon",
                    "powerState":"AUTOMATIC_STANDBY"
                 }
              ],
              "udn":"uuid:c9dec684-45dc-4fc7-8c51-3bb6beb01352",
              "name":"Balkon",
              "isZone":true,
              "mediaItem":{
                 "class":"object.item.audioItem.audioBroadcast.radio",
                 "section":"RadioTime",
                 "name":"Station",
                 "durability":"120",
                 "childCount":null,
                 "parentID":"0/Favorites/MostPlayed",
                 "id":"0/Favorites/MostPlayed/45131",
                 "restricted":"1",
                 "refID":"0/RadioTime/Search/s-s25217",
                 "title":"Rock Antenne",
                 "description":null,
                 "artist":null,
                 "albumArtURI":"https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000",
                 "genre":null,
                 "album":null,
                 "date":null,
                 "creator":null,
                 "originalTrackNumber":null,
                 "bitrate":"128",
                 "protocolInfo":"http-get:*:audio/x-mpegurl:*",
                 "signalStrength":null,
                 "ebrowse":"http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&formats=mp3%2Cogg%2Caac&serial=bc%3A6a%3A29%3A85%3A0e%3A3a&id=s25217&c=ebrowse"
              },
              "rendererState":{
                 "Mute":0,
                 "InstanceID":0,
                 "CurrentTrackMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:pv=\"http://www.pv.com/pvns/\" lang=\"en\"><item parentID=\"0/Favorites/MostPlayed\" id=\"0/Favorites/MostPlayed/45131\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\"><raumfeld:name>Station</raumfeld:name><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:section>RadioTime</raumfeld:section><raumfeld:durability>120</raumfeld:durability><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><dc:title>Rock Antenne</dc:title><upnp:albumArtURI dlna:profileID=\"JPEG_TN\">https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><res bitrate=\"128\" protocolInfo=\"http-get:*:audio/x-mpegurl:*\">http://opml.radiotime.com/Tune.ashx?id=e123075877&amp;sid=s25217&amp;formats=mp3,ogg,aac&amp;partnerId=7aJ9pvV5&amp;serial=bc:6a:29:85:0e:3a</res></item></DIDL-Lite>\n",
                 "CurrentRecordQualityMode":"NOT_IMPLEMENTED",
                 "AbsoluteTimePosition":"00:00:00",
                 "SecondsUntilSleep":"0",
                 "CurrentTrack":"1",
                 "AVTransportURIMetaData":"<?xml version=\"1.0\"?>\n<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dlna=\"urn:schemas-dlna-org:metadata-1-0/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:raumfeld=\"urn:schemas-raumfeld-com:meta-data/raumfeld\" xmlns:pv=\"http://www.pv.com/pvns/\"><item parentID=\"0/Favorites/MostPlayed\" restricted=\"1\" refID=\"0/RadioTime/Search/s-s25217\" id=\"0/Favorites/MostPlayed/45131\"><upnp:class>object.item.audioItem.audioBroadcast.radio</upnp:class><raumfeld:ebrowse>http://opml.radiotime.com/Tune.ashx?partnerId=7aJ9pvV5&amp;formats=mp3%2Cogg%2Caac&amp;serial=bc%3A6a%3A29%3A85%3A0e%3A3a&amp;id=s25217&amp;c=ebrowse</raumfeld:ebrowse><raumfeld:section>RadioTime</raumfeld:section><dc:title>Rock Antenne</dc:title><upnp:albumArtURI>https://cdn-profiles.tunein.com/s25217/images/logog.jpg?t=636650246801600000</upnp:albumArtURI><raumfeld:durability>120</raumfeld:durability><raumfeld:name>Station</raumfeld:name><raumfeld:durability>120</raumfeld:durability></item></DIDL-Lite>\n",
                 "PossiblePlaybackStorageMedia":"NETWORK",
                 "TransportPlaySpeed":"1",
                 "CurrentTrackDuration":"00:00:00",
                 "PossibleRecordQualityModes":"NOT_IMPLEMENTED",
                 "Bitrate":"0",
                 "PossibleRecordStorageMedia":"NONE",
                 "AVTransportURI":"dlna-playsingle://uuid%3Af27c27d7-0d31-44a1-b9d1-b16653c1569f?sid=urn%3Aupnp-org%3AserviceId%3AContentDirectory&iid=0%2FFavorites%2FMostPlayed%2F45131",
                 "RelativeTimePosition":"00:00:00",
                 "RelativeCounterPosition":"1",
                 "CurrentPlayMode":"NORMAL",
                 "TransportState":"STOPPED",
                 "AbsoluteCounterPosition":"1",
                 "CurrentTransportActions":"Play",
                 "RoomStates":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d=STOPPED",
                 "ContentType":"",
                 "NumberOfTracks":"1",
                 "SleepTimerActive":"0",
                 "TransportStatus":"OK",
                 "CurrentTrackURI":"https://stream.rockantenne.de/rockantenne/stream/mp3?aw_0_1st.playerid=tunein.com",
                 "rooms":{
                    "uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d":{
                       "roomUDN":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d",
                       "TransportState":"STOPPED",
                       "name":"Balkon",
                       "PowerState":"AUTOMATIC_STANDBY",
                       "online":true,
                       "Volume":"56",
                       "Mute":"0"
                    }
                 },
                 "RoomVolumes":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d=56",
                 "Volume":"56",
                 "RoomMutes":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d=0"
              }
           }
        ],
        "unassignedRooms":[
           
        ],
        "availableRooms":[
           {
              "renderers":[
                 {
                    "udn":"uuid:5b2bdeef-0959-47b3-bee4-940b5e0ee4ba",
                    "name":"Connector Schlafzimmer"
                 }
              ],
              "udn":"uuid:8b4e0867-0d1c-4b3b-a254-37a4d8e1b0ef",
              "name":"Schlafzimmer",
              "powerState":"ACTIVE"
           },
           {
              "renderers":[
                 {
                    "udn":"uuid:bf905eb0-635d-40f7-8fdc-d888940503d2",
                    "name":"Speaker Büro",
                    "mediaItem":{
                       
                    },
                    "rendererState":{
                       "InstanceID":0,
                       "LowDB":"4.2",
                       "Mute":"0",
                       "MidDB":"1.2",
                       "Volume":"50",
                       "Balance":"0",
                       "HighDB":"3",
                       "SettingValue":"0",
                       "AVTransportURIMetaData":"",
                       "CurrentTrackDuration":"NOT_IMPLEMENTED",
                       "AVTransportURI":"",
                       "CurrentPlayMode":"NORMAL",
                       "TransportState":"NO_MEDIA_PRESENT",
                       "OwnsAudioResource":"1",
                       "CurrentTransportActions":"",
                       "TransportStatus":"OK"
                    }
                 }
              ],
              "udn":"uuid:b22644b8-a540-496f-b5bc-563f4ce4f202",
              "name":"Büro"
           },
           {
              "renderers":[
                 {
                    "udn":"uuid:30e3c8cd-1ce0-4842-89d0-63ea58858cd8",
                    "name":"Connector Küche"
                 }
              ],
              "udn":"uuid:3f68f253-df2a-4474-8640-fd45dd9ebf88",
              "name":"Küche",
              "powerState":"ACTIVE"
           },
           {
              "renderers":[
                 {
                    "udn":"uuid:19f951a5-a33c-4f05-aa42-6ea0bdc25dd4",
                    "name":"Connector Wohnzimmer #2"
                 }
              ],
              "udn":"uuid:22353503-d6b3-4f49-ae08-aa291ca83b98",
              "name":"Wohnzimmer"
           },
           {
              "renderers":[
                 {
                    "udn":"uuid:4ad34600-394a-415c-b762-70c3f30e939f",
                    "name":"Connector Balkon"
                 }
              ],
              "udn":"uuid:3e7b3a40-c1fc-458b-974b-a15c5fc42b7d",
              "name":"Balkon",
              "powerState":"AUTOMATIC_STANDBY"
           }
        ]
     }

     */



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